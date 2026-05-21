# AUD-012 — Execute / Execute-Bulk Comprehensive Trace

**Branch:** `aud-012-import-path-trace` off `main @ b7bd5bea` (DIAG-052 squash merge)
**Date captured:** 2026-05-19
**Scope:** Read-only audit. No code changes; no file modifications. No interpretation.

Eight probes follow. Each section pastes verbatim code, grep output, or diff output.

---

## PROBE 1 — Full route structure

### 1A — `execute-bulk/route.ts` function map

`grep -nE "^export|^async function|^function|processEntityUnit|processDataUnit|processReferenceUnit|processPlanUnit" web/src/app/api/import/sci/execute-bulk/route.ts`

```
5:export const runtime = 'nodejs';
6:export const maxDuration = 300; // Vercel Pro max
72:export async function POST(req: NextRequest) {
277:function filterFieldsForPartialClaim(
299:async function processContentUnit(
312:      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
314:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
316:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
318:      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
333:async function processEntityUnit(
546:async function processDataUnit(
590:  // Entity creation for roster imports still handled by processEntityUnit (separate path).
609:async function processReferenceUnit(
623:  // Now follows processDataUnit pattern: all data → committed_data.
653:  // OB-195 Layer 4: Invalidate cached convergence bindings (same as processDataUnit)
```

`processContentUnit` dispatcher (lines 297-329) — notice the absence of a `case 'plan':` arm. execute-bulk does not handle plan classification.

```typescript
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
```

POST handler header (lines 72-155) — file download from Supabase Storage + parse + SHA computation:

```typescript
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
```

POST handler tail (lines 200-261) — dispatch loop + `executePostCommitConstruction` call + response:

```typescript
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
```

`processEntityUnit` (lines 333-542): unique to execute-bulk — performs entity creation/enrichment BEFORE `commitContentUnit`:

```typescript
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
```

`processDataUnit` (lines 546-605):

```typescript
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
```

`processReferenceUnit` (lines 609-667):

```typescript
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
```

### 1B — `execute/route.ts` function map

`grep -nE "^export|^async function|^function|executeEntityPipeline|executeTransactionPipeline|executeTargetPipeline|executeReferencePipeline|executeBatchedPlanInterpretation" web/src/app/api/import/sci/execute/route.ts`

```
7:export const runtime = 'nodejs';
8:export const maxDuration = 300; // Vercel Pro max
48:export async function POST(req: NextRequest) {
78:    // import_batches. Plan path goes through executeBatchedPlanInterpretation /
136:        const batchResults = await executeBatchedPlanInterpretation(
394:async function executeContentUnit(
409:      return executeTargetPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
411:      return executeTransactionPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
413:      return executeEntityPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
417:      return executeReferencePipeline(supabase, tenantId, proposalId, effectiveUnit, userId, fileHashSha256!);
427:function filterFieldsForPartialClaim(unit: ContentUnitExecution): ContentUnitExecution {
449:async function executeTargetPipeline(
516:async function executeTransactionPipeline(
583:async function executeEntityPipeline(
644:async function executeReferencePipeline(
709:async function executeBatchedPlanInterpretation(
972:async function executePlanPipeline(
1228:async function postCommitConstruction(
1238:  // Only entity-classified content units create entities (via executeEntityPipeline).
```

POST handler header + plan-batch dispatch (lines 48-164):

