# HF-263 — Grouping Entity Resolution (CPI Phase 1) — COMPLETION REPORT
## HEAD SHA: dc9c89e3881f56059f6545d358251c2415f0d26d
## PR: #448 (dev -> main, MERGEABLE)
## Date: 2026-06-01
## Classification: implementation HF. Phases 1-4 + EPG scripts by CC; EPG-1..5 verification architect-executed (UI re-import + calc).

Defect class: Grouping Entity Resolution. Witness: Meridian (`5035b1e8-...`). Closes DIAG-058 Condition A + DIAG-059 Class A (C5=0) / Class B (12 phantom hub payees). Governing spec: Entity Model Design D1-D3.

## Phase 1: Entity Type Intelligence (d684925e)
Reference-only-provenance external_ids typed `'location'` (structural, by source `data_type`; Korean-Test clean). Applies to both callers (post-commit + calc-time) via the shared function.
```diff
diff --git a/web/src/lib/sci/entity-resolution.ts b/web/src/lib/sci/entity-resolution.ts
index 2a61f523..f15f029c 100644
--- a/web/src/lib/sci/entity-resolution.ts
+++ b/web/src/lib/sci/entity-resolution.ts
@@ -34,6 +34,9 @@ export async function resolveEntitiesFromCommittedData(
   // HF-199 D3: also discover attribute columns per batch for entities.materializedState projection
   const batchIdentifiers = new Map<string, { idColumn: string; nameColumn: string | null; attributeColumns: string[] }>();
   const batchLabels = new Map<string, string>(); // batchId -> informational_label
+  // HF-263: batchId -> committed_data.data_type ('entity' | 'transaction' | 'reference' | ...),
+  // for structural entity-type classification (reference-only provenance → grouping entity).
+  const batchDataType = new Map<string, string>();
   const BATCH_SIZE = 200;
 
   const seenBatches = new Set<string>();
@@ -44,7 +47,7 @@ export async function resolveEntitiesFromCommittedData(
   while (true) {
     const { data: rows } = await supabase
       .from('committed_data')
-      .select('import_batch_id, metadata')
+      .select('import_batch_id, metadata, data_type')
       .eq('tenant_id', tenantId)
       .range(offset, offset + 999);
 
@@ -55,6 +58,11 @@ export async function resolveEntitiesFromCommittedData(
       if (!batchId || seenBatches.has(batchId)) continue;
       seenBatches.add(batchId);
 
+      // HF-263: record the batch's data_type before any metadata-based continue,
+      // so reference-classified batches are classifiable even when metadata is sparse.
+      const batchDt = (row as { data_type?: string | null }).data_type;
+      if (batchDt) batchDataType.set(batchId, batchDt);
+
       const meta = row.metadata as Record<string, unknown> | null;
       if (!meta) continue;
 
@@ -171,6 +179,9 @@ export async function resolveEntitiesFromCommittedData(
   // Iterates field_identities-marked attribute columns only — no language-specific
   // column-name matching. Korean Test compliant.
   const entityAttributes = new Map<string, Record<string, unknown>>();
+  // HF-263: external_id -> set of source data_types it was discovered from. An id seen
+  // ONLY in reference-classified rows is a grouping entity (typed 'location' below).
+  const extIdDataTypes = new Map<string, Set<string>>();
 
   for (const batchId of discoveryBatchIds) {
     const { idColumn, nameColumn, attributeColumns } = batchIdentifiers.get(batchId)!;
@@ -198,6 +209,14 @@ export async function resolveEntitiesFromCommittedData(
           allEntities.set(extId, name);
         }
 
+        // HF-263: accumulate the source data_type for this external_id.
+        const srcDt = batchDataType.get(batchId);
+        if (srcDt) {
+          let dts = extIdDataTypes.get(extId);
+          if (!dts) { dts = new Set<string>(); extIdDataTypes.set(extId, dts); }
+          dts.add(srcDt);
+        }
+
         // HF-199 D3: project attribute columns from entity-typed batches only.
         // For each attribute column flagged by HC (structuralType==='attribute'),
         // capture row's value. Stored per external_id; later written to
@@ -227,6 +246,7 @@ export async function resolveEntitiesFromCommittedData(
       for (const val of sampleValues) {
         allEntities.delete(val);
         entityAttributes.delete(val); // HF-199 D3: also drop spurious attribute projections
+        extIdDataTypes.delete(val);   // HF-263: drop provenance tracking for skipped ids
       }
     }
   }
@@ -276,11 +296,21 @@ export async function resolveEntitiesFromCommittedData(
 
   for (const [extId, name] of Array.from(allEntities.entries())) {
     if (!existingMap.has(extId)) {
+      // HF-263 (CPI Phase 1): structural entity-type classification. An external_id
+      // discovered ONLY from reference-classified source rows is a grouping entity
+      // (hub / territory / department), not a payable individual — type it 'location'.
+      // Korean Test: keys on data_type classification, never on the entity name or
+      // external_id format. A Hangul-named hub from a reference sheet classifies identically.
+      const sourceDataTypes = extIdDataTypes.get(extId);
+      const entityType = sourceDataTypes && sourceDataTypes.size > 0
+        && Array.from(sourceDataTypes).every(t => t === 'reference')
+        ? 'location'
+        : 'individual';
       newEntities.push({
         tenant_id: tenantId,
         external_id: extId,
         display_name: name,
-        entity_type: 'individual',
+        entity_type: entityType,
         status: 'active',
         // HF-199 D3: temporal_attributes populated from field_identities-marked attribute
         // columns. Each attribute becomes a temporal record { key, value, effective_from,
```

