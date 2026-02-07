/**
 * Three-Layer Data Architecture Types
 *
 * Raw → Transformed → Committed data pipeline for SOC2 compliance.
 * Every data change is traceable with full audit lineage.
 */

export type DataLayerType = 'raw' | 'transformed' | 'committed';

// ============================================
// RAW LAYER — Immutable original data
// ============================================

export interface RawRecord {
  id: string;
  importBatchId: string;
  sourceSystem: string;
  sourceFormat: string; // csv, tsv, json, api, etc.
  receivedAt: string; // ISO timestamp
  rawContent: Record<string, unknown>; // Original fields exactly as received
  checksum: string; // SHA-256 of original content for integrity verification
  metadata: {
    fileName?: string;
    fileRow?: number;
    apiEndpoint?: string;
    receivedBy: string; // userId who initiated import
  };
}

// ============================================
// TRANSFORMED LAYER — Normalized with lineage
// ============================================

export interface TransformedRecord {
  id: string;
  rawRecordId: string; // Link back to Raw layer
  importBatchId: string;
  transformedAt: string;
  transformedBy: string; // 'system' or userId
  content: Record<string, unknown>; // Normalized/enriched fields
  transformations: TransformationLog[]; // Every change documented
  validationResults: ValidationResult[];
  classification: RecordClassification;
  confidenceScore?: number; // ML confidence for auto-corrections
  lineage: {
    rawChecksum: string; // Verify Raw hasn't been tampered
    transformPipelineVersion: string;
    rulesApplied: string[];
  };
}

export type RecordClassification = 'clean' | 'auto_corrected' | 'quarantined' | 'rejected';

export interface TransformationLog {
  field: string;
  originalValue: unknown;
  transformedValue: unknown;
  transformationType: TransformationType;
  rule: string; // Which rule/pipeline step applied this
  confidence?: number;
  timestamp: string;
}

export type TransformationType =
  | 'normalization'
  | 'enrichment'
  | 'correction'
  | 'conversion'
  | 'deduplication'
  | 'aggregation';

// ============================================
// COMMITTED LAYER — Approved for calculations
// ============================================

export interface CommittedRecord {
  id: string;
  transformedRecordId: string; // Link back to Transformed layer
  rawRecordId: string; // Direct link to Raw for fast audit
  importBatchId: string;
  committedAt: string;
  committedBy: string; // userId who approved
  approvalId?: string; // Link to approval routing record
  content: Record<string, unknown>; // Final approved data
  status: CommittedRecordStatus;
  rollbackInfo?: RollbackInfo;
}

export type CommittedRecordStatus = 'active' | 'rolled_back' | 'superseded';

export interface RollbackInfo {
  rolledBackAt: string;
  rolledBackBy: string;
  reason: string;
  cascadeAffected: string[]; // IDs of downstream records affected
}

// ============================================
// VALIDATION
// ============================================

export interface ValidationResult {
  field: string;
  layer: ValidationLayer;
  status: ValidationStatus;
  message: string;
  severity: ValidationSeverity;
  rule: string;
}

export type ValidationLayer = 'type_check' | 'business_rule' | 'anomaly_detection';
export type ValidationStatus = 'pass' | 'warning' | 'fail';
export type ValidationSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

// ============================================
// IMPORT BATCH
// ============================================

export interface ImportBatch {
  id: string;
  tenantId: string;
  sourceSystem: string;
  sourceFormat: string;
  fileName?: string;
  importedAt: string;
  importedBy: string;
  status: ImportBatchStatus;
  summary: ImportBatchSummary;
  approvalId?: string;
}

export type ImportBatchStatus =
  | 'processing'
  | 'awaiting_approval'
  | 'approved'
  | 'partially_approved'
  | 'rejected'
  | 'rolled_back';

export interface ImportBatchSummary {
  totalRecords: number;
  cleanRecords: number;
  autoCorrectedRecords: number;
  quarantinedRecords: number;
  rejectedRecords: number;
  dataQualityScore: number; // 0-100
  financialImpact?: FinancialImpact;
  anomalyFlags: AnomalyFlag[];
}

export interface FinancialImpact {
  totalCompensationValue: number;
  currency: string;
  affectedEmployees: number;
  affectedPeriods: string[];
}

export interface AnomalyFlag {
  type: AnomalyType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  affectedRecords: number;
  historicalComparison?: string;
}

export type AnomalyType =
  | 'volume_spike'
  | 'value_outlier'
  | 'pattern_deviation'
  | 'missing_expected'
  | 'duplicate_detected';

// ============================================
// TRANSFORM PIPELINE
// ============================================

export interface TransformPipeline {
  id: string;
  name: string;
  version: string;
  steps: TransformStep[];
}

export interface TransformStep {
  id: string;
  name: string;
  type: TransformationType;
  config: Record<string, unknown>;
  order: number;
  enabled: boolean;
}

// ============================================
// LINEAGE & AUDIT
// ============================================

export interface RecordLineage {
  raw: RawRecord;
  transformed: TransformedRecord;
  committed?: CommittedRecord;
}

export interface TimeTravelSnapshot {
  recordId: string;
  timestamp: string;
  layer: DataLayerType;
  content: Record<string, unknown>;
  status: string;
}

// ============================================
// ROLLBACK
// ============================================

export interface RollbackResult {
  success: boolean;
  batchId: string;
  recordsAffected: number;
  cascadeAffected: CascadeAffectedItem[];
  rollbackTimestamp: string;
  message: string;
}

export interface CascadeAffectedItem {
  type: 'calculation' | 'payout' | 'adjustment' | 'report';
  id: string;
  description: string;
  status: 'flagged' | 'recalculated' | 'invalidated';
}

export interface Checkpoint {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  snapshotData: {
    batchIds: string[];
    recordCounts: {
      raw: number;
      transformed: number;
      committed: number;
    };
  };
}
