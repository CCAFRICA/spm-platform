/**
 * Supabase Auth Service
 *
 * Handles authentication operations via Supabase Auth.
 * Supabase-only. No fallback.
 *
 * Functions in this file handle Supabase auth operations only.
 * Navigation is handled by auth-context.tsx (logout) and
 * AuthShellProtected (backup redirect).
 */

import { createClient } from './client';
import { logAuthEventClient } from '@/lib/auth/auth-logger';
import { resolveIdentity, type ResolvedIdentity } from '@/lib/auth/resolve-identity';

export interface AuthProfile {
  id: string;
  authUserId: string;
  tenantId: string | null;
  displayName: string;
  email: string;
  role: string;
  capabilities: string[];
  locale: string | null;
  avatarUrl: string | null;
}

/**
 * Sign in with email and password via Supabase Auth.
 * Returns the auth user on success, throws on failure.
 */
export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // HF-151 F1+F3: await ensures fetch completes before throw. Key 'reason' matches SQL query.
    await logAuthEventClient('auth.login.failure', { email, reason: error.message });
    throw error;
  }

  // HF-151 F1: await ensures fetch completes before router.push cancels in-flight requests
  await logAuthEventClient('auth.login.success', { email, userId: data.user?.id });
  return data;
}

/**
 * Sign up with email and password via Supabase Auth.
 */
export async function signUpWithEmail(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Sign out via Supabase Auth.
 * OB-178 / DS-019 Section 4.4: SOC 2 CC6 — server-side session revocation on logout.
 * scope: 'global' revokes ALL refresh tokens on the Supabase server.
 * Fallback to 'local' only if Supabase server is unreachable (network error).
 *
 * HF-050: Also clears ALL sb-* keys from localStorage.
 */
export async function signOut() {
  const supabase = createClient();

  // HF-151 F2: Capture user data + tenant_id BEFORE signOut destroys the session.
  let loggedUserId: string | undefined;
  let loggedEmail: string | undefined;
  let loggedTenantId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    loggedUserId = user?.id;
    loggedEmail = user?.email || undefined;
    // Resolve tenant_id from profile (while session still valid)
    if (user?.id) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('auth_user_id', user.id)
        .limit(1);
      loggedTenantId = profiles?.[0]?.tenant_id || null;
    }
  } catch {
    // Non-blocking — log without actor data if resolution fails
  }

  // HF-151: Clear MFA verify dedup flag
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('mfa_verify_logged');
  }

  // Log BEFORE signOut, with explicit user data including tenant_id
  await logAuthEventClient('auth.logout', {
    actor_id: loggedUserId,
    email: loggedEmail,
    tenant_id: loggedTenantId,
  });

  // OB-178: Global scope revokes all refresh tokens server-side.
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (globalErr) {
    console.warn('[OB-178] Global signOut failed, falling back to local:', globalErr);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (localErr) {
      console.error('[OB-178] Local signOut also failed:', localErr);
    }
  }

  clearSupabaseLocalStorage();
}

/**
 * HF-050: Remove all Supabase auth keys from localStorage.
 * Keys follow the pattern: sb-<project-ref>-auth-token
 * Safe to call in any environment (SSR-safe).
 */
export function clearSupabaseLocalStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Get the current Supabase auth session from local cookies (no network request).
 * WARNING: May return stale session data in Chrome. Always double-check with getAuthUser().
 */
export async function getSession() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Validate the current auth user with the Supabase server (network request).
 * Returns null if no valid session exists. This is the authoritative check —
 * getSession() can return stale cookie data, but getAuthUser() verifies with the server.
 */
export async function getAuthUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * HF-284 — typed sentinel for "the authenticated session is absent at profile-fetch
 * time" (getUser() returned no user). This is DISTINCT from a present session whose
 * profiles row is missing (that stays `null`). The login surface maps the two to
 * different user-facing messages so a session that was killed mid-login (stale
 * bookkeeping cookie — see middleware HF-284 clamp) is not mislabeled "profile missing."
 */
export const SESSION_ABSENT = Symbol('SESSION_ABSENT');
export type FetchProfileResult = AuthProfile | null | typeof SESSION_ABSENT;

/**
 * Pure classification of a profile fetch (HF-284) — testable without a live client.
 *   no user            -> SESSION_ABSENT  (session absent, not profile-missing)
 *   user, no identity  -> null            (zero-rows / query-error; resolveIdentity logged it)
 *   user + identity    -> mapped AuthProfile
 */
export function classifyProfileFetch(
  user: { id: string } | null | undefined,
  identity: ResolvedIdentity | null,
): FetchProfileResult {
  if (!user) return SESSION_ABSENT;
  if (!identity) return null;
  return {
    id: identity.id,
    authUserId: identity.authUserId,
    tenantId: identity.tenantId,
    displayName: identity.displayName,
    email: identity.email,
    role: identity.role,
    capabilities: identity.capabilities,
    locale: identity.locale,
    avatarUrl: identity.avatarUrl,
  };
}

/**
 * Fetch the profile for the current auth user from the profiles table.
 * Never throws. Returns SESSION_ABSENT when the session is absent, null when the
 * session is present but no profile resolves, or the AuthProfile on success.
 *
 * VL ADMIN GUARD — HF-097
 * VL Admin has tenant_id = NULL and role = 'platform'.
 * Profile fetch on login MUST work for tenant_id IS NULL.
 * DO NOT add tenant_id filters to the login profile fetch.
 * DO NOT reference scope_level — the column is 'role'.
 * See: CC FP-49 (SQL Schema Fabrication), HF-097
 */
export async function fetchCurrentProfile(): Promise<FetchProfileResult> {
  try {
    const supabase = createClient();

    // HF-097: Use getUser() as the SOLE auth check.
    // getSession() reads from cookies which may not be available immediately
    // after signInWithPassword() — this caused "Account found but profile
    // is missing" for VL Admin login. getUser() validates with the server
    // and works reliably in all cases.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      // HF-284: session absent at fetch time — distinct from a missing profile row.
      // Emit on the client-capable path (logAuthEvent no-ops client-side) and return
      // the typed sentinel so the login surface can say "session" not "profile."
      void logAuthEventClient('identity.resolve.session_absent', { reason: userError?.message ?? 'no_user' });
      return SESSION_ABSENT;
    }

    // HF-282: delegate to the canonical reader (resolveIdentity) — THE only
    // sanctioned profiles-by-auth_user_id resolution. Array-tolerant, deterministic
    // winner, alias-normalized, anomaly-logging. Public signature preserved (DD-7).
    const identity = await resolveIdentity(supabase, user.id);
    return classifyProfileFetch(user, identity);
  } catch (err) {
    console.error('[Auth] fetchCurrentProfile error:', err);
    return null;
  }
}

/**
 * Listen to Supabase auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
): () => void {
  const supabase = createClient();
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}
