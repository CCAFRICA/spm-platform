/**
 * Data Layer Service
 *
 * Manages CRUD operations across Raw → Transformed → Committed layers.
 * Uses in-memory storage with localStorage persistence for demo.
 */

import type {
  RawRecord,
  TransformedRecord,
  CommittedRecord,
  ImportBatch,
  RecordLineage,
  TimeTravelSnapshot,
  RollbackResult,
  TransformPipeline,
  Checkpoint,
} from './types';
import { runTransformPipeline } from './transform-pipeline';

// Storage keys
const STORAGE_KEYS = {
  RAW: 'data_layer_raw',
  TRANSFORMED: 'data_layer_transformed',
  COMMITTED: 'data_layer_committed',
  BATCHES: 'data_layer_batches',
  CHECKPOINTS: 'data_layer_checkpoints',
} as const;

// In-memory cache
const memoryCache = {
  raw: new Map<string, RawRecord>(),
  transformed: new Map<string, TransformedRecord>(),
  committed: new Map<string, CommittedRecord>(),
  batches: new Map<string, ImportBatch>(),
  checkpoints: new Map<string, Checkpoint>(),
};

// ============================================
// INITIALIZATION
// ============================================

function loadFromStorage<T>(key: string): Map<string, T> {
  if (typeof window === 'undefined') return new Map();

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return new Map();
    const entries: [string, T][] = JSON.parse(stored);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function saveToStorage<T>(key: string, map: Map<string, T>): void {
  if (typeof window === 'undefined') return;

  try {
    const entries = Array.from(map.entries());
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Storage full - try to clean up old entries
    console.warn('Storage full, clearing old data layer entries');
  }
}

export function initializeDataLayer(): void {
  memoryCache.raw = loadFromStorage<RawRecord>(STORAGE_KEYS.RAW);
  memoryCache.transformed = loadFromStorage<TransformedRecord>(STORAGE_KEYS.TRANSFORMED);
  memoryCache.committed = loadFromStorage<CommittedRecord>(STORAGE_KEYS.COMMITTED);
  memoryCache.batches = loadFromStorage<ImportBatch>(STORAGE_KEYS.BATCHES);
  memoryCache.checkpoints = loadFromStorage<Checkpoint>(STORAGE_KEYS.CHECKPOINTS);
}

function persistAll(): void {
  saveToStorage(STORAGE_KEYS.RAW, memoryCache.raw);
  saveToStorage(STORAGE_KEYS.TRANSFORMED, memoryCache.transformed);
  saveToStorage(STORAGE_KEYS.COMMITTED, memoryCache.committed);
  saveToStorage(STORAGE_KEYS.BATCHES, memoryCache.batches);
  saveToStorage(STORAGE_KEYS.CHECKPOINTS, memoryCache.checkpoints);
}

// ============================================
// RAW LAYER OPERATIONS
// ============================================

/**
 * Generate SHA-256-like checksum for content verification
 */
function generateChecksum(content: Record<string, unknown>): string {
  const str = JSON.stringify(content);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Store immutable raw records from an import batch
 */
export function createRawRecords(
  batch: ImportBatch,
  records: Omit<RawRecord, 'id' | 'checksum'>[]
): RawRecord[] {
  const rawRecords: RawRecord[] = records.map((record, index) => ({
    ...record,
    id: `raw-${batch.id}-${index}`,
    checksum: generateChecksum(record.rawContent),
  }));

  rawRecords.forEach((record) => {
    memoryCache.raw.set(record.id, record);
  });

  memoryCache.batches.set(batch.id, batch);
  persistAll();

  return rawRecords;
}

/**
 * Get raw record by ID
 */
export function getRawRecord(id: string): RawRecord | null {
  return memoryCache.raw.get(id) || null;
}

/**
 * Get all raw records for a batch
 */
export function getRawRecordsByBatch(batchId: string): RawRecord[] {
  return Array.from(memoryCache.raw.values()).filter(
    (record) => record.importBatchId === batchId
  );
}

// ============================================
// TRANSFORMED LAYER OPERATIONS
// ============================================

/**
 * Run transformation pipeline on raw records, create transformed records with full lineage
 */
export async function transformRecords(
  batchId: string,
  pipeline: TransformPipeline,
  userId: string = 'system'
): Promise<TransformedRecord[]> {
  const rawRecords = getRawRecordsByBatch(batchId);
  const transformedRecords: TransformedRecord[] = [];

  for (const rawRecord of rawRecords) {
    const result = await runTransformPipeline(rawRecord, pipeline);

    const transformedRecord: TransformedRecord = {
      id: `trans-${rawRecord.id}`,
      rawRecordId: rawRecord.id,
      importBatchId: batchId,
      transformedAt: new Date().toISOString(),
      transformedBy: userId,
      content: result.content,
      transformations: result.transformations,
      validationResults: result.validationResults,
      classification: result.classification,
      confidenceScore: result.confidenceScore,
      lineage: {
        rawChecksum: rawRecord.checksum,
        transformPipelineVersion: pipeline.version,
        rulesApplied: result.rulesApplied,
      },
    };

    memoryCache.transformed.set(transformedRecord.id, transformedRecord);
    transformedRecords.push(transformedRecord);
  }

  // Update batch status
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    const summary = calculateBatchSummary(transformedRecords);
    batch.summary = summary;
    batch.status = 'awaiting_approval';
    memoryCache.batches.set(batchId, batch);
  }

  persistAll();
  return transformedRecords;
}

/**
 * Get transformed record by ID
 */
export function getTransformedRecord(id: string): TransformedRecord | null {
  return memoryCache.transformed.get(id) || null;
}

/**
 * Get all transformed records for a batch
 */
export function getTransformedRecordsByBatch(batchId: string): TransformedRecord[] {
  return Array.from(memoryCache.transformed.values()).filter(
    (record) => record.importBatchId === batchId
  );
}

function calculateBatchSummary(records: TransformedRecord[]): ImportBatch['summary'] {
  const clean = records.filter((r) => r.classification === 'clean').length;
  const autoCorrected = records.filter((r) => r.classification === 'auto_corrected').length;
  const quarantined = records.filter((r) => r.classification === 'quarantined').length;
  const rejected = records.filter((r) => r.classification === 'rejected').length;

  const qualityScore = Math.round(
    ((clean + autoCorrected * 0.8) / records.length) * 100
  );

  return {
    totalRecords: records.length,
    cleanRecords: clean,
    autoCorrectedRecords: autoCorrected,
    quarantinedRecords: quarantined,
    rejectedRecords: rejected,
    dataQualityScore: qualityScore,
    anomalyFlags: [],
  };
}

// ============================================
// COMMITTED LAYER OPERATIONS
// ============================================

/**
 * Commit approved records (all or selective by IDs)
 */
export function commitRecords(
  batchId: string,
  approvalId: string,
  userId: string,
  recordIds?: string[]
): CommittedRecord[] {
  const transformedRecords = getTransformedRecordsByBatch(batchId);
  const toCommit = recordIds
    ? transformedRecords.filter((r) => recordIds.includes(r.id))
    : transformedRecords.filter(
        (r) => r.classification === 'clean' || r.classification === 'auto_corrected'
      );

  const committedRecords: CommittedRecord[] = toCommit.map((transformed) => ({
    id: `commit-${transformed.id}`,
    transformedRecordId: transformed.id,
    rawRecordId: transformed.rawRecordId,
    importBatchId: batchId,
    committedAt: new Date().toISOString(),
    committedBy: userId,
    approvalId,
    content: transformed.content,
    status: 'active' as const,
  }));

  committedRecords.forEach((record) => {
    memoryCache.committed.set(record.id, record);
  });

  // Update batch status
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    const allTransformed = getTransformedRecordsByBatch(batchId);
    const committableCount = allTransformed.filter(
      (r) => r.classification === 'clean' || r.classification === 'auto_corrected'
    ).length;

    if (committedRecords.length === committableCount) {
      batch.status = 'approved';
    } else if (committedRecords.length > 0) {
      batch.status = 'partially_approved';
    }
    batch.approvalId = approvalId;
    memoryCache.batches.set(batchId, batch);
  }

  persistAll();
  return committedRecords;
}

