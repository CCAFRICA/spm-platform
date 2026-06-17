# HF-302 — Completion Report
## Convergence File-Affinity (RC-1) + Entity-Key Rollup (RC-3) + Batch-Selection at Resolution (RC-2)

**Date:** 2026-06-17 · **Branch:** `hf-302-convergence-file-affinity` · **Predecessor:** DIAG-072 (main `cc0653af`).
**Status:** BUILT · build exit-0 · dev confirmed `localhost:3000` · Korean Test (G4) clean · **awaiting architect SR-44 proof gate (G1–G4).** Completion report ≠ working — G1–G4 production proof is the gate.

---

## §3.0 — Live-shape verification (recorded BEFORE edits, per the LOCKED Data Contract gate)
1. **`ComponentBinding` (`convergence-service.ts:103-130`)** — fields: `column, field_identity, match_pass(number|'failed'), confidence, scale_factor?, failure_reason?, resolutionFailure?, learning_provenance?{batch_id,learned_at}, filters?`. **No top-level `source_batch_id`.**
2. **`source_batch_id`** — **ABSENT everywhere**: not written in `convergence-service.ts`, not read in `run/route.ts` (both greps empty). → resolves the §2 open question to **case (iii)** → RC-2 takes **§3.3 Case 2** (column-presence selection; **no new persisted field**).
3. **`resolveColumnFromBatch` (`run/route.ts:1534`)** — live signature `(column, lookupKey, filters)`; behavior was **unconditional first-batch-with-rows** (no `source_batch_id` branch, no conditional DIAG-003 fallback). 5 callers: `:1385,:1440,:1441,:1470,:1492` (fieldBinding, num, den, actual, target). *Divergence from §2-C's illustrative `(batchId, column, …)` signature — documented here, not adapted silently; §3.3 Case 2 is independent of the signature, so no second halt.*
4. **`convergeBindings`** — 4 args `(tenantId, ruleSetId, supabase, calculationRunId?)` (§3.0 "use live" — confirmed).
5. **`dataByBatch` build (`run/route.ts:810-839`)** — indexed by a single global `entityCol = knownEntityCols[0]`; rows lacking that column are **skipped** (`:830`) — the structural reason transaction rows keyed differently never reach the paying entity.