```typescript
export async function POST(req: NextRequest) {
  try {
    // HF-084: Get authenticated user ID for created_by fields
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body: SCIExecutionRequest = await req.json();
    const { proposalId, tenantId, contentUnits, storagePath } = body;

    if (!tenantId || !proposalId || !contentUnits || contentUnits.length === 0) {
      return NextResponse.json(
        { error: 'tenantId, proposalId, and contentUnits required' },
        { status: 400 }
      );
    }

    // HF-090: Use auth.uid() directly for created_by attribution (JWT-verified identity)
    const profileId = authUser.id;

    // HF-196 Phase 1F-corrective: Compute SHA-256 over RAW FILE BYTES (not parsed
    // JSON intermediates per FP-43 / AP-34 / OB-50). Single canonical computation
    // per request; threaded through all dispatch pipelines that insert into
    // import_batches. Plan path goes through executeBatchedPlanInterpretation /
    // executePlanPipeline and uses HF-132 rule_sets-layer supersession (not
    // import_batches Phase 1F supersession), so plan-only requests do not require
    // SHA. Non-plan requests REQUIRE storagePath + successful download.
    let fileHashSha256: string | null = null;
    if (storagePath) {
      try {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from('ingestion-raw')
          .download(storagePath);
        if (dlErr || !fileData) {
          console.error(`[SCI Execute Phase 1F] file download failed for SHA: ${dlErr?.message ?? 'no data'}`);
        } else {
          const fileBuffer = Buffer.from(await fileData.arrayBuffer());
          fileHashSha256 = computeFileHashSha256(fileBuffer);
        }
      } catch (err) {
        console.error(`[SCI Execute Phase 1F] file fetch threw (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const nonPlanExists = contentUnits.some(u => u.confirmedClassification !== 'plan');
    if (nonPlanExists && !fileHashSha256) {
      return NextResponse.json(
        { error: 'Phase 1F: storagePath required for non-plan import (file_hash_sha256 mandatory per Rule 30 + OB-50 supersession primitive)' },
        { status: 400 }
      );
    }

    // Verify tenant exists + read industry for domain flywheel (OB-160J)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantSettings = (tenant.settings as Record<string, unknown>) ?? {};
    const tenantDomainId = (tenantSettings.industry as string) || '';

    const results: ContentUnitResult[] = [];

    // HF-109: Pipeline order — reference before data for convergence, plan independent
    // Entity resolution is post-import (DS-009 3.3), so no ordering constraint for entity pipeline
    const PIPELINE_ORDER: Record<string, number> = { reference: 0, entity: 1, target: 1, transaction: 1, plan: 2 };
    const sorted = [...contentUnits].sort((a, b) =>
      (PIPELINE_ORDER[a.confirmedClassification] ?? 9) - (PIPELINE_ORDER[b.confirmedClassification] ?? 9)
    );

    // HF-130: Batch all plan-classified units from the same file into ONE interpretation call.
    // A multi-sheet XLSX plan (e.g., overview + rate tables + targets) must be interpreted as
    // a single document — the AI needs cross-sheet context to extract complete components.
    const planUnits = sorted.filter(u => u.confirmedClassification === 'plan');
    const handledPlanUnitIds = new Set<string>();

    if (planUnits.length > 0 && storagePath) {
      try {
        const batchResults = await executeBatchedPlanInterpretation(
          supabase, tenantId, planUnits, profileId, storagePath
        );
        for (const r of batchResults) {
          results.push(r);
          handledPlanUnitIds.add(r.contentUnitId);
        }
      } catch (err) {
        // If batched interpretation fails, fall through to per-unit processing
        console.error('[SCI Execute] Batched plan interpretation failed, falling back to per-unit:', err);
      }
    }

    for (const unit of sorted) {
      if (handledPlanUnitIds.has(unit.contentUnitId)) continue; // HF-130: already handled in batch
      try {
        const result = await executeContentUnit(supabase, tenantId, proposalId, unit, profileId, storagePath, fileHashSha256);
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
```

POST handler tail (lines 165-392) — `executePostCommitConstruction`, HF-126 rule_set_assignments creation, flywheel signal emission:

```typescript

    // HF-224: Import-time convergence (OB-160G) removed. Convergence binding is
    // performed at calc time (HF-165) so each calculation run sees a complete
    // dataset and a fresh component-binding decision. Pre-HF-224 the partial
    // bindings written here could prevent HF-165 from re-running cleanly.

    // HF-196 Phase 1: post-commit construction via shared module (Break #3 closure).
    // Entity resolution + entity_id back-link runs identically for both import endpoints.
    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-execute' });

    // HF-126: Auto-create rule_set_assignments after entity resolution.
    // The calculation engine requires assignments to route entities to plans.
    // This runs AFTER entity resolution so all entities exist.
    try {
      const { data: activeRuleSets } = await supabase
        .from('rule_sets')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      if (activeRuleSets && activeRuleSets.length > 0) {
        // Fetch all entity IDs for this tenant
        const ASSIGN_PAGE = 1000;
        const allEntityIds: string[] = [];
        let page = 0;
        while (true) {
          const { data: entityPage } = await supabase
            .from('entities')
            .select('id')
            .eq('tenant_id', tenantId)
            .range(page * ASSIGN_PAGE, (page + 1) * ASSIGN_PAGE - 1);
          if (!entityPage || entityPage.length === 0) break;
          allEntityIds.push(...entityPage.map(e => e.id));
          if (entityPage.length < ASSIGN_PAGE) break;
          page++;
        }

        if (allEntityIds.length > 0) {
          // Check which entities already have assignments
          const assignedSet = new Set<string>();
          for (let i = 0; i < allEntityIds.length; i += ASSIGN_PAGE) {
            const slice = allEntityIds.slice(i, i + ASSIGN_PAGE);
            const { data: existing } = await supabase
              .from('rule_set_assignments')
              .select('entity_id, rule_set_id')
              .eq('tenant_id', tenantId)
              .in('entity_id', slice);
            if (existing) {
              for (const a of existing) assignedSet.add(`${a.entity_id}:${a.rule_set_id}`);
            }
          }

          // Build missing assignments
          const newAssignments: Array<{
            tenant_id: string;
            rule_set_id: string;
            entity_id: string;
            assignment_type: string;
            metadata: Record<string, never>;
          }> = [];
          for (const rs of activeRuleSets) {
            for (const entityId of allEntityIds) {
              if (!assignedSet.has(`${entityId}:${rs.id}`)) {
                newAssignments.push({
                  tenant_id: tenantId,
                  rule_set_id: rs.id,
                  entity_id: entityId,
                  assignment_type: 'direct',
                  metadata: {},
                });
              }
            }
          }

          if (newAssignments.length > 0) {
            const INSERT_BATCH = 5000;
            for (let i = 0; i < newAssignments.length; i += INSERT_BATCH) {
              const slice = newAssignments.slice(i, i + INSERT_BATCH);
              const { error: insertErr } = await supabase
                .from('rule_set_assignments')
                .insert(slice);
              if (insertErr) {
                console.error(`[SCI Execute] HF-126 assignment insert batch ${i} error:`, insertErr.message);
              }
            }
            console.log(`[SCI Execute] HF-126: Created ${newAssignments.length} rule_set_assignments for ${allEntityIds.length} entities x ${activeRuleSets.length} rule sets`);
          } else {
            console.log(`[SCI Execute] HF-126: All ${allEntityIds.length} entities already assigned`);
          }
        }
      }
    } catch (assignErr) {
      console.error('[SCI Execute] HF-126 assignment creation failed (non-blocking):', assignErr);
    }

    const response: SCIExecutionResult = {
      proposalId,
      results,
      overallSuccess: results.every(r => r.success),
    };

    // OB-160E/HF-094: Write classification signals via dedicated columns (fire-and-forget)
    // Single write path: writeClassificationSignal (HF-092 dedicated columns)
    try {
      for (const unit of contentUnits) {
        if (!unit.structuralFingerprint) continue;

        const originalClassification = unit.originalClassification || unit.confirmedClassification;
        const wasOverridden = originalClassification !== unit.confirmedClassification;
        const traceData = unit.classificationTrace as ClassificationTrace | undefined;

        // OB-199 Phase 4 supplement A: thin facade re-establishes SCI structural markers.
        // Decision 30 v2 inclusive bound: confidence=1.0 on human-override admissible.
        const confidenceValue = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
        writeClassificationSignal({
          tenantId,
          sourceFileName: unit.sourceFile || '',
          sheetName: unit.tabName || '',
          fingerprint: unit.structuralFingerprint as unknown as StructuralFingerprint,
          classification: unit.confirmedClassification,
          confidence: confidenceValue,
          decisionSource: wasOverridden ? 'human_override' : (traceData?.decisionSource || 'heuristic'),
          classificationTrace: (traceData ?? ({} as unknown as ClassificationTrace)),
          vocabularyBindings: unit.vocabularyBindings || null,
          agentScores: traceData
            ? Object.fromEntries(traceData.round1.map(s => [s.agent, s.confidence]))
            : {},
          humanCorrectionFrom: wasOverridden ? originalClassification : null,
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[SCIExecute] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[SCIExecute] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });

        // OB-160I: Aggregate anonymized structural pattern to foundational scope (fire-and-forget)
        // Privacy: only structural fingerprint + classification + confidence cross the tenant boundary
        const aggConfidence = wasOverridden ? 1.0 : (unit.originalConfidence || 0);
        aggregateToFoundational(
          unit.structuralFingerprint as unknown as StructuralFingerprint,
          unit.confirmedClassification,
          aggConfidence,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

        // OB-160J: Aggregate to domain scope (fire-and-forget)
        aggregateToDomain(
          unit.structuralFingerprint as unknown as StructuralFingerprint,
          unit.confirmedClassification,
          aggConfidence,
          tenantDomainId,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});

        // HF-181 Layer 2: Update fingerprint with CONFIRMED bindings (fire-and-forget)
        // The analyze route wrote the fingerprint from pre-LLM structural-only bindings.
        // After user confirmation, update with the confirmed roles so future Tier 1 lookups
        // have correct semantic roles (especially entity_identifier).
        //
        // HF-236 (DIAG-050 closure Layer 1): Enrich each cached binding with the
        // native HeaderInterpretation.columnRole + identifiesWhat from the HC
        // trace so the next Tier-1 replay can reconstruct HeaderInterpretation
        // directly without a hardcoded semanticRole→columnRole registry. Per
        // T1-E910 v2 (Korean Test, locked 2026-05-18): structural primitives
        // exist in exactly one canonical declaration. Caching the native role
        // alongside the semantic role makes the flywheel-replay path emit the
        // same HeaderInterpretation shape as the fresh-LLM path — closing the
        // Adjacent-Arm Drift (T1-E952) that DIAG-050 identified.
        if (unit.confirmedBindings && unit.confirmedBindings.length > 0 && unit.rawData && unit.rawData.length > 0) {
          const cols = Object.keys(unit.rawData[0]);
          const hash = computeFingerprintHashSync(cols, unit.rawData.slice(0, 5));
          const confirmedColumnRoles: Record<string, string> = {};
          for (const binding of unit.confirmedBindings) {
            if (binding.sourceField && binding.semanticRole) {
              confirmedColumnRoles[binding.sourceField] = binding.semanticRole;
            }
          }

          // HF-236: read native columnRole + identifiesWhat from classificationTrace's
          // headerComprehension.interpretations to enrich each cached binding.
          const hcInterps = (unit.classificationTrace as Record<string, unknown> | undefined)
            ?.headerComprehension as
              | { interpretations?: Record<string, { columnRole?: string; identifiesWhat?: string }> }
              | undefined;
          const interpMap = hcInterps?.interpretations ?? {};

          const enrichedFieldBindings = unit.confirmedBindings.map(b => {
            const interp = interpMap[b.sourceField];
            return {
              ...b,
              ...(interp?.columnRole ? { columnRole: interp.columnRole } : {}),
              ...(interp?.identifiesWhat ? { identifiesWhat: interp.identifiesWhat } : {}),
            };
          });

          writeFingerprint(
            tenantId,
            hash,
            {
              classification: unit.confirmedClassification,
              confidence: 1.0,
              fieldBindings: enrichedFieldBindings,
              tabName: unit.tabName || '',
            },
            confirmedColumnRoles,
            unit.sourceFile || '',
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          ).catch(() => {});
        }
      }
    } catch {
      // Flywheel signal failure must NEVER block import
    }

    return NextResponse.json(response);

  } catch (err) {
    console.error('[SCI Execute] Error:', err);
    return NextResponse.json(
      { error: 'Execution failed', details: String(err) },
      { status: 500 }
    );
  }
}
```

`executeContentUnit` dispatcher (lines 394-419) — five-arm switch including `plan`:

```typescript
async function executeContentUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  userId: string,
  storagePath: string | undefined,
  fileHashSha256: string | null,
): Promise<ContentUnitResult> {
  // OB-134: For PARTIAL claims, filter rawData to only include owned + shared fields
  const effectiveUnit = filterFieldsForPartialClaim(unit);

  switch (effectiveUnit.confirmedClassification) {
    case 'target':
      // POST handler validation guarantees fileHashSha256 non-null for non-plan classifications.
      return executeTargetPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
    case 'transaction':
      return executeTransactionPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
    case 'entity':
      return executeEntityPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
    case 'plan':
      return executePlanPipeline(supabase, tenantId, effectiveUnit, userId, storagePath);
    case 'reference':
      return executeReferencePipeline(supabase, tenantId, proposalId, effectiveUnit, userId, fileHashSha256!);
  }
}
```

`executeTargetPipeline` (lines 449-510):

```typescript
async function executeTargetPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'target',
      success: true,
      rowsProcessed: 0,
      pipeline: 'target',
    };
  }

  // tabName retained for row_data._sheetName provenance.
  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'target',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'target',
      success: false,
      rowsProcessed: commitResult.totalInserted,
      pipeline: 'target',
      error: commitResult.error,
    };
  }

  const totalInserted = commitResult.totalInserted;

  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
  // OB-144: Post-commit construction — create assignments, bind entity_id, store metadata
  await postCommitConstruction(supabase, tenantId, commitResult.batchId, commitResult.entityIdField ?? undefined, unit);

  // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete
  console.log(`[SCI Execute] Target pipeline complete: ${totalInserted} rows`);

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'target',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'target',
  };
}
```

`executeTransactionPipeline` (lines 516-575):

```typescript
async function executeTransactionPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'transaction',
      success: true,
      rowsProcessed: 0,
      pipeline: 'transaction',
    };
  }

  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'transaction',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'transaction',
      success: false,
      rowsProcessed: commitResult.totalInserted,
      pipeline: 'transaction',
      error: commitResult.error,
    };
  }

  const totalInserted = commitResult.totalInserted;

  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
  // OB-144: Post-commit construction — create assignments, bind entity_id, store metadata
  await postCommitConstruction(supabase, tenantId, commitResult.batchId, commitResult.entityIdField ?? undefined, unit);

  // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'transaction',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'transaction',
  };
}
```

`executeEntityPipeline` (lines 583-636) — note: this is shorter than execute-bulk's `processEntityUnit` because entity creation is deferred to `executePostCommitConstruction`:

```typescript
async function executeEntityPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'entity',
      success: true,
      rowsProcessed: 0,
      pipeline: 'entity',
    };
  }

  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  // HF-109 contract preserved: entity_id stays NULL at import, backfilled
  // post-import by resolveEntitiesFromCommittedData (DS-009 3.3).
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'entity',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'entity' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'entity',
      error: commitResult.error,
    };
  }

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'entity',
    success: true,
    rowsProcessed: commitResult.totalInserted,
    pipeline: 'entity',
  };
}
```

`executeReferencePipeline` (lines 644-701):

```typescript
async function executeReferencePipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution,
  userId: string,
  fileHashSha256: string,
): Promise<ContentUnitResult> {
  void userId; // No longer needed — reference_data.created_by not used
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'reference',
      success: true,
      rowsProcessed: 0,
      pipeline: 'reference',
    };
  }

  const tabName = unit.contentUnitId.split('::')[1] || 'Sheet1';

  // HF-231: Unified committed_data write via shared commitContentUnit.
  // OB-162 / Decision 111 contract preserved: reference data flows to
  // committed_data only — no writes to reference_data / reference_items.
  const commitResult = await commitContentUnit(supabase, {
    unit,
    rows,
    classification: 'reference',
    tenantId,
    proposalId,
    tabName,
    fileName: `sci-execute-${proposalId}`,
    source: 'sci',
    fileHashSha256,
  });

  if (!commitResult.success) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'reference',
      success: false,
      rowsProcessed: commitResult.totalInserted,
      pipeline: 'reference',
      error: commitResult.error,
    };
  }

  const totalInserted = commitResult.totalInserted;

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'reference',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'reference',
  };
}
```

`executeBatchedPlanInterpretation` (lines 709-965) — plan-classified content unit batching, AI interpretation, rule_set upsert with `input_bindings` populated, plan-comprehension signal emission. **execute-bulk has no equivalent function.**

```typescript
async function executeBatchedPlanInterpretation(
  supabase: SupabaseClient,
  tenantId: string,
  planUnits: ContentUnitExecution[],
  userId: string,
  storagePath: string,
): Promise<ContentUnitResult[]> {
  // Use first unit's contentUnitId as the primary (for rule_set metadata)
  const primaryUnit = planUnits[0];
  const primaryContentUnitId = primaryUnit.contentUnitId;

  // HF-133: Removed "already exists" early return — stale draft rule_sets from prior
  // failed runs were short-circuiting the HF-129/130/131/132 chain. HF-132's supersede
  // logic handles duplicates: old rule_sets get status='superseded', new one gets 'active'.

  // Download file from storage
  console.log(`[SCI Execute] Batched plan interpretation: ${planUnits.length} sheets from ${storagePath}`);
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from('ingestion-raw')
    .download(storagePath);

  if (downloadErr || !fileData) {
    console.error(`[SCI Execute] Storage download failed: ${downloadErr?.message || 'No data'}`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: `Failed to download plan file: ${downloadErr?.message || 'No data'}`,
    }));
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  const ext = storagePath.split('.').pop()?.toLowerCase();

  // Extract text content from the file
  let documentContent = '';
  let pdfBase64ForAI: string | undefined;
  let pdfMediaType: string | undefined;

  if (ext === 'pdf') {
    pdfBase64ForAI = fileBuffer.toString('base64');
    pdfMediaType = 'application/pdf';
    documentContent = `[PDF document: ${pdfBase64ForAI.length} bytes base64]`;
  } else if (ext === 'xlsx' || ext === 'xls') {
    // XLSX: Extract text from ALL plan-classified sheets using xlsx library
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Build a set of sheet names from the plan units' tab names
    const planSheetNames = new Set(planUnits.map(u => u.tabName).filter(Boolean));

    const sheetTexts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      // Include sheets that are plan-classified, or ALL sheets if we can't match by name
      // (fallback ensures the AI gets full context even if tabName doesn't match exactly)
      if (planSheetNames.size > 0 && !planSheetNames.has(sheetName)) continue;

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      // Convert sheet to array of arrays for text representation
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length === 0) continue;

      sheetTexts.push(`=== Sheet: ${sheetName} ===`);
      for (const row of rows) {
        const values = (row as unknown[]).map(v => String(v ?? '').trim());
        if (values.some(v => v !== '')) {
          sheetTexts.push(values.join('\t'));
        }
      }
      sheetTexts.push(''); // blank line between sheets
    }

    // If no plan sheets matched by name, fall back to ALL sheets
    if (sheetTexts.length === 0) {
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;
        const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (rows.length === 0) continue;
        sheetTexts.push(`=== Sheet: ${sheetName} ===`);
        for (const row of rows) {
          const values = (row as unknown[]).map(v => String(v ?? '').trim());
          if (values.some(v => v !== '')) {
            sheetTexts.push(values.join('\t'));
          }
        }
        sheetTexts.push('');
      }
    }

    documentContent = sheetTexts.join('\n');
    console.log(`[SCI Execute] XLSX plan text extracted: ${documentContent.length} chars from ${planSheetNames.size} sheets`);
  } else {
    // PPTX/DOCX: extract text via JSZip (existing logic)
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(fileBuffer);

    if (ext === 'pptx') {
      const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      const texts: string[] = [];
      for (const sf of slideFiles) {
        const content = await zip.file(sf)?.async('string');
        if (!content) continue;
        const matches = Array.from(content.matchAll(/<a:t>([^<]*)<\/a:t>/g));
        for (const m of matches) {
          const t = m[1].trim();
          if (t) texts.push(t);
        }
      }
      documentContent = texts.join('\n');
    } else {
      // DOCX
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        const matches = Array.from(docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g));
        documentContent = matches.map(m => m[1].trim()).filter(Boolean).join(' ');
      }
    }
  }

  if (!documentContent && !pdfBase64ForAI) {
    console.log(`[SCI Execute] No document content extracted from ${storagePath}`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: 'No document content could be extracted from the plan file',
    }));
  }

  // ONE AI interpretation call with combined content from all sheets
  console.log(`[SCI Execute] Batched plan interpretation starting — ${documentContent.length} chars`);
  const { getAIService } = await import('@/lib/ai');
  const aiService = getAIService();

  const response = await aiService.interpretPlan(
    documentContent,
    pdfBase64ForAI ? 'pdf' : 'text',
    { tenantId },
    pdfBase64ForAI,
    pdfMediaType
  );

  const interpretation = response.result;

  if (interpretation.fallback || interpretation.error) {
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: String(interpretation.error || 'AI interpretation returned no results'),
    }));
  }

  // Bridge AI output to engine format — ONE rule_set
  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
  const engineFormat = bridgeAIToEngineFormat(
    interpretation as Record<string, unknown>,
    tenantId,
    userId,
  );

  const ruleSetId = crypto.randomUUID();
  const filenameFallback = primaryContentUnitId.split('::')[0]?.replace(/\.[^.]+$/, '') || '';
  const planName = engineFormat.name || filenameFallback || 'Untitled Plan';

  // HF-132: Supersede any existing active rule_sets for this tenant before activating the new one
  await supabase
    .from('rule_sets')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const { error: upsertError } = await supabase
    .from('rule_sets')
    .upsert({
      id: ruleSetId,
      tenant_id: tenantId,
      name: planName,
      description: engineFormat.description || '',
      status: 'active' as const, // HF-132: Auto-activate on creation
      version: 1,
      population_config: {
        eligible_roles: [],
      },
      input_bindings: engineFormat.inputBindings as unknown as Json,
      components: engineFormat.components as unknown as Json,
      // OB-186: Store cadence from AI interpretation (defaults to monthly)
      cadence_config: { period_type: ((response as unknown as Record<string, unknown>).cadence as string) || 'monthly' } as unknown as Json,
      outcome_config: {},
      metadata: {
        plan_type: 'additive_lookup',
        source: 'sci',
        contentUnitId: primaryContentUnitId,
        batchedSheets: planUnits.map(u => u.contentUnitId),
        aiConfidence: response.confidence,
      } as unknown as Json,
      created_by: userId,
    });

  if (upsertError) {
    console.error('[SCI Execute] Batched plan save failed:', upsertError);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: upsertError.message,
    }));
  }

  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Batched plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components from ${planUnits.length} sheets`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2)
  // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim. PlanComponent (engine-format) drops
  // reasoning during convertComponent; routing to interpretation.components preserves it.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }

  // Return results: primary unit gets full result, others marked as included in batch
  return planUnits.map((u, i) => ({
    contentUnitId: u.contentUnitId,
    classification: 'plan' as const,
    success: true,
    rowsProcessed: i === 0 ? componentCount : 0,
    pipeline: i === 0 ? 'plan-interpretation' : 'plan-batch-included',
  }));
}
```

