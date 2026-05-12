# HF-216 — `convergence_bindings.entity_identifier.via` clause

**Branch:** `dev` (post-fast-forward to `b23b5666`).
**Defect anchor:** DIAG-039 (Meridian Logistics, c4 Fleet Utilization, Norma Rodríguez Rivera × January 2025).
**Decision candidate:** Decision 158 — binding entity-axis via-join shape.

---

## Defect anchor (verbatim from DIAG-039)

**Subject:** Meridian Logistics Group (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`) × rule_set `939cf576-4096-4ceb-a142-539a486868b3` × entity `007da35a-…` (Norma Rodríguez Rivera, external_id 70209) × period `3c2557f4-…` (January 2025).

**Pre-HF-216 empirical anchor (DIAG-039 E3.4a, calc result id `a159f155-…`):**
- `components[4].payout = 2`
- `intentTraces[4].inputs.hub_total_loads.rawValue = 116`
- `intentTraces[4].inputs.hub_total_capacity.rawValue = 116`
- `modifiers = [{ before: 800, after: 1.5, modifier: 'cap' }]`
- `metrics.Cargas_Flota_Hub = 1044`, `metrics.Capacidad_Flota_Hub = 1370` (committed_data row values)
- `metadata.intentMatch = false`, `intentTotal = 1402`, `legacyTotal = 2200`

**Committed-data row 4 (DIAG-039 E3.1, id `34bd82fa-…`):** `data_type = "transaction"`, `Hub = "Mérida Hub"`, `Cargas_Flota_Hub = 1044`, `Capacidad_Flota_Hub = 1370`, `Tasa_Utilizacion_Hub = 0.762`, `Tipo_Coordinador = "Coordinador Senior"`, `No_Empleado = "70209"`.

**Entity master row (DIAG-039 E3.1 row 3, id `e30dd7cb-…`):** `data_type = "entity"`, `No_Empleado = "70209"`, `Hub_Asignado = "Mérida Hub"`, `Tipo_Coordinador = "Coordinador Senior"`.

**Convergence binding pre-HF-216 (DIAG-039 E3.3):** `component_4.entity_identifier.column = "Hub"`, no `via` clause — schema admitted only single-column entity axis.

---

## Phases (one-paragraph each)

### Phase 0 — Architecture Decision Record + mandatory reads
ADR persisted at `docs/architecture-decisions/HF-216_ADR.md` per standing-rules Section B before any code modification. Option A (extend binding with optional `via` clause) chosen over Option B (modify intent-executor; rejected as directive non-scope) and Option C (pre-materialize a join fact table; rejected for schema-layer churn). Schema columns confirmed against `SCHEMA_REFERENCE_LIVE.md`. Line-number drift between directive (lines 778-825 / 1361-1500) and current code (lines 670 / 1179) is non-substantive — same functions, same semantics, no halt triggered.

### Phase 1 — Type definition
Created `web/src/types/convergence-bindings.ts` exporting `ConvergenceBindingEntry` with new optional `via?: { roster_data_type: string; roster_field: string; entity_field: string }`. Replaced the inline interface in `route.ts:1169-1177` with an `import type` referencing the new module. Backward compatible by construction — `via` is optional and absent on all existing bindings.

### Phase 2 — Roster join index pre-computation
Added `rosterJoinIndex: Map<string, Map<string, string>>` construction in `route.ts` after the `dataByBatch` cache build (line 720) and before the entity loop. The index is keyed `"data_type|entity_field|roster_field"` → `Map<entity_external_id, roster_field_value>`. Scans `committedData` once, O(rows). Logs `HF-216 Roster join index: N via-specs indexed` only when N > 0.

### Phase 3 — Via-join lookup translation
Modified `resolveMetricsFromConvergenceBindings` (`route.ts:1210`) to compute `lookupKey` once at function entry. When `entity_identifier.via` is present, `lookupKey = rosterJoinIndex.get(viaKey).get(entityExternalId)`. If the via-specified roster mapping is absent, surface `[CalcRecon-T3] EXCEPTION` + push `viaJoinUnresolved` flag + return null. All 4 `resolveColumnFromBatch` call sites within the function now pass `lookupKey`. Trace logs continue to surface the original `entityExternalId` for cross-reference; the translation step also emits a dedicated trace line when active.

### Phase 4 — Meridian convergence_bindings backfill
Created `web/scripts/HF-216_backfill_meridian_via.ts` and executed against tenant `5035b1e8-…` / rule_set `939cf576-…`. All 5 components (component_0 through component_4) updated with `via: { roster_data_type: "entity", roster_field: "Hub_Asignado", entity_field: "No_Empleado" }`. VERIFY block verbatim confirms post-write state.

### Phase 5 — Build + dev server verification
`pkill -f "next dev"` → `rm -rf web/.next` → `npm run build` produced the full route table. `npm run dev` started; `curl -sI http://localhost:3000` returned `HTTP/1.1 307 Temporary Redirect` (auth-gate to `/login`); `curl -sI http://localhost:3000/login` returned `HTTP/1.1 200 OK`. Server log: `✓ Ready in 1054ms`.

### Phase 6 — Localhost calc re-run + verbatim evidence
Direct POST-handler import (middleware bypassed by script context) executed against the same tenant/rule_set/period as DIAG-039. Full evidence verbatim in `docs/hotfixes/HF-216_Phase6_evidence.md`. CC pastes verbatim only; architect reconciles.

---

## File diff inventory

| File | Status | Notes |
|---|---|---|
| `docs/architecture-decisions/HF-216_ADR.md` | created | 81 lines; Section B compliance |
| `web/src/types/convergence-bindings.ts` | created | 26 lines; ConvergenceBindingEntry with via field |
| `web/src/app/api/calculation/run/route.ts` | modified | +68/-13 lines; type import + rosterJoinIndex build + lookupKey translation |
| `web/scripts/HF-216_backfill_meridian_via.ts` | created | 71 lines; one-time data migration |
| `web/scripts/HF-216_phase6_recalc.ts` | created | 85 lines; verbatim-evidence harness |
| `docs/hotfixes/HF-216_Phase6_evidence.md` | created | 90 lines; Phase 6 paste |
| `docs/hotfixes/HF-216_DESCRIPTION.md` | created | this file |

Commit lineage (6 commits):
```
6d9bcbb0 HF-216 Phase 6: localhost calc re-run evidence
c475e485 HF-216 Phase 4: Meridian convergence_bindings backfill script + execution evidence
6200011d HF-216 Phase 3: via-join lookup translation in resolveMetricsFromConvergenceBindings
575bfc59 HF-216 Phase 2: roster join index pre-computation
7b80eb16 HF-216 Phase 1: ConvergenceBindingEntry.via type definition
51394381 HF-216 Phase 0: Architecture Decision Record + Phase 0 reads
```

---

## Phase 6 verbatim evidence (Meridian × January 2025 × entity 007da35a)

```
result_id:    5258e916-1837-4cc3-99c2-2d480712ade6
batch_id:     2cd5f730-142d-46f8-adf5-34456be7ea07
total_payout: 8952

components[0]: id=revenue_performance_senior name=Revenue Performance - Senior payout=3000
components[1]: id=on_time_delivery_senior   name=On-Time Delivery - Senior   payout=0
components[2]: id=new_accounts_senior       name=New Accounts - Senior       payout=5950
components[3]: id=safety_record_senior      name=Safety Record - Senior      payout=0
components[4]: id=fleet_utilization_senior  name=Fleet Utilization - Senior  payout=2

intentTraces[4].inputs.hub_total_loads.rawValue:    0.762043795620438
intentTraces[4].inputs.hub_total_capacity.rawValue: 2
intentTraces[4].modifiers:                          [{"after":1.5,"before":304.8175182481752,"modifier":"cap"}]
intentTraces[4].finalOutcome:                       1.5

metadata.intentMatch:  false
metadata.intentTotal:  8952
metadata.legacyTotal:  9255

Handler log line: "HF-216 Roster join index: 1 via-specs indexed"
Handler log line: "Wrote 67 calculation_results"
Handler log line: "[CalcRecon-T1] componentTotals=[c0:139500 | c1:0 | c2:392300 | c3:10700 | c4:52]"
```

Full evidence in `docs/hotfixes/HF-216_Phase6_evidence.md`.

---

## Out of scope (verbatim from directive)

- Does NOT modify intent-executor or any execution primitive
- Does NOT modify `applyMetricDerivations` or `metric_derivations` shape
- Does NOT modify cap-modifier semantics
- Does NOT modify HC prompts or field-identity classification
- Does NOT modify `contextualIdentity = "person_identifier"` mis-tagging on the `Hub` column (separate deferred candidate)
- Does NOT modify convergence-agent binding generation (HF-217+ candidate)
- Does NOT add a signal-on-substitution at engine handoff (HF-205 invariant — deferred)
- Does NOT touch BCL or CRP — both reconciled exact; their bindings have no `via` and behavior is unchanged
- Does NOT verify production

---

## Architect verifies in production after merge per SR-44

CC reports localhost evidence; architect verifies post-merge production state and reconciles the values surfaced above.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
