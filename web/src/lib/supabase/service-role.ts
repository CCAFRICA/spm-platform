/**
 * Service-role Supabase client WITHOUT importing `next/headers`.
 *
 * `server.ts` statically imports `next/headers` (for the cookie-based client), so any
 * module that imports from it drags `next/headers` into its bundle — which breaks when
 * the module is part of a graph reachable from a page/client component. AIService is
 * exactly such a graph (OB-215 added a persisted-config loader + metrics writer to it),
 * so those modules use THIS helper instead. The dynamic import keeps @supabase/supabase-js
 * out of the client bundle; these functions only ever execute server-side.
 *
 * Bypasses RLS — server-side only (same contract as server.ts createServiceRoleClient).
 */

import type { Database } from './database.types';

export async function createServiceRoleClientSafe() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
