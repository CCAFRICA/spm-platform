# HF-301 — Completion Report
## Remove Whole-Tenant Scan from Calc Route (AUD-006 RC-1)

**Date:** 2026-06-17 · **Branch:** `hf-301-calc-route-period-scoped` · **Predecessor:** AUD-006, DIAG-071/HF-300.
**Outcome:** the calc timeout is fixed by **one** edit (RC-1). The other two directed edits were adjudicated against the live code: **Edit 3 (RC-3) was already implemented; Edit 2 (RC-2) is not the timeout cause and is deferred.** Build exit-0. Awaiting architect SR-44 proof gate.

> **Read first — divergence from the directive (surfaced, not silent).** The directive's three-edit map is partly inaccurate against `run/route.ts`. I verified each edit site in code before acting (per the directive's own "read the code, use the correct one" latitude) and did not fabricate edits to match the snippets. Detail below.

---

## 1 — Number verification
```
docs/vp-prompts/        grep ^HF-301 → only the directive's own save (HF-301_CALC_ROUTE_PERIOD_SCOPED_20260617.md)
docs/completion-reports grep ^HF-301 → free
git log --all           grep HF-301   → free
```
HF-301 confirmed free for this report/branch/PR.

---

## 2 — Edit 1 (RC-1) — IMPLEMENTED — the actual timeout fix

The directive named `resolveEntitiesFromCommittedData` as a direct calc-route call; in fact the calc route calls the wrapper **`resolveEntitiesAtCalcTime`** (imported at line 43, called at line 169), which delegates to `resolveEntitiesFromCommittedData` — a **whole-tenant** scan of every `committed_data` row (165,897 on MIR) + entity_id back-link UPDATE. That is the 300s timeout (AUD-006 RC-1).

**Diff — call site removed (`run/route.ts` ~164-187):**
```diff
-  // ── HF-196 Phase 2: Calc-time entity resolution (Break #2 closure) ──
-  try {
-    const entityResolution = await resolveEntitiesAtCalcTime(tenantId, supabase);
-    addLog(`Calc-time entity resolution: …`);
-    if (entityResolution.unmatched > 0) { addLog(`[DATA QUALITY] …`); }
-  } catch (err) {
-    addLog(`Calc-time entity resolution failed (non-blocking): …`);
-  }
+  // ── HF-301 (AUD-006 RC-1): whole-tenant calc-time entity resolution REMOVED from the hot path. ──
+  // …165,897-row scan + back-link UPDATE dominated the 300s budget (AUD-006). OB-183 resolves entity_id
+  // IN-MEMORY from row_data[metadata.entity_id_field] using only PERIOD rows (the calcTimeResolved loop,
+  // Phase 4). The durable back-link is the import's job now (HF-300 finalize-import). Korean Test: keys on
+  // the structural metadata.entity_id_field, no field-name matching.
+  addLog('HF-301: whole-tenant calc-time entity resolution skipped — OB-183 resolves period-scoped entity_id in-memory (Phase 4)');
```
**Diff — now-unused import removed (line 43):**
```diff
-import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
+// HF-301 (AUD-006 RC-1): resolveEntitiesAtCalcTime import REMOVED — whole-tenant scan timed out the calc.
```
**OB-183 in-memory resolution confirmed present and fires in Phase 4** (grouping loop, `run/route.ts`):
```
739:  let calcTimeResolved = 0;
755:          if (resolvedEntityId) calcTimeResolved++;   // extIdToUuid.get(row_data[entity_id_field])
795:  if (calcTimeResolved > 0) addLog(`OB-183: Resolved ${calcTimeResolved} rows to entities at calc time …`);
```
So per-unit entity binding still happens — from the period rows already loaded — without the whole-tenant scan. DB supports it: `metadata.entity_id_field` populated on 165,867/165,897 rows (99.98%).

---

## 3 — Edit 2 (RC-2) — DEFERRED (not the timeout cause; safe period-scoping needs a reorder)

The HF-126/HF-189 self-heal (`run/route.ts:451-493`) fetches `allTenantEntityIds` — **553 entities on MIR** (the directive's own figure). A 553-row id fetch is sub-second; it is **not** a 300s timeout cause (that is RC-1's 165k-row scan, now removed).

Period-scoping it as the directive proposes (use `dataByEntity.keys()`) is **not possible at that site**: `dataByEntity` is built at line 701, **after** the self-heal at 451, and the self-heal's `entityIds` output feeds the entity-row fetch at line 557 and the HF-263 filter at 578 — all before the data load (619) and grouping (701). Scoping to period entities would require reordering the calc route's first half (load data → OB-183 resolve → build population → fetch entity rows → self-heal), a structural change with real regression risk on the `entityIds → entity fetch` dependency, for negligible benefit at MIR scale.

**Decision:** left the self-heal as-is (it is the calc-time assignment backstop, complementing HF-300's import-time assignments). **Scale-by-Design note for the architect:** at a very large tenant the *all-tenant* self-heal fetch would matter; if you want it period-scoped, it should be a focused, separately-verified reorder — I did not bundle that risk into this timeout HF. No diff (no change made).

---

## 4 — Edit 3 (RC-3) — ALREADY IMPLEMENTED (HF-165); no change

RC-3 ("convergence reads ALL rule_sets") does not exist in the code. Convergence is a **single** call, **gated** on empty/stale bindings and **scoped to the requested `ruleSetId`** — already exactly what Edit 3 prescribes:
```ts
// run/route.ts (existing HF-165)
if ((!hasMetricDerivations && !hasConvergenceBindings) || !bindingsAreCurrent) {   // :249 — skip if bindings exist
  addLog('HF-165: input_bindings empty — running calc-time convergence');
  const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);  // :252 — single rule_set
  …persist to that one rule_set…                                                              // :287-290
}
```
There is no `for (const rs of allRuleSets)` convergence loop (the only all-plans read is OB-186 cross-plan *metric* resolution at :374-392, which reads 4 rule_set `input_bindings` rows — not committed_data, not convergence). **No change made.**

---

## 5 — Build
`rm -rf .next && npm run build` → ✓ Compiled successfully, types validated, **BUILD_EXIT=0**. Sanity (directive §4): `resolveEntitiesAtCalcTime` / `resolveEntitiesFromCommittedData` appear only in HF-301 comments; three `HF-301` markers present; `calcTimeResolved` loop intact.

---

## 6 — Scope fence (NOT touched)
- **Import pipeline** (`execute-bulk`, `finalize-import`): untouched.
- **Route A** (`execute/route.ts`): untouched — BCL/Meridian/CRP unaffected.
- **`entity-resolution.ts` / `calc-time-entity-resolution.ts`:** the functions are unchanged; only the *call* was removed from the calc hot path.
- **Schema / migrations / plan interpretation:** untouched.
- **Convergence + self-heal logic:** unchanged (Edit 3 already correct; Edit 2 deferred).

---

## 7 — Net effect & honest limit
Removing the 165k-row whole-tenant scan from the calc hot path is the change that lifts MIR calc under the 300s ceiling; convergence is already single-rule_set+gated, and the 553-entity self-heal is negligible. **I cannot run the calc (browser/prod, SR-44)** — the architect's proof gate (Calculate each of the 5 MIR plans within 300s; BCL/Meridian/CRP regression) is the empirical confirmation. If a plan still times out after this, the next suspect is the per-entity engine loop itself, not a whole-tenant scan.

---

*HF-301 · Remove Whole-Tenant Scan from Calc Route · 2026-06-17 · vialuce.ai*
