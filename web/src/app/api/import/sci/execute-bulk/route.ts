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
// HF-231: source_date extraction, supersession, hashing, field_identities, and
// data_type resolution all moved into commitContentUnit. Only the file-hash
// helper is still needed at this layer (computed once over the raw file bytes
// and threaded into commitContentUnit per content unit).
import { computeFileHashSha256 } from '@/lib/sci/file-content-hash';
// HF-196 Phase 1: post-commit construction unified across both import endpoints.
// Closes Break #3 (import surface fragmentation): execute-bulk now runs the same
// post-commit work as execute (entity resolution + entity_id back-link).
// This restores OB-182's stated calc-time intent at the import side AND closes
// Break #2 by ensuring entity_id is populated for bulk-imported rows.
import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
// HF-231: unified committed_data writer — sole write surface across all four
// classifications. Replaces 4 inline write sites in this route (plus 4 in
// execute/route.ts). Closes AP-17 (parallel metadata construction).
import { commitContentUnit } from '@/lib/sci/commit-content-unit';

// Processing order: plan first, then entity, then data
const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
  reference: 4,
};

// HF-196 Phase 1D: normalizeFileNameToDataType deleted — D154 violation removed.
// data_type now derives from SCI classification via @/lib/sci/data-type-resolver
// (single canonical surface). Function definition still present in commit/route.ts
// and intelligence/wire/route.ts; those paths use commit's distinct vocabulary
// ('roster' | 'component_data' | ...) and are out of HF-196 scope per architect-
// disposition surface (see commit message + carry-forward).

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
    // HF-196 Phase 1F: compute SHA-256 of file content bytes ONCE; thread to all
    // process functions for import_batches.file_hash_sha256 + supersession trigger.
    const fileHashSha256 = computeFileHashSha256(buffer);
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
          effectiveUnit.unit, effectiveUnit.rows, fileNameFromPath, tabName,
          fileHashSha256,
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

    // HF-196 Phase 1: post-commit construction (Break #3 closure).
    // Run entity resolution + entity_id back-link via shared module after all
    // content units processed. This is the symmetry that was missing from
    // execute-bulk after OB-182; restores it via the shared post-commit module.
    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });

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
// HF-236 (DIAG-050 closure): Per T1-E902 v2 (Carry Everything, Express
// Contextually — locked 2026-05-18: Persistence scope persists ALL data;
// Hints-not-gates: AI classifications do not gate persistence) and T2-E06
// v2 (HC Override Authority — locked 2026-05-18: HC observations persist
// to committed_data irrespective of claim type; automated narrowing of
// the HC observation set during claim-type projection is a named
// violation pattern), the PARTIAL claim primitive narrows agent
// ownership semantics only. row_data persists unconditionally; the
// confirmedBindings narrow to the agent's owned + shared field set so
// downstream code that consults bindings sees the agent's semantic
// claim, while persistence-time code that reads rows sees every column
// the customer's file carries.

function filterFieldsForPartialClaim(
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
): { unit: BulkContentUnit; rows: Record<string, unknown>[] } {
  if (unit.claimType !== 'PARTIAL' || !unit.ownedFields || !unit.sharedFields) {
    return { unit, rows };
  }

  const allowedFields = new Set([...unit.ownedFields, ...unit.sharedFields]);

  const filteredBindings = unit.confirmedBindings.filter(
    b => allowedFields.has(b.sourceField)
  );

  return {
    unit: { ...unit, confirmedBindings: filteredBindings },
    rows,
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
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  switch (unit.confirmedClassification) {
    case 'entity':
      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
    case 'target':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
    case 'transaction':
      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
    case 'reference':
      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
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
  proposalId: string,
  unit: BulkContentUnit,
  rows: Record<string, unknown>[],
  fileName: string,
  tabName: string,
  fileHashSha256: string,
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
          ...(meta?.enrichment || {}),  // HF-190: All enrichment fields in metadata for scope resolution
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

    // HF-190: Spread ALL enrichment fields into metadata (not just role)
    {
      const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
      const existingMeta = (entData?.metadata ?? {}) as Record<string, unknown>;
      const mergedMeta = {
        ...existingMeta,
        ...meta.enrichment,  // HF-190: All enrichment fields in metadata for scope resolution
        ...(meta.role ? { role: meta.role } : {}),
      };
      const metaChanged = JSON.stringify(existingMeta) !== JSON.stringify(mergedMeta);
      if (metaChanged || newAttrs.length !== existingAttrs.length) {
        await supabase.from('entities').update({
          temporal_attributes: newAttrs as unknown as Json[],
          metadata: mergedMeta as unknown as Json,
        }).eq('id', entityId);
        enriched++;
        continue;
      }
    }

    // HF-190: temporal-only update path removed — unified update above handles both metadata + temporal
  }

  console.log(`[SCI Bulk] Entity: ${created} new, ${existingMap.size} existing, ${enriched} enriched`);

  // HF-231: Unified committed_data write via shared commitContentUnit.
  // Entity creation above is a side effect; committed_data is the uniform store.
  // Classification is a hint, not a gate — all four pipelines carry the same
  // metadata shape through this single writer.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'entity',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  const cdInserted = commitResult.totalInserted;

  // OB-195 Layer 4: Invalidate cached convergence bindings
  if (cdInserted > 0) {
    const { data: clearedRuleSets } = await supabase
      .from('rule_sets')
      .update({ input_bindings: {} })
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'draft'])
      .select('id');
    if ((clearedRuleSets?.length ?? 0) > 0) {
      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (entity data imported — convergence will re-derive)`);
    }
  }

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
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification, success: true, rowsProcessed: 0, pipeline: classification };
  }

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification,
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  const totalInserted = commitResult.totalInserted;

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
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  // OB-195 Layer 1: Reference pipeline → committed_data (Decision 111)
  // Previously wrote to reference_data + reference_items (deprecated).
  // Now follows processDataUnit pattern: all data → committed_data.
  // Engine aggregates all numeric fields at calc time (aggregateMetrics sums across all rows).
  if (rows.length === 0) {
    return { contentUnitId: unit.contentUnitId, classification: 'reference', success: true, rowsProcessed: 0, pipeline: 'reference' };
  }

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'reference',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-bulk-${proposalId}`,
    source: 'sci-bulk',
    fileHashSha256,
  });
  if (!commitResult.success && commitResult.totalInserted === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'reference',
      success: false,
      rowsProcessed: 0,
      pipeline: 'reference',
      error: commitResult.error,
    };
  }
  const totalInserted = commitResult.totalInserted;

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

// HF-196 Phase 1: dead-code retirement.
// The legacy `_postCommitConstruction_REMOVED` function (deferred-by-OB-182,
// retained as dead code reference at this position pending calc-time
// replacement) is superseded by `executePostCommitConstruction` in
// `@/lib/sci/post-commit-construction`. It carried Korean-Test violations
// (hardcoded Spanish/English store-metadata field names) that must not
// be re-introduced. Deleted in HF-196 Phase 1 per directive SR-41 disposition
// (function never reached production under this name; clean deletion).
// Any future store-metadata population must derive field names from
// field_identities metadata (Korean Test compliant) rather than hardcoded lists.
