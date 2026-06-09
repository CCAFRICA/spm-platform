# HF-274 Completion Report — Phase 2 (Scale Application in constructTree)

**Date:** 2026-06-08
**Branch:** `hf-274-scale-application`
**Tenant:** Meridian Logistics Group `5035b1e8-0754-4527-b7ec-9f93f85e4c79`, rule_set `66282b16-cc33-4898-9a5d-70a512d684fd`
**Scope shipped:** Phase 2 only (scale fix). Phase 3 (hub-fallback) CANCELLED per architect Phase-0 disposition. c4 binding correction = architect-side SQL (post-merge). Reconciliation-channel separation observed: calculated values verbatim, no GT comparison.

---

## Commits
| SHA | Subject |
|---|---|
| `5a1273b5` | Phase 2: constructTree applies declared convergence scale to ratio-keyed breakpoints |
| `4e196dd6` | Phase 2 verify: deterministic constructTree+evaluate on real persisted compositional_intent |

---

## Phase 0 — diagnostic findings (read-only; accepted by architect)
- `Cargas_Totales` / `Capacidad_Total` are non-null on **36/36 hub rows, 0/268 individual rows** (c4's bound columns are hub-only → c4=0 on individuals).
- **HALT-0:** `Volumen_Rutas_Hub` === `Cargas_Flota_Hub` in value on **201/201** rows → same column under two names; c0's binding is **not** a wrong-column error.
- Individual metric rows carry the correct fleet columns `Cargas_Flota_Hub`(1092)/`Capacidad_Flota_Hub`(1105)/`Tasa_Utilizacion_Hub`(0.9882) → c4's correct value is on individual rows; the regression is a **convergence mis-binding** (name-similar hub columns won the semantic match), **not** hub-unreachability. → Phase 3 (hub fallback) cancelled; c4 = binding correction (architect SQL).
- Persisted bindings confirmed: c1 `on_time_deliveries→Entregas_Tiempo`, `total_deliveries→Entregas_Totales` (correct, individual); c4 `cargas_totales_hub→Cargas_Totales`, `capacidad_total_hub→Capacidad_Total` (hub-only, wrong).

## Phase 2 — the fix
**Root cause (precise):** `intent-constructor.ts buildConstantWithScale` attaches `ConstantScaleMeta` only for `scale.side === 'evaluator'`; for `'convergence'` it omits the meta (HF-244 mutual exclusion — assumes the convergence binding's `scale_factor` normalizes the single bound column). For a **ratio-keyed band** the key is a `divide` over two raw columns computed **in-DAG**, so no single binding carries the factor → the 0–1 quotient is compared against percent breakpoints (85–98) and floors every entity to 0.

**Change (`web/src/lib/plan-intelligence/intent-constructor.ts`):** `buildConstantWithScale` now attaches the scale meta when `scale.side === 'convergence'` **and** the other side of the compare is a ratio. The ratio flag is threaded structurally from the banded-lookup and conditional callers (`reference_source?.type === 'ratio'`). The evaluator's existing OB-200 single compare-site reconciliation then multiplies the quotient onto the breakpoint units. Korean Test: structural type check only — no field name, no breakpoint, no component name. `compositional_intent` schema unchanged (DD-7). Evaluator unchanged.

**EPG-2 — build:** `[korean-test-gate] PASS` · `✓ Compiled successfully` · `tsc --noEmit` exit 0.

## Phase 2 verification (deterministic, on REAL persisted compositional_intent)
`scripts/hf274-scale-verify.ts` runs the fixed `constructTree` on Meridian's persisted c1/c0 `compositional_intent` and evaluates with real sample metrics:
```
==== c1 Entrega a Tiempo ====   declared scale: {side:"convergence",unit:"percent",value:100}
OLD persisted DAG rawOutcome = 0
NEW constructed DAG: breakpoint carries meta.scale=100 → rawOutcome = 700
PASS c1: OLD DAG floors to 0 (the defect)
PASS c1: NEW DAG breakpoint carries meta.scale (fix applied)  scale=100
PASS c1: NEW DAG rawOutcome is NON-ZERO  newVal=700

==== c0 Rendimiento de Ingreso ====   declared scale: {side:"evaluator",unit:"percent",value:100}
OLD persisted DAG rawOutcome = 2100
NEW constructed DAG → rawOutcome = 2100   (no change)
PASS c0: NEW DAG constructs (DD-7 — no scale meta where not a convergence-ratio key)
PROOF: 4/4 assertions pass, 0 fail.
```

**Finding correcting the directive's premise:** c0's scale is **evaluator-side** and already applied — c0 computes **2100 (non-zero)** before and after Phase 2. Phase 2 **fixes c1** (0 → 700); **c0 is unchanged** (DD-7) and was not a scale defect. If c0's three-period total still misreconciles vs GT, that is a separate matter (its binding/axis), not the scale fix.

## ⚠️ Sequencing requirement for production verification
`constructTree` runs at **interpretation time**. The calc path reads the **persisted** `metadata.intent`/`calculationIntent` (`run/route.ts:2396`), not a fresh `constructTree`. Therefore:
- The persisted Meridian c1 DAG is **still** the unscaled one (rawOutcome 0) until Meridian is **re-interpreted**.
- A binding-only SQL patch (as planned for c4) is **insufficient for c1** — the c1 fix is in DAG construction, not the binding.
- **The architect's three-period verification must run after a Meridian cold re-import (fingerprints wiped)** so the persisted c1 DAG picks up `meta.scale`. A plain re-calc on the current persisted intent will still show c1=0 (false negative).
- Order: merge Phase 2 → **re-import Meridian (cold)** → c4 binding SQL → three-period reconciliation. (c4 re-import note: re-derivation will re-bind c4 to the hub columns again, so the c4 SQL correction should follow the re-import.)

## Standing-rule compliance
| Rule | Status |
|---|---|
| Korean Test (no field/component/tenant literals) | PASS — structural `reference_source.type === 'ratio'` only |
| DD-7 (schema unchanged; evaluator-side + non-ratio keys identical) | PASS — c0 2100→2100; only convergence-ratio keys gain meta |
| AP-17 (single code path) | PASS — reuses OB-200 evaluator meta.scale; no parallel scale path |
| Decision 158 (construct consumes declared scale) | PASS |
| SR-34 (close at class) | PASS — any convergence-scaled ratio key, any tenant |

## Residuals
- **c4:** convergence-binding-quality defect (name-similar hub-only column won over the individual fleet column). Interim: architect SQL re-binds `cargas_totales_hub→Cargas_Flota_Hub`, `capacidad_total_hub→Capacidad_Flota_Hub`. Enduring: a convergence-quality HF that prefers columns present on the calculation population's rows over columns only on excluded rows (separate scope).
- **c0:** not a scale defect; computes 2100. If its total misreconciles, investigate its hub-volume axis separately.
- **Re-interpretation governance:** the June-8 re-derivation replaced passing bindings without versioning (architect §6A residual).