/**
 * Get committed record by ID
 */
export function getCommittedRecord(id: string): CommittedRecord | null {
  return memoryCache.committed.get(id) || null;
}

/**
 * Get all committed records for a batch
 */
export function getCommittedRecordsByBatch(batchId: string): CommittedRecord[] {
  return Array.from(memoryCache.committed.values()).filter(
    (record) => record.importBatchId === batchId
  );
}

/**
 * Get all active committed records for a tenant
 */
export function getActiveCommittedRecords(tenantId: string): CommittedRecord[] {
  const tenantBatchIds = Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .map((b) => b.id);

  return Array.from(memoryCache.committed.values()).filter(
    (record) =>
      tenantBatchIds.includes(record.importBatchId) && record.status === 'active'
  );
}

// ============================================
// LINEAGE & TIME TRAVEL
// ============================================

/**
 * Get full provenance chain for a committed record
 */
export function getRecordLineage(committedRecordId: string): RecordLineage | null {
  const committed = memoryCache.committed.get(committedRecordId);
  if (!committed) return null;

  const transformed = memoryCache.transformed.get(committed.transformedRecordId);
  if (!transformed) return null;

  const raw = memoryCache.raw.get(transformed.rawRecordId);
  if (!raw) return null;

  return { raw, transformed, committed };
}

