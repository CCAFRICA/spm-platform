# OB-211 Phase D — Simulate Regime Convergence: Completion Report

**Date:** 2026-06-15 · **Branch:** `ob211-phaseD-simulate-regime` · **Gate:** Phase A (#520) on main. · **The strategic phase — not deferred.** Simulate now derives the actionable what-if from component **structure** (the #508 regime classifier), so it is **live on BCL's regime-2 plans** (Colocación/Captación) where it was dead.

## The divergence (verified) → the convergence
Simulate keyed on `parseTiers` ("is there a tiers array") at the loader's two Simulate sites → dead on regime-2 components (attainment, no tier gate). The opening fan-out confirmed `classifyComponentRegime` is a **clean call** from the loader (the `ComponentDef` index signature admits `metadata.intent`; same `rule_sets.components` source — proven by `/operate/results` already classifying BCL's regimes). So Phase D is a **convergence onto the existing classifier** (SR-34: one structural signal), not a new build.

## The model (regime → actionable what-if)
- **Regime 3** (gating/tierStructure) → **cross-the-boundary** — the tiered slider (HF-293). **UNCHANGED.**
- **Regime 2** (target tracked, no tier gate) → **close-the-target-gap** (NEW): lift attainment toward 100% to recover the amount left on the table. The lever is the gap; the action is "coach on attainment." **Live on BCL.**
- **Regime 1** (no target) → **no slider** (honest absence; the volume/relative action lives elsewhere).

## The convergence (both Simulate sites — no partial convergence)
**The signal per what-if type** (post-sweep): a **tier structure** (`parseTiers ≥ 2`) is the signal for cross-the-boundary (tiered slider — preserves HF-293 for any tiers-bearing component, no regression); **regime 2 without a tier gate** is the signal for close-the-gap (the case `parseTiers` missed — the bug); regime 1 → none.
- **Rep path (loader `buildRepData` selfSimulations → `SelfSimulateCard`):** tier structure → `WhatIfSlider`; regime-2-no-tiers → new `GapWhatIf`. `selfSimulations` carry `kind: 'tiered'|'gap'`.
- **Population path (loader `computeOptimizationOpportunities` → `OptimizationCard`):** tier structure → the tier-boundary opportunity (`kind:'tiered'`); regime-2-no-tiers → the **close-the-gap opportunity** (`kind:'gap'`, below-target entities); regime-1 → none. The dead "zero payout" structural fallback is **replaced** by the regime-2 gap opportunity (BCL's "zero payout" components are regime-2 — the actionable lever is the gap). Single entity → `GapWhatIf`; group → new `PopulationGapWhatIf`.
- The remaining `parseTiers` sites (coaching, tier-position display, allocation) are **not Simulate** — correctly left tier-based (the fan-out confirmed only the two sites are Simulate proper).

## SR-38 — the regime-2 gap math (the dimension that bit three times)
The projection is a **straight-line scaling from the engine's REAL payout** — `projected(newAtt) = currentPayout × (newAtt / value)` — so at the current attainment (`newAtt = value`) `projected = currentPayout`, **delta = 0 at rest**. It is dollars (scaling the real payout), not attainment×rate (the #515 bug class). Consistent across all three: `GapWhatIf` (rep), `PopulationGapWhatIf` (aggregate, capped at target), and the loader's `costImpact` (`comp.payout × (100/att) − comp.payout`). **HALT-SIM honesty:** only rendered where `value>0 & 0<att<100 & payout>0` (the anchor holds); where it can't anchor, no dollar is shown (the component is skipped). `attainmentFields` null does **not** block it — the projection uses the engine's `comp.attainment` directly.

## Re-verify
- Both Simulate sites route on `classifyComponentRegime` (loader `:609`/`:750`); no Simulate site left on the `parseTiers` gate.
- `npx tsc --noEmit` → **0**; `npm run build` → **exit 0, ✓ Compiled successfully**.

## Adversarial sweep (SR-38 ELEVATED) — SR-38 CLEAN · 1 HIGH + 2 MEDIUM fixed at root

- **SR-38 regime-2 gap math (ELEVATED) — PASS, no findings.** The projection is genuinely dollar-anchored to the real engine payout, **exact delta=0 at rest** across all three (`GapWhatIf`, `PopulationGapWhatIf`, loader `costImpact`), all algebraically the same `payout × (target/att − 1)` family, all dimensionally **dollars** (the structural opposite of the #515 bug). All edges guarded.
- **Korean Test — PASS.** Both Simulate sites route structurally; the non-Simulate `parseTiers` sites (coaching/display/allocation) correctly stay tier-based.

**HIGH (FIXED at root) — the feature was dead in production.** Per-component `attainment` is **never persisted** on the result component object (the engine writes it to the metrics map / the entity summary) → the gap guard `comp.attainment == null → skip` skipped **every** component → zero output. **Fix:** `comp.attainment ?? extractAttainment(result.attainment)` (the entity-level fallback — the **same resilience the tier-boundary path uses**, loader:815) at both gap sites → the what-if fires in production. Re-verify: `tsc` 0, `build` 0.

**MEDIUM (FIXED) — regression: a tiered component could lose its slider.** Routing tiered on `regime===3` only would drop the tiered slider for a tier-structure component that classifies non-regime-3 (a tier table ≠ a gating-divide intent). **Fix:** route **tiered on the tier structure** (`parseTiers >= 2` → tiered, any regime) and **gap on regime-2 without tiers** — the right structural signal for each what-if; preserves every tiered slider (no regression) while activating regime-2 (the goal). This refines the model below.

**MEDIUM (FIXED) — scale floor.** The gap assumes the normalized percentage scale (target=100). **Fix:** `att >= 1` floors the `100/att` recover multiplier against degenerate near-zero attainment; `payout > 0` holds the dollar anchor.

**SR-39 — CLEAN:** the population gap entities inherit the proven persona-scoped sets (manager=teamResults, rep=self, admin=full) — no cross-scope leak.

## Gates
- HALT-GENERAL honored: converged onto the **existing** classifier (no parallel signal); composed the existing sliders + two thin gap siblings.
- SR-34: one structural signal (the regime), not a `parseTiers`-vs-regime divergence. Korean Test: the router is the regime, no tiered-only literal.
- SR-44 (render): on BCL, a **regime-2 component shows the close-the-gap what-if** (rep statement + admin/manager opportunity); a regime-3 component shows the tiered slider (HF-293 intact); a regime-1 component shows no fake slider — architect confirms on the live tenant.

---

*OB-211 Phase D · 2026-06-15 · Simulate derives the actionable what-if from component regime — live on BCL. The strategic co-phase, executed not deferred.*
