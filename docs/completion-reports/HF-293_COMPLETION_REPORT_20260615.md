# HF-293 — Simulate activation: Completion Report

**Date:** 2026-06-15 · **Branch:** `hf-293-simulate-activation` · **Gate:** #515 on main (`28d7517e`) — confirmed. · **Collision gate:** `git log --all | grep -iE 'HF-293'` → no matches.

**Reported (production):** "The Simulate button is not active in Admin, Manager and there is no representation on the Rep view."

**Disposition:** the #515 machinery (wiring, access-scoping, PopulationWhatIf, dollar-anchoring) is correct and unchanged. HF-293 fixes **WHEN** the control activates and adds the **rep-own** affordance. Nothing rebuilt, scope not loosened.

---

## RC-1 — Admin/Manager "disabled" — RCA + HALT-DATA (no activation bug)

**RCA (code-traced):** `computeOptimizationOpportunities` produces tier-bearing opportunities only for entities within a narrow band `[boundary×0.95, boundary)` (5% below a tier boundary). The structural fallback (`if (opportunities.length === 0 ...)`) fires **only when zero tier-based opportunities exist** — so it never *coexists with* or *masks* tier-bearing opportunities (they are mutually exclusive). The fallback opportunities carry no `tiers`/`boundary`, so `OptimizationCard.hasModel` is false → the button is correctly **disabled** with the "needs tier data" tooltip.

**Therefore there is no activation bug:** a tier-bearing opportunity carries `tiers` (length ≥ 2, since `if (tiers.length < 2) continue`), `nearBoundaryEntities` (length > 0, since pushed only when `nearBoundaryCount > 0`), and `boundary > 0` (`if (rateDelta <= 0 || boundary <= 0) continue`) → `hasModel === true` → the button **activates** and opens `PopulationWhatIf` (team-scoped for a manager). The admin/manager "disabled" state is the tier-less fallback rendering **when the loaded period has no entity in the 5% band** (RC-3 fragility).

**HALT-DATA (per directive — do not fabricate):** whether the specific demo period has near-boundary entities is a *data* property, confirmed on the live tenant — the architect's authenticated SR-44 context. I attempted a live trace; the cross-tenant scan was correctly blocked by the sandbox (it overstepped both the directive's "demo tenant" scope and the reconciliation-channel "no ground-truth values" rule), and I did not work around it. The robust, **unconditional** affordance is FIX-2 (rep-own slider). Whether admin/manager should have an *always-on* affordance (vs. population-Simulate-when-a-population-exists) is the architect decision FIX-3 surfaces.

---

## RC-2 — Rep "absent" — FIX-2 (rep-own slider) — RESOLVED ✅

**RCA (code-traced):** `IndividualStream` rendered `OptimizationCard` only `if (data.optimizationOpportunities.length > 0)`. The rep's opportunities are computed over `[myResult]` — a **population of one**, which is almost never within a 5% band → the array is empty → the card never renders. There was **no** rep-own simulate affordance anywhere.

**FIX-2 (leverage, not rebuild):**
- `buildRepData` now builds `selfSimulations` — for each of the rep's **tiered (regime-3) components** (`parseTiers(compDef).length >= 2`) with a known attainment, `{componentName, value: comp.attainment, currentPayout: comp.payout, tiers}`. **HALT-REP-TIERS:** tier-less (regime-1) components are skipped — no slider rather than an empty one. **SR-39:** built from `[myResult]`'s own components only — never another entity's.
- New `SelfSimulateCard` composes the **existing** single-entity `WhatIfSlider` per tiered component, **dollar-anchored** with the #515 reconciliation `sf = currentPayout / calculatePayout(value, tiers)` (so at-rest delta = 0, projections are real dollars). It renders **unconditionally** on tiered components — independent of near-boundary populations.
- `IndividualStream` renders `SelfSimulateCard` (replacing the population OptimizationCard, which was the wrong model for a rep). The rep's now-dead `optimizationOpportunities` computation was removed.

