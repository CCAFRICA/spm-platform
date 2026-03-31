// OB-156: SCI Execute Bulk — Server-side file processing
// Downloads file from Supabase Storage, parses server-side, bulk inserts.
// Fixes AP-1 (no row data in HTTP bodies) and AP-2 (no sequential chunks from browser).

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
// OB-182: convergeBindings removed from import — runs at calc time
import type { Json } from '@/lib/supabase/database.types';
import type {
  SCIExecutionResult,
  ContentUnitResult,
  AgentType,
  SemanticBinding,
} from '@/lib/sci/sci-types';
import {
  extractSourceDate,
  findDateColumnFromBindings,
  buildSemanticRolesMap,
  detectPeriodMarkerColumns,
} from '@/lib/sci/source-date-extraction';

// Processing order: plan first, then entity, then data
const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
  reference: 4,
};

// Normalize filename to semantic data_type (same logic as execute route)
function normalizeFileNameToDataType(fn: string): string {
  let stem = fn.replace(/\.[^.]+$/, '');
  stem = stem.replace(/^[A-Z]{2,5}_/, '');
  stem = stem.replace(/_?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{4}$/i, '');
  stem = stem.replace(/_?Q[1-4]_?\d{4}$/i, '');
  stem = stem.replace(/_?\d{4}[-_]\d{2}$/i, '');
  stem = stem.replace(/_?\d{4}$/i, '');
  stem = stem.replace(/_+$/, '');
  return stem.toLowerCase().replace(/[\s-]+/g, '_');
}

// Generic role detection targets (AP-5/AP-6: no hardcoded language-specific names)
const ROLE_TARGETS = ['role', 'position', 'puesto', 'title', 'cargo'];

interface BulkContentUnit {
  contentUnitId: string;
  confirmedClassification: AgentType;
  confirmedBindings: SemanticBinding[];
  claimType?: string;
  ownedFields?: string[];
  sharedFields?: string[];
  originalClassification?: AgentType;
  originalConfidence?: number;
}

interface BulkRequest {
  proposalId: string;
  tenantId: string;
  storagePath: string;
  contentUnits: BulkContentUnit[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth check
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body: BulkRequest = await req.json();
    const { proposalId, tenantId, storagePath, contentUnits } = body;

    if (!tenantId || !proposalId || !storagePath || !contentUnits?.length) {
      return NextResponse.json(
        { error: 'tenantId, proposalId, storagePath, and contentUnits required' },
        { status: 400 }
      );
    }

    // HF-090: Use auth.uid() directly for created_by attribution
    const profileId = authUser.id;

    // Verify tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // ── Step 1: Download file from Supabase Storage ──
    console.log(`[SCI Bulk] Downloading from Storage: ${storagePath}`);
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('ingestion-raw')
      .download(storagePath);

    if (downloadErr || !fileData) {
      return NextResponse.json(
        { error: `Failed to download file from Storage: ${downloadErr?.message || 'No data'}` },
        { status: 500 }
      );
    }

    const downloadMs = Date.now() - startTime;
    console.log(`[SCI Bulk] Downloaded ${(fileData.size / 1024 / 1024).toFixed(1)}MB in ${downloadMs}ms`);

    // ── Step 2: Parse file server-side ──
    const parseStart = Date.now();
    const XLSX = await import('xlsx');
    const buffer = await fileData.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Build sheet data map: sheetName → rows
    const sheetDataMap = new Map<string, {
      rows: Record<string, unknown>[];
      columns: string[];
    }>();

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;

      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

      sheetDataMap.set(sheetName, { rows: jsonData, columns });
    }

    const parseMs = Date.now() - parseStart;
    const totalRows = Array.from(sheetDataMap.values()).reduce((s, d) => s + d.rows.length, 0);
    console.log(`[SCI Bulk] Parsed ${totalRows} rows across ${sheetDataMap.size} sheets in ${parseMs}ms`);

    // HF-141: Diagnostic — log unique source_dates found in this file
    const uniqueDates = new Set<string>();
    for (const [, sheet] of Array.from(sheetDataMap.entries())) {
      for (const row of sheet.rows.slice(0, 10)) {
        const periodo = row['Periodo'] ?? row['periodo'] ?? row['PERIODO'];
        if (periodo) uniqueDates.add(String(periodo).substring(0, 10));
      }
    }
    console.log(`[HF-141] File: ${storagePath}, rows: ${totalRows}, source_dates: [${Array.from(uniqueDates).join(', ')}]`);

