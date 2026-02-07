/**
 * Cascade Analyzer
 *
 * Determines blast radius of rollback operations.
 * Analyzes downstream dependencies and impact.
 */

import type { CascadeAffectedItem } from '../data-architecture/types';
import { getCommittedRecordsByBatch, getImportBatch } from '../data-architecture/data-layer-service';

export interface CascadeAnalysis {
  batchId: string;
  recordCount: number;
  affectedItems: CascadeAffectedItem[];
  summary: CascadeSummary;
  impactRating: number;
  warnings: CascadeWarning[];
}

export interface CascadeSummary {
  calculations: number;
  payouts: number;
  adjustments: number;
  reports: number;
  totalAffected: number;
  estimatedRecalculationTime: string;
}

export interface CascadeWarning {
  type: 'paid_period' | 'approved_payout' | 'locked_record' | 'external_sync';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  messageEs: string;
  affectedCount: number;
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

/**
 * Analyze cascade impact of rolling back a batch
 */
export function analyzeCascade(batchId: string): CascadeAnalysis {
  const batch = getImportBatch(batchId);
  const committedRecords = getCommittedRecordsByBatch(batchId);

  if (!batch) {
    return createEmptyAnalysis(batchId);
  }

  // Analyze downstream dependencies
  const affectedItems = analyzeDownstreamDependencies(batchId, committedRecords.length);

  // Generate summary
  const summary = summarizeAffectedItems(affectedItems);

  // Calculate impact rating
  const impactRating = calculateCascadeImpact(summary, committedRecords.length);

  // Generate warnings
  const warnings = generateWarnings(batch, committedRecords.length);

  return {
    batchId,
    recordCount: committedRecords.length,
    affectedItems,
    summary,
    impactRating,
    warnings,
  };
}

// ============================================
// DOWNSTREAM ANALYSIS
// ============================================

function analyzeDownstreamDependencies(
  batchId: string,
  recordCount: number
): CascadeAffectedItem[] {
  const items: CascadeAffectedItem[] = [];

  // Simulate calculation dependencies
  // In real implementation, this would query actual calculation records
  const calculationCount = Math.floor(recordCount * 1.2); // Assume 1.2 calculations per record
  if (calculationCount > 0) {
    items.push({
      type: 'calculation',
      id: `calc-${batchId}`,
      description: `${calculationCount} commission calculations based on this batch`,
      status: 'flagged',
    });
  }

  // Simulate payout dependencies
  const payoutCount = Math.floor(recordCount / 10); // Assume 1 payout per 10 records
  if (payoutCount > 0) {
    items.push({
      type: 'payout',
      id: `payout-${batchId}`,
      description: `${payoutCount} pending payouts affected`,
      status: 'flagged',
    });
  }

  // Simulate adjustment dependencies
  const adjustmentCount = Math.floor(recordCount / 20);
  if (adjustmentCount > 0) {
    items.push({
      type: 'adjustment',
      id: `adj-${batchId}`,
      description: `${adjustmentCount} manual adjustments linked`,
      status: 'flagged',
    });
  }

  // Simulate report dependencies
  items.push({
    type: 'report',
    id: `report-${batchId}`,
    description: 'Monthly commission report will need regeneration',
    status: 'invalidated',
  });

  return items;
}

// ============================================
// SUMMARY GENERATION
// ============================================

function summarizeAffectedItems(items: CascadeAffectedItem[]): CascadeSummary {
  const summary: CascadeSummary = {
    calculations: 0,
    payouts: 0,
    adjustments: 0,
    reports: 0,
    totalAffected: 0,
    estimatedRecalculationTime: '0 minutes',
  };

  for (const item of items) {
    switch (item.type) {
      case 'calculation':
        summary.calculations++;
        break;
      case 'payout':
        summary.payouts++;
        break;
      case 'adjustment':
        summary.adjustments++;
        break;
      case 'report':
        summary.reports++;
        break;
    }
    summary.totalAffected++;
  }

  // Estimate recalculation time
  const totalWork = summary.calculations + summary.payouts * 5 + summary.adjustments * 2;
  if (totalWork < 100) {
    summary.estimatedRecalculationTime = 'Less than 1 minute';
  } else if (totalWork < 1000) {
    summary.estimatedRecalculationTime = '1-5 minutes';
  } else if (totalWork < 10000) {
    summary.estimatedRecalculationTime = '5-15 minutes';
  } else {
    summary.estimatedRecalculationTime = '15+ minutes';
  }

  return summary;
}

// ============================================
// IMPACT CALCULATION
// ============================================

function calculateCascadeImpact(summary: CascadeSummary, recordCount: number): number {
  let impact = 1;

  // Record count impact
  if (recordCount > 1000) impact += 2;
  else if (recordCount > 500) impact += 1;

  // Calculation impact
  if (summary.calculations > 100) impact += 2;
  else if (summary.calculations > 10) impact += 1;

  // Payout impact (higher weight)
  if (summary.payouts > 10) impact += 3;
  else if (summary.payouts > 0) impact += 2;

  // Adjustment impact
  if (summary.adjustments > 5) impact += 1;

  return Math.min(10, impact);
}

// ============================================
// WARNING GENERATION
// ============================================

function generateWarnings(
  batch: NonNullable<ReturnType<typeof getImportBatch>>,
  recordCount: number
): CascadeWarning[] {
  const warnings: CascadeWarning[] = [];

  // Check for paid period warning
  if (batch.summary.financialImpact?.affectedPeriods?.some((p) => p.includes('Q'))) {
    warnings.push({
      type: 'paid_period',
      severity: 'critical',
      message: 'This batch includes records from periods that may have been paid',
      messageEs: 'Este lote incluye registros de períodos que pueden haber sido pagados',
      affectedCount: recordCount,
    });
  }

  // Check for large batch warning
  if (recordCount > 500) {
    warnings.push({
      type: 'locked_record',
      severity: 'warning',
      message: `Large batch with ${recordCount} records - rollback will take longer`,
      messageEs: `Lote grande con ${recordCount} registros - la reversión tomará más tiempo`,
      affectedCount: recordCount,
    });
  }

  // Add external sync warning if applicable
  if (batch.sourceSystem && batch.sourceSystem !== 'csv_export') {
    warnings.push({
      type: 'external_sync',
      severity: 'info',
      message: `Data was imported from ${batch.sourceSystem} - external system will not be notified`,
      messageEs: `Datos importados de ${batch.sourceSystem} - el sistema externo no será notificado`,
      affectedCount: recordCount,
    });
  }

  return warnings;
}

// ============================================
// HELPERS
// ============================================

function createEmptyAnalysis(batchId: string): CascadeAnalysis {
  return {
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
    impactRating: 1,
    warnings: [],
  };
}

/**
 * Check if rollback is safe (no critical warnings)
 */
export function isRollbackSafe(analysis: CascadeAnalysis): boolean {
  return !analysis.warnings.some((w) => w.severity === 'critical');
}

/**
 * Get rollback recommendation based on analysis
 */
export function getRollbackRecommendation(analysis: CascadeAnalysis): {
  action: 'proceed' | 'review' | 'escalate';
  reason: string;
  reasonEs: string;
} {
  if (analysis.warnings.some((w) => w.severity === 'critical')) {
    return {
      action: 'escalate',
      reason: 'Critical warnings detected - requires senior approval',
      reasonEs: 'Advertencias críticas detectadas - requiere aprobación senior',
    };
  }

  if (analysis.impactRating >= 7) {
    return {
      action: 'review',
      reason: 'High impact rollback - careful review recommended',
      reasonEs: 'Reversión de alto impacto - se recomienda revisión cuidadosa',
    };
  }

  if (analysis.impactRating >= 4) {
    return {
      action: 'review',
      reason: 'Moderate impact - review downstream effects',
      reasonEs: 'Impacto moderado - revisar efectos derivados',
    };
  }

  return {
    action: 'proceed',
    reason: 'Low impact rollback - safe to proceed',
    reasonEs: 'Reversión de bajo impacto - seguro proceder',
  };
}