`executePlanPipeline` (lines 972-1215) — single-unit plan interpretation fallback:

```typescript
async function executePlanPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  unit: ContentUnitExecution,
  userId: string,
  storagePath?: string,
): Promise<ContentUnitResult> {
  // HF-133: Removed "already exists" early return — stale draft rule_sets from prior
  // failed runs were short-circuiting the HF-129/130/131/132 chain. HF-132's supersede
  // logic handles duplicates: old rule_sets get status='superseded', new one gets 'active'.

  const docMeta = unit.documentMetadata;
  let fileBase64 = docMeta?.fileBase64;
  let mimeType = docMeta?.mimeType;

  // HF-129: When fileBase64 is not in the request, retrieve from Supabase Storage
  if (!fileBase64 && storagePath) {
    console.log(`[SCI Execute] Plan ${unit.contentUnitId} — retrieving file from storage: ${storagePath}`);
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('ingestion-raw')
      .download(storagePath);

    if (downloadErr || !fileData) {
      console.error(`[SCI Execute] Storage download failed: ${downloadErr?.message || 'No data'}`);
      return {
        contentUnitId: unit.contentUnitId,
        classification: 'plan',
        success: false,
        rowsProcessed: 0,
        pipeline: 'plan-interpretation',
        error: `Failed to retrieve plan document from storage: ${downloadErr?.message || 'No data'}`,
      };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    fileBase64 = buffer.toString('base64');
    console.log(`[SCI Execute] Plan file retrieved from storage: ${(buffer.length / 1024).toFixed(1)}KB`);

    // Infer MIME type from storage path extension
    if (!mimeType) {
      const ext = storagePath.split('.').pop()?.toLowerCase();
      const MIME_MAP: Record<string, string> = {
        pdf: 'application/pdf',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        csv: 'text/csv',
      };
      mimeType = (ext && MIME_MAP[ext]) || 'application/octet-stream';
    }
  }

  if (!fileBase64) {
    // No document data and no storage path — fallback for tabular plan classification
    console.log(`[SCI Execute] Plan content unit ${unit.contentUnitId} — no document data, deferred`);
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'plan',
      success: true,
      rowsProcessed: 0,
      pipeline: 'plan-deferred',
    };
  }

  console.log(`[SCI Execute] Plan interpretation starting for ${unit.contentUnitId}`);

  // 1. Call plan interpretation API (same service as Configure → Plan Import)
  const { getAIService } = await import('@/lib/ai');
  const aiService = getAIService();

  const isPdf = mimeType === 'application/pdf';
  let documentContent = '';
  let pdfBase64: string | undefined;
  let pdfMediaType: string | undefined;

  if (isPdf) {
    pdfBase64 = fileBase64;
    pdfMediaType = 'application/pdf';
    documentContent = `[PDF document: ${fileBase64.length} bytes base64]`;
  } else if (mimeType?.includes('spreadsheetml') || mimeType?.includes('ms-excel') || unit.contentUnitId.endsWith('.xlsx') || unit.contentUnitId.endsWith('.xls')) {
    // HF-130: XLSX text extraction — extract all sheets as tab-separated text
    const XLSX = await import('xlsx');
    const buffer = Buffer.from(fileBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetTexts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length === 0) continue;
      sheetTexts.push(`=== Sheet: ${sheetName} ===`);
      for (const row of rows) {
        const values = (row as unknown[]).map(v => String(v ?? '').trim());
        if (values.some(v => v !== '')) {
          sheetTexts.push(values.join('\t'));
        }
      }
      sheetTexts.push('');
    }
    documentContent = sheetTexts.join('\n');
  } else {
    // For PPTX/DOCX, extract text server-side
    const JSZip = (await import('jszip')).default;
    const buffer = Buffer.from(fileBase64, 'base64');
    const zip = await JSZip.loadAsync(buffer);

    if (mimeType?.includes('presentationml') || unit.contentUnitId.endsWith('.pptx')) {
      // PPTX text extraction
      const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      const texts: string[] = [];
      for (const sf of slideFiles) {
        const content = await zip.file(sf)?.async('string');
        if (!content) continue;
        const matches = Array.from(content.matchAll(/<a:t>([^<]*)<\/a:t>/g));
        for (const m of matches) {
          const t = m[1].trim();
          if (t) texts.push(t);
        }
      }
      documentContent = texts.join('\n');
    } else {
      // DOCX text extraction
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        const matches = Array.from(docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g));
        documentContent = matches.map(m => m[1].trim()).filter(Boolean).join(' ');
      }
    }
  }

  const response = await aiService.interpretPlan(
    documentContent,
    isPdf ? 'pdf' : 'text',
    { tenantId },
    pdfBase64,
    pdfMediaType
  );

  const interpretation = response.result;

  if (interpretation.fallback || interpretation.error) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'plan',
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: String(interpretation.error || 'AI interpretation returned no results'),
    };
  }

  // 2. OB-155: Bridge AI output to engine-compatible format
  // The AI produces calculationType/calculationIntent; the engine needs componentType/tierConfig/matrixConfig etc.
  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
  const engineFormat = bridgeAIToEngineFormat(
    interpretation as Record<string, unknown>,
    tenantId,
    userId,
  );

  const ruleSetId = crypto.randomUUID();
  const filenameFallback = unit.contentUnitId.split('::')[0]?.replace(/\.[^.]+$/, '') || '';
  const planName = engineFormat.name || filenameFallback || 'Untitled Plan';

  // HF-132: Supersede any existing active rule_sets for this tenant before activating the new one
  await supabase
    .from('rule_sets')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const { error: upsertError } = await supabase
    .from('rule_sets')
    .upsert({
      id: ruleSetId,
      tenant_id: tenantId,
      name: planName,
      description: engineFormat.description || '',
      status: 'active' as const, // HF-132: Auto-activate on creation
      version: 1,
      population_config: {
        eligible_roles: [],
      },
      input_bindings: engineFormat.inputBindings as unknown as Json,
      components: engineFormat.components as unknown as Json,
      // OB-186: Store cadence from AI interpretation (defaults to monthly)
      cadence_config: { period_type: ((response as unknown as Record<string, unknown>).cadence as string) || 'monthly' } as unknown as Json,
      outcome_config: {},
      metadata: {
        plan_type: 'additive_lookup',
        source: 'sci',
        contentUnitId: unit.contentUnitId,
        aiConfidence: response.confidence,
      } as unknown as Json,
      created_by: userId,
    });

  if (upsertError) {
    console.error('[SCI Execute] Plan save failed:', upsertError);
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'plan',
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: upsertError.message,
    };
  }

  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2).
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'plan',
    success: true,
    rowsProcessed: componentCount,
    pipeline: 'plan-interpretation',
  };
}
```