    // ── Step 3: Sort content units by processing order ──
    const sortedUnits = [...contentUnits].sort(
      (a, b) => PROCESSING_ORDER[a.confirmedClassification] - PROCESSING_ORDER[b.confirmedClassification]
    );

    // ── Step 4: Process each content unit ──
    const results: ContentUnitResult[] = [];
    // Extract fileName from storagePath for data_type resolution
    const fileNameFromPath = storagePath.split('/').pop()?.replace(/^\d+_/, '') || 'unknown';

    for (const unit of sortedUnits) {
      try {
        // Resolve sheet data for this content unit
        const parts = unit.contentUnitId.split('::');
        const tabName = parts[1] || 'Sheet1';

        let sheetData = sheetDataMap.get(tabName);
        if (!sheetData || sheetData.rows.length === 0) {
          // Try case-insensitive match
          const match = Array.from(sheetDataMap.entries()).find(
            ([name]) => name.toLowerCase() === tabName.toLowerCase()
          );
          if (match && match[1].rows.length > 0) {
            // HF-137: Assign matched sheet data back — was falling through with null sheetData
            sheetData = match[1];
          } else {
            // HF-137: If only 1 sheet exists, use it regardless of name (unambiguous)
            if (sheetDataMap.size === 1) {
              const onlySheet = Array.from(sheetDataMap.values())[0];
              if (onlySheet && onlySheet.rows.length > 0) {
                sheetData = onlySheet;
                console.log(`[SCI Bulk] Sheet name mismatch: "${tabName}" not found. Using only available sheet (${onlySheet.rows.length} rows)`);
              }
            }
            if (!sheetData || sheetData.rows.length === 0) {
              console.warn(`[SCI Bulk] No sheet data found for tab "${tabName}" (available: ${Array.from(sheetDataMap.keys()).join(', ')})`);
              results.push({
                contentUnitId: unit.contentUnitId,
                classification: unit.confirmedClassification,
                success: true,
                rowsProcessed: 0,
                pipeline: unit.confirmedClassification,
              });
              continue;
            }
          }
        }

        const rows = sheetData?.rows || [];
        const effectiveUnit = filterFieldsForPartialClaim(unit, rows);

        const result = await processContentUnit(
          supabase, tenantId, proposalId, profileId,
          effectiveUnit.unit, effectiveUnit.rows, fileNameFromPath, tabName
        );
        results.push(result);
      } catch (err) {
        results.push({
          contentUnitId: unit.contentUnitId,
          classification: unit.confirmedClassification,
          success: false,
          rowsProcessed: 0,
          pipeline: unit.confirmedClassification,
          error: String(err),
        });
      }
    }

