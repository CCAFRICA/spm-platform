/**
 * OB-230 — Admin action audit writer (Decision 143 / DS-019 §8 / SOC 2 CC6).
 *
 * Every Objective-1C admin action writes an `admin.user.*` event to platform_events BEFORE the route
 * returns — the audit trail is not optional. Logged with the platform admin as actor_id and the target
 * user as entity_id, so the action surfaces in the target user's timeline (queried by actor_id OR
 * entity_id). Never throws — a logging failure must not mask the action's own result, but the route
 * checks the returned ok flag so it can report a logging failure if it wants.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminActionEventType } from './event-types';

export interface AdminUserActionLog {
  action: string; // bare verb: 'force_logout' | 'ban' | 'unban' | 'password_reset' | 'mfa_reset' | 'resend_confirmation'
  actorId: string | null; // platform admin auth user id (who)
  actorProfileId?: string | null;
  actorEmail?: string | null;
  targetUserId: string | null; // target auth user id (whom) → entity_id
  targetProfileId?: string | null;
  tenantId?: string | null; // target's tenant (nullable for platform users)
  ip?: string | null; // from where
  userAgent?: string | null;
  success: boolean; // outcome
  detail?: Record<string, unknown>;
}

export async function logAdminUserAction(
  serviceClient: SupabaseClient,
  log: AdminUserActionLog,
): Promise<boolean> {
  try {
    const { error } = await serviceClient.from('platform_events').insert({
      tenant_id: log.tenantId ?? null,
      event_type: adminActionEventType(log.action),
      actor_id: log.actorId,
      entity_id: log.targetUserId,
      payload: {
        ...(log.detail ?? {}),
        action: log.action,
        success: log.success,
        actor_profile_id: log.actorProfileId ?? null,
        actor_email: log.actorEmail ?? null,
        target_user_id: log.targetUserId,
        target_profile_id: log.targetProfileId ?? null,
        ip: log.ip ?? null,
        user_agent: log.userAgent ?? null,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) {
      console.error('[OB-230] admin action audit write failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[OB-230] admin action audit write threw:', err);
    return false;
  }
}

/** Pull the request IP + UA the way /api/auth/log-event does, for consistent audit payloads. */
export function requestForensics(req: Request): { ip: string | null; userAgent: string | null } {
  const h = req.headers;
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  const userAgent = h.get('user-agent') || null;
  return { ip, userAgent };
}
