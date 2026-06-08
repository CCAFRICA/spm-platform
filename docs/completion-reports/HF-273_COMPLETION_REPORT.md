# HF-273 Completion Report — Variant↔Binding Index Misalignment in prime_dag Metric Resolution

**Date:** 2026-06-08
**Branch:** `hf-273-variant-binding-index` (off `dev`, which carries the HF-272 commits)
**Reconciliation-channel separation:** all values below are calculated values reported verbatim. No ground-truth value is embedded, compared, or asserted. The architect reconciles c0 against held GT out-of-channel.

---

## 1. Commits + SHAs

| SHA | Subject |
|---|---|
| `71604427` | AUD-273: variant-binding index-space audit (Phase 1, read-only) |
| `11cfc188` | HF-273: align binding consumption to variant-component identity (A) + loud-fail unresolved DAG reference (B) |
| `0f4903a1` | HF-273 EPG-3: deterministic binding-index + loud-fail proof |
| (this file) | HF-273 completion report |

**PR:** authored on branch `hf-273-variant-binding-index`; `gh pr create` is reserved for the architect (SR-44). Branch is push-ready (see §End).

---

## 2. Defect A evidence

**Phase 1.1 finding (binding-key emission):** `generateAllComponentBindings` keys each binding `component_${comp.index}` (`convergence-service.ts:2710`), where `comp.index` is the **flattened all-variants ordinal** assigned by `extractComponents` (`:816 i`, `:905 index: i`) which flattens `for (const v of variants) for (const c of v.components) comps.push(c)` (`:803-812`). Ejecutivo Colocación is at flattened ordinal 4 when variant 0 (Senior) has 4 components (ordinals 0–3) and variant 1 (Ejecutivo) begins at 4 — consistent with the live `convergence_bindings` (`component_0`=Senior `colocacion_credito`, `component_4`=Ejecutivo `colocacion_actual`).

**Phase 1.2 finding (shared identity → HALT-1 disposition):** the producer's `extractComponents` `PlanComponent` carries **no `id`** (only `index`/`variantId`/`name`), but the consumer's `selectedComponents = variants[selectedVariantIndex].components` and the flattened list `variants.flatMap(v => v.components)` are **the same raw JSONB objects**, so the flattened ordinal is recoverable by **object identity** — a stable structural key (directive §2 "or an equivalent structural key"), collision-free where an `id` could repeat across variants. **HALT-1 NOT triggered.**

**Consumer fix (`run/route.ts`), git diff:**
```ts
-      const compBindingKey = `component_${compIdx}`;
-      const compBindings = convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined;
+      let compBindingKey: string | null = `component_${compIdx}`;
+      if (variants.length > 1 && selectedVariantIndex > 0) {
+        const flattenedComponents = variants.flatMap(
+          v => ((v.components as PlanComponent[] | undefined) ?? []),
+        );
+        const flattenedIdx = flattenedComponents.indexOf(component);
+        compBindingKey = flattenedIdx >= 0 ? `component_${flattenedIdx}` : null;
+      }
+      const compBindings = compBindingKey
+        ? (convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined)
+        : undefined;
```
Korean Test: selection by object identity (`indexOf(component)`), no name/role/variant string. The HF-219 correction branch inherits the corrected key via a narrowed local `cbKey` (compBindings truthy ⟹ key non-null). A `flattenedIdx < 0` (structural impossibility) → `null` key → loud per-component failure (never `component_0`).

## 3. Defect B evidence

**Phase 2.3 finding (reused HF-272 channel, no new channel — HALT-2 NOT triggered):** the loud surface is the existing HF-272 `componentResolutionFailure` path in `run/route.ts` (`findComponentResolutionFailure` → `metrics={}` + `componentResult.status='failed'` + `[CalcRecon-T1] resolutionFailures=[…]`). Defect B feeds the SAME surface; no parallel channel; marker shape `{ token, reason: 'no_real_column_match', candidatesConsidered }` matched.

