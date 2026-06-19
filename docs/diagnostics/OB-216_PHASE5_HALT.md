# OB-216 Phase 5 — HALT (cross-period clawback) · stop-and-report

**Branch:** `ob-216-convergence-unified-path` · HEAD `228d1cf1` (Phases 0–4 committed, both scans GREEN, build + `tsc` exit 0).
**HALT class:** HALT-source (clawback's declared inputs cannot be recovered) compounded by HALT-3 (the only forcing path is a MIR special-case) + a surfaced plan-interpretation defect (Plan-1 category-code mismatch).
**Discipline:** live code/query evidence only; no ground-truth values; no AUD-001/extracts; Korean Test (structural, not name-matching).

---

## §5.0 What the clawback declares (live, from `rule_sets.2f615968…components.variants[0]`)

Component **"Ajuste por Devolucion (Clawback)"**, intent tree (verbatim):
```
multiply(
  constant(-1),
  multiply(
    multiply( reference(metric: Monto_Original), reference(metric: Tasa_Comision_Original) ),
    reference(metric: Multiplicador_Acelerador_Original)
  )
)
metadata: { recovery_rate: 1, applied_in_period: "return_period", clawback_window_days: 45 }
```
Three **metric** references — `Monto_Original`, `Tasa_Comision_Original`, `Multiplicador_Acelerador_Original` — each resolved through a convergence binding to a column.

## §5.1 What the data contains (probe evidence)

- **None of the three referenced fields is a column.** Phase-0 probe: `Monto_Original`, `Tasa_Comision_Original`, `Multiplicador_Acelerador_Original` each have **0 rows** in `committed_data`.
- **The original sale row** (`Ventas_Enero`) carries `Monto_Total`, `Categoria`, `Cantidad`, `Precio_Unitario`, `DNI_Vendedor` — **no rate, no accelerator**.
- **The return row** (`Ventas_Marzo` devolution) carries `Folio_Original`, `Fecha_Original`, a **negative** `Monto_Total`, `Motivo_Devolucion`, `Categoria`, `DNI_Vendedor` — **no rate, no accelerator**.
- **Phase 2 already recognised this correctly.** The unified agentic binding **abstains** on `Tasa_Comision_Original` and `Multiplicador_Acelerador_Original` ("no candidate column represents a commission rate or accelerator multiplier"), and binds `Monto_Original` to its own sheet (`Monto_Total[Ventas]`), not to a foreign sheet.

## §5.2 The persisted binding is the exact wrong-file defect OB-216 fixes (and Phase 2 corrects it)

Live `input_bindings.convergence_bindings.component_0` (stale, pre-Phase-2 — the verify harness restores, so the persisted row predates Phase 2):
```
Monto_Original                    -> Monto_Cobrado    (Cobranza, contextualIdentity=amount_collected_in_currency)
Tasa_Comision_Original            -> Saldo_Pendiente  (Cobranza, contextualIdentity=outstanding_balance_in_currency)
Multiplicador_Acelerador_Original -> Saldo_Pendiente  (Cobranza, match_pass=2)
period                            -> Fecha_Cobro      (Cobranza)
```
A **Ventas-devolution** plan bound entirely to **Cobranza** columns — the cross-sheet candidate-pool defect DIAG-073 named. **Phase 2 (this branch) already eliminates it**: it binds `Monto_Original` own-sheet and **abstains** on the phantom rate/accelerator instead of grabbing `Saldo_Pendiente`. *For the convergence/wrong-file objective, Plan 5 is fixed.*

## §5.3 The decisive blocker — `Tasa`/`Multiplier` are another plan's COMPUTED rate, not data

`Tasa_Comision_Original` and `Multiplicador_Acelerador_Original` are not measurements; they are **Plan 1's computed commission rate and accelerator** for the original sale. The general cross-period capability (reference-key → prior-period row → recover that row's **fields**) recovers `Monto_Original` (the original `Monto_Total`) but **cannot** recover a *computed sub-expression of a different plan*. Recovering them requires **re-running Plan 1's commission on the recovered row** — and that path is itself blocked:

