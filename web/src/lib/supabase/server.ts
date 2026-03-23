/**
 * Supabase Server Client
 *
 * Creates a Supabase client for use in server components and API routes.
 * Handles cookie-based session management via Next.js cookies API.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { SESSION_COOKIE_OPTIONS } from './cookie-config';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // OB-178: Apply SOC 2 / OWASP compliant cookie options
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // HF-167: Override Supabase SSR's 400-day cookie options.
            // Same pattern as middleware.ts — force session-scoped cookies.
            cookiesToSet.forEach(({ name, value, options }) => {
              const sessionOptions = { ...options, ...SESSION_COOKIE_OPTIONS };
              delete sessionOptions.maxAge;
              cookieStore.set(name, value, sessionOptions);
            });
          } catch {
            // setAll can fail in Server Components when cookies are read-only.
            // This is expected behavior — session refresh happens in middleware.
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase admin client using the service role key.
 * Only for server-side operations that bypass RLS (e.g., migrations, seed).
 */
export async function createServiceRoleClient() {
  const { createClient } = await import('@supabase/supabase-js');

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
