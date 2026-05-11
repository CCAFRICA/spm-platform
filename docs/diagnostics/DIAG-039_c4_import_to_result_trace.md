# DIAG-039 — c4 Fleet Utilization Import-to-Result Trace

**Branch:** `diag-039-c4-import-to-result-trace`
**Base:** `main` HEAD `3b22eff2` (post-OB-199 merge).
**Discipline:** read-only empirical. CC produces verbatim code, schema, and DB values. CC does NOT classify the defect locus.
**Predecessors:** DIAG-035, DIAG-036, DIAG-037, DIAG-038 (each scoped to one surface). DIAG-039 is the missing-aperture diagnostic — end-to-end import → result for c4 with no pre-narrative about defect location.

---

## Empirical anchor (verbatim from directive)

| Property | Value |
|---|---|
| Batch totals (AUD-006 §6.3) | $55,909 / $53,559 / $57,534 |
| Ground truth (entity total) | ~MX$185,063 |
| c4 component resolved value | $2 uniformly across all entities × periods |
| Tenant | `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (Meridian) |
| Entity count | 79 (E3.0 confirms count) |
| Period count | 3 (E3.0 confirms count) |
| Component | c4 (Fleet Utilization) |

DB state confirms: 3 calculation_batches for Meridian, one per period, with `summary.total_payout` values `$55,909` / `$53,559` / `$57,534` — matching the directive's anchor verbatim. The selected entity × period × component carries `calculation_results.components[4].payout = 2`.

---

## Evidence inventory

All evidence files are in `docs/diagnostics/DIAG-039_evidence/`. 35 files total.

### E1 — Calculation entry point + execution graph

- `E1_1_entry_point.md` — grep result locating `route.ts:66` as POST handler entry; 2507-line file
- `E1_2_a.md` … `E1_2_f.md` — full POST handler verbatim, 6 chunks of 500 lines each (file split per directive's >2000-line rule)
- `E1_3_imports.md` — import block + 30 invoked-symbol grep
- `E1_4_1_run-calculation.md` (1510 lines) — `evaluateComponent`, `aggregateMetrics`, `buildMetricsForComponent`, `applyMetricDerivations`, `getExpectedMetricNames`, `rowMatchesFilters`
- `E1_4_2_metric-resolver.md` — `inferSemanticType`
- `E1_4_3_intent-transformer.md` — `transformVariant`
- `E1_4_4_intent-executor.md` (711 lines) — `executeIntent`, `executeScalarMultiply`, `executeRatioOp`, `applyModifiers` (incl. `case 'cap'`)
- `E1_4_5_decimal-precision.md` — `toNumber`, `roundComponentOutput`, `inferOutputPrecision`
- `E1_4_6_calc-time-entity-resolution.md` — `resolveEntitiesAtCalcTime`
- `E1_4_7_synaptic-density.md` — `loadDensity`, `persistDensityUpdates`
- `E1_4_8_synaptic-surface.md` — `createSynapticSurface`, `writeSynapse`, `getExecutionMode`, `consolidateSurface`, `initializePatternDensity`
- `E1_4_9_pattern-signature.md` — `generatePatternSignature`
- `E1_4_10_agent-memory.md` — `loadPriorsForAgent`
- `E1_4_11_domain-dispatcher.md` — `createCalculationRequest`, `scoreCalculationResult`
- `E1_4_12_flywheel-pipeline.md` — `postConsolidationFlywheel`
- `E1_4_13_insight-agent.md` — `checkInlineInsights`, `generateFullAnalysis`
- `E1_4_14_import-batch-supersession.md` — `fetchSupersededBatchIds`
- `E1_5_arithmetic_sites.md` (218 grep matches) — every arithmetic site touching c4-relevant variables across route.ts + 14 invoked modules

### E2 — Component c4 declaration

- `E2_1_discovery.md` — execute_sql RPC halt-note (PGRST202); 5 candidate table probes (only `rule_sets` exists)
- `E2_2_rule_sets_full_row.md` (1287 lines) — Meridian rule_set row verbatim, full JSONB
- `E2_3_ts_grep.md` — c4 / fleet / utilization / hub_total_loads grep (zero in-source TypeScript matches except color hex codes)
- `E2_4_c4_full_declaration.md` — c4 Senior + Standard variant declarations extracted from E2.2; convergence_bindings.component_4; metric_derivations for hub_total_loads + hub_total_capacity

### E3 — One-(entity, period) value trace

- `E3_0_selection.md` — selection rule + selected entity (`007da35a-…`, Norma Rodríguez Rivera, external_id 70209) × selected period (`3c2557f4-…`, January 2025)
- `E3_1_committed_data.md` — 4 committed_data rows for entity verbatim (all carry `period_id: null`; period attribution via `source_date`)
- `E3_2_rule_set.md` — pointer to E2.2 + identifier summary
- `E3_3_input_bindings_c4.md` — c4 metric_derivations + convergence_bindings verbatim (also surfaced in E2.4)
- `E3_4_results.md` — calculation_results row (1 row), entity_period_outcomes row (1 row), calculation_batches (3 rows) all verbatim; logs halt-note
- E3.5 logs halt-noted in `E3_4_results.md`: no persisted log surface beyond `calculation_batches.config.insightAnalysis` + `calculation_results.metadata.intentTraces`; `addLog` in route.ts:79 writes to ephemeral Lambda console.log

### E4 — Value-at-every-boundary table (load-bearing artifact)

- `E4_boundary_table.md` — 16-step transformation table from committed_data DB read through final persist; verbatim runtime values where surfaceable + `<unrecoverable without runtime trace>` where not; per-step code citations to E1.4 modules with file:line markers

### E5 — Arithmetic site inventory

- `E5_arithmetic_site_inventory.md` — reformatted from E1.5, surfacing the 6 on-path sites identified in E4 boundary trace + pointer to E1.5 full 218-line inventory

### E6 — Schema cross-reference

- `E6_schema_cross_reference.md` — column-key inventory for 7 tables via Postgrest sample-row probe; FK declarations verbatim from migrations 001/002/003/004 (information_schema unavailable via Postgrest — halt-noted)

---

## Halt conditions encountered (verbatim, per directive)

| Halt | Manifestation | Action taken per directive |
|---|---|---|
| Postgrest RPC `execute_sql` unavailable | `PGRST202` returned for E2.1a, E6.1, E6.2 information_schema queries | Surfaced verbatim error; fell back to Postgrest sample-row column-key introspection and to migration files for FK declarations. |
| 5 candidate component-table names absent | `PGRST205` for `metric_derivation_rules`, `metric_bindings`, `components`, `plan_components`, `calculation_components` | Surfaced verbatim error responses; discovered the actual declaration site is `rule_sets.components` JSONB column. |
| Zero TypeScript matches for c4-derived identifiers (E2.3) | `grep "fleet_utilization_senior\|fleet_utilization_standard\|hub_total_loads\|hub_total_capacity\|component_4\b\|Fleet Utilization" web/src/ --include="*.ts"` returns empty | Surfaced verbatim empty result; no retry with alternative patterns. Architect reads E2.4 (data-driven declaration) and the operation/source vocabulary grep (29 matches in E2.3) as the indirect TS-side surface. |
| All committed_data rows carry `period_id: null` | E3.1 4 rows verbatim, every row | Surfaced verbatim; noted period attribution is via `source_date` only in this dataset. |
| Logs unsurfaceable without new instrumentation | `addLog` writes to ephemeral Lambda console.log; calculation_batches.config.insightAnalysis is the only persisted log surface | E3.5 halt-noted; no instrumentation added. Architect dispositions whether DIAG-039.1 should authorize one targeted log statement. |

No halt was bypassed. No discovery query was retried with assumed alternatives after a halt.

---

## Selected (entity, period) identifiers (for architect reference)

```
entityId:           007da35a-8e65-453b-ada9-b62337fd8683
entity_external_id: 70209
entity_display_name: Norma Rodríguez Rivera
periodId:           3c2557f4-d922-4b30-a073-ac4811f1f3cb
period_label:       January 2025
period_start:       2025-01-01
period_end:         2025-01-31
ruleSetId:          939cf576-4096-4ceb-a142-539a486868b3
batchId:            ef33e29f-d8f8-4b4f-8022-e183033b3800
calculation_results.id: a159f155-1eb1-4324-8504-a273c5035997
entity_period_outcomes.id: 85a6224a-144e-46e6-96ee-38e240e83a8d
```

---

## Architect reads

The architect reads `E4_boundary_table.md`. The Output column carries verbatim runtime values at each function boundary in the actual c4 execution path. The step where the value collapses is structurally visible. The architect then dispositions HF-216 scope from the code evidence in E1.4 and the boundary trace in E4.

CC does not propose a fix from DIAG-039.

---

## Pre-existing CC observations surfaced during evidence collection (verbatim, not classification)

These are observations CC noticed and surfaced as part of the verbatim discipline. They are not pre-classifications of the defect locus.

1. **Source data vs intentTrace input divergence (E4 step 9, also in `E3_4_results.md` CC observations §1).** For the selected entity × January 2025: `committed_data.row_data.Cargas_Flota_Hub = 1044`, `.Capacidad_Flota_Hub = 1370`, `.Entregas_Totales = 116`. The `calculation_results.metrics` object on the same result row carries `Cargas_Flota_Hub: 1044`, `Capacidad_Flota_Hub: 1370`, `Entregas_Totales: 116`. The `intentTraces[4].inputs.hub_total_loads.rawValue` = `116` and `.hub_total_capacity.rawValue` = `116`. The convergence_bindings (E2.4) target `Cargas_Flota_Hub` (numerator) and `Capacidad_Flota_Hub` (denominator); the metric_derivations (E3.3) declare `hub_total_loads` and `hub_total_capacity` with `operation: "count"` filtered by `Tipo_Coordinador = "Coordinador Senior"`.

2. **Cap modifier transformation at step 12 (E4).** `applyModifiers` line 586 `result = result.gt(cap) ? cap : result;` with `cap = toDecimal(1.5)` and `result = 800` evaluates to `1.5`. The persisted modifier log entry verbatim: `{ "after": 1.5, "before": 800, "modifier": "cap" }`.

3. **Rounding at step 13 (E4).** `rawValue: 1.5 → roundedValue: 2` (`roundingMethod: "half_even"`, `decimalPlaces: 0`, `roundingAdjustment: 0.5`).

4. **Batch-level concordance signal.** `calculation_batches.summary.intentLayer.matchCount = 0` and `concordance = "0.0%"` for all 3 periods (E3.4c). The result row's `metadata.intentMatch = false`, `intentTotal = 1402`, `legacyTotal = 2200`.

5. **TypeScript-side identifier surface for c4.** Zero TypeScript files reference `fleet_utilization_senior`, `fleet_utilization_standard`, `hub_total_loads`, `hub_total_capacity`, or the literal `Fleet Utilization` (E2.3). The c4 declaration is entirely data-driven via the `rule_sets.components` JSONB column. The engine reads the declaration by index/structure, not by name.

Architect reads.
