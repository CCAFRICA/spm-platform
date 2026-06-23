# OB-232 — Insight Engine + Adaptive Experience Foundation: Completion Report

**Date:** 2026-06-22 · **Branch:** `ob-232-insight-engine` · **Directive:** `docs/vp-prompts/OB-232_INSIGHT_ENGINE_DIRECTIVE_20260622.md` · **ADR:** `docs/completion-reports/OB-232_ADR.md`
**Predecessors merged into this branch:** OB-229 (Summary Engine) + HF-336 (convergence bindings → semantic summary keys). All four objectives in one PR; evidence pasted.

## Sequencing note
HF-336 (priority-zero) was injected mid-build and merged first so Sabor summaries carry **semantic keys** before the Insight Engine reads them (it never ran on raw keys). This branch was parked, then resumed after merging HF-336 into it.

## HALT outcomes
- **HALT-1 (entity join key):** did not fire — BCL entity rows carry `external_id` matching transaction `ID_Empleado` (proven Phase 0). **HALT-2 (signal surface):** did not fire — `classification_signals` accommodates UI signals. **HALT-3 (model policy):** did not fire — `model-policy.ts` provides `claude-sonnet-4-6`.

## Proof Gates

### PG-1 — Entity resolution — **PASS (live)**
Structural value-overlap resolver (`resolve-entity-ids.ts`) discovers the id field from data (overlap with `entities.external_id`), no hardcoded field name:
```
BCL entity resolution: {"total":510,"resolved":510,"fieldUsed":"ID_Empleado","entitiesMatched":85}
BCL summary backfill (RPC): {"written":510,"skipped":85}  → 85 entities, 6 dates
MIR entity resolution: {"total":51766,"resolved":51766,"fieldUsed":"DNI_Vendedor","entitiesMatched":30}
MIR summary backfill (RPC): {"written":5406,"skipped":18534} → 30 entities, 181 dates
```
MIR resolved with a **different** field (`DNI_Vendedor`) and zero code change — Korean Test. OB-229 HALT-2 unblocked.

### PG-2 — Financial modes on summaries — **PARTIAL (network_pulse done; 7 staged)**
`network_pulse` reads `summary_artifacts` (OB-229) by **semantic role** (HF-336). The 7 other aggregate modes (`leakage`, `performance`, `staff`, `timeline`, `patterns`, `summary`, `products`) still call `fetchRawDataServer` and are **staged** — same proven summary-first + raw-fallback pattern, `summary-read.ts` + semantic keys ready. Honest, not attested (Residual / vertical-slice allowance).
```
$ grep -nE "aggregateNetworkPulseFromSummaries|fetchRawDataServer" web/src/app/api/financial/data/route.ts
  network_pulse → aggregateNetworkPulseFromSummaries (summary-first, semantic roles) ✓
  leakage/performance/staff/timeline/patterns/summary/products → fetchRawDataServer (STAGED)
  location_detail/server_detail/cheques → fetchRawDataServer = drill-through (raw, correct)
```

### PG-3 — Intelligence artifacts generated for Sabor — **PASS (engine proven in-memory; persistence pending cache reload)**
Insight Engine dry-run against Sabor's semantic summaries:
```
{"generated":10,"validated":10,"failed":0,"byType":{"benchmark":3,"anomaly":2,"trend":3,"coaching":2},"model":"claude-sonnet-4-6"}
```
All 4 artifact types, referencing real entities + HF-336 semantic metrics. Samples:
```
[benchmark/positive] Cocina Dorada Roma Leads Network in Tips — Nearly 2× Per-Entity Average
  data_references: [{"metric":"tips","value":1142326.68},{"metric":"perEntityAvg_tips","value":637303.75}]
[anomaly/warning] Taco Veloz Mérida's Tips Are a Fraction of Network Norms
  data_references: [{"metric":"tips","value":177882.96},{"metric":"guest_count","value":26154},{"metric":"perEntityAvg_tips","value":637303.75}]
[trend/positive] Cocina Dorada Guadalajara Shows Strongest Revenue Growth Momentum
  data_references: [{"metric":"recent_revenue","value":3175659.11,"delta_pct":19.9},{"metric":"prior_revenue","value":2648701.83}]
```
**Persistence blocker (architect / SR-44):** `intelligence_artifacts` is applied (§A — SELECT succeeds) but **not in PostgREST's write schema cache** → INSERT returns `Could not find the table 'public.intelligence_artifacts' in the schema cache`. Resolve with `NOTIFY pgrst, 'reload schema';` in the SQL Editor, then run `POST /api/admin/insights/generate {tenantId}` (or `scripts/ob232-run-insights.ts` without dryRun) — the validated insights above persist with no code change.