`postCommitConstruction` (lines 1228-1465) — local per-pipeline helper that runs assignment creation, entity_id binding, and store-metadata population for target/transaction pipelines (separate from the shared `executePostCommitConstruction` module called from the POST handler):

```typescript
async function postCommitConstruction(
  supabase: SupabaseClient,
  tenantId: string,
  importBatchId: string,
  entityIdField: string | undefined,
  unit: ContentUnitExecution,
): Promise<void> {
  const BATCH = 200;

  // OB-157: Entity creation removed from postCommitConstruction.
  // Only entity-classified content units create entities (via executeEntityPipeline).
  // Target/transaction units bind to existing entities only.
  if (entityIdField) {
    // Collect unique identifiers from the imported data
    const allIdentifiers = new Set<string>();
    for (const row of unit.rawData) {
      const val = row[entityIdField];
      if (val != null && String(val).trim()) {
        allIdentifiers.add(String(val).trim());
      }
    }

    if (allIdentifiers.size > 0) {
      const allIds = Array.from(allIdentifiers);

      // OB-153: Create rule_set_assignments for ALL entities that lack them
      // (not just newly created — existing entities may also need assignments)
      const { data: ruleSets } = await supabase
        .from('rule_sets')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'draft']);

      if (ruleSets && ruleSets.length > 0) {
        // Fetch ALL entity IDs for these identifiers
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

        // Check which entities already have assignments
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
          console.log(`[SCI Execute] Created assignments for ${unassigned.length} unassigned entities × ${ruleSets.length} rule sets`);
        }
      }

      // Bind entity_id on committed_data rows for this import batch
      // Build entity_id map (including newly created entities)
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

      // Update committed_data rows that have NULL entity_id
      let entityBound = 0;
      let page = 0;
      while (true) {
        const { data: rows } = await supabase
          .from('committed_data')
          .select('id, row_data')
          .eq('tenant_id', tenantId)
          .eq('import_batch_id', importBatchId)
          .is('entity_id', null)
          .limit(500);

        if (!rows || rows.length === 0) break;

        const groups = new Map<string, string[]>();
        for (const r of rows) {
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
        if (rows.length < 500 || page > 200) break;
      }
      if (entityBound > 0) {
        console.log(`[SCI Execute] Bound entity_id on ${entityBound} committed_data rows`);
      }
    }
  }

  // OB-146 Step 1b: Populate entity store metadata from import data.
  // After entities are created and entity_id is bound, scan the same batch
  // for store identifiers (storeId/num_tienda/No_Tienda) and volume tier info.
  // This bridges entity→store association so the calculation engine can
  // resolve store-level data for each entity.
  if (entityIdField) {
    const STORE_FIELDS = ['storeId', 'num_tienda', 'No_Tienda', 'Tienda'];
    const TIER_FIELDS = ['store_volume_tier', 'Rango_Tienda', 'Rango de Tienda'];
    const VOLUME_KEY_FIELDS = ['LLave Tamaño de Tienda'];

    // Build employee→store mapping from imported data
    const empToStore = new Map<string, string>();
    const empToTier = new Map<string, string>();
    const empToVolumeKey = new Map<string, string>();

    for (const row of unit.rawData) {
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
      // Fetch entities that need store metadata
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

          const newMeta: Record<string, unknown> = {
            ...existingMeta,
            store_id: store,
          };

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
        console.log(`[SCI Execute] OB-146: Updated store metadata for ${storeUpdated} entities (${empToStore.size} mapped)`);
      }
    }
  }

  // OB-153: Period binding removed from import (Decision 92)
  // Engine uses source_date range at calculation time, not period_id FK
}
```

---

## PROBE 2 — The three binding clears

### 2A — execute-bulk's three `input_bindings: {}` clear sites

All three clears use the same pattern: clear after `commitContentUnit` returns non-zero rows. The contexts:

**Site 1 — `processEntityUnit` (lines 528-539):** after entity inserts + commitContentUnit, clear `input_bindings` for all active/draft rule_sets in this tenant. Comment: "OB-195 Layer 4: Invalidate cached convergence bindings".

**Site 2 — `processDataUnit` (target/transaction, lines 575-586):** after commitContentUnit. Comment: "OB-195 Layer 4: Invalidate cached convergence bindings so engine re-derives with new data".

**Site 3 — `processReferenceUnit` (lines 653-664):** after commitContentUnit. Comment: "OB-195 Layer 4: Invalidate cached convergence bindings (same as processDataUnit)".

All three blocks were pasted verbatim in Probe 1A's function bodies above.

### 2B — Does `execute/route.ts` clear `input_bindings`?

`grep -n "input_bindings.*{}" web/src/app/api/import/sci/execute/route.ts` → **zero matches.**

`grep -n "input_bindings" web/src/app/api/import/sci/execute/route.ts`:

```
908:      input_bindings: engineFormat.inputBindings as unknown as Json,
1162:      input_bindings: engineFormat.inputBindings as unknown as Json,
```

Both hits are WRITES on the `rule_sets` upsert during plan interpretation — `executeBatchedPlanInterpretation` (line 908) and `executePlanPipeline` (line 1162). `execute/route.ts` never clears `input_bindings`. **Divergence #1: only execute-bulk invalidates the convergence cache on data import.**

---

## PROBE 3 — `commitContentUnit`

### 3A — Full function

`web/src/lib/sci/commit-content-unit.ts` (433 lines, complete):

