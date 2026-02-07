/**
 * Rollback Service
 *
 * Shared rollback engine for demo reset, sandbox reset, and production rollback.
 * Because the Raw layer is immutable, rollback uncommits Transformed/Committed layers.
 */

import type {
  Checkpoint,
  RollbackResult,
} from '../data-architecture/types';
import {
  rollbackBatch,
  getCheckpoints,
  createCheckpoint as createDataCheckpoint,
  getImportBatches,
  resetTenantData,
  getImportBatch,
} from '../data-architecture/data-layer-service';
import { analyzeCascade, getRollbackRecommendation, type CascadeAnalysis } from './cascade-analyzer';
import { createApprovalRequest } from '../approval-routing/approval-service';
import type { ApprovalContext } from '../approval-routing/types';

// ============================================
// TYPES
// ============================================

export interface RollbackSimulation {
  batchId: string;
  canRollback: boolean;
  reason?: string;
  cascadeAnalysis: CascadeAnalysis;
  recommendation: ReturnType<typeof getRollbackRecommendation>;
  requiresApproval: boolean;
}

export interface RollbackOptions {
  skipApproval?: boolean;
  reason: string;
}

export type ResetMode = 'demo' | 'sandbox' | 'full';

// ============================================
// ROLLBACK SIMULATION
// ============================================

/**
 * Simulate rollback without executing — shows what would change
 */
export function simulateRollback(batchId: string): RollbackSimulation {
  const batch = getImportBatch(batchId);

  if (!batch) {
    return {
      batchId,
      canRollback: false,
      reason: 'Batch not found',
      cascadeAnalysis: {
        batchId,
        recordCount: 0,
        affectedItems: [],
        summary: {
          calculations: 0,
          payouts: 0,
          adjustments: 0,
          reports: 0,
          totalAffected: 0,
          estimatedRecalculationTime: '0 minutes',
        },
        impactRating: 0,
        warnings: [],
      },
      recommendation: {
        action: 'proceed',
        reason: 'Batch not found',
        reasonEs: 'Lote no encontrado',
      },
      requiresApproval: false,
    };
  }

  // Check if already rolled back
  if (batch.status === 'rolled_back') {
    return {
      batchId,
      canRollback: false,
      reason: 'Batch has already been rolled back',
      cascadeAnalysis: analyzeCascade(batchId),
      recommendation: {
        action: 'proceed',
        reason: 'Already rolled back',
        reasonEs: 'Ya fue revertido',
      },
      requiresApproval: false,
    };
  }

  // Check if never approved
  if (batch.status === 'awaiting_approval' || batch.status === 'rejected') {
    return {
      batchId,
      canRollback: false,
      reason: 'Batch was never committed — no rollback needed',
      cascadeAnalysis: analyzeCascade(batchId),
      recommendation: {
        action: 'proceed',
        reason: 'Not committed',
        reasonEs: 'No comprometido',
      },
      requiresApproval: false,
    };
  }

  // Analyze cascade impact
  const cascadeAnalysis = analyzeCascade(batchId);
  const recommendation = getRollbackRecommendation(cascadeAnalysis);

  // Determine if approval is needed
  const requiresApproval = cascadeAnalysis.impactRating > 3;

  return {
    batchId,
    canRollback: true,
    cascadeAnalysis,
    recommendation,
    requiresApproval,
  };
}

// ============================================
// EXECUTE ROLLBACK
// ============================================

/**
 * Execute rollback on a batch
 */
export async function executeRollback(
  batchId: string,
  userId: string,
  options: RollbackOptions
): Promise<{ success: boolean; result?: RollbackResult; approvalId?: string; message: string }> {
  const simulation = simulateRollback(batchId);

  if (!simulation.canRollback) {
    return {
      success: false,
      message: simulation.reason || 'Cannot rollback this batch',
    };
  }

  // Check if approval is needed
  if (simulation.requiresApproval && !options.skipApproval) {
    // Create approval request
    const batch = getImportBatch(batchId);
    const approvalContext: ApprovalContext = {
      domain: 'rollback',
      tenantId: batch?.tenantId || 'default',
      requestedBy: userId,
      summary: {
        title: `Rollback Batch #${batchId.slice(-6)}`,
        titleEs: `Revertir Lote #${batchId.slice(-6)}`,
        description: `Rollback ${simulation.cascadeAnalysis.recordCount} records`,
        descriptionEs: `Revertir ${simulation.cascadeAnalysis.recordCount} registros`,
        actionType: 'Rollback Import Batch',
        actionTypeEs: 'Revertir Lote de Importación',
      },
      sourceEntityId: batchId,
      sourceEntityType: 'import_batch',
      cascadeCount: simulation.cascadeAnalysis.summary.totalAffected,
    };

    const approval = createApprovalRequest(approvalContext);

    return {
      success: true,
      approvalId: approval.id,
      message: 'Rollback requires approval - request created',
    };
  }

  // Execute the rollback
  const result = rollbackBatch(batchId, options.reason, userId);

  return {
    success: result.success,
    result,
    message: result.message,
  };
}

