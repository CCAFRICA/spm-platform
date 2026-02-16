/**
 * Calculation Lifecycle Service
 *
 * Bridge between lifecycle-utils (pure functions) and Supabase calculation-service.
 * Defines the CalculationCycle type, transition side effects, required capabilities,
 * and audit trail recording.
 *
 * This file is imported by LifecycleSubway and LifecycleActionBar components.
 */

import { createClient, requireTenantId } from '@/lib/supabase/client';
import type { Database, Json, LifecycleState } from '@/lib/supabase/database.types';
import {
  transitionBatchLifecycle,
  getCalculationBatch,
  supersedeBatch,
  listCalculationBatches,
} from '@/lib/supabase/calculation-service';

// ──────────────────────────────────────────────
// Re-exports from lifecycle-utils
// ──────────────────────────────────────────────
export {
  type CalculationState,
  LIFECYCLE_STATES_ORDERED,
  getStateLabel,
  getStateColor,
  getAllowedTransitions,
  canTransition,
  canViewResults,
} from './lifecycle-utils';

import type { CalculationState } from './lifecycle-utils';
import { canTransition } from './lifecycle-utils';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type CalcBatchRow = Database['public']['Tables']['calculation_batches']['Row'];

export interface AuditEntry {
  fromState: CalculationState;
  toState: CalculationState;
  actor: string;
  timestamp: string;
  details?: string;
}

export interface CalculationCycle {
  id: string;
  tenantId: string;
  periodId: string;
  ruleSetId: string | null;
  state: CalculationState;
  entityCount: number;
  totalPayout: number;
  auditTrail: AuditEntry[];
  rejectionReason?: string;
  approvedBy?: string;
  submittedBy?: string;
  createdAt: string;
  updatedAt: string;
  supersededBy?: string;
  supersedes?: string;
}

// ──────────────────────────────────────────────
// Required capabilities per transition
// ──────────────────────────────────────────────

const TRANSITION_CAPABILITIES: Record<string, string[]> = {
  'DRAFT->PREVIEW': ['manage_rule_sets'],
  'PREVIEW->OFFICIAL': ['manage_rule_sets'],
  'PREVIEW->DRAFT': ['manage_rule_sets'],
  'PREVIEW->RECONCILE': ['manage_rule_sets'],
  'RECONCILE->OFFICIAL': ['manage_rule_sets'],
  'RECONCILE->PREVIEW': ['manage_rule_sets'],
  'OFFICIAL->PENDING_APPROVAL': ['manage_rule_sets'],
  'OFFICIAL->SUPERSEDED': ['manage_rule_sets'],
  'PENDING_APPROVAL->APPROVED': ['approve_outcomes'],
  'PENDING_APPROVAL->REJECTED': ['approve_outcomes'],
  'REJECTED->OFFICIAL': ['manage_rule_sets'],
  'APPROVED->POSTED': ['manage_rule_sets'],
  'POSTED->CLOSED': ['manage_rule_sets'],
  'CLOSED->PAID': ['manage_rule_sets'],
  'PAID->PUBLISHED': ['manage_rule_sets'],
};

/**
 * Check if a user has the required capabilities for a transition.
 */
export function canPerformTransition(
  from: CalculationState,
  to: CalculationState,
  userCapabilities: string[],
  options?: { userId?: string; submittedBy?: string }
): { allowed: boolean; reason?: string } {
  if (!canTransition(from, to)) {
    return { allowed: false, reason: `Invalid transition: ${from} -> ${to}` };
  }

  // Separation of duties: submitter cannot approve
  if (to === 'APPROVED' && options?.userId && options?.submittedBy) {
    if (options.userId === options.submittedBy) {
      return { allowed: false, reason: 'Submitter cannot approve (separation of duties)' };
    }
  }

  const key = `${from}->${to}`;
  const required = TRANSITION_CAPABILITIES[key];
  if (!required) return { allowed: true };

  // VL Admin can always perform transitions
  if (userCapabilities.includes('manage_tenants')) return { allowed: true };

  const hasAll = required.every(cap => userCapabilities.includes(cap));
  if (!hasAll) {
    return { allowed: false, reason: `Missing capabilities: ${required.filter(c => !userCapabilities.includes(c)).join(', ')}` };
  }

  return { allowed: true };
}

// ──────────────────────────────────────────────
// Side effects per transition
// ──────────────────────────────────────────────

type SideEffectDescription = {
  description: string;
  details: string;
};

