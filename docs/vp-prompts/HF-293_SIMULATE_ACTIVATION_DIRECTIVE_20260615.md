# HF-293 — SIMULATE IS DISABLED (ADMIN/MANAGER) AND ABSENT (REP): activation fix

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-15 (architect channel)
**Type:** HF — the Simulate control shipped wired (#515) but renders DEAD on production: disabled for admin/manager, absent for rep. Root cause is NOT the wiring (that's correct) — it's the activation condition. Three root causes, three fixes. This is a real fix, not a re-verification.
**Number:** HF-293 — highest HF on main is 292 (the routing fix, merged in WS-1); next free is 293 (verified from repo). **Collision gate:** CC runs `git log --all | grep -iE 'HF-293'`; if match, HALT.
**Branch + PR:** `hf-293-simulate-activation` → main, architect-SR-44-gated. tsc --noEmit before push.
**Gate:** #515 on main (`28d7517e`) — confirmed.
**Architect-reported (production):** "The Simulate button is not active in Admin, Manager and there is no representation on the Rep view."

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: AP-25 (Korean Test), SR-34 (fix at root — the activation condition; do not loosen the access scope), SR-38 (any simulated value traces to the engine payout — the #515 dollar-anchoring stays), SR-39 (the access scope MUST hold — a rep still simulates only self, a manager only team), SR-41, SR-42, SR-43, SR-44. Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Leverage, do not create:** the wiring, the access-scoping, the PopulationWhatIf, the dollar-anchoring all EXIST and are correct (#515). This HF fixes WHEN the control activates and adds the rep-own path. Do NOT rebuild the simulate machinery; do NOT loosen the access scope (HALT-GENERAL / HALT-SCOPE).

AUTONOMY: NEVER ask yes/no. Act. tsc --noEmit before push. Git from repo root.

**Reconciliation-channel separation:** No ground-truth values.

---

## §1 — THE THREE ROOT CAUSES (code-verified, on main)

**RC-1 — Admin/Manager disabled: the tier-less structural fallback is reaching the button.**
`intelligence-stream-loader.ts:759` — "Structural fallback: if no tier-based opportunities found, generate component-level insights" — pushes opportunities with `costImpact: 0` and **no `tiers`/`boundary`** (line 772, "N entities with zero payout"). When the loaded period has no entities within 5% of a tier boundary (the tier-based path, line 742, doesn't fire), these tier-less fallback opportunities are what render. `OptimizationCard:70` `hasModel = !!opp.tiers && opp.tiers.length > 0 && entities.length > 0 && opp.boundary != null` → false → `disabled` (line 96) with tooltip "Simulation needs tier data" (line 98). **The button is correctly disabled for tier-less opportunities — but that's ALL the user sees when the data has no near-boundary population.**

**RC-2 — Rep absent: the card only renders for a population, and a rep is a population of one.**
`stream/page.tsx:823` (IndividualStream) renders `OptimizationCard` only `if (data.optimizationOpportunities.length > 0)`. The rep's opportunities are computed over `[myResult]` (loader:595) — a population of one, which rarely has a near-boundary *population*, so the array is empty and the card never renders. There is NO rep-own simulate affordance anywhere (no WhatIfSlider on the statement page or IndividualStream). **A rep modeled as a population opportunity gets nothing.**

**RC-3 — Fragility: the whole feature is gated on near-boundary populations existing.**
Both the tier-based opportunity (5%-of-boundary) AND the card's render are conditional on opportunities existing. If the demo period has nobody in a 5% band, Simulate is dead everywhere — correctly per the logic, uselessly for the demo.

---

## §2 — THE THREE FIXES

### FIX-1 (RC-1) — don't let the tier-less fallback mask simulatable opportunities; and make the disabled state honest about WHY
Two parts:
1. **Verify the tier-based path can fire on the demo tenant.** Trace, on the live BCL/demo period: does `computeOptimizationOpportunities` find ANY entity within 5% of a tier boundary (loader:720-738)? If the demo data genuinely has near-boundary entities, the tier-bearing opportunities SHOULD be created — confirm they are, and that they (not the fallback) reach the card. If the tier-based opportunities exist but are being OVERWRITTEN or out-ranked by the fallback, fix the ordering so tier-bearing opportunities render first/instead.
2. **If a period legitimately has tier-bearing opportunities, the button activates (hasModel true).** This is the admin/manager fix — when real near-boundary opportunities exist, the button is enabled and opens the PopulationWhatIf (existing, #515). **SR-39:** the scope stays — manager sees only team opportunities (the loader already scopes to teamResults).

**HALT-DATA:** if the demo period genuinely has ZERO entities near any tier boundary (so no tier-based opportunity can exist for anyone), report it — the demo may need a period/tenant where near-boundary entities exist, OR FIX-3 (the unconditional rep-own path) becomes the primary simulate affordance. Do NOT fabricate a near-boundary opportunity.

### FIX-2 (RC-2) — give the rep their OWN simulate affordance (not a population opportunity)
A rep simulating "their own context" should NOT depend on being near a tier boundary. Add a rep-own WhatIfSlider to the Individual view (the statement surface `perform/statements/page.tsx` and/or IndividualStream): the rep sees a what-if on THEIR OWN current value→payout, using THEIR component's tiers (the single-entity `WhatIfSlider`, already built, with the #515 dollar-anchoring `sf = currentPayout / calculatePayout(value, tiers)`). This renders for the rep UNCONDITIONALLY (whenever their component has tiers), independent of near-boundary populations. **SR-39/HALT-4:** the rep simulates only THEIR OWN entity — never another's. **Korean Test:** tiers from the rep's plan grammar, no domain literals.

**HALT-REP-TIERS:** the rep's own component has no tiers (a regime-1 volume component, no tier structure to slide through). Then a what-if isn't meaningful for that component — show the rep's trajectory/earnings instead (existing), and reserve the slider for tiered (regime-3) components. Do NOT show a slider with no tiers.

### FIX-3 (RC-3) — make Simulate robust for the demo: the rep-own path (FIX-2) is the unconditional affordance
With FIX-2, the rep always has a simulate affordance on tiered components regardless of boundary proximity. For admin/manager, the population Simulate activates when real near-boundary opportunities exist (FIX-1). The combination means Simulate is demonstrable: the rep simulates their own trajectory always; the manager/admin simulate the team/population opportunity when one exists. **If the demo wants admin/manager to ALWAYS have a simulate affordance** (not only when near-boundary populations exist), that is an architect decision (HALT-DATA surfaces it) — the honest default is: population Simulate when there's a population to act on; rep-own Simulate always.

---

## §3 — GATES + VERIFY

### 3.1 Re-verify (the reported symptom flips)
- Admin/Manager: when the demo period has near-boundary entities, the Simulate button is ENABLED (not disabled) and opens the PopulationWhatIf scoped to the persona's set. Trace the tier-bearing opportunity reaching the card with `hasModel` true.
- Rep: the Individual view shows a rep-own WhatIfSlider on their tiered component (unconditional, dollar-anchored, self-scoped). Screenshot.
- The tier-less fallback opportunities, if shown, are honestly disabled with the "needs tier data" tooltip — but they no longer MASK tier-bearing opportunities (FIX-1 ordering).

### 3.2 Adversarial sweep (the dimensions that bite — access stays elevated)
- **access-correctness (ELEVATED):** the rep-own slider simulates ONLY the rep's own entity; the manager population stays team-scoped. A rep cannot, via FIX-2, simulate another entity. Verify scope holds (the #515 lesson).
- **SR-38 dollar-anchoring:** the rep-own slider uses `sf = currentPayout / calculatePayout(value, tiers)` so at-rest delta = 0 and projections are real dollars (the #515 fix, applied to the rep path).
- **right-by-luck:** the activation works beyond BCL's specific data shape.
- **Korean Test, scale:** standard.
Every HIGH fixed + re-verified.

### 3.3 Build
tsc --noEmit → 0. `npm run build` exit 0. localhost:3000.

### 3.4 Proof gates (rendered + source)
| PG | PASS |
|---|---|
| ADMIN/MGR-active | with near-boundary entities present, Simulate is ENABLED for admin/manager and opens PopulationWhatIf (team-scoped for manager). Trace + screenshot. |
| REP-present | the rep's view shows a rep-own WhatIfSlider on their tiered component, unconditionally; dollar-anchored (delta=0 at rest). Screenshot. |
| FALLBACK-honest | tier-less fallback opportunities are disabled w/ tooltip and do NOT mask tier-bearing ones (ordering). |
| ACCESS | rep-own slider scoped to self; manager population team-scoped; no cross-entity leak (SR-39). |
| SR-38 | rep slider + population projection trace to engine payout via sf-anchoring. |
| Build | tsc 0 + build exit 0. |
| SR-44 | architect confirms: admin/manager Simulate active (with near-boundary data), rep sees their own simulate. |

### 3.5 PR
```bash
gh pr create --base main --head hf-293-simulate-activation \
  --title "HF-293: Simulate activation — admin/manager enabled with near-boundary opportunities; rep-own slider added" \
  --body "Simulate shipped wired (#515) but rendered dead on production: disabled for admin/manager, absent for rep. Root cause is the activation condition, not the wiring. RC-1: the tier-less structural fallback (loader:759, costImpact 0, no tiers) reaches the card when no near-boundary population exists → hasModel false → disabled; fix ensures tier-bearing opportunities (when they exist) reach the card and the button activates. RC-2: IndividualStream renders the card only for a population, but a rep is a population of one → empty → no card; fix adds a rep-OWN WhatIfSlider (unconditional on tiered components, self-scoped, #515 dollar-anchored). RC-3: the feature was gated on near-boundary populations; the rep-own path makes Simulate demonstrable independent of boundary proximity. Access scope unchanged (rep=self, manager=team — SR-39 verified). SR-44: admin/manager Simulate active with near-boundary data; rep sees their own simulate."
```

---

## §4 — HALT CONDITIONS
- **HALT-GENERAL:** about to rebuild the simulate machinery or loosen the access scope. STOP — the machinery is correct (#515); fix only activation + the rep-own path.
- **HALT-DATA:** the demo period has ZERO near-boundary entities (no tier-based opportunity possible for anyone). Report — the rep-own path (FIX-2) still works; admin/manager population Simulate needs a period/tenant with near-boundary entities, OR the architect rules whether admin/manager need an always-on affordance. Do NOT fabricate an opportunity.
- **HALT-4:** a rep can't be resolved to exactly their own entity for the rep-own slider. Report; never show a rep another entity's slider.
- **HALT-REP-TIERS:** the rep's own component has no tiers (regime-1). Show trajectory/earnings, not an empty slider.
- **HALT-SCOPE:** the rep-own slider or population scope can't be enforced at the data boundary. Report; scope must hold (confidentiality).
- **HALT-LOCKED:** any locked rule conflicts. Surface verbatim per SR-42.

---

## §5 — REPORTING
`docs/completion-reports/HF-293_COMPLETION_REPORT_20260615.md` — the three RCAs (code-traced), the three fixes, re-verify evidence (admin/manager active, rep present), the SR-39 access verification, the SR-38 dollar-anchoring on the rep path, SHA, build+tsc, PR URL. Confirm: machinery not rebuilt, scope not loosened; only activation + rep-own path changed.

```
ARTIFACT SYNC
MC: Simulate dead-on-production (disabled admin/mgr, absent rep) → RCA'd (activation condition, not wiring) + FIXED (tier-bearing opportunities activate the button; rep-own slider added). Pending SR-44.
REGISTRY: "Access-Scoped Simulate" → now activates correctly: population (admin/mgr, when near-boundary opportunities exist) + rep-own (unconditional on tiered components). The #515 wiring + scope + dollar-anchoring confirmed correct; activation + rep path fixed.
R1: Tier-C "Simulate is live across personas" → admin/mgr active with data, rep always; pending SR-44.
BOARD: Decide (Simulate activates per persona).
SUBSTRATE: the activation condition fixed (tier-bearing > tier-less fallback ordering); rep-own simulate affordance added (single-entity WhatIfSlider, #515 dollar-anchored, self-scoped); access scope unchanged + re-verified; machinery leveraged not rebuilt.
```
