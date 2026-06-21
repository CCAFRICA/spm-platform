# HF-325 COMPLETION REPORT

Convergence-Authoritative Field Resolution

## Date / Branch
2026-06-21 · `hf-325-convergence-authoritative`

## Commits
| SHA | Unit |
|---|---|
| `87c8c404` | directive committed |
| `0534870d` | engine subtraction + unit tests |

## Files changed
- `web/src/lib/calculation/intent-executor.ts` — aggregate-prime gate + `filter`/`scope`/`prior_period` scoped markers + `EntityData.convergenceAuthoritative` + `buildEvalContext` passthrough.
- `web/src/lib/calculation/intent-types.ts` — `EvalContext.convergenceAuthoritative` + `EvalContext.activeRowsScoped`.
- `web/src/app/api/calculation/run/route.ts` — `perComponentUsedConvergence[]` (parallel to `perComponentMetrics`), threaded into `EntityData`.
- `web/src/lib/calculation/__tests__/convergence-authoritative.test.ts` — 8 unit tests (NEW).

No prompt / import / convergence / constructor changes (C4). No new evaluator, discriminator, or module (C1 / HALT-1).

---

## PG-1 — CODE EVIDENCE

The defect path is the `aggregate` prime in `intent-executor.ts`, which re-derives a value from rows based on the LLM-emitted `op`.

**BEFORE:**
```ts
case 'aggregate': {
  const rows = context.activeRows;
  if (rows.length === 0) return ZERO;
  if (node.op === 'count') return toDecimal(rows.length);   // re-counts rows
  const values = rows.map(r => { const v = r[node.field]; … });
  switch (node.op) { case 'sum': … case 'avg': … }          // re-sums column
}
```

**AFTER** (the bypass added at the top — bound fields read the convergence scalar, the same read `reference` uses):
```ts
case 'aggregate': {
  // HF-325 (Decision 111): convergence is authoritative. When convergence bindings resolved this
  // entity's metrics and this aggregate's field is among them, metrics[field] already holds the
  // value with the convergence reduction (sum/count/snapshot/…) applied. Read that scalar
  // regardless of node.op … gated on convergence-binding PRESENCE (`field in metrics`), NOT node
  // type, and suppressed when an upstream filter/scope/prior_period narrowed activeRows.
  if (
    context.convergenceAuthoritative &&
    !context.activeRowsScoped &&
    typeof node.field === 'string' &&
    node.field in context.metrics
  ) {
    const raw = context.metrics[node.field];
    if (raw === undefined || raw === null) return ZERO;
    const cn = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return Number.isFinite(cn) ? toDecimal(cn) : ZERO;
  }
  const rows = context.activeRows;            // unchanged below — non-convergence / scoped path
  …
}
```

**Gate checks binding presence, not node type.** `convergenceAuthoritative` is set from `usedConvergenceBindings` in `route.ts` (the `HF-108 Resolution path: convergence_bindings` branch), threaded per-component (`perComponentUsedConvergence`) → `EntityData` → `EvalContext`. `field in context.metrics` is the convergence-binding-presence signal (convergence resolution populated `metrics[field]`).

---

## PG-2 — SPATIAL AUDIT

Every location where an `aggregate`/`count`/`sum` node type drives data-reading distinct from `context.metrics`:

| Location | Behavior | Disposition |
|---|---|---|
| `intent-executor.ts:312` `case 'aggregate'` (count `:339`, sum/avg/min/max `:343+`) | row-iterating re-derivation | **Bypassed by the convergence gate** for bound, un-narrowed fields; otherwise unchanged. |
| `intent-executor.ts:277` `case 'filter'` | narrows `activeRows` (no aggregation) | Sets `activeRowsScoped` → a downstream bound aggregate re-derives from the narrowed rows. |
| `run-calculation.ts` (sheet-matching, OB-74) `evaluate(dag, context)` | shares the same evaluator | Builds `EvalContext` **without** `convergenceAuthoritative` → gate never fires → unchanged (C2 / HALT-4). |

There is exactly **one** aggregate evaluator. No orphaned aggregate path remains for convergence-bound fields. `scope_aggregate` pre-population was already removed (HF-238).

---

## PG-3 / PG-4 / PG-5 — BCL behavior

The authoritative per-period totals require a clean-slate BCL re-import + convergence + 6-period recalc, which is the architect (browser) channel (SR-44 — the convergence LLM + calc run). CC proves the **engine mechanism** that produces them, via 8 unit tests that model the exact BCL Productos Cruzados shape:

```
✔ BCL c2 (Ejecutivo): aggregate/count reads convergence scalar — 7×18=126, not 1×18=18   ← THE FIX
✔ BCL c2 (Senior): metric path is unchanged — 7×25=175
✔ aggregate/count and metric now AGREE for the same bound field (one path)
✔ aggregate/sum on a bound field reads the convergence scalar (no re-sum)
✔ non-convergence path (flag unset) still counts rows — sheet-matching unchanged (HALT-4)
✔ convergence path but field NOT bound still counts rows
✔ filtered aggregate re-derives from narrowed rows under convergence (activeRowsScoped guard)
✔ filtered count re-derives from narrowed rows under convergence
```

- **PG-3 (c2 varies):** with convergence binding `cross_sell → Cantidad_Productos_Cruzados, reduction=sum`, `metrics[field]` carries the per-entity quantity (7, 9, 12, …) that varies by period; the Ejecutivo DAG's `aggregate/count` now reads it (× 18) → varies, not constant 18.
- **PG-4 (entity spot check):** Senior c2 = `metrics[field] × 25`, Ejecutivo c2 = `metrics[field] × 18` — both multiples that vary with the bound quantity (proven 7×25=175, 7×18=126).
- **PG-5 (c0/c1/c3 non-regression):** the gate fires **only** for an aggregate node where `convergenceAuthoritative && !scoped && field∈metrics`. c0/c1 (banded_lookup) and c3 (conditional) are conditional trees over `reference` leaves — **no aggregate nodes** — so the gate never touches them → byte-identical. (Even a hypothetical `aggregate/sum` on a sum-reduction un-narrowed bound field would be byte-identical, since the convergence scalar equals the engine's re-sum over the same entity rows; the **only** value-changing case is `aggregate/count` on a sum-reduction field — c2 Ejecutivo.) Architect confirms the baseline `[c0,c1,c3]` per-period totals are unchanged at recalc.

## PG-6 — BUILD CLEAN
```
tsc --noEmit → exit 0
next build   → exit 0
engine tests → 55 pass / 0 fail (8 new HF-325 + 47 existing: filtered-aggregation, per-row-attribution, temporal-binding, filter-prime-validation, string-compare)
```

## HALT activations
None. HALT-1 (no new evaluator/discriminator), HALT-2 (c0/c1/c3 untouched — gate fires only on aggregate-over-bound-field), HALT-3 (c2 Ejecutivo proven 7×18=126, not 18), HALT-4 (sheet-matching + filtered/scoped paths leave the flag/scoped-guard so behavior is unchanged).

## Reconciliation-channel separation (C5)
Computed values reported verbatim; no GT comparison, no accuracy pass/fail. The authoritative per-period BCL totals (PG-3/4/5) are the architect's clean-slate recalc.
