/**
 * Supabase Auth Service
 *
 * Handles authentication operations via Supabase Auth.
 * Used when Supabase is configured (env vars present).
 * Falls back to demo auth when not configured.
 */

import { createClient, isSupabaseConfigured } from './client';
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
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

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
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

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
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get the current Supabase auth session.
 */
export async function getSession() {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Fetch the profile for the current auth user from the profiles table.
 * Returns null if no profile exists.
 */
export async function fetchCurrentProfile(): Promise<AuthProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

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
}

/**
 * Listen to Supabase auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
): () => void {
  if (!isSupabaseConfigured()) return () => {};

  const supabase = createClient();
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}
