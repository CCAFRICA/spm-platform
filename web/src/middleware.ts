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
 *
 * HF-138: Cache-Control: private, no-store on ALL responses. Prevents Vercel
 * edge from caching responses with Set-Cookie headers (auth cookie poisoning).
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { canAccessWorkspace, resolveRole, WORKSPACE_CAPABILITIES } from '@/lib/auth/permissions';
import { SESSION_COOKIE_OPTIONS, SESSION_LIMITS } from '@/lib/supabase/cookie-config';
import { logAuthEvent } from '@/lib/auth/auth-logger';

// Paths that don't require authentication
// HF-136: SECURITY — Only truly public paths listed here.
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/landing',
  '/auth/callback',
  '/auth/mfa',           // OB-178: MFA enrollment/verify (accessible post-login, pre-MFA)
  '/api/auth',           // Auth callback handlers
  '/api/health',         // Health check (no tenant data)
  '/api/platform/flags', // Public feature flags (no tenant data)
  '/unauthorized',
];

// OB-178 / DS-019 Section 5.1: MFA Policy by role
const MFA_REQUIRED_ROLES = ['platform', 'admin'];

function isRestrictedWorkspace(pathname: string): boolean {
  return Object.keys(WORKSPACE_CAPABILITIES).some(prefix => pathname.startsWith(prefix));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

/**
 * HF-138: Prevent Vercel edge from caching responses with Set-Cookie headers.
 * Supabase SSR writes auth cookies via setAll on every response. Without
 * Cache-Control: private, no-store, Vercel caches these responses and serves
 * them to different users — causing auth cookie cache poisoning.
 * https://supabase.com/docs/guides/auth/server-side/advanced-guide
 */
function noCacheResponse(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

/**
 * Clear ALL auth-related cookies on a response.
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
  // If Supabase is not configured, fail-closed.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.error('[Middleware] CRITICAL: Supabase env vars missing — blocking access');
    const pathname = request.nextUrl.pathname;
    if (isPublicPath(pathname)) {
      return noCacheResponse(NextResponse.next({ request }));
    }
    return noCacheResponse(NextResponse.redirect(new URL('/landing', request.url)));
  }

  // Response object for authenticated pass-through (carries cookie refresh).
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // OB-178: Apply SOC 2 / OWASP compliant cookie options
      cookieOptions: SESSION_COOKIE_OPTIONS,
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

  // AUTH GATE — Refresh session and get user
  const AUTH_TIMEOUT_MS = 5000;
  let user = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Auth check timed out')), AUTH_TIMEOUT_MS)
      ),
    ]);
    user = result.data.user;
  } catch (err) {
    console.error('[Middleware] getUser() failed or timed out — treating as unauthenticated:', err);
  }

  const pathname = request.nextUrl.pathname;

  // ── NOT AUTHENTICATED ──
  if (!user) {
    if (pathname === '/') {
      let landingEnabled = false;
      try {
        const flagsResponse = await fetch(new URL('/api/platform/flags', request.url));
        if (flagsResponse.ok) {
          const flags = await flagsResponse.json();
          landingEnabled = flags.landing_page_enabled === true;
        }
      } catch {
        landingEnabled = false;
      }

      const targetUrl = landingEnabled
        ? new URL('/landing', request.url)
        : new URL('/login', request.url);
      const redirectResponse = NextResponse.redirect(targetUrl);
      clearAuthCookies(request, redirectResponse);
      return noCacheResponse(redirectResponse);
    }

    if (!isPublicPath(pathname)) {
      if (pathname.startsWith('/api/')) {
        return noCacheResponse(NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        ));
      }

      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      clearAuthCookies(request, redirectResponse);
      return noCacheResponse(redirectResponse);
    }

    // Public path, no user → pass through, but clear stale cookies.
    const passThrough = NextResponse.next({ request });
    clearAuthCookies(request, passThrough);
    return noCacheResponse(passThrough);
  }

  // ── AUTHENTICATED ──

  // OB-178: Provider-agnostic session enforcement (idle + absolute timeout)
  // These are OUR cookies, not Supabase's — they travel with the codebase.
  const now = Date.now();
  const sessionStart = request.cookies.get('vialuce-session-start')?.value;
  const lastActivity = request.cookies.get('vialuce-last-activity')?.value;

  // Check absolute timeout (8 hours)
  if (sessionStart && (now - Number(sessionStart)) > SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS) {
    logAuthEvent('auth.session.expired.absolute', { elapsed_ms: now - Number(sessionStart) }, user.id);
    const expiredResponse = NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
    clearAuthCookies(request, expiredResponse);
    expiredResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
    expiredResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
    return noCacheResponse(expiredResponse);
  }

  // Check idle timeout (30 minutes)
  if (lastActivity && (now - Number(lastActivity)) > SESSION_LIMITS.IDLE_TIMEOUT_MS) {
    logAuthEvent('auth.session.expired.idle', { idle_ms: now - Number(lastActivity) }, user.id);
    const idleResponse = NextResponse.redirect(new URL('/login?reason=idle_timeout', request.url));
    clearAuthCookies(request, idleResponse);
    idleResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
    idleResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
    return noCacheResponse(idleResponse);
  }

  // Set/refresh session cookies on authenticated response
  if (!sessionStart) {
    supabaseResponse.cookies.set('vialuce-session-start', String(now), {
      maxAge: SESSION_COOKIE_OPTIONS.maxAge,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  }
  supabaseResponse.cookies.set('vialuce-last-activity', String(now), {
    maxAge: SESSION_COOKIE_OPTIONS.maxAge,
    sameSite: 'lax',
    secure: true,
    path: '/',
  });

  // OB-178: MFA enforcement — check AAL level for required roles
  if (!pathname.startsWith('/auth/mfa')) {
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        const { currentLevel, nextLevel } = aalData;
        // User has MFA enrolled but hasn't verified this session
        if (currentLevel === 'aal1' && nextLevel === 'aal2') {
          return noCacheResponse(NextResponse.redirect(new URL('/auth/mfa/verify', request.url)));
        }
        // Check if user's role requires MFA enrollment
        if (currentLevel === 'aal1' && nextLevel === 'aal1') {
          // HF-147: Use array query — platform users can have multiple profiles
          // (HF-062: no unique constraint on auth_user_id). .maybeSingle() throws
          // for multi-profile users, silently skipping MFA enforcement.
          const { data: mfaProfiles } = await supabase
            .from('profiles')
            .select('role')
            .eq('auth_user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(5);
          const mfaRole = (
            mfaProfiles?.find(p => p.role === 'platform') ||
            mfaProfiles?.[0]
          )?.role;
          if (mfaRole && MFA_REQUIRED_ROLES.includes(mfaRole)) {
            return noCacheResponse(NextResponse.redirect(new URL('/auth/mfa/enroll', request.url)));
          }
        }
      }
    } catch {
      // MFA check failure is non-blocking — allow through
    }
  }

  if (pathname === '/login' || pathname === '/') {
    if (pathname === '/login') {
      const redirectParam = request.nextUrl.searchParams.get('redirect');
      if (redirectParam && redirectParam !== '/login' && !redirectParam.startsWith('/login')) {
        return noCacheResponse(NextResponse.redirect(new URL(redirectParam, request.url)));
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, capabilities')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const capabilities = (profile?.capabilities as string[]) || [];
    const resolvedLoginRole = resolveRole(profile?.role || '');
    const isPlatformAdmin = resolvedLoginRole === 'platform' || capabilities.includes('manage_tenants');

    if (isPlatformAdmin) {
      const tenantCookie = request.cookies.get('vialuce-tenant-id')?.value;
      if (tenantCookie) {
        return noCacheResponse(NextResponse.redirect(new URL('/operate', request.url)));
      }
      return noCacheResponse(NextResponse.redirect(new URL('/select-tenant', request.url)));
    }

    // HF-137: Decision 128 — /stream is the canonical landing for ALL roles
    const roleDefaults: Record<string, string> = {
      admin: '/stream',
      tenant_admin: '/stream',
      manager: '/stream',
      viewer: '/stream',
      sales_rep: '/stream',
      support: '/stream',
    };

    const defaultPath = roleDefaults[profile?.role || ''] || '/stream';
    return noCacheResponse(NextResponse.redirect(new URL(defaultPath, request.url)));
  }

  // ── DS-014: CAPABILITY-BASED WORKSPACE AUTHORIZATION ──
  if (isRestrictedWorkspace(pathname)) {
    let role = user.user_metadata?.role as string | undefined
      || user.app_metadata?.role as string | undefined;

    if (!role) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        role = profile?.role || undefined;
      } catch {
        // If profile query fails, allow through (client-side RequireCapability will catch)
      }
    }

    if (role) {
      const resolved = resolveRole(role);
      const roleToCheck = resolved || role;
      if (!canAccessWorkspace(roleToCheck, pathname)) {
        logAuthEvent('auth.permission.denied', { pathname, role: roleToCheck }, user.id);
        return noCacheResponse(NextResponse.redirect(new URL('/unauthorized', request.url)));
      }
    }
  }

  // Authenticated user on protected route → pass through WITH cookie refresh.
  // HF-138: noCacheResponse prevents Vercel edge from caching the Set-Cookie headers.
  return noCacheResponse(supabaseResponse);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
