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
import type { Profile } from './database.types';
import { logAuthEvent } from '@/lib/auth/auth-logger';

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
    // OB-178: Log login failure
    logAuthEvent(supabase, 'auth.login.failure', { email, error: error.message });
    throw error;
  }

  // OB-178: Log login success
  logAuthEvent(supabase, 'auth.login.success', { email }, data.user?.id);
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

  // OB-178: Log logout event before clearing session
  logAuthEvent(supabase, 'auth.logout', {});

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
 * Fetch the profile for the current auth user from the profiles table.
 * Returns null on ANY error — never throws. Callers should treat null
 * as "not authenticated" and let AuthShellProtected handle the redirect.
 *
 * VL ADMIN GUARD — HF-097
 * VL Admin has tenant_id = NULL and role = 'platform'.
 * Profile fetch on login MUST work for tenant_id IS NULL.
 * DO NOT add tenant_id filters to the login profile fetch.
 * DO NOT reference scope_level — the column is 'role'.
 * See: CC FP-49 (SQL Schema Fabrication), HF-097
 */
export async function fetchCurrentProfile(): Promise<AuthProfile | null> {
  try {
    const supabase = createClient();

    // HF-097: Use getUser() as the SOLE auth check.
    // getSession() reads from cookies which may not be available immediately
    // after signInWithPassword() — this caused "Account found but profile
    // is missing" for VL Admin login. getUser() validates with the server
    // and works reliably in all cases.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    // Query profiles by auth_user_id — NO tenant_id filter.
    // HF-062: Use array query instead of .maybeSingle().
    // The profiles table has NO unique constraint on auth_user_id — platform
    // users can have profiles across multiple tenants. .maybeSingle() errors
    // when >1 row matches ("JSON object requested, multiple rows returned"),
    // causing "Account found but profile is missing" on login.
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('[Auth] Profile query failed:', error.message, error.details);
      return null;
    }

    if (!profiles || profiles.length === 0) {
      console.error('[Auth] No profile rows found for auth_user_id:', user.id);
      return null;
    }

    // If multiple profiles, prefer platform-level (platform role or manage_tenants)
    const profile = (
      profiles.find(p => p.role === 'platform') ||
      profiles.find(p => ((p.capabilities as string[]) || []).includes('manage_tenants')) ||
      profiles[0]
    ) as Profile;
    return {
      id: profile.id,
      authUserId: profile.auth_user_id,
      // HF-097: VL Admin has tenant_id = NULL in DB. The Profile Row type says string
      // (pre-existing type lie) but the actual DB column is nullable for platform users.
      tenantId: (profile as unknown as { tenant_id: string | null }).tenant_id,
      displayName: profile.display_name,
      email: profile.email,
      role: profile.role,
      capabilities: (profile.capabilities as string[]) || [],
      locale: profile.locale,
      avatarUrl: profile.avatar_url,
    };
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
