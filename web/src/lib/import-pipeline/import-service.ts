/**
 * Import Service
 *
 * Orchestrates the full import pipeline:
 * Ingest → Validate → Classify → Summary → Approve → Commit
 */

import type { ParsedFile } from './file-parser';
import type { FieldMapping } from './smart-mapper';
import { saveMappingHistory } from './smart-mapper';
import { recordUserConfirmation } from '@/lib/intelligence/classification-signal-service';
import type {
  ImportBatch,
  ImportBatchSummary,
  RawRecord,
  TransformedRecord,
  AnomalyFlag,
} from '../data-architecture/types';
// Stubs for deleted data-layer-service -- Supabase data-service handles real imports
/* eslint-disable @typescript-eslint/no-unused-vars */
function createRawRecords(_batch: ImportBatch, _records: unknown[]): void {}
async function transformRecords(_batchId: string, _pipeline: unknown, _userId: string): Promise<void> {}
function commitRecords(_batchId: string, _approvalRef: string, _userId: string, _recordIds?: string[]): void {}
function getTransformedRecordsByBatch(_batchId: string): TransformedRecord[] { return []; }
function getImportBatch(_batchId: string): ImportBatch | null { return null; }
function updateBatchStatus(_batchId: string, _status: string, _approvalId?: string): void {}
function rollbackBatch(_batchId: string, _reason: string, _userId: string): { success: boolean; message: string; recordsAffected: number } { return { success: false, message: 'Supabase migration pending', recordsAffected: 0 }; }
/* eslint-enable @typescript-eslint/no-unused-vars */
import { getDefaultPipeline } from '../data-architecture/transform-pipeline';
import { createApprovalRequest } from '../approval-routing/approval-service';
import type { ApprovalContext } from '../approval-routing/types';

// ============================================
// TYPES
// ============================================

export interface ImportConfig {
  tenantId: string;
  userId: string;
  sourceSystem: string;
  mappings: FieldMapping[];
  skipValidation?: boolean;
  autoApprove?: boolean;
  autoApproveThreshold?: number; // Impact rating threshold for auto-approval
}

export interface ImportResult {
  batch: ImportBatch;
  summary: ImportBatchSummary;
  requiresApproval: boolean;
  approvalId?: string;
}

export interface ClassifiedRecords {
  clean: TransformedRecord[];
  autoCorrected: TransformedRecord[];
  quarantined: TransformedRecord[];
  rejected: TransformedRecord[];
}

// ============================================
// MAIN IMPORT FLOW
// ============================================

/**
 * Initiate a full import from parsed file
 */
export async function initiateImport(
  parsed: ParsedFile,
  config: ImportConfig
): Promise<ImportResult> {
  // Step 1: Create import batch
  const batch = createImportBatch(config, parsed);

  // Step 2: Map and create raw records
  const rawRecords = createMappedRawRecords(parsed, config, batch.id);
  createRawRecords(batch, rawRecords);

  // Step 3: Transform records through pipeline
  const pipeline = getDefaultPipeline();
  await transformRecords(batch.id, pipeline, config.userId);

  // Step 4: Calculate summary
  const summary = calculateImportSummary(batch.id);

  // Step 5: Update batch with summary
  const updatedBatch = getImportBatch(batch.id);
  if (updatedBatch) {
    updatedBatch.summary = summary;
  }

  // Step 6: Determine if approval is needed
  const impactRating = calculateImportImpact(summary);
  const requiresApproval =
    !config.autoApprove ||
    impactRating > (config.autoApproveThreshold || 5);

  let approvalId: string | undefined;

  if (requiresApproval) {
    // Create approval request
    const approvalContext: ApprovalContext = {
      domain: 'import_batch',
      tenantId: config.tenantId,
      requestedBy: config.userId,
      summary: {
        title: `Import Batch #${batch.id.slice(-6)}`,
        titleEs: `Lote de Importación #${batch.id.slice(-6)}`,
        description: `${summary.totalRecords} records from ${config.sourceSystem}`,
        descriptionEs: `${summary.totalRecords} registros de ${config.sourceSystem}`,
        actionType: `Import ${summary.totalRecords} records`,
        actionTypeEs: `Importar ${summary.totalRecords} registros`,
      },
      sourceEntityId: batch.id,
      sourceEntityType: 'import_batch',
      financialAmount: summary.financialImpact?.totalCompensationValue || 0,
      currency: summary.financialImpact?.currency || 'USD',
      affectedEmployees: summary.financialImpact?.affectedEmployees || 0,
      affectedPeriods: summary.financialImpact?.affectedPeriods || [],
    };

    const approval = createApprovalRequest(approvalContext);
    approvalId = approval.id;
    updateBatchStatus(batch.id, 'awaiting_approval', approvalId);
  } else {
    // Auto-approve and commit
    commitRecords(batch.id, 'auto-approved', config.userId);
    updateBatchStatus(batch.id, 'approved');
  }

  // Save mapping history for learning
  saveMappingHistory(config.tenantId, config.sourceSystem, config.mappings);

  // OB-39: Record classification signals from confirmed import mappings
  for (const mapping of config.mappings) {
    if (mapping.targetField) {
      recordUserConfirmation(config.tenantId, 'import', mapping.sourceField, mapping.targetField, {
        sourceSystem: config.sourceSystem,
      });
    }
  }

  return {
    batch: getImportBatch(batch.id) || batch,
    summary,
    requiresApproval,
    approvalId,
  };
}

