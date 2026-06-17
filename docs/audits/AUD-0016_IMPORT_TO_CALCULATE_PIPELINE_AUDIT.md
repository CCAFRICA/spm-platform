# AUD-0016: Import-to-Calculate Pipeline Audit

**Date:** 2026-06-17
**Main HEAD:** `5e41eff3` (HF-301 present: `66a0dec2`)
**Auditor:** CC (live codebase read, read-only)
**Number note:** directive issued as "AUD-006"; AUD-006 is already a committed/merged *different* audit (Signal-Write Pipeline, PR #384). Renumbered to **AUD-0016** (architect-confirmed; next free after AUD-0015).

## Pipeline Overview
A tenant uploads spreadsheets + plan PDFs. **Analyze** (Phase 1) classifies each sheet into one of `entity | target | transaction | reference | plan` and returns a proposal. On confirm, **execute-bulk** (Phase 2) downloads each file server-side and writes its rows to `committed_data` per content unit, returning the per-file response immediately (HF-297). **Plan interpretation** (Phase 3) turns each plan PDF into a `rule_sets` row, superseding only the same-named prior plan (HF-300 C1). After the import completes, the client fires **finalize-import** (Phase 4, HF-300 C3) which runs the whole-tenant **entity resolution** (Phase 5) — linking `committed_data.entity_id` — plus assignment creation, **once, in a live request**. **Calculation** (Phase 7) then loads the *period-scoped* rows, resolves entity_id **in-memory** (OB-183), self-heals assignments, runs **convergence** (Phase 8) once per rule_set to derive metric bindings, and iterates the per-entity engine loop to produce results. HF-301 removed the whole-tenant entity scan from the calc hot path.

## Phase Map
| # | Phase | File | Lines | Scope | One line |
|---|---|---|---|---|---|
| 1 | Analyze | `api/import/sci/analyze/route.ts` | 1057 | per-file (sampled) | classify sheets → proposal |
| 2 | Execute (Route B) | `api/import/sci/execute-bulk/route.ts` | 1181 | per-file | download + write committed_data |
| 3 | Plan interpretation | `lib/sci/plan-interpretation.ts` | 512 | per-plan | plan PDF → rule_sets (name-scoped supersession) |
| 4 | Finalize import | `api/import/sci/finalize-import/route.ts` | 78 | whole-tenant, once, live req | entity resolution + assignments after import |
| 5 | Entity resolution | `lib/sci/entity-resolution.ts` | 474 | **whole-tenant** | scan committed_data → create entities + back-link entity_id |
| 6 | Calc-time entity resolution | `lib/sci/calc-time-entity-resolution.ts` | 139 | (whole-tenant) | wrapper for Phase 5 — **no longer called by calc (HF-301)** |
| 7 | Calculation | `api/calculation/run/route.ts` | 3186 | period-scoped (hot path) | load period data, resolve in-memory, compute |
| 8 | Convergence | `lib/intelligence/convergence-service.ts` | 3630 | single rule_set; `inventoryData` whole-tenant (gated) | derive metric bindings, once per rule_set |

---

## Import Pipeline (Phases 1–4)

### Phase 1 — Analyze (`analyze/route.ts:46`)
`POST` accepts parsed file data + an optional `clientSessionId`, mints `proposalId === importSessionId` (`:88-92`), classifies each sheet (fingerprint flywheel → HC pattern → CRR Bayesian; same logic as the async `process-job` worker), and returns a `SCIProposal { contentUnits[] }` (`:70/:98`). **Scope:** per-file, sampled (`ANALYSIS_SAMPLE_SIZE` rows). Writes classification signals; does not write `committed_data`.

### Phase 2 — Execute-bulk (`execute-bulk/route.ts:117`)
**2a — POST flow (in order):** auth → parse body → reconcile stale batches (D16.1) → per-file download+parse loop (`fileEntries`, `:193`, emits `[SCI Bulk] Downloading from Storage`) → resume classification → per-unit commit loop (`:424`) → build response → **return immediately** (HF-297) → best-effort `waitUntil` (flywheel + bound re-emit only). **The per-file response no longer blocks on post-commit (HF-297); the critical post-commit moved to Phase 4 (HF-300).**

**2b — dispatch (`:749 processContentUnit`):** a switch on `unit.confirmedClassification`:
```ts
case 'entity':      return processEntityUnit(...);
case 'target':      return processDataUnit(..., 'target', ...);
case 'transaction': return processDataUnit(..., 'transaction', ...);
case 'reference':   return processReferenceUnit(...);
case 'plan':        // removed per-unit path (HF-257) — handled by executeBatchedPlanInterpretation
```

**2c — `processDataUnit` (`:1066`)** delegates the write to the unified `commitContentUnit` (HF-231), then `populateStoreMetadata`:
```ts
const commitResult = await commitContentUnit(supabase, {
  unit, rows, classification, tenantId, proposalId, tabName,
  fileName: `sci-bulk-${proposalId}`, source: 'sci-bulk', fileHashSha256,
});
if (totalInserted > 0 && commitResult.entityIdField)
  await populateStoreMetadata(supabase, tenantId, rows, commitResult.entityIdField);
```
`entity_id`, `period_id`, `source_date` on each `committed_data` row are set inside `commitContentUnit` (the sole write surface): `entity_id` is left for resolution (Phase 4/5), `source_date`/`period_id` are derived from the row's temporal field. **Scope:** per-unit (this sheet's rows).

