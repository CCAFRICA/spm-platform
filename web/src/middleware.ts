/**
 * Next.js Middleware — Auth Enforcement + Session Refresh + Workspace Authorization
 *
 * 1. Refreshes the Supabase auth session on every request.
 * 2. Redirects unauthenticated users to /login.
 * 3. Redirects platform admins without a selected tenant to /select-tenant.
 * 4. OB-67: Checks workspace-level role access — redirects unauthorized to /unauthorized.
 *
 * CRITICAL: When redirecting unauthenticated users, the redirect response
 * must NOT carry Set-Cookie headers from the Supabase client. Otherwise,
 * the browser stores those cookies, follows the redirect to /login, and
 * on the next request the middleware sees the cookies → thinks user is
 * authenticated → redirects from /login back to / → dashboard renders.
 *
 * Fix: All redirect responses are fresh NextResponse.redirect() objects.
 * When user is NOT authenticated, ALL auth cookies (sb-* AND vialuce-tenant-id)
 * are explicitly cleared on the redirect response so the browser arrives clean.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/signup', '/landing', '/auth/callback', '/api/auth', '/api/health', '/api/calculation/run', '/api/platform/flags', '/unauthorized'];

// OB-67: Workspace-level access (only restricted workspaces listed)
// Paths not listed here are open to all authenticated users.
const RESTRICTED_WORKSPACES: Record<string, string[]> = {
  '/admin':         ['vl_admin'],
  '/operate':       ['vl_admin', 'admin', 'tenant_admin'],
  '/configure':     ['vl_admin', 'admin', 'tenant_admin'],
  '/configuration': ['vl_admin', 'admin', 'tenant_admin'],
  '/govern':        ['vl_admin', 'admin', 'tenant_admin'],
  '/data':          ['vl_admin', 'admin', 'tenant_admin'],
  '/financial':     ['vl_admin', 'admin', 'tenant_admin', 'manager'],
};

/**
 * Check if a path falls in a restricted workspace and whether the role is allowed.
 * Returns true if access is allowed, false if denied.
 * Paths not in any restricted workspace are always allowed.
 */
function checkWorkspaceAccess(pathname: string, role: string): boolean {
  const matchedWorkspace = Object.keys(RESTRICTED_WORKSPACES)
    .filter(prefix => pathname.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedWorkspace) return true;
  return RESTRICTED_WORKSPACES[matchedWorkspace].includes(role);
}

/**
 * Check if a path is in a restricted workspace (needs role check).
 */
function isRestrictedWorkspace(pathname: string): boolean {
  return Object.keys(RESTRICTED_WORKSPACES).some(prefix => pathname.startsWith(prefix));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

/**
 * Clear ALL auth-related cookies on a response.
 * Clears: sb-* (Supabase auth tokens) + vialuce-tenant-id (tenant selection).
 * Sets each cookie to empty with maxAge=0 so the browser deletes them.
 */
function clearAuthCookies(request: NextRequest, response: NextResponse): void {
  request.cookies.getAll().forEach(cookie => {
    if (cookie.name.startsWith('sb-') || cookie.name === 'vialuce-tenant-id') {
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

  // Refresh session and get user — may trigger setAll (token refresh).
  // CRITICAL: Wrap in try/catch. If Supabase is unreachable, the middleware
  // must NOT crash (which would let the request pass through unguarded).
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error('[Middleware] getUser() failed — treating as unauthenticated:', err);
    // Fall through with user=null → will redirect to /landing or /login
  }

  const pathname = request.nextUrl.pathname;

  // ── NOT AUTHENTICATED ──
  if (!user) {
    // Root path without auth → route based on landing_page_enabled flag
    if (pathname === '/') {
      let landingEnabled = false;
      try {
        const flagsResponse = await fetch(new URL('/api/platform/flags', request.url));
        if (flagsResponse.ok) {
          const flags = await flagsResponse.json();
          landingEnabled = flags.landing_page_enabled === true;
        }
      } catch {
        // On error, default to login (safe default)
        landingEnabled = false;
      }

      const targetUrl = landingEnabled
        ? new URL('/landing', request.url)
        : new URL('/login', request.url);
      const redirectResponse = NextResponse.redirect(targetUrl);
      clearAuthCookies(request, redirectResponse);
      return redirectResponse;
    }

    if (!isPublicPath(pathname)) {
      // Protected path, no user → redirect to /login.
      // CRITICAL: Fresh NextResponse.redirect() — NOT supabaseResponse.
      // Clear all stale sb-* cookies so the browser arrives at /login clean.
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      clearAuthCookies(request, redirectResponse);
      return redirectResponse;
    }

    // Public path, no user → pass through, but clear stale cookies.
    // This prevents: GET /login with stale cookies → getUser() refreshes
    // on a subsequent request → middleware thinks user is authenticated.
    const passThrough = NextResponse.next({ request });
    clearAuthCookies(request, passThrough);
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

  // ── OB-67: WORKSPACE AUTHORIZATION ──
  // Only check role for restricted workspaces (admin, operate, configure, etc.)
  // Open workspaces (insights, transactions, performance, etc.) skip this check.
  if (isRestrictedWorkspace(pathname)) {
    // Try to get role from user_metadata first (zero DB calls)
    let role = user.user_metadata?.role as string | undefined
      || user.app_metadata?.role as string | undefined;

    // If role not in metadata, query profiles table (one DB call)
    if (!role) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('auth_user_id', user.id)
          .single();
        role = profile?.role || undefined;
      } catch {
        // If profile query fails, allow through (client-side HOC will catch)
      }
    }

    // If we have a role and it's not allowed, redirect to /unauthorized
    if (role && !checkWorkspaceAccess(pathname, role)) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
    // If no role found, allow through — client-side RequireRole HOC will catch
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