    const totalMs = Date.now() - startTime;
    const totalProcessed = results.reduce((s, r) => s + r.rowsProcessed, 0);
    console.log(`[SCI Bulk] Complete: ${totalProcessed} rows in ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);

    const response: SCIExecutionResult = {
      proposalId,
      results,
      overallSuccess: results.every(r => r.success),
    };

    return NextResponse.json(response);

  } catch (err) {
    console.error('[SCI Bulk] Error:', err);
    return NextResponse.json(
      { error: 'Bulk execution failed', details: String(err) },
      { status: 500 }
    );
  }
}

// ── Field filtering for PARTIAL claims ──

function filterFieldsForPartialClaim(
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
): { unit: BulkContentUnit; rows: Record<string, unknown>[] } {
  if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
    return { unit, rows };
  }

  const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);

  const filteredRows = rows.map(row => {
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      if (allowedFields.has(key) || key.startsWith('_')) {
        filtered[key] = row[key];
      }
    }
    return filtered;
  });

  const filteredBindings = unit.confirmedBindings.filter(
    b => allowedFields.has(b.sourceField)
  );

  return {
    unit: { ...unit, confirmedBindings: filteredBindings },
    rows: filteredRows,
  };
}

// ── Process a single content unit with server-parsed data ──

async function processContentUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  profileId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
): Promise<ContentUnitResult> {
  switch (unit.confirmedClassification) {
    case 'entity':
      return processEntityUnit(supabase, tenantId, unit, rows);
    case 'target':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target');
    case 'transaction':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction');
    case 'reference':
      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId);
    default:
      return {
        contentUnitId: unit.contentUnitId,
        classification: unit.confirmedClassification,
        success: false,
        rowsProcessed: 0,
        pipeline: unit.confirmedClassification,
        error: `Unsupported classification for bulk processing: ${unit.confirmedClassification}`,
      };
  }
}

// ── Entity pipeline ──

async function processEntityUnit(
  supabase: SupabaseClient,
  tenantId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
): Promise<ContentUnitResult> {
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: 0, pipeline: 'entity' };
  }

  const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
  const nameBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_name');
  const licenseBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_license');

  if (!idBinding) {
    return { contentUnitId: unit.contentUnitId, classification: 'entity', success: false, rowsProcessed: 0, pipeline: 'entity', error: 'No entity_identifier binding found' };
  }

  // Collect unique external IDs with metadata + enrichment attributes
  const entityData = new Map<string, { name: string; role?: string; licenses?: string; enrichment: Record<string, string> }>();
  // OB-177: Detect enrichment fields — entity_attribute bindings that are text (not ID/name)
  const enrichmentBindings = unit.confirmedBindings.filter(b =>
    b.semanticRole === 'entity_attribute' || b.semanticRole === 'descriptive_label'
  );
  for (const row of rows) {
    const eid = row[idBinding.sourceField];
    if (eid == null || !String(eid).trim()) continue;
    const key = String(eid).trim();
    if (entityData.has(key)) continue;

    const name = nameBinding ? String(row[nameBinding.sourceField] || key).trim() : key;
    const meta: { name: string; role?: string; licenses?: string; enrichment: Record<string, string> } = { name, enrichment: {} };

    for (const binding of unit.confirmedBindings) {
      if (binding.semanticRole === 'entity_attribute') {
        const fieldLower = binding.sourceField.toLowerCase().replace(/[\s_-]+/g, '');
        if (ROLE_TARGETS.some(t => fieldLower.includes(t))) {
          meta.role = String(row[binding.sourceField] || '').trim();
        }
      }
    }
    if (licenseBinding) {
      meta.licenses = String(row[licenseBinding.sourceField] || '').trim();
    }

    // OB-177: Collect ALL enrichment field values for temporal_attributes
    for (const binding of enrichmentBindings) {
      const val = row[binding.sourceField];
      if (val != null && typeof val === 'string' && val.trim()) {
        const normalizedKey = binding.sourceField.toLowerCase().replace(/[\s]+/g, '_');
        meta.enrichment[normalizedKey] = val.trim();
      }
    }

    entityData.set(key, meta);
  }

  // Fetch existing entities in batches of 200 (Section G)
  const allIds = Array.from(entityData.keys());
  const existingMap = new Map<string, string>();
  const BATCH = 200;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const slice = allIds.slice(i, i + BATCH);
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);
    if (existing) {
      for (const e of existing) {
        if (e.external_id) existingMap.set(e.external_id, e.id);
      }
    }
  }

  // OB-177: Build temporal_attributes from enrichment fields
  const importDate = new Date().toISOString().split('T')[0];
  function buildTemporalAttrs(enrichment: Record<string, string>): Json[] {
    return Object.entries(enrichment).map(([key, value]) => ({
      key,
      value,
      effective_from: importDate,
      effective_to: null,
      source: 'import',
    }));
  }

  // Create new entities — bulk insert in 5000-row chunks
  const newIds = allIds.filter(eid => !existingMap.has(eid));
  let created = 0;
  if (newIds.length > 0) {
    const newEntities = newIds.map(eid => {
      const meta = entityData.get(eid);
      return {
        tenant_id: tenantId,
        external_id: eid,
        display_name: meta?.name || eid,
        entity_type: 'individual' as const,
        status: 'active' as const,
        temporal_attributes: buildTemporalAttrs(meta?.enrichment || {}) as Json[],
        metadata: {
          ...(meta?.role ? { role: meta.role } : {}),
          ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
        } as Record<string, Json>,
      };
    });

    const INSERT_BATCH = 5000;
    for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
      const slice = newEntities.slice(i, i + INSERT_BATCH);
      const { error: entErr } = await supabase.from('entities').insert(slice);
      if (entErr) {
        return { contentUnitId: unit.contentUnitId, classification: 'entity' as const, success: false, rowsProcessed: created, pipeline: 'entity', error: entErr.message };
      }
      created += slice.length;
    }
  }

  // OB-177: Enrich EXISTING entities — merge temporal_attributes (don't overwrite)
  let enriched = 0;
  for (const eid of allIds) {
    const entityId = existingMap.get(eid);
    if (!entityId) continue;
    const meta = entityData.get(eid);
    if (!meta?.enrichment || Object.keys(meta.enrichment).length === 0) continue;

    // Fetch current temporal_attributes
    const { data: current } = await supabase
      .from('entities')
      .select('temporal_attributes')
      .eq('id', entityId)
      .single();

    const existingAttrs = (current?.temporal_attributes || []) as Array<{ key: string; value: Json; effective_from: string; effective_to: string | null }>;

    // Merge: for each enrichment field, check if value changed
    const newAttrs = [...existingAttrs];
    for (const [key, value] of Object.entries(meta.enrichment)) {
      const existing = newAttrs.find(a => a.key === key && a.effective_to === null);
      if (existing && existing.value === value) continue; // Same value, idempotent
      if (existing) {
        // Close current entry
        existing.effective_to = importDate;
      }
      // Add new entry
      newAttrs.push({ key, value, effective_from: importDate, effective_to: null });
    }

    // Also update metadata.role if detected
    if (meta.role) {
      const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
      const existingMeta = (entData?.metadata ?? {}) as Record<string, unknown>;
      if (existingMeta.role !== meta.role) {
        await supabase.from('entities').update({
          temporal_attributes: newAttrs as unknown as Json[],
          metadata: { ...existingMeta, role: meta.role } as unknown as Json,
        }).eq('id', entityId);
        enriched++;
        continue;
      }
    }

    if (newAttrs.length !== existingAttrs.length) {
      await supabase.from('entities').update({
        temporal_attributes: newAttrs as unknown as Json[],
      }).eq('id', entityId);
      enriched++;
    }
  }

  console.log(`[SCI Bulk] Entity: ${created} new, ${existingMap.size} existing, ${enriched} enriched`);

  return { contentUnitId: unit.contentUnitId, classification: 'entity', success: true, rowsProcessed: rows.length, pipeline: 'entity' };
}

// ── Target/Transaction pipeline (committed_data bulk insert) ──

async function processDataUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  classification: 'target' | 'transaction',
): Promise<ContentUnitResult> {
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification, success: true, rowsProcessed: 0, pipeline: classification };
  }

  // Create import batch
  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-bulk-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci-bulk', proposalId, contentUnitId: unit.contentUnitId } as unknown as Json,
  });

  // Resolve data_type
  const normalized = normalizeFileNameToDataType(fileName);
  const isGenericTab = tabName === 'Sheet1' || tabName === 'Hoja1';
  const dataType = !isGenericTab && normalized.length > 2
    ? `${normalized}__${tabName.toLowerCase().replace(/[\s\-]+/g, '_')}`
    : normalized || tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Build semantic_roles map
  const semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // OB-182: Entity identifier field detected for semantic role tagging (NOT for binding).
  // Entity binding deferred to calculation time per sequence-independence principle.
  // committed_data.entity_id is NULL at import — engine resolves at calc time.
  const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
  const entityIdField = entityIdBinding?.sourceField;

  // OB-152/OB-157: Source date extraction with period marker composition
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // OB-182: Build committed_data rows — entity_id NULL (resolved at calc time)
  const insertRows = rows.map((row, i) => {
    const sourceDate = extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint);

    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null, // OB-182: deferred to calculation time
      period_id: null,  // Decision 92: engine binds at calc time
      source_date: sourceDate,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source: 'sci-bulk',
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        entity_id_field: entityIdField || null, // preserve which field is the entity identifier
      },
    };
  });

  // OB-174 Phase 5: Nanobatch commitment — chunked insert with progress tracking
  // Chunks of 2000 rows (DS-016 §3.4). Each chunk committed independently.
  // Failed chunks retried up to 3 times before skip.
  const CHUNK = 2000;
  let totalInserted = 0;
  let chunksCompleted = 0;
  const totalChunks = Math.ceil(insertRows.length / CHUNK);

  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    let chunkSuccess = false;
    let lastErr = '';

    // Retry up to 3 times per chunk
    for (let retry = 0; retry < 3 && !chunkSuccess; retry++) {
      const { error: insertErr } = await supabase.from('committed_data').insert(slice);
      if (insertErr) {
        lastErr = insertErr.message;
        console.warn(`[SCI Bulk] Chunk ${chunksCompleted + 1}/${totalChunks} failed (attempt ${retry + 1}): ${lastErr}`);
        if (retry < 2) await new Promise(r => setTimeout(r, 500 * (retry + 1))); // backoff
      } else {
        chunkSuccess = true;
      }
    }

    if (chunkSuccess) {
      totalInserted += slice.length;
      chunksCompleted++;
    } else {
      console.error(`[SCI Bulk] Chunk ${chunksCompleted + 1}/${totalChunks} permanently failed after 3 retries: ${lastErr}`);
      // Log to import_batches but continue with next chunk (don't lose prior chunks)
    }

    // Update chunk_progress on processing_jobs if a job context exists
    // (The processing_job_id is passed via the proposalId when called from async path)
    console.log(`[SCI Bulk] Chunk ${chunksCompleted}/${totalChunks}: ${totalInserted}/${insertRows.length} rows committed`);
  }

  // Update batch status
  await supabase.from('import_batches').update({
    status: 'completed',
    row_count: totalInserted,
  }).eq('id', batchId);

  console.log(`[SCI Bulk] ${classification}: ${totalInserted} rows committed, data_type=${dataType}`);

  // OB-195 Layer 4: Invalidate cached convergence bindings so engine re-derives with new data
  if (totalInserted > 0) {
    const { data: clearedRuleSets } = await supabase
      .from('rule_sets')
      .update({ input_bindings: {} })
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'draft'])
      .select('id');
    if ((clearedRuleSets?.length ?? 0) > 0) {
      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
    }
  }

  // OB-182: postCommitConstruction REMOVED from import pipeline.
  // Entity assignment and entity_id binding deferred to calculation time.
  // Entity creation for roster imports still handled by processEntityUnit (separate path).
  // Convergence derivation also removed (was lines 685-716) — runs at calc time.

  // OB-182: Entity binding validation and convergence derivation REMOVED.
  // Entity binding: deferred to calculation time (engine resolves from row_data).
  // Convergence: deferred to calculation time (engine derives when input_bindings empty).
  // Flywheel self-correction: entity_id is always NULL at import, so binding validation is N/A.

  return {
    contentUnitId: unit.contentUnitId,
    classification,
    success: true,
    rowsProcessed: totalInserted,
    pipeline: classification,
  };
}

// ── Reference pipeline ──

async function processReferenceUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: string,
): Promise<ContentUnitResult> {
  // OB-195 Layer 1: Reference pipeline → committed_data (Decision 111)
  // Previously wrote to reference_data + reference_items (deprecated).
  // Now follows processDataUnit pattern: all data → committed_data.
  // Engine aggregates all numeric fields at calc time (aggregateMetrics sums across all rows).
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification: 'reference', success: true, rowsProcessed: 0, pipeline: 'reference' };
  }

  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-bulk-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci-bulk', proposalId, contentUnitId: unit.contentUnitId, classification: 'reference' } as unknown as Json,
  });

  // Resolve data_type (same pattern as processDataUnit)
  const normalized = normalizeFileNameToDataType(fileName);
  const isGenericTab = tabName === 'Sheet1' || tabName === 'Hoja1';
  const dataType = !isGenericTab && normalized.length > 2
    ? `${normalized}__${tabName.toLowerCase().replace(/[\s\-]+/g, '_')}`
    : normalized || tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Build semantic_roles map
  const semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // Entity identifier for calc-time resolution (OB-182/OB-183)
  const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
  const entityIdField = entityIdBinding?.sourceField;

  // Source date extraction (Decision 92)
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // Build committed_data rows (same structure as processDataUnit)
  const insertRows = rows.map((row, i) => {
    const sourceDate = extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint);
    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null, // OB-182: deferred to calculation time
      period_id: null,  // Decision 92: engine binds at calc time
      source_date: sourceDate,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source: 'sci-bulk',
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        entity_id_field: entityIdField || null,
        informational_label: 'reference',
      },
    };
  });

  // Insert in chunks (same as processDataUnit)
  const CHUNK = 2000;
  let totalInserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase.from('committed_data').insert(slice as unknown as Json[]);
    if (insertErr) {
      return { contentUnitId: unit.contentUnitId, classification: 'reference', success: false, rowsProcessed: totalInserted, pipeline: 'reference', error: insertErr.message };
    }
    totalInserted += slice.length;
  }

  await supabase.from('import_batches').update({
    status: 'completed',
    row_count: totalInserted,
  }).eq('id', batchId);

  const sourceDates = insertRows.filter(r => r.source_date).map(r => r.source_date);
  console.log(`[SCI Bulk] Reference → committed_data: ${totalInserted} rows, data_type="${dataType}", entity_id_field="${entityIdField || 'none'}", source_dates=${sourceDates.length > 0 ? sourceDates.slice(0, 3).join(',') : 'none'}`);

  // OB-195 Layer 4: Invalidate cached convergence bindings (same as processDataUnit)
  if (totalInserted > 0) {
    const { data: clearedRuleSets } = await supabase
      .from('rule_sets')
      .update({ input_bindings: {} })
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'draft'])
      .select('id');
    if ((clearedRuleSets?.length ?? 0) > 0) {
      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (reference data imported — convergence will re-derive)`);
    }
  }

  return { contentUnitId: unit.contentUnitId, classification: 'reference', success: true, rowsProcessed: totalInserted, pipeline: 'reference' };
}

