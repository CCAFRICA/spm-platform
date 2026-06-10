/**
 * Auth Event Logger — OB-178 / DS-019 Section 8
 *
 * Provider-agnostic auth event logging to platform_events table.
 *
 * TWO PATHS:
 * - Server-side (middleware, API routes): Uses service role client directly
 * - Client-side (login page, MFA pages): Calls /api/auth/log-event API route
 *
 * HF-149: tenant_id is NULL for platform-scope events (VL Admin).
 * CRITICAL: Logging must NEVER block the auth flow.
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
  | 'auth.permission.denied'
  // HF-282 Phase 1 — canonical identity resolution anomalies (resolveIdentity)
  | 'identity.resolve.query_error'
  | 'identity.resolve.zero_rows'
  | 'identity.resolve.duplicate_rows'
  // HF-284 — login-path session lifecycle: session absent at profile-fetch time
  // (distinct from zero-rows), and session-ownership reinit of residue bookkeeping.
  | 'identity.resolve.session_absent'
  | 'auth.session.bookkeeping_reset'
  // HF-282 Phase 2.3 — redirect observability (the DIAG-060 §6 13-branch inventory).
  // Every auth/tenant redirect emits a named event before redirecting/clearing.
  | 'auth.redirect.unauth_root'          // middleware.ts:152
  | 'auth.redirect.unauth_protected'     // middleware.ts:167
  | 'auth.redirect.mfa_verify'           // middleware.ts:269
  | 'auth.redirect.mfa_enroll'           // middleware.ts:287
  | 'auth.redirect.tenant_cookie_present'// middleware.ts:317
  | 'auth.redirect.tenant_select'        // middleware.ts:319
  | 'auth.redirect.default_workspace'    // middleware.ts:333
  | 'auth.shell.loop_break'              // auth-shell.tsx:116 (clears sb-* + tenant cookie)
  | 'auth.shell.unauth_redirect'         // auth-shell.tsx:121
  | 'auth.shell.hydration_timeout'       // auth-shell.tsx:158
  | 'auth.shell.tenant_gate'             // auth-shell.tsx:130
  | 'tenant.cleared'                     // tenant-context.tsx:212
  // HF-283 Phase 4 — tenant-entry observability (once per selection, client surface)
  | 'tenant.entered'                     // ObservatoryTab.handleSelectTenant success
  | 'tenant.load_failed';                // ObservatoryTab.handleSelectTenant failure

/**
 * Log an auth event — server-side (service role client, direct INSERT).
 * Called from middleware and API routes where SUPABASE_SERVICE_ROLE_KEY is available.
 */
export async function logAuthEvent(
  eventType: AuthEventType,
  payload: Record<string, unknown>,
  actorId?: string,
  tenantId?: string | null,
): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return; // Not server-side — skip

    const supabase = createClient(url, serviceKey);
    await supabase.from('platform_events').insert({
      tenant_id: tenantId || null, // HF-149: NULL for platform-scope events
      event_type: eventType,
      actor_id: actorId || null,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[HF-149] Auth event logging failed:', err);
  }
}

// HF-150: Deduplication guard — prevents duplicate events from React re-renders
const recentEvents = new Map<string, number>();

/**
 * Log an auth event — client-side (calls API route).
 * Called from login page, MFA pages, logout where service key is NOT available.
 * The API route uses the service role client server-side.
 *
 * HF-150: Accepts optional explicit fields (actor_id, email, tenant_id)
 * for cases where cookies are about to be destroyed (logout).
 */
export async function logAuthEventClient(
  eventType: AuthEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    // HF-150: Deduplicate — same event type within 5 seconds is dropped
    const now = Date.now();
    const lastLogged = recentEvents.get(eventType) || 0;
    if (now - lastLogged < 5000) return;
    recentEvents.set(eventType, now);

    await fetch('/api/auth/log-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, payload }),
    });
  } catch {
    // Never block auth flow
  }
}
