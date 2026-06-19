# OB-216 — Phase 0 Findings (EPG-0)

**Branch:** `ob-216-convergence-unified-path` · **Base HEAD:** `fad11782` (main, incl. DIAG-073 merge) · **Type:** READ-ONLY probes (no edits)
**Gate:** the four decisions below parameterize Phases 1–5. No HALT triggered. Tenant `972c8eb0-e3ae-4e4c-ad30-8b34804c893a`.

---

## Decision 1 — Partition key (§3.1, resolves DIAG-073 UNKNOWN #3)

**DECISION (REFINED after multi-tenant probe): partition key = `(data_type, column-signature)`** — the schema signature `sigOf(rd)=Object.keys(rd).filter(!_).sort().join(',')` that HF-228 already computes (`convergence-service.ts:1072-1073`), grouped within `data_type`. NOT raw `import_batch_id`. Structural, Korean-Test-clean (column-key signature, no name/value semantics).

**Why refined (regression guard, HALT-2):** `import_batch_id` is 1:1 with `_sheetName` (confirmed below), but `_sheetName` embeds the MONTH, so MIR's 6 `Cobranza_*` batches share one schema yet are 6 batches. Partitioning by raw `import_batch_id` would over-fragment one logical sheet into 6 capabilities and, worse, fragment any monthly single-file tenant — tripping the regression guard. Partitioning by `(data_type, column-signature)` groups same-schema batches (months) into one capability and separates genuinely different schemas. Multi-tenant evidence (live, ordered pagination):
```
BCL  5035b1e8 (regression tenant): 3 batches, 3 data_types, each 1 schema
   transaction(Datos_Rendimiento, 201)  entity(Plantilla roster, 67)  reference(Datos_Flota_Hub, 36)
   → 3 capabilities by data_type OR by import_batch_id OR by (data_type,signature) — IDENTICAL. No regression any way.
MIR  972c8eb0: 15 batches, 2 data_types
   transaction → 5 distinct column-signatures: Cobranza(6 batches), Ventas(5: Ene/Feb/Abr/May/Jun), Ventas_Marzo(1, +devolution cols), Clientes_Nuevos(1), Cuotas(1)
   entity → 1: Nómina(1, the 34-row roster)
   → by data_type = 2 caps (the BUG); by import_batch_id = 15 caps (over-fragments); by (data_type,signature) = 6 caps (CORRECT file boundary)
```
The 6 MIR caps map cleanly: Plan3→Cobranza, Plan1→Ventas, Plan5(clawback)→Ventas_Marzo, Plan4→Clientes_Nuevos, Plan2→Cuotas, roster→Nómina. A signature-cap's `batchIds` = all batches sharing that schema (e.g. Cobranza cap → 6 batch ids), which is exactly what `resolveColumnFromBatch` (column-name scan across batches) consumes. **No HALT-2** (BCL unchanged at 3).

**Fetch consequence (Phase 1):** `inventoryData`'s flat `limit(500)` fetch (`convergence-service.ts:972-977`) does NOT guarantee coverage of small schemas (Cuotas=30, Nómina=34, Ventas_Marzo). Phase 1 must fetch per-batch samples (enumerate distinct `import_batch_id`, sample ~30-50 rows each) so every `(data_type, signature)` is represented before grouping.

Supporting 1:1 batch↔sheet evidence (null-rate 0/75,227):

Live query (stable `ORDER BY id` pagination, 75,227 rows):
```
distinct batches = 15   (each distinct_sheets = 1)
Cobranza_Enero(7303)  Cobranza_Febrero(7645)  Cobranza_Marzo(7760)  Cobranza_Abril(7830)  Cobranza_Mayo(8024)  Cobranza_Junio(8107)
Ventas_Enero(4296)    Ventas_Febrero(4487)    Ventas_Marzo(4576)    Ventas_Abril(4689)    Ventas_Mayo(4927)    Ventas_Junio(4998)
Clientes_Nuevos(521)  Cuotas(30)  Nómina(34)
_sheetName NULL rows = 0 / 75227
```
- **No HALT-1.** `import_batch_id` IS per-sheet; `_sheetName` has no nulls → the simple key suffices (composite not required).
- New sheet surfaced: **`Nómina` (34 rows = the 34 entities — the roster).** Under the partition it becomes its own `DataCapability`; data-plan matching (Phase 2) must match measure-bearing sheets, not the roster (Nómina has no plan measures).

## Decision 2 — Live entity key per plan (§3.2, resolves DIAG-073 UNKNOWN #1 — the most important)

**DECISION: all 5 plans currently bind `entity_identifier.column = DNI_Vendedor` (correct, uniform).** Source: persisted `rule_sets.input_bindings.convergence_bindings` (Decision 111; `run/route.ts:392`), `convergence_version=HF-234`.

```
Plan3 Cobranza (e04a6eba): component_0: period=Fecha_Cobro | Monto_Cobrado=Monto_Cobrado(mp1) | Saldo_Pendiente=Saldo_Pendiente(mp1) | entity_identifier=DNI_Vendedor(mp1)
Plan4 Cartera Nueva (c9c4d580): component_0: Verificado=Monto_Cobrado(mp1) | entity_identifier=DNI_Vendedor
Plan1 Ventas (3c195e87): component_0: Categoria=Monto_Cobrado(mp3) | Monto_Total=Saldo_Pendiente(mp1) | entity_identifier=DNI_Vendedor ; component_1: Monto_Total=Saldo_Pendiente(mp1)
Plan5 Clawback (2f615968): component_0: Monto_Original=Monto_Cobrado | Tasa_Comision_Original=Saldo_Pendiente | Multiplicador_Acelerador_Original=Saldo_Pendiente | entity_identifier=DNI_Vendedor
Plan2 Bono Cuota (1b446232): component_0: ventas_brutas_mensuales=Monto_Cobrado | cuota_mensual_asignada=Saldo_Pendiente | entity_identifier=DNI_Vendedor
```

