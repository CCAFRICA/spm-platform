/**
 * Dispute Service
 *
 * Manages dispute CRUD operations.
 *
 * NOTE: localStorage removed (OB-43A). Returns in-memory defaults.
 */

import type {
  Dispute,
  DisputeStatus,
  DisputeCategory,
  DisputeResolution,
  CompensationAdjustment,
} from '@/types/dispute';
import {
  notifyDisputeResolved,
  notifyDisputeSubmitted,
} from '@/lib/notifications/notification-service';

// ============================================
// DISPUTE CRUD
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getAllDisputes(_tenantId: string): Dispute[] {
  // OB-68: Demo data removed. Use getDisputesAsync() for Supabase reads.
  return [];
}

export function getDispute(disputeId: string): Dispute | null {
  const allDisputes = getAllDisputesInternal();
  return allDisputes.find((d) => d.id === disputeId) || null;
}

export function getByEmployee(entityId: string): Dispute[] {
  const allDisputes = getAllDisputesInternal();
  return allDisputes.filter((d) => d.entityId === entityId);
}

export function getByTransaction(transactionId: string): Dispute | null {
  const allDisputes = getAllDisputesInternal();
  return allDisputes.find((d) => d.transactionId === transactionId) || null;
}

export function getByStatus(tenantId: string, status: DisputeStatus): Dispute[] {
  return getAllDisputes(tenantId).filter((d) => d.status === status);
}

export function getPendingForManager(tenantId: string): Dispute[] {
  return getAllDisputes(tenantId).filter(
    (d) => d.status === 'submitted' || d.status === 'in_review'
  );
}

