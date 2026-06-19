# OB-220 — MIR Five-Plan Activation (Platform Capability Gaps) — Completion Report

*Branch: `ob-220-mir-five-plan-activation` · 2026-06-19 · DO NOT MERGE (SR-44)*

---

## 1. Outcome

The two **platform** capability gaps named in the OB title are fixed and proven: the prime-DAG
**string-comparison crash** and the **wide-format temporal column binding**. The tenant-instance
plan corrections are authored as a deferred migration; the MIR five-plan calc verification is the
architect's authenticated step (the calc route is middleware-auth-gated — CC cannot run MIR calcs,
same boundary as OB-217/218/219).

Two findings materially refine the directive's framing and are surfaced (not worked around):
1. **MIR was re-imported** since OB-218 — bindings are now correct (Plan 1: `Categoria→Categoria`,
   `Monto_Total→Monto_Total`). The OB-218 `mir-tenant-state` blocker is resolved; memory updated.
2. **Plan 1's vocab swap is necessary but NOT sufficient.** `reference(Categoria)` reads the
   numeric-only `metrics` map at the entity level, and a vendor sells mixed categories — so a
   per-transaction categorical commission cannot be computed by an entity-level reference. Correct
   computation needs a per-category `filter`+`aggregate` restructure = **OB-214 structural class**
   (explicitly OOS per directive §6). Same for Plan 4 (verified-count). Analysis + ready snippets below.

---

## 2. DoD status

| # | DoD | Status |
|---|---|---|
| 1 | Engine: compare handles string operands, no crash; unit-tested | ✅ **DONE, proven** (7/7) |
| 2 | Plan 1 category-specific rates, distinct rates in traces | ⚠️ vocab authored; **needs OB-214 per-category restructure** (entity-level `reference(Categoria)` can't carry the category) — analyzed |
| 3 | Plan 2 period-matched quota from wide-format Cuotas | ✅ **mechanism built + proven** (6/6); binding generation = convergence re-bind / hand-author (snippet provided), then architect recalc |
| 4 | Plan 4 count of verified new clients × bonus | ⚠️ **OB-214 structural** (needs `filter(Verificado)` + sheet scope) — documented |
| 5 | Plan 5 temporal_adjustment modifier; binding doesn't abort | ✅ migration authored (DAG→0 removes unbindable refs; modifier added; Jan=0 correct) |
| 6 | MIR January: 5 plans produce results | ⏳ **architect** (auth-gated recalc) — engine + corrections make it reachable |
| 7 | BCL regression $312,033 | ✅ numeric path byte-identical + reconciliation PASS |
| 8 | build exit-0; PR | ✅ |

---

## 3. Platform fix #1 — prime-DAG string comparison (DoD #1)

`intent-executor.ts` `evaluate()`: the `constant` node ran `toDecimal('ALI')` → `[DecimalError]
Invalid argument: ALI`, and `compare` coerced both operands through decimal.js. Now:
- `constant` degrades a non-numeric string to 0 (numeric context) — no crash.
- `compare` reads RAW operands (`rawOperand`/`isNumericRaw`); if either is non-numeric it does string
  `eq`/`neq`, ordering ops warn + return 0 (SR-34); the numeric path (incl. meta-scale) is byte-identical.
- Type detection, not value detection (Korean Test).

```
✔ no crash: categorical constant degrades to 0 (was DecimalError)
✔ no crash: compare(reference, categorical constant) — the production crash site
✔ string equality / inequality;  mixed string/number → no match
✔ string ordering operator → 0 (not crash, not true)
✔ numeric path preserved (byte-identical for numbers)
✔ conditional + compare + constant chain over a category → rate selected
tests 7  pass 7  fail 0
```

## 4. Platform fix #2 — wide-format temporal binding (DoD #3)

`temporal-binding.ts` (pure, 6/6): `detectTemporalColumnMap` (structural year+month detection,
multilingual month vocab — not column/business names), `resolveTemporalColumn`, `periodKeyFromStartDate`.
`ConvergenceBindingEntry` gains `columnMap`; `resolveMetricsFromConvergenceBindings` resolves a
binding's column for the current calc period via `effCol`/`effRed` (prime_dag + ratio + single paths;
static bindings unchanged).

