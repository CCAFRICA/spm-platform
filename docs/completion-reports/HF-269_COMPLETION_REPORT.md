# HF-269 — Convergence Authority Restoration — COMPLETION REPORT
## Final SHA: 5cc87033e9f66066563b3399558442f9a257fa4d · Date: 2026-06-03
## Commits: A bc57f1df · B 51c724f7 · C 5cc87033

Defect class: a downstream mechanism overriding/discarding the authoritative upstream signal. Three mechanisms keep the OB-189/HF-235 convergence-consumption gap open; fixed together (D1->D2 Complement, D3 Precedent).

## Phase A — Remove HF-263 P3.2 magnitude-proxy redirect (bc57f1df)
### A.1 class enumeration
```
:2297-2298  crossSourceNote annotation (resolveColumnMappingsViaAI)   -> (legitimate, D2 consumes it)
:2558,:2571 HF-228 cross-data-type discovery TAGGING cross_source_numeric -> (legitimate classification, retained A.3)
:2854,:2856,:2876,:2893,:2896  HF-263 P3.2 redirect block (binding.column = sameBatchAlt.name) -> (OVERRIDE, removed A.2)
```
All hits classified — no HALT-A.
### A.2/A.4 removal diff
```diff
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index 76a46312..50eebd51 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -2851,54 +2851,14 @@ async function generateAllComponentBindings(
     }
     } // end for (match of groupMatches)
 
-    // ── HF-263 P3.2 (HALT-B): post-pass cross-source redirect ──
-    // entity_identifier is now bound for every component in this group, so its
-    // batch is known. Sweep the measure bindings: a cross_source_numeric column
-    // that has a same-batch (same key space as the entity identifier) alternative
-    // of matching magnitude is redirected, so the engine resolves it through
-    // resolveColumnFromBatch without a boundary join. Structural; no literals.
-    for (const match of groupMatches) {
-      const compKey = `component_${match.component.index}`;
-      const cb = bindings[compKey];
-      if (!cb) continue;
-      const eidBatchId = (cb.entity_identifier as { learning_provenance?: { batch_id?: string } } | undefined)
-        ?.learning_provenance?.batch_id;
-      if (!eidBatchId) continue;
-
-      for (const [role, bindingRaw] of Object.entries(cb)) {
-        if (role === 'entity_identifier' || role === 'period') continue;
-        const binding = bindingRaw as {
-          column: string;
-          field_identity?: { contextualIdentity?: string };
-          confidence: number;
-          learning_provenance?: { batch_id?: string };
-        };
-        if (binding.field_identity?.contextualIdentity !== 'cross_source_numeric') continue;
-
-        const currentMC = measureColumns.find(mc => mc.name === binding.column);
-        if (!currentMC?.stats) continue;
-
-        const sameBatchAlt = measureColumns.find(alt =>
-          alt.batchId === eidBatchId &&
-          alt.name !== binding.column &&
-          alt.stats &&
-          Math.abs(
-            Math.log10(Math.max(alt.stats.mean, 0.001)) -
-            Math.log10(Math.max(currentMC.stats.mean, 0.001)),
-          ) < 1,
-        );
-        if (!sameBatchAlt) continue;
-
-        console.log(
-          `[Convergence] HF-263 P3.2: post-pass redirect ${compKey}:${role} ` +
-          `from cross-source "${binding.column}" to same-batch "${sameBatchAlt.name}" (key-space alignment)`,
-        );
-        binding.column = sameBatchAlt.name;
-        binding.field_identity = sameBatchAlt.fi;
-        binding.confidence = Math.max(binding.confidence, 0.7);
-        if (binding.learning_provenance) binding.learning_provenance.batch_id = sameBatchAlt.batchId;
-      }
-    }
+    // HF-269 Phase A: the HF-263 P3.2 magnitude-proxy post-pass redirect was REMOVED here.
+    // It rewrote any cross_source_numeric measure binding to a same-batch column chosen by
+    // magnitude proximity (log10 mean within 1). Magnitude is size, not meaning: a quota-style
+    // column in the entity-identifier's batch sits in the same numeric band as transaction
+    // amounts/counts, so the proxy overwrote correct AI mappings with the wrong column for the
+    // general shared-column case. Filter-carrying bindings (Phase B) resolve the cross-source
+    // metric correctly through the validated-mapping path — no magnitude rewrite. cross_source_numeric
+    // remains a valid CLASSIFICATION (HF-228 tagging retained; consumed by the mapping prompt).
   } // HF-253 end for (variant group)
 
   // Log complete binding map
```
A.4 EPG: no redirect code remains (sameBatchAlt deleted; only a removal-marker comment references P3.2). Build clean (HALT-B CLEAR — no dependent site).