**Interpretation (resolves UNKNOWN #1):**
- `entityCol = knownEntityCols[0] = DNI_Vendedor` for every plan → **Track C's "wrong global entity key" bite is NOT active for MIR.** This is exactly the premise-contingency DIAG-073 §4 (verifyC) flagged as PARTIALLY_CONFIRMED; the data confirms the benign branch.
- **The active MIR failure is the WRONG CROSS-SHEET MEASURE bindings** (Track A): Plan1 `Monto_Total→Saldo_Pendiente`, Plan4 `Verificado→Monto_Cobrado`, Plan5 `Monto_Original→Monto_Cobrado`, Plan2 `ventas_brutas_mensuales→Monto_Cobrado` — all bound onto Cobranza columns.
- **Plan3 already binds correctly** (`Monto_Cobrado→Monto_Cobrado`, mp1, entity=DNI_Vendedor) → the sheet partition (Phase 1-2) must keep it correct (no regression), and the DIAG-073 §1 "Plan3 grand-total-0" must be re-verified post-Phase-2 (it was a premise-contingent/possibly-stale observation, not a ratified guarantee).

**Build refinement:** Phase 4 (per-sheet entity key) remains the correct **structural-class / scale-by-design (SR-2)** fix — a single global `entityCol=knownEntityCols[0]` would break a tenant whose sheets use different identifiers — but it is **not** the MIR blocker. The MIR blocker is Phases 1-3 (partition + role-aware candidates + relative selection). Phase 4 must preserve the currently-correct `DNI_Vendedor` keying for all MIR sheets.

## Decision 3 — Clawback cross-period source (§3.3, resolves DIAG-073 UNKNOWN #4; sizes the Design-Gate)

**DECISION: source = (A) recompute-from-original-sale, via `Folio_Original → Ventas_Enero.Folio` join, with a rate-table dependency.** No HALT-0 (source data present).

```
(A) Original sale rows in Ventas_Enero matching the 5 Folio_Original values: ALL 5 found
   Folio=TXN-594392 Monto_Total=9791.18 Categoria=Alimentos  DNI_Vendedor=10300005
   Folio=TXN-653971 Monto_Total=3031.5  Categoria=Limpieza   DNI_Vendedor=10300005
   Folio=TXN-875952 Monto_Total=2409.4  Categoria=Limpieza   DNI_Vendedor=10300013
   Folio=TXN-702059 Monto_Total=6243.48 Categoria=Bebidas    DNI_Vendedor=10300019
   Folio=TXN-311807 Monto_Total=5928.3  Categoria=Alimentos  DNI_Vendedor=10300019

(B) calculation_results for Plan1 (3c195e87): count = 0  → source B UNAVAILABLE (no stored original commission)
    (calculation_results columns: attainment, batch_id, components, created_at, entity_id, id, metadata, metrics, period_id, rule_set_id, tenant_id, total_payout)
```
- The original sale row yields `Monto_Original` (= original `Monto_Total`) + `Categoria` + `DNI_Vendedor`. The other two declared inputs (`Tasa_Comision_Original`, `Multiplicador_Acelerador_Original`) are the **original plan's (Plan 1) commission rate by `Categoria` + accelerator** — NOT on the row → **the Phase-5 sub-component carries a rate-table lookup into Plan 1's `components`** (the precise cross-period dependency, per §6A).
- Since source B is unavailable, the clawback MUST recompute from the original sale (A). The `Folio_Original→Folio` join is the structural key (Korean-Test-clean).

## Decision 4 — `Categoria`→Decimal crash locus (§3.4, resolves DIAG-073 UNKNOWN #5)

**DECISION: binding-driven; removed by the Phase 1-3 partition+role-aware fix, plus a one-line defense-in-depth coercion guard at the `reference` prime.**

The two numeric sinks in the intent evaluator behave differently:
- `aggregate` prime **already coerces** non-numeric safely — `intent-executor.ts:259-261`: `const v = r[node.field]; return typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : 0) || 0;` → a category string → `NaN || 0` → 0. **No crash.**
- `reference` prime does **NOT** coerce — `intent-executor.ts:151-154`: `const raw = context.metrics[node.field]; return raw === undefined || raw === null ? ZERO : toDecimal(raw);` → `toDecimal('Alimentos')` → `new Decimal('Alimentos')` (`decimal-precision.ts:27-29`) → `[DecimalError] Invalid argument`.

A categorical only reaches the `reference` prime if a metric is mis-bound to a categorical column (current state: Plan1 binds metric `Categoria`→column `Monto_Cobrado`, numeric — so the crash is latent, triggered by certain binding shapes). The sheet partition + role-aware admission (Phases 1-2) ensures a categorical is admitted only as a filter dimension, never a numeric measure binding → the crash cannot arise. **Phase 3 additionally adds a structural guard at the `reference` prime: non-finite/non-numeric → ZERO** (mirroring the `aggregate` prime; Korean-Test-clean — "non-numeric→0", no column-name literal). No separate categorical→Decimal path exists outside a binding.

---

## EPG-0 status
- 4/4 decisions recorded with pasted evidence. HALT-0/HALT-1 cleared.
- Incidental: DIAG-073 UNKNOWN #2 (per-sheet `structuralType`s) will be emitted by Phase 1's per-sheet capability output (EPG-1).
- Proceed to Phase 1 (sheet-aware partition in `inventoryData`).

*OB-216 Phase 0 · 2026-06-18 · READ-ONLY · vialuce.ai*
