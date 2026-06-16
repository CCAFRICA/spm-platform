# OB-212 §C — Reconciliation Diagnosis Agent: read-store RE-SPEC (design only)

**Date:** 2026-06-16 · **Status:** DESIGN ARTIFACT (no handlers built; gated by §D Prereq-2). Supersedes the OB-212 recon tool read-targets that pointed at the empty `calculation_traces`.
**Why:** Phase 0 (B1) proved `calculation_traces` is empty with no writer. The trace forensic lives in `calculation_results.metadata`. This re-points all recon tools to the **verified** shape (FP-49: re-spec'd against a real row, not a summary). The agent's purpose, name, and boundary are unchanged — it reads calc output and reasons; it never writes/participates in calculation (Decision 158).

---

## 1. The verified read store (real row, pasted)

Tenant `5035b1e8-…` (Meridian fleet), `calculation_results.id = bf7f6cf7-…`, batch `ad5ae397-…`, entity `70162`, 5 emitted components. `metadata` keys: `entityName, externalId, intentTotal, intentTraces, roundingTrace, binding_snapshot`. The three sub-stores the agent reads:

**(a) `metadata.roundingTrace.components[i]`** — per-component **name** + raw/rounded values + precision (the human-readable layer + rounding-edge forensic):
```json
{ "label": "Utilización de Flota", "rawValue": 860.0858369098712, "roundedValue": 860,
  "componentIndex": 4, "roundingAdjustment": -0.0858369098712,
  "precision": { "source": "default_currency", "decimalPlaces": 0, "roundingMethod": "half_even" } }
```

**(b) `metadata.binding_snapshot.convergence_bindings_used.component_N.<slot>`** — THE lookup/column/scale forensic (one entry per metric slot the component consumed):
```json
"on_time_delivery_percentage": {
  "column": "Pct_Entregas_Tiempo", "confidence": 0.9, "match_pass": 1, "scale_factor": 100, "filters": [],
  "field_identity": { "confidence": 0.96, "structuralType": "measure", "contextualIdentity": "on_time_delivery_percentage" },
  "learning_provenance": { "batch_id": "f9ca9495-…", "learned_at": "2026-06-13T23:14:06.125Z" } }
```
Plus `binding_snapshot.{calculation_run_id (=batch_id), engine_version, verification_confidences.component_N{column,confidence_computed_at_t}, corrections_in_this_run[], structural_exceptions_in_this_run[]}`.

**(c) `metadata.intentTraces[i]`** — **HOLLOW; use ONLY `finalOutcome` (per-component payout) + `componentIndex`.** `inputs={}`, `modifiers=[]`, `componentType="unknown"`, `confidence=0.5` (placeholder) in 100% of live rows — **do not depend on them.**

Top-level (not metadata): `components[i] = {componentId, componentName, componentType:"prime_dag", payout}`; `metrics` (raw aggregated entity metrics); `attainment.overall`. Join key everywhere: `calculation_results.id` + `tenant_id`; `batch_id == binding_snapshot.calculation_run_id`.

> `reconciliation_sessions.results.employees[i]` (from §F): `{entityId, fileTotal (benchmark), vlTotal (engine), totalDelta, totalFlag, components[]{fileValue,vlValue,delta,flag}, vlResult.components, fileRow}` — capped at 100; `components[]` may be empty (matched-only). False-greens: `summary.falseGreenCount` + `findings[type='false_green'].entityId`.

---

## 2. Re-spec'd tool contracts (read off `calculation_results.metadata`; NO `calculation_traces`)

### Shared layer — `web/src/lib/ai/agent/tools/entity-data-tools.ts` (N3; reused by future agents)
| Tool | Reads | Returns (structural) |
|---|---|---|
| `get_entity_calculation_trace(entity_id, batch_id, component_index?)` | `calculation_results` row (by `tenant_id`+`batch_id`+`entity_id`; **not** `calculation_traces`) | per-component: `{componentIndex, name (roundingTrace.label), payout (components[].payout / intentTraces.finalOutcome), rawValue, roundedValue, roundingAdjustment, precision, bindings: binding_snapshot.convergence_bindings_used.component_N (slot→{column, confidence, match_pass, scale_factor?, filters, field_identity}), verification_confidence}`. Bounded: single row by id, indexed on `(tenant_id, batch_id, entity_id)`. |
| `get_entity_committed_data(entity_id, period_id, data_type?)` | `committed_data` (exists; unchanged) | bounded rows for the entity/period (limit + tenant/period index) |

### Recon-specific — `web/src/lib/ai/agent/tools/reconciliation-tools.ts`
| Tool | Reads | Returns / note |
|---|---|---|
| `get_benchmark_value(entity_id, reconciliation_session_id, component_name?)` | `reconciliation_sessions.results.employees[]` find by `entityId` (user-uploaded benchmark ONLY) | `{fileTotal, vlTotal, totalDelta, totalFlag, components[]{componentName,fileValue,vlValue,delta,flag}, fileRow}` (optional component filter) |
| `get_component_intent_structure(rule_set_id, component_index)` | `rule_sets.components[component_index]` (exists; unchanged) | the intent tree / matrix grid / tier table — read-only |
| `find_entities_with_similar_delta(reconciliation_session_id, component_index_or_name, delta_range_min, delta_range_max)` | scan `reconciliation_sessions.results.employees[]` (≤100 cap) on component delta (or `totalDelta`) | entity ids whose delta ∈ range — "is this systemic?" |
| `check_boundary_resolution(value, boundaries)` | **PURE function, no DB** | band index + inclusive/exclusive edge decisiveness. **Re-spec note:** the band/lookup `steps` array the original spec assumed (`calculation_traces.steps`) does not exist; the agent composes this from `get_component_intent_structure` (the rule_set's boundaries) + the entity's resolved metric value (the `binding_snapshot` column + `roundingTrace`/`get_entity_committed_data`). Still deterministic. |

**Boundary discipline:** every handler is read-only; none writes `calculation_results`/`calculation_traces`/`entity_period_outcomes`/`rule_sets`. The agent writes only `agent_invocations`/`agent_inbox`/`classification_signals` (enforced by the §3.3 lens).

---

## 3. Korean Test on the re-spec'd identifiers

All tool names, params, and the metadata keys the handlers reference are **structural**: `get_entity_calculation_trace`, `get_entity_committed_data`, `get_benchmark_value`, `get_component_intent_structure`, `find_entities_with_similar_delta`, `check_boundary_resolution`; keys `binding_snapshot`, `convergence_bindings_used`, `roundingTrace`, `intentTraces`, `field_identity`, `structuralType`, `match_pass`, `scale_factor`, `column`. **No domain literals** (`commission/comision/optical/venta/tienda/payout-as-identifier/attainment-as-literal`). Note the JSONB *values* the tools read (e.g. `contextualIdentity: "actual_revenue_amount"`, column `"Pct_Entregas_Tiempo"`) are **runtime data**, not hardcoded identifiers — the handler code/schemas carry none of them. **PASS.**

---

## 4. What this changes vs the original OB-212 §3.1.C

- `get_entity_calculation_trace` reads `calculation_results.metadata` (roundingTrace + binding_snapshot + intentTraces.finalOutcome), **not** `calculation_traces` (+`steps`).
- `check_boundary_resolution` is fed from `get_component_intent_structure` + the resolved metric value, not from a non-existent `steps` band array.
- All other tools (`get_benchmark_value`, `get_component_intent_structure`, `find_entities_with_similar_delta`, `get_entity_committed_data`) read tables that exist; shapes confirmed in §F/Phase-0.
- **Unchanged:** the agent's purpose, name (`reconciliation_diagnosis`), system-prompt intent (investigate deltas structurally), boundary (read-only), and Progressive-Performance fingerprint cache.

**Build gate (§D):** handlers + the `reconcile-diagnose` route (N4) are NOT built here. They proceed after Prereq-2 (a reconciliation session with real component-level deltas — the lone live row is all-red/no-components) and Prereq-1 (model fix in-branch — already satisfied: this branch carries `claude-sonnet-4-6`).