```typescript
// HF-231: Unified Import Pipeline — single committed_data write site.
//
// Predecessors closed partial unification:
//   HF-184 (PR #331) — partial committed_data unification.
//   HF-194 (PR #370) — partial field_identities alignment.
//   DIAG-022           — PARALLEL_SPECIALIZED verdict.
// AP-17 (parallel metadata construction in import pipelines) recurred four
// times under those partial fixes. HF-231 closes it permanently: every
// committed_data write originating from the SCI import surface flows
// through this one function.
//
// Eight inline write sites collapse into this one function:
//   execute-bulk/route.ts: processEntityUnit + processDataUnit (target/transaction) + processReferenceUnit
//   execute/route.ts:      executeEntityPipeline + executeTargetPipeline + executeTransactionPipeline + executeReferencePipeline
//
// Side effects NOT owned by commitContentUnit (preserved at caller level):
//   • Entity creation in `entities` table (execute-bulk's processEntityUnit
//     creates entities BEFORE committed_data writes — out of scope here).
//   • Plan interpretation AI call (executePlanPipeline does not write
//     committed_data directly — out of scope here).
//   • postCommitConstruction (executeTargetPipeline + executeTransactionPipeline).
//   • input_bindings invalidation (Layer 4 cache clear — caller decides
//     timing, since some callers batch this across multiple units).
//
// Decision 108 (HC Override Authority, LOCKED 2026-03-07) is enforced by
// the entity_id_field resolution order: HC `identifier` role at >= 0.80
// confidence is consulted FIRST; confirmedBindings `entity_identifier`
// role is the structural fallback.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import type {
  AgentType,
  SemanticBinding,
  FieldIdentity,
} from './sci-types';
import {
  extractSourceDate,
  findDateColumnFromBindings,
  buildSemanticRolesMap,
  detectPeriodMarkerColumns,
} from './source-date-extraction';
import { buildFieldIdentitiesFromBindings } from './field-identities';
import { resolveDataTypeFromClassification } from './data-type-resolver';
import { computeContentUnitHashSha256 } from './content-unit-hash';
import { supersedePriorBatchOnContentMatch } from './import-batch-supersession';
import { extractFieldIdentitiesFromTrace } from './header-comprehension';

// ============================================================
// PUBLIC SHAPE — minimal common surface both callers can satisfy
// ============================================================

// Minimal common shape between BulkContentUnit (execute-bulk) and
// ContentUnitExecution (execute). Both carry contentUnitId + bindings;
// only the execute path threads classificationTrace through.
export interface CommitContentUnitInput {
  contentUnitId: string;
  confirmedBindings: SemanticBinding[];
  classificationTrace?: Record<string, unknown>;
}

// `source` drives the operational profile per route:
//   sci-bulk  → 2000-row chunks + 3-retry-with-backoff per chunk
//                (OB-174 Phase 5 / DS-016 §3.4 nanobatch contract)
//   sci       → 5000-row chunks + no retry (existing execute behavior)
// Both label metadata.source identically to the existing inline writers.
export type CommitContentUnitSource = 'sci' | 'sci-bulk';

export interface CommitContentUnitParams {
  unit: CommitContentUnitInput;
  rows: Record<string, unknown>[];
  classification: Exclude<AgentType, 'plan'>; // plan does not write committed_data
  tenantId: string;
  proposalId: string;
  tabName: string;
  fileName: string;
  source: CommitContentUnitSource;
  fileHashSha256: string;
}

export interface CommitContentUnitResult {
  batchId: string;
  totalInserted: number;
  dataType: string;
  entityIdField: string | null;
  fieldIdentities: Record<string, FieldIdentity>;
  earliestDate: string | null;
  latestDate: string | null;
  dateCount: number;
  success: boolean;
  error?: string;
}

// ============================================================
// HC-FIRST ENTITY_ID_FIELD RESOLUTION (Decision 108)
// ============================================================

// Role-confidence threshold for HC override (mirrors HC_ROLE_THRESHOLD in
// hc-pattern-classifier.ts). Below this, fall back to the structural binding.
const HC_IDENTIFIER_THRESHOLD = 0.80;

// HF-233: Classification-aware entity_id_field resolution.
//
// The semantic relationship between HC column roles and entity association
// depends on the file's classification:
//
//   classification  identifier role means      reference_key role means       entity_id_field is
//   --------------  ------------------------   ----------------------------   ------------------
//   entity          this row IS the entity     n/a (or org hierarchy ref)     identifier
//   target          this row is ABOUT entity   n/a                            identifier
//   transaction     this row's own event ID    this row BELONGS TO entity     reference_key
//   reference       dimensional lookup key     n/a                            null
//
// HF-231 collapsed all 8 import write paths through commitContentUnit but
// hardcoded `columnRole === 'identifier'` in resolveEntityIdField. Sales
// files (`transaction_id:identifier@0.95` + `sales_rep_id:reference_key@0.95`)
// resolved entity_id_field to `transaction_id`, causing post-import Entity
// Resolution to create 389 ghost entities (one per transaction_id) and the
// engine to fall back to sheet-matching against 421 "entities".
//
// The fix is domain-agnostic: ANY transaction file's entity association is
// its reference_key, by the HC LLM's definition of those roles. Quota /
// roster / capacity tables are unaffected.

function findHcRole(
  classificationTrace: Record<string, unknown> | undefined,
  targetRole: 'identifier' | 'reference_key',
): string | null {
  if (!classificationTrace) return null;
  const hcData = classificationTrace.headerComprehension as
    | {
        interpretations?: Record<
          string,
          { columnRole?: string; confidence?: number }
        >;
      }
    | undefined;
  const interpretations = hcData?.interpretations;
  if (!interpretations) return null;
  for (const [colName, interp] of Object.entries(interpretations)) {
    if (
      interp.columnRole === targetRole &&
      typeof interp.confidence === 'number' &&
      interp.confidence >= HC_IDENTIFIER_THRESHOLD
    ) {
      return colName;
    }
  }
  return null;
}

function resolveEntityIdField(
  bindings: SemanticBinding[],
  classificationTrace: Record<string, unknown> | undefined,
  classification: Exclude<AgentType, 'plan'>,
): string | null {
  // Reference data has no entity association — Decision 111 dimensional
  // lookup semantics. Skip both HC and structural lookups.
  if (classification === 'reference') {
    return null;
  }

  // Transaction files: the entity association is the reference_key (foreign
  // key to the entity the event belongs to), NOT the row's own identifier.
  // Structural fallback still consults confirmedBindings.entity_identifier in
  // case HC didn't assign a reference_key role above threshold.
  if (classification === 'transaction') {
    const hcReferenceKey = findHcRole(classificationTrace, 'reference_key');
    if (hcReferenceKey) return hcReferenceKey;
    const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
    return binding?.sourceField ?? null;
  }

  // Entity and target files: the identifier IS the entity (entity files) or
  // IS ABOUT the entity (target files). Existing HF-231 behavior preserved.
  const hcIdentifier = findHcRole(classificationTrace, 'identifier');
  if (hcIdentifier) return hcIdentifier;
  const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
  return binding?.sourceField ?? null;
}

// ============================================================
// ROUTE PROFILE — per-source operational parameters
// ============================================================

interface RouteProfile {
  chunkSize: number;
  retryAttempts: number; // 1 means a single attempt; 3 means up to 3 attempts with backoff
}

function profileFor(source: CommitContentUnitSource): RouteProfile {
  // sci-bulk preserves OB-174 Phase 5 nanobatch contract (2000-row chunks,
  // up to 3 retries with linear backoff). sci uses the wider 5000-row
  // chunks with no retry — the existing execute behavior.
  return source === 'sci-bulk'
    ? { chunkSize: 2000, retryAttempts: 3 }
    : { chunkSize: 5000, retryAttempts: 1 };
}

// ============================================================
// commitContentUnit — sole committed_data write surface
// ============================================================

export async function commitContentUnit(
  supabase: SupabaseClient,
  params: CommitContentUnitParams,
): Promise<CommitContentUnitResult> {
  const {
    unit,
    rows,
    classification,
    tenantId,
    proposalId,
    tabName,
    fileName,
    source,
    fileHashSha256,
  } = params;

  // Empty-rows short-circuit — preserve existing caller contract.
  if (rows.length === 0) {
    return {
      batchId: '',
      totalInserted: 0,
      dataType: resolveDataTypeFromClassification(classification),
      entityIdField: null,
      fieldIdentities: {},
      earliestDate: null,
      latestDate: null,
      dateCount: 0,
      success: true,
    };
  }

  const profile = profileFor(source);

  // HF-196 Phase 1D — data_type derives from SCI classification (Decisions 154/155).
  const dataType = resolveDataTypeFromClassification(classification);

  // HF-213 — content_unit_hash_sha256 is the supersession identity primitive.
  const contentUnitHashSha256 = computeContentUnitHashSha256(rows);
  const batchId = crypto.randomUUID();

  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: fileName,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    // HF-196 Phase 1F — file-level hash retained for audit (supersedure trigger
    // moved to content_unit_hash_sha256 at HF-213).
    file_hash_sha256: fileHashSha256,
    content_unit_hash_sha256: contentUnitHashSha256,
    metadata: {
      source,
      proposalId,
      contentUnitId: unit.contentUnitId,
      classification,
    } as unknown as Json,
  });

  // HF-213 Rule 30 — supersession on content_unit_hash_sha256 match.
  await supersedePriorBatchOnContentMatch(
    supabase,
    tenantId,
    batchId,
    contentUnitHashSha256,
    rows,
  );

  // Build semantic_roles map from confirmedBindings (single shape across
  // all four classifications).
  const semanticRoles: Record<
    string,
    { role: string; confidence: number; claimedBy: string }
  > = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // HF-110 — field_identities: HC trace primary, confirmedBindings fallback (DS-009 1.3).
  const fieldIdentities =
    extractFieldIdentitiesFromTrace(unit.classificationTrace) ??
    buildFieldIdentitiesFromBindings(unit.confirmedBindings);

  // Decision 108 — HC role @ >= 0.80 overrides structural binding.
  // HF-233 — Classification-aware resolution: transaction reads reference_key,
  // entity/target reads identifier, reference is null.
  const entityIdField = resolveEntityIdField(
    unit.confirmedBindings,
    unit.classificationTrace,
    classification,
  );

  // OB-152/OB-157 — source_date extraction with period marker composition.
  const dateColumnHint = findDateColumnFromBindings(unit.confirmedBindings);
  const semanticRolesMap = buildSemanticRolesMap(unit.confirmedBindings);
  const periodMarkerHint = detectPeriodMarkerColumns(rows);

  // Build committed_data rows. entity_id and period_id are always NULL at
  // import — engine binds them at calc time (OB-182, Decision 92).
  let earliestDate: string | null = null;
  let latestDate: string | null = null;
  let dateCount = 0;

  const insertRows = rows.map((row, i) => {
    const sourceDate = extractSourceDate(
      row,
      dateColumnHint,
      semanticRolesMap,
      periodMarkerHint,
    );
    if (sourceDate) {
      dateCount++;
      if (!earliestDate || sourceDate < earliestDate) earliestDate = sourceDate;
      if (!latestDate || sourceDate > latestDate) latestDate = sourceDate;
    }

    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: null as string | null,
      period_id: null as string | null,
      source_date: sourceDate,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source,
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
        entity_id_field: entityIdField,
        informational_label: classification,
        field_identities: fieldIdentities,
      },
    };
  });

  // Chunked insert — per-source profile (sci-bulk retries; sci does not).
  let totalInserted = 0;
  let firstError: string | undefined;
  const totalChunks = Math.ceil(insertRows.length / profile.chunkSize);
  let chunksCompleted = 0;

  for (let i = 0; i < insertRows.length; i += profile.chunkSize) {
    const slice = insertRows.slice(i, i + profile.chunkSize);
    let chunkSuccess = false;
    let lastErr = '';

    for (let attempt = 0; attempt < profile.retryAttempts && !chunkSuccess; attempt++) {
      const { error: insertErr } = await supabase
        .from('committed_data')
        .insert(slice as unknown as Json[]);
      if (insertErr) {
        lastErr = insertErr.message;
        if (profile.retryAttempts > 1 && attempt < profile.retryAttempts - 1) {
          // Linear backoff between retries — preserves sci-bulk behavior.
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      } else {
        chunkSuccess = true;
      }
    }

    if (chunkSuccess) {
      totalInserted += slice.length;
      chunksCompleted++;
    } else {
      // First chunk failure is fatal for the sci (no-retry) profile and gets
      // recorded for sci-bulk callers that decide to surface partial failure.
      if (!firstError) firstError = lastErr;
      console.error(
        `[commitContentUnit] Chunk ${chunksCompleted + 1}/${totalChunks} failed: ${lastErr}`,
      );
      if (profile.retryAttempts === 1) {
        // sci behavior: mark batch failed and short-circuit.
        await supabase
          .from('import_batches')
          .update({
            status: 'failed',
            error_summary: { error: lastErr } as unknown as Json,
          })
          .eq('id', batchId);
        return {
          batchId,
          totalInserted,
          dataType,
          entityIdField,
          fieldIdentities,
          earliestDate,
          latestDate,
          dateCount,
          success: false,
          error: lastErr,
        };
      }
      // sci-bulk behavior: continue with next chunk (preserve prior chunks).
    }
  }

  // Finalize batch.
  await supabase
    .from('import_batches')
    .update({
      status: 'completed',
      row_count: totalInserted,
    })
    .eq('id', batchId);

  console.log(
    `[commitContentUnit] ${classification} (${source}): ${totalInserted} rows committed, ` +
      `data_type=${dataType}, entity_id_field="${entityIdField ?? 'none'}", ` +
      `source_dates=${dateCount}/${rows.length} (${earliestDate}..${latestDate})`,
  );

  return {
    batchId,
    totalInserted,
    dataType,
    entityIdField,
    fieldIdentities,
    earliestDate,
    latestDate,
    dateCount,
    success: true,
    error: firstError,
  };
}
```