// ============================================
// BATCH CREATION
// ============================================

function createImportBatch(config: ImportConfig, parsed: ParsedFile): ImportBatch {
  return {
    id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tenantId: config.tenantId,
    sourceSystem: config.sourceSystem,
    sourceFormat: parsed.format,
    fileName: parsed.metadata.fileName,
    importedAt: new Date().toISOString(),
    importedBy: config.userId,
    status: 'processing',
    summary: {
      totalRecords: parsed.rowCount,
      cleanRecords: 0,
      autoCorrectedRecords: 0,
      quarantinedRecords: 0,
      rejectedRecords: 0,
      dataQualityScore: 0,
      anomalyFlags: [],
    },
  };
}

// ============================================
// RECORD MAPPING
// ============================================

function createMappedRawRecords(
  parsed: ParsedFile,
  config: ImportConfig,
  batchId: string
): Omit<RawRecord, 'id' | 'checksum'>[] {
  const mappingLookup = new Map<string, string>();
  for (const mapping of config.mappings) {
    if (mapping.targetField) {
      mappingLookup.set(mapping.sourceField, mapping.targetField);
    }
  }

  return parsed.rows.map((row, index) => {
    // Map fields according to mapping configuration
    const mappedContent: Record<string, unknown> = {};

    for (const [sourceField, value] of Object.entries(row)) {
      const targetField = mappingLookup.get(sourceField);
      if (targetField) {
        mappedContent[targetField] = value;
      } else {
        // Keep unmapped fields with original name
        mappedContent[sourceField] = value;
      }
    }

    return {
      importBatchId: batchId,
      sourceSystem: config.sourceSystem,
      sourceFormat: parsed.format,
      receivedAt: new Date().toISOString(),
      rawContent: mappedContent,
      metadata: {
        fileName: parsed.metadata.fileName,
        fileRow: index + 2, // +2 for header row and 1-indexing
        receivedBy: config.userId,
      },
    };
  });
}

// ============================================
// SUMMARY CALCULATION
// ============================================

function calculateImportSummary(batchId: string): ImportBatchSummary {
  const transformedRecords = getTransformedRecordsByBatch(batchId);

  const clean = transformedRecords.filter((r) => r.classification === 'clean');
  const autoCorrected = transformedRecords.filter((r) => r.classification === 'auto_corrected');
  const quarantined = transformedRecords.filter((r) => r.classification === 'quarantined');
  const rejected = transformedRecords.filter((r) => r.classification === 'rejected');

  const total = transformedRecords.length;
  const qualityScore =
    total > 0
      ? Math.round(((clean.length + autoCorrected.length * 0.8) / total) * 100)
      : 0;

  // Calculate financial impact
  const financialImpact = calculateFinancialImpact(transformedRecords);

  // Detect anomalies
  const anomalyFlags = detectAnomalies(transformedRecords);

  return {
    totalRecords: total,
    cleanRecords: clean.length,
    autoCorrectedRecords: autoCorrected.length,
    quarantinedRecords: quarantined.length,
    rejectedRecords: rejected.length,
    dataQualityScore: qualityScore,
    financialImpact,
    anomalyFlags,
  };
}

function calculateFinancialImpact(records: TransformedRecord[]): ImportBatchSummary['financialImpact'] {
  let totalValue = 0;
  const employees = new Set<string>();
  const periods = new Set<string>();
  let currency = 'USD';

  for (const record of records) {
    const amount = record.content.amount;
    if (typeof amount === 'number') {
      totalValue += amount;
    }

    const repId = record.content.repId;
    if (typeof repId === 'string') {
      employees.add(repId);
    }

    const period = record.content.fiscalPeriod;
    if (typeof period === 'string') {
      periods.add(period);
    }

    const curr = record.content.currency;
    if (typeof curr === 'string') {
      currency = curr;
    }
  }

  return {
    totalCompensationValue: totalValue,
    currency,
    affectedEmployees: employees.size,
    affectedPeriods: Array.from(periods),
  };
}

