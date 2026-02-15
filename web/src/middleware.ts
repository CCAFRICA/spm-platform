/**
 * Next.js Middleware — Auth Enforcement + Session Refresh
 *
 * 1. Refreshes the Supabase auth session on every request.
 * 2. Redirects unauthenticated users to /login.
 * 3. Redirects platform admins without a selected tenant to /select-tenant.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  // Skip if Supabase is not configured
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

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

  // Refresh session and get user
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // If not authenticated and not a public path, redirect to login
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and on login page, redirect away
  if (user && pathname === '/login') {
    // Check if this is a platform admin (has manage_tenants capability)
    // We check the profile in the profiles table
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files and images
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