### 3B — All callers

`grep -rn "commitContentUnit" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."`:

```
web/src/app/api/import/sci/execute/route.ts:34:// and data_type resolution all moved into commitContentUnit. Only the file-
web/src/app/api/import/sci/execute/route.ts:36:// threaded into commitContentUnit per content unit).
web/src/app/api/import/sci/execute/route.ts:40:import { commitContentUnit } from '@/lib/sci/commit-content-unit';
web/src/app/api/import/sci/execute/route.ts:470:  // HF-231: Unified committed_data write via shared commitContentUnit.
web/src/app/api/import/sci/execute/route.ts:471:  const commitResult = await commitContentUnit(supabase, {
web/src/app/api/import/sci/execute/route.ts:536:  // HF-231: Unified committed_data write via shared commitContentUnit.
web/src/app/api/import/sci/execute/route.ts:537:  const commitResult = await commitContentUnit(supabase, {
web/src/app/api/import/sci/execute/route.ts:603:  // HF-231: Unified committed_data write via shared commitContentUnit.
web/src/app/api/import/sci/execute/route.ts:606:  const commitResult = await commitContentUnit(supabase, {
web/src/app/api/import/sci/execute/route.ts:666:  // HF-231: Unified committed_data write via shared commitContentUnit.
web/src/app/api/import/sci/execute/route.ts:669:  const commitResult = await commitContentUnit(supabase, {
web/src/app/api/import/sci/execute-bulk/route.ts:20:// data_type resolution all moved into commitContentUnit. Only the file-hash
web/src/app/api/import/sci/execute-bulk/route.ts:22:// and threaded into commitContentUnit per content unit).
web/src/app/api/import/sci/execute-bulk/route.ts:33:import { commitContentUnit } from '@/lib/sci/commit-content-unit';
web/src/app/api/import/sci/execute-bulk/route.ts:511:  // HF-231: Unified committed_data write via shared commitContentUnit.
web/src/app/api/import/sci/execute-bulk/route.ts:515:  const commitResult = await commitContentUnit(supabase, {
web/src/app/api/import/sci/execute-bulk/route.ts:561:  // HF-231: Unified committed_data write via shared commitContentUnit.
web/src/app/api/import/sci/execute-bulk/route.ts:562:  const commitResult = await commitContentUnit(supabase, {
web/src/app/api/import/sci/execute-bulk/route.ts:629:  // HF-231: Unified committed_data write via shared commitContentUnit.
web/src/app/api/import/sci/execute-bulk/route.ts:630:  const commitResult = await commitContentUnit(supabase, {
web/src/lib/sci/commit-content-unit.ts:16:// Side effects NOT owned by commitContentUnit (preserved at caller level):
web/src/lib/sci/commit-content-unit.ts:114:// HF-231 collapsed all 8 import write paths through commitContentUnit but
web/src/lib/sci/commit-content-unit.ts:201:// commitContentUnit — sole committed_data write surface
web/src/lib/sci/commit-content-unit.ts:204:export async function commitContentUnit(
web/src/lib/sci/commit-content-unit.ts:378:        `[commitContentUnit] Chunk ${chunksCompleted + 1}/${totalChunks} failed: ${lastErr}`,
web/src/lib/sci/commit-content-unit.ts:416:    `[commitContentUnit] ${classification} (${source}): ${totalInserted} rows committed, ` +
```

Seven invocation sites total — four in `execute/route.ts` (target/transaction/entity/reference), three in `execute-bulk/route.ts` (entity/data/reference). Plus the module's own self-references (definition + log lines).

---

## PROBE 4 — Side effects per classification

### 4A — Entity classification side effects

**execute-bulk `processEntityUnit`** (pasted in Probe 1A) — performs BEFORE `commitContentUnit`:
- Build `entityData` Map from rows, including enrichment fields (entity_attribute / descriptive_label bindings)
- Build temporal_attributes shape from enrichment fields
- Batch SELECT `entities` (200-row batches) to find existing
- Bulk INSERT `entities` (5000-row chunks) for new identifiers
- Per-entity SELECT + UPDATE on `entities` to merge enrichment into temporal_attributes + metadata
- Then `commitContentUnit`
- Then clear `input_bindings: {}` on all active/draft rule_sets

**execute `executeEntityPipeline`** (pasted in Probe 1B) — performs ONLY `commitContentUnit`. Entity creation is deferred to `executePostCommitConstruction` (shared module called from the POST handler tail).

### 4B — Plan classification side effects

**execute-bulk:** no plan handler. `processContentUnit` dispatch arm is absent. Plans cannot be imported via execute-bulk.

**execute `executeBatchedPlanInterpretation` + `executePlanPipeline`** (pasted in Probe 1B): file download from Storage, text extraction (XLSX/PPTX/DOCX/PDF), AI interpretation call (`aiService.interpretPlan`), bridge AI output to engine format (`bridgeAIToEngineFormat`), supersede existing active rule_sets (`rule_sets.update({status: 'superseded'})`), upsert new rule_set with `input_bindings`, emit plan-comprehension signals.

### 4C — Transaction/target/reference side effects

**execute-bulk `processDataUnit` (target/transaction):**
- `commitContentUnit`
- Clear `input_bindings: {}` (OB-195 Layer 4)
- Comment: "OB-182: postCommitConstruction REMOVED from import pipeline" — no per-pipeline post-commit work

**execute `executeTargetPipeline` / `executeTransactionPipeline`:**
- `commitContentUnit`
- `postCommitConstruction(...)` — local helper, runs per pipeline: rule_set_assignments creation, entity_id binding on committed_data rows by external_id lookup, store metadata population (storeId/num_tienda/No_Tienda/store_volume_tier extraction)
- NO `input_bindings: {}` clear

**execute-bulk `processReferenceUnit`:** `commitContentUnit` + `input_bindings: {}` clear.

**execute `executeReferencePipeline`:** `commitContentUnit` only.

### 4D — Per-table write summary

`grep -nE "from.+entities" web/src/app/api/import/sci/execute-bulk/route.ts`:

```
401:      .from('entities')
448:      const { error: entErr } = await supabase.from('entities').insert(slice);
466:      .from('entities')
488:      const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
497:        await supabase.from('entities').update({
```

`grep -nE "from.+entities" web/src/app/api/import/sci/execute/route.ts`:

```
192:            .from('entities')
1267:            .from('entities')
1311:          .from('entities')
1422:          .from('entities')
1449:            .from('entities')
```

`grep -nE "from.+rule_sets" web/src/app/api/import/sci/execute-bulk/route.ts`:

```
531:      .from('rule_sets')
578:      .from('rule_sets')
656:      .from('rule_sets')
```

All three `rule_sets` hits in execute-bulk are the three `input_bindings: {}` clears.

`grep -nE "from.+rule_sets" web/src/app/api/import/sci/execute/route.ts`:

```
180:        .from('rule_sets')
891:    .from('rule_sets')
897:    .from('rule_sets')
1145:    .from('rule_sets')
1151:    .from('rule_sets')
1256:        .from('rule_sets')
```

execute uses `rule_sets` for: rule_set discovery for HF-126 assignment creation (180), plan supersession + plan upsert in batched plan interp (891, 897), plan supersession + plan upsert in single plan interp (1145, 1151), rule_set discovery in `postCommitConstruction` (1256).

`grep -n "rule_set_assignments" web/src/app/api/import/sci/execute-bulk/route.ts`: **zero matches.**

`grep -n "rule_set_assignments" web/src/app/api/import/sci/execute/route.ts`:

