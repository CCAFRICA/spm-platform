# HF-243 — DAG Scale Inference + Variant Binding Coverage

**Branch:** `hf-243-scale-inference-variant-binding` off `main @ fac14517`
**Date:** 2026-05-20
**Scope:** Walk PrimeNode DAGs to recover the compare-node constants so the existing scale-factor inference can disambiguate ratio data (0–3) vs percentage data (0–300). Flatten components across all variants so the binding pipeline produces entries for every flat component index, not only variant 0. Scope `boundColumns` by (column → field) so legitimate variant duplicates can rebind the same column to the same field.

---

## Root causes (precise)

### Failure 1 — DAG scale mismatch (BCL c0/c1 zero payout)

DIAG-054 Probe 4 confirmed that `committed_data.row_data` stores attainment as a ratio:
- `cumplimiento_colocacion = 1.1354` (= 113.54%)
- `cumplimiento_depositos = 1.282` (= 128.2%)
- `calidad_cartera = 0.9412` (= 94.12%)

The DAG trees produced by plan interpretation carry their tier/band boundaries as percentage constants — `compare(gte, reference(cumplimiento_colocacion), constant(120))` rather than `constant(1.20)`. So at calc time `reference` returned `1.1354`, the compare against `120` returned `false`, and the conditional collapsed to the zero-payout branch.

The same scale-inference machinery that solved this for legacy `bounded_lookup_1d` / `bounded_lookup_2d` intents was already in place inside `scoreColumnForRequirement`: it tries the column values at ×1 and at ×100, scores against the requirement's `expectedRange`, and records a `scale_factor` on the binding when the percentage scale fits better. HF-242's `prime_dag` branch in `extractInputRequirements` hard-coded `expectedRange: null`, disabling that inference for DAG components. The bindings emerged with no `scale_factor` and the engine fed ratio values into compare nodes carrying percentage constants.

### Failure 2 — Variant binding coverage gap

DIAG-054 Probe 3 confirmed that BCL's stored `input_bindings.convergence_bindings` had entries for `component_0` through `component_3` (Senior Executive variant) and **no entries** for `component_4` through `component_7` (Executive variant). At calc time, executive-variant entities resolved to zero metrics and paid zero.

The root cause is in `extractComponents`:

```typescript
// Pre-HF-243
const variants = cj.variants as Array<Record<string, unknown>> | undefined;
if (Array.isArray(variants) && variants.length > 0) {
  // Variant structure — use first variant (all share same structural pattern)
  comps = (variants[0].components as Array<Record<string, unknown>>) ?? [];
}
```

`extractComponents` returned only `variants[0].components` — the four Senior Executive components. The Executive variant's components (which are indexed 4–7 in the engine's flat keying) never entered `matchComponentsToData`, never entered `generateAllComponentBindings`, and so no `component_4..7` keys ever landed in `convergence_bindings`. The legacy comment "all share same structural pattern" was correct about the calc shapes but wrong about the conclusion: the engine keys bindings by **global flat index**, so it needs binding entries for every flat index, not just one variant's worth.

A second, downstream consequence: even after flattening produced 8 components, the existing `boundColumns: Set<string>` in `generateAllComponentBindings` was a single global exclusion set. Components 0–3 of the Senior variant would bind columns A/B/C/D, then components 4–7 of the Executive variant — which reference the same field names — would find A/B/C/D excluded and fail to bind. Variant duplicates need to be allowed to rebind a column to the **same field name**; the original guard (no two distinct fields collide on a single column) still has to hold for non-variant cases.

---

## Fix

### Change 1 — `extractExpectedRangeFromDAG` (new exported function)

`web/src/lib/intelligence/convergence-service.ts`, immediately after `extractReferencesFromDAG`:

```typescript
export function extractExpectedRangeFromDAG(
  node: unknown,
  fieldName: string,
): { min: number; max: number } | null {
  if (!node || typeof node !== 'object') return null;
  const constants: number[] = [];

  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime : null;

    if (prime === 'compare' && Array.isArray(obj.inputs) && obj.inputs.length === 2) {
      const [a, b] = obj.inputs as Array<Record<string, unknown>>;
      const aIsRef = a && a.prime === 'reference' && a.field === fieldName;
      const bIsRef = b && b.prime === 'reference' && b.field === fieldName;
      const aIsConst = a && a.prime === 'constant' && typeof a.value === 'number';
      const bIsConst = b && b.prime === 'constant' && typeof b.value === 'number';
      if (aIsRef && bIsConst) constants.push(b.value as number);
      else if (bIsRef && aIsConst) constants.push(a.value as number);
    }

    if (Array.isArray(obj.inputs)) {
      for (const child of obj.inputs) walk(child);
    }
    if (obj.downstream) walk(obj.downstream);
    if (obj.condition) walk(obj.condition);
    if (obj.then) walk(obj.then);
    if (obj.else) walk(obj.else);
  };
  walk(node);

  if (constants.length === 0) return null;
  return { min: Math.min(...constants), max: Math.max(...constants) };
}
```

The walker is the same shape as `extractReferencesFromDAG` so coverage of prime kinds with children stays in sync. It only collects constants from `compare` nodes that have the named field on one side and a numeric constant on the other — exactly the shape the band/tier structures take after legacy → DAG translation.

### Change 2 — `extractInputRequirements` prime_dag case

Pre-HF-243:

```typescript
return refs.map(field => ({
  role: field,
  metricField: field,
  expectedRange: null,
}));
```