## Phase 2: CPI Relationship Discovery (a53ece18) — HALT-A relocation
Relocated to `post-commit-construction.ts`, AFTER `resolveEntitiesFromCommittedData` (both individual + location entities exist; `entity_id` back-linked). Value-set intersection over `data_type='entity'` rows; >50% match => bridge => `assigned_to` upsert. No processEntityUnit-scoped vars.
```diff
diff --git a/web/src/lib/sci/post-commit-construction.ts b/web/src/lib/sci/post-commit-construction.ts
index 67a2d93b..2153e50b 100644
--- a/web/src/lib/sci/post-commit-construction.ts
+++ b/web/src/lib/sci/post-commit-construction.ts
@@ -63,6 +63,12 @@ export async function executePostCommitConstruction(
       `[PostCommitConstruction:${source}] tenant=${tenantId} ` +
       `entities_created=${entitiesCreated} rows_back_linked=${entityRowsLinked}`,
     );
+
+    // ── HF-263 Phase 2 (HALT-A): CPI Shared-Attribute relationship discovery ──
+    // Runs AFTER resolveEntitiesFromCommittedData so both 'individual' (employee) and
+    // 'location' (hub/grouping) entities exist and entity_id is back-linked on the rows.
+    // Korean Test: value-set intersection only — no column-name registry, no language literals.
+    await discoverSharedAttributeRelationships(supabase, tenantId);
   } catch (err) {
     console.error(
       `[PostCommitConstruction:${source}] resolveEntitiesFromCommittedData failed (non-blocking):`,
@@ -77,3 +83,109 @@ export async function executePostCommitConstruction(
     durationMs: Date.now() - startedAt,
   };
 }
+
+/**
+ * HF-263 Phase 2 (CPI Dimension 1 — Shared Attribute). For each column on the
+ * entity-classified committed_data rows, compute value-set intersection with the
+ * external_ids of non-individual (grouping) entities. When a column's distinct
+ * values predominantly match grouping entities, it is a relationship bridge:
+ * write `assigned_to` entity_relationships from each individual to its grouping entity.
+ *
+ * Structural (Korean Test): keys on data_type classification and value-set overlap,
+ * never on column names or language. Best-effort: never throws into the import path.
+ */
+async function discoverSharedAttributeRelationships(
+  supabase: SupabaseClient,
+  tenantId: string,
+): Promise<void> {
+  // 1. Non-individual (grouping) entities — the candidate relationship targets.
+  const { data: groupingEntities } = await supabase
+    .from('entities')
+    .select('id, external_id, entity_type')
+    .eq('tenant_id', tenantId)
+    .neq('entity_type', 'individual');
+
+  if (!groupingEntities || groupingEntities.length === 0) return;
+  const groupingByExtId = new Map(
+    groupingEntities.filter(e => e.external_id).map(e => [e.external_id!.trim(), e]),
+  );
+
+  // 2. Entity-classified rows carry the bridging enrichment columns (e.g. an
+  //    assigned-hub column). entity_id is the individual's UUID (back-linked above).
+  const { data: entityRows } = await supabase
+    .from('committed_data')
+    .select('row_data, entity_id')
+    .eq('tenant_id', tenantId)
+    .eq('data_type', 'entity')
+    .not('entity_id', 'is', null)
+    .limit(5000);
+
+  if (!entityRows || entityRows.length === 0) return;
+
+  // 3. Candidate bridge columns (structural keys only; skip _rowIndex/_sheetName).
+  const allKeys = new Set<string>();
+  for (const r of entityRows) {
+    const rd = r.row_data as Record<string, unknown> | null;
+    if (rd) for (const k of Object.keys(rd)) if (!k.startsWith('_')) allKeys.add(k);
+  }
+
+  // 4. For each column, test value-set intersection with grouping external_ids.
+  for (const colKey of Array.from(allKeys)) {
+    const colValues = new Set<string>();
+    for (const r of entityRows) {
+      const val = (r.row_data as Record<string, unknown> | null)?.[colKey];
+      if (val != null && typeof val === 'string' && val.trim()) colValues.add(val.trim());
+    }
+    if (colValues.size === 0) continue;
+
+    let intersectionCount = 0;
+    for (const v of Array.from(colValues)) if (groupingByExtId.has(v)) intersectionCount++;
+
+    // Structural threshold: a bridge column has >50% of its distinct values matching
+    // grouping entities (a free-text attribute column intersects ~0%).
+    if (intersectionCount === 0 || intersectionCount / colValues.size <= 0.5) continue;
+
+    // 5. Build individual → grouping relationships.
+    const relationships: Array<{
+      tenant_id: string;
+      source_entity_id: string;
+      target_entity_id: string;
+      relationship_type: string;
+      source: string;
+      confidence: number;
+      evidence: Record<string, unknown>;
+      context: Record<string, unknown>;
+    }> = [];
+
+    for (const r of entityRows) {
+      const groupVal = (r.row_data as Record<string, unknown> | null)?.[colKey];
+      if (!groupVal || typeof groupVal !== 'string' || !groupVal.trim()) continue;
+      const groupEntity = groupingByExtId.get(groupVal.trim());
+      if (!groupEntity || !r.entity_id) continue;
+
+      relationships.push({
+        tenant_id: tenantId,
+        source_entity_id: r.entity_id,
+        target_entity_id: groupEntity.id,
+        relationship_type: 'assigned_to',
+        source: 'ai_inferred',
+        confidence: 0.85,
+        evidence: { signal: 'shared_attribute', field: colKey, import_source: 'post_commit_construction' },
+        context: {},
+      });
+    }
+
+    if (relationships.length === 0) continue;
+    for (let i = 0; i < relationships.length; i += 500) {
+      const slice = relationships.slice(i, i + 500);
+      const { error: relErr } = await supabase
+        .from('entity_relationships')
+        .upsert(slice, { onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type' });
+      if (relErr) console.warn(`[HF-263 CPI] entity_relationships upsert error: ${relErr.message}`);
+    }
+    console.log(
+      `[HF-263 CPI] Created ${relationships.length} '${colKey}' -> assigned_to relationships ` +
+      `(${groupingByExtId.size} grouping entities)`,
+    );
+  }
+}
```