function detectAnomalies(records: TransformedRecord[]): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];

  // Volume check
  if (records.length > 1000) {
    flags.push({
      type: 'volume_spike',
      severity: 'warning',
      message: `Large import: ${records.length} records`,
      affectedRecords: records.length,
    });
  }

  // Value outliers
  const amounts = records
    .map((r) => r.content.amount)
    .filter((a): a is number => typeof a === 'number');

  if (amounts.length > 0) {
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const highOutliers = amounts.filter((a) => a > avg * 3).length;

    if (highOutliers > 0) {
      flags.push({
        type: 'value_outlier',
        severity: 'warning',
        message: `${highOutliers} records with amounts 3x above average`,
        affectedRecords: highOutliers,
      });
    }
  }

  // Duplicate detection
  const dedupeKeys = records
    .map((r) => r.content._dedupeKey)
    .filter((k): k is string => typeof k === 'string');

  const duplicateCount = dedupeKeys.length - new Set(dedupeKeys).size;
  if (duplicateCount > 0) {
    flags.push({
      type: 'duplicate_detected',
      severity: 'warning',
      message: `${duplicateCount} potential duplicate records detected`,
      affectedRecords: duplicateCount,
    });
  }

  return flags;
}

function calculateImportImpact(summary: ImportBatchSummary): number {
  // Simple impact calculation based on summary metrics
  let impact = 1;

  // Volume impact
  if (summary.totalRecords > 1000) impact += 2;
  else if (summary.totalRecords > 500) impact += 1;

  // Financial impact
  const financialValue = summary.financialImpact?.totalCompensationValue || 0;
  if (financialValue > 100000) impact += 3;
  else if (financialValue > 50000) impact += 2;
  else if (financialValue > 10000) impact += 1;

  // Quality impact
  if (summary.dataQualityScore < 70) impact += 2;
  else if (summary.dataQualityScore < 85) impact += 1;

  // Anomaly impact
  const criticalAnomalies = summary.anomalyFlags.filter((f) => f.severity === 'critical').length;
  impact += criticalAnomalies * 2;

  return Math.min(10, impact);
}

// ============================================
// APPROVAL ACTIONS
// ============================================

/**
 * Approve an import batch
 */
export function approveImport(
  batchId: string,
  userId: string,
  recordIds?: string[]
): boolean {
  const batch = getImportBatch(batchId);
  if (!batch || batch.status !== 'awaiting_approval') {
    return false;
  }

  commitRecords(batchId, batch.approvalId || 'manual-approval', userId, recordIds);
  updateBatchStatus(batchId, recordIds ? 'partially_approved' : 'approved');

  return true;
}

/**
 * Reject an import batch
 */
export function rejectImport(batchId: string, userId: string, reason: string): boolean {
  const batch = getImportBatch(batchId);
  if (!batch || batch.status !== 'awaiting_approval') {
    return false;
  }

  updateBatchStatus(batchId, 'rejected');

  // Audit log would be added here
  console.log(`Import batch ${batchId} rejected by ${userId}: ${reason}`);

  return true;
}

/**
 * Rollback an approved import
 */
export function rollbackImport(
  batchId: string,
  userId: string,
  reason: string
): { success: boolean; message: string } {
  const result = rollbackBatch(batchId, reason, userId);

  if (result.success) {
    return {
      success: true,
      message: `Rolled back ${result.recordsAffected} records`,
    };
  }

  return {
    success: false,
    message: result.message,
  };
}

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get import summary for a batch
 */
export function getImportSummary(batchId: string): ImportBatchSummary | null {
  const batch = getImportBatch(batchId);
  return batch?.summary || null;
}

/**
 * Get classified records for review
 */
export function getClassifiedRecords(batchId: string): ClassifiedRecords {
  const records = getTransformedRecordsByBatch(batchId);

  return {
    clean: records.filter((r) => r.classification === 'clean'),
    autoCorrected: records.filter((r) => r.classification === 'auto_corrected'),
    quarantined: records.filter((r) => r.classification === 'quarantined'),
    rejected: records.filter((r) => r.classification === 'rejected'),
  };
}

/**
 * Get records for a specific classification
 */
export function getRecordsByClassification(
  batchId: string,
  classification: 'clean' | 'auto_corrected' | 'quarantined' | 'rejected'
): TransformedRecord[] {
  const records = getTransformedRecordsByBatch(batchId);
  return records.filter((r) => r.classification === classification);
}