## Phase B — Restore filter vocabulary to the column-mapping call (51c724f7)
Mechanism was 90% present: metricComprehension threaded in; ColumnMappingValue admits {column,filters?}; the PARSER already lands filters (HF-227); isValidColumnMapping accepts the object form (B.3, unchanged); generateAllComponentBindings writes filters:proposedFilters onto the binding (B.4, unchanged). The only missing link was HF-234 removing the filter block from the prompt.
```diff
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index 50eebd51..ce8e6eaa 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -2233,6 +2233,7 @@ async function resolveColumnMappingsViaAI(
   allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
   measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
   metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2
+  categoricals: Array<{ field: string; distinctValues: string[] }> = [], // HF-269 B
 ): Promise<Record<string, ColumnMappingValue>> {
   const metricFields = allRequirements.map(r => r.req.metricField).filter(f => f !== 'unknown');
   const columnNames = measureColumns.map(c => c.name);
@@ -2301,22 +2302,38 @@ async function resolveColumnMappingsViaAI(
     return `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})${range}${crossSourceNote}`;
   }).join('\n');
 
-  // HF-114 / HF-199 D2: User prompt now carries plan-agent semantic intent per metric
-  // when comprehension:plan_interpretation signals are present (HF-198 E5 read).
-  // System prompt is defined in SYSTEM_PROMPTS['convergence_mapping'] (anthropic-adapter.ts).
-  //
-  // HF-234 — categorical-context block REMOVED. Column mapping is structural;
-  // filter discovery belongs to Pass 4 (generateAISemanticDerivations) which
-  // produces metric_derivations rules consumed by the engine alongside these
-  // bindings. The prompt now asks for a single concern — pure column mapping.
+  // HF-269 B: surface the runtime CATEGORICAL DIMENSIONS (field + distinct values) so the AI can
+  // express the filter that turns a shared column into the per-plan metric (SUM(col) WHERE cat=X).
+  // Korean Test: every field name and value is read VERBATIM from runtime data
+  // (capabilities[*].categoricalFields[*].distinctValues) — no hardcoded names, no language literals.
+  const categoricalList = categoricals.length > 0
+    ? categoricals
+        .map((c, i) => `${i + 1}. "${c.field}" distinct values: [${c.distinctValues.map(v => `"${v}"`).join(', ')}]`)
+        .join('\n')
+    : '(none)';
+  // Enriched example built from runtime arrays (Korean Test: not literals). Falls back to structural
+  // placeholders only when no categorical dimension exists at runtime.
+  const firstCat = categoricals.find(c => c.distinctValues.length > 0);
+  const enrichedExample = firstCat
+    ? `{"${metricFields[0] || 'metric_a'}": {"column": "${columnNames[0] || 'Column_A'}", "filters": [{"field": "${firstCat.field}", "operator": "eq", "value": "${firstCat.distinctValues[0]}"}]}}`
+    : `{"${metricFields[0] || 'metric_a'}": {"column": "${columnNames[0] || 'Column_A'}", "filters": [{"field": "<categorical_col>", "operator": "eq", "value": "<one_of_its_distinct_values>"}]}}`;
+
+  // HF-114 / HF-199 D2: User prompt carries plan-agent semantic intent per metric.
+  // System prompt is SYSTEM_PROMPTS['convergence_mapping'] (anthropic-adapter.ts).
+  // HF-269 B: restores filter vocabulary (HF-234 removed it) — the binding the engine reads
+  // (Decision 111) must carry the authoritative comprehension's filter, not just a flat column.
   const userPrompt = `Match each metric field to the best data column. Each column used at most once.
