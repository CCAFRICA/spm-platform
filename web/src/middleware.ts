/**
 * Next.js Middleware — Auth Enforcement + Session Refresh
 *
 * 1. Refreshes the Supabase auth session on every request.
 * 2. Redirects unauthenticated users to /login.
 * 3. Redirects platform admins without a selected tenant to /select-tenant.
 *
 * CRITICAL: When redirecting unauthenticated users, the redirect response
 * must NOT carry Set-Cookie headers from the Supabase client. Otherwise,
 * the browser stores those cookies, follows the redirect to /login, and
 * on the next request the middleware sees the cookies → thinks user is
 * authenticated → redirects from /login back to / → dashboard renders.
 *
 * Fix: All redirect responses are fresh NextResponse.redirect() objects.
 * When user is NOT authenticated, stale sb-* cookies are explicitly cleared
 * on the redirect response so the browser arrives at /login with a clean slate.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/signup', '/landing', '/auth/callback', '/api/auth', '/api/health'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

/**
 * Clear all Supabase auth cookies (sb-*) on a response.
 * Sets each cookie to empty with maxAge=0 so the browser deletes them.
 */
function clearSbCookies(request: NextRequest, response: NextResponse): void {
  request.cookies.getAll().forEach(cookie => {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set({
        name: cookie.name,
        value: '',
        maxAge: 0,
        path: '/',
      });
    }
  });
}

export async function middleware(request: NextRequest) {
  // If Supabase is not configured, auth enforcement is impossible.
  // FAIL-CLOSED: redirect to /landing instead of passing through.
  // A missing env var must NEVER silently disable the entire auth layer.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.error(
      '[Middleware] CRITICAL: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing — blocking access'
    );
    const pathname = request.nextUrl.pathname;
    // Allow public paths through so /landing, /login, /signup still render
    if (isPublicPath(pathname)) {
      return NextResponse.next({ request });
    }
    // Everything else → redirect to /landing (fail-closed)
    return NextResponse.redirect(new URL('/landing', request.url));
  }

  // Response object for authenticated pass-through (carries cookie refresh).
  // The Supabase client's setAll handler writes refreshed tokens to THIS response.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session and get user — may trigger setAll (token refresh)
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── NOT AUTHENTICATED ──
  if (!user) {
    // Root path without auth → show public landing page
    if (pathname === '/') {
      const landingUrl = new URL('/landing', request.url);
      const redirectResponse = NextResponse.redirect(landingUrl);
      clearSbCookies(request, redirectResponse);
      return redirectResponse;
    }

    if (!isPublicPath(pathname)) {
      // Protected path, no user → redirect to /login.
      // CRITICAL: Fresh NextResponse.redirect() — NOT supabaseResponse.
      // Clear all stale sb-* cookies so the browser arrives at /login clean.
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      clearSbCookies(request, redirectResponse);
      return redirectResponse;
    }

    // Public path, no user → pass through, but clear stale cookies.
    // This prevents: GET /login with stale cookies → getUser() refreshes
    // on a subsequent request → middleware thinks user is authenticated.
    const passThrough = NextResponse.next({ request });
    clearSbCookies(request, passThrough);
    return passThrough;
  }

  // ── AUTHENTICATED ──

  // Authenticated user on /login → redirect to app
  if (pathname === '/login') {
    // Check if this is a platform admin (has manage_tenants capability)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, capabilities')
      .eq('auth_user_id', user.id)
      .single();

    const capabilities = (profile?.capabilities as string[]) || [];
    const isPlatformAdmin = profile?.role === 'vl_admin' || capabilities.includes('manage_tenants');

    if (isPlatformAdmin) {
      return NextResponse.redirect(new URL('/select-tenant', request.url));
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Authenticated user on protected route → pass through WITH cookie refresh.
  // supabaseResponse carries the refreshed session cookies from setAll.
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files and images
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
