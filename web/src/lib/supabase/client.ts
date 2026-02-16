/**
 * Supabase Browser Client
 *
 * Creates a Supabase client for use in client components.
 * Uses @supabase/ssr for cookie-based session management.
 *
 * Supabase IS the only data source. No fallback.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

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

  client = createBrowserClient<Database>(url, key);
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