-Plan-agent intent and inputs (when shown) are AUTHORITATIVE — bind columns that
-satisfy the stated intent over columns that merely share contextual labels.
-When a metric field participates in a ratio (a numerator or denominator), use the
-value ranges shown in brackets as a consistency signal: prefer a column whose
-magnitude is consistent with the role the field plays, rather than a column that
-merely resembles the field by label. A value range bounded near 0-1 typically
-indicates an already-computed proportion, not a raw operand.
+Plan-agent intent and inputs (when shown) are AUTHORITATIVE — bind columns that satisfy the stated
+intent over columns that merely share contextual labels, for BOTH the column choice and the filter.
+When a metric field participates in a ratio (a numerator or denominator), use the value ranges shown
+in brackets as a consistency signal: prefer a column whose magnitude is consistent with the role the
+field plays. A value range bounded near 0-1 typically indicates an already-computed proportion.
+
+When a metric's plan-agent intent implies a SUBSET of a broader/shared column (the metric is that
+column summed/counted WHERE a categorical dimension equals a specific value), return the ENRICHED form
+{"column": "<col>", "filters": [{"field": "<categorical_col>", "operator": "eq", "value": "<distinct_value>"}]},
+choosing "field" ONLY from a listed CATEGORICAL DIMENSION and "value" ONLY from that field's listed
+distinct values. When no subset is implied, return the flat column-name string.
 
 METRIC FIELDS:
 ${metricList}
@@ -2324,8 +2341,14 @@ ${metricList}
 DATA COLUMNS:
 ${columnList}
 
