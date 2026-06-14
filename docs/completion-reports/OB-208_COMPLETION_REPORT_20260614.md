# OB-208 — Intelligence Surface Paradigm (Pass 1: Field Identity + Drill-Down) — Completion Report

**Date:** 2026-06-14 · **Branch:** `ob-208-intelligence-surface-paradigm` → `main`
**Governing:** DS-003, Korean Test (T1-E910 v2), OB-207 Performance Regime ADR, DS-013, Synaptic State spec
**Status:** SHIPPED — Pass 1 of the OB-208 sequence (directive §0 sanctions "first PR of a tightly-scoped
sequence"). D-1 (field-identity canonicalization) + D-2/D-3 (drill-down claim verification) delivered and
rendering on live BCL. D-4 (adaptive defaults), D-5 (full library consolidation), D-6 (Simulate), and the
/stream re-skin are Pass 2 — scoped below.

**Collision gate:** no OB-208 artifacts; highest on main is 207. ✓

---

## Scope of Pass 1 (honest delineation)

The directive packages OB-208 as a foundation + surface re-skins, explicitly allowing a tightly-scoped
sequence. Pass 1 delivers the **keystone primitive (D-1 field identity)** — without which regime-3
attainment is uncomputable and every downstream regime-aware surface is blocked — plus the directive's
**headline capability (D-2/D-3 drill-down)** on the /operate/results surface, where D-1's win is visible.
This is a perceptible unit (the attainment numbers 86%/90% now render; claims are verifiable), not a
library-only layer. The DS-003 component library (D-5) **already exists** in `web/src/components/design-system/`
(Sparkline, TrendArrow, DistributionChart, BenchmarkBar, ComponentStack, RelativeLeaderboard,
GoalGradientBar, LifecycleStepper, gauges, WhatIfSlider) — Pass 2 consolidates + re-skins /stream, wires
Simulate (WhatIfSlider), and adds adaptive defaults (the signal path is verified working — HALT-3 cleared).

## Phase commits (SHAs)

| Phase | SHA | Scope |
|---|---|---|
| 1 — field identity | `75763169` | canonical resolver (`field-identity.ts`) + ADR |
| 2 — apply + drill-down | `208fece6` | regime-3 attainment value on /results + drill-through claim verification |
| review hardening | `9addbf63` | adversarial-review fixes |

---

## FP-49 — the two vocabularies, side by side (live BCL)

```
DAG field (rule_sets.components DAG)   persisted metrics key   canonical binding (input_bindings.convergence_bindings)
  meta_colocacion                  →   Meta_Colocacion        column:"Meta_Colocacion" id:"loan_placement_target"
  colocacion_credito               →   Monto_Colocacion       column:"Monto_Colocacion"
  net_new_deposits                 →   Depositos_Nuevos_Netos column:"Depositos_Nuevos_Netos"
  deposit_target                   →   Meta_Depositos         column:"Meta_Depositos"
```
Some pairs are casing-only, others fully semantic — proving no mechanical transform exists; the canonical
declaration (the convergence binding) is the only sound resolver. HALT-1 not triggered (the binding IS the
registry).

## D-1 attainment trace (SR-38, via the canonical resolver — no name-matching)

```
Colocación de Crédito:  Monto_Colocacion 103200 ÷ Meta_Colocacion 120000 = 86.0%  (matches persisted Cumplimiento_Colocacion 0.86)
Captación de Depósitos: Depositos_Nuevos_Netos 31500 ÷ Meta_Depositos 35000 = 90.0%  (matches persisted Pct_Meta_Depositos 0.9)
```
Both computed values independently match pre-computed metrics — validating the resolution.

---

## §8.4 Proof gates (Pass-1 scope)

| PG | Status | Evidence |
|---|---|---|
| PG-01 field-identity canonical | ✅ | one resolver via `input_bindings`; grep → no hardcoded DAG↔metrics pairs, no surface name-matching |
| PG-02 regime-3 attainment VALUE | ✅ | Colocación 86% / Captación 90% render in the distribution + component annotation (SR-38 trace) |
| PG-03 component library | ◑ | the DS-003 set already exists in `design-system/`; Pass 2 consolidates + makes drill-capable |
| PG-04 every claim verifiable | ✅ (anomalies) | each anomaly claim has **Verify** → drill-through showing exactly its entities; count reconciles. Distribution/component-bar drill-down = Pass 2 |
| PG-05 drill-through is intelligent | ✅ | Five-Elements synthesis (value/context/comparison/impact + verifiable entity list), not a raw table |
| PG-06 adaptive defaults | ◔ | **Pass 2** (signal path verified live — `stream_interaction` write OK, HALT-3 cleared) |
| PG-07 Diversity Minimum | ◑ | /results uses HeroMetric + DistributionPosition + PrioritySortedList + StackedBar/HorizontalBar (≥3); full DS-003 conformance audit = Pass 2 |
| PG-08 Insight narrative | ◔ | Pass 2 (the /stream re-skin) |
| PG-10 Simulate wired | ◔ | Pass 2 (WhatIfSlider exists; /stream control) |
| PG-13 Korean Test | ✅ | resolver + drill-through + memo carry zero domain/component/field literals (resolution via binding) |
| PG-15 build exit 0 | ✅ | `npm run build` exit 0, touched files clean |

## Adversarial review (ultracode) — 14 agents, 11 surviving findings, all dispositioned

The review caught two HIGH bugs I would not have found myself — both about the persisted `metrics`
JSONB being the **raw unscaled/unfiltered aggregate**, not the engine's resolved operands:

- **[HIGH] scale_factor ignored** — the engine applies `binding.scale_factor` (e.g. ×100, ratio→%) to
  each operand before the ratio; the raw metrics don't carry it, so a recompute is off by ~100× when
  scale≠1.
- **[HIGH] filters ignored** — the engine filters rows (`binding.filters`) before summing; the persisted
  metrics are the unfiltered sum, so a recompute is inflated for any filtered binding.

**Fix (the honest disposition):** `resolveAttainmentPct` now renders the recomputed attainment **only
when both operands are raw-safe** (`scale_factor` absent/1 AND no filters) — verified live: BCL stays
correct (Colocación 86.0% / Captación 90.0% render); a scaled/filtered binding returns null and the
surface shows "target-driven" without a wrong number. (General per-component attainment persistence is
the OB-207 R2 / engine residual.) Other HIGH fixes:
- **entity slice(0,10)** ([3]/[4]) — the drill-through now reconciles against the claim's FULL
  `entityCount`: "the count reconciles" only when the shown set equals the claim; else "showing N of M
  (upstream retains the first N)" — honest, no false self-verification.
- **drillAnomaly not reset on batch change** ([5]) — now reset in the load effect.
- **NaN/negative-target guard** ([9]) — `Number.isFinite` + `target > 0`.

**Accepted as documented limitations (named, low practical risk):** the binding map is global first-wins
across components ([6]/[7] — BCL's per-component field names are distinct; the safe-render guard caps
exposure; per-component scoping is a refinement); empty-subset drill shows an honest "not recoverable"
message ([8]). Build exit 0; resolver re-verified on BCL.

## SR-39
The drill-through reads the already-loaded tenant-scoped result set (no new query, no cross-tenant
surface). The resolver reads `rule_sets.input_bindings` via the existing tenant-scoped path. No isolation
change. SOC2 CC6 / DS-014 / Decision 123 honored.

## Residuals / Pass 2
D-4 adaptive defaults (signal path verified) · D-5 DS-003 library consolidation + Diversity audit · D-6
Simulate (WhatIfSlider) · Insight Agent narrative · /stream re-skin · drill-down on distribution bands +
component bars (anomaly claims done) · regime-2 rendering · trend persistence · scale virtualization.

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: field-identity hardcoding (regime-3 attainment) → RESOLVED (Korean Test, D-1). Drill-down claim-verification → DELIVERED on /results anomalies (D-2/D-3). Visualization-monoculture / AI-narrative / adaptive / Simulate → Pass 2.
REGISTRY: NEW "Field Identity Canonical" → one declaration via input_bindings. "Drill-Down Intelligence" → claim verifiable via Five-Elements synthesis. DS-003 library exists (design-system/) — consolidation Pass 2.
R1: Tier C candidate "claims are verifiable; field identity canonical; regime-3 attainment renders" → pending SR-44.
BOARD: Decide (/results attainment value + drill-down); Platform Core (field-identity canonical).
SUBSTRATE: Korean Test at the field-identity layer (one canonical binding); Rule 6 drill-down → Five-Elements synthesis; regime-3 attainment value computable.
```

---

*OB-208 Pass 1 (field identity + drill-down) · 2026-06-14 · vialuce.ai*
