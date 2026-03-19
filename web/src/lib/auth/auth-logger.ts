/**
 * Auth Event Logger — OB-178 / DS-019 Section 8
 *
 * Provider-agnostic auth event logging to platform_events table.
 * Travels with the codebase regardless of auth provider.
 * Supabase audit_log_entries is the provider's log; this is ours.
 *
 * CRITICAL: Logging must NEVER block the auth flow.
 * Every call is wrapped in try/catch. Failure is logged to console only.
 */

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export async function logAuthEvent(
  supabase: SupabaseClient,
  eventType: AuthEventType,
  payload: Record<string, unknown>,
  actorId?: string,
  tenantId?: string,
): Promise<void> {
  try {
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
    // Auth logging must never block the auth flow
    console.error('[OB-178] Auth event logging failed:', err);
  }
}