**No halt-worthy divergence from the corrected §2** (the source_batch_id-absent reality is exactly what §2's open question + §3.3 Case 2 anticipated).

---

## §3.1 — RC-1: file-affinity candidate pool (`convergence-service.ts`, −27/+12)
**Removed the HF-228 cross-data-type add-loop** that pushed every *unmatched* data_type's numeric columns into `measureColumns` as `cross_source_numeric` (0.4). `measureColumns` is now built **only from matched capabilities** (the existing `for (const match of matches)` loop, `:2709-2734`), restoring the file affinity HF-269 Phase A removed — deterministic, keyed on data_type/batchId.
```diff
-  const matchedDataTypes = new Set(matches.map(m => m.dataType));
-  for (const cap of capabilities) {
-    if (matchedDataTypes.has(cap.dataType)) continue;
-    for (const nf of cap.numericFields) {
-      … measureColumns.push({ … contextualIdentity: 'cross_source_numeric', confidence: 0.4 … }) …
-    }
-  }
+  // HF-302 (RC-1, DIAG-072): the HF-228 cross-data-type column add-loop is REMOVED.
+  // The candidate pool is now scoped to the data_type(s) the BOUNDARY MATCHER associated with
+  // this plan's components. Do NOT restore HF-263 P3.2 (magnitude proxy — deliberately deleted).
```
**DD-2/DD-3 class sweep:** `matchedDataTypes` has no remaining refs; the only other `cross_source_numeric` hits are the now-inert prompt annotation (`:2419-2423`, fires only if a column is so tagged — none will be) and historical comments (`:3146-3151`) — no other injector. `measureColumns.push` sites (`:2719,:2726`) are the matched-capability columns (kept). `resolveColumnMappingsViaAI` has one call site (`:2824`).

## §3.3 — RC-2: column-presence batch selection (`run/route.ts` `resolveColumnFromBatch`, Case 2)
Selection changed from "first batch with any rows" to **"first batch whose rows carry `column` non-null for the entity"**; structured failure (logged `column_in_no_batch` vs `no_rows`) instead of a silent 0. **No signature change → all 5 callers covered (DD-1). No new persisted field.**
```diff
-    for (const [, map] of Array.from(dataByBatch.entries())) {
-      const rows = map.get(entityExternalId);
-      if (rows && rows.length > 0) { entityRows = rows; break; }   // first-with-rows
-    }
+    for (const [, map] of Array.from(dataByBatch.entries())) {
+      const rows = map.get(entityExternalId);
+      if (!rows || rows.length === 0) continue;
+      anyRowsForEntity = true;
+      if (rows.some(rd => rd[column] !== null && rd[column] !== undefined)) { entityRows = rows; break; } // column-presence
+    }
```
**Regression-safe:** single-file (single-batch) tenants have one batch → it is selected exactly as before.

## §3.2 — RC-3: structural secondary-identifier rollup (`run/route.ts` `dataByBatch` build, +60)
Additive. Builds the assigned-entity `external_id` set from `extIdToUuid` (the paying entities), pre-computes per batch the column (≠ `entityCol`) whose **values overlap** that set by majority (≥0.5) — the rollup key — and indexes rows lacking the primary `entityCol` under that rollup column's value. Fully value-based (Korean Test: no column-name literal). Primary index unchanged; `continue` after primary-indexing prevents double-count.
```ts
const entityExtIdSet = new Set(Array.from(extIdToUuid.keys()));
// per-batch: best column by value-overlap with entityExtIdSet (≥0.5) → batchRollupCol
…
if (entityKey) { …primary index…; continue; }            // unchanged path
const rollupCol = batchRollupCol.get(batchId);            // RC-3: rows the primary skipped
if (rollupCol) { const k = String(rd[rollupCol] ?? '').trim(); if (k && entityExtIdSet.has(k)) …index under k… }
```
**Regression-safe:** single-file tenants — the one batch's overlap column is its entity column (= `entityCol`, excluded from rollup discovery) → no secondary index added → no behavior change.

---

## §2 — Data Contract Map, reconciled against what changed
- **`input_bindings.convergence_bindings` (persisted JSONB) — SHAPE UNCHANGED.** RC-1 changes only WHICH candidate columns the AI may bind (content), not the role-binding shape. No field added (RC-2 is Case 2). The HF-226 drift class is not reintroduced.
- **`dataByBatch` (in-memory) — interface UNCHANGED** (`Map<batchId, Map<extIdValue, rows>>`); RC-3 adds secondary entries within the same structure.
- **`resolveColumnFromBatch` — signature UNCHANGED**; internal selection only.

## §3.4 — Build
`pkill next dev; rm -rf .next; npm run build` → ✓ Compiled successfully, types validated, **BUILD_EXIT=0**. `npm run dev` → Ready; `curl /login` → **200**. tsc clean for both changed files.

## §4 — G1–G4 (architect, SR-44, production — evidence placeholders)
- **G1 — MIR clawback non-zero:** _[architect run]_ recalc PLAN DE AJUSTES Y DEVOLUCIONES Jan-2025 → four inputs bound to the original-sales file's columns; `resolveColumnFromBatch` returns non-null `perRowValues` from that batch; non-zero grand total. Paste the `HF-114 AI mapping` line + per-entity resolution lines (look for `HF-302 RC-3: N batch(es) indexed by a secondary rollup key`).
- **G2 — all 5 MIR plans:** _[architect]_ each non-zero where ground truth is non-zero; reconciles vs `MIR_Resultados_Esperados.xlsx`.
- **G3 — single-file regression:** _[architect]_ BCL ($44,590 Oct / $312,033 full), Meridian (Q1), CRP (Plans 1+3 = $364,457.84) recalc to locked values. RC-1 partition + RC-3 rollup are no-ops at one data source (argued above).
- **G4 — Korean Test:** ✅ done — `git diff | grep -iE "DNI|Codigo|Vendedor|Cliente|Monto|Saldo|Nomina|Cobranza|Ventas|Cuota"` on added lines → **empty**.

## Scope fence (DD-7)
Three named root causes only. Untouched: import pipeline, plan interpretation, entity creation, the engine math/intent executor, the persisted binding contract, schema, single-file tenant behavior. HF-263 P3.2 magnitude proxy NOT restored.

---

*HF-302 · Convergence File-Affinity + Entity-Key Rollup + Batch-Selection at Resolution · 2026-06-17 · vialuce.ai*
