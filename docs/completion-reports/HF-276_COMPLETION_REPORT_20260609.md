# HF-276 Completion Report — Evaluator-Side Scale Reconciliation in constructTree

**Date:** 2026-06-09
**Branch:** `hf-276-evaluator-scale`
**Tenant of record:** Meridian Logistics Group, rule_set `a1b8684e-272a-4d95-8a97-71b39e217d08`

---

## Commits
| SHA | Subject |
|---|---|
| `bf62abe7` | Phase 1: ADR |
| `fa59b408` | Phase 2: constructTree pre-multiplies evaluator-side ratio-keyed breakpoints by scale.value |
| (verify) | Phase 3: deterministic verification on real persisted c0 + BCL-pattern guard |

---

## Phase 0 — read (corrected)
Initial read was against the **wrong variant** (flattened index 0 = `coordinador-senior`, which recognized `{evaluator, ratio, value:1}` — already commensurate). The defect is on the **payee variant `coordinador`** (architect SQL via `variants->1`):
```
coordinador "Rendimiento de Ingreso":
  compositional_intent.scale = {side:"evaluator", unit:"percent", value:100}
  dim[0] breaks = [0.8, 0.9, 1.0, 1.3]   (ratio space)
  constructed outermost compare constant = 1.3, meta.scale = 100
```
OB-200 evaluator scales the ratio ×100 (1.1031 → 110.31); compared against ratio-space breaks (`≥1.3` true) → forced top tier → overpay.

## Phase 1 — ADR
`HF-276_ADR.md` — Option A (pre-multiply breakpoint by `scale.value`), symmetric with HF-274's convergence-side fix. Option B (remove evaluator scaling) rejected.

## Phase 2 — implementation (`intent-constructor.ts buildConstantWithScale`)
When `scale.side === 'evaluator'` AND the other side is a ratio, emit the breakpoint as `value × scale.value` (keeping `meta.scale`), moving it into the scaled comparison space. `scale.value === 1` → ×1 no-op (DD-7). Convergence-side untouched (HF-274). Korean Test: structural `scale.side` + ratio-key check; the multiplier is the recognizer's own `scale.value`, no developer literal.

**Build:** `[korean-test-gate] PASS` · `✓ Compiled successfully` · `tsc --noEmit` exit 0.

## Phase 3 — verification (deterministic; `scripts/hf276-evaluator-scale-verify.ts`)
Real `constructTree` + `evaluate` on the persisted c0 intents (sample metrics `{actual_income:393346, income_goal:356580, hub_loads_per_month:1083}` → 110.31% attainment, ≥1000 volume):
```
variant "coordinador-senior"  scale {evaluator, ratio, value:1}
  OLD persisted DAG = 1600   NEW = 1600   dim0 breaks [0.8,0.9,1,1.3]   (×1 no-op, DD-7)
variant "coordinador"          scale {evaluator, percent, value:100}
  OLD persisted DAG = 450     NEW = 300    dim0 breaks now [80,90,100,130]   (top tier → ≥100% tier)
BCL-pattern guard (synthetic evaluator-side ratio band, PERCENT breaks 85/90/95):
  pre-multiply → [8500,9000,9500]  ⚠️ double-scaled (pattern ABSENT from Meridian)
PROOF: 4/4 assertions pass.
```
(Tier direction matches the directive — top tier → ≥100% tier. Absolute cell values are 450→300 from the real outputs matrix, not the directive's illustrative 1050→800; architect reconciles values vs GT.)

## ⚠️ BCL double-scale residual (§6A) — REQUIRES architect attention before relying on BCL
The fix assumes evaluator-side ratio-keyed breakpoints are in **ratio space** (need ×`scale.value`). If an evaluator-side ratio band instead emits breakpoints **already in percent space** (e.g. 85) with `value:100`, the pre-multiply **double-scales** them (85 → 8500), flooring every entity. The verification's BCL-pattern guard demonstrates this.

- **Meridian:** safe — both c0 variants emit ratio-space evaluator breaks (`0.8`); convergence-side c1 emits percent breaks (`85`) and is untouched by HF-276.
- **BCL:** has **no rule_set at this time** (not yet re-imported) → cannot be verified live. **BCL's first post-import calc must be checked** for any evaluator-side ratio-keyed band whose breaks are already percent-space before relying on its $312,033 anchor. If such a band exists, this fix would regress it and a space-detection refinement would be required (the §6A "detect whether constants are already scaled" requirement — which has no Korean-Test-clean magnitude-free form; it would need a recognizer-emitted space signal).

## Standing-rule compliance
| Rule | Status |
|---|---|
| Korean Test | PASS — structural scale.side + ratio-key; multiplier = recognizer's scale.value |
| Decision 158 | PASS — construction consumes the LLM's declared scale metadata |
| AP-17 | PASS — extends buildConstantWithScale; no parallel path |
| DD-7 | PASS for Meridian — scale.value 1 no-op; convergence-side unchanged; coordinador-senior OLD==NEW. **BCL non-regression UNVERIFIED (no rule_set)** — see residual |
| SR-34 | PASS — any evaluator-side ratio-keyed band |

## Residuals
- **BCL double-scale (above)** — verify at first post-import calc.
- **Full Meridian Q1 reconciliation** — architect-channel after cold re-import picks up HF-276 (re-interpretation required; the calc reads the persisted DAG, so c0 stays at its current values until Meridian is re-interpreted with HF-276 in the build).