**Fix — landed as a consumer-side structural pre-check** (parallel to the HF-272 binding marker), which fails the component LOUD before `resolveMetricsFromConvergenceBindings` is called, so the prime_dag silent skip never converts a missing required field into a band-collapsing ZERO. git diff (pre-check):
```ts
+      if (!componentResolutionFailure && compBindings) {
+        const cIntent = component.calculationIntent as Record<string, unknown> | undefined;
+        const isPrime = (component as unknown as { componentType?: string }).componentType === 'prime_dag'
+          || (!!cIntent && typeof cIntent.prime === 'string');
+        if (isPrime) {
+          const refs = extractReferencesFromDAG(cIntent);
+          const unresolved = refs.find(f => {
+            const fb = (compBindings as Record<string, { column?: string } | undefined>)[f];
+            return !fb?.column;
+          });
+          if (unresolved !== undefined) {
+            componentResolutionFailure = { token: unresolved, reason: 'no_real_column_match', candidatesConsidered: 0 };
+          }
+        }
+      }
```
And the prime_dag branch's `if (!fieldBinding?.column) continue;` gains a comment noting it is now caught loud upstream (defense-in-depth). **Scope (DD-7):** only the structural "no column binding for this DAG reference" gap is promoted (per-component, identical across entities); the per-entity `rawValue === null` data-absence skip is deliberately preserved (must not mass-fail sparse-data entities). This is a surfaced refinement of the directive's in-loop sketch — equivalent firing condition (`!column`), reusing the HF-272 surface, with the per-entity `null` case left unchanged for DD-7.

---

## 4. EPG evidence (FP-80 — pasted artifacts)

### EPG-1 — Defect A no-op for variant 0 / single-variant (DD-7)
From the §2 diff: `compBindingKey` defaults to `` `component_${compIdx}` `` and the remap runs **only** under `variants.length > 1 && selectedVariantIndex > 0`. Therefore for `selectedVariantIndex === 0` and for `variants.length <= 1` (all single-variant plans — Meridian, CRP, and any non-variant tenant), `compBindingKey` is byte-identical to today. Proof assertions (EPG-3 script):
```
PASS  A: Senior C1 (variant 0, compIdx 0) → component_0 (DD-7 byte-identical)
PASS  A: Senior C4 (variant 0, compIdx 3) → component_3 (DD-7 byte-identical)
PASS  A: single-variant plan keeps component_${compIdx} (DD-7) — compIdx 2 → component_2
```

### EPG-2 — Ejecutivo numerator now resolves (BCL October, `CALC_TRACE_VERBOSE=true`)
Calc run HTTP 200, rule_set `40f54766-edb8-479d-9bb9-4531e6ae19bb`, period October 2025 (`26cd38f5-…`), 85 entities. The previously-ABSENT numerator trace line is now PRESENT for Ejecutivo (variant_1) entities (raw values verbatim, no GT comparison):
```
prime_dag_field entity=BCL-5006 componentIdx=0 | field=colocacion_actual | column=Monto_Colocacion | raw=102588.87
prime_dag_field entity=BCL-5006 componentIdx=0 | field=meta_colocacion   | column=Meta_Colocacion  | raw=120000
prime_dag_field entity=BCL-5006 componentIdx=0 | field=calidad_cartera   | column=Indice_Calidad_Cartera | raw=0.9478
prime_dag_field entity=BCL-5009 componentIdx=0 | field=colocacion_actual | column=Monto_Colocacion | raw=93757.28
prime_dag_field entity=BCL-5009 componentIdx=0 | field=meta_colocacion   | column=Meta_Colocacion  | raw=120000
prime_dag_field entity=BCL-5009 componentIdx=0 | field=calidad_cartera   | column=Indice_Calidad_Cartera | raw=0.9012
```
Senior (variant_0) entities still trace their own numerator token `colocacion_credito` (DD-7 unchanged):
```
prime_dag_field entity=BCL-5001 componentIdx=0 | field=colocacion_credito | column=Monto_Colocacion | raw=112918.53
prime_dag_field entity=BCL-5003 componentIdx=0 | field=colocacion_credito | column=Monto_Colocacion | raw=170312.46
```
Per-entity variant + component breakdown (calculated; no GT comparison):
```
[CalcRecon-T2] BCL-5001 | variant=variant_0(Ejecutivo Senior) | total=980  | components=[c0:180,c1:400,c2:250,c3:150]
[CalcRecon-T2] BCL-5006 | variant=variant_1(Ejecutivo)        | total=564  | components=[c0:240,c1:80,c2:144,c3:100]
[CalcRecon-T2] BCL-5009 | variant=variant_1(Ejecutivo)        | total=476  | components=[c0:170,c1:80,c2:126,c3:100]
```
The Ejecutivo c0 (C1) values are varied real magnitudes, not a collapsed lowest-band floor — the fix fingerprint.