const TRANSITION_SIDE_EFFECTS: Record<string, SideEffectDescription> = {
  'PREVIEW->OFFICIAL': {
    description: 'Lock calculation results',
    details: 'Results become immutable from this point. Any changes require a new superseding batch.',
  },
  'OFFICIAL->PENDING_APPROVAL': {
    description: 'Create approval request',
    details: 'An approval request is queued. Users with approve_outcomes capability will see it.',
  },
  'PENDING_APPROVAL->APPROVED': {
    description: 'Record approval',
    details: 'Approval recorded. Results can now be posted to make visible to all roles.',
  },
  'PENDING_APPROVAL->REJECTED': {
    description: 'Record rejection',
    details: 'Rejection recorded with reason. Batch returns to OFFICIAL for re-work.',
  },
  'APPROVED->POSTED': {
    description: 'Make results visible',
    details: 'Results become visible to all roles in Perform workspace.',
  },
  'POSTED->CLOSED': {
    description: 'Prevent further changes',
    details: 'Period data is locked. No further modifications to this period.',
  },
  'CLOSED->PAID': {
    description: 'Record payment',
    details: 'Payment reference and date recorded.',
  },
  'PAID->PUBLISHED': {
    description: 'Seal audit trail',
    details: 'Terminal state. Full audit trail sealed. Period is complete.',
  },
  'OFFICIAL->SUPERSEDED': {
    description: 'Create superseding batch',
    details: 'Old batch marked as superseded. New batch created for re-calculation.',
  },
};

/**
 * Get side effect description for a transition.
 */
export function getTransitionSideEffect(
  from: CalculationState,
  to: CalculationState
): SideEffectDescription | null {
  return TRANSITION_SIDE_EFFECTS[`${from}->${to}`] || null;
}

// ──────────────────────────────────────────────
// Audit trail
// ──────────────────────────────────────────────

/**
 * Write an audit log entry for a lifecycle transition.
 */
export async function writeLifecycleAuditLog(
  tenantId: string,
  batchId: string,
  fromState: CalculationState,
  toState: CalculationState,
  actor: { profileId: string; name: string },
  details?: string
): Promise<void> {
  requireTenantId(tenantId);
  try {
    const supabase = createClient();
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      profile_id: actor.profileId,
      action: `lifecycle_transition:${fromState}->${toState}`,
      resource_type: 'calculation_batch',
      resource_id: batchId,
      changes: {
        from_state: fromState,
        to_state: toState,
        details: details || null,
      } as unknown as Json,
      metadata: {
        actor_name: actor.name,
        transition_key: `${fromState}->${toState}`,
      } as unknown as Json,
    });
  } catch (err) {
    console.warn('[LifecycleService] Failed to write audit log:', err);
  }
}

/**
 * Read audit trail entries for a batch from audit_logs.
 */
export async function getLifecycleAuditTrail(
  tenantId: string,
  batchId: string
): Promise<AuditEntry[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('resource_type', 'calculation_batch')
      .eq('resource_id', batchId)
      .like('action', 'lifecycle_transition:%')
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return data.map(log => {
      const changes = log.changes as Record<string, unknown> | null;
      const metadata = log.metadata as Record<string, unknown> | null;
      return {
        fromState: (changes?.from_state as CalculationState) || 'DRAFT',
        toState: (changes?.to_state as CalculationState) || 'DRAFT',
        actor: (metadata?.actor_name as string) || 'System',
        timestamp: log.created_at,
        details: (changes?.details as string) || undefined,
      };
    });
  } catch (err) {
    console.warn('[LifecycleService] Failed to read audit trail:', err);
    return [];
  }
}

// ──────────────────────────────────────────────
// Batch -> CalculationCycle conversion
// ──────────────────────────────────────────────

/**
 * Convert a Supabase calculation_batches row into a CalculationCycle.
 */
export async function batchToCycle(
  batch: CalcBatchRow,
  tenantId: string
): Promise<CalculationCycle> {
  const auditTrail = await getLifecycleAuditTrail(tenantId, batch.id);
  const summary = batch.summary as Record<string, unknown> | null;

  return {
    id: batch.id,
    tenantId: batch.tenant_id,
    periodId: batch.period_id,
    ruleSetId: batch.rule_set_id,
    state: batch.lifecycle_state as CalculationState,
    entityCount: batch.entity_count || 0,
    totalPayout: (summary?.totalPayout as number) || 0,
    auditTrail,
    rejectionReason: (summary?.rejectionReason as string) || undefined,
    approvedBy: (summary?.approvedBy as string) || undefined,
    submittedBy: (summary?.submittedBy as string) || undefined,
    createdAt: batch.created_at,
    updatedAt: batch.updated_at || batch.created_at,
    supersededBy: batch.superseded_by || undefined,
    supersedes: batch.supersedes || undefined,
  };
}

/**
 * Get the active cycle for a tenant/period.
 */
export async function getActiveCycle(
  tenantId: string,
  periodId: string
): Promise<CalculationCycle | null> {
  const batches = await listCalculationBatches(tenantId, { periodId });
  const active = batches.find(b => !b.superseded_by);
  if (!active) return null;
  return batchToCycle(active, tenantId);
}

// ──────────────────────────────────────────────
// Full lifecycle transition with side effects + audit
// ──────────────────────────────────────────────

/**
 * Perform a lifecycle transition with full side effects and audit logging.
 *
 * This is the primary entry point for UI components to advance lifecycle state.
 */
