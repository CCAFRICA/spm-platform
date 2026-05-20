# HF-242 — DAG-Aware Convergence

**Branch:** `hf-242-dag-aware-convergence` off `main @ 7d11ea8b`
**Date:** 2026-05-20
**Scope:** Convergence walks PrimeNode DAG trees to discover reference field names. AI column-mapping prompt receives the actual fields the DAG will read. Per-field bindings resolve to per-field metric values at calc time.

---

## Root cause (precise)

`extractInputRequirements` in `convergence-service.ts` switched on `intent.operation` to derive `ComponentInputRequirement[]` with roles `actual` / `row` / `column` / `numerator` / `denominator`. For `prime_dag` components, `intent.operation` is undefined (the discriminator is `intent.prime`), so the function fell through to the default branch:

```typescript
default:
  reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null });
```

`expectedMetrics` is empty for prime_dag components (legacy field; metric names live inside the DAG tree as `reference` node `field` values). The single requirement carried `metricField: 'unknown'`. The AI column-mapping prompt received `['unknown']` and returned `{}`. Convergence produced bindings with only `period` + `entity_identifier`, no measure bindings. At calc time, `resolveMetricsFromConvergenceBindings` returned `null` because the legacy role keys (`actual` / `numerator`) were absent.

The DAG evaluator received an empty `metrics` map → every `reference` prime returned 0 → component payouts were 0 for c0/c1/c2.

---

## Fix

### Change 1 — `extractReferencesFromDAG`

New exported function in `convergence-service.ts`. Walks a PrimeNode tree and collects every `reference` field name and every `aggregate` field name. Returns the de-duplicated set.

```typescript
export function extractReferencesFromDAG(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const refs = new Set<string>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime : null;
    if (prime === 'reference' && typeof obj.field === 'string') {
      refs.add(obj.field);
      return;
    }
    if (prime === 'aggregate' && typeof obj.field === 'string') {
      refs.add(obj.field);
      return;
    }
    // Generic recursion — every prime that carries children carries them in
    // one of these positions. Recursing into `inputs` / `downstream` /
    // `condition` / `then` / `else` covers arithmetic, compare, logical,
    // filter, scope, conditional, and prior_period.
    if (Array.isArray(obj.inputs)) {
      for (const child of obj.inputs) walk(child);
    }
    if (obj.downstream) walk(obj.downstream);
    if (obj.condition) walk(obj.condition);
    if (obj.then) walk(obj.then);
    if (obj.else) walk(obj.else);
  };
  walk(node);
  return Array.from(refs);
}
```

Domain-agnostic. Korean Test compliant — pure structural traversal, no field-name matching, no language-specific tokens.

### Change 2 — `extractInputRequirements` prime_dag case

Added before the `op` switch in `extractInputRequirements`. Detection: `component.componentType === 'prime_dag'` OR `intent.prime` is a string.

```typescript
const compType = (component as unknown as { componentType?: string }).componentType;
const isPrimeDag = compType === 'prime_dag'
  || (typeof (intent as Record<string, unknown>).prime === 'string');
if (isPrimeDag) {
  const refs = extractReferencesFromDAG(intent);
  if (refs.length === 0) {
    return [{ role: 'actual', metricField: 'unknown', expectedRange: null }];
  }
  return refs.map(field => ({
    role: field,           // role IS the field name — see Note below
    metricField: field,
    expectedRange: null,
  }));
}
```

**Note on `role`:** The downstream `generateAllComponentBindings` writes
`bindings[compKey][req.role] = { column, ... }` — bindings are keyed by
role. For legacy components the role is `actual` / `row` / `numerator` etc.
For prime_dag components the role IS the field name, so each binding entry
is keyed by the field name. This matches the directive's example shape:

```json
{
  "component_0": {
    "credit_placement_attainment": { "column": "Cumplimiento_Colocacion", ... },
    "portfolio_quality_ratio": { "column": "Indice_Calidad_Cartera", ... },
    "entity_identifier": { ... },
    "period": { ... }
  }
}
```

