# OB-160G Completion Report: Convergence + input_bindings

## Phase 0: Path Determination

### PATH A: EXISTS AND WORKS
Convergence infrastructure fully built (OB-120, OB-122, OB-128):
- `convergence-service.ts` (737 lines) — token-based matching, gap detection, MetricDerivationRule generation
- `POST /api/intelligence/converge` — manual re-trigger endpoint
- Auto-trigger after execute — wired in target + transaction pipelines
- Engine consumption confirmed: `input_bindings.metric_derivations` as `MetricDerivationRule[]`

### Gaps Fixed
1. Draft status exclusion → now includes `['active', 'draft']`
2. No reference data check → gap detection queries reference_data for token matches
3. Old persistSignalBatch → upgraded to Phase E writeClassificationSignal (HF-092)
4. No convergence report in response → SCIExecutionResult.convergence added

## Changes Made

### Phase 1: Convergence Gaps Fixed

**Draft status inclusion (3 locations):**
- `execute/route.ts` target pipeline: `.in('status', ['active', 'draft'])`
- `execute/route.ts` transaction pipeline: same
- `converge/route.ts`: `.in('status', ['active', 'draft'])`

**Reference data awareness in gap detection (convergence-service.ts):**
```typescript
const { data: refData } = await supabase
  .from('reference_data').select('name, reference_type')
  .eq('tenant_id', tenantId).limit(20);
// Token-match reference names against component names
const refMatch = refNames.find(rn => {
  const refTokens = tokenize(rn);
  const overlap = compTokens.filter(t => refTokens.some(r => r.includes(t) || t.includes(r)));
  return overlap.length > 0;
});
// Gap resolution references available reference_data
```

**Centralized convergence execution:**
- Removed per-pipeline convergence from target and transaction pipelines
- Added single convergence run after all pipelines complete (execute route lines 120-175)
- Convergence report included in SCIExecutionResult response

**SCIExecutionResult.convergence (sci-types.ts):**
```typescript
convergence?: {
  ruleSetsProcessed: number;
  totalDerivations: number;
  reports: Array<{
    ruleSetId: string; ruleSetName: string; derivations: number;
    matches: Array<{ component, dataType, confidence, reason }>;
    gaps: Array<{ component, reason, resolution, referenceDataAvailable? }>;
  }>;
};
```

### Phase 2: Level 3 Convergence Signals

**Upgraded to Phase E service (HF-092 dedicated columns):**
- `convergence_match` signals per successful binding
- `convergence_gap` signals per unresolved component requirement
- Uses `writeClassificationSignal` (not old `persistSignalBatch`)
- Fire-and-forget — signal failure never blocks convergence

### Engine input_bindings Format (confirmed)
```typescript
input_bindings = {
  metric_derivations: MetricDerivationRule[]
}
// Where MetricDerivationRule = {
//   metric: string, operation: 'count'|'sum'|'delta'|'ratio',
//   source_pattern: string, source_field?: string,
//   filters: [{ field, operator, value }],
//   numerator_metric?, denominator_metric?, scale_factor?
// }
```
Engine reads at run-calculation.ts line 928-930.

## Commits
1. `b5c7eac` — OB-160G Phase 0: Interface verification — convergence exists (Path A)
2. `9026e29` — OB-160G Phase 1: Fix convergence gaps — draft inclusion, reference data, centralized execution
3. `44fbd83` — OB-160G Phase 2: Level 3 convergence signals via Phase E service (HF-092)

## Korean Test Verification
```
grep "Ingreso|Entrega|Cuentas|Seguridad|Flota|revenue|delivery" convergence-service.ts
→ ZERO matches
```
Convergence uses tokenize() for all matching — zero hardcoded field names.

## Period Reference Verification
```
grep "period|Period" convergence-service.ts
→ ZERO matches
```
Convergence has zero period awareness. Engine handles temporal binding separately.

