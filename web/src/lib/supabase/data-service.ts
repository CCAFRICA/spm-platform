/**
 * Data Service — Import batches, committed data, classification signals
 *
 * Supabase-only. No localStorage fallback.
 */

import { createClient } from './client';
import type { Database, Json } from './database.types';
import { findOrCreateEntity, materializePeriodEntityState } from './entity-service';

// ──────────────────────────────────────────────
// Type aliases
// ──────────────────────────────────────────────
type ImportBatchRow = Database['public']['Tables']['import_batches']['Row'];
type ImportBatchInsert = Database['public']['Tables']['import_batches']['Insert'];
type ImportBatchUpdate = Database['public']['Tables']['import_batches']['Update'];
type CommittedDataRow = Database['public']['Tables']['committed_data']['Row'];
type CommittedDataInsert = Database['public']['Tables']['committed_data']['Insert'];
type ClassificationSignalInsert = Database['public']['Tables']['classification_signals']['Insert'];

// ──────────────────────────────────────────────
// Entity auto-creation result
// ──────────────────────────────────────────────
export interface EntityResolutionResult {
  entityId: string;
  externalId: string;
  created: boolean;
  status: 'proposed' | 'active';
}

// ──────────────────────────────────────────────
// Import Batch CRUD
// ──────────────────────────────────────────────

/**
 * Create a new import batch.
 */
export async function createImportBatch(
  tenantId: string,
  batch: {
    fileName: string;
    fileType: string;
    rowCount?: number;
    uploadedBy?: string;
  }
): Promise<ImportBatchRow> {
  const supabase = createClient();
  const insertRow: ImportBatchInsert = {
    tenant_id: tenantId,
    file_name: batch.fileName,
    file_type: batch.fileType,
    row_count: batch.rowCount || 0,
    uploaded_by: batch.uploadedBy || null,
    status: 'pending',
  };
  const { data, error } = await supabase
    .from('import_batches')
    .insert(insertRow)
    .select()
    .single();
  if (error) throw error;
  return data as ImportBatchRow;
}

/**
 * Get an import batch by ID.
 */
export async function getImportBatch(
  tenantId: string,
  batchId: string
): Promise<ImportBatchRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', batchId)
    .single();
  if (error) return null;
  return data as ImportBatchRow;
}

/**
 * List import batches for a tenant.
 */
export async function listImportBatches(
  tenantId: string,
  options?: { status?: string; limit?: number }
): Promise<ImportBatchRow[]> {
  const supabase = createClient();
  let query = supabase
    .from('import_batches')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (options?.status) query = query.eq('status', options.status);
  if (options?.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ImportBatchRow[];
}

/**
 * Update import batch status.
 */
export async function updateImportBatchStatus(
  tenantId: string,
  batchId: string,
  status: string,
  errorSummary?: Json
): Promise<void> {
  const supabase = createClient();
  const updateRow: ImportBatchUpdate = {
    status,
    ...(errorSummary !== undefined ? { error_summary: errorSummary } : {}),
    ...(status === 'completed' || status === 'failed'
      ? { completed_at: new Date().toISOString() }
      : {}),
  };
  const { error } = await supabase
    .from('import_batches')
    .update(updateRow)
    .eq('tenant_id', tenantId)
    .eq('id', batchId);
  if (error) throw error;
}

// ──────────────────────────────────────────────
// Committed Data CRUD
// ──────────────────────────────────────────────

/**
 * Write committed data rows to Supabase.
 */
export async function writeCommittedData(
  tenantId: string,
  batchId: string,
  rows: Array<{
    entityId?: string | null;
    periodId?: string | null;
    dataType: string;
    rowData: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>
): Promise<{ count: number }> {
  const supabase = createClient();
  const insertRows: CommittedDataInsert[] = rows.map(r => ({
    tenant_id: tenantId,
    import_batch_id: batchId,
    entity_id: r.entityId || null,
    period_id: r.periodId || null,
    data_type: r.dataType,
    row_data: r.rowData as unknown as Json,
    metadata: (r.metadata || {}) as unknown as Json,
  }));

  // Batch insert in chunks of 500 to avoid request size limits
  const CHUNK_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK_SIZE) {
    const chunk = insertRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('committed_data').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  return { count: inserted };
}

/**
 * Read committed data for an entity.
 */
export async function getCommittedDataByEntity(
  tenantId: string,
  entityId: string,
  options?: { periodId?: string; dataType?: string }
): Promise<CommittedDataRow[]> {
  const supabase = createClient();
  let query = supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId);
  if (options?.periodId) query = query.eq('period_id', options.periodId);
  if (options?.dataType) query = query.eq('data_type', options.dataType);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as CommittedDataRow[];
}

/**
 * Read committed data for a batch.
 */
export async function getCommittedDataByBatch(
  tenantId: string,
  batchId: string
): Promise<CommittedDataRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('import_batch_id', batchId);
  if (error) throw error;
  return (data || []) as CommittedDataRow[];
}

