# Lane-1 Campaign Orchestration Plan — OB-210

**Date:** 2026-06-14 · **Orchestrated by:** CC (ultracode) · Every merge SR-44-gated.
**Dependencies on main:** #508 (regime model) ✓ · #509 (field-identity → attainment value) ✓ · #510
(capture-and-react signal path) ✓. HALT-7 not triggered.

---

## The campaign decomposes into SR-44-gated per-unit increments

The directive permits "a coordinated set of branches CC manages and merges in dependency order," and
mandates **per-unit SR-44 render verification** — no unit ships on build-success alone. Therefore the
campaign executes as a **sequence of per-unit PRs**, each architect-gated, not one mega-merge. This is
the correct shape: each unit is a perceptible increment the architect verifies on the live tenant before
the next builds on it.

## The two cost-paid-once instruments (this increment)

1. **The understand workflow** (one fan-out read of the surface set) — pays the read cost once for the
   whole campaign. Focused on the genuine unknowns (Discipline 2 read-before-assume), since #508/#509/#510
   + the OB-209 audit already mapped the Decide surfaces, the signal path, and the primitive inventory:
   - **Unit D (genuine build):** the FM views' CURRENT data path (legacy pipeline vs committed_data) — must
     be traced before reconnection (HALT-7-FM if untraceable).
   - **Unit E:** the cockpit components (`CycleIndicator`/`PulseMetrics`/`QueuePanel`) wiring + the
     `state-reader` the cockpit must share with /stream.
   - **Unit F:** the live `/insights/*` duplicate usage (confirmed by the OB-209 audit) — the repoint map.
   - The primitive→surface repoint map for B/C (heatmap, goal-gradient) from the existing primitives.
2. **The adversarial-review sweep** (one workflow over each unit's diff) — the dimensions that have bitten
   this project: wrong-rule-set (`selectedBatch.ruleSetId`), cross-tenant write, right-by-luck computation
   (scale_factor/filters — the #509 finding), Korean Test, scale (server COUNT). Run per-unit-batch, not
   per-file.

## Build orchestration

- **Unit A is the keystone** — it establishes the composed-surface pattern (§1) + the one genuine build,
  the **Insight Agent narrative**. B–F apply the pattern. So Unit A's pattern pieces are built first.
- **This increment (PR 1)** delivers the orchestration foundation (this plan + the understand map) **and
  the keystone's genuine build**: the `InsightNarrative` primitive + its ADR, wired to lead the
  Decide-Results surface (the surface CC built in #508/#509, freshest + where the regime/attainment win
  lives). This is a perceptible unit (the narrative leads /results on live BCL).
- **Subsequent increments (PRs 2…N), each SR-44-gated:** Unit A completion (narrative on /stream + the
  remaining primitive composition + Simulate + full drill-down); Unit B (Manager results); Unit C
  (Individual results); Unit D (FM reconnection — after the path trace); Unit E (cockpit); Unit F
  (action proximity + /insights repoint→removal). **Parallelization:** B and C touch disjoint surfaces
  (Manager vs Individual) and can be co-built; D (FM tree) and E (/operate) are disjoint from the Decide
  surfaces; F's /insights repoint is disjoint from all. A is sequenced first (its pattern is the template).

## Merge strategy

Per-unit PRs to `main`, dependency order (A → {B,C,D,E,F}), each gated on `tsc --noEmit` 0 + build exit 0 +
the adversarial sweep + **architect SR-44 render verification**. Branch per increment
(`ob-210-unit-{a..f}-…`); this PR is the orchestration foundation + keystone narrative.

## Why staged, stated honestly

A 7-unit campaign is not one safe atomic merge — the per-unit SR-44 gate is the directive's own model, and
each unit is a real surface the architect must see render before the next composes on it. Ultracode pays
the understand + adversarial cost once (these two instruments); the units then apply the keystone pattern.

---

*OB-210 Lane-1 Orchestration Plan · 2026-06-14 · vialuce.ai*
