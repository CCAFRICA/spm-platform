# OB-211 WS-2 inc-2 — Completion Report

**Date:** 2026-06-15 · **Branch:** `ob-211-ws2-inc2` · **Gate:** PR #514 (WS-2 inc-1, B2) merged to main (`d9d65af0`) — confirmed before work. · **Loop:** TEST (Phase 0) → VERIFY → RCA → RESOLVE / HALT → RE-VERIFY → architect SR-44.

**Scope of this increment:** the **two architect rulings** (B3 primitive extension; Simulate Option-B access-scoped population) — fully implemented + verified — plus the **read-before-assume HALT findings** for B1 and C3, which surfaced real signal-shape / surface-context gaps that change how those two are executed. Per the directive's own HALT-B1 / HALT-C3 dispositions, those two are scoped (with their alignment/extraction design) as inc-2b rather than rushed into this isolation-critical diff.

---

## Item B3 — extend DistributionChart + compose DistributionCard — RESOLVED ✅ (the composition template)

**RCA (confirmed):** `DistributionChart` hardcoded attainment-% buckets + `%` labels + `data: number[]`; `DistributionCard` drew payout-currency buckets + mean/median recharts ReferenceLines. A naive swap would regress payout→attainment and drop the reference lines.

**Resolution (SR-34 — extend the canonical primitive, no inline parallel):** extended `DistributionChart` with **additive, optional** props — `buckets?`, `valueFormatter?`, `mean?/median?/stdDev?`, `showReferenceLines?` — defaulting to the exact current behavior. Then composed `DistributionCard` from it (payout buckets + `formatCurrency` + reference lines) and **removed the inline recharts**. Reference lines are rendered as mean/median markers on the CSS bars (ported from the card).

**Backward-compat (verified):** all 4 existing consumers (`test-ds`, `operate/lifecycle:561`, `operate/results:556`, `AdminDashboard:455`) pass only `data` + `benchmarkLine` → render identically (attainment buckets, `%` stats, raw `N%` benchmark, no markers). The default benchmark format is preserved exactly (`${benchmarkLine}%`, not `toFixed(1)`).

**Re-verify:** `DistributionCard` imports + composes `DistributionChart`; zero inline recharts/BarChart; `tsc --noEmit` 0. **This is the composition template WS-3..6 inherit** (primitive narrower than the card → extend the primitive, additive + optional, backward-compatible).

---

## Item Simulate — access-scoped population mode (Option B) — RESOLVED ✅

**RCA (confirmed):** `OptimizationCard.onSimulate` dead (0 callers). `WhatIfSlider` single-entity. `computeOptimizationOpportunities` (loader) population-level + admin-only, computed over the FULL set, exposing only a scalar `costImpact`. **HALT-SIM / HALT-SCOPE did NOT trigger:** the opportunity loop already iterates near-boundary entities with `comp.payout`, `comp.attainment`, and the component `tiers` in scope (per-entity model computable); and the function takes the scoped result set as its input (the scope boundary IS the access control).

