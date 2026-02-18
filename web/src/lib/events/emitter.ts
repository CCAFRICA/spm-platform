/**
 * Platform Event Emitter
 *
 * Central nervous system for the platform.
 * Events are written to platform_events table and consumed by agents.
 *
 * Server-side: emitEvent() writes directly to Supabase
 * Client-side: emitEventClient() calls API route
 *
 * Event emission NEVER blocks the parent operation.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type PlatformEventType =
  // Data
  | 'data.imported'
  | 'data.committed'
  | 'data.anomaly_detected'
  // Plan
  | 'plan.imported'
  | 'plan.interpreted'
  | 'plan.confirmed'
  // Calculation
  | 'calculation.started'
  | 'calculation.completed'
  | 'calculation.outlier_detected'
  // Lifecycle
  | 'lifecycle.advanced'
  | 'lifecycle.approval_requested'
  | 'lifecycle.approved'
  // User
  | 'user.signed_up'
  | 'user.invited'
  | 'user.first_login'
  | 'user.feature_used'
  // Billing
  | 'billing.trial_started'
  | 'billing.trial_expiring'
  | 'billing.subscription_activated'
  | 'billing.subscription_cancelled'
  // Dispute
  | 'dispute.submitted'
  | 'dispute.resolved'
  // Agent
  | 'agent.recommendation'
  | 'agent.action_taken'
  | 'agent.insight_generated';

// ---------------------------------------------------------------------------
// Event Interface
// ---------------------------------------------------------------------------

export interface PlatformEvent {
  tenant_id: string;
  event_type: PlatformEventType;
  actor_id?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Server-side emitter (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Emit a platform event. Fire-and-forget — errors are logged, not thrown.
 * Call this from server-side code (API routes, server actions).
 */
export async function emitEvent(event: PlatformEvent): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();
    // platform_events table created via SQL migration — not yet in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as unknown as { from: (t: string) => any })
      .from('platform_events')
      .insert({
        tenant_id: event.tenant_id,
        event_type: event.event_type,
        actor_id: event.actor_id || null,
        entity_id: event.entity_id || null,
        payload: event.payload || {},
        processed_by: [],
      });

    if (error) {
      console.error('[emitEvent] Failed to write event:', error.message, event.event_type);
    }
  } catch (err) {
    console.error('[emitEvent] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Client-side emitter (calls API route)
// ---------------------------------------------------------------------------

/**
 * Emit a platform event from client-side code.
 * Calls POST /api/platform/events. Fire-and-forget.
 */
export async function emitEventClient(event: PlatformEvent): Promise<void> {
  try {
    await fetch('/api/platform/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error('[emitEventClient] Error:', err);
  }
}