/**
 * View record state at any point in time
 */
export function getTimeTravelView(
  recordId: string,
  timestamp: string
): TimeTravelSnapshot | null {
  const targetTime = new Date(timestamp).getTime();

  // Check committed first
  const committed = Array.from(memoryCache.committed.values()).find(
    (r) =>
      (r.id === recordId || r.rawRecordId === recordId) &&
      new Date(r.committedAt).getTime() <= targetTime
  );

  if (committed) {
    return {
      recordId: committed.id,
      timestamp,
      layer: 'committed',
      content: committed.content,
      status: committed.status,
    };
  }

  // Check transformed
  const transformed = Array.from(memoryCache.transformed.values()).find(
    (r) =>
      (r.id === recordId || r.rawRecordId === recordId) &&
      new Date(r.transformedAt).getTime() <= targetTime
  );

  if (transformed) {
    return {
      recordId: transformed.id,
      timestamp,
      layer: 'transformed',
      content: transformed.content,
      status: transformed.classification,
    };
  }

  // Fall back to raw
  const raw = memoryCache.raw.get(recordId);
  if (raw && new Date(raw.receivedAt).getTime() <= targetTime) {
    return {
      recordId: raw.id,
      timestamp,
      layer: 'raw',
      content: raw.rawContent,
      status: 'received',
    };
  }

  return null;
}

// ============================================
// ROLLBACK OPERATIONS
// ============================================

/**
 * Roll back committed records for a batch
 */
export function rollbackBatch(
  batchId: string,
  reason: string,
  userId: string
): RollbackResult {
  const committedRecords = getCommittedRecordsByBatch(batchId);

  if (committedRecords.length === 0) {
    return {
      success: false,
      batchId,
      recordsAffected: 0,
      cascadeAffected: [],
      rollbackTimestamp: new Date().toISOString(),
      message: 'No committed records found for this batch',
    };
  }

  // Mark all committed records as rolled back
  const rollbackTimestamp = new Date().toISOString();
  committedRecords.forEach((record) => {
    record.status = 'rolled_back';
    record.rollbackInfo = {
      rolledBackAt: rollbackTimestamp,
      rolledBackBy: userId,
      reason,
      cascadeAffected: [],
    };
    memoryCache.committed.set(record.id, record);
  });

  // Update batch status
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    batch.status = 'rolled_back';
    memoryCache.batches.set(batchId, batch);
  }

  persistAll();

  return {
    success: true,
    batchId,
    recordsAffected: committedRecords.length,
    cascadeAffected: [], // Would be populated by cascade analyzer
    rollbackTimestamp,
    message: `Successfully rolled back ${committedRecords.length} records`,
  };
}