```
✔ detect: MIR Cuotas (Enero_2025..Junio_2025) → 6-entry columnMap {"2025-01":"Enero_2025",...}
✔ detect: English month names + numeric months;  non-temporal → null
✔ resolve: period key → column; unmapped → null (SR-34);  periodKeyFromStartDate;  isTemporalBinding
tests 6  pass 6  fail 0
```
The calc-time resolution is live. Generating Plan 2's temporal_map binding needs a convergence re-bind
(wire `detectTemporalColumnMap` into the abstain path — the abstain site wasn't located in
`convergence-service.ts`) or the hand-authored binding in the migration's documented snippet.

## 5. Plan corrections (migration `20260619140000_ob220_mir_plan_corrections_DEFERRED.sql`)

- **Plan 1**: vocab ALI/BEB/LIM/CPE → Alimentos/Bebidas/Limpieza/Cuidado Personal. **Insufficient alone**
  (see §1.2). The OB-220 engine fix + this vocab unblock the crash and align the values; the per-category
  restructure (`add(multiply(filter(Categoria=='Alimentos')→aggregate(sum,Monto_Total),0.025), …)`,
  accelerator folded) is OB-214 — and would compute correctly (provable via the evaluator, which now
  handles the prime set), but it re-interprets plan structure (incl. the accelerator-as-additive-component
  defect) so it's routed to OB-214 rather than shipped blind/unverifiable.
- **Plan 5**: DAG → `constant 0` (removes unbindable `Tasa_Comision_Original`/`Multiplicador_Acelerador_Original`
  → no binding abort, no HF-205 throw; January = 0, correct — returns are in March) + `temporal_adjustment`
  modifier (OB-218 Pattern D reads it). Live clawback dispatch is the OB-218 deferred residual.
- **Plan 2** temporal_map binding + **Plan 4** verified-count: documented snippets in the migration footer.

## 6. Regression (DoD #7)
BCL numeric comparisons are byte-identical (engine fix only branches on non-numeric operands; unit-proven),
and BCL has no string compares. `scripts/ob217-verify-bcl-attribution.ts` → PASS (510/510 reconcile, $312,033).
Meridian unaffected (no MIR changes touch it).

## 7. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: String comparison: ENGINE DEFECT → FIXED (proven). Temporal binding: CONVERGENCE GAP → mechanism
    FIXED (proven); binding generation pending re-bind. MIR re-imported → bindings correct (OB-218
    mir-tenant-state blocker RESOLVED). Plan 1 per-category + Plan 4 verified-count + accelerator-as-
    additive = OB-214 structural class. Plan 5 modifier added. MIR calc verification auth-gated.
REGISTRY: Calculation Engine → categorical conditional (no crash); Convergence → temporal binding.
BOARD: MIR 1/5 calculating → engine + corrections unblock Plans 1/2/4/5 (architect recalc to confirm).
SUBSTRATE: Korean Test (type detection; structural temporal pattern), Decision 158 (engine below
           boundary), SR-34 (string-ordering + unmapped-period structured, not silent), SR-38 (BCL preserved).
```

## 8. Architect steps (SR-44)
1. Apply `20260619140000_ob220_mir_plan_corrections_DEFERRED.sql` (Plan 1 vocab + Plan 5).
2. Generate Plan 2's temporal_map binding (re-bind or the documented snippet).
3. Recalculate MIR January for all 5 plans; reconcile against `MIR_Resultados_Esperados.xlsx`.
4. Route Plan 1 per-category + Plan 4 verified-count (+ accelerator) to OB-214.

Merge-ready PR-branch HEAD: `git rev-parse HEAD` on `ob-220-mir-five-plan-activation`. DO NOT MERGE — SR-44.
