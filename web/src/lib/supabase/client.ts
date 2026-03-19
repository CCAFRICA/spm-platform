/**
 * Supabase Browser Client — OB-178 / DS-019 Section 4.3
 *
 * WRITE-ONLY for auth operations:
 *   - signInWithPassword (login)
 *   - signOut (logout)
 *   - mfa.enroll / mfa.challenge / mfa.verify (MFA ceremony)
 *   - onAuthStateChange (SIGNED_OUT detection only — not for session init)
 *
 * READ operations (getUser, getSession) are done SERVER-SIDE
 * via getServerAuthState() in server-auth.ts.
 *
 * Also used for Supabase data queries (from() calls) which use
 * the anon key with RLS. This is intentional — data access is
 * gated by RLS using auth.uid(), not by client-side auth checks.
 *
 * Do NOT add getUser() or getSession() calls for session initialization.
 * The server resolves auth state and passes it to AuthProvider as props.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { SESSION_COOKIE_OPTIONS } from './cookie-config';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.'
    );
  }

  // OB-178: Apply SOC 2 / OWASP compliant cookie options (8h maxAge, secure, sameSite)
  client = createBrowserClient<Database>(url, key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
  });
  return client;
}

/**
 * Guard: throws if tenantId is null, undefined, or empty string.
 * Call at the top of any service function that writes to Supabase.
 */
export function requireTenantId(tenantId: string | null | undefined): asserts tenantId is string {
  if (!tenantId) {
    throw new Error('tenantId is required but was ' + JSON.stringify(tenantId));
  }
}