**Plan-1 category-code mismatch (live query):**
```
Plan 1 rate is conditional on  Categoria == 'ALI' / 'BEB' / 'LIM'   (3-letter codes)
Ventas_Enero distinct Categoria VALUES = Alimentos | Bebidas | Cuidado Personal | Limpieza  (full names)
MATCH? NO  -> Plan 1 always falls through to the else rate (0.035) for every sale
```
So even a faithful re-run of Plan 1 yields the **else** rate for all categories (a separate plan-interpretation defect, OB-214 territory). `Plan 1 calc_results = 0`, so the stored-original-commission source is also unavailable.

## §5.4 Why this is a HALT (no non-forcing path)

To make the clawback **compute as declared**, the field-by-field formula needs `Tasa_Comision_Original` and `Multiplicador_Acelerador_Original` bound to *something*. The only available routes:

- **(a) Hardcode** Plan 1's rate table (`ALI→0.025…`), a `Tasa_Comision_Original → Plan-1-rate-component` field-to-component map, **and** a category-code map (`ALI↔Alimentos`). → **HALT-3** (MIR special-case; column-name literals + developer rate constants). Forbidden.
- **(b) Re-interpret the whole component holistically** as `−recovery_rate × (original plan's commission for the referenced sale)` — identify the original plan by the referenced sale's sheet, re-run its commission intent on the recovered prior-period row, negate. This is **general and literal-free**, but it **replaces the declared field-by-field arithmetic** with "re-run the original plan." That is a **plan-interpretation change**, which is the architect's channel (Decision 158 boundary: the engine applies what the plan declares; it does not re-author the plan's formula).

There is **no general structural rule** by which a clawback `_Original` reference field binds to a specific component of another plan. So neither route is available to me without either a special-case (a) or re-declaring the plan (b). → **STOP**.

## §5.5 Dictated dispositions (architect decides before continuing)

- **D1 (recommended).** Re-declare the clawback component's intent as `multiply(constant(-recovery_rate), <reference to the original plan's commission for the referenced prior sale>)`. Then OB-216 builds the **general** holistic mechanism: recognise the clawback signature (a reference_key field + `applied_in_period:return_period`/`clawback_window_days` metadata + `_Original` refs that don't bind) → resolve the reference_key to the prior-period sale row → identify the plan that computes on that row's sheet → re-run its commission intent on the row → apply `−recovery_rate`. Keyed on the structural signature, no literals, MIR is one instance.
- **D2.** Fix Plan 1's category-code mismatch (`ALI/BEB/LIM` vs `Alimentos/Bebidas/Limpieza/Cuidado Personal`) — a plan-interpretation defect (OB-214). Without it, even D1's faithful re-run reverses the **else** rate for every category.
- **D3 (alternative).** If the declared field-by-field formula must stand, supply the structural rule by which a clawback `_Original` reference field binds to a specific original-plan component (none exists today).

## §5.6 Remaining OB-216 scope (held pending disposition)

- **Phase 3″** — scale-inference bounds in `convergence-service.ts` (`profileColumnDistribution`/`inferScale`, magnitude boundaries) → distribution-derived / LLM-recognised; extend the no-dev-numbers scan to catch else-if-chain floats. **Independent of Phase 5**; clean to execute next on the architect's nod.
- **PR** (no merge, SR-44) — after the Phase-5 disposition and Phase 3″.

## §GC — generality of what is / isn't done

- **Convergence (OB-216 objective): DONE for Plan 5.** Phase 2 stops binding the devolution plan to Cobranza columns and abstains on the phantom rate/accelerator — the wrong-file class is closed for the hardest plan, by construction, no special-case.
- **The blocker is not convergence.** It is that the clawback's declared formula references *another plan's computed sub-expressions* as if they were data. That is plan-declaration/interpretation, not column binding. Honoring it generally requires D1 (re-declaration) — surfaced, not forced.

*OB-216 Phase 5 / HALT · 2026-06-18 · vialuce.ai*