export function saveDispute(dispute: Dispute): Dispute {
  const updated = {
    ...dispute,
    updatedAt: new Date().toISOString(),
  };

  // localStorage removed -- save is a no-op

  return updated;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function deleteDispute(_disputeId: string): boolean {
  // localStorage removed -- no-op
  return true;
}

// ============================================
// DISPUTE WORKFLOW
// ============================================

export function createDraft(
  tenantId: string,
  transactionId: string,
  entityId: string,
  entityName: string,
  storeId: string,
  storeName: string,
  component: string
): Dispute {
  const now = new Date().toISOString();

  const draft: Dispute = {
    id: `dispute-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    tenantId,
    transactionId,
    entityId,
    entityName,
    storeId,
    storeName,
    status: 'draft',
    category: 'other',
    component,
    stepsCompleted: 0,
    resolvedAtStep: null,
    stepTimestamps: {
      step1StartedAt: now,
    },
    expectedAmount: 0,
    actualAmount: 0,
    difference: 0,
    justification: '',
    attachedTransactionIds: [transactionId],
    resolution: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    resolvedAt: null,
  };

  return saveDispute(draft);
}

export function updateDraft(disputeId: string, updates: Partial<Dispute>): Dispute | null {
  const dispute = getDispute(disputeId);
  if (!dispute || dispute.status !== 'draft') return null;

  return saveDispute({
    ...dispute,
    ...updates,
  });
}

export function completeStep(disputeId: string, stepNumber: 1 | 2 | 3): Dispute | null {
  const dispute = getDispute(disputeId);
  if (!dispute) return null;

  const now = new Date().toISOString();
  const stepKey = `step${stepNumber}CompletedAt` as keyof Dispute['stepTimestamps'];
  const nextStepKey = `step${stepNumber + 1}StartedAt` as keyof Dispute['stepTimestamps'];

  return saveDispute({
    ...dispute,
    stepsCompleted: Math.max(dispute.stepsCompleted, stepNumber),
    stepTimestamps: {
      ...dispute.stepTimestamps,
      [stepKey]: now,
      ...(stepNumber < 3 && { [nextStepKey]: now }),
    },
  });
}

export function markResolvedAtStep(disputeId: string, stepNumber: 1 | 2): Dispute | null {
  const dispute = getDispute(disputeId);
  if (!dispute) return null;

  const now = new Date().toISOString();

  return saveDispute({
    ...dispute,
    status: 'resolved',
    resolvedAtStep: stepNumber,
    resolvedAt: now,
    resolution: {
      outcome: 'denied', // Self-resolved means no payout needed
      adjustmentAmount: 0,
      explanation: `Employee understood calculation after Step ${stepNumber} explanation`,
      resolvedBy: dispute.entityId,
      resolvedByName: dispute.entityName,
      resolvedAt: now,
      adjustmentApplied: false,
    },
  });
}

export function submitDispute(disputeId: string): Dispute | null {
  const dispute = getDispute(disputeId);
  if (!dispute || dispute.status !== 'draft') return null;

  const now = new Date().toISOString();

  const updated = saveDispute({
    ...dispute,
    status: 'submitted',
    submittedAt: now,
    stepsCompleted: 3,
    stepTimestamps: {
      ...dispute.stepTimestamps,
      step3CompletedAt: now,
    },
  });

  // Notify the employee that their dispute was submitted
  notifyDisputeSubmitted(
    dispute.tenantId,
    dispute.entityId,
    dispute.id,
    dispute.transactionId
  );

  return updated;
}

export function startReview(disputeId: string): Dispute | null {
  const dispute = getDispute(disputeId);
  if (!dispute || dispute.status !== 'submitted') return null;

  return saveDispute({
    ...dispute,
    status: 'in_review',
  });
}

export function resolveDispute(
  disputeId: string,
  resolution: Omit<DisputeResolution, 'resolvedAt'>
): { dispute: Dispute; adjustment?: CompensationAdjustment } | null {
  const dispute = getDispute(disputeId);
  if (!dispute || (dispute.status !== 'submitted' && dispute.status !== 'in_review')) {
    return null;
  }

  const now = new Date().toISOString();
  const fullResolution: DisputeResolution = {
    ...resolution,
    resolvedAt: now,
  };

  const updatedDispute = saveDispute({
    ...dispute,
    status: 'resolved',
    resolvedAt: now,
    resolution: fullResolution,
  });

  // Create adjustment if approved
  let adjustment: CompensationAdjustment | undefined;
  if (resolution.outcome === 'approved' || resolution.outcome === 'partial') {
    adjustment = createAdjustment({
      tenantId: dispute.tenantId,
      disputeId: dispute.id,
      entityId: dispute.entityId,
      entityName: dispute.entityName,
      type: 'dispute_resolution',
      amount: resolution.adjustmentAmount,
      currency: 'USD',
      description: `Dispute resolution: ${resolution.explanation}`,
      period: new Date().toISOString().substring(0, 7), // Current month
      component: dispute.component,
      status: 'approved',
      createdBy: resolution.resolvedBy,
    });

    // Link adjustment to dispute
    saveDispute({
      ...updatedDispute,
      resolution: {
        ...fullResolution,
        adjustmentId: adjustment.id,
      },
    });
  }

  // Notify the employee about the resolution
  notifyDisputeResolved(
    dispute.tenantId,
    dispute.entityId,
    dispute.id,
    dispute.transactionId,
    resolution.outcome,
    resolution.adjustmentAmount
  );

  return { dispute: updatedDispute, adjustment };
}

// ============================================
// ADJUSTMENTS
// ============================================

export function createAdjustment(
  data: Omit<CompensationAdjustment, 'id' | 'createdAt' | 'appliedAt'>
): CompensationAdjustment {
  const adjustment: CompensationAdjustment = {
    ...data,
    id: `adj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    createdAt: new Date().toISOString(),
    appliedAt: null,
  };

  // localStorage removed -- adjustment save is a no-op

  return adjustment;
}

export function getAdjustmentsByEmployee(entityId: string): CompensationAdjustment[] {
  return getAllAdjustments().filter((a) => a.entityId === entityId);
}

export function getAllAdjustments(): CompensationAdjustment[] {
  // localStorage removed -- return empty
  return [];
}

// ============================================
// ANALYTICS
// ============================================

export function getDisputeStats(tenantId: string): {
  total: number;
  pending: number;
  resolved: number;
  selfResolved: number;
  byCategory: Record<DisputeCategory, number>;
  avgResolutionSteps: number;
} {
  const disputes = getAllDisputes(tenantId);

  const byCategory: Record<DisputeCategory, number> = {
    wrong_attribution: 0,
    missing_transaction: 0,
    incorrect_amount: 0,
    wrong_rate: 0,
    split_error: 0,
    timing_issue: 0,
    other: 0,
  };

  let selfResolved = 0;
  let totalSteps = 0;
  let resolvedCount = 0;

  disputes.forEach((d) => {
    byCategory[d.category]++;

    if (d.resolvedAtStep !== null) {
      selfResolved++;
      totalSteps += d.resolvedAtStep;
      resolvedCount++;
    } else if (d.status === 'resolved') {
      totalSteps += 3;
      resolvedCount++;
    }
  });

  return {
    total: disputes.length,
    pending: disputes.filter((d) => d.status === 'submitted' || d.status === 'in_review').length,
    resolved: disputes.filter((d) => d.status === 'resolved').length,
    selfResolved,
    byCategory,
    avgResolutionSteps: resolvedCount > 0 ? totalSteps / resolvedCount : 0,
  };
}

// ============================================
// HELPERS
// ============================================

function getAllDisputesInternal(): Dispute[] {
  // OB-68: No more demo data. Returns empty — use async functions for Supabase reads.
  return [];
}

// ============================================
// SUPABASE-BACKED ASYNC FUNCTIONS (OB-68)
// ============================================

/**
 * Create a dispute in Supabase via API route.
 * Returns the DB row or null on failure.
 */
export async function createDisputeAsync(params: {
  entity_id: string;
  period_id?: string;
  batch_id?: string;
  category: string;
  description: string;
  amount_disputed?: number;
}): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch('/api/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[DisputeService] Create failed:', err.error);
      return null;
    }

    const data = await response.json();
    return data.dispute;
  } catch (err) {
    console.error('[DisputeService] Create error:', err);
    return null;
  }
}

/**
 * Update dispute status/resolution via API route.
 */
export async function updateDisputeAsync(
  disputeId: string,
  updates: {
    status?: string;
    resolution?: string;
    amount_resolved?: number;
  }
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`/api/disputes/${disputeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[DisputeService] Update failed:', err.error);
      return null;
    }

    const data = await response.json();
    return data.dispute;
  } catch (err) {
    console.error('[DisputeService] Update error:', err);
    return null;
  }
}

/**
 * Fetch disputes from Supabase via API route.
 */
export async function getDisputesAsync(filters?: {
  status?: string;
  entity_id?: string;
}): Promise<Record<string, unknown>[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.entity_id) params.set('entity_id', filters.entity_id);

    const url = `/api/disputes${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();
    return data.disputes || [];
  } catch (err) {
    console.error('[DisputeService] Fetch error:', err);
    return [];
  }
}

/**
 * Fetch a single dispute by ID from Supabase via API route.
 */
export async function getDisputeAsync(
  disputeId: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`/api/disputes/${disputeId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.dispute || null;
  } catch (err) {
    console.error('[DisputeService] Fetch single error:', err);
    return null;
  }
}

// ============================================
// INITIALIZATION (no-ops, localStorage removed)
// ============================================

export function initializeDisputes(): void {
  // localStorage removed -- no-op
}

export function resetDisputes(): void {
  // localStorage removed -- no-op
}