```
175:    // HF-126: Auto-create rule_set_assignments after entity resolution.
208:              .from('rule_set_assignments')
244:                .from('rule_set_assignments')
250:            console.log(`[SCI Execute] HF-126: Created ${newAssignments.length} rule_set_assignments for ${allEntityIds.length} entities x ${activeRuleSets.length} rule sets`);
1253:      // OB-153: Create rule_set_assignments for ALL entities that lack them
1279:            .from('rule_set_assignments')
1298:              await supabase.from('rule_set_assignments').insert(assignments);
```

`grep -n "executePostCommitConstruction" web/src/app/api/import/sci/{execute-bulk,execute}/route.ts`:

```
web/src/app/api/import/sci/execute-bulk/route.ts:29:import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
web/src/app/api/import/sci/execute-bulk/route.ts:240:    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });
web/src/app/api/import/sci/execute/route.ts:17:import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
web/src/app/api/import/sci/execute/route.ts:173:    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-execute' });
```

Both routes call the shared `executePostCommitConstruction` module at the end of the POST handler (execute-bulk:240, execute:173). The execute route ALSO has a local `postCommitConstruction` helper (line 1228, internal) called from inside `executeTargetPipeline` (line 498) and `executeTransactionPipeline` (line 564). execute-bulk has no equivalent local helper.

---

## PROBE 5 — Convergence trigger points

### 5A — Import-time convergence references

`grep -n "convergeBindings\|convergence" web/src/app/api/import/sci/execute/route.ts`:

```
121:    // HF-109: Pipeline order — reference before data for convergence, plan independent
166:    // HF-224: Import-time convergence (OB-160G) removed. Convergence binding is
500:  // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete
566:  // OB-160G: Per-pipeline convergence removed — runs once after all pipelines complete
940:  // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
```

`grep -n "convergeBindings\|convergence" web/src/app/api/import/sci/execute-bulk/route.ts`:

```
11:// OB-182: convergeBindings removed from import — runs at calc time
528:  // OB-195 Layer 4: Invalidate cached convergence bindings
537:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (entity data imported — convergence will re-derive)`);
575:  // OB-195 Layer 4: Invalidate cached convergence bindings so engine re-derives with new data
584:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
593:  // OB-182: Entity binding validation and convergence derivation REMOVED.
653:  // OB-195 Layer 4: Invalidate cached convergence bindings (same as processDataUnit)
662:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (reference data imported — convergence will re-derive)`);
```

Neither route runs convergence at import time. Both have removed it (HF-224 removed it from execute; OB-182 removed it from execute-bulk).

### 5B — Calc-time convergence trigger

`grep -n "convergeBindings\|HF-165.*convergence\|input_bindings empty" web/src/app/api/calculation/run/route.ts`:

```
37:import { convergeBindings, extractLeafSources } from '@/lib/intelligence/convergence-service';
226:  // ── HF-165: Calc-time convergence (completes OB-182 deferred architecture) ──
250:      addLog('HF-165: input_bindings empty — running calc-time convergence');
252:        const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
306:      addLog('HF-165: input_bindings already populated — skipping convergence');
```

Calc-time convergence at `route.ts:226-308` was pasted verbatim in DIAG-052 Probe 2B. The trigger gate: when `rawBindings.metric_derivations` is empty AND `rawBindings.convergence_bindings` is empty (OR `convergence_version !== 'HF-234'`), `convergeBindings(...)` runs and the result is written back to `rule_sets.input_bindings`.

---

## PROBE 6 — Fingerprint and flywheel

### 6A — Fingerprint writes

`grep -n "structural_fingerprints\|writeFingerprint\|aggregateToFoundational\|aggregateToDomain\|writeClassificationSignal" web/src/app/api/import/sci/execute-bulk/route.ts`: **zero matches.**

`grep -n "structural_fingerprints\|writeFingerprint\|aggregateToFoundational\|aggregateToDomain\|writeClassificationSignal" web/src/app/api/import/sci/execute/route.ts`:

```
18:// OB-199 Phase 4: writeClassificationSignal deleted; migrated to canonical writer below.
19:import { aggregateToFoundational, aggregateToDomain, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
21:import { writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
267:    // Single write path: writeClassificationSignal (HF-092 dedicated columns)
279:        writeClassificationSignal({
304:        aggregateToFoundational(
313:        aggregateToDomain(
363:          writeFingerprint(
```

**Only `execute/route.ts` writes fingerprints + flywheel signals.** `execute-bulk/route.ts` has no flywheel emission at all.

### 6B — Flywheel/cache refs

`grep -nE "flywheel|fingerprint.*cache|cache.*fingerprint|insufficientFlywheelCache" web/src/app/api/import/sci/execute-bulk/route.ts`: **zero matches.**

`grep -nE "flywheel|fingerprint.*cache|cache.*fingerprint|insufficientFlywheelCache" web/src/app/api/import/sci/execute/route.ts`:

```
21:import { writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
106:    // Verify tenant exists + read industry for domain flywheel (OB-160J)
333:        // alongside the semantic role makes the flywheel-replay path emit the
```

---

## PROBE 7 — UI call sites

`grep -rnE "execute-bulk|execute/|/api/import/sci/execute" web/src/app/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "/route.ts" | grep -v ".test."`:

```
web/src/components/sci/SCIExecution.tsx:189:      const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
web/src/components/sci/SCIExecution.tsx:266:    const res = await fetchWithTimeout('/api/import/sci/execute', {
web/src/components/sci/SCIExecution.tsx:326:        const res = await fetchWithTimeout('/api/import/sci/execute', {
```

`SCIExecution.tsx` is the only UI caller. It calls both routes:

- **Line 189 → `/api/import/sci/execute-bulk`**: data units (entity/target/transaction/reference) when storagePath is available — the PRIMARY data path.
- **Line 266 → `/api/import/sci/execute`** (from `executeLegacyUnit`): per-unit fallback when bulk fails or no storagePath. Pasted context (lines 237-283) below.
- **Line 326 → `/api/import/sci/execute`** (from `executeUnits`): batched plan units in one POST request.

```typescript
  const executeLegacyUnit = useCallback(async (unit: ExecutionUnit) => {
    const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
    if (!proposalUnit) throw new Error('Could not find execution data for this content');

    const baseContentUnitId = unit.contentUnitId.replace(/::split$/, '');
    const sheetData = rawData.sheets.find(s => {
      const expectedId = `${rawData.fileName}::${s.sheetName}::${rawData.sheets.indexOf(s)}`;
      return expectedId === baseContentUnitId;
    }) || rawData.sheets.find(s => s.sheetName === unit.tabName);

    const execUnit = {
      contentUnitId: unit.contentUnitId,
      confirmedClassification: unit.classification,
      confirmedBindings: proposalUnit.fieldBindings,
      rawData: sheetData?.rows || [],
      ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
      ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
      ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
      ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
      originalClassification: proposalUnit.classification,
      originalConfidence: proposalUnit.confidence,
      // HF-110: Pass HC data for field_identities extraction (DS-009 1.3)
      ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
      ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
      ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
      sourceFile: proposalUnit.sourceFile,
      tabName: proposalUnit.tabName,
    };

    const res = await fetchWithTimeout('/api/import/sci/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalId: proposal.proposalId,
        tenantId,
        contentUnits: [execUnit],
        ...(storagePath ? { storagePath } : {}), // HF-129: Pass storage path for plan document retrieval
      }),
    });

    if (!res.ok) {
      throw new Error(`Processing failed (${res.status})`);
    }

    const result: SCIExecutionResult = await res.json();
    return result.results[0];
  }, [confirmedUnits, rawData, proposal.proposalId, tenantId, storagePath]);
```

```typescript
  const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
    // OB-156: Split units into plan (legacy) and data (bulk) groups
    const planUnits = unitsToExecute.filter(u => u.classification === 'plan');
    const dataUnits = unitsToExecute.filter(u => u.classification !== 'plan');

    // HF-131: Execute ALL plan units in a SINGLE request so the backend (HF-130)
    // can batch them into one AI interpretation call with full cross-sheet context.
    if (planUnits.length > 0) {
      setElapsedSeconds(0);
      // Mark all plan units as processing
      setUnits(prev => prev.map(u =>
        planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
          ? { ...u, status: 'processing' as const }
          : u
      ));

      // Build execution payloads for ALL plan units
      const planExecUnits = planUnits.map(unit => {
        const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
        if (!proposalUnit) return null;
        return {
          contentUnitId: unit.contentUnitId,
          confirmedClassification: unit.classification,
          confirmedBindings: proposalUnit.fieldBindings,
          rawData: [] as Record<string, unknown>[], // Plan units have no row data
          ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
          ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
          ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
          ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
          originalClassification: proposalUnit.classification,
          originalConfidence: proposalUnit.confidence,
          ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
          ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
          ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
          sourceFile: proposalUnit.sourceFile,
          tabName: proposalUnit.tabName,
        };
      }).filter(Boolean);

      try {
        // ONE request with ALL plan units + storagePath
        const res = await fetchWithTimeout('/api/import/sci/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId,
            contentUnits: planExecUnits,
            ...(storagePath ? { storagePath } : {}),
          }),
        });

        if (!res.ok) {
          throw new Error(`Plan processing failed (${res.status})`);
        }

        const planResult: SCIExecutionResult = await res.json();

        // Map results back to individual plan units
        for (const result of planResult.results) {
          setUnits(prev => prev.map(u =>
```

**execute is NOT dead code.** It is the plan-import path (always) and the per-unit fallback when bulk fails. Both routes are reachable from the same UI component (`SCIExecution.tsx`), with branching by classification (plan → execute; data → execute-bulk).

---

## PROBE 8 — Line counts and structural diff

### 8A — `wc -l`

```
    1465 web/src/app/api/import/sci/execute/route.ts
     678 web/src/app/api/import/sci/execute-bulk/route.ts
     433 web/src/lib/sci/commit-content-unit.ts
    2576 total
```

execute is 2.2x larger than execute-bulk. The bulk of the extra mass in execute is the plan path (`executeBatchedPlanInterpretation` + `executePlanPipeline`, ~500 lines) and the local `postCommitConstruction` helper (~230 lines).

### 8B — Structural marker diff

`diff <(grep -nE "function|async|supabase|import|export" execute/route.ts) <(grep -nE "function|async|supabase|import|export" execute-bulk/route.ts)`:

