/**
 * Auth Event Logger — OB-178 / DS-019 Section 8
 *
 * Provider-agnostic auth event logging to platform_events table.
 * Uses the service role client to bypass RLS — auth logging is a system concern.
 *
 * CRITICAL: Logging must NEVER block the auth flow.
 * Every call is wrapped in try/catch. Failure is logged to console only.
 */

import { createClient } from '@supabase/supabase-js';

export type AuthEventType =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.mfa.enroll'
  | 'auth.mfa.verify.success'
  | 'auth.mfa.verify.failure'
  | 'auth.session.expired.idle'
  | 'auth.session.expired.absolute'
  | 'auth.permission.denied';

/**
 * Log an auth event to platform_events using the service role client.
 * HF-147: Uses service role to bypass RLS (G3 fix — anon client gets 403).
 * Safe to call from middleware, API routes, and client-side (with env vars).
 */
export async function logAuthEvent(
  eventType: AuthEventType,
  payload: Record<string, unknown>,
  actorId?: string,
  tenantId?: string,
): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return; // Client-side: no service key available, skip silently

    const supabase = createClient(url, serviceKey);
    await supabase.from('platform_events').insert({
      tenant_id: tenantId || '00000000-0000-0000-0000-000000000000',
      event_type: eventType,
      actor_id: actorId || null,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[HF-147] Auth event logging failed:', err);
  }
}
