/**
 * Supabase Auth Service
 *
 * Handles authentication operations via Supabase Auth.
 * Supabase-only. No fallback.
 *
 * IMPORTANT: Functions in this file set STATE only. They NEVER trigger
 * navigation (no window.location.href, no router.push). Navigation is
 * handled exclusively by AuthShellProtected.
 */

import { createClient } from './client';
import type { Profile } from './database.types';

export interface AuthProfile {
  id: string;
  authUserId: string;
  tenantId: string;
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

  if (error) throw error;
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
 */
export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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
 */
export async function fetchCurrentProfile(): Promise<AuthProfile | null> {
  try {
    const supabase = createClient();

    // Check local session first (no network request)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Validate with server
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Both session and user confirmed — query profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    if (error || !data) return null;

    const profile = data as Profile;
    return {
      id: profile.id,
      authUserId: profile.auth_user_id,
      tenantId: profile.tenant_id,
      displayName: profile.display_name,
      email: profile.email,
      role: profile.role,
      capabilities: (profile.capabilities as string[]) || [],
      locale: profile.locale,
      avatarUrl: profile.avatar_url,
    };
  } catch {
    // Swallow ALL errors — return null, never throw
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