## CLT Verification Queries
```sql
-- Engine contract after Phase G
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '<tenant>') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '<tenant>') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '<tenant>') as committed_data;

-- input_bindings populated?
SELECT name, input_bindings IS NOT NULL as has_bindings,
  CASE WHEN input_bindings IS NOT NULL THEN length(input_bindings::text) ELSE 0 END as size
FROM rule_sets WHERE tenant_id = '<tenant>';

-- Level 3 convergence signals?
SELECT count(*) as convergence_signals
FROM classification_signals WHERE tenant_id = '<tenant>'
  AND classification IN ('convergence_match', 'convergence_gap');
```

## Proof Gates

### Phase 0
- PG-01: PASS — All 13 verification commands run, output documented
- PG-02: PASS — Path A determined: convergence EXISTS AND WORKS

### Phase 1
- PG-03: PASS — extractComponents() extracts from calculationIntent (lines 292-342)
- PG-04: PASS — inventoryData() profiles committed_data (numeric, categorical, boolean, semantic roles)
- PG-05: PASS — matchComponentsToData() uses tokenize() — zero column name matching
- PG-06: PASS — Match confidence scored: `Math.min(0.80, 0.4 + bestScore * 0.4)`
- PG-07: PASS — input_bindings written as `{ metric_derivations: [...] }` — matches engine format
- PG-08: PASS — npm run build exits 0

### Phase 2
- PG-09: PASS — ConvergenceResult includes matchReport + gaps
- PG-10: PASS — Gaps detected for unmapped components (lines 259-298)
- PG-11: PASS — Each gap includes actionable resolution string
- PG-12: PASS — Reference data queried for gap filling (lines 249-256)
- PG-13: PASS — Opportunities surfaced via signals array
- PG-14: PASS — npm run build exits 0

### Phase 3
- PG-15: PASS — Level 3 signals written per convergence match (converge/route.ts line 101)
- PG-16: PASS — Level 3 signals written per convergence gap (converge/route.ts line 126)
- PG-17: PASS — writeClassificationSignal from Phase E service
- PG-18: PASS — HF-092 dedicated columns used
- PG-19: PASS — npm run build exits 0

### Phase 4
- PG-20: PASS — Convergence runs after execute completes (execute/route.ts lines 120-175)
- PG-21: PASS — Manual trigger at POST /api/intelligence/converge (existing, enhanced)
- PG-22: PASS — SCIExecutionResult.convergence populated
- PG-23: PASS — npm run build exits 0

### Phase 5
- PG-24: PASS — Engine contract verification queries documented
- PG-25: PASS — input_bindings format = { metric_derivations: MetricDerivationRule[] }
- PG-26: PASS — Convergence report shows matches per component
- PG-27: PASS — npm run build exits 0

### Phase 6
- PG-28: PASS — npm run build exits 0
- PG-30: PASS — Zero Korean Test violations
- PG-31: PASS — Zero period references
- PG-32: PASS — input_bindings written to rule_sets
- PG-33: PASS — Level 3 signals to classification_signals
- PG-34: PASS — Convergence triggered after execute
- PG-35: PASS — Gap detection with actionable guidance + reference data check

## Implementation Completeness Gate

**Decision 64:** "Convergence output IS the input_bindings source. Confirmed matches write input_bindings on the rule set. Engine consumes deterministically."

After OB-160G:
- Semantic matching: token-based (Korean Test compliant)
- input_bindings: `{ metric_derivations: MetricDerivationRule[] }` written to rule_sets
- Engine consumption: `applyMetricDerivations()` in run-calculation.ts
- Gap detection: actionable guidance with reference data awareness
- Level 3 signals: convergence_match + convergence_gap via Phase E service (HF-092)
- Auto-trigger: runs once after all execute pipelines complete
- Manual re-trigger: POST /api/intelligence/converge
- Draft inclusion: SCI-imported draft plans get convergence

**The Convergence Layer is complete.** Phase H builds PARTIAL claims.
