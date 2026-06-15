# OB-211 WS-2 — Decide-Surface Pattern: Completion Report

**Date:** 2026-06-14 · **Branch:** `ob-211-ws2-decide-surfaces` · **Gate:** PR #512 + #513 merged to main (#512 `3a9eefa0`, #513 `12b847ec`) — confirmed before work. · **Loop:** TEST (Phase 0) → VERIFY → RCA → RESOLVE / HALT → RE-VERIFY → architect SR-44.

**Discipline applied — read-before-assume:** every item below was traced against the live surface + its Phase-0 finding *before* resolving. That discipline materially changed the scope: it revealed that B3 is **not** a mechanical primitive swap (each card has a real impedance mismatch), that Simulate is a genuine HALT-3 (model contract mismatch), and that G2's reference-frame is **already present on /stream** (the gap is /results = WS-4). The honest result is one clean shipped pattern piece (B2) plus root-cause findings with proposed extensions for the design-sensitive items — surfaced for SR-44 ruling rather than rushed into an unverified diff (the exact "build-green ≠ renders" failure this campaign exists to kill).

---

## Item B2 — Insight narrative leads /stream — RESOLVED ✅

**Phase-0 finding (FAIL):** `/stream/page.tsx` never imports `buildInsightNarrative`/`InsightNarrative`; the narrative led only `/operate/results`. /stream led with a data hero card — no AI-front element (also the root of B4's "AI-front fails on /stream").

**RCA (root in code):** the OB-210 keystone wired the narrative into `operate/results/page.tsx:488` only. The builder `lib/results/insight-narrative.ts` is a pure, deterministic reduction of already-loaded structural state (`InsightInput`) — it is surface-agnostic. The stream's `IntelligenceStreamData` already carries every field the builder needs, per persona.

**Resolution (compose, not rebuild — SR-34, HALT-GENERAL honored):** added `buildStreamInsight(data, formatCurrency)` in `stream/page.tsx` that maps the persona-shaped stream state into the **existing** builder, and rendered the **existing** `InsightNarrative` component as the first element of the surface (before the persona streams). No new builder, no LLM, no per-entity call, no new query.
- admin → `systemHealth.{totalPayout,entityCount,componentCount}`
- manager → `teamHealth.{teamTotal,teamSize}` + `teamHeatmap[0].components.length`
- rep → `personalEarnings.totalPayout` + `componentBreakdown.length`
- anomalies (all personas) → `bloodworkItems` (count + top), keeping count and description consistent
- `targetDrivenComponents: 0` — regime classification is not loaded on the stream surface, so the builder degrades to a component-count note (honest; the regime-aware framing lives on /results where the classifier is loaded).

**Re-verify (Phase-0 check flips FAIL→PASS):**
```
$ grep -n "InsightNarrative|buildInsightNarrative|buildStreamInsight" src/app/stream/page.tsx
31: import { InsightNarrative } ...
32: import { buildInsightNarrative, type InsightNarrative as InsightNarrativeData } ...
462:            <InsightNarrative narrative={streamNarrative} />   # renders BEFORE persona switch (line 467)
$ npx tsc --noEmit  →  exit 0, 0 errors
```
**SR-44 (production render):** the Insight narrative renders as the first element on /stream for admin/manager/rep, Bloodwork-toned (healthy/attention/critical). Architect confirms the render.

---

## Item B3 — compose /stream cards from design-system primitives — HALT-2 (extend), surfaced for ruling

Read-before-assume found each named card has a real impedance mismatch with its target primitive — a clean composition requires **extending the primitive** (HALT-2), with functional tradeoffs that warrant an SR-44 ruling before propagation (this is the pattern WS-3..6 inherit, so getting it right matters more than getting it fast):

| Card → primitive | Mismatch (RCA) | Proposed HALT-2 extension |
|---|---|---|
| `DistributionCard` → `DistributionChart` | `DistributionChart` buckets by **attainment %** (fixed `<70%…120%+`); `DistributionCard` shows **payout currency** with dynamic buckets + mean/median **reference lines** + recharts tooltip. A swap would change *what is shown* (payout→attainment) and drop the mean/median markers. | Extend `DistributionChart` to accept optional pre-computed buckets + a value formatter + optional mean/median markers (backward-compatible with its current `data: number[]` consumers in /results, /lifecycle), then compose. |
| `TrajectoryCard` → `Sparkline` + `TrendArrow` + `PeriodComparison` | `PeriodComparison` is **entity-level** (`entities[{name,value}]`), not period-total trajectory; `TrajectoryCard` renders velocity/acceleration, component trajectories, top movers, and a period×component table. `Sparkline`+`TrendArrow` fit the headline trend; `PeriodComparison` does **not** model period-total deltas. | Compose `Sparkline` (period totals) + `TrendArrow` (trend) for the headline; keep/extend the comparison via a period-total variant. Larger refactor — preserve the movers/table or migrate deliberately. |
| `OptimizationCard` → `AssessmentPanel` + `WhatIfSlider` | see Simulate (HALT-3) below — the slider's model contract mismatches the opportunity. | gated on the Simulate ruling. |

**Recommendation:** ratify the `DistributionChart` extension shape first (smallest, cleanest), ship it as WS-2 increment-2, then TrajectoryCard. Each its own re-verify + SR-44.

---

## Item Simulate (C1-onSimulate) — HALT-3 (model contract mismatch), surfaced for ruling

**RCA:** `OptimizationCard.onSimulate` is dead (Phase-0 confirmed: 0 callers). `WhatIfSlider` requires a per-entity model — `tiers: TierConfig[]` (min/max/rate/label) + `currentValue` + `currentPayout` — and projects payout by applying the tier rates to a slider value. The tier config **is** computable (`intelligence-stream-loader.ts:684 parseTiers(compDef)`), BUT:
1. the optimization opportunity is **population-level** (N entities within 5% of a tier boundary → aggregate `costImpact`), while `WhatIfSlider` models **one entity** sliding its value through tiers — a contract mismatch;
2. the opportunity exposes only a scalar `costImpact` — no `currentValue`/`currentPayout` per opportunity.

**HALT-3 (do not fabricate):** wiring a real WhatIfSlider needs a modeling decision — represent the opportunity as a representative-entity simulation, or extend WhatIfSlider to a population mode — plus exposing the entity value/payout the loader does not currently compute. Per the directive ("HALT-3 if the sensitivity model isn't loadable"), this is surfaced for ruling, not fabricated with placeholder tiers. The dead Simulate control's disposition (DISABLE+tooltip / REMOVE) flows to **WS-3**.

---

## Item B1 — expand-default + #510 adaptive react — scoped for increment-2

**RCA (Phase-0):** /stream has **no** expand/collapse concept; the only `expand` token (`stream/page.tsx:161`) is a telemetry action, not UI state. The #510 read-back pattern exists on /results (`operate/results/page.tsx:142-149`: read prior expand/collapse signals → flip the default).

**Approach (proposed):** add a collapsible wrapper around the stream's secondary cards with a default driven by reading the user's own prior `expand`/`collapse` signals (the #510 read-back, same shape as /results). This is a new interaction layer on the whole surface — it changes the render materially and needs SR-44, so it is its own gated increment, not folded into the B2 PR.

---

## Item B4 / G2 — DS-003 rules — read-before-assume correction

- **Diversity Minimum (≥3 primitive types):** already PASS on /stream (Phase-0: admin 9, manager 5, individual 4 distinct primitives).
- **Bloodwork-forward:** already PASS (BloodworkCard gated on items; the new narrative leads Bloodwork-toned).
- **AI-front:** **fixed by B2** (was the one failing leg).
- **Reference Frame / G2:** read-before-assume — vs-prior is **already present on /stream** heroes (`SystemHealthCard:87`, `TeamHealthCard:88`, `PersonalEarningsCard:94`). The directive's "via PeriodComparison" does not fit a hero's scalar vs-prior (PeriodComparison is entity-level). **The G2 gap is on /results** (Total-Payout hero, `operate/results/page.tsx:512-535`) — and /results is **WS-4** territory. Carried to WS-4, not changed here.

---

## Item C3 — generalize the inline drill — scoped for increment-2 (feeds WS-3)

**RCA (Phase-0):** the working anomaly drill is a one-off inline handler at `operate/results/page.tsx:662` (`setDrillAnomaly` → `<AnomalyDrillThrough>`); the reusable drill props (`onCellClick`/`onDrillDown`/`onEntityClick`/`onRowClick`) are dead. The inline handler lives on **/results**, not /stream — so generalizing it touches the /results surface and the shared drill mechanism. **Approach:** extract the inline `setDrillAnomaly` flow into a shared drill hook/util that the reusable props invoke, then point /stream's `onEntityClick` (currently telemetry-only) at it. This is the WS-3 enabler; it is scoped here and executed as its own increment so the shared mechanism is verified before WS-3 disposition consumes it.

---

## Carried to later workstreams (recorded, not acted)

- **G1 (WS-4) — correctness fix, NOT residual:** Phase-0 proved `results.length` off unbounded `.select('*')` (calculation-service.ts:385) caps ~1000 rows at 22K-entity scale → wrong totals. Server-COUNT helpers exist (calculation-service.ts:670 `count:'exact',head:true`) and go unused. Wire them in WS-4.
- **WS-4 surface target:** persona results render on **/stream + /perform**, not the VL-admin-gated `/operate/results`. WS-4 confirms placement before composing.

---

## Adversarial sweep (4 lenses over the WS-2 diff)

**Result: 0 HIGH · 1 MEDIUM (fixed at root) · several LOW (dispositioned).**

- **wrong-data / right-by-luck — PASS.** Every rendered number is the correct per-persona field; `anomalyCount` (`bloodwork.length`) and `topAnomaly` (`bloodwork[0]`) are mutually consistent (can't show "3 anomalies" with a 4th-item description); `severity` is a safe subset; `formatCurrency` is the surface's real formatter. Edge cases honest (missing health blocks → null → no narrative; empty bloodwork → healthy).
- **Korean Test — PASS.** No domain literal, tenant/language string, hardcoded component-name, registry, or closed vocabulary introduced. `buildStreamInsight` passes only structural counts + a verified platform-generic passthrough (`bloodworkItems[0].issue` = "Below benchmark at N%"). All copy comes from the shared builder.
- **scale / cross-tenant / FP-49 — PASS.** Pure O(1) reduction of already-loaded, already-tenant-scoped `data`; no new query, no per-entity loop, no `.insert`, no signal/audit write; `captureStreamSignal` path untouched.
- **render-regression / duplication — 1 MEDIUM + LOWs.**

**MEDIUM (FIXED at root):** the rep narrative was structurally stuck on "healthy" — `buildRepData` never populated `bloodworkItems`, so `anomalyCount` was always 0 for reps and a struggling rep was told "on track."
- **RCA:** `intelligence-stream-loader.ts buildRepData` returned `{personalEarnings, allocationRecommendation, componentBreakdown, relativePosition}` — no `bloodworkItems`; the builder's healthy branch was always taken.
- **Root fix:** `bloodworkItems: await buildBloodworkItems([myResult], nameMap)` — feeds the rep's **own** result through the **same** shared threshold helper the admin/manager paths use (att<50 critical / att<70 warning). Single source of truth, no duplicated magic numbers, no new query (reuses `myResult` + `nameMap` already loaded). IndividualStream renders no BloodworkCard, so no UI duplication.
- **Re-verify:** `grep` confirms the rep path now populates bloodwork (loader:589); `tsc --noEmit` exit 0. A below-benchmark rep now leads with the attention narrative, not a false "on track."

**LOW (dispositioned, not changed in WS-2 — recorded for ruling):**
1. *Admin "anomalies" label semantics* — on /stream the admin LEAD copy ("N anomalies need review") is driven by `bloodworkItems` (below-benchmark performers), which differs from `systemHealth.exceptionCount` and from /operate/results' structural `activeAnomalies`. The number is honest but the shared word "anomalies" means different things on the two surfaces. Changing it touches the shared builder (and /results) → architect copy ruling, not a WS-2 change.
2. *Manager vs admin componentCount* — manager uses `teamHeatmap[0].components.length` (result column names), admin uses `systemHealth.componentCount` (rule-set definition count); defensible per-scope, can diverge for variant-nested rule sets. Documented.
3. *Rep "across 1 entity" copy* — mechanically correct, mildly awkward. Optional persona-aware scale phrasing in the builder; non-blocking (/results never uses the rep branch, so it could be tweaked safely later). Documented.
4. *Narrative ↔ BloodworkCard overlap* — the admin/manager narrative `detail` embeds `bloodwork[0].issue`, which BloodworkCard also lists below. Summary-then-list is the intended DS-013 pattern (lead synthesis → actionable list); acceptable as complementary.

---

## Gates

- `npx tsc --noEmit` → **exit 0, 0 errors**
- Korean Test: B2 passes only structural counts + a passthrough description; no domain literal, no new vocabulary, no registry.
- FP-49 / scale: `buildStreamInsight` is a pure reduction of already-loaded, already-tenant-scoped data — no new query, no `.insert`, no per-entity loop.
- HALT-GENERAL: nothing created — B2 composes the existing builder + component.
- SHA: *(commit SHA recorded on commit)* · PR: *(URL on open)*

---

*OB-211 WS-2 · 2026-06-14 · vialuce.ai · increment-1 = B2 (AI-front keystone) shipped + verified; B3/B1/Simulate/C3 RCA'd with HALT-2/HALT-3 findings + proposed approach, awaiting SR-44 ruling before propagation.*
