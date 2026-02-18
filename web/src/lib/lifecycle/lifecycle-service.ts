/**
 * Lifecycle State Machine Service — Dashboard Layer
 *
 * Simplified 9-state lifecycle for dashboard display and navigation.
 * Builds on top of the full lifecycle system in lib/calculation/lifecycle-utils.ts
 * and lib/calculation/calculation-lifecycle-service.ts.
 *
 * The full system includes PENDING_APPROVAL, REJECTED, SUPERSEDED states
 * which are operational (not dashboard-facing). This service provides:
 *   1. Linear 9-state progression for UI display
 *   2. Forward/backward transition validation
 *   3. Next-action labels in Spanish
 *   4. Display helpers (dot colors, step counts)
 *   5. Transition function that delegates to the full lifecycle service
 */

import { createClient } from '@/lib/supabase/client';
import type { LifecycleState } from '@/lib/supabase/database.types';

// ──────────────────────────────────────────────
// 9-State Linear Progression
// ──────────────────────────────────────────────

export const LIFECYCLE_STATES = [
  'DRAFT',
  'PREVIEW',
  'RECONCILE',
  'OFFICIAL',
  'APPROVED',
  'POSTED',
  'CLOSED',
  'PAID',
  'PUBLISHED',
] as const;

export type DashboardLifecycleState = typeof LIFECYCLE_STATES[number];

/**
 * Valid transitions: forward one step, or backward one step (except terminal states).
 */
export const VALID_TRANSITIONS: Record<DashboardLifecycleState, DashboardLifecycleState[]> = {
  DRAFT: ['PREVIEW'],
  PREVIEW: ['RECONCILE', 'DRAFT'],
  RECONCILE: ['OFFICIAL', 'PREVIEW'],
  OFFICIAL: ['APPROVED', 'PREVIEW'],
  APPROVED: ['POSTED', 'OFFICIAL'],
  POSTED: ['CLOSED'],
  CLOSED: ['PAID'],
  PAID: ['PUBLISHED'],
  PUBLISHED: [],
};

// ──────────────────────────────────────────────
// Display Helpers
// ──────────────────────────────────────────────

export const LIFECYCLE_DISPLAY: Record<DashboardLifecycleState, {
  label: string;
  labelEs: string;
  dotColor: string;
  description: string;
}> = {
  DRAFT: {
    label: 'Draft',
    labelEs: 'Borrador',
    dotColor: 'bg-zinc-500',
    description: 'Rule set configured, no calculations run yet',
  },
  PREVIEW: {
    label: 'Preview',
    labelEs: 'Vista Previa',
    dotColor: 'bg-blue-500',
    description: 'Calculation run in preview mode, results visible to admin only',
  },
  RECONCILE: {
    label: 'Reconcile',
    labelEs: 'Reconciliacion',
    dotColor: 'bg-cyan-500',
    description: 'Results under review, comparing against external sources',
  },
  OFFICIAL: {
    label: 'Official',
    labelEs: 'Oficial',
    dotColor: 'bg-purple-500',
    description: 'Results locked, ready for approval',
  },
  APPROVED: {
    label: 'Approved',
    labelEs: 'Aprobado',
    dotColor: 'bg-emerald-500',
    description: 'Results approved by authorized reviewer',
  },
  POSTED: {
    label: 'Posted',
    labelEs: 'Publicado',
    dotColor: 'bg-teal-500',
    description: 'Results visible to all roles in Perform workspace',
  },
  CLOSED: {
    label: 'Closed',
    labelEs: 'Cerrado',
    dotColor: 'bg-indigo-500',
    description: 'Period locked, no further modifications',
  },
  PAID: {
    label: 'Paid',
    labelEs: 'Pagado',
    dotColor: 'bg-amber-500',
    description: 'Payment confirmed and recorded',
  },
  PUBLISHED: {
    label: 'Published',
    labelEs: 'Finalizado',
    dotColor: 'bg-sky-500',
    description: 'Terminal state, audit trail sealed',
  },
};

// ──────────────────────────────────────────────
// Next Action
// ──────────────────────────────────────────────

