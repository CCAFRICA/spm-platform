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
import { canAccessWorkspace, resolveRole, WORKSPACE_CAPABILITIES, requiredFeatureForPath } from '@/lib/auth/permissions';
import { SESSION_COOKIE_OPTIONS, SESSION_LIMITS } from '@/lib/supabase/cookie-config';
import { logAuthEvent } from '@/lib/auth/auth-logger';
import { detectSessionChurn } from '@/lib/observability/session-churn';
import { resolveIdentity } from '@/lib/auth/resolve-identity';
import { resolveSessionOwnership } from '@/lib/auth/session-lifecycle'; // HF-331: decodeJwtSessionId retired from middleware (getClaims supplies session_id)
import { landingPathForRole } from '@/lib/auth/landing'; // OB-247: per-persona landing (CDA → portal)

// Paths that don't require authentication
// HF-136: SECURITY — Only truly public paths listed here.
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/auth/callback',
  '/auth/mfa',           // OB-178: MFA enrollment/verify (accessible post-login, pre-MFA)
  '/api/auth',           // Auth callback handlers
  '/api/health',         // Health check (no tenant data)
  '/api/platform/flags', // Public feature flags (no tenant data)
  '/unauthorized',
];

// OB-178 / DS-019 Section 5.1: MFA Policy by role
// OB-247: the CDA handles customer data → full MFA/AAL2, never weakened (DS-019).
const MFA_REQUIRED_ROLES = ['platform', 'admin', 'cda'];

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
    return noCacheResponse(NextResponse.redirect(new URL('/login', request.url)));
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
          // HF-167: Force session-scoped cookies. @supabase/ssr ignores our
          // cookieOptions and injects its own ~400-day maxAge. We override by:
          // 1. Spreading our SESSION_COOKIE_OPTIONS over theirs
          // 2. Explicitly deleting maxAge so cookies are session-scoped
          // Without maxAge, cookies die on browser close (OWASP/NIST compliant).
          cookiesToSet.forEach(({ name, value, options }) => {
            const sessionOptions = { ...options, ...SESSION_COOKIE_OPTIONS };
            delete sessionOptions.maxAge;
            supabaseResponse.cookies.set(name, value, sessionOptions);
          });
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
      // OB-196 Phase 1.6: landing-page pathway deleted (abandoned UI per architect direction).
      // Anonymous-on-/ redirects directly to /login.
      logAuthEvent('auth.redirect.unauth_root', { pathname });
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
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

      logAuthEvent('auth.redirect.unauth_protected', { pathname });
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

  // ── SESSION ENFORCEMENT (OB-178 + HF-167 + HF-168) ──
  // Provider-agnostic session timeout enforcement.
  // These are OUR cookies, not Supabase's — they travel with the codebase.
  //
  // HF-168: Cookie initialization MUST happen BEFORE timeout checks.
  // On the first authenticated request after login, vialuce-session-start
  // does not exist yet. HF-167's guard (!sessionStart || ...) correctly
  // treats missing cookies as expired — but that logic must only apply
  // to cookies that PREVIOUSLY existed and have since expired/disappeared.
  // A brand-new session must be initialized first, then checked.
  //
  // Sequence: Initialize → Check → Refresh
  // A new session: initialized now, (now - now) = 0 < timeout → passes
  // An expired session: cookie exists with old timestamp → fails check → redirect
  // A disappeared cookie (browser cleared, etc.): re-initialized → passes
  //   (Acceptable: Supabase server-side timeout is the primary gate.
  //    If the Supabase session is expired, getUser() above returned null
  //    and we never reach this code. Reaching here means Supabase says valid.)

  const now = Date.now();
  const COOKIE_OPTS = { sameSite: 'lax' as const, secure: true, path: '/' };
  const existingSessionStart = request.cookies.get('vialuce-session-start')?.value;
  const existingLastActivity = request.cookies.get('vialuce-last-activity')?.value;
  const existingSid = request.cookies.get('vialuce-session-sid')?.value;

  // HF-284 A1 — SESSION-OWNERSHIP GATE. The residue signal is session IDENTITY, not
  // age: the bookkeeping cookies (session-start/last-activity) are session-scoped and
  // outlive the auth session, so a PRIOR session's cookies (or legacy-untagged ones)
  // must not adjudicate THIS session — that is exactly how the awaited
  // /api/auth/log-event POST on login traversed here, read a dead session's clock, and
  // clearAuthCookies killed the just-created sb-* session. Tag = the access token's
  // session_id claim (token already validated by getUser() above). Age was withdrawn
  // (A1.1): token refresh advances iat while session-start is fixed at birth.
  let tokenSessionId: string | null = null;
  try {
    // HF-331 (OB-178 Phase C closure): server-verified claim read replaces getSession()+local
    // decode. getClaims() verifies the JWT (JWKS / Auth server) and returns the session_id claim —
    // the same ownership tag, now server-authenticated (Decision 142 / SR-39), without a
    // cookie-trusted getSession(). The token was already validated by getUser() above (:137).
    const { data } = await supabase.auth.getClaims();
    const sid = (data?.claims as { session_id?: unknown } | undefined)?.session_id;
    tokenSessionId = typeof sid === 'string' ? sid : null;
  } catch {
    tokenSessionId = null; // unobtainable → ownership cannot be established this request
  }

  const ownership = resolveSessionOwnership({
    now,
    sessionStartCookie: existingSessionStart,
    lastActivityCookie: existingLastActivity,
    sidCookie: existingSid,
    tokenSessionId,
    limits: SESSION_LIMITS,
  });

  // sid ABSENT or mismatched → another session's residue (or legacy-untagged):
  // REINITIALIZE this session's clocks + tag, emit the reset event, and DO NOT kill.
  if (ownership.reinit) {
    supabaseResponse.cookies.set('vialuce-session-start', String(now), COOKIE_OPTS);
    supabaseResponse.cookies.set('vialuce-last-activity', String(now), COOKIE_OPTS);
    if (tokenSessionId) {
      supabaseResponse.cookies.set('vialuce-session-sid', tokenSessionId, COOKIE_OPTS);
    }
    logAuthEvent('auth.session.bookkeeping_reset', {
      had_prior: ownership.hadPrior,
      prior_last_activity_age_ms: ownership.priorLastActivityAgeMs,
      prior_session_start_age_ms: ownership.priorSessionStartAgeMs,
    }, user.id);
    // OB-230 3B: a session-identity change is the churn moment — flag rapid re-establishment.
    void detectSessionChurn(user.id, null);
    // fall through to MFA/workspace checks on the SAME pass-through response.
  } else if (ownership.action === 'expired_absolute') {
    // sid MATCH → raw absolute check (8h), byte-preserved. HF-167.
    logAuthEvent('auth.session.expired.absolute', { elapsed_ms: now - Number(existingSessionStart) }, user.id);
    const expiredResponse = NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
    clearAuthCookies(request, expiredResponse);
    expiredResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
    expiredResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
    expiredResponse.cookies.set('vialuce-session-sid', '', { maxAge: 0, path: '/' });
    return noCacheResponse(expiredResponse);
  } else if (ownership.action === 'expired_idle') {
    // sid MATCH → raw idle check (30m), byte-preserved.
    logAuthEvent('auth.session.expired.idle', { idle_ms: now - Number(existingLastActivity) }, user.id);
    const idleResponse = NextResponse.redirect(new URL('/login?reason=idle_timeout', request.url));
    clearAuthCookies(request, idleResponse);
    idleResponse.cookies.set('vialuce-session-start', '', { maxAge: 0, path: '/' });
    idleResponse.cookies.set('vialuce-last-activity', '', { maxAge: 0, path: '/' });
    idleResponse.cookies.set('vialuce-session-sid', '', { maxAge: 0, path: '/' });
    return noCacheResponse(idleResponse);
  } else {
    // sid MATCH + alive → refresh the idle clock on every authenticated request
    // (the absolute clock, session-start, is never refreshed — it marks birth).
    supabaseResponse.cookies.set('vialuce-last-activity', String(now), COOKIE_OPTS);
  }

  // OB-178: MFA enforcement — check AAL level for required roles
  // HF-152: Exempt /api/auth/log-event from MFA redirect so auth.login.success
  // can be logged BEFORE MFA completion. The user is authenticated (password correct)
  // but at AAL1 — the login event must be recorded before AAL2 is reached.
  // SOC 2 CC6: audit logging must not conflict with MFA enforcement.
  if (!pathname.startsWith('/auth/mfa') && !pathname.startsWith('/api/auth/log-event')) {
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        const { currentLevel, nextLevel } = aalData;
        // User has MFA enrolled but hasn't verified this session
        if (currentLevel === 'aal1' && nextLevel === 'aal2') {
          logAuthEvent('auth.redirect.mfa_verify', { pathname }, user.id);
          return noCacheResponse(NextResponse.redirect(new URL('/auth/mfa/verify', request.url)));
        }
        // Check if user's role requires MFA enrollment
        if (currentLevel === 'aal1' && nextLevel === 'aal1') {
          // HF-282: canonical reader (replaces the HF-147 array read). Alias-normalized
          // role compared against MFA_REQUIRED_ROLES so retired aliases (vl_admin) resolve.
          const mfaIdentity = await resolveIdentity(supabase, user.id);
          const mfaRole = mfaIdentity?.canonicalRole;
          if (mfaRole && MFA_REQUIRED_ROLES.includes(mfaRole)) {
            logAuthEvent('auth.redirect.mfa_enroll', { pathname, role: mfaRole }, user.id);
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

    // HF-282: canonical reader. The prior `.maybeSingle()` ERRORED on >1 row
    // (PGRST116) — the DIAG-060 row-count fork that made multi-profile platform
    // admins fall through this branch. resolveIdentity is array-tolerant +
    // deterministic + alias-normalized (vl_admin -> platform).
    const identity = await resolveIdentity(supabase, user.id);
    const capabilities = identity?.capabilities ?? [];
    const isPlatformAdmin = identity?.canonicalRole === 'platform' || capabilities.includes('manage_tenants');

    if (isPlatformAdmin) {
      const tenantCookie = request.cookies.get('vialuce-tenant-id')?.value;
      if (tenantCookie) {
        // OB-206 F-1 / Decision 128: /stream is the canonical landing for ALL roles,
        // including platform admin. /operate is a task surface reached from stream
        // actions, not a landing. (Was /operate — the CLT-166-F01 mis-landing.)
        logAuthEvent('auth.redirect.tenant_cookie_present', { pathname }, user.id);
        return noCacheResponse(NextResponse.redirect(new URL('/stream', request.url)));
      }
      logAuthEvent('auth.redirect.tenant_select', { pathname }, user.id);
      return noCacheResponse(NextResponse.redirect(new URL('/select-tenant', request.url)));
    }

    // HF-137: Decision 128 — /stream is the canonical landing for ALL operator roles.
    // OB-247: the CDA is the one persona that lands in its focused portal instead
    // (a new case in the existing landing rule, via the shared landingPathForRole).
    const defaultPath = landingPathForRole(identity?.role);
    logAuthEvent('auth.redirect.default_workspace', { pathname, role: identity?.role ?? null, target: defaultPath }, user.id);
    return noCacheResponse(NextResponse.redirect(new URL(defaultPath, request.url)));
  }

  // ── DS-014: CAPABILITY-BASED WORKSPACE AUTHORIZATION ──
  if (isRestrictedWorkspace(pathname)) {
    let role = user.user_metadata?.role as string | undefined
      || user.app_metadata?.role as string | undefined;

    if (!role) {
      // HF-282: canonical reader (replaces the profile-count-sensitive .maybeSingle()
      // — DIAG-060 Addendum A). On null, role stays undefined → allow through
      // (client-side RequireCapability catches), preserving prior behavior (DD-7).
      const identity = await resolveIdentity(supabase, user.id);
      role = identity?.role || undefined;
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

  // ── OB-250: TENANT-FEATURE GATE (server-side deep-link protection — the second gate) ──
  // The capability gate above is necessary but NOT sufficient for PRISM surfaces: a data.import
  // user on a prism-DISABLED tenant must not reach /data/submit etc. Only the EXACT PRISM paths
  // (WORKSPACE_FEATURES) require a feature — never the bare /data or /operate prefix, so
  // /data/transactions (I5) and /operate/import local (I6) stay reachable. We load the EFFECTIVE
  // tenant's features ONLY for those paths (bounded). Platform admins operate on the cookie-selected
  // tenant (their profile tenant is null, OB-247); everyone else on their profile tenant. Fail-closed.
  const requiredFeature = requiredFeatureForPath(pathname);
  if (requiredFeature) {
    const identity = await resolveIdentity(supabase, user.id);
    const effectiveTenantId = identity?.canonicalRole === 'platform'
      ? (request.cookies.get('vialuce-tenant-id')?.value || identity?.tenantId || null)
      : (identity?.tenantId || null);
    let featureOn = false;
    if (effectiveTenantId) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('features')
        .eq('id', effectiveTenantId)
        .maybeSingle();
      const features = ((tenantRow?.features ?? {}) as Record<string, unknown>);
      featureOn = features[requiredFeature] === true;
    }
    if (!featureOn) {
      logAuthEvent('auth.permission.feature_denied', { pathname, feature: requiredFeature }, user.id);
      return noCacheResponse(NextResponse.redirect(new URL('/unauthorized', request.url)));
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
