# AUD-273 — Variant↔Binding Index-Space Audit (HF-273 Phase 1, read-only)

**Date:** 2026-06-08
**Baseline SHA:** `5fb6e45e8a4e20f6b251917bd6c2eef5ee4f52e0` (dev HEAD at audit)
**Scope:** establish the `component_N` binding-key emission scheme (producer) and the binding-consumption index space (consumer) so the Phase 2 fix aligns to the actual emitted scheme. No code changed in this phase.

---

## Phase 1.1 — Binding-key emission scheme

**Producer enumeration — `extractComponents` (`web/src/lib/intelligence/convergence-service.ts:771`).**
Reads `ruleSet.components` (JSONB). For the variant format it **flattens across ALL variants in declaration order** (HF-243), capturing each variant's `variantId` aligned by index:

```ts
// 803-812
for (const v of variants) {
  const variantId = typeof v.variantId === 'string' ? v.variantId : undefined;
  const vc = v.components as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(vc)) {
    for (const c of vc) { comps.push(c); compVariantIds.push(variantId); }
  }
}
```

Each emitted `PlanComponent` is assigned its **flattened ordinal** as `index = i` (the position in the full flattened `comps` array; `i` increments even for `enabled === false` components, which are `continue`-skipped from the result but still consume an ordinal):

```ts
// 816-818, 903-913
for (let i = 0; i < comps.length; i++) {
  const comp = comps[i];
  if (comp.enabled === false) continue;
  ...
  result.push({
    name, index: i, expectedMetrics: metrics, calculationOp: op,
    calculationRate: rate, calculationIntent: intent || undefined,
    variantId: compVariantIds[i],
  });
}
```

**Decisive structural fact:** the producer's `PlanComponent` (convergence-service local interface, line 28) carries **`index`, `variantId`, `name`, `expectedMetrics` — but NO `id` field.** The directive's Phase 2 sketch keys on `PlanComponent.id`; the producer side has none. (See Phase 1.2 for how the correspondence is nonetheless recoverable.)

**Binding-key expression — `generateAllComponentBindings` (`convergence-service.ts:2527`).** Iterates `components` (the `extractComponents` result) and keys each binding by the flattened ordinal:

```ts
// 2710
const compKey = `component_${comp.index}`;
```

So `convergence_bindings['component_K']` corresponds to the **K-th element of `variants.flatMap(v => v.components)`** (0-based, including disabled positions in the count). The HF-219 plausibility/correction writes (437, 458, 594, 2126, 2165) all use the same `component_${comp.index}` / `component_${pr.componentIndex}` flattened keying. Producer keying is internally consistent and correct.

**Ejecutivo Colocación flattened ordinal:** the architect-channel inspection of the live `convergence_bindings` JSONB establishes `component_0` = Senior Colocación (`colocacion_credito → Monto_Colocacion`) and `component_4` = Ejecutivo Colocación (`colocacion_actual → Monto_Colocacion`). This is structurally consistent with the flattening above when variant 0 (Senior) has 4 components (ordinals 0–3) and variant 1 (Ejecutivo) begins at ordinal 4. (Live-JSONB values are architect-channel; recorded here as the structural derivation, not re-queried by CC.)

---

## Phase 1.2 — Binding-consumption index space

**Consumer `variants` / `defaultComponents` derivation (`web/src/app/api/calculation/run/route.ts:206-221`):**
```ts
const rawComponents = ruleSet.components;
let defaultComponents: PlanComponent[];
let variants: Array<Record<string, unknown>> = [];
if (Array.isArray(rawComponents)) {
  defaultComponents = rawComponents as unknown as PlanComponent[];          // Format 1: direct array → variants = []
} else {
  const componentsJson = rawComponents as Record<string, unknown>;
  if (Array.isArray(componentsJson?.components)) {
    defaultComponents = componentsJson.components as unknown as PlanComponent[]; // Format 2: wrapped → variants = []
  } else {
    variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? []; // Format 3: variant → variants populated
    defaultComponents = (variants[0]?.components as PlanComponent[]) ?? [];
  }
}
```
`variants` is read from the **same `ruleSet.components` JSONB** the producer flattens. For non-variant plans (Formats 1/2) `variants = []`.

**Per-entity variant selection (1768-1815):**
```ts
let selectedComponents = defaultComponents;
let selectedVariantIndex = 0;
... (discriminator / overlap scoring sets selectedVariantIndex) ...
selectedComponents = (variants[selectedVariantIndex]?.components as PlanComponent[]) ?? defaultComponents;
```

**The defect site — per-component loop (1879-1887):**
```ts
for (let compIdx = 0; compIdx < selectedComponents.length; compIdx++) {
  const component = selectedComponents[compIdx];
  ...
  const compBindingKey = `component_${compIdx}`;                    // ← variant-selected ordinal
  const compBindings = convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined;
```
`compIdx` is the ordinal in the **variant-selected** array (0..N-1 for any entity). The binding key uses that ordinal directly. For `selectedVariantIndex === 0` the selected ordinal equals the flattened ordinal → aligned. For `selectedVariantIndex > 0` the selected ordinal is the **within-variant** position while the binding is keyed by the **flattened** position (`offset(selectedVariantIndex) + compIdx`) → **misaligned**: an Ejecutivo entity (compIdx 0) reads `component_0` (Senior) instead of `component_4` (Ejecutivo). Confirmed root cause.