```diff
1,107c1,61
< 1:// SCI Execute API — POST /api/import/sci/execute
< 7:export const runtime = 'nodejs';
< 8:export const maxDuration = 300; // Vercel Pro max
< 10:import { NextRequest, NextResponse } from 'next/server';
< 11:import { createClient, SupabaseClient } from '@supabase/supabase-js';
< 12:import { createServerSupabaseClient } from '@/lib/supabase/server';
< 14:// Replaces direct call to resolveEntitiesFromCommittedData; the library function
< 15:// is now invoked indirectly through the shared module to keep both import
< 17:import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
< 19:import { aggregateToFoundational, aggregateToDomain, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
< 20:import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
< 21:import { writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
< 22:import { computeFingerprintHashSync } from '@/lib/sci/structural-fingerprint';
< 24:import type { StructuralFingerprint } from '@/lib/sci/classification-signal-service';
< 25:import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
< 26:import type { Json } from '@/lib/supabase/database.types';
< 27:import type {
< 37:import { computeFileHashSha256 } from '@/lib/sci/file-content-hash';
< 39:// this route (plus 4 in execute-bulk/route.ts) into one function.
< 40:import { commitContentUnit } from '@/lib/sci/commit-content-unit';
< 48:export async function POST(req: NextRequest) {
< 57:    const supabase = createClient(
< 78:    // import_batches. Plan path goes through executeBatchedPlanInterpretation /
< 80:    // import_batches Phase 1F supersession), so plan-only requests do not require
< 85:        const { data: fileData, error: dlErr } = await supabase.storage
< 101:        { error: 'Phase 1F: storagePath required for non-plan import (file_hash_sha256 mandatory per Rule 30 + OB-50 supersession primitive)' },
< 107:    const { data: tenant } = await supabase
< 122:    // Entity resolution is post-import (DS-009 3.3), so no ordering constraint for entity pipeline
< 137:          supabase, tenantId, planUnits, profileId, storagePath
< 152:        const result = await executeContentUnit(supabase, tenantId, proposalId, unit, profileId, storagePath, fileHashSha256);
< 172:    // Entity resolution + entity_id back-link runs identically for both import endpoints.
< 173:    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-execute' });
< 179:      const { data: activeRuleSets } = await supabase
< 191:          const { data: entityPage } = await supabase
< 207:            const { data: existing } = await supabase
< 243:              const { error: insertErr } = await supabase
< 380:      // Flywheel signal failure must NEVER block import
< 394:async function executeContentUnit(
< 395:  supabase: SupabaseClient,
< 409:      return executeTargetPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
< 411:      return executeTransactionPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
< 413:      return executeEntityPipeline(supabase, tenantId, proposalId, effectiveUnit, fileHashSha256!);
< 415:      return executePlanPipeline(supabase, tenantId, effectiveUnit, userId, storagePath);
< 417:      return executeReferencePipeline(supabase, tenantId, proposalId, effectiveUnit, userId, fileHashSha256!);
< 427:function filterFieldsForPartialClaim(unit: ContentUnitExecution): ContentUnitExecution {
< 449:async function executeTargetPipeline(
< 450:  supabase: SupabaseClient,
< 471:  const commitResult = await commitContentUnit(supabase, {
< 496:  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
< 498:  await postCommitConstruction(supabase, tenantId, commitResult.batchId, commitResult.entityIdField ?? undefined, unit);
< 516:async function executeTransactionPipeline(
< 517:  supabase: SupabaseClient,
< 537:  const commitResult = await commitContentUnit(supabase, {
< 562:  // OB-153: Period creation removed from import (Decision 92 — periods created at calculate time)
< 564:  await postCommitConstruction(supabase, tenantId, commitResult.batchId, commitResult.entityIdField ?? undefined, unit);
< 579:// Entity creation + entity_id backfill moved to post-import
< 583:async function executeEntityPipeline(
< 584:  supabase: SupabaseClient,
< 604:  // HF-109 contract preserved: entity_id stays NULL at import, backfilled
< 605:  // post-import by resolveEntitiesFromCommittedData (DS-009 3.3).
< 606:  const commitResult = await commitContentUnit(supabase, {
< 644:async function executeReferencePipeline(
< 645:  supabase: SupabaseClient,
< 669:  const commitResult = await commitContentUnit(supabase, {
< 709:async function executeBatchedPlanInterpretation(
< 710:  supabase: SupabaseClient,
< 726:  const { data: fileData, error: downloadErr } = await supabase.storage
< 756:    const XLSX = await import('xlsx');
< 807:    const JSZip = (await import('jszip')).default;
< 820:        const content = await zip.file(sf)?.async('string');
< 831:      const docXml = await zip.file('word/document.xml')?.async('string');
< 853:  const { getAIService } = await import('@/lib/ai');
< 878:  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
< 890:  await supabase
< 896:  const { error: upsertError } = await supabase
< 945:    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
< 972:async function executePlanPipeline(
< 973:  supabase: SupabaseClient,
< 990:    const { data: fileData, error: downloadErr } = await supabase.storage
< 1040:  const { getAIService } = await import('@/lib/ai');
< 1054:    const XLSX = await import('xlsx');
< 1075:    const JSZip = (await import('jszip')).default;
< 1090:        const content = await zip.file(sf)?.async('string');
< 1101:      const docXml = await zip.file('word/document.xml')?.async('string');
< 1132:  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
< 1144:  await supabase
< 1150:  const { error: upsertError } = await supabase
< 1196:    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
< 1219:// Decision 92: Periods created at calculate time, not import time.
< 1228:async function postCommitConstruction(
< 1229:  supabase: SupabaseClient,
< 1231:  importBatchId: string,
< 1241:    // Collect unique identifiers from the imported data
< 1255:      const { data: ruleSets } = await supabase
< 1266:          const { data } = await supabase
< 1278:          const { data } = await supabase
< 1298:              await supabase.from('rule_set_assignments').insert(assignments);
< 1305:      // Bind entity_id on committed_data rows for this import batch
< 1310:        const { data } = await supabase
< 1326:        const { data: rows } = await supabase
< 1330:          .eq('import_batch_id', importBatchId)
< 1350:            await supabase.from('committed_data').update({ entity_id: entityId }).in('id', slice);
< 1364:  // OB-146 Step 1b: Populate entity store metadata from import data.
< 1374:    // Build employee→store mapping from imported data
< 1421:        const { data: ents } = await supabase
< 1448:          await supabase
< 1463:  // OB-153: Period binding removed from import (Decision 92)
---
> 5:export const runtime = 'nodejs';
> 6:export const maxDuration = 300; // Vercel Pro max
> 8:import { NextRequest, NextResponse } from 'next/server';
> 9:import { createClient, SupabaseClient } from '@supabase/supabase-js';
> 10:import { createServerSupabaseClient } from '@/lib/supabase/server';
> 11:// OB-182: convergeBindings removed from import — runs at calc time
> 12:import type { Json } from '@/lib/supabase/database.types';
> 13:import type {
> 23:import { computeFileHashSha256 } from '@/lib/sci/file-content-hash';
> 24:// HF-196 Phase 1: post-commit construction unified across both import endpoints.
> 25:// Closes Break #3 (import surface fragmentation): execute-bulk now runs the same
> 27:// This restores OB-182's stated calc-time intent at the import side AND closes
> 28:// Break #2 by ensuring entity_id is populated for bulk-imported rows.
> 29:import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
> 33:import { commitContentUnit } from '@/lib/sci/commit-content-unit';
> 72:export async function POST(req: NextRequest) {
> 83:    const supabase = createClient(
> 102:    const { data: tenant } = await supabase
> 114:    const { data: fileData, error: downloadErr } = await supabase.storage
> 130:    const XLSX = await import('xlsx');
> 133:    // process functions for import_batches.file_hash_sha256 + supersession trigger.
> 219:          supabase, tenantId, proposalId, profileId,
> 240:    await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });
> 277:function filterFieldsForPartialClaim(
> 299:async function processContentUnit(
> 300:  supabase: SupabaseClient,
> 312:      return processEntityUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, fileHashSha256);
> 314:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'target', fileHashSha256);
> 316:      return processDataUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, 'transaction', fileHashSha256);
> 318:      return processReferenceUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
> 333:async function processEntityUnit(
> 334:  supabase: SupabaseClient,
> 400:    const { data: existing } = await supabase
> 413:  const importDate = new Date().toISOString().split('T')[0];
> 414:  function buildTemporalAttrs(enrichment: Record<string, string>): Json[] {
> 418:      effective_from: importDate,
> 420:      source: 'import',
> 448:      const { error: entErr } = await supabase.from('entities').insert(slice);
> 465:    const { data: current } = await supabase
> 480:        existing.effective_to = importDate;
> 483:      newAttrs.push({ key, value, effective_from: importDate, effective_to: null });
> 488:      const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
> 497:        await supabase.from('entities').update({
> 515:  const commitResult = await commitContentUnit(supabase, {
> 530:    const { data: clearedRuleSets } = await supabase
> 537:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (entity data imported — convergence will re-derive)`);
> 546:async function processDataUnit(
> 547:  supabase: SupabaseClient,
> 562:  const commitResult = await commitContentUnit(supabase, {
> 577:    const { data: clearedRuleSets } = await supabase
> 584:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
> 588:  // OB-182: postCommitConstruction REMOVED from import pipeline.
> 590:  // Entity creation for roster imports still handled by processEntityUnit (separate path).
> 596:  // Flywheel self-correction: entity_id is always NULL at import, so binding validation is N/A.
> 609:async function processReferenceUnit(
> 610:  supabase: SupabaseClient,
> 630:  const commitResult = await commitContentUnit(supabase, {
> 655:    const { data: clearedRuleSets } = await supabase
> 662:      console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRuleSets?.length ?? 0} rule_sets (reference data imported — convergence will re-derive)`);
> 670:// The legacy `_postCommitConstruction_REMOVED` function (deferred-by-OB-182,
> 676:// (function never reached production under this name; clean deletion).
```

---

## END

Eight probes complete. Pasted code, grep output, and structural diffs are the verbatim state of the import routes at `main @ b7bd5bea` (DIAG-052 squash merge — post-HF-238). No interpretation. No recommendations. The architect designs the unified import path from this evidence.