// ============================================
// CHECKPOINT OPERATIONS
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
  const tenantBatches = Array.from(memoryCache.batches.values()).filter(
    (b) => b.tenantId === tenantId
  );

  const checkpoint: Checkpoint = {
    id: `checkpoint-${Date.now()}`,
    tenantId,
    name,
    description,
    createdAt: new Date().toISOString(),
    createdBy: userId,
    snapshotData: {
      batchIds: tenantBatches.map((b) => b.id),
      recordCounts: {
        raw: Array.from(memoryCache.raw.values()).filter((r) =>
          tenantBatches.some((b) => b.id === r.importBatchId)
        ).length,
        transformed: Array.from(memoryCache.transformed.values()).filter((r) =>
          tenantBatches.some((b) => b.id === r.importBatchId)
        ).length,
        committed: Array.from(memoryCache.committed.values()).filter((r) =>
          tenantBatches.some((b) => b.id === r.importBatchId)
        ).length,
      },
    },
  };

  memoryCache.checkpoints.set(checkpoint.id, checkpoint);
  persistAll();

  return checkpoint;
}

/**
 * Get checkpoints for a tenant
 */
export function getCheckpoints(tenantId: string): Checkpoint[] {
  return Array.from(memoryCache.checkpoints.values())
    .filter((c) => c.tenantId === tenantId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Get import batch by ID
 */
export function getImportBatch(id: string): ImportBatch | null {
  return memoryCache.batches.get(id) || null;
}

/**
 * Get all import batches for a tenant
 */
export function getImportBatches(tenantId: string): ImportBatch[] {
  return Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
}

/**
 * Update batch status
 */
export function updateBatchStatus(
  batchId: string,
  status: ImportBatch['status'],
  approvalId?: string
): void {
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    batch.status = status;
    if (approvalId) batch.approvalId = approvalId;
    memoryCache.batches.set(batchId, batch);
    persistAll();
  }
}

// ============================================
// TENANT RESET
// ============================================

/**
 * Reset all data for a tenant
 */
export function resetTenantData(tenantId: string): void {
  // Get all batch IDs for this tenant
  const tenantBatchIds = Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .map((b) => b.id);

  // Remove raw records
  Array.from(memoryCache.raw.keys()).forEach((key) => {
    const record = memoryCache.raw.get(key);
    if (record && tenantBatchIds.includes(record.importBatchId)) {
      memoryCache.raw.delete(key);
    }
  });

  // Remove transformed records
  Array.from(memoryCache.transformed.keys()).forEach((key) => {
    const record = memoryCache.transformed.get(key);
    if (record && tenantBatchIds.includes(record.importBatchId)) {
      memoryCache.transformed.delete(key);
    }
  });

  // Remove committed records
  Array.from(memoryCache.committed.keys()).forEach((key) => {
    const record = memoryCache.committed.get(key);
    if (record && tenantBatchIds.includes(record.importBatchId)) {
      memoryCache.committed.delete(key);
    }
  });

  // Remove batches
  tenantBatchIds.forEach((id) => memoryCache.batches.delete(id));

  // Remove checkpoints
  Array.from(memoryCache.checkpoints.keys()).forEach((key) => {
    const checkpoint = memoryCache.checkpoints.get(key);
    if (checkpoint && checkpoint.tenantId === tenantId) {
      memoryCache.checkpoints.delete(key);
    }
  });

  persistAll();
}

// ============================================
// STATISTICS
// ============================================

export function getDataLayerStats(tenantId: string): {
  raw: number;
  transformed: number;
  committed: number;
  batches: number;
  checkpoints: number;
} {
  const tenantBatchIds = Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .map((b) => b.id);

  return {
    raw: Array.from(memoryCache.raw.values()).filter((r) =>
      tenantBatchIds.includes(r.importBatchId)
    ).length,
    transformed: Array.from(memoryCache.transformed.values()).filter((r) =>
      tenantBatchIds.includes(r.importBatchId)
    ).length,
    committed: Array.from(memoryCache.committed.values()).filter(
      (r) => tenantBatchIds.includes(r.importBatchId) && r.status === 'active'
    ).length,
    batches: tenantBatchIds.length,
    checkpoints: Array.from(memoryCache.checkpoints.values()).filter(
      (c) => c.tenantId === tenantId
    ).length,
  };
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initializeDataLayer();
}
