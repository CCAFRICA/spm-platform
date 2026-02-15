/**
 * Data Service — Supabase-first import batches, committed data, classification signals
 *
 * HG-13: DataLayerService reads/writes Supabase. Entity auto-creation on import.
 *
 * Phase 9A: Import service migration (import_batches + committed_data)
 * Phase 9B: Entity auto-creation from import
 * Phase 9C: Period entity state materialization after import
 *
 * Dual-mode: Supabase when configured, delegates to data-layer-service for demo.
 */

import { isSupabaseConfigured, createClient } from './client';
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
  if (isSupabaseConfigured()) {
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

  // Demo fallback: create a localStorage batch
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  return {
    id: batchId,
    tenant_id: tenantId,
    file_name: batch.fileName,
    file_type: batch.fileType,
    row_count: batch.rowCount || 0,
    status: 'pending',
    error_summary: {},
    uploaded_by: batch.uploadedBy || null,
    created_at: now,
    completed_at: null,
  } as ImportBatchRow;
}

/**
 * Get an import batch by ID.
 */
export async function getImportBatch(
  tenantId: string,
  batchId: string
): Promise<ImportBatchRow | null> {
  if (isSupabaseConfigured()) {
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

  const { getImportBatch: getLocalBatch } = await import(
    '@/lib/data-architecture/data-layer-service'
  );
  const local = getLocalBatch(batchId);
  if (!local) return null;
  return localBatchToRow(local as unknown as Record<string, unknown>, tenantId);
}

/**
 * List import batches for a tenant.
 */
export async function listImportBatches(
  tenantId: string,
  options?: { status?: string; limit?: number }
): Promise<ImportBatchRow[]> {
  if (isSupabaseConfigured()) {
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

  const { getImportBatches: getLocalBatches } = await import(
    '@/lib/data-architecture/data-layer-service'
  );
  const locals = getLocalBatches(tenantId);
  return locals.map((b: unknown) => localBatchToRow(b as Record<string, unknown>, tenantId));
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
  if (isSupabaseConfigured()) {
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
    return;
  }

  const { updateBatchStatus } = await import(
    '@/lib/data-architecture/data-layer-service'
  );
  updateBatchStatus(batchId, status as 'processing' | 'awaiting_approval' | 'approved' | 'partially_approved' | 'rejected' | 'rolled_back');
}

// ──────────────────────────────────────────────
// Committed Data CRUD
// ──────────────────────────────────────────────

/**
 * Write committed data rows to Supabase.
 * In Supabase mode, each row links to entity_id (UUID FK) and period_id (UUID FK).
 * In demo mode, delegates to directCommitImportData.
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
  if (isSupabaseConfigured()) {
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

  // Demo fallback: not applicable for direct writes, return count
  return { count: rows.length };
}

/**
 * Read committed data for an entity.
 */
export async function getCommittedDataByEntity(
  tenantId: string,
  entityId: string,
  options?: { periodId?: string; dataType?: string }
): Promise<CommittedDataRow[]> {
  if (isSupabaseConfigured()) {
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

  return [];
}

/**
 * Read committed data for a batch.
 */
export async function getCommittedDataByBatch(
  tenantId: string,
  batchId: string
): Promise<CommittedDataRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('committed_data')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('import_batch_id', batchId);
    if (error) throw error;
    return (data || []) as CommittedDataRow[];
  }

  const { getCommittedRecordsByBatch } = await import(
    '@/lib/data-architecture/data-layer-service'
  );
  const records = getCommittedRecordsByBatch(batchId) as unknown as Array<Record<string, unknown>>;
  return records.map(r => ({
    id: r.id as string,
    tenant_id: tenantId,
    import_batch_id: r.importBatchId as string | null,
    entity_id: null,
    period_id: null,
    data_type: (r.content as Record<string, unknown>)?._sheetName as string || 'unknown',
    row_data: (r.content || {}) as unknown as Json,
    metadata: {} as Json,
    created_at: r.committedAt as string || new Date().toISOString(),
  })) as CommittedDataRow[];
}

/**
 * Read all committed data for a period.
 */
export async function getCommittedDataByPeriod(
  tenantId: string,
  periodId: string
): Promise<CommittedDataRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('committed_data')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId);
    if (error) throw error;
    return (data || []) as CommittedDataRow[];
  }

  return [];
}

// ──────────────────────────────────────────────
// Phase 9B: Entity Auto-Creation on Import
// ──────────────────────────────────────────────