-EXAMPLE OUTPUT (flat metric-to-column map):
-{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", "${metricFields[1] || 'metric_b'}": "${columnNames[1] || 'Column_B'}"}`;
+CATEGORICAL DIMENSIONS (any filter "field" and "value" MUST come from these):
+${categoricalList}
+
+EXAMPLE OUTPUT (flat — no filter needed):
+{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}"}
+
+EXAMPLE OUTPUT (filtered — metric is a subset of a shared column):
+${enrichedExample}`;
 
   try {
     const aiService = getAIService();
@@ -2609,11 +2632,23 @@ async function generateAllComponentBindings(
     const groupComponents = groupMatches.map(m => m.component);
 
     console.log(`[Convergence] HF-253 Requesting AI column mapping for variant group ${variantLabel}`);
+    // HF-269 B: collect the runtime categorical dimensions (field + distinct values) across all
+    // capabilities so the mapping call can express filters from real data (Korean Test — runtime only).
+    const categoricalDims: Array<{ field: string; distinctValues: string[] }> = [];
+    const seenCatFields = new Set<string>();
+    for (const cap of capabilities) {
+      for (const cf of cap.categoricalFields ?? []) {
+        if (!cf.field || seenCatFields.has(cf.field)) continue;
+        seenCatFields.add(cf.field);
+        categoricalDims.push({ field: cf.field, distinctValues: cf.distinctValues });
+      }
+    }
     const aiMapping = await resolveColumnMappingsViaAI(
       groupComponents,
       allRequirements,
       measureColumns,
       metricComprehension,
+      categoricalDims,
     );
     console.log(`[Convergence] HF-253 AI proposed ${Object.keys(aiMapping).length} mappings for variant group ${variantLabel}`);
 
```
### B.5 structural-literal inventory (DD-5)
Field names + filter values originate ONLY from runtime arrays: metricFields, columnNames, capabilities[*].categoricalFields[*].distinctValues. The only string literals are: JSON keys ("column","filters","field","operator","value"); the operator enum member 'eq'; prose; and structural placeholders (<categorical_col>, <one_of_its_distinct_values>) used ONLY in the no-categorical fallback example. Zero field-name or language literals (Korean Test PASS).
### DD-7 behavior preservation
Additive: absent a filter the binding is byte-identical (filters: []; rowMatchesFilters returns true on empty). Identity-mapped tenants unaffected (verified D3).

## Phase C — Invalidate stale input_bindings on import (5cc87033)
```diff
diff --git a/web/src/app/api/import/sci/execute-bulk/route.ts b/web/src/app/api/import/sci/execute-bulk/route.ts
index 088ab57b..ccd49286 100644
--- a/web/src/app/api/import/sci/execute-bulk/route.ts
+++ b/web/src/app/api/import/sci/execute-bulk/route.ts
@@ -344,6 +344,30 @@ export async function POST(req: NextRequest) {
     // HF-196 Phase 1: post-commit construction — entity resolution + back-link.
     await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });
 
+    // HF-269 Phase C (OB-195 cache invalidation): new data was just imported, so any persisted
+    // input_bindings are stale — they may bind columns that no longer resolve against the new data,
+    // and the HF-165 calc gate would skip convergence and re-use them, producing zero. Clear them
+    // (write {} — rule_sets.input_bindings is jsonb NOT NULL) so convergence RE-DERIVES on the next
+    // calculation (Decision 92 keeps binding at calc time; it re-runs because the bindings are empty,
+    // not because the gate changed). Scoped STRICTLY to the importing tenant's active/draft rule_sets —
+    // never touches other tenants. (HF-239 deleted a BLANKET wipe that masked stale bindings; this is
+    // the scoped OB-195-correct form, now that Phase B's filter-carrying bindings re-derive correctly.)
+    try {
+      const { data: clearedRs, error: clearErr } = await supabase
+        .from('rule_sets')
+        .update({ input_bindings: {} })
+        .eq('tenant_id', tenantId)
+        .in('status', ['active', 'draft'])
+        .select('id');
+      if (clearErr) {
+        console.error('[SCI Bulk] input_bindings invalidation failed (non-blocking):', clearErr.message);
+      } else {
+        console.log(`[SCI Bulk] Cleared input_bindings on ${clearedRs?.length ?? 0} rule_sets (new data imported — convergence will re-derive)`);
+      }
+    } catch (err) {
+      console.error('[SCI Bulk] input_bindings invalidation threw (non-blocking):', err instanceof Error ? err.message : String(err));
+    }
+
     // HF-239 Phase 0.3: HF-126 rule_set_assignments creation. Calculation
     // engine requires assignments to route entities to plans. Fire-and-forget
     // at the surface level — failures are logged but do not block.
```
### C.3 EPG (scope)
```
.update({ input_bindings: {} }).eq('tenant_id', tenantId).in('status', ['active', 'draft'])
```
Scoped by tenant_id AND status (HALT-C CLEAR). Writes {} (jsonb NOT NULL). HF-239 deleted a BLANKET wipe; this is the scoped OB-195 form, viable now that Phase B re-derives correctly.

## Phase D — Build gate
```
rm -rf .next && npm run build -> Compiled successfully
npm run dev -> Ready in 1183ms ; curl localhost:3000 -> HTTP 307 (auth redirect, normal)
```

### D.2-D.4 live calc — ARCHITECT-EXECUTED
CC cannot drive the UI import/calc, and CRP committed_data is currently empty (HF-267/268 findings). The architect runs the clean-import + calc and captures verbatim (no reconciliation by CC):
- D.2 (CRP, shared-column): per plan — the 'HF-114 AI mapping' line (now expected to carry {column,filters} for shared-column metrics), NO 'HF-263 P3.2' line, the 'HF-108 ... component bindings' line WITH per-binding filters= count, and the [CalcRecon-T1] footer (entitiesCalculated, grandTotal, componentTotals).
- D.3 (Meridian, identity-mapped, DD-7): mapping line = identity, no P3.2 line, filters=0 on every binding; footer per period — must be byte-identical to verified-PASS.
- D.4 (BCL): mapping line + footer per period — regression.

### SR-38 mathematical-review gate (variability signature)
The success signature is that per-entity values for a filtered-actual component are VARIABLE across entities (the engine is summing filtered actuals). A column of identical per-entity totals is the flat-constant failure signature this HF removes — its presence is HALT-D (binding still reading a quota/constant). CC asserts the signature; the architect confirms it from the D.2 per-entity output. (CC ran no calc — no fabricated values.)

## §6A residual (verification-gated)
§6 scopes engine internals out on the assumption HF-227's filter-respecting resolution executes binding.filters on the convergence_bindings path. If D.2 shows filters= present but per-entity totals stay flat (HALT-D), the follow-on is an engine-resolution HF (resolveColumnFromBatch) — this HF proves the filter is ON the binding; whether the engine honors it is the boundary.

*HF-269 — A+B+C implemented, build-verified, EPGs pasted. Live calc + reconciliation architect-executed. Final SHA: 5cc87033e9f66066563b3399558442f9a257fa4d*
