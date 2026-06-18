# OB-210: LANE-1 COMPLETION CAMPAIGN — THE DECIDE PARADIGM + ALL PERSONA/MODULE SURFACES (ULTRACODE-ORCHESTRATED)

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-14 (architect channel)
**Type:** OB — Lane-1 completion CAMPAIGN. Not a single surface: the full experience arc to a verifiable done-state, **orchestrated by CC via ultracode** (parallel understand → keystone pattern → parallel surface application → one adversarial sweep). CC determines what parallelizes within its orchestration capability.
**Number:** OB-210 — highest OB on main is 209 (#510 open); next free is 210 (verified from repo). **Collision gate (Phase 0, mandatory):** CC runs `ls docs/vp-prompts/OB-210* docs/completion-reports/OB-210*` and `git log --all --oneline | grep -iE 'OB-210'`; if any match, HALT. **Dependency:** builds on #508 (regime model), #509 (field-identity → attainment value), #510 (signal capture-and-react). CC confirms all three on main; if #510 unmerged, the adaptive-react work consumes its `captureStreamSignal` path — coordinate or HALT-7.
**Branch + PR:** CC's orchestration choice — either one branch `ob-210-lane1-campaign` with the whole campaign, OR a coordinated set of branches CC manages and merges in dependency order. CC states its branch/PR strategy in the orchestration plan (§1A). Never push to main directly; every merge is architect-gated (SR-44).
**Governing specs:** DS-003 (primitives + six composition rules), DS-013 (Insight Agent narrative, Five Elements, persona density), DS-015 (V1 priority orderings — Admin/Manager/Individual), SH_UI_TO_BUILD (per-persona element tables), DS-008-A2/A3 (Action Card, Simulate impact model, allocation), FM_Views_Data_Persona_Analysis (FM 5-level hierarchy, 6 roles, A.24 plan-data independence), MISSION_CONTROL_LIVING_SYSTEM + TMR-3 (Compensation Clock — Cycle/Pulse/Queue), the OB-207 Performance Regime ADR, #509 field-identity, #510 signal foundation, Synaptic State Spec (Observation-IS-Action), Korean Test, DS-023 §5.1 + HF-219 (one signal path, no registry), Bloodwork, Decision 64 (dual read).
**Closes — the entire Lane-1 surface set:** the Decide paradigm (narrative, primitive composition, Simulate, adaptive-react, full drill-down) on both Decide surfaces; Manager ICM results; Individual ICM results; Financial FM hierarchy on committed_data; the lifecycle cockpit; broad action proximity; the /insights repoint that unblocks duplicate removal.

---

## §0 — CC Standing Rules + the two disciplines this campaign is built on

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Binding: AP-25 (Korean Test — primitives domain-agnostic, open-vocabulary signals, NO registry), SR-34 (compose/repoint/remove; no third path), SR-38 (math review gate for every computed value), SR-39, SR-41, SR-42, SR-43, SR-44 (production browser verification = architect — EVERY merge in this campaign). Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**DISCIPLINE 1 — Leverage, do not create (code-verified):** a live read establishes that nearly everything this campaign needs ALREADY EXISTS:
- `design-system/` — 28 primitives (DistributionChart, Sparkline, ComponentStack, LifecycleStepper, WhatIfSlider, PeriodComparison, AnomalyMatrix, BudgetGauge, GoalGradientBar, RelativeLeaderboard, QueueItem, AttentionPulse, …).
- Signal path — `captureStreamSignal`→`writeSignal` (open-vocabulary, no registry, dual-architecture defect closed), wired into /stream via `onCardInteract`.
- Cockpit components — `CycleIndicator`, `PulseMetrics`, `QueuePanel` (mission-control/), `LifecycleSubway`, `LifecycleActionBar`.
- Action controls — AccelerationCards `Recognize`/`Intervene`, TeamHealthCard `onCoachingAction` (wired to navigation; need wiring to agent_inbox/audit_logs per the #508 Investigate/Resolve pattern).
- Foundations — regime model (#508), attainment value (#509), capture-and-react (#510), drill-through view (#508).
The ONLY genuine builds are: the **Insight Agent narrative** (zero matches) and the **FM committed_data reconnection** (the views read a path that must be traced and rewired). Everything else is composition + wiring. **HALT-GENERAL:** any phase about to CREATE a primitive that exists, a signal path/registry, or a library — STOP, report what was about to be created and why the existing doesn't suffice.

**DISCIPLINE 2 — Read-before-assume (the campaign's foundation):** EVERY surface phase begins by reading the actual code — the surface, the components it uses, what imports them, the data path — and pasting it, BEFORE composing/wiring/removing. This campaign exists because stale premises diagnosed from partial reads (already-fixed Bloodwork, "dead" components live on /insights, the wrong-rule-set bug) caused rework. The understand workflow (§1A) is this discipline operationalized: read the whole surface set ONCE, paste the canonical map, build against it.

**FP-49:** all signal writes via `captureStreamSignal`→`writeSignal` (no `.insert`); action writes use `audit_logs.profile_id` (NOT actor_id — established #508/Pass-1) and `agent_inbox` (16 cols); module gating via `tenants.features` (per Pass-1: `module_access`/`modules_enabled` absent). CC reads live columns before any write.

AUTONOMY: NEVER ask yes/no. Act. **tsc --noEmit before every push** (the OB-208 Vercel lesson). Git from repo root.

**Reconciliation-channel separation:** No ground-truth values. PG figures are render-fidelity checks against what the DB holds.

**Perceptible-unit rule (campaign-level):** each surface in the campaign is a perceptible unit — it ships when it renders on live BCL (or the appropriate tenant), verified. The campaign's done-state (§DONE) is every Lane-1 surface rendering its complete paradigm. CC may sequence/parallelize the units via ultracode, but no unit "ships" on build-success alone — SR-44 render verification per unit.

---

## §1 — THE CAMPAIGN: WHAT "LANE-1 COMPLETE" MEANS

Lane-1 is the experience arc. Its foundations are shipped and proven (#505–#510). This campaign applies them to every persona/module surface to a verifiable whole. Seven surface units, one shared pattern.

**THE SHARED PATTERN (established by Unit A, applied by B–F):**
Every Decide-class surface renders: (1) an **Insight Agent narrative** leading (synthesis, AI front-and-center, Bloodwork-toned); (2) cards **composed from `design-system/` primitives** (no inline reimplementation); (3) **regime-aware representation** (regime-3 → attainment value via gauge/threshold primitive; regime-1 → relative/temporal via distribution/sparkline); (4) **DS-003 composition rules** (Diversity Minimum, Reference Frame Mandate, persona density/ambient); (5) **every claim drill-down-verifiable** (Five-Elements synthesis, the #508 view); (6) **adaptive defaults** (capture-and-react via the existing signal path, L1); (7) **every action control wired** to a concrete result (no dead buttons).

---

## §1A — ULTRACODE ORCHESTRATION (CC determines; states the plan first)

CC orchestrates this campaign via ultracode. **Before building, CC produces and commits an orchestration plan** (`docs/architecture/LANE1_ORCHESTRATION_PLAN_OB210.md`) stating:
- **The understand workflow:** one fan-out read of the ENTIRE surface set (every persona stream/results surface, the FM view tree + its data path, /operate + cockpit components, all action controls, the import graph, the primitive inventory) → the canonical map all units share. (Replaces per-unit Phase-0 reads.)
- **The build orchestration:** which units CC builds sequentially vs in parallel, given its ultracode capability and the file-collision analysis (units touching disjoint surface trees can parallelize; units sharing files cannot). CC decides — including whether the keystone (Unit A) is built first-then-replicated or co-built. The architect's guidance: Unit A establishes the pattern; B–F apply it; CC sequences for correctness + efficiency.
- **The adversarial-review sweep:** one (or few) adversarial-review workflow(s) over the batch, verifying the correctness dimensions that have actually bitten this project: **wrong rule set loaded** (read `selectedBatch.ruleSetId`, not arbitrary), **cross-tenant write** (writes pinned to caller's tenant), **right-by-luck computation** (a value correct only on favorable data — scale_factor/filters), **Korean Test** (no domain/component/field literals; open-vocabulary signals), **scale** (server COUNT not rendered-length). Run over the batch, not per-unit.
- **The merge strategy:** branch(es), dependency order, and that EVERY merge is architect-SR-44-gated.

CC states this plan, then executes it. The plan is the efficiency instrument — it pays the understand + adversarial cost ONCE across the campaign, not per-OB.

---

## §2 — THE SURFACE UNITS

Each unit's spec is the WHAT; the shared pattern (§1) is the HOW; the units' specs reference the governing docs (DD-11, no re-transcription). CC reads each surface (Discipline 2) before building it.

### UNIT A — THE KEYSTONE: BOTH DECIDE SURFACES (the pattern, fully realized)

/stream (Decide/Intelligence) + /results (Decide/Results), all personas. The full pattern §1, including the one genuine build:

- **Insight Agent narrative** (ADR: `INSIGHT_NARRATIVE_ADR_OB210.md`): structural synthesis from loaded surface state (system health, anomaly count, trajectory, highest-leverage signal), persona-shaped (Admin governance / Manager coaching / Individual growth), Bloodwork-toned. Design-time generation (deterministic builder from loaded data preferred; LLM-at-load only if synthesis needs it — NO per-entity LLM, Synaptic scale litmus). Korean Test: structural signals, no domain literals.
- **Compose cards from primitives:** DistributionCard→DistributionChart (remove raw recharts), TrajectoryCard→Sparkline+TrendArrow+PeriodComparison, SystemHealthCard→HeroMetric-class+LifecycleStepper, OptimizationCard→AssessmentPanel+WhatIfSlider, component breakdown→ComponentStack/BenchmarkBar, regime-3 attainment→BudgetGauge/ProgressRing (the #509 value), anomalies→AnomalyMatrix (with #508 Investigate/Resolve). HALT-2: extend a primitive (canonical) rather than keep an inline parallel (AccelerationCards icon/count).
- **DS-003 rules:** Diversity Minimum (≥3 primitive types/4+ elements), Reference Frame Mandate (vs-prior via PeriodComparison — the deferred PG-04 fix; quartiles; peer/target), persona density/ambient.
- **Wire Simulate:** OptimizationCard.onSimulate (dead callback) → WhatIfSlider inline impact model (DS-008-A3). HALT-3 if the sensitivity model isn't loadable.
- **Adaptive defaults:** read the user's OWN interaction signals (L1, existing reader) → flip section defaults (expand/collapse learning). Capture continues via existing `captureStreamSignal`.
- **Full drill-down:** extend from anomalies to distribution bands + component bars (DS-003 Rule 6). Every claim → Five-Elements synthesis, count reconciles.

*Unit A is the template. Its composed-surface pattern is what B–F apply.*

### UNIT B — MANAGER ICM RESULTS

Apply the pattern to the Manager /results surface (DS-015 §4 Manager ordering + SH_UI_TO_BUILD Manager table): Insight narrative (coaching-toned); the **entity×component heatmap** regime-aware (the heatmap exists on /stream — port to /results, regime-aware per #508/#509: regime-3 cells show attainment, regime-1 show payout-relative); coaching priority; **Acceleration Cards with wired actions** (Recognize→agent_inbox, Coach/Intervene→audit_logs+inbox — the §UNIT-G action pattern); drill-down on every heatmap cell. Composed from primitives; team-scoped.

### UNIT C — INDIVIDUAL ICM RESULTS

Apply the pattern to the Individual /results surface (DS-015 §4 Individual + SH_UI_TO_BUILD Rep table): Insight narrative (growth-toned); earnings hero; **goal-gradient regime-aware** (regime-3 → GoalGradientBar/SteppedProgress-to-tier; regime-1 → RelativeLeaderboard-to-peer — per #508/#509); component stack (ComponentStack); dispute action. Entity from identity (HALT-4: never render top-earner as the user). Composed from primitives; hero-dominant, low density.

### UNIT D — FINANCIAL FM HIERARCHY ON committed_data (a genuine build: reconnection)

Reconnect the FM views to committed_data (A.24, DS-029 carrier path), NOT the legacy pipeline. CC FIRST traces the current FM data path (the understand workflow) and reports it (HALT-7-FM if it can't be traced). Then: the 5-level hierarchy (Network→Brand→Region→Location→Check) reads committed_data; the 5 views (pulse/leakage/staff/timeline/location + server/products) reconnect; persona scopes the level (Franchisor→Network/Brand, Regional→Region, Location-mgr→Location, Server→personal); **Leakage shows ONLY POS-supported categories** (Discounts/Comps/Cancellations per FM analysis §2 — NOT Voids/Refunds/Walkouts; fabricated-precision prohibition). Composed from primitives (PeriodRibbon, DistributionChart, RelativeLeaderboard for staff). Currency via the tenant-currency formatter (MXN). Module-gated via `tenants.features`.

### UNIT E — LIFECYCLE COCKPIT (/operate)

Compose the cockpit from EXISTING components (CycleIndicator, PulseMetrics, QueuePanel, LifecycleSubway, LifecycleActionBar): **Cycle** (pacemaker — lifecycle pipeline, active stage, ONE action-verb control, multi-period timeline), **Pulse** (vital signs — payout+delta, entities, data freshness/T-1, reconciliation %, pending; reference frames; Bloodwork-silent; F-84 guard no synthetic budget), **Queue** (self-clearing priority items from cycle state; persona-scoped). One source of truth (the state-reader /stream uses — cockpit and stream agree on phase). Action-verb labels. Reached from sidebar/stream action, NOT the landing (HF-292 ensures /stream is the landing). HALT-8 if the cockpit components can't wire to the lifecycle state machine without net-new infra.

### UNIT F — BROAD ACTION PROXIMITY + /insights REPOINT (unblocks removal)

Generalize the #508 Investigate/Resolve action pattern across all surfaces:
- **Recognize** (AccelerationCards, currently navigation) → write `agent_inbox` row (type='recognition', persona='rep', targeting the rep).
- **Coach/Intervene** (AccelerationCards/TeamHealthCard) → write `audit_logs` (profile_id, action='coaching.flagged'/'intervention.opened', resource_id, changes) + agent_inbox item to the rep.
- **Simulate** anywhere → the WhatIfSlider model (Unit A pattern).
- **Unbuilt** (clawback/adjustment) → disabled+tooltip, not dead.
- **/insights repoint:** repoint the live /insights pages off the inferior `charts/`/`analytics/` duplicates (CompensationPieChart [DS-003-forbidden], dup leaderboard/goal-bar) onto `design-system/` primitives, THEN `git rm` the duplicates (import-proven unused). This is the OB-209 R4/R5 unblock — removal becomes possible once /insights composes from primitives. SR-34 removal, forensic trail.

---

## §3 — THE SHARED GATES (every unit, verified per unit)

Per-unit, on live BCL (or the appropriate tenant for FM), pasted evidence of RENDERED result + SOURCE value:
- Insight narrative leads (traces to loaded data; no per-entity LLM).
- Cards compose from `design-system/` primitives (grep: imports design-system; no inline reimplementation for that surface).
- Regime-aware representation (regime-3 attainment value renders; regime-1 relative).
- DS-003 rules (Diversity Minimum ≥3 types; Reference Frame on every quantity; persona density/ambient).
- Every claim drill-verifiable (Five-Elements synthesis, count reconciles).
- Adaptive defaults react (collapse → reload → reacted default; via existing signal path).
- Every action control wired (concrete result; no dead button; agent_inbox/audit_logs rows pasted).
- Korean Test (grep: zero domain/component/field literals; open-vocabulary signals; no registry).
- No new path/registry/library (only InsightNarrative + the FM reconnection are new; everything else composed/wired).
- Build exit 0 + tsc --noEmit clean (pre-push).
- **PER-UNIT COMPLETION GATE:** the surface renders its full pattern on the live tenant — not "builds." Architect SR-44 confirms each; CC provides localhost render evidence per panel.

**Adversarial-review gates (the §1A sweep, over the batch):** wrong-rule-set, cross-tenant write, right-by-luck computation (scale_factor/filters), Korean Test, scale (server COUNT). Every HIGH finding fixed; the fix re-verified. The sweep's findings + dispositions in the report.

**CAMPAIGN COMPLETION GATE (§DONE):** every Lane-1 surface (both Decide surfaces, Manager results, Individual results, Financial FM hierarchy, cockpit, action proximity) renders its complete pattern on production; one canonical library (inferior paths removed post-/insights-repoint); capture-and-react live on every surface (L1); the L3 universal read-basis intact. Architect SR-44 per surface.

---

## §4 — HALT CONDITIONS

- **HALT-GENERAL:** about to CREATE a primitive that exists, a signal path/registry, or a library — STOP, report.
- **HALT-1:** loaded state lacks a signal the narrative needs. Use available or extend load minimally; no fabricated insight.
- **HALT-2:** a primitive lacks a capability the inline had. Extend the primitive (canonical); no inline parallel.
- **HALT-3:** Simulate's sensitivity model isn't loadable. Report; wire to available or extend; no fabricated impact.
- **HALT-4:** user→entity unresolvable for Individual. Report; no top-earner fallback.
- **HALT-7:** #510 capture path not on main. Coordinate or scope adaptive-react to follow.
- **HALT-7-FM:** the FM view data path can't be traced (Unit D). Report what's found; reconnection blocked pending the path.
- **HALT-8:** cockpit components can't wire to the lifecycle state machine without net-new infra. Report; render from state-reader.
- **HALT-SCALE/TENANT:** a claim's entity set or a count isn't recoverable. Report; drill-disable (noted) or retain.
- **HALT-LOCKED:** any locked rule (Korean Test, DS-003, DS-023 §5.1, HF-219, Bloodwork, Decision 123, the regime ADR, A.24) conflicts. Surface verbatim per SR-42.

---

## §5 — REPORTING DISCIPLINE

Per-unit completion reports `docs/completion-reports/OB-210_UNIT_{A..F}_COMPLETION_REPORT_20260614.md` + a campaign summary `docs/completion-reports/OB-210_CAMPAIGN_SUMMARY_20260614.md`. Each per Rules 25-28: SHA per commit, the orchestration plan, the understand-map, the read-verified per-surface map + before/after imports, action-wiring rows (agent_inbox/audit_logs, correct columns), the adaptive-react signal + default, drill-down evidence, the FM data-path trace + reconnection, value-unchanged traces (SR-38), the adversarial sweep's findings+fixes, pasted evidence for every gate (esp. per-unit completion), SR-39, build+tsc, PR URLs. Confirm: only InsightNarrative + FM-reconnection created; everything else composed/wired.

```
ARTIFACT SYNC (campaign)
MC: Lane-1 surface set (Decide paradigm, Manager/Individual results, Financial FM, cockpit, action proximity, /insights repoint+removal) → CLOSED (pending per-surface SR-44). Composed from #508/#509/#510 + design-system + existing cockpit/action components; only InsightNarrative + FM-reconnection built.
REGISTRY: Decide/Calculate/Consolidate agents advance toward L2 DEMONSTRATED per surface on SR-44. NEW: "Insight Agent Narrative", "Composed-Surface Pattern", "FM-on-committed_data", "Lifecycle Cockpit", "Broad Action Proximity", "Canonical Library (inferior removed)".
R1: Tier C candidates "every persona surface renders the full paradigm; FM on committed_data; cockpit live; all actions wired; one canonical library" → pending SR-44.
BOARD: all four agents advanced at the surface layer; the composed-surface pattern is the cross-surface primitive.
SUBSTRATE: DS-013 narrative (design-time, Synaptic litmus); DS-003 primitives+rules; #509 attainment value; #510 capture-and-react (Observation-IS-Action, L1+L3); FM A.24 on committed_data; Compensation Clock (TMR-3) cockpit; Action Proximity (TMR-5) → agent_inbox/audit_logs; Korean Test throughout; nothing created but the narrative + FM reconnection; ultracode orchestration paid the understand+adversarial cost once across the campaign.
```

---

## §6 — OUT OF SCOPE (not this lane)

- Engine 🟠/🔴 (clawback, period-assignment, concurrency, disputes) — Lane 2.
- Infrastructure (INF-001 dev/prod, DS-027 provisioning UI, repo transfer) — Lane 3.
- OB-201 Bliss execution (orthogonal; surfaces use tokens to re-skin when it lands).
- The universal-insight AGENT (consumes the #510 L3 read-basis; follow-on — builds on this foundation).
- CRP Plans 2+4 reconciliation (predates the arc; Lane 2).
- Warm/Hot CRL adaptation (V1 deterministic ranking ships).
- New schema (agent_inbox/audit_logs/committed_data/features all exist).

## §6A — RESIDUALS

- **R1 — The composed-surface pattern** (Unit A) is the keystone B–F apply; future surfaces apply it too.
- **R2 — Universal-insight agent** — L3 read-basis established (#510); the agent is a follow-on on this foundation.
- **R3 — App-wide adaptive ordering** — capture-and-react proven; fuller adaptive ordering consumes the same surface.
- **R4 — Regime-2 rendering** — classifier handles it; renders when a regime-2 tenant exercises it.
- **R5 — Scale virtualization** — server COUNT folded into each surface's tables; full virtualization before MIR scale.
- **R6 — R1 Exit Criteria** — on per-surface SR-44, propose updates. One-way ratchet.
- **R7 — Trend persistence** (MIR F-45) — sparklines compute at read; persistence a follow-on.