## Phase 3: Convergence Key-Space Preference
### P3.1 — cross-source prompt annotation (9932be86)
`resolveColumnMappingsViaAI` annotates `cross_source_numeric` columns so the AI prefers a same-batch alternative.
```diff
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index 2594b065..17e9b0b5 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -2291,7 +2291,14 @@ async function resolveColumnMappingsViaAI(
   const columnList = measureColumns.map((c, i) => {
     const s = c.stats;
     const range = s ? ` [min=${s.min}, max=${s.max}, mean=${s.mean.toFixed(2)}]` : '';
-    return `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})${range}`;
+    // HF-263: key-space annotation. A cross-source column is keyed by a different entity
+    // than the primary identifier; prefer a same-batch alternative when one carries
+    // equivalent data, since same-batch columns resolve through resolveColumnFromBatch
+    // without a boundary join. Structural (cross_source_numeric flag), not name-based.
+    const crossSourceNote = c.fi.contextualIdentity === 'cross_source_numeric'
+      ? ' [WARN] CROSS-SOURCE: keyed by a different entity than the primary identifier - prefer same-batch alternatives when available'
+      : '';
+    return `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})${range}${crossSourceNote}`;
   }).join('\n');
 
   // HF-114 / HF-199 D2: User prompt now carries plan-agent semantic intent per metric
```