/**
 * Read all committed data for a period.
 */
export async function getCommittedDataByPeriod(
  tenantId: string,
  periodId: string
): Promise<CommittedDataRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);
  if (error) throw error;
  return (data || []) as CommittedDataRow[];
}

// ──────────────────────────────────────────────
// Entity Auto-Creation on Import
// ──────────────────────────────────────────────

/**
 * Resolve entities from imported data.
 * For each unique external_id in the import:
 * - If found in entities table: match and return entity_id
 * - If not found: create with status='proposed', infer entity_type, flag for confirmation
 *
 * Returns a map of externalId -> entityId (UUID).
 */
export async function resolveEntitiesFromImport(
  tenantId: string,
  records: Array<{
    externalId: string;
    displayName: string;
    entityType?: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<Map<string, EntityResolutionResult>> {
  const results = new Map<string, EntityResolutionResult>();
  const seen = new Set<string>();

  for (const record of records) {
    const extId = record.externalId?.trim();
    if (!extId || seen.has(extId)) continue;
    seen.add(extId);

    try {
      const entity = await findOrCreateEntity(tenantId, extId, {
        display_name: record.displayName || extId,
        entity_type: record.entityType || 'individual',
        metadata: record.metadata,
      });

      results.set(extId, {
        entityId: entity.id,
        externalId: extId,
        created: entity.created_at === entity.updated_at,
        status: entity.status as 'proposed' | 'active',
      });
    } catch (err) {
      console.warn(`[DataService] Failed to resolve entity for external_id=${extId}:`, err);
    }
  }

  return results;
}

/**
 * Full import pipeline with entity resolution and data commit.
 *
 * 1. Creates import batch
 * 2. Resolves entities (auto-creates if not found)
 * 3. Writes committed data with entity_id FKs
 * 4. Materializes period entity state
 * 5. Updates batch status
 */
export async function importWithEntityResolution(
  tenantId: string,
  params: {
    fileName: string;
    fileType: string;
    uploadedBy?: string;
    periodId?: string;
    periodEndDate?: string;
    rows: Array<{
      externalId: string;
      displayName: string;
      entityType?: string;
      dataType: string;
      rowData: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }>;
  }
): Promise<{
  batchId: string;
  entityResolutions: Map<string, EntityResolutionResult>;
  committedCount: number;
}> {
  // Step 1: Create import batch
  const batch = await createImportBatch(tenantId, {
    fileName: params.fileName,
    fileType: params.fileType,
    rowCount: params.rows.length,
    uploadedBy: params.uploadedBy,
  });

  try {
    // Step 2: Resolve entities
    const entityResolutions = await resolveEntitiesFromImport(
      tenantId,
      params.rows.map(r => ({
        externalId: r.externalId,
        displayName: r.displayName,
        entityType: r.entityType,
        metadata: r.metadata,
      }))
    );

    // Step 3: Write committed data with entity_id FKs
    const committedRows = params.rows.map(r => {
      const resolution = entityResolutions.get(r.externalId?.trim());
      return {
        entityId: resolution?.entityId || null,
        periodId: params.periodId || null,
        dataType: r.dataType,
        rowData: r.rowData,
        metadata: {
          ...r.metadata,
          external_id: r.externalId,
          display_name: r.displayName,
        },
      };
    });

    const { count } = await writeCommittedData(tenantId, batch.id, committedRows);

    // Step 4: Materialize period entity state (if period provided)
    if (params.periodId && params.periodEndDate) {
      try {
        await materializePeriodEntityState(
          tenantId,
          params.periodId,
          params.periodEndDate
        );
      } catch (matErr) {
        console.warn('[DataService] Period entity state materialization failed:', matErr);
      }
    }

    // Step 5: Update batch to completed
    await updateImportBatchStatus(tenantId, batch.id, 'completed');

    return {
      batchId: batch.id,
      entityResolutions,
      committedCount: count,
    };
  } catch (err) {
    // Mark batch as failed
    await updateImportBatchStatus(
      tenantId,
      batch.id,
      'failed',
      { error: String(err) } as unknown as Json
    );
    throw err;
  }
}

// ──────────────────────────────────────────────
// Classification Signals
// ──────────────────────────────────────────────

/**
 * Record a classification signal (AI feedback for learning).
 */
export async function recordClassificationSignal(
  tenantId: string,
  signal: {
    entityId?: string | null;
    signalType: string;
    signalValue: Json;
    confidence?: number;
    source?: string;
    context?: Json;
  }
): Promise<void> {
  const supabase = createClient();
  const insertRow: ClassificationSignalInsert = {
    tenant_id: tenantId,
    entity_id: signal.entityId || null,
    signal_type: signal.signalType,
    signal_value: signal.signalValue || ({} as Json),
    confidence: signal.confidence ?? null,
    source: signal.source || null,
    context: signal.context || ({} as Json),
  };
  const { error } = await supabase
    .from('classification_signals')
    .insert(insertRow);
  if (error) throw error;
}

/**
 * Get classification signals for a tenant.
 */
export async function getClassificationSignals(
  tenantId: string,
  options?: { signalType?: string; entityId?: string; limit?: number }
): Promise<Array<Database['public']['Tables']['classification_signals']['Row']>> {
  const supabase = createClient();
  let query = supabase
    .from('classification_signals')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (options?.signalType) query = query.eq('signal_type', options.signalType);
  if (options?.entityId) query = query.eq('entity_id', options.entityId);
  if (options?.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Array<Database['public']['Tables']['classification_signals']['Row']>;
}

// ──────────────────────────────────────────────
// Audit Logging
// ──────────────────────────────────────────────

/**
 * Write an audit log entry.
 */
export async function writeAuditLog(
  tenantId: string,
  entry: {
    profileId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    changes?: Json;
    metadata?: Json;
  }
): Promise<void> {
  const supabase = createClient();
  const insertRow: Database['public']['Tables']['audit_logs']['Insert'] = {
    tenant_id: tenantId,
    profile_id: entry.profileId || null,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId || null,
    changes: entry.changes || ({} as Json),
    metadata: entry.metadata || ({} as Json),
  };
  const { error } = await supabase.from('audit_logs').insert(insertRow);
  if (error) throw error;
}

// ──────────────────────────────────────────────
// Aggregated Data Bridge
// ──────────────────────────────────────────────

/**
 * Load aggregated data for the calculation engine.
 * Reads from committed_data + period_entity_state.
 */
export async function loadAggregatedDataAsync(
  tenantId: string,
  periodId?: string
): Promise<Array<Record<string, unknown>>> {
  if (!periodId) return [];

  const supabase = createClient();
  // Read period entity state (materialized snapshot)
  const { data: states, error } = await supabase
    .from('period_entity_state')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);
  if (error) throw error;

  // Read committed data for this period
  const { data: committed } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);

  // Build aggregated format compatible with calculation engine
  return (states || []).map(state => {
    const entityCommitted = (committed || []).filter(
      (c: CommittedDataRow) => c.entity_id === state.entity_id
    );

    // Build componentMetrics from committed data grouped by data_type
    const componentMetrics: Record<string, unknown> = {};
    for (const row of entityCommitted) {
      componentMetrics[row.data_type] = row.row_data;
    }

    const resolved = (state.resolved_attributes || {}) as Record<string, unknown>;
    return {
      entityId: state.entity_id,
      name: resolved.display_name || '',
      role: resolved.role || '',
      storeId: resolved.store_id || '',
      tenantId,
      componentMetrics,
      resolvedAttributes: resolved,
    };
  });
}

/**
 * Direct commit import data — creates import batch + committed data rows.
 */
export async function directCommitImportDataAsync(
  tenantId: string,
  userId: string,
  fileName: string,
  sheetData: Array<{
    sheetName: string;
    rows: Record<string, unknown>[];
    mappings?: Record<string, string>;
  }>,
  _providedBatchId?: string
): Promise<{ batchId: string; recordCount: number }> {
  // Create batch and write committed data
  const batch = await createImportBatch(tenantId, {
    fileName,
    fileType: fileName.split('.').pop() || 'xlsx',
    uploadedBy: userId,
  });

  const committedRows: Array<{
    entityId: string | null;
    periodId: string | null;
    dataType: string;
    rowData: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }> = [];

  for (const sheet of sheetData) {
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];

      // Apply field mappings if provided
      let content = { ...row };
      if (sheet.mappings) {
        const mapped: Record<string, unknown> = {};
        for (const [sourceCol, value] of Object.entries(row)) {
          const targetField = sheet.mappings[sourceCol];
          if (targetField && targetField !== 'ignore') {
            mapped[targetField] = value;
          }
          mapped[sourceCol] = value;
        }
        content = mapped;
      }

      committedRows.push({
        entityId: null,
        periodId: null,
        dataType: sheet.sheetName,
        rowData: { ...content, _sheetName: sheet.sheetName, _rowIndex: i },
        metadata: { source_sheet: sheet.sheetName },
      });
    }
  }

  const { count } = await writeCommittedData(tenantId, batch.id, committedRows);

  // Update batch status
  await updateImportBatchStatus(tenantId, batch.id, 'completed');

  return { batchId: batch.id, recordCount: count };
}
