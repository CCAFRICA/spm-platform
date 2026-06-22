/**
 * OB-230 — Observability event-type vocabulary.
 *
 * These are the NEW event_type literals OB-230 writes into platform_events. They extend the
 * existing AuthEventType (auth-logger.ts) / PlatformEventType (events/emitter.ts) vocabularies.
 *
 * IMPORTANT (Korean Test / AP-25): the UI never switches on these literals. The event timeline
 * classifies events for color/icon STRUCTURALLY by prefix (see event-classification.ts). This
 * union exists only to type the WRITERS — new prefixes render in the UI automatically.
 */

// Admin remediation actions (Objective 1C). Written with the platform admin as actor_id and the
// target user as entity_id, so they surface in the target user's timeline (actor_id OR entity_id).
export type AdminUserActionType =
  | 'admin.user.force_logout'
  | 'admin.user.ban'
  | 'admin.user.unban'
  | 'admin.user.password_reset'
  | 'admin.user.mfa_reset'
  | 'admin.user.resend_confirmation';

// Signal-enrichment events (Objective 3).
export type ObservabilitySignalType =
  | 'client.error.unhandled' // 3A
  | 'platform.user.session_churn' // 3B
  | 'navigation.route_change'; // 3C

export type ObservabilityEventType = AdminUserActionType | ObservabilitySignalType;

/** The bare action verb (e.g. 'force_logout') → its admin.user.* event type. */
export function adminActionEventType(action: string): AdminUserActionType {
  return `admin.user.${action}` as AdminUserActionType;
}