// ── Post-commit construction — REMOVED by OB-182 (sequence-independence)
// Entity binding, assignments, and store metadata deferred to calculation time.
// Function retained as dead code reference until calc-time equivalents verified.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _postCommitConstruction_REMOVED(
  supabase: SupabaseClient,
  tenantId: string,
  importBatchId: string,
  entityIdField: string | undefined,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
): Promise<void> {
  const BATCH = 200;

  if (!entityIdField) return;

  // OB-157: Entity creation removed from postCommitConstruction.
  // Only entity-classified content units create entities (via processEntityUnit).
  // Target/transaction units bind to existing entities only.

  // Collect unique identifiers
  const allIdentifiers = new Set<string>();
  for (const row of rows) {
    const val = row[entityIdField];
    if (val != null && String(val).trim()) {
      allIdentifiers.add(String(val).trim());
    }
  }

  if (allIdentifiers.size === 0) return;

  const allIds = Array.from(allIdentifiers);

  // Create rule_set_assignments for unassigned entities
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'draft']);

  if (ruleSets && ruleSets.length > 0) {
    const allEntityIds: string[] = [];
    for (let i = 0; i < allIds.length; i += BATCH) {
      const slice = allIds.slice(i, i + BATCH);
      const { data } = await supabase
        .from('entities')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('external_id', slice);
      if (data) allEntityIds.push(...data.map(e => e.id));
    }

    const assignedEntityIds = new Set<string>();
    for (let i = 0; i < allEntityIds.length; i += BATCH) {
      const slice = allEntityIds.slice(i, i + BATCH);
      const { data } = await supabase
        .from('rule_set_assignments')
        .select('entity_id')
        .eq('tenant_id', tenantId)
        .in('entity_id', slice);
      if (data) {
        for (const a of data) assignedEntityIds.add(a.entity_id);
      }
    }

    const unassigned = allEntityIds.filter(id => !assignedEntityIds.has(id));
    if (unassigned.length > 0) {
      for (const rs of ruleSets) {
        for (let i = 0; i < unassigned.length; i += BATCH) {
          const slice = unassigned.slice(i, i + BATCH);
          const assignments = slice.map(entityId => ({
            tenant_id: tenantId,
            rule_set_id: rs.id,
            entity_id: entityId,
          }));
          await supabase.from('rule_set_assignments').insert(assignments);
        }
      }
      console.log(`[SCI Bulk] Created assignments for ${unassigned.length} entities × ${ruleSets.length} rule sets`);
    }
  }

  // Bind entity_id on committed_data rows
  const entityIdMap = new Map<string, string>();
  for (let i = 0; i < allIds.length; i += BATCH) {
    const slice = allIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);
    if (data) {
      for (const e of data) {
        if (e.external_id) entityIdMap.set(e.external_id, e.id);
      }
    }
  }

  let entityBound = 0;
  let page = 0;
  while (true) {
    const { data: unboundRows } = await supabase
      .from('committed_data')
      .select('id, row_data')
      .eq('tenant_id', tenantId)
      .eq('import_batch_id', importBatchId)
      .is('entity_id', null)
      .limit(500);

    if (!unboundRows || unboundRows.length === 0) break;

    const groups = new Map<string, string[]>();
    for (const r of unboundRows) {
      const rd = r.row_data as Record<string, unknown>;
      const extId = String(rd[entityIdField] ?? '').trim();
      const eid = entityIdMap.get(extId);
      if (eid) {
        if (!groups.has(eid)) groups.set(eid, []);
        groups.get(eid)!.push(r.id);
      }
    }

    for (const [entityId, ids] of Array.from(groups.entries())) {
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        await supabase.from('committed_data').update({ entity_id: entityId }).in('id', slice);
        entityBound += slice.length;
      }
    }

    page++;
    if (unboundRows.length < 500 || page > 500) break;
  }
  if (entityBound > 0) {
    console.log(`[SCI Bulk] Bound entity_id on ${entityBound} committed_data rows`);
  }

  // OB-146: Populate entity store metadata
  const STORE_FIELDS = ['storeId', 'num_tienda', 'No_Tienda', 'Tienda'];
  const TIER_FIELDS = ['store_volume_tier', 'Rango_Tienda', 'Rango de Tienda'];
  const VOLUME_KEY_FIELDS = ['LLave Tamaño de Tienda'];

  const empToStore = new Map<string, string>();
  const empToTier = new Map<string, string>();
  const empToVolumeKey = new Map<string, string>();

  for (const row of rows) {
    const empId = String(row[entityIdField] ?? '').trim();
    if (!empId) continue;

    if (!empToStore.has(empId)) {
      for (const f of STORE_FIELDS) {
        const val = row[f];
        if (val != null && String(val).trim()) {
          empToStore.set(empId, String(val).trim());
          break;
        }
      }
    }

    if (!empToTier.has(empId)) {
      for (const f of TIER_FIELDS) {
        const val = row[f];
        if (val != null && String(val).trim()) {
          empToTier.set(empId, String(val).trim());
          break;
        }
      }
    }

    if (!empToVolumeKey.has(empId)) {
      for (const f of VOLUME_KEY_FIELDS) {
        const val = row[f];
        if (val != null && String(val).trim()) {
          empToVolumeKey.set(empId, String(val).trim());
          break;
        }
      }
    }
  }

  if (empToStore.size > 0) {
    const allEmpIds = Array.from(empToStore.keys());
    let storeUpdated = 0;

    for (let i = 0; i < allEmpIds.length; i += BATCH) {
      const slice = allEmpIds.slice(i, i + BATCH);
      const { data: ents } = await supabase
        .from('entities')
        .select('id, external_id, metadata')
        .eq('tenant_id', tenantId)
        .in('external_id', slice);

      if (!ents) continue;

      for (const ent of ents) {
        const extId = ent.external_id ?? '';
        const store = empToStore.get(extId);
        if (!store) continue;

        const existingMeta = (ent.metadata ?? {}) as Record<string, unknown>;
        if (existingMeta.store_id === store) continue;

        const newMeta: Record<string, unknown> = { ...existingMeta, store_id: store };
        const tier = empToTier.get(extId);
        if (tier) newMeta.volume_tier = tier;
        const volKey = empToVolumeKey.get(extId);
        if (volKey) newMeta.volume_key = volKey;

        await supabase
          .from('entities')
          .update({ metadata: newMeta })
          .eq('id', ent.id)
          .eq('tenant_id', tenantId);
        storeUpdated++;
      }
    }

    if (storeUpdated > 0) {
      console.log(`[SCI Bulk] Updated store metadata for ${storeUpdated} entities`);
    }
  }
}