**Decisive identity question (HALT-1):** do the flattened-list components and the variant-selected components share a recoverable stable identity?
**YES — by object identity, and the flattened ordinal is recoverable.** At the consumer, `selectedComponents = variants[selectedVariantIndex].components`, and the flattened list is reconstructable as `variants.flatMap(v => v.components)`. Therefore `selectedComponents[compIdx]` **is the same object reference** as an element of that flattened list. Its flattened ordinal = `flatMap(...).indexOf(selectedComponents[compIdx])`, which equals the producer's `component_${comp.index}` key (both flatten the same `variants` in the same declaration order, including disabled positions). The canonical `PlanComponent` (compensation-plan.ts:76) the consumer uses also carries an `id` (used at route.ts:2398), but **object identity is collision-free and exact**, whereas an `id` could in principle repeat across variants — so the alignment uses object identity (the "equivalent structural key" permitted by directive §2), not `id` matching, and not name/variant-name strings (Korean Test).

**HALT-1: NOT triggered.** A recoverable stable identity exists (object identity + matching flatten order). The Phase 2 fix recovers the flattened ordinal at the consumer and keys the binding by it. (Deviation from the directive's literal `c.id === selectedComp.id` sketch: the producer's `extractComponents` PlanComponent has no `id`, and object identity is strictly safer — recorded here per §2's "or an equivalent structural key.")

---

## Phase 1.3 — Binding-consumption site inventory (DD-1 / DD-2 class closure)

Every site that touches `convergence_bindings`, classified:

| Site | Code | Class | Action |
|---|---|---|---|
| `run/route.ts:1886-1887` | `compBindingKey = component_${compIdx}`; `convergenceBindings?.[compBindingKey]` | **(a) per-entity variant-selected consumption** | **FIX (Defect A)** — the defect site |
| `run/route.ts:2143-2207` | HF-219 correction read/write `cb[compBindingKey]`, `convergence_bindings:{...cb,[compBindingKey]:newComp}`, `convergenceBindings[compBindingKey]=...` | (a) reuses the SAME `compBindingKey` variable | **Inherits the fix** — keyed off the corrected `compBindingKey`; add null-guard |
| `run/route.ts:357` | `convergenceBindings = inputBindings.convergence_bindings` | load (not ordinal-indexed) | not affected |
| `run/route.ts:239, 269` | convergence presence check / write-back of produced bindings | not ordinal-indexed | not affected |
| `run/route.ts:2569` | `convergence_bindings_used: convergenceBindings` (snapshot) | whole-object pass-through | not affected |
| `run/route.ts:2932` | footer `cb=rawBindings.convergence_bindings`; iterates roles for `match_pass===3` count | **(b) whole-map iteration, never variant-selected ordinal** | not affected |
| `convergence-service.ts:437/458/486/594/2126/2165/2710` | producer `component_${comp.index}` / `${pr.componentIndex}` keying | **(b) producer emission by flattened ordinal** (correct) | not affected |
| `convergence-service.ts:3357-3362` | HF-243 flattening (same fix) for AI-derivation indexing | (b) producer-side flatten | not affected |

**Only consumer site requiring change:** `run/route.ts:1886-1887` (with the HF-219 correction branch inheriting via the shared `compBindingKey` variable). No ambiguous entries.

---

## Phase 2 readiness — Defect B site + HF-272 channel (Phase 2.3 read)

**Defect B site — `resolveMetricsFromConvergenceBindings` prime_dag branch (`run/route.ts:1338-1357`):**
```ts
const refs = extractReferencesFromDAG(intent);
for (const field of refs) {
  const fieldBinding = compBindings[field] as ConvergenceBindingEntry | undefined;
  if (!fieldBinding?.column) continue;            // ← Defect B: silent skip of an unresolvable binding reference
  const rawValue = resolveColumnFromBatch(fieldBinding.column, lookupKey, fieldBinding.filters);
  if (rawValue === null) continue;                // per-entity data absence (NOT changed — DD-7)
  ...
}
```
A `reference` field with no column binding is silently skipped → absent from `dagMetrics` → evaluator returns ZERO → band collapse (the HF-272 silent-$0 class, recurring at the binding-resolution path).

**HF-272 loud-failure channel (from HF-272, already in tree):** `ComponentBinding.resolutionFailure` marker + `findComponentResolutionFailure(compBindings)` (convergence-service) + the calc-time surface in `run/route.ts`: `componentResolutionFailure` → `metrics={}` + `componentResult.status='failed'` (+ `details.failed`) + `[CalcRecon-T1] resolutionFailures=[...]` footer. This is the existing per-component loud `failed` surface.

**Phase 2.3 decision (no new channel; HALT-2 NOT triggered):** Defect B reuses this exact surface. The prime_dag branch records a structural unresolved-ref (the `!fieldBinding?.column` case only — a per-component binding gap, consistent across all entities), and the caller routes it into the SAME `componentResolutionFailure` path (status `failed` + footer). The per-entity `rawValue === null` case is **left unchanged** (per-entity data absence, not a binding defect; changing it would mass-fail sparse-data entities — DD-7). This scopes Defect B to the structural silent-skip the directive targets while preserving DD-7 for sparse data.

---

## Summary

- **Defect A confirmed:** bindings keyed by flattened ordinal (`extractComponents`/`generateAllComponentBindings`), consumed by variant-selected ordinal (`component_${compIdx}`). Misaligned for `selectedVariantIndex > 0`. Only consumer site: `run/route.ts:1886-1887` (+ HF-219 correction branch via the shared variable).
- **HALT-1 NOT triggered:** flattened ordinal is recoverable at the consumer by object identity over `variants.flatMap(v => v.components)`; fix keys the binding by that ordinal, no-op for variant 0 / single-variant (DD-7).
- **Defect B confirmed:** prime_dag `if (!fieldBinding?.column) continue;` silent skip. Reuses the HF-272 loud `failed` surface (HALT-2 NOT triggered); scoped to structural binding-gap, `rawValue===null` per-entity case preserved (DD-7).
