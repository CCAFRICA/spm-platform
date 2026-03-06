# OB-160G Phase 0: Architecture Decision — Convergence Infrastructure Discovery

## Path Determination: PATH A — EXISTS AND WORKS

Convergence infrastructure is fully built (OB-120, OB-122, OB-128). Enhance in-place.

## EXISTS AND WORKING

### convergence-service.ts (737 lines)
- `convergeBindings(tenantId, ruleSetId, supabase)` → `ConvergenceResult`
- `extractComponents()` — extracts plan requirements from components JSONB (variants[0].components)
- `inventoryData()` — profiles committed_data: numeric fields, categorical fields, boolean fields, semantic roles
- `matchComponentsToData()` — token-based matching (Korean Test compliant)
- `generateDerivationsForMatch()` → `MetricDerivationRule[]`
- `generateFilteredCountDerivations()` — shared-base pattern (multiple components → same data_type)
- OB-128: Actuals-target pair detection via `semantic_roles.performance_target`
- Gap detection with actionable `resolution` strings
- Returns `{ derivations, matchReport, signals, gaps }`

### POST /api/intelligence/converge (existing endpoint)
- Accepts `{ tenantId, ruleSetId? }`
- Calls `convergeBindings` for all active rule_sets
- Merges derivations into `input_bindings.metric_derivations`
- Persists signals via `persistSignalBatch`

### Auto-trigger after execute (already wired)
- Target pipeline: lines 430-471 — triggers convergence after committed_data insert
- Transaction pipeline: lines 647-684 — same pattern
- Merges derivations into `input_bindings.metric_derivations`

### Engine consumption (confirmed format)
```typescript
// run-calculation.ts line 928-930:
const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
const metricDerivations: MetricDerivationRule[] =
  (inputBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];

// MetricDerivationRule:
{ metric, operation: 'count'|'sum'|'delta'|'ratio', source_pattern, source_field?,
  filters: [{ field, operator, value }], numerator_metric?, denominator_metric?, scale_factor? }
```

Also supports `input_bindings.metric_mappings` (direct field→metric name, highest priority override) but convergence doesn't populate this yet.

## GAPS TO FIX

### 1. Draft status exclusion (BLOCKING)
Execute route line 434: `.eq('status', 'active')` — SCI-imported plans start as 'draft', so they NEVER get convergence.
Converge API line 39: same `.eq('status', 'active')`.
Fix: Include `['active', 'draft']` in both locations.

### 2. Reference data not checked in gap detection
When a component has no matching committed_data, convergence doesn't check if reference_data could fill the gap.
Fix: Query reference_data for tenant, check if any reference names/types match component tokens.

### 3. Signals use old persistSignalBatch (not Phase E)
Convergence signals go through `persistSignalBatch` which writes to classification_signals with old signal_value JSONB pattern.
Fix: Use `writeClassificationSignal` from Phase E (HF-092 dedicated columns).

### 4. Convergence report not in execute response
convergeBindings returns matchReport + gaps but execute route doesn't include them in the response.
Fix: Collect convergence results and include in SCIExecutionResult.

## Architecture Decision

DECISION: Enhance existing convergence in-place (Path A).
- Fix draft status inclusion
- Add reference data awareness to gap detection
- Upgrade signal capture to Phase E service
- Include convergence report in execute response