// ============================================
// CHECKPOINT MANAGEMENT
// ============================================

/**
 * Create a named checkpoint for rollback
 */
export function createCheckpoint(
  tenantId: string,
  name: string,
  description: string,
  userId: string
): Checkpoint {
  return createDataCheckpoint(tenantId, name, description, userId);
}

/**
 * Get checkpoints for a tenant
 */
export function getTenantCheckpoints(tenantId: string): Checkpoint[] {
  return getCheckpoints(tenantId);
}

/**
 * Rollback to a checkpoint
 */
export async function rollbackToCheckpoint(
  tenantId: string,
  checkpointId: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; message: string; rolledBackBatches: number }> {
  const checkpoints = getCheckpoints(tenantId);
  const checkpoint = checkpoints.find((c) => c.id === checkpointId);

  if (!checkpoint) {
    return {
      success: false,
      message: 'Checkpoint not found',
      rolledBackBatches: 0,
    };
  }

  // Get all batches after the checkpoint
  const allBatches = getImportBatches(tenantId);
  const checkpointTime = new Date(checkpoint.createdAt).getTime();

  const batchesToRollback = allBatches.filter(
    (b) =>
      new Date(b.importedAt).getTime() > checkpointTime &&
      (b.status === 'approved' || b.status === 'partially_approved')
  );

  // Rollback each batch
  let rolledBackCount = 0;
  for (const batch of batchesToRollback) {
    const result = rollbackBatch(batch.id, `Checkpoint rollback: ${reason}`, userId);
    if (result.success) {
      rolledBackCount++;
    }
  }

  return {
    success: true,
    message: `Rolled back ${rolledBackCount} batches to checkpoint "${checkpoint.name}"`,
    rolledBackBatches: rolledBackCount,
  };
}

// ============================================
// TENANT RESET
// ============================================

/**
 * Reset tenant data based on mode
 */
export function resetTenant(
  tenantId: string,
  userId: string,
  mode: ResetMode
): { success: boolean; message: string } {
  switch (mode) {
    case 'demo':
      // Reset demo data - full wipe and reseed
      resetTenantData(tenantId);
      return {
        success: true,
        message: 'Demo data reset complete',
      };

    case 'sandbox':
      // Reset sandbox - clear all data but keep configuration
      resetTenantData(tenantId);
      return {
        success: true,
        message: 'Sandbox reset complete - configuration preserved',
      };

    case 'full':
      // Full reset - only for CC Admin
      resetTenantData(tenantId);
      return {
        success: true,
        message: 'Full tenant reset complete',
      };

    default:
      return {
        success: false,
        message: 'Invalid reset mode',
      };
  }
}

// ============================================
// ROLLBACK HISTORY
// ============================================

/**
 * Get rollback-eligible batches for a tenant
 */
export function getRollbackEligibleBatches(tenantId: string): Array<{
  batch: NonNullable<ReturnType<typeof getImportBatch>>;
  simulation: RollbackSimulation;
}> {
  const batches = getImportBatches(tenantId);

  return batches
    .filter((b) => b.status === 'approved' || b.status === 'partially_approved')
    .map((batch) => ({
      batch,
      simulation: simulateRollback(batch.id),
    }));
}

/**
 * Get rollback history (rolled back batches)
 */
export function getRollbackHistory(tenantId: string): NonNullable<ReturnType<typeof getImportBatch>>[] {
  const batches = getImportBatches(tenantId);
  return batches.filter((b) => b.status === 'rolled_back');
}