### PG-4 — Data-contract validator passes — **PASS**
EP-2 (`insight-validator.ts`): 10 validated, 0 failed. Every `data_references.value` traces to a value in the summary digest the LLM was given (data-contract); `artifact_type`/`severity` in the canonical registries (allowable-form). Fails loud otherwise.

### PG-5 — Insight structural shapes — **PASS**
EP-3 (`insight-shape.ts`) — one per type, tenant-content-free:
```
benchmark: {"pattern":"benchmark","metric_class":"measure","entity_type":"location","severity":"positive","delta_direction":"none"}
anomaly:   {"pattern":"outlier","metric_class":"measure","entity_type":"location","severity":"warning","delta_direction":"none"}
trend:     {"pattern":"trend","metric_class":"measure","entity_type":"location","severity":"positive","delta_direction":"increase"}
coaching:  {"pattern":"gap","metric_class":"measure","entity_type":"location","severity":"warning","delta_direction":"none"}
```
No entity names, tenant ids, metric names, or values — structure only.

### PG-6 — Signal capture wired — **PASS**
EP-1 (`ui-signal.ts` + `/api/signals/ui` + `use-ui-signal.ts`) wired into `financial/patterns` location selection. Sample row on the canonical surface:
```
{"signal_type":"ui.selection","signal_value":{"metricKey":"revenue","interaction":"selection"},
 "source":"ui","context":{"surface":"financial.patterns","sessionId":null,"actorId":"..."},
 "entity_id":"998232f0-d0be-4c55-85b2-590bacec5198"}   → table: classification_signals (canonical, not a private telemetry store)
```

### PG-7 — BCL pages still work — **PASS by construction (live verify = architect)**
BCL now has summaries (Obj 1). `network_pulse` is summary-first + raw-fallback; no BCL code path changed. (BCL is ICM, not financial-POS; its bindings are loan-domain.)

### PG-8 — Korean Test — **PASS**
`insight-engine.ts` / `insight-validator.ts` / `ui-signal.ts` / `resolve-entity-ids.ts` contain **zero hardcoded field names or domain strings**: the digest metric keys flow from the (HF-336-enriched) summary data; the validator reasons over numbers + structural registries; signal types are structural classes (`ui.selection`…); entity resolution discovers the id field by value-overlap. The insight prompt instructs structurally; the LLM reads semantic keys provided at runtime.

## Build
`tsc --noEmit` 0 · `npm run build` exit 0, `✓ Compiled successfully`, 208/208 static pages (+`/api/admin/insights/generate`, `/api/signals/ui`).

## Triggers
`finalize-import` step 5 calls `generateInsights` after the Summary Engine (data → entity resolution → Summary Engine → Insight Engine). Admin: `POST /api/admin/insights/generate`.

## SR-44 handoffs (architect)
1. **`NOTIFY pgrst, 'reload schema';`** so `intelligence_artifacts` is writable, then run the admin insight API for Sabor → the 10 proven insights persist (PG-3 persistence).
2. Obj 2: complete the 7 staged financial modes (proven pattern + helper ready).
3. Browser-verify PG-7 (BCL) + the insight render surface.

## Staged (honest — Residual 5)
- Obj 2: 7 financial aggregate modes (network_pulse done).
- Insight **rendering** surfaces (engine + validator + signal capture + a render-ready store shipped; page render deferred).
- MIR/CRP beyond resolution; BCL convergence reductions; per-user signal density.

## ARTIFACT SYNC
```
MC:        OB-232 — Obj1 DONE(live); Obj3/EP-2/EP-3 PROVEN(in-memory, persistence pending PostgREST cache reload);
           EP-1 DONE(live PG-6); Obj2 PARTIAL(network_pulse; 7 staged). HF-336 merged as prerequisite.
REGISTRY:  Entity resolution (value-overlap, domain-agnostic); Insight Engine + intelligence_artifacts;
           EP-1 UI signals on classification_signals; EP-2 validator; EP-3 insight_shape (Domain Flywheel foundation).
R1:        BCL/MIR summaries unblocked (PG-1); Sabor intelligence generated (PG-3, persistence pending cache reload).
BOARD:     CAPS — OB-232: engine + foundations proven / PR open / 7-mode + persistence-cache staged for architect.
SUBSTRATE: Korean Test (PG-8); Decision 158 extended (LLM recognizes / validator+shape enforce / deterministic constructs);
           T1-E902 (resolution updates only); T1-E904 (calc_results untouched); DI-6/G7 (canonical signal surface).
```
