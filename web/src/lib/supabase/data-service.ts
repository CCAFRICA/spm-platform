/**
 * Data Service — Import batches, committed data, classification signals
 *
 * Supabase-only. No localStorage fallback.
 */

import { createClient, requireTenantId } from './client';
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
  requireTenantId(tenantId);
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
 *
 * OB-55: Now resolves entities (auto-creates if missing), detects/creates periods,
 * and creates rule_set_assignments for entities with active rule sets.
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _providedBatchId?: string
): Promise<{ batchId: string; recordCount: number; entityCount: number; periodId: string | null }> {
  const supabase = createClient();

  // Create batch
  const batch = await createImportBatch(tenantId, {
    fileName,
    fileType: fileName.split('.').pop() || 'xlsx',
    uploadedBy: userId,
  });

  // ── Step 1: Collect unique external IDs across all sheets ──
  const entityIdMap = new Map<string, string>(); // externalId → supabase uuid
  const externalIdFieldNames = ['entityId', 'entity_id', 'employeeId', 'employee_id', 'external_id', 'externalId', 'repId', 'rep_id', 'id_empleado'];

  for (const sheet of sheetData) {
    if (!sheet.mappings) continue;
    // Find columns mapped to entityId
    const entityCols = Object.entries(sheet.mappings)
      .filter(([, target]) => externalIdFieldNames.includes(target))
      .map(([source]) => source);

    for (const row of sheet.rows) {
      for (const col of entityCols) {
        const val = row[col];
        if (val != null && String(val).trim()) {
          entityIdMap.set(String(val).trim(), '');
        }
      }
    }
  }

  // ── Step 2: Resolve entities (auto-create if missing) ──
  for (const externalId of Array.from(entityIdMap.keys())) {
    try {
      const entity = await findOrCreateEntity(tenantId, externalId, {
        display_name: externalId,
        entity_type: 'individual',
      });
      entityIdMap.set(externalId, entity.id);
    } catch (err) {
      console.warn(`[DataService] Entity resolution failed for ${externalId}:`, err);
    }
  }
  console.log(`[DataService] Resolved ${entityIdMap.size} entities (auto-created as needed)`);

  // ── Step 3: Detect period from data ──
  let resolvedPeriodId: string | null = null;
  const periodFieldNames = ['period', 'period_key', 'periodKey', 'date', 'fecha', 'periodo'];

  for (const sheet of sheetData) {
    if (!sheet.mappings || resolvedPeriodId) break;
    const periodCols = Object.entries(sheet.mappings)
      .filter(([, target]) => periodFieldNames.includes(target))
      .map(([source]) => source);

    if (periodCols.length === 0) continue;
    const firstRow = sheet.rows[0];
    if (!firstRow) continue;

    let detectedYear: number | null = null;
    let detectedMonth: number | null = null;

    for (const col of periodCols) {
      const value = firstRow[col];
      if (value == null) continue;
      const numValue = typeof value === 'number' ? value : parseInt(String(value), 10);

      // Excel serial date
      if (typeof value === 'number' && value > 25000 && value < 100000) {
        const d = new Date((value - 25569) * 86400 * 1000);
        if (!isNaN(d.getTime())) {
          detectedYear = d.getUTCFullYear();
          detectedMonth = d.getUTCMonth() + 1;
          break;
        }
      }
      if (!isNaN(numValue)) {
        if (numValue >= 2020 && numValue <= 2030) detectedYear = numValue;
        else if (numValue >= 1 && numValue <= 12) detectedMonth = numValue;
      }
    }

    if (detectedYear && detectedMonth) {
      const periodKey = `${detectedYear}-${String(detectedMonth).padStart(2, '0')}`;
      const startDate = `${detectedYear}-${String(detectedMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(detectedYear, detectedMonth, 0).getDate();
      const endDate = `${detectedYear}-${String(detectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Check if period exists in Supabase
      const { data: existing } = await supabase
        .from('periods')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('period_key', periodKey)
        .maybeSingle();

      if (existing) {
        resolvedPeriodId = existing.id;
        console.log(`[DataService] Found existing period: ${periodKey} (${existing.id})`);
      } else {
        // Create period in Supabase
        const { data: newPeriod, error: pErr } = await supabase
          .from('periods')
          .insert({
            tenant_id: tenantId,
            period_key: periodKey,
            period_type: 'monthly',
            start_date: startDate,
            end_date: endDate,
            status: 'open',
          })
          .select('id')
          .single();

        if (!pErr && newPeriod) {
          resolvedPeriodId = newPeriod.id;
          console.log(`[DataService] Created period: ${periodKey} (${newPeriod.id})`);
        } else {
          console.warn(`[DataService] Period creation failed:`, pErr);
        }
      }
    }
  }

  // ── Step 4: Build committed rows with entity_id and period_id ──
  const committedRows: Array<{
    entityId: string | null;
    periodId: string | null;
    dataType: string;
    rowData: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }> = [];

  for (const sheet of sheetData) {
    // Find entity ID column for this sheet
    const entityCol = sheet.mappings
      ? Object.entries(sheet.mappings).find(([, target]) => externalIdFieldNames.includes(target))?.[0]
      : null;

    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];

      // Apply field mappings
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

      // Resolve entity UUID from external ID
      let entityId: string | null = null;
      if (entityCol && row[entityCol] != null) {
        entityId = entityIdMap.get(String(row[entityCol]).trim()) || null;
      }

      committedRows.push({
        entityId,
        periodId: resolvedPeriodId,
        dataType: sheet.sheetName,
        rowData: { ...content, _sheetName: sheet.sheetName, _rowIndex: i },
        metadata: { source_sheet: sheet.sheetName },
      });
    }
  }

  const { count } = await writeCommittedData(tenantId, batch.id, committedRows);

  // ── Step 5: Create rule_set_assignments for resolved entities ──
  try {
    const { data: activeRuleSet } = await supabase
      .from('rule_sets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeRuleSet) {
      const entityUuids = Array.from(new Set(
        Array.from(entityIdMap.values()).filter(Boolean)
      ));

      // Check existing assignments
      const { data: existingAssignments } = await supabase
        .from('rule_set_assignments')
        .select('entity_id')
        .eq('tenant_id', tenantId)
        .eq('rule_set_id', activeRuleSet.id)
        .in('entity_id', entityUuids.length > 0 ? entityUuids : ['__none__']);

      const assignedSet = new Set((existingAssignments ?? []).map(a => a.entity_id));
      const newAssignments = entityUuids
        .filter(id => !assignedSet.has(id))
        .map(entityId => ({
          tenant_id: tenantId,
          entity_id: entityId,
          rule_set_id: activeRuleSet.id,
          effective_start: new Date().toISOString().split('T')[0],
        }));

      if (newAssignments.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < newAssignments.length; i += CHUNK) {
          await supabase.from('rule_set_assignments').insert(newAssignments.slice(i, i + CHUNK));
        }
        console.log(`[DataService] Created ${newAssignments.length} rule_set_assignments`);
      }
    }
  } catch (assignErr) {
    console.warn('[DataService] Rule set assignment failed (non-blocking):', assignErr);
  }

  // Update batch status
  await updateImportBatchStatus(tenantId, batch.id, 'completed');

  return { batchId: batch.id, recordCount: count, entityCount: entityIdMap.size, periodId: resolvedPeriodId };
}
