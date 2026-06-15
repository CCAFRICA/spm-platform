# OB-210 — Lane-1 Completion Campaign — Summary (Increment 1: Orchestration + Keystone)

**Date:** 2026-06-14 · **Branch:** `ob-210-lane1-campaign` → `main` · Ultracode-orchestrated.
**Dependencies on main:** #508/#509/#510 ✓ · **Status:** Increment 1 SHIPPED — the orchestration
foundation (plan + understand map, cost-paid-once) + the keystone's one genuine build (Insight Agent
narrative) on Decide-Results. Units B–F sequence as SR-44-gated increments per the plan.

**Collision gate:** no OB-210 artifacts; highest on main 209. ✓

---

## What this increment delivers

| SHA | Scope |
|---|---|
| `3e042350` | orchestration plan (`LANE1_ORCHESTRATION_PLAN_OB210.md`) |
| `e9cd68a5` | **Unit A keystone — Insight Agent narrative** (genuine build) leading Decide-Results |

- **The understand workflow** (4 agents, cost-paid-once for the whole campaign).
- **The Insight Agent narrative** — the one genuine Unit-A build (was zero-match): a deterministic,
  structural, persona-shaped, Bloodwork-toned synthesis from `/results`' loaded state. NO LLM/per-entity
  (Synaptic scale litmus). Verified: admin "3 anomalies need review", healthy affirm, manager "2 signals
  need coaching". Leads the surface (DS-013 AI front-and-center). tsc 0 / build exit 0.

## The understand map (the campaign's canonical map) — and three read-before-assume corrections

The whole campaign exists because stale premises caused rework. The understand workflow corrected **three
more** before any building:

1. **Unit D — FM is ALREADY on committed_data (the "reconnection" premise is stale).** All 9 FM views
   read `committed_data` (`data_type='pos_cheque'`) via `/api/financial/data` → server aggregation — NO
   legacy pipeline, NO mock fallback (HALT-7-FM not triggered). Leakage already extracts only
   POS-supported categories (discounts/comps). The ONLY real Unit-D gap: the 5-level hierarchy is 2-level
   (Brand→Location→Server; **Region + Check entity types are absent** — a data-model item, not a
   reconnection). **Unit D collapses from "genuine build (reconnect)" to "apply the pattern + (optional)
   add the missing hierarchy levels."**
2. **Unit E — cockpit components exist** (`CycleIndicator`/`PulseMetrics`/`QueuePanel`, fed by
   `NavigationContext` + `CompensationClockService`); /operate renders an OB-105 pipeline today. Unit E =
   compose the three on /operate (import + render under `NavigationProvider`) — composition, not build.
3. **Unit F — /insights repoint map is exact:** `CompensationPieChart`→`ComponentStack`/`DistributionChart`,
   `GoalProgressBar`→`GoalGradientBar`, `Leaderboard`→`RelativeLeaderboard` (or already-primitive),
   `KPICard`→composition; then `git rm` the dups (unblocks OB-209 R4/R5).

**Net effect of read-before-assume:** the "genuine builds" the directive named (narrative + FM
reconnection) reduced to ONE (the narrative — delivered this increment); FM is already on the carrier.

## Unit sequencing (each a subsequent SR-44-gated PR)

| Unit | Work (mostly composition/wiring) | Notes |
|---|---|---|
| A (rest) | narrative on /stream; compose remaining cards from primitives; wire Simulate (WhatIfSlider); full drill-down (bands/bars) | the builder is generic — /stream applies it |
| B Manager results | apply pattern; port the entity×component heatmap to /results regime-aware; Acceleration actions → agent_inbox/audit_logs | disjoint from C |
| C Individual results | apply pattern; goal-gradient regime-aware (GoalGradientBar / RelativeLeaderboard); entity-from-identity (HALT-4) | disjoint from B |
| D Financial | apply pattern to FM views (already on committed_data); optionally add Region/Check hierarchy levels | reconnection NOT needed |
| E Cockpit | compose CycleIndicator/PulseMetrics/QueuePanel on /operate | components exist |
| F Action proximity + /insights repoint | Recognize→agent_inbox, Coach/Intervene→audit_logs; repoint /insights→primitives then remove dups | unblocks OB-209 R4/R5 |

## The adversarial sweep (per §1A — applies to B–F, not the narrative)

The InsightNarrative is a **pure deterministic function + render component** — none of the dimensions that
have bitten this project apply (no rule-set load, no cross-tenant write, no scale_factor/filter recompute,
no scale query). It's live-verified by the narrative trace. The adversarial-review sweep (wrong-rule-set /
cross-tenant / right-by-luck / Korean Test / scale) runs on the surface-application units (B–F) where
those risks live — per the orchestration plan, over each unit's diff.

## SR-39
The narrative reads only already-loaded tenant-scoped surface state (no new query, no write, no isolation
surface). SOC2 CC6 / DS-014 / Decision 123 honored.

## ARTIFACT SYNC

```
ARTIFACT SYNC (campaign — increment 1)
MC: Lane-1 campaign orchestrated; understand map (cost-paid-once) + the keystone Insight narrative on Decide-Results delivered. Read-before-assume corrected: FM ALREADY on committed_data (reconnection moot), cockpit components exist, /insights repoint mapped. Units B–F = composition/wiring, SR-44-gated increments.
REGISTRY: NEW "Insight Agent Narrative" (deterministic, design-time, Synaptic-litmus-clean) → leads Decide-Results. "Composed-Surface Pattern" template established. FM confirmed on committed_data (Consolidate agent foundation already canonical).
R1: Tier C candidate "every persona surface renders the full paradigm" → keystone delivered; B–F pending per-surface SR-44.
BOARD: Decide (narrative keystone). Orchestration foundation laid for all four agents' surface units.
SUBSTRATE: DS-013 narrative built (design-time, no LLM); only genuine builds were narrative (done) + FM-reconnection (moot — already on carrier); everything else composition/wiring; ultracode paid understand once.
```

## Residuals
R1 composed-surface pattern governs B–F · units B–F as SR-44-gated increments · Unit-D Region/Check
hierarchy levels (data-model, optional) · the adversarial sweep runs on B–F · R2–R7 per the directive.

---

*OB-210 Lane-1 Campaign — Increment 1 (orchestration + keystone) · 2026-06-14 · vialuce.ai*
