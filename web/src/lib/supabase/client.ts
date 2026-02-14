/**
 * Supabase Browser Client
 *
 * Creates a Supabase client for use in client components.
 * Uses @supabase/ssr for cookie-based session management.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (client) return client;

  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
}

/**
 * Check if Supabase is configured.
 * Returns false when env vars are missing (localStorage fallback mode).
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