export function getNextAction(
  state: DashboardLifecycleState
): { label: string; nextState: DashboardLifecycleState } | null {
  const actions: Partial<Record<DashboardLifecycleState, { label: string; nextState: DashboardLifecycleState }>> = {
    DRAFT: { label: 'Run Preview', nextState: 'PREVIEW' },
    PREVIEW: { label: 'Start Reconciliation', nextState: 'RECONCILE' },
    RECONCILE: { label: 'Mark as Official', nextState: 'OFFICIAL' },
    OFFICIAL: { label: 'Approve Results', nextState: 'APPROVED' },
    APPROVED: { label: 'Publish to Entities', nextState: 'POSTED' },
    POSTED: { label: 'Close Period', nextState: 'CLOSED' },
    CLOSED: { label: 'Confirm Payment', nextState: 'PAID' },
    PAID: { label: 'Publish Results', nextState: 'PUBLISHED' },
  };
  return actions[state] ?? null;
}

export function getPreviousAction(
  state: DashboardLifecycleState
): { label: string; prevState: DashboardLifecycleState } | null {
  const actions: Partial<Record<DashboardLifecycleState, { label: string; prevState: DashboardLifecycleState }>> = {
    PREVIEW: { label: 'Back to Draft', prevState: 'DRAFT' },
    RECONCILE: { label: 'Back to Preview', prevState: 'PREVIEW' },
    OFFICIAL: { label: 'Back to Reconciliation', prevState: 'RECONCILE' },
    APPROVED: { label: 'Back to Official', prevState: 'OFFICIAL' },
  };
  return actions[state] ?? null;
}

// ──────────────────────────────────────────────
// Step Counting
// ──────────────────────────────────────────────

export function getCompletedSteps(state: DashboardLifecycleState): number {
  return LIFECYCLE_STATES.indexOf(state) + 1;
}

export function getTotalSteps(): number {
  return LIFECYCLE_STATES.length;
}

export function getProgressPct(state: DashboardLifecycleState): number {
  return (getCompletedSteps(state) / getTotalSteps()) * 100;
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

export function canTransitionTo(
  current: DashboardLifecycleState,
  target: DashboardLifecycleState
): boolean {
  return (VALID_TRANSITIONS[current] ?? []).includes(target);
}

export function isDashboardState(state: string): state is DashboardLifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(state);
}

/**
 * Map full lifecycle state (including PENDING_APPROVAL, REJECTED, SUPERSEDED)
 * to the nearest dashboard state for display purposes.
 */
export function toDashboardState(state: LifecycleState | string): DashboardLifecycleState {
  if (isDashboardState(state)) return state;
  switch (state) {
    case 'PENDING_APPROVAL': return 'OFFICIAL';
    case 'REJECTED': return 'OFFICIAL';
    case 'SUPERSEDED': return 'DRAFT';
    default: return 'DRAFT';
  }
}

// ──────────────────────────────────────────────
// Transition (delegates to Supabase)
// ──────────────────────────────────────────────

export async function transitionLifecycle(
  tenantId: string,
  periodId: string,
  newState: DashboardLifecycleState
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // Get current state from latest non-superseded batch
  const { data: batch } = await supabase
    .from('calculation_batches')
    .select('id, lifecycle_state')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!batch) {
    return { success: false, error: 'No active calculation batch found for this period' };
  }

  const currentDashboardState = toDashboardState(batch.lifecycle_state);

  if (!canTransitionTo(currentDashboardState, newState)) {
    return {
      success: false,
      error: `Cannot transition from ${currentDashboardState} to ${newState}`,
    };
  }

  // Update the batch
  const { error } = await supabase
    .from('calculation_batches')
    .update({
      lifecycle_state: newState as LifecycleState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batch.id)
    .eq('tenant_id', tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Log to audit
  try {
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      action: 'lifecycle_transition',
      resource_type: 'calculation_batch',
      resource_id: batch.id,
      changes: {
        from: currentDashboardState,
        to: newState,
        period_id: periodId,
      },
    });
  } catch {
    // Audit log failure should not block the transition
  }

  return { success: true };
}

// ──────────────────────────────────────────────
// Current State Query
// ──────────────────────────────────────────────

export async function getCurrentLifecycleState(
  tenantId: string,
  periodId: string
): Promise<DashboardLifecycleState | null> {
  const supabase = createClient();

  const { data } = await supabase
    .from('calculation_batches')
    .select('lifecycle_state')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  return toDashboardState(data.lifecycle_state);
}
