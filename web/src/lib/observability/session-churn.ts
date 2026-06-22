/**
 * OB-230 Objective 3B — session churn detection.
 *
 * "User is struggling to log in" signal. Called fire-and-forget from the middleware session-reinit
 * branch (the natural churn moment — a session-identity change under the same browser). If the actor
 * has ≥3 session-establishment events (login.success / bookkeeping_reset) in a 5-minute window, emit
 * one platform.user.session_churn event (de-duplicated to one per window). Never throws.
 *
 * Bounded by design: runs only on the (rare) reinit path; two head-count queries + at most one insert.
 * Reads platform_events by actor_id (HALT-5: unindexed until the delivered migration is applied), but
 * the 5-minute window + head:true keep it cheap.
 */

import { createClient } from '@supabase/supabase-js';
import { logAuthEvent } from '@/lib/auth/auth-logger';

const WINDOW_MS = 5 * 60 * 1000;
const THRESHOLD = 3;
const ESTABLISH_TYPES = ['auth.login.success', 'auth.session.bookkeeping_reset'];

export async function detectSessionChurn(actorId: string, tenantId: string | null): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || !actorId) return;
    const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const { count } = await sb
      .from('platform_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', actorId)
      .in('event_type', ESTABLISH_TYPES)
      .gte('created_at', since);

    if ((count ?? 0) < THRESHOLD) return;

    // Only emit once per window — don't re-flag on every subsequent reinit.
    const { count: already } = await sb
      .from('platform_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', actorId)
      .eq('event_type', 'platform.user.session_churn')
      .gte('created_at', since);
    if ((already ?? 0) > 0) return;

    await logAuthEvent('platform.user.session_churn', { window_minutes: 5, session_events: count }, actorId, tenantId);
  } catch (err) {
    console.error('[OB-230] session churn detection failed:', err);
  }
}