Post-HF-243:

```typescript
return refs.map(field => ({
  role: field,
  metricField: field,
  expectedRange: extractExpectedRangeFromDAG(intent, field),
}));
```

No new code path. No new registry. The same `scoreColumnForRequirement` that runs for legacy components runs for prime_dag — it just receives a non-null `expectedRange` now, so its ratio/percentage scaling trial fires and a `scale_factor: 100` lands on bindings whose columns match better at ×100. The engine already honors `scale_factor` at metric-resolution time.

### Change 3 — `extractComponents` flatten across all variants

Pre-HF-243:

```typescript
if (Array.isArray(variants) && variants.length > 0) {
  comps = (variants[0].components as Array<Record<string, unknown>>) ?? [];
}
```

Post-HF-243:

```typescript
if (Array.isArray(variants) && variants.length > 0) {
  for (const v of variants) {
    const vc = v.components as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(vc)) comps.push(...vc);
  }
}
```

Components flatten in variant declaration order. The `for (let i = 0; i < comps.length; i++)` block below assigns `index: i` to each, matching the global flat indexing the engine uses (`component_${i}`).

### Change 4 — `boundColumns` scoped by (column → field)

Pre-HF-243: `const boundColumns = new Set<string>();`

Post-HF-243: `const boundColumnToField = new Map<string, string>();`

Both the AI-mapping path and the boundary-fallback path now exclude a column only when it was previously bound to a **different** field name:

```typescript
const priorField = boundColumnToField.get(proposedColumnName);
const excluded = priorField !== undefined && priorField !== req.metricField;
if (mc && !excluded) { … boundColumnToField.set(proposedColumnName, req.metricField); }
```

Same logic on the fallback filter:

```typescript
.filter(mc => {
  const pf = boundColumnToField.get(mc.name);
  return pf === undefined || pf === req.metricField;
})
```

This preserves the original guard against two distinct fields colliding on one column, while allowing variant duplicates (same field name, different component index) to legitimately re-use the column.

### Change 5 — `detectBoundaryScale` flatten across variants (defense-in-depth)

The `detectBoundaryScale` helper indexed `variants[0]?.components[componentIndex]` directly. Its only caller is inside `generateDerivationsForMatch`, which HF-226 Phase 2B retired from the live path; the function body remains for rollback safety. Updated to flatten across all variants and index globally, matching the new `extractComponents` shape. No live behavioral effect today; eliminates a latent variant-index bug if the legacy path ever re-activates.

---

## Expected convergence log signatures

For a BCL run after HF-243:

```
[Convergence] HF-112 Cumplimiento Colocación:cumplimiento_colocacion → <col> (AI+validated, scale=100, filters=…)
[Convergence] HF-112 Cumplimiento Depósitos:cumplimiento_depositos → <col> (AI+validated, scale=100, filters=…)
[Convergence] HF-112 Calidad de Cartera:calidad_cartera → <col> (AI+validated, scale=100, filters=…)
…
```

Per-field bindings now appear for **all eight** flat component indices, not only `component_0..3`. Each measure binding carries `scale_factor: 100` because the column stats match better at ×100 against compare-node constants in the 0–300 range.

---

## Expected BCL October per-component totals (post-HF-243)

The directive's reconciliation target is $44,590 reference / $16,430 pre-HF-243 actual for October across BCL. With ratio data now scaled to percentage at metric resolution time, c0/c1 leave the zero-payout branch for entities at or above target. With Executive-variant components 4–7 receiving bindings, executive-variant entities transition from zero metrics to populated metrics. The exact reconciliation has to land in architect-manual verification — CC cannot drive the browser — but the structural conditions that produced the $28,160 gap (DAG constants at percentage scale vs data at ratio scale; convergence bindings only for half the components) are both removed.

---

## Build verification

```
npx tsc --noEmit  → clean
rm -rf .next && npm run build  → ✓ Compiled successfully
npm run dev → HTTP 307 at /
```

No new TypeScript errors. Dev returns the expected auth redirect. HF-238 adapter API surface unchanged (`evaluate`, `buildEvalContext`, `executeIntent`, `findBoundaryIndex`, `IntentExecutorUnknownOperationError` in `intent-executor.ts`; `legacyIntentToDAG`, `legacyDerivationToDAG`, `componentIntentToDAG`, `UntranslatableLegacyIntentError` in `legacy-intent-to-dag.ts`).

---

## Korean Test (IGF-T1-E910) compliance

- `extractExpectedRangeFromDAG` reads only the DAG tree structure — prime tags, input arity, numeric constant values. No language-specific string. No tenant-name literal.
- `extractComponents` flatten is pure structural traversal over the `variants` array.
- `boundColumnToField` keys on field names produced upstream by the AI plan interpretation; the equality check is generic and carries no embedded vocabulary.

---

## Decision 108 preservation

No change to HC-override authority. Convergence still reads HC roles only at the Level-1 binding layer; the field-name expectedRange recovery is downstream of HC selection and operates on field names HC has already resolved.

---

## Files modified

- `web/src/lib/intelligence/convergence-service.ts`
  - Added `extractExpectedRangeFromDAG`
  - `extractInputRequirements` prime_dag case wires expectedRange
  - `extractComponents` flattens across all variants
  - `generateAllComponentBindings` switches `boundColumns` to `boundColumnToField`
  - `detectBoundaryScale` flattens across variants
