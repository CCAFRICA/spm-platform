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

export function getAllDisputes(tenantId: string): Dispute[] {
  const defaults = getDefaultDisputes();
  return defaults.filter((d) => d.tenantId === tenantId);
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
  return getDefaultDisputes();
}

// Pre-populated disputes for demo
function getDefaultDisputes(): Dispute[] {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  return [
    // Draft dispute for Maria (can continue through flow)
    {
      id: 'dispute-maria-txn0147',
      tenantId: 'retailco',
      transactionId: 'TXN-2025-0147',
      entityId: 'maria-rodriguez',
      entityName: 'Maria Rodriguez',
      storeId: 'store-101',
      storeName: 'Downtown Flagship',
      status: 'draft',
      category: 'wrong_attribution',
      component: 'comp-insurance',
      stepsCompleted: 0,
      resolvedAtStep: null,
      stepTimestamps: {
        step1StartedAt: now.toISOString(),
      },
      expectedAmount: 42.5,
      actualAmount: 0,
      difference: 42.5,
      justification: '',
      attachedTransactionIds: ['TXN-2025-0147'],
      attributionDetails: {
        shouldBeCreditedTo: 'maria-rodriguez',
        shouldBeCreditedToName: 'Maria Rodriguez',
        currentlyCreditedTo: 'james-wilson',
        currentlyCreditedToName: 'James Wilson',
        requestedSplit: { 'maria-rodriguez': 0.5, 'james-wilson': 0.5 },
      },
      resolution: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      submittedAt: null,
      resolvedAt: null,
    },
    // Submitted dispute (for manager to review)
    {
      id: 'dispute-maria-txn0098',
      tenantId: 'retailco',
      transactionId: 'TXN-2025-0098',
      entityId: 'maria-rodriguez',
      entityName: 'Maria Rodriguez',
      storeId: 'store-101',
      storeName: 'Downtown Flagship',
      status: 'submitted',
      category: 'wrong_attribution',
      component: 'comp-insurance',
      stepsCompleted: 3,
      resolvedAtStep: null,
      stepTimestamps: {
        step1StartedAt: twoDaysAgo.toISOString(),
        step1CompletedAt: twoDaysAgo.toISOString(),
        step2StartedAt: twoDaysAgo.toISOString(),
        step2CompletedAt: yesterday.toISOString(),
        step3StartedAt: yesterday.toISOString(),
        step3CompletedAt: yesterday.toISOString(),
      },
      expectedAmount: 42.5,
      actualAmount: 0,
      difference: 42.5,
      justification: 'I assisted the customer for 20 minutes with product demo and needs assessment before James completed the sale. Per store policy for assisted sales, I should receive 50% credit for this transaction.',
      attachedTransactionIds: ['TXN-2025-0098'],
      attributionDetails: {
        shouldBeCreditedTo: 'maria-rodriguez',
        shouldBeCreditedToName: 'Maria Rodriguez',
        currentlyCreditedTo: 'james-wilson',
        currentlyCreditedToName: 'James Wilson',
        requestedSplit: { 'maria-rodriguez': 0.5, 'james-wilson': 0.5 },
      },
      resolution: null,
      createdAt: twoDaysAgo.toISOString(),
      updatedAt: yesterday.toISOString(),
      submittedAt: yesterday.toISOString(),
      resolvedAt: null,
    },
  ];
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