The AI mapping prompt receives `req.metricField` as the lookup key — for
prime_dag, the field name flows straight from the DAG tree.

### Change 3 — `resolveMetricsFromConvergenceBindings` prime_dag branch

Added BEFORE the legacy role-binding extraction in `route.ts`. The early-return guard `if (!actualBinding?.column && !numBinding?.column) return null` would otherwise short-circuit for prime_dag components (which have no `actual` / `numerator` role keys).

```typescript
const compType = (component as unknown as { componentType?: string }).componentType;
const intent = component.calculationIntent as Record<string, unknown> | undefined;
const intentIsPrimeNode = !!intent && typeof intent.prime === 'string';
if (compType === 'prime_dag' || intentIsPrimeNode) {
  const refs = extractReferencesFromDAG(intent);
  const dagMetrics: Record<string, number> = {};
  for (const field of refs) {
    const fieldBinding = compBindings[field] as ConvergenceBindingEntry | undefined;
    if (!fieldBinding?.column) continue;
    const rawValue = resolveColumnFromBatch(fieldBinding.column, lookupKey, fieldBinding.filters);
    if (rawValue === null) continue;
    const scaled = fieldBinding.scale_factor ? rawValue * fieldBinding.scale_factor : rawValue;
    dagMetrics[field] = scaled;
    // ... trace ...
  }
  return Object.keys(dagMetrics).length > 0 ? dagMetrics : null;
}
```

Walks the same DAG used by `extractReferencesFromDAG` (so the keys it expects in `compBindings` match the keys `extractInputRequirements` wrote there). Reads each field's binding by name, resolves the column value from the entity's row, applies `scale_factor` if present, populates `metrics[fieldName]`. The DAG evaluator reads `metrics[field]` directly via the `reference` prime.

### Import

```typescript
// web/src/app/api/calculation/run/route.ts:37
import {
  convergeBindings,
  extractLeafSources,
  extractReferencesFromDAG,
} from '@/lib/intelligence/convergence-service';
```

---

## End-to-end flow (prime_dag component)

```
Plan import (HF-239)
  → AI emits calculationIntent with prime tree
  → convertComponent sets componentType: 'prime_dag'
  → rule_set persisted

Calc-time convergence
  → extractInputRequirements detects prime_dag
  → extractReferencesFromDAG walks the tree
  → refs = ['credit_placement_attainment', 'portfolio_quality_ratio']
  → requirements = [
      { role: 'credit_placement_attainment', metricField: 'credit_placement_attainment', ... },
      { role: 'portfolio_quality_ratio',     metricField: 'portfolio_quality_ratio',     ... },
    ]
  → AI column-mapping prompt receives BOTH field names
  → LLM proposes column matches
  → generateAllComponentBindings writes:
      compBindings.credit_placement_attainment = { column: 'Cumplimiento_Colocacion', ... }
      compBindings.portfolio_quality_ratio    = { column: 'Indice_Calidad_Cartera',  ... }

Calc-time metric resolution (per entity, per component)
  → resolveMetricsFromConvergenceBindings detects prime_dag
  → walks DAG refs again
  → for each field: reads binding by name, resolves column value
  → returns { credit_placement_attainment: 95, portfolio_quality_ratio: 0.92 }

DAG evaluator
  → evaluate(reference('credit_placement_attainment'), context) → 95
  → evaluate(reference('portfolio_quality_ratio'), context) → 0.92
  → nested conditional + compare + arithmetic produces component payout
```

---

## Verification

### Build

```
$ npx tsc --noEmit ; echo exit=$?
exit=0

$ rm -rf .next && npm run build ; echo exit=$?
exit=0

$ npm run dev
✓ Ready in 1301ms

$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
HTTP 307
```

### HF-238 calc-engine regression check

```
$ npx tsx scripts/hf238-phase4-adapter-smoke.ts
=== HF-238 Phase 4 Adapter Smoke Test ===
Total components exercised: 16
Status summary: { "ok": 16 }
```

DAG-walker side of the engine unchanged. All active stored components translate cleanly.