### P3.2 — post-pass cross-source redirect (dc9c89e3) — HALT-B relocation
Runs after each variant group's bindings complete (entity_identifier bound at :2781, after the measure loop at :2633), so its batch_id is available. Cross-source measure binding with a same-batch, matching-magnitude alternative is redirected to the entity-identifier key space.
```diff
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index 17e9b0b5..76a46312 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -2850,6 +2850,55 @@ async function generateAllComponentBindings(
       };
     }
     } // end for (match of groupMatches)
+
+    // ── HF-263 P3.2 (HALT-B): post-pass cross-source redirect ──
+    // entity_identifier is now bound for every component in this group, so its
+    // batch is known. Sweep the measure bindings: a cross_source_numeric column
+    // that has a same-batch (same key space as the entity identifier) alternative
+    // of matching magnitude is redirected, so the engine resolves it through
+    // resolveColumnFromBatch without a boundary join. Structural; no literals.
+    for (const match of groupMatches) {
+      const compKey = `component_${match.component.index}`;
+      const cb = bindings[compKey];
+      if (!cb) continue;
+      const eidBatchId = (cb.entity_identifier as { learning_provenance?: { batch_id?: string } } | undefined)
+        ?.learning_provenance?.batch_id;
+      if (!eidBatchId) continue;
+
+      for (const [role, bindingRaw] of Object.entries(cb)) {
+        if (role === 'entity_identifier' || role === 'period') continue;
+        const binding = bindingRaw as {
+          column: string;
+          field_identity?: { contextualIdentity?: string };
+          confidence: number;
+          learning_provenance?: { batch_id?: string };
+        };
+        if (binding.field_identity?.contextualIdentity !== 'cross_source_numeric') continue;
+
+        const currentMC = measureColumns.find(mc => mc.name === binding.column);
+        if (!currentMC?.stats) continue;
+
+        const sameBatchAlt = measureColumns.find(alt =>
+          alt.batchId === eidBatchId &&
+          alt.name !== binding.column &&
+          alt.stats &&
+          Math.abs(
+            Math.log10(Math.max(alt.stats.mean, 0.001)) -
+            Math.log10(Math.max(currentMC.stats.mean, 0.001)),
+          ) < 1,
+        );
+        if (!sameBatchAlt) continue;
+
+        console.log(
+          `[Convergence] HF-263 P3.2: post-pass redirect ${compKey}:${role} ` +
+          `from cross-source "${binding.column}" to same-batch "${sameBatchAlt.name}" (key-space alignment)`,
+        );
+        binding.column = sameBatchAlt.name;
+        binding.field_identity = sameBatchAlt.fi;
+        binding.confidence = Math.max(binding.confidence, 0.7);
+        if (binding.learning_provenance) binding.learning_provenance.batch_id = sameBatchAlt.batchId;
+      }
+    }
   } // HF-253 end for (variant group)
 
   // Log complete binding map
```

## Phase 4: Calculable Entity Filtering (ebffcc28)
Self-heal + detail fetch filter `entity_type='individual'`; `entityIds` (calc population) narrowed to the individual-only set. Grouping entities excluded as PAYEES, retained as scope SOURCE.
```diff
diff --git a/web/src/app/api/calculation/run/route.ts b/web/src/app/api/calculation/run/route.ts
index 2ba6843d..08119ea9 100644
--- a/web/src/app/api/calculation/run/route.ts
+++ b/web/src/app/api/calculation/run/route.ts
@@ -406,6 +406,7 @@ export async function POST(request: NextRequest) {
         .from('entities')
         .select('id')
         .eq('tenant_id', tenantId)
+        .eq('entity_type', 'individual')  // HF-263: never self-assign grouping entities for calculation
         .range(entPage * PAGE_SIZE, (entPage + 1) * PAGE_SIZE - 1);
       if (!ep || ep.length === 0) break;
       allTenantEntityIds.push(...ep.map(e => e.id));
@@ -505,7 +506,8 @@ export async function POST(request: NextRequest) {
     const { data: page, error: entErr } = await supabase
       .from('entities')
       .select('id, external_id, display_name, metadata')
-      .in('id', batch);
+      .in('id', batch)
+      .eq('entity_type', 'individual');  // HF-263: exclude grouping entities (hubs/territories) from calc
     if (entErr) {
       console.log(`[R3-DIAG] Entity batch ${i}-${i+batch.length} ERROR: ${entErr.message}`);
     }
@@ -514,6 +516,18 @@ export async function POST(request: NextRequest) {
 
   const entityMap = new Map(entities.map(e => [e.id, e]));
 
+  // HF-263: drop grouping (non-individual) entities from the calculation population.
+  // entityMap was fetched with entity_type='individual', so any assigned id absent from
+  // it is a grouping entity (e.g. a hub). They remain in committed_data / dataByEntity /
+  // allEntityRowsForPeriod as the scope SOURCE (HALT-5 preserved) — only excluded as payees.
+  {
+    const beforeCount = entityIds.length;
+    entityIds = entityIds.filter(id => entityMap.has(id));
+    if (entityIds.length !== beforeCount) {
+      addLog(`HF-263: excluded ${beforeCount - entityIds.length} grouping (non-individual) entities from calculation population`);
+    }
+  }
+
   // ── 3. Fetch period (OB-152: include end_date for source_date hybrid path) ──
   const { data: period } = await supabase
     .from('periods')
```