**2d — `processEntityUnit` (`:799`)** creates `entities` rows from the roster sheet's identifier/name/attribute columns (per-unit). **2e — `processReferenceUnit` (`:1122`)** writes reference rows through the same `commitContentUnit` surface but does not create entities. **2f — post-commit:** none in execute-bulk anymore — HF-300 moved entity resolution + assignments to Phase 4; HF-301 removed the calc-time variant. (OB-182 had earlier removed convergence from the import path → it runs at calc time, Phase 8.)

### Phase 3 — Plan interpretation (`plan-interpretation.ts`)
Exported orchestrator: HF-259 content-hash **reuse** short-circuit (`:223`) → single-flight `claimRun` on `(tenant_id, content_hash)` (`:236`) → Phase-A skeleton + Phase-B component construction via `bridgeAIToEngineFormat` → **name-scoped supersession** (HF-300 C1, `:363`):
```ts
.from('rule_sets').update({ status: 'archived', ... })
  .eq('tenant_id', tenantId).eq('name', planName).neq('status', 'archived')
```
→ upsert the new `active` rule_set (`:398`). **Scope:** per-plan. Idempotent: re-importing N plans converges to N active.

### Phase 4 — Finalize import (`finalize-import/route.ts`, HF-300 C3)
Client fires it once on import completion. In a **live request** (maxDuration 300):
```ts
await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });  // → Phase 5 (whole-tenant)
await supabase.from('rule_sets').update({ input_bindings: {} }).eq('tenant_id', tenantId).in('status', ['active','draft']);
const assignments = await createMissingAssignments(supabase, tenantId);
```
**Scope:** whole-tenant, **once**, off the calc hot path. This is where the 165k-row entity resolution now runs (reliably, because it's a live request — the prior `waitUntil` background did not complete on Vercel; DIAG-071).

---

## Calculation Pipeline (Phases 5–8)

### Phase 5 — `resolveEntitiesFromCommittedData` (`entity-resolution.ts:28`) — WHOLE-TENANT
Paginates **all** `committed_data` for the tenant (no period filter), discovers identifier columns per batch, creates `entities`, and back-links `committed_data.entity_id`:
```ts
let offset = 0;
while (true) {
  let dq = supabase.from('committed_data')
    .select('import_batch_id, metadata, data_type')
    .eq('tenant_id', tenantId).range(offset, offset + 999);   // ← whole-tenant, paged
  dq = applyCommittedDataVisibility(dq, hiddenBatchIds);
  const { data: rows } = await dq; if (!rows?.length) break; ...
}
```
**Scope:** whole-tenant (165,897 rows on MIR). **Callers now:** Phase 4 finalize + import post-commit. **NOT the calc route** (HF-301 removed that call).

### Phase 6 — `calc-time-entity-resolution.ts` — DEAD FROM CALC PATH
`resolveEntitiesAtCalcTime` wraps Phase 5 with before/after NULL counts. **HF-301 removed its only calc-route call site.** The module remains in the tree but is no longer invoked by `run/route.ts` (grep: only HF-301 comment references remain). Effectively dead unless a future caller is added.

### Phase 7 — Calculation route (`run/route.ts`)
- **7a Setup:** body `{tenantId, periodId, ruleSetId}` (`:73`); fetch the one rule_set (`:192`); period; visibility gate hides non-completed/superseded batches.
- **7b Entity population:** `entityIds` = assignments for this rule_set (`:449`) → self-heal (7f) → fetch `entities` rows by `entityIds` (`:557`) → HF-263 filter to `individual` (`:578`). **Scope:** assigned entities (period-relevant after self-heal).
- **7c Data fetch (OB-152 hybrid):** **period-scoped** — `source_date` range (`:630`), `period_id` fallback (`:662`), OB-128 period-agnostic `period_id IS NULL` (`:686`). On MIR Jan-2025 ≈ 26,304 rows, not 165k.
- **7d OB-183 in-memory resolution (`:739`):** resolves `entity_id` from `row_data[metadata.entity_id_field]` via `extIdToUuid`, building `dataByEntity` (keys = entity UUIDs):
```ts
const rowEntityIdField = (rowMeta?.entity_id_field as string) || fallbackEntityIdField;
resolvedEntityId = extIdToUuid.get(String(extId).trim()) || null;
if (resolvedEntityId) calcTimeResolved++;
dataByEntity.get(resolvedEntityId)!...  // period-scoped, in-memory
```
- **7e HF-301 marker (`:164`):** confirmed — the whole-tenant `resolveEntitiesAtCalcTime` call is **removed**:
  > `HF-301: whole-tenant calc-time entity resolution skipped — OB-183 resolves period-scoped entity_id in-memory (Phase 4)`
- **7f HF-126/HF-189 self-heal (`:451-493`):** fetches **all tenant** individual entity ids (`allTenantEntityIds`), creates missing `(entity, ruleSetId)` assignments. **Scope:** whole-tenant *entity-id* fetch (553 on MIR — small; not the timeout). Period-scoping deferred (HF-301 report Edit 2).
- **7g Convergence (HF-165, `:249`):** gated — runs only if `input_bindings` empty/stale, **single rule_set**:
```ts
if ((!hasMetricDerivations && !hasConvergenceBindings) || !bindingsAreCurrent) {
  const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);  // one rule_set
  ...persist to that rule_set...
}
```
- **7h Per-entity engine loop (`:1115`, `:1783`):** `for (const entityId of calculationEntityIds)` → resolves component metrics → `executeIntent(ci, entityData)` (`:2597`) per component. **Scope:** O(period entities × components) — MIR ≈ 553 × 5. This is the remaining calc cost after HF-301.

### Phase 8 — `convergeBindings` (`convergence-service.ts:212`)
Single rule_set (`:230 .eq('id', ruleSetId)`); extracts components; loads metric_comprehension signals scoped to `(tenant, ruleSet)`; then `inventoryData(tenantId, supabase)` (`:254`) inventories the tenant's committed_data capabilities (**whole-tenant**), matches plan metrics to data columns, returns derivations + component bindings. **Scope:** single rule_set, but `inventoryData` is whole-tenant — **gated** by HF-165 so it runs at most once per rule_set (first calc), not on steady-state calcs.

---

## Scaling Risk Assessment (post-HF-301)
| Operation | Where | Scope | MIR impact | Becomes a problem at | Hot path? |
|---|---|---|---|---|---|
| `resolveEntitiesFromCommittedData` | Phase 4/5 | whole-tenant 165k-row scan + UPDATE | ~minutes at import (now in a live 300s request) | already heavy at 165k; risks the 300s **import-finalize** budget at much larger row counts | **No** (import, once) |
| HF-126/189 self-heal entity fetch | 7f | whole-tenant entity-id fetch (553) | sub-second | tens-of-thousands of entities | Yes (calc) — small |
| `inventoryData` in convergence | 8 | whole-tenant data inventory | one-time per rule_set | large tenants on *first* calc per plan | Gated (once) |
| Per-entity engine loop | 7h | O(period entities × components) | 553×5, in-memory | very large entity populations / many components | **Yes (calc)** — the dominant remaining calc cost |
| Period data fetch (OB-152) | 7c | period-scoped | 26k rows | very large single-period datasets | Yes (calc) — bounded by period |

**The calc hot path no longer contains a whole-tenant data scan** (HF-301). The remaining calc cost is the per-entity engine loop (7h, bounded by period population) and the one-time gated convergence inventory (8). The largest *whole-tenant* operation overall is Phase 5 entity resolution, now confined to the import/finalize path (Phase 4), once.

## HF-301 Verification
`run/route.ts` — the `resolveEntitiesAtCalcTime` call and import are removed; only HF-301 comments + the `addLog` marker remain (grep confirmed). OB-183's `calcTimeResolved` loop (7d) is intact and fires in Phase 4 of the route. The whole-tenant scan is gone from the calc hot path.

## Data State (MIR tenant `972c8eb0-…`, architect-confirmed SQL)
- 165,897 `committed_data` rows; 162,571 with `source_date`; 3,326 null-both.
- January 2025: 26,304 rows by `source_date`.
- 553 entities; 5 active rule_sets; **0 assignments**; **164,256 NULL `entity_id`**.
- `metadata.entity_id_field` populated on 99.98% of rows.
- 6 periods with correct date ranges.

> The 0-assignments / 164k-NULL-entity_id state is the **un-reconciled** MIR data (Phase 4 finalize has not been run/reimported for this tenant yet). HF-300's finalize (Phase 4) or a reimport reconciles it; until then the calc relies on OB-183 (7d) for in-memory binding and HF-126 (7f) for assignment self-heal — both period-scoped, so a *single-period* calc can still succeed even before the whole-tenant back-link runs.

## Open Items
1. **MIR reconciliation outstanding** — Phase 4 finalize must run once (or reimport) to drop NULL entity_id ≈ 0 and create durable assignments. The calc can otherwise self-heal per-period (7d/7f) but the persisted state stays unlinked.
2. **Phase 6 is dead code from the calc path** — `calc-time-entity-resolution.ts` has no calc caller after HF-301; candidate for removal or repurposing (e.g., invoked by finalize for the count telemetry).
3. **7f self-heal is whole-tenant** — fine at 553; a Scale-by-Design follow-up (HF-301 Edit 2 deferred) would scope it to period entities, but it requires reordering the route's population/data-load (the entity fetch at `:557` depends on `entityIds` built before the data load).
4. **Phase 5 (165k scan) at import scale** — now reliable (live request) but still O(all rows); the next scaling ceiling is the *import-finalize* 300s budget, not the calc.
5. **DIAG-070 `[TRACE-*]` logging** remains on main across the import path — verbose; a cleanup residual once the MIR calc is proven.
6. **Per-entity engine loop (7h)** is the dominant remaining calc cost — if a MIR plan still times out after HF-301 + reconciliation, profile this loop, not a whole-tenant scan.

---

*AUD-0016 · Import-to-Calculate Pipeline Audit · 2026-06-17 · vialuce.ai · read-only, no code changes*