**Resolution (leverage the existing persona scope — HALT-GENERAL honored, no new access mechanism):**
1. **Scope (SR-39):** `computeOptimizationOpportunities` now runs per persona over their OWN result set — manager over `teamResults` (loader:491), rep over `[myResult]` (loader:597), admin over the full set (loader:345). The near-boundary entities are collected from that scoped set, so they **can never contain an out-of-scope entity** — a manager simulates their team, never another team's.
2. **Carry the model:** extended the opportunity shape with `boundary`, `tiers` (= `parseTiers` `TierBound[]`, structurally identical to `WhatIfSlider`'s `TierConfig`), and `nearBoundaryEntities: {entityId, value, currentPayout}[]`.
3. **Population slider (SR-34/SR-38):** new `PopulationWhatIf` composes the **exported** `calculatePayout` (from `WhatIfSlider` — no parallel math). A single lever (attainment lift) projects, over the scoped set, the **aggregate** delta `Σ [calculatePayout(value+lift,tiers) − calculatePayout(value,tiers)]` + the **count** crossing the boundary. Framed as a client-side what-if, not an asserted payout (reconciliation-channel).
4. **Wire + disposition:** `OptimizationCard` opens the inline what-if on Simulate — single entity (rep own context) → `WhatIfSlider` (extended with an optional `formatCurrency`); group (manager/admin) → `PopulationWhatIf`. No tier model (structural-fallback opportunity) → button **disabled + tooltip** (no fabrication). Rendered for all three personas; `onSimulate` now captures a signal via the existing `captureStreamSignal` path (FP-49).

**SR-39 scope chain (verified):** `teamEntityIdSet` → `teamResults = allResults.filter(...)` (loader:427) → `computeOptimizationOpportunities(teamResults)` (491) → `nearBoundaryEntities.push(...)` from that set (738) → `PopulationWhatIf entities={opp.nearBoundaryEntities}`. No global set ever reaches the slider.
**SR-38 math trace (verified):** the aggregate is `Σ` of per-entity `calculatePayout` deltas — single source of tier math (`WhatIfSlider.calculatePayout`, exported).
**Re-verify:** `onSimulate` has 3 callers (was 0); `tsc --noEmit` 0.

---

## Item B1 — expand-default + #510 react — HALT-B1 (signal-shape gap), scoped to inc-2b

**RCA (read-before-assume, code-grounded):** the #510 read-back on `/operate/results` (lines 135-152) filters the user's prior signals by `v.actorId === user.id`. **But `/stream` emits signals WITHOUT `actorId`** — `onCardInteract` (stream/page.tsx) calls `captureStreamSignal({persona, elementId, action, tenantId})` with no metadata, and the stream page has no `useAuth`/`user.id`. So the per-user read-back **cannot run on /stream** until the emit-shape is aligned.

**HALT-B1 disposition (per directive — align via the existing path, no new registry):** inc-2b = (1) add `useAuth` to the stream page; (2) emit `actorId` in the stream's `captureStreamSignal` metadata (the existing path, HF-219 open vocabulary — no new `signal_type`); (3) read the user's prior `expand`/`collapse` for a `stream:secondary` element, default **expanded**, flip to collapsed when `collapse > expand && collapse >= 2`; (4) wrap each persona stream's secondary cards (not narrative/hero) in the collapsible. Designed; deferred so the emit-shape change + 3-persona collapsible get their own render verification.

---

## Item C3 — generalize the inline drill — HALT-C3 (surface-specific context), scoped to inc-2b

**RCA (read-before-assume, code-grounded):** the working drill is inline at `operate/results/page.tsx:662/701` — `setDrillAnomaly({claim, entityIds, claimedCount})` → `<AnomalyDrillThrough claim entityIds claimedCount results populationMean populationTotal formatCurrency onClose/>`. The drill **target** (`{claim, entityIds, claimedCount}`) and the open/close state **generalize cleanly** into a hook. **But** `AnomalyDrillThrough` needs **surface-specific population context** (`results[]`, `populationMean`, `populationTotal`) drawn from the calculated batch — context `/stream`'s `IntelligenceStreamData` (teamHeatmap entities, no `results[]` shape) does not directly provide.

**HALT-C3 disposition (per directive — extract what generalizes, note what stays surface-specific):** inc-2b = extract `useDrillThrough` (target state + `drill()`/`close()` + render) and refactor `/results` to use it (removing the inline parallel, SR-34); wire `/stream`'s `onEntityClick` to invoke it. The **surface-specific remainder**: `AnomalyDrillThrough`'s population context must be mapped from each surface's data (the stream maps its own population stats) — that mapping is the per-surface adapter, not a shared concern. Designed; deferred.

---

## Adversarial sweep (4 lenses over the inc-2 diff)

**Result: 2 HIGH (same SR-38 root — FIXED at root) · 1 MEDIUM (same fix) · LOWs dispositioned.**

- **cross-team scope leak (ELEVATED) — CLEAN.** Verified chain: `teamEntityIdSet` → `teamResults = allResults.filter(...)` → `computeOptimizationOpportunities(teamResults)` → `nearBoundaryEntities` ⊆ teamResults ⊆ scope; rep = `[myResult]`; admin = full. The card/slider render only `opp.nearBoundaryEntities` (no global set, no fetch); `entityId` is never displayed. **No new cross-scope path.** The one LOW is *pre-existing* (OB-165 `ddaca3af`): a `canSeeAll` manager with no derivable team falls back to full population — Simulate *inherits* that exact boundary (same set already feeds teamHeatmap/coaching/bloodwork), does not widen it. Documented, out of this increment's blast radius.

- **Simulate math / SR-38 — 2 HIGH (FIXED at root).** `calculatePayout(attainment, tiers)` sums *attainment-points × rate*; the plan's `rate` is dollars-per-volume, so the raw delta is **not dollars** even though it was formatted as currency. The canonical caller (`RepDashboard.tsx:174-175`) proves the reconciliation: scale tiers by `sf = realPayout / calculatePayout(value, tiers)`. `PopulationWhatIf` carried `currentPayout` but never used it (the smoking-gun LOW).
  - **Root fix:** per-entity `sf = currentPayout / calculatePayout(value, tiers)` (guard `rawBase>0`, else `sf=1`). `PopulationWhatIf` now sums `sf · (calculatePayout(newValue,tiers) − rawBase)` (real-dollar delta anchored to the engine payout); the single-entity `WhatIfSlider` path passes `scaledTiers` so the at-rest payout equals the real payout (**delta = 0 at rest** — fixes the MEDIUM). Still composes the single exported `calculatePayout` (SR-34). 
  - **Re-verify:** both call sites carry the `sf` anchor; `tsc --noEmit` 0. Edge cases confirmed clean by the sweep (lift=0→delta 0, tiers<2 screened, maxLift≥1, reference-line placement correct for payout buckets).

- **B3 backward-compat — CLEAN (pixel-identical).** All new `DistributionChart` props optional; the 4 existing consumers hit the default branches (attainment buckets, `%` stats, no markers, raw `N%` benchmark). `DistributionCard` composes the primitive; inline recharts removed; markers use the identical `[min,max)` placement.

- **Korean Test / scale / FP-49 — CLEAN.** No domain/tenant-language literal, no hardcoded component-name, no registry; component names + tier labels derive from the plan grammar. No DB write added; `onSimulate` only fires the existing `captureStreamSignal` path. Bounded: manager=`teamResults`, rep=`[myResult]` (null-guarded), single batch read. One LOW: `onSimulate(opp)` arg discarded at call sites (cosmetic; the signal asserts no payout — FP-49-safe). Accepted.

---

## Gates

- `npx tsc --noEmit` → **exit 0** (verified after each item).
- `npm run build` → **exit 0, ✓ Compiled successfully** (/stream built 28 kB; the "Dynamic server usage" lines are pre-existing cookies/request.url notices on API routes, not failures).
- HALT-GENERAL honored: created only `PopulationWhatIf` + additive props + the opportunity-shape fields; access reuses the existing persona scope (`teamResults`/`[myResult]`); no new write path, no new access mechanism, no new slider math.
- SHA: *(on commit)* · PR: *(on open)*

---

*OB-211 WS-2 inc-2 · 2026-06-15 · vialuce.ai · the two rulings (B3 composition template + access-scoped Simulate) executed + verified; B1 (HALT-B1 signal-shape) + C3 (HALT-C3 surface-context) RCA'd with the alignment/extraction design, scoped to inc-2b.*