### HALT-5 preservation evidence — `allEntityRowsForPeriod` reads from `dataByEntity` (committed_data), NOT the filtered entity set
`web/src/app/api/calculation/run/route.ts:1718-1734`:
```ts
  // HF-238 Phase 3: build allEntityRows once per period for the scope+aggregate
  // prime composition. The structural scope prime narrows allEntityRows to
  // peer entities sharing the boundary attribute value; previously this was
  // pre-computed per-entity via aggregateScopeRows (deleted below).
  const allEntityRowsForPeriod: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }> = [];
  for (const [eid, sheetMap] of Array.from(dataByEntity.entries())) {
    const meta = (entityMap.get(eid)?.metadata || {}) as Record<string, unknown>;
    const metaWithId: Record<string, unknown> = { ...meta, entityId: eid };
    for (const [, rows] of Array.from(sheetMap.entries())) {
      for (const r of rows) {
        const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
          ? r.row_data as Record<string, unknown>
          : {};
        allEntityRowsForPeriod.push({ entityMetadata: metaWithId, row: rd });
      }
    }
  }
```
=> Grouping (hub) entities remain in `dataByEntity` and thus in `allEntityRowsForPeriod` (the scope-prime source). The Phase-4 filter narrows only `entityIds` (the payee/calc population). Source preserved.

## Build Gate
```
 ✓ Compiled successfully
   Generating static pages (0/177) ...
   Generating static pages (44/177) 
   Generating static pages (88/177) 
localhost:3000 -> HTTP 307 (auth redirect, normal); dev server Ready in ~1.1s.
```

## HALT Disposition Log
- HALT-1: RESOLVED — hub creation at `entity-resolution.ts:283` (CC diagnostic; architect confirmed). Phase 1 targets it.
- HALT-2: RESOLVED — `uq_entity_relationship(tenant_id, source_entity_id, target_entity_id, relationship_type)` (architect SQL); table accessible w/ expected columns.
- HALT-3: RESOLVED — N/A after Phase 2 relocation (no processEntityUnit-scoped dependency).
- HALT-4: RESOLVED — `measureColumns` carries `batchId` (decl. convergence-service.ts:2501).
- HALT-5: RESOLVED — `allEntityRowsForPeriod` built from `dataByEntity` (evidence above).
- HALT-A: RESOLVED — Phase 2 relocated to post-commit-construction.ts (a53ece18).
- HALT-B: RESOLVED — P3.2 post-pass after entity_identifier bound (dc9c89e3).
- HALT-C: RESOLVED — `entity_id` populated on `data_type='entity'` rows (DIAG-059 P2.1: 67 linked / 0 null; back-linked by resolveEntitiesFromCommittedData before the CPI block).
- HALT-D: RESOLVED — `measureColumns`/`bindings`/`groupMatches` in scope at the post-pass insertion point.

## Architect Verification (PENDING — UI re-import + calc required)
Run from `web/` after re-import + 3-period calc on Meridian:
```
npx tsx scripts/hf263/epg1-entity-types.ts   # PASS: 67 individual / 12 location
npx tsx scripts/hf263/epg2-relationships.ts  # PASS: 67 assigned_to, 12 hubs
npx tsx scripts/hf263/epg3-bindings.ts       # PASS: fleet same-batch as entity_identifier (not cross_source)
npx tsx scripts/hf263/epg4-entity-count.ts   # PASS: 67 calculated, 0 hub payees
npx tsx scripts/hf263/epg5-calc-output.ts    # per-period componentTotals + perEntityTotals (architect reconciles)
```
CC reports calculated values only; the architect reconciles against ground truth.

### Note on EPG-3 (the one non-deterministic gate)
P3.1 (prompt) + P3.2 (deterministic redirect) flip the fleet binding to the same-batch employee-keyed columns (`Cargas_Flota_Hub`/`Capacidad_Flota_Hub`, transaction batch `50b6d0d5`) ONLY when a same-batch, matching-magnitude alternative exists — DIAG-059 P2-F1 confirms it does for Meridian. If a fresh convergence still binds cross-source, epg3 output shows it and the magnitude/selection heuristic is tuned (follow-on).

*HF-263 — Phases 1-4 implemented + build-verified; PR #448. EPG verification architect-executed.*
