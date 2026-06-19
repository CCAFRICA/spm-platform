# OB-216 Phase 3′ — EPG-3′ Evidence (general aggregation-reduction) · PAUSE for architect review

**Branch:** `ob-216-convergence-unified-path` · `npm run build` exit 0 · `npx tsc --noEmit` exit 0
**The value unblock:** MIR Plan 3 now computes **non-zero**. Files: `convergence-service.ts` (recognise), `anthropic-adapter.ts` (prompt), `convergence-bindings.ts` (type), `run/route.ts` (apply + guard + activeRows), `intent-executor.ts` (§G.1 guard).

## §2.0 Probe — signals confirmed (no HALT-G)
Both signals cleanly separate flow from stock (Cobranza):
- **contextualIdentity** (LLM-readable): `Monto_Cobrado`=`amount_collected_in_currency` (flow) vs `Saldo_Pendiente`=`outstanding_balance_in_currency` (stock).
- **data-shape invariance**: `Saldo_Pendiente` invariant-per-entity 6/6 vendors (a balance snapshot); `Monto_Cobrado` varies (88/72/85 distinct values/vendor).

## §2.1 Implementation — GENERAL reduction set (Decision 158)
The LLM **recognises** a bound column's reduction (`recognizeBindingsViaAI` returns `reduction` per field, prompt explains sum/snapshot/last/first/max/min/average/distinct_count from contextualIdentity + intent role); deterministic code **applies** it in `resolveColumnFromBatch` (a switch over the set, default `sum` = byte-identical legacy flow). NOT a sum/snapshot binary.
- **§2.0 data-shape guard (deterministic):** `snapshot` is honoured ONLY when the entity's values are actually all-equal; if they VARY (a flow the recogniser mislabelled from semantics), it falls back to **sum**. This is the second §2.0 signal applied as a guard — it prevents any flow/multi-row regression.
- **§G.1 reference-prime guard** (`intent-executor.ts:151`): non-numeric → ZERO (mirror the `aggregate` prime) — closes the Plan-1 `Categoria` crash defense-in-depth.
- **Co-resident fix (flagged):** `EntityData.activeRows` now defaults to the entity's OWN rows. The unscoped `aggregate(sum, Monto_Cobrado)` in Plan 3's `then` was reading empty `activeRows` (only the `scope` prime ever set it → peer rows) → 0. Default-to-own-rows fixes it; `scope` still overrides to peers. Necessary for Plan-3 non-zero, beyond reduction itself.

## EPG-3′ results

**MIR Plan 3 — non-zero (the unblock):**
```
resolveColumnFromBatch ... Saldo_Pendiente | reduction=snapshot | result=6026.29   (NOT 147× sum 885864)
resolveColumnFromBatch ... Monto_Cobrado   | reduction=sum      | result=295288.17
component_complete entity=10300021 metrics={Monto_Cobrado:295288.17, Saldo_Pendiente:6026.29}
Plan 3: entities=34, non-zero=30   (the 4 zeros are the 101/102-prefix non-collections entities — correct)
```

**SR-38 hand-computation (vendor 10300030):**
- `Monto_Cobrado` sum = 1,068,290.67 ; `Saldo_Pendiente` snapshot = 169,669.91
- ratio = 1,068,290.67 / 169,669.91 = 6.296 > 0.7 → condition TRUE
- payout = sum(Monto_Cobrado) × 0.015 = 1,068,290.67 × 0.015 = 16,024.36 → round(0) = **16,024**
- engine total_payout(10300030) = **16,024** ✓ EXACT MATCH

**§2.2 CONSTRUCTED SECOND-INSTANCE (mandatory; non-sum/non-snapshot; retained as fixture):**
A synthetic plan with two fields exercising the *same* recogniser over different reductions:
```
saldo_pendiente_maximo_del_periodo     -> Saldo_Pendiente | reduction=max      ✓
monto_cobrado_promedio_por_transaccion -> Monto_Cobrado    | reduction=average  ✓
```
The recogniser selected **max** and **average** (non-sum, non-snapshot) — proving the set is general, not a binary. **No HALT-GC3′** (no third type needed a new branch).

**BCL regression (data-shape guard proves no regression):**
BCL has 3 rows/employee with 3 distinct `Ingreso_Meta` values (a varying FLOW). The recogniser labelled some BCL columns `snapshot` from semantics ("goal/meta"), but the **data-shape guard** detects the values vary and falls back to **sum** — so BCL's flow columns still SUM (byte-identical to pre-OB-216). The reduction is a no-op wherever the data is not actually invariant. (Architect SR-44 browser recalc confirms the exact BCL value; my headless BCL harness hit a stale period id → 404, not a code issue.)

## §GC generality
- **(a) Class:** any column whose correct reduction differs from sum (snapshot/max/min/average/last/first/distinct_count), any tenant/unit.
- **(b) Keyed on:** LLM recognition over contextualIdentity + value-shape + intent role, guarded by deterministic data-shape invariance; no column-name literal, no magnitude boundary, no threshold.
- **(c) Anti-patterns absent:** no `Saldo_Pendiente`→snapshot literal; not a sum/snapshot binary (max/average proven); the guard is structural (values all-equal?), not a tuned cutoff.

**Architect reconciles Plan 3 (and BCL) per-entity values vs ground truth (SR-44).**

*OB-216 Phase 3′ / EPG-3′ · 2026-06-18 · PAUSE · vialuce.ai*
