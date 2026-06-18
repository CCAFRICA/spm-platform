# OB-216 §B Probe — UNKNOWN #1 Correct Resolution + STOP/Blocking Finding

**Branch:** `ob-216-convergence-unified-path` · **Type:** READ-ONLY runtime probe (temporary trace added at `run/route.ts:820`/`~917`, captured, **reverted** — verified 0 occurrences remain). **No fix applied (per §B/§E).**
**Method:** headless Plan-3 (`e04a6eba`, INCENTIVO POR COBRANZA) convergence+calc for MIR January (`5896512f`), `CALC_TRACE_VERBOSE=true`, via direct `POST`-handler import (the `HF-216_phase6_recalc.ts` pattern).

---

## 1. The §B runtime values (close UNKNOWN #1 correctly — supersedes the Phase-0 static read)

```
[OB216-PROBE-B] knownEntityCols= ["DNI_Vendedor"] | entityCol(knownEntityCols[0])= DNI_Vendedor
[OB216-PROBE-B] component_0.entity_identifier.column= DNI_Vendedor
```
- `knownEntityCols` (full array) = `["DNI_Vendedor"]`
- `knownEntityCols[0]` (the global key) = `DNI_Vendedor`
- Plan 3's own `entity_identifier.column` = `DNI_Vendedor`
- **Equal? YES.** (Plan 3 is calc'd with only its own bindings; its single component contributes the only entity_identifier, so `[0]` is unambiguous.)

**Decision-rule branch:** `knownEntityCols[0] === 'DNI_Vendedor'` → the **second branch** (NOT the wrong-global-key branch). The directive's Track-C hypothesis (`[0] !== DNI_Vendedor`) is **refuted by runtime**.

## 2. The architect's §A `column_in_no_batch` lines are real but NOT the cause of the zero

Verbose tracing shows `column_in_no_batch` fires **only for the 4 non-collections entities** (prefixes `101…`/`102…`, e.g. Supervisores/managers with no Cobranza rows) — which is **correct** (they have no collections data):
```
resolveColumnFromBatch:exit entity=10200002 | column=Monto_Cobrado | reason=column_in_no_batch | returned=null
resolveMetricsFromConvergenceBindings:exit entity=10200002 | path=prime_dag | refs=2 | resolved=0 | returnedNull=true
```
For the **30 real Cobranza vendors** (`10300…`), resolution **succeeds** — the convergence path, `entityCol`, and `dataByBatch` keying are all correct:
```
resolveColumnFromBatch:exit entity=10300021 | column=Monto_Cobrado | rowCount=147 | sum=295288.17 | found=true | returned=295288.17
resolveColumnFromBatch:exit entity=10300021 | column=Saldo_Pendiente | rowCount=147 | sum=885864.63 | found=true | returned=885864.63
resolveMetricsFromConvergenceBindings:exit entity=10300021 | path=prime_dag | refs=2 | resolved=2 | metrics={"Monto_Cobrado":295288.17,"Saldo_Pendiente":885864.63} | returnedNull=false
```

## 3. The ACTUAL cause of Plan 3 = 0 (a 5th defect, outside OB-216 Tracks A/A′/C/B)

```
runCalculation:component_complete entity=10300021 componentName="Tasa de Incentivo por Cobranza"
  | rawOutcome=0 | rounded=0 | metrics={"Monto_Cobrado":295288.17,"Saldo_Pendiente":885864.63}
[CalcRecon-T2] 10300021 | Óscar Jiménez Torres | variant=variant_0(Vendedor) | total=0 | components=[c0:0]
```
The component receives **correctly-resolved metrics** and still outputs **0**. Plan 3's intent (`rule_sets.components`, `incentivo-cobranza`, `componentType: prime_dag`):
```
conditional:
  condition: (reference Monto_Cobrado / reference Saldo_Pendiente) > 0.7
  then:      aggregate.sum(Monto_Cobrado) × 0.015
  else:      0
```
For `10300021`: `Saldo_Pendiente` is a per-entity **balance snapshot** — the identical value `6026.29` on all 147 transaction rows — but `resolveColumnFromBatch` **SUMS** it → `6026.29 × 147 = 885864.63` (147× inflated). The ratio becomes `295288.17 / 885864.63 = 0.333`, which fails `> 0.7` → `else = 0`. With the un-inflated balance (`6026.29`) the condition would pass and pay `Monto_Cobrado × 0.015`.

**Root class:** metric **aggregation semantics** — `resolveColumnFromBatch` unconditionally `SUM`s a bound column (`run/route.ts:1648-1677`), correct for a per-transaction measure (`Monto_Cobrado`) but **wrong for a balance/snapshot column** (`Saldo_Pendiente`) read by a `reference` prime in a ratio. This is **downstream of** correct binding (Track A) and correct keying/resolution (Track C).

## 4. Disposition (per §B second branch + §E) — BLOCKING for architect

- **UNKNOWN #1 resolved:** `entityCol` is correct (`DNI_Vendedor`); Plan 3's zero is **not** the wrong-global-key defect, and **not** `column_in_no_batch` for the real vendors. **Phase 4 (per-sheet entity key) would NOT unblock Plan 3.**
- **STOP branch triggered:** a separate, now-characterized defect (snapshot-column over-summation) is the cause. Per §B/§E: **do not invent a fix; this is a blocking finding for architect disposition before Phase 4.**
- **Scope implication (favorable-framing-drift guard, honored):** OB-216 definition-of-done #3 ("the 4 non-clawback plans compute non-zero") is **at risk independent of Tracks A/C** — once Phases 1–2 bind Plans 1/2/4 to their own sheets, any of them that read a snapshot/balance column in a ratio/threshold can still compute 0 via the same aggregation defect. The aggregation-semantics fix is **not** in the current OB-216 track set.
- **Phase 4 status:** scope must be re-derived. Phase 4's structural per-sheet-entity-key change remains correct for SR-2 (scale: a tenant with heterogeneous sheet identifiers), but it is **not** the Plan-3 unblock and must not be presented as such.

## 5. Recommendation (for architect)
1. **Disposition the aggregation-semantics defect** (snapshot vs transaction column reduction) — either fold a Track-C′ sub-scope into OB-216 (reduction policy per `field_identity`/`structuralType`: `sum` for measures, `last`/`snapshot` for balances) or spin a separate OB. CC awaits direction; no fix applied.
2. **Re-confirm Phase 4 scope** as the SR-2 structural fix (not the MIR unblock), or fold it under the disposition above.
3. **Phase 1 (partition)** is not blocked by §B and is still required (Plans 1/2/4/5 bind cross-sheet today); proceed to it and PAUSE at EPG-1 per §C — pending architect release given this finding reshapes the "compute non-zero" definition of done.

*OB-216 §B · 2026-06-18 · READ-ONLY · vialuce.ai*