/**
 * Resolve entities from imported data.
 * For each unique external_id in the import:
 * - If found in entities table: match and return entity_id
 * - If not found: create with status='proposed', infer entity_type, flag for confirmation
 *
 * Returns a map of externalId → entityId (UUID).
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
      // findOrCreateEntity handles both Supabase and localStorage modes
      const entity = await findOrCreateEntity(tenantId, extId, {
        display_name: record.displayName || extId,
        entity_type: record.entityType || 'individual',
        metadata: record.metadata,
      });

      results.set(extId, {
        entityId: entity.id,
        externalId: extId,
        created: entity.created_at === entity.updated_at, // heuristic: timestamps match = just created
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
  if (isSupabaseConfigured()) {
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
    return;
  }

  // Demo fallback: classification signals stored in localStorage
  if (typeof window !== 'undefined') {
    const key = `classification_signals_${tenantId}`;
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        signal_type: signal.signalType,
        signal_value: signal.signalValue,
        confidence: signal.confidence ?? null,
        source: signal.source || null,
        context: signal.context || {},
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      // localStorage may be full
    }
  }
}

/**
 * Get classification signals for a tenant.
 */
export async function getClassificationSignals(
  tenantId: string,
  options?: { signalType?: string; entityId?: string; limit?: number }
): Promise<Array<Database['public']['Tables']['classification_signals']['Row']>> {
  if (isSupabaseConfigured()) {
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

  return [];
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
  if (isSupabaseConfigured()) {
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
    return;
  }

  // Demo fallback: delegate to existing audit service singleton
  try {
    const { audit } = await import('@/lib/audit-service');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (audit as any).log({
      action: entry.action,
      entityType: entry.resourceType,
      entityId: entry.resourceId || undefined,
      metadata: (entry.changes || {}) as Record<string, unknown>,
    });
  } catch {
    // Audit service may not exist in all builds
  }
}

// ──────────────────────────────────────────────
// Aggregated Data Bridge (Demo ↔ Supabase)
// ──────────────────────────────────────────────

/**
 * Load aggregated data for the calculation engine.
 * In Supabase mode, reads from committed_data + period_entity_state.
 * In demo mode, delegates to data-layer-service loadAggregatedData.
 */
export async function loadAggregatedDataAsync(
  tenantId: string,
  periodId?: string
): Promise<Array<Record<string, unknown>>> {
  if (isSupabaseConfigured() && periodId) {
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
        employeeId: resolved.external_id || state.entity_id,
        name: resolved.display_name || '',
        role: resolved.role || '',
        storeId: resolved.store_id || '',
        tenantId,
        componentMetrics,
        resolvedAttributes: resolved,
      };
    });
  }

  // Demo fallback: synchronous loadAggregatedData
  const { loadAggregatedData } = await import(
    '@/lib/data-architecture/data-layer-service'
  );
  return loadAggregatedData(tenantId);
}

// ──────────────────────────────────────────────
// Direct Import (Demo Compatibility Bridge)
// ──────────────────────────────────────────────

/**
 * Direct commit import data — bridges the existing directCommitImportData
 * with Supabase when configured.
 *
 * In demo mode: delegates directly to data-layer-service.
 * In Supabase mode: creates import batch + committed data rows.
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
  providedBatchId?: string
): Promise<{ batchId: string; recordCount: number }> {
  if (!isSupabaseConfigured()) {
    // Demo fallback: use existing localStorage-based function
    const { directCommitImportData } = await import(
      '@/lib/data-architecture/data-layer-service'
    );
    return directCommitImportData(tenantId, userId, fileName, sheetData, providedBatchId);
  }

  // Supabase mode: create batch and write committed data
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
        entityId: null, // Will be resolved in Phase 9B integration
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

// ──────────────────────────────────────────────
// Helper: Convert localStorage batch to Row shape
// ──────────────────────────────────────────────

function localBatchToRow(
  local: Record<string, unknown>,
  tenantId: string
): ImportBatchRow {
  return {
    id: local.id as string,
    tenant_id: local.tenantId as string || tenantId,
    file_name: local.fileName as string || '',
    file_type: local.sourceFormat as string || 'xlsx',
    row_count: (local.summary as Record<string, unknown>)?.totalRecords as number || 0,
    status: local.status as string || 'pending',
    error_summary: {} as Json,
    uploaded_by: local.importedBy as string || null,
    created_at: local.importedAt as string || new Date().toISOString(),
    completed_at: null,
  };
}