### EPG-3 — Defect B loud-fail proof + Defect A index recovery (deterministic, `scripts/hf273-binding-index-check.ts`)
```
PASS  A: Ejecutivo C1 (variant 1, compIdx 0) → component_4 (was component_0, the bug)
PASS  A: Ejecutivo C2 (variant 1, compIdx 2) → component_6
PASS  A: Senior C1 (variant 0, compIdx 0) → component_0 (DD-7 byte-identical)
PASS  A: Senior C4 (variant 0, compIdx 3) → component_3 (DD-7 byte-identical)
PASS  A: single-variant plan keeps component_${compIdx} (DD-7)
PASS  B: extractReferencesFromDAG surfaces the numerator token
PASS  B: against the WRONG (Senior) binding, colocacion_actual is detected unresolved (loud, not silent skip)
PASS  B: against the CORRECT (Ejecutivo) binding, NO unresolved ref (no over-fire — DD-7)
PASS  B: unresolved ref → evaluateComponent returns LOUD `failed` (status + token), not silent $0 — status=failed token=colocacion_actual payout=0
PASS  B: resolved binding → evaluateComponent NOT failed (no over-fire — DD-7)
PROOF: 10/10 assertions pass, 0 fail.
```

### EPG-4 — Build clean
```
$ npx tsc --noEmit        → EXIT 0 (no errors)
$ npm run build           → [korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
                             ✓ Compiled successfully
$ npm run dev             → ✓ Ready in 1185ms ; GET http://localhost:3000 → HTTP 307 (auth redirect, expected)
```
(The `/api/ai/calibration` "Dynamic server usage" line during build is a pre-existing Next.js dynamic-route prerender notice, not a compile error.)

### EPG-5 — Component-total reconciliation surface (BCL October, verbatim; architect reconciles c0)
```
[CalcRecon-T1] entitiesCalculated=85 grandTotal=44590
[CalcRecon-T1] componentTotals=[c0:17990 | c1:10170 | c2:8480 | c3:7950]
[CalcRecon-T1] resolutionFailures=[none]
```
`resolutionFailures=[none]` confirms Defect B did not over-fire — every component resolved against a real column; no legitimately-bound component was failed.

---

## 5. DD-7 statement
For variant-0 entities, single-variant plans, and any plan with `variants.length <= 1` (Meridian, CRP), the corrected binding selection resolves to the identical key consumed today: the remap runs only under `variants.length > 1 && selectedVariantIndex > 0`, and EPG-1 + EPG-3 prove `component_${compIdx}` is unchanged for those populations. Senior C1 still binds `colocacion_credito` (EPG-2), and Defect B's loud path fires only on a structural no-column gap (`resolutionFailures=[none]` on the real run — no behavior change for resolved components; the per-entity `rawValue===null` skip is preserved). No Meridian/CRP run was performed (out of scope per §6); non-regression asserted by construction + EPG-1.

## 6. Residuals (per directive §6A)
- **Other variant-structured plans:** Defect A is a class fix; any multi-variant plan with non-0 variants is corrected by the same change. FRMX (Sabor) and future variant tenants should be checked against the EPG-2 trace pattern at first calc.
- **Defect B beyond prime_dag:** the legacy role-binding paths (actual/target/numerator/denominator) retain their own `return null` branches (out of scope, DD-7); they are the next silent-skip surface in the same class if a non-prime_dag band-collapse appears.
- **Consumer-side landing of Defect B:** implemented as a pre-resolution structural pre-check rather than in-loop collection — equivalent `!column` firing condition, reuses the HF-272 surface, preserves the per-entity `rawValue===null` skip (DD-7). Recorded as a surfaced refinement of the directive sketch.