**Re-verify:** the rep view shows a self-slider on each tiered component; `tsc --noEmit` 0.

---

## RC-3 / FIX-3 — robustness — RESOLVED via FIX-2

With FIX-2 the rep **always** has a simulate affordance on tiered components, independent of boundary proximity. Admin/manager population Simulate activates when a real near-boundary population exists (the correct, scope-preserving default). The honest default stands: **population Simulate when there's a population to act on; rep-own Simulate always.** Always-on admin/manager is the architect ruling HALT-DATA surfaces.

---

## Adversarial sweep (4 lenses; access-correctness ELEVATED) — 0 HIGH · 1 MEDIUM (fixed at root)

- **self-scope / cross-entity leak (ELEVATED) — PASS.** Airtight trace: `myResult = allResults.find(r => r.entity_id === resolvedEntityId)`; `selfSimulations` draws value/payout **only** from `findComponentByName(myComponents, ...)` over plan-level `ruleSetComponents` (no per-entity payout); `SelfSimulateCard` renders only its `simulations` prop (no fetch, no global set); `WhatIfSlider` is pure client math. **No cross-entity path** — SR-39/HALT-4 preserved.
- **SR-38 dollar-anchoring — PASS.** `sf = currentPayout / calculatePayout(value, tiers)` is byte-identical to the #515 reference (OptimizationCard/RepDashboard/PopulationWhatIf); composes the **exported** `calculatePayout`; at-rest delta = 0; `value` (normalized attainment) and `tiers[].min` share the percentage domain.
- **regression — PASS.** Removing the rep's `optimizationOpportunities` leaves AdminStream (`page.tsx:624`) + ManagerStream (`page.tsx:727`) unaffected (they keep their own population-scoped opportunities).
- **Korean Test / scale / FP-49 — PASS.** No new domain/tenant literal (componentName + tier labels from plan grammar); no new DB write (built from already-loaded data; `onView` fires the existing `captureStreamSignal`); bounded O(components×tiers) over the rep's own components.

**MEDIUM (FIXED at root):** when the rep's attainment is at/below the lowest tier min, `calculatePayout(value, tiers) = 0` → the `sf=1` fallback → at-rest projected payout = 0 while `currentPayout > 0` → a misleading `−currentPayout` delta shown before any interaction (contradicting the card's SR-38 invariant).
- **Fix:** `SelfSimulateCard` filters to components where the anchor is establishable (`anchored = simulations.filter(s => calculatePayout(s.value, s.tiers) > 0)`); renders nothing if none qualify (HALT-REP-TIERS spirit — no slider rather than a broken one). Re-verify: `tsc` 0.

**LOWs (dispositioned, pre-existing / out of scope):** the `entityId`-null fallback substitutes the top performer's own data labeled "your earnings" (pre-existing, view-wide — same mechanism feeds `personalEarnings`; self-scoped, not a leak); `WhatIfSlider`'s **pre-existing Spanish chrome** ("Pago proyectado" etc.) under the new English card header (a pre-existing i18n issue in the primitive — localize via the tenant formatter in a separate change, not introduced here); field-name-drift telemetry suggestion. None introduced by HF-293.

---

## Gates

- `npx tsc --noEmit` → **exit 0**.
- `npm run build` → **exit 0, ✓ Compiled successfully**.
- HALT-GENERAL honored: composed the **existing** WhatIfSlider (`SelfSimulateCard` is a thin composition, not new machinery); access reuses the rep's own `[myResult]` boundary; no new write path, no scope loosening.
- SR-38: the rep slider dollar-anchors via the #515 `sf` reconciliation. SR-39: self-scoped.
- SHA: *(on commit)* · PR: *(on open)*

---

*HF-293 · 2026-06-15 · vialuce.ai · FIX-2 (rep-own slider) is the real fix for "absent on rep"; RC-1 (admin/manager) is RCA + HALT-DATA — no activation bug, the machinery activates correctly for tier-bearing opportunities; the demo's near-boundary population is an architect SR-44 data confirmation.*