### Architect-manual end-to-end verification

The directive specifies four architect-manual steps (CC cannot drive a browser):

1. Wipe BCL `input_bindings`:
   ```sql
   UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   ```
2. Trigger calculation for BCL October through the UI.
3. Inspect the convergence log for:
   - `[Convergence] HF-112 AI proposed N mappings` with `N > 0`
   - Component bindings carrying measure columns keyed by field name
   - Per-component `[CalcTrace] resolveMetricsFromConvergenceBindings:prime_dag_field` lines showing column → value resolution
4. Report per-component payouts and grand total for October.

Expected new log lines after the fix:

```
[Convergence] HF-112 AI proposed N mappings  (N >= 4 for BCL components)
[Convergence] HF-112 Credit Placement - Senior Executive:credit_placement_attainment → Cumplimiento_Colocacion (AI+validated, scale=...)
[Convergence] HF-112 Credit Placement - Senior Executive:portfolio_quality_ratio → Indice_Calidad_Cartera (AI+validated, scale=...)

[CalcTrace] resolveMetricsFromConvergenceBindings:prime_dag_field entity=BCL-5005 componentIdx=0 | field=credit_placement_attainment | column=Cumplimiento_Colocacion | raw=... | scaled=...
[CalcTrace] resolveMetricsFromConvergenceBindings:prime_dag_field entity=BCL-5005 componentIdx=0 | field=portfolio_quality_ratio | column=Indice_Calidad_Cartera | raw=... | scaled=...
```

---

## Anti-pattern checklist

```
[x] No hardcoded field names, filenames, tenant names, or language-specific tokens (AP-5/AP-6)
[x] Korean Test compliant — DAG walk is pure structural traversal
[x] DAG evaluator unchanged — HF-238 adapter smoke 16/16
[x] Legacy operation-format components unchanged — switch fall-through preserved
[x] tsc --noEmit clean
[x] next build clean
[x] next dev responds (HTTP 307 root)
[x] SR-34: no known structural bypasses introduced
```

---

## Files modified

```
web/src/lib/intelligence/convergence-service.ts | +52 lines (extractReferencesFromDAG + prime_dag case)
web/src/app/api/calculation/run/route.ts        | +35 / -10 lines (import + prime_dag resolution branch)
docs/completion-reports/HF-242_COMPLETION_REPORT.md | +new
```

---

## Architectural notes

1. **Closes HF-238 R2 Closure 6** ("convergence Pass 5 DAG-native emission"). HF-238 R2 deferred this work as a "design gate." HF-242 implements the runtime resolution side — convergence consumes the DAG's reference set to drive column binding. The Pass 5 prompt itself still emits the legacy `{ metric, operation, source_field, filters }` shape (translated at runtime via `legacyDerivationToDAG`); the architect's next HF can swap the prompt to emit DAG fragments directly without changing this resolution path.

2. **Symmetry with HF-238 adapter.** `extractReferencesFromDAG` mirrors the adapter's DAG walk in `evaluate()` — same node shapes, same recursion structure. Adding a new prime in the future requires updating both the evaluator (in `intent-executor.ts`) and the reference walker (in `convergence-service.ts`). The two are co-located by responsibility but separate by file.

3. **No filter discovery yet for prime_dag.** Filters on the binding entry (from `metric_derivations` filter chains, HF-227 substrate) are still consumed by `resolveColumnFromBatch`. The AI mapping may emit `filters` per metric; those land on the binding entry as before. The DAG evaluator does not invoke filters — the binding's `filters` apply at the row-resolution boundary (in `resolveColumnFromBatch`), not inside the DAG. This matches legacy behavior.

4. **`getExpectedMetricNames` for prime_dag**. The legacy function returns `[]` for prime_dag components (its `visitNode` walker only matches `source` discriminators, not `prime`). The new `resolveMetricsFromConvergenceBindings` prime_dag branch bypasses `getExpectedMetricNames` entirely — it uses `extractReferencesFromDAG`. So the legacy function does not need updating.