export async function performLifecycleTransition(
  tenantId: string,
  batchId: string,
  targetState: CalculationState,
  actor: { profileId: string; name: string },
  options?: {
    details?: string;
    rejectionReason?: string;
    paymentReference?: string;
  }
): Promise<CalculationCycle | null> {
  const batch = await getCalculationBatch(tenantId, batchId);
  if (!batch) return null;

  const currentState = batch.lifecycle_state as CalculationState;

  // Build summary updates based on transition
  const summaryUpdates: Record<string, unknown> = {
    ...(batch.summary as Record<string, unknown> || {}),
  };

  if (targetState === 'PENDING_APPROVAL') {
    summaryUpdates.submittedBy = actor.name;
    summaryUpdates.submittedAt = new Date().toISOString();
  }

  if (targetState === 'APPROVED') {
    summaryUpdates.approvedBy = actor.name;
    summaryUpdates.approvedAt = new Date().toISOString();
    summaryUpdates.approvalComments = options?.details || '';
  }

  if (targetState === 'REJECTED') {
    summaryUpdates.rejectionReason = options?.rejectionReason || options?.details || '';
    summaryUpdates.rejectedBy = actor.name;
    summaryUpdates.rejectedAt = new Date().toISOString();
  }

  if (targetState === 'PAID') {
    summaryUpdates.paymentReference = options?.paymentReference || '';
    summaryUpdates.paidAt = new Date().toISOString();
    summaryUpdates.paidBy = actor.name;
  }

  if (targetState === 'PUBLISHED') {
    summaryUpdates.publishedAt = new Date().toISOString();
    summaryUpdates.publishedBy = actor.name;
  }

  if (targetState === 'POSTED') {
    summaryUpdates.postedAt = new Date().toISOString();
    summaryUpdates.postedBy = actor.name;
  }

  if (targetState === 'CLOSED') {
    summaryUpdates.closedAt = new Date().toISOString();
    summaryUpdates.closedBy = actor.name;
  }

  // Handle supersession separately
  if (targetState === 'SUPERSEDED') {
    try {
      const newBatch = await supersedeBatch(tenantId, batchId, {
        createdBy: actor.profileId,
      });
      // Write audit log for supersession
      await writeLifecycleAuditLog(
        tenantId,
        batchId,
        currentState,
        'SUPERSEDED',
        actor,
        `Superseded by batch ${newBatch.id}`
      );
      return batchToCycle(newBatch, tenantId);
    } catch (err) {
      console.error('[LifecycleService] Supersession failed:', err);
      return null;
    }
  }

  // Normal transition via calculation-service
  const updated = await transitionBatchLifecycle(
    tenantId,
    batchId,
    targetState as LifecycleState,
    {
      summary: summaryUpdates,
      completedAt: ['PUBLISHED', 'CLOSED'].includes(targetState)
        ? new Date().toISOString()
        : undefined,
    }
  );

  if (!updated) return null;

  // Write audit log
  await writeLifecycleAuditLog(
    tenantId,
    batchId,
    currentState,
    targetState,
    actor,
    options?.details || options?.rejectionReason || undefined
  );

  return batchToCycle(updated, tenantId);
}

// ──────────────────────────────────────────────
// Export payroll CSV
// ──────────────────────────────────────────────

/**
 * Generate payroll CSV content from calculation results.
 */
export function generatePayrollCSV(
  results: Array<{
    entityId: string;
    entityName: string;
    totalPayout: number;
    components: Array<{ componentName: string; outputValue: number }>;
  }>,
  metadata: {
    tenantName: string;
    periodId: string;
    batchState: string;
    currency: string;
    locale: string;
  }
): string {
  if (results.length === 0) return '';

  // Collect unique component names
  const componentNames = Array.from(
    new Set(results.flatMap(r => r.components.map(c => c.componentName)))
  ).sort();

  // Header row
  const headers = ['Entity ID', 'Entity Name', ...componentNames, 'Total Outcome'];

  // Data rows
  const dataRows = results.map(r => {
    const componentValues = componentNames.map(name => {
      const comp = r.components.find(c => c.componentName === name);
      return comp ? String(comp.outputValue) : '0';
    });
    return [r.entityId, r.entityName, ...componentValues, String(r.totalPayout)];
  });

  // Summary rows
  const summaryRows = [
    [],
    ['Summary'],
    ['Tenant', metadata.tenantName],
    ['Period', metadata.periodId],
    ['State', metadata.batchState],
    ['Total Entities', String(results.length)],
    ['Total Outcome', String(results.reduce((sum, r) => sum + r.totalPayout, 0))],
    ['Currency', metadata.currency],
    ['Exported At', new Date().toISOString()],
  ];

  const allRows = [headers, ...dataRows, ...summaryRows];

  return allRows
    .map(row =>
      row.map(cell => {
        const s = String(cell);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }).join(',')
    )
    .join('\n');
}
