# OB-216 Phase 2 — EPG-2 Evidence (unified agentic binding, Direction A)

**Branch:** `ob-216-convergence-unified-path` · **Commits:** 2-S1 `95f21ddc` → 2-S5 `e6ada695` → count-fix `5a4810d9` → cleanup `660c09c6`
**Gate:** self-gated; reviewed in completion report. `npm run build` exit 0; `npx tsc --noEmit` exit 0.

Phase 2 replaced the measure-only, unlabeled candidate pool + forced-no-abstention AI mapping + boundary-fallback chain with: **labeled (all-caps, role-tagged) candidates → one LLM recognition pass with abstention → deterministic structural validation (existence + intent-usage role-consistency) → write or convergence gap.** Sheet-aware, no developer threshold, no column-name literal.

---

## Per-plan binding (live convergence, all bindings fresh)

Each plan's metric → bound column **[sheet]**, validated. Recognition + validation logs pasted from the run.

| Plan | field → column **[sheet]** | match_pass | role check |
|---|---|---|---|
| **Plan 3** Incentivo Cobranza | `Monto_Cobrado`→`Monto_Cobrado` **[Cobranza]**; `Saldo_Pendiente`→`Saldo_Pendiente` **[Cobranza]** | 1, 1 | numeric→measure ✓ |
| **Plan 1** Comisiones Venta | `Monto_Total`→`Monto_Total` **[Ventas]**; `Categoria`→`Categoria` **[Ventas]** (comp_1 `Monto_Total`→`Monto_Total` **[Ventas]**) | 1 | numeric→measure ✓; **categorical→attribute ✓** |
| **Plan 4** Cartera Nueva | `Verificado`→`Verificado` **[Clientes_Nuevos]** | 1 | **count→categorical→attribute ✓** |
| **Plan 2** Bono Cuota | `ventas_brutas_mensuales`→`Monto_Total` **[Ventas]**; `cuota_mensual_asignada`→`Mayo_2025` **[Cuotas]** | 1, 1 | **cross-sheet** ✓ |
| **Plan 5** Clawback | `Monto_Original`→`Monto_Total` **[Ventas_Marzo]** (1); `Tasa_Comision_Original`→**GAP (abstained)**; `Multiplicador_Acelerador_Original`→**GAP (abstained)** | 1 / failed | deferred → Phase 5 |

`entity_identifier` = `DNI_Vendedor` for all 5 MIR plans (fixed: the self-verification candidate set was widened to `identifier ∪ reference_key`, so the intersection-with-entities score picks the vendor key, not a high-cardinality folio).

**No plan binds another sheet's columns** — the DIAG-073 cross-sheet defect is gone. Plan 1/3/4 each bind to their own single sheet; Plan 2 legitimately spans Ventas+Cuotas (its fields belong to different sheets).

### Abstention path — EXERCISED (honest)
The abstention path is **not** unexercised: Plan 5's clawback abstained on two fields with reasoned causes (verbatim):
```
Tasa_Comision_Original  → abstain: "No candidate column across any sheet represents a commission
  rate or percentage … none correspond to a commission rate (Tasa de Comision) … from a return record."
Multiplicador_Acelerador_Original → abstain: "No candidate column … represents an accelerator
  multiplier … none correspond to an accelerator multiplier (Multiplicador de Acelerador) …"
```
These are exactly the cross-period inputs that exist only on the original sale (Phase 5). The LLM correctly bound `Monto_Original`→`Monto_Total` **[Ventas_Marzo]** (the return record) and abstained on the rate/multiplier rather than forcing a wrong pick — the forced-no-abstention defect is removed.

---

## Structural validation (§D) — pasted, no bare-float

`deriveNeededType` covers the **full structuralType space** (not a numeric/attribute binary), branching on intent operation/prime types only (Korean Test — no column-name literal):
- arithmetic / aggregate(sum,avg,min,max) → **numeric** (measure/count)
- **count → categorical** (type-agnostic: counting rows by any column is valid — Plan 4)
- compare / conditional / filter → **categorical** (attribute-OK)
- temporal/date → **temporal**; join/grouping key → **identifier**

Validation = existence (column ∈ proposed sheet) + `acceptableStructuralTypes(neededType).has(colStructuralType)`. A numeric-needed field binding an attribute → gap. **No bare-float threshold in the binding or validation.** `match_pass:2` "bind anyway" path removed; abstain/invalid → loud convergence gap, never a silent wrong bind.

---

## BCL regression (SR-2 proof) — NO regression

BCL (single-schema-per-data_type tenant, 3 capabilities) — its one 10-component plan binds entirely to **its own** sheets, entity=`No_Empleado`:
```
revenue_actual→Ingreso_Real [Rendimiento]; revenue_goal→Ingreso_Meta [Rendimiento];
hub_route_volume→Volumen_Rutas_Hub [Rendimiento]; on_time_delivery_pct→Pct_Entregas_Tiempo [Rendimiento];
new_accounts→Cuentas_Nuevas [Rendimiento]; safety_incidents→Incidentes_Seguridad [Rendimiento];
hub_total_loads→Cargas_Totales [Flota_Hub]; hub_total_capacity→Capacidad_Total [Flota_Hub]   (all mp=1)
```
Cross-sheet binding (loads/capacity on Flota_Hub, revenue on Rendimiento) is correct. No column bound to a wrong sheet; bindings unchanged in correctness from pre-OB-216.

---

## §GC-2 Generality posture

- **(a) Class:** any plan whose required fields are literal, abstract (differently-named), or cross-sheet — in any language. MIR's 5 plans + BCL's 10 components are instances, not the target.
- **(b) General property keyed on:** labeled-all-capabilities candidate set + LLM semantic recognition + intent-usage-derived structural validation over the full structuralType space. No field-name list, no sheet/plan assumption, no measure-only filter, no numeric/attribute binary.
- **(c) Anti-patterns confirmed absent:** no MIR column name in the prompt or validator; sheet labels are opaque (S1..Sn); the LLM discriminates by columns/types, not sheet-name meaning; one identical path for literal/abstract/cross-sheet; abstention surfaces a gap (no forced pick). BCL exercises the same path with a different tenant/schema and binds correctly — the second instance distinguishing capability from MIR-coincidence.

**Architect reconciles per-entity values vs ground truth (SR-44).** EPG-2 proves *binding* correctness (right sheet, right column, structurally valid). *Compute-non-zero* is the EPG-3′ gate (after the Phase 3′ reduction; Plan-3 ratio still needs the snapshot reduction; Plan-1 `Categoria` crash also closed by the §G.1 reference-prime guard).

*OB-216 Phase 2 / EPG-2 · 2026-06-18 · vialuce.ai*
