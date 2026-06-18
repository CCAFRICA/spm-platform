# OB-207 INCREMENT 2 PASS 2: ADMIN ICM RESULTS — REGIME-AWARE PERFORMANCE SURFACE

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-14 (architect channel)
**Type:** OB Increment 2 Pass 2 — ONE complete persona surface, built end-to-end. The Admin ICM /results surface, with the per-component performance-regime model as its governing primitive. Ships code: regime classifier + regime-aware performance representation + the Admin governance results surface. One PR.
**Number:** OB-207 Increment 2 Pass 2 — continues OB-207. **Branch:** `ob-207-inc2-pass2-admin-results` off `main` AFTER #507 (Pass 1) merges. **Collision gate (Phase 0, mandatory):** CC runs `git log --all --oneline | grep -iE 'OB-207'` and confirms #507 on main (RBAC binding + `tenants.features` gating present). If Pass 1 is NOT on main, HALT.
**PR:** to `main`. Never push to main directly.
**Governing specs:** OB-207 Inc 1 (agent-nav spine), OB-207 Inc 2 Pass 1 (RBAC binding; `tenants.features` is the live gating field; `audit_logs.profile_id`), DS-013 §5 (Admin governance persona — highest density), DS-015 §4 (Admin V1 priority ordering), SH_UI_TO_BUILD §3 (Admin element table + data sources), DS-008-A2/A3 (performance intelligence, Action Card), Decision 158 (component grammar — the engine constructs per-component DAGs; regime is a grammar property), Korean Test (regime derived structurally, never per-tenant assumed), Bloodwork, Five Elements, DS-029 (carrier), Decision 123.
**Closes:** OB-207 F-2 for the Admin ICM surface specifically (the actionless "3 anomalies," the empty "No attainment data" panel, the flat entity table). The remaining persona surfaces (Manager, Individual) and modules (Financial) follow as subsequent one-surface passes.

**THE HARD CONSTRAINT (binds this pass and whoever executes it):** This pass ships ONE complete, visible surface — the Admin ICM /results surface, rendering on live BCL. It does NOT stop after the regime classifier (a structural layer) the way prior increments stopped after foundations. The classifier and the surface ship together, because the classifier without the surface is another imperceptible increment. PG-13 (the surface renders end-to-end on BCL with the regime-aware panels visible) is the completion gate. The increment unit is "one perceptible surface," never "one structural layer."

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. Binding: AP-25 (Korean Test — **regime classification is structural, derived from the component's grammar in `rule_sets.components`; zero per-tenant/per-domain assumptions; zero hardcoded component-name matching**), SR-34, SR-38 (math review gate — the regime classifier and any computed performance metric get a worked trace), SR-39 (Compliance Verification Gate — reads calculation_results/entity_period_outcomes scoped; see §7), SR-41, SR-42, SR-43, SR-44 (production browser verification = architect only). Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**FP-49 SQL Verification Gate (MANDATORY):** BEFORE any query, CC runs a tsx service-role `information_schema.columns` read on `calculation_results`, `entity_period_outcomes`, `rule_sets`, and pastes the actual columns. Schema reads already establish: `calculation_results` has `components` (jsonb), `attainment` (jsonb), `metrics` (jsonb); `entity_period_outcomes` has `component_breakdown` (jsonb), `attainment_summary` (jsonb); `rule_sets` has `components` (jsonb). CC confirms these live and inspects the ACTUAL jsonb shape of `components`, `attainment`, and a `rule_sets.components` definition for BCL before writing the classifier (the regime is read from the component definition's structure — CC must see that structure).

**Module gating:** tenant-level via `tenants.features` (Pass 1 established `module_access`/`modules_enabled` do NOT exist). Admin ICM results render when the tenant's `features` includes the ICM/compensation feature.

AUTONOMY: NEVER ask yes/no. Act. Commit + push after every phase. Git from repo root (`~/spm-platform`), NOT `web/`.

**Reconciliation-channel separation:** No ground-truth values. Rendered values read live; PG figures (BCL $44,590 total, the 4 components, 85 entities, 6 periods) are render-fidelity checks against what the DB holds, not reconciliation targets.

**Architecture Decision Gate (before Phase 2 surface code):** Phase 1 authors the performance-regime ADR. CC commits it before building the surface.

---

## §1 — PROBLEM STATEMENT

### 1.1 The Admin ICM /results surface is an engine-verification artifact, not a governance surface

The live Results Proof View (screenshot) shows: total payout ($44,590), an empty "Attainment Distribution → No attainment data" panel, an Assessment with "3 anomalies affecting 10 entities" and NO action, a component breakdown bar list, and a flat entity table. This is what an engineer needs to verify a calculation ran. It is not what an administrator needs to govern a payroll: *is this correct, what's anomalous and what do I do about it, and how is the population performing.*

### 1.2 The "No attainment data" panel is solving the wrong problem

The panel is empty because it assumes every plan has a target to attain against. BCL has **no target on any component** — its components pay on volume/activity. An attainment-against-target graph is therefore correctly empty for BCL, and filling it with a proxy would be fabrication. But BCL entities still have measurable performance: trend across 6 periods, rank within the population, distribution position. The panel must represent the performance that EXISTS for the component's regime — not demand a target that doesn't exist.

### 1.3 The governing insight: performance regime is per-component, derived from grammar

Target/attainment is not a tenant property. Within one plan, each component can be in a different regime:
- **Regime 1 — no target:** the component pays on volume/activity; no goal. (All BCL components.)
- **Regime 2 — non-paying target:** a target is tracked for management, but payout doesn't depend on it.
- **Regime 3 — paying target:** attainment against target determines payout (tiers/accelerators/gates keyed on % of quota).

The regime is a property of the component's grammar (Decision 158: the engine constructs a per-component DAG from the plan definition). A component whose DAG reads a target as a gate/tier input is regime 3; one tracking a target metric not used in the payout DAG is regime 2; one with no target reference is regime 1. Classification is **structural** — read from `rule_sets.components` definition + whether `calculation_results.attainment` carries a per-component value — never assumed per tenant, never matched on component names (Korean Test).

### 1.4 What the regime implies for representation

Each component renders in the representation appropriate to its regime:
- **Regime 1:** relative/temporal performance — trend (period-over-period across the entity's history), rank within peers, distribution position. No target shown.
- **Regime 2:** relative/temporal primary, PLUS attainment-vs-target as management context (target shown, flagged non-paying).
- **Regime 3:** attainment primary (it drives pay) with the tier/accelerator structure visible.

For BCL (all regime 1), the Admin distribution shows **payout distribution + period-over-period trend + population shape** — which is correct regime-1 performance intelligence, not a fallback. This retroactively makes the OB-206 heatmap's payout encoding correct *for regime 1* — the defect was only that it wasn't regime-aware (it would mis-encode a regime-3 component, where attainment is the axis).

### 1.5 Defect-class lineage

FP-67 (engine-artifact not governance intelligence), Action-Proximity (the actionless anomaly summary), and a new correctly-named primitive: **regime-blind performance representation** (assuming attainment-vs-target universally, producing empty panels where no target exists).

---

## §2 — SUBSTRATE-BOUND DISCIPLINE

**Decision 158 (component grammar):** the engine constructs per-component DAGs from plan definitions. The regime is a property the grammar already encodes — the classifier READS it, it does not impose it. **Korean Test:** the classifier inspects DAG/definition structure (does the component reference a target metric? is that reference a payout factor?), never component names or tenant identity.

**DS-013 §5 (Admin persona):** governance cognitive task, highest density, indigo ambient. Tables are acceptable for Admin (unlike Manager/Rep). The Admin needs completeness — all entities, all components, all anomalies — with governance actions.

**DS-015 §4 (Admin V1 priority ordering):** system health → action required → anomaly/optimization → trajectory → distribution. CC reads the full ordering from DS-015 §4.

**SH_UI_TO_BUILD §3 (Admin element table):** each element's Five-Element mapping and data source. CC reads and implements it.

**Five Elements:** every intelligence element = value + context + comparison + action + impact. The anomaly element's *action* (Investigate/Resolve) is what the current surface lacks.

**DS-008-A3 (Action Card):** the anomaly triage and any optimization use the Action Card anatomy (headline, impact, affected population, confidence, action buttons).

**Bloodwork:** healthy is quiet; anomalies get visibility. The Assessment panel surfaces what needs attention, not a green all-clear taking space.

**Decision 123:** the surface respects the capability gate (Pass 1 binding) — Admin sees governance actions because the Admin capability set grants them.

---

## §3 — PHASE 1: THE PERFORMANCE-REGIME PRIMITIVE (classifier + ADR)

### 3.1 ADR (commit before surface code)

Author + commit `docs/architecture/PERFORMANCE_REGIME_MODEL_OB207.md`:

```
DECISION: Performance regime is per-COMPONENT, derived structurally from the component's grammar.

  Regime 1 (no target):        component definition references no target metric.
                               → represent: relative/temporal (trend, rank, distribution). No target shown.
  Regime 2 (non-paying target): definition tracks a target metric NOT used as a payout factor.
                               → represent: relative/temporal primary + attainment as management context.
  Regime 3 (paying target):     definition uses attainment-vs-target as a payout factor (tier/gate/accelerator).
                               → represent: attainment primary + tier structure visible.

  CLASSIFICATION SOURCE (structural, Korean Test):
    - read rule_sets.components[component] definition: does it reference a target metric?
    - read calculation_results.attainment: is there a per-component attainment value (vs {overall:0})?
    - is the target reference a factor in the component's payout DAG (regime 3) or tracked-only (regime 2)?
  NEVER: assume per tenant, match on component names, or require a target to exist.

  BCL: all components regime 1 (no target) → distribution shows payout + trend + population shape (CORRECT, not fallback).

RATIONALE: Decision 158 (grammar already encodes the regime); the platform must accommodate all three
  regimes simultaneously within one plan. The "No attainment data" empty panel is regime-blindness —
  assuming regime 3 universally.
GOVERNS: Admin distribution (this pass), Manager heatmap, Rep goal-gradient/component-stack, Acceleration
  Cards, allocation intelligence — every performance surface derives representation from this one model.
REJECTED: tenant-level target assumption; attainment as a universal axis; payout-relative as a "fallback"
  (it is the CORRECT regime-1 representation).
```

### 3.2 The regime classifier (structural, Korean-Test-clean)

Create a classifier that, given a component definition (`rule_sets.components[c]`) and the persisted `calculation_results.attainment` / `entity_period_outcomes.attainment_summary`, returns the component's regime (1/2/3). It inspects structure only:
- Does the component definition reference a target/quota metric? (No → regime 1.)
- If yes: is that reference a factor in the payout computation (a gate, tier threshold, or accelerator input)? (Yes → regime 3; tracked-only → regime 2.)

CC inspects the ACTUAL jsonb shape (FP-49) of a BCL `rule_sets.components` definition and the `attainment` payload before writing the classifier — the structural signals must be read from real data, not assumed. **SR-38:** the classifier gets a worked trace in the report (for BCL: which structural signal placed each of the 4 components in regime 1).

**HALT-1:** if the component definition shape does not carry a discernible structural signal for target reference (can't distinguish regime 1 from 3 from the grammar), HALT and report the actual `rule_sets.components` shape — the classifier needs a real signal, and if the grammar doesn't encode it, that's an upstream finding.

### 3.3 The representation mapping

A pure function: regime → performance representation descriptor (what the surface renders for a component of that regime). Regime 1 → {trend, rank, distribution}; Regime 2 → {trend, rank, distribution, attainment-context}; Regime 3 → {attainment-primary, tier-structure}. The surface (Phase 2) consumes this.

### 3.4 Commit

`feat(OB-207-inc2-pass2): per-component performance-regime classifier + ADR — structural, Korean-Test-clean (regime 1/2/3 from grammar)`

---

## §4 — PHASE 2: THE ADMIN ICM RESULTS SURFACE (the visible deliverable)

Redesign the Admin ICM /results surface per DS-013 §5 + DS-015 §4 + SH_UI_TO_BUILD §3. Read the current Results Proof View component and the data it reads (calculation_results, entity_period_outcomes for the batch). Build the governance surface:

### 4.1 System Health hero (governance value)
Total payout + entity count + component count + anomaly count for the batch. Five Elements: value (payout), context (entities/components/period), comparison (vs prior period if 2+ periods — BCL has 6), action (lifecycle advance), impact (lifecycle progression). **F-84 guard:** no synthetic budget.

### 4.2 Anomaly triage with ACTIONS (closes the actionless "3 anomalies")
The current "3 anomalies affecting 10 entities" with no action is the F-2 thermometer. Redesign as Action Cards (DS-008-A3): each anomaly shows headline (what's anomalous — e.g., "4 entities >2σ above mean"), affected population (count + which entities), and **actions: Investigate** (navigate to the entity/anomaly detail) **and Resolve** (acknowledge/flag — writes an `audit_logs` row using `profile_id`, action='anomaly.resolved', resource_type='calculation_batch'/'entity', resource_id, changes). Bloodwork: anomalies surface because they need attention; a clean batch shows "No anomalies — batch within expected distribution," not an empty panel.

### 4.3 Performance distribution — REGIME-AWARE (closes the empty "No attainment data")
Replace the empty "Attainment Distribution" panel with a regime-aware performance panel. For each component, the classifier (Phase 1) determines the regime and the panel renders the appropriate representation:
- BCL (all regime 1): **payout distribution across the population + period-over-period trend (6 periods) + population shape** (where entities sit — quartiles, outliers). This is real performance intelligence with no target.
- The panel LABEL adapts: "Performance Distribution" (regime 1), not "Attainment Distribution" (which presumes a target). For a regime-3 component it would show attainment; for BCL it shows relative/temporal performance.
- The "4 entities >2σ above mean ($926)" insight already computed stays — it's a distribution/population signal, regime-appropriate.

**Korean Test:** the panel reads each component's regime from the classifier; it does not assume attainment, and the labels derive from the regime, not hardcoded.

### 4.4 Component cost breakdown (governance)
The existing component breakdown (per-component totals + entity counts) is governance-relevant — keep it, styled to the surface. Each component annotated with its regime (so the admin sees which components are target-driven vs volume-driven).

### 4.5 Entity results table (Admin density — acceptable here)
The entity table is acceptable for Admin (governance needs completeness). Keep it, but: scale-safe counts (server-side COUNT, not rendered row length — MIR F-50/51/52/53), per-component columns showing the persisted per-component values (the OB-206 fix — read `calculation_results.components[]` payout), and per-row expansion to the entity's component detail. Sortable.

### 4.6 Module gate
Render this surface when the tenant's `tenants.features` includes the ICM/compensation feature (Pass 1's live gating field).

**HALT-2:** the current Results Proof View has a fundamentally different structure than expected (no readable calculation_results read, no batch context). Report actual structure.
**HALT-3:** `calculation_results.attainment` for BCL carries per-component attainment values (not `{overall:0}`) — meaning BCL components are NOT all regime 1. Report the actual attainment shape; the regime classification for BCL may differ from the assumption and the representation adjusts accordingly. (This is a "the data contradicts the premise — report, don't force" halt.)

### 4.7 Commit
`feat(OB-207-inc2-pass2): Admin ICM results — governance hero + anomaly Action Cards + regime-aware performance distribution + cost breakdown + scale-safe entity table (F-2)`

---

## §5 — PHASE 3: ACTION WIRING FOR THIS SURFACE (Investigate/Resolve)

Wire the anomaly actions (the only action controls this surface introduces; the broader action-proximity pass is a later surface):
- **Investigate** → navigate to the entity/anomaly detail view.
- **Resolve** → write an `audit_logs` row (`profile_id`, action='anomaly.resolved', resource_type, resource_id, changes={anomaly, disposition}); the resolved anomaly clears from the triage (self-clearing — reads current state).

**FP-49:** `audit_logs` columns confirmed (`profile_id`, not actor_id) — CC pastes the columns before the write. No new schema. **Korean Test:** action types structural.

### 5.1 Commit
`feat(OB-207-inc2-pass2): anomaly action wiring — Investigate navigates, Resolve writes audit_logs(profile_id), self-clearing`

---

## §6 — PHASE 4: BLISS + BUILD + VERIFY

### 6.1 Bliss tokens
The surface uses theme-token variables (re-skin under OB-201), never hardcoded color/font literals. **HALT-4:** OB-201 not merged — proceed, report.

### 6.2 SR-39 Compliance Verification
Reads calculation_results/entity_period_outcomes (tenant-scoped via existing RLS); writes audit_logs (tenant-scoped, profile_id). No new isolation surface; the capability gate (Pass 1 binding) governs Admin action visibility. Confirm against SOC2 CC6, DS-014, Decision 123. Report. **HALT-5:** the Admin results read returns zero rows for a known-calculated tenant (BCL) — report; do not fabricate.

### 6.3 Build
Kill dev server. `rm -rf .next`. `npm run build`. Zero new errors. `npm run dev`. localhost:3000.

### 6.4 Experiential proof gates — rendered result + source value, pasted

| PG | Specification | PASS |
|---|---|---|
| PG-01 | Regime ADR committed | `PERFORMANCE_REGIME_MODEL_OB207.md`. Paste. |
| PG-02 | Classifier is structural | Classifier reads target-reference from `rule_sets.components` grammar + attainment shape; grep shows zero component-name / tenant matching. Paste + zero-hit. |
| PG-03 | Classifier trace (BCL) | Worked trace: which structural signal placed each of BCL's 4 components in its regime (expected: all regime 1, no target). SR-38. |
| PG-04 | Governance hero | Admin /results hero shows payout ($44,590 — matches DB SUM) + entities (85) + components + anomaly count + vs-prior comparison. Screenshot. |
| PG-05 | Anomaly Action Cards | "3 anomalies" rendered as Action Cards with Investigate + Resolve actions (not the actionless summary). Screenshot. |
| PG-06 | Performance distribution NOT empty | The panel renders regime-1 performance for BCL (payout distribution + trend + population shape), labeled "Performance Distribution" not "Attainment Distribution." NO "No attainment data" blank. Screenshot. |
| PG-07 | Regime-aware labels | The distribution/component annotations reflect regime (BCL: regime 1, no target shown). Not a hardcoded "attainment" label. |
| PG-08 | Component cost breakdown | Per-component totals + entity counts + regime annotation render. |
| PG-09 | Entity table scale-safe | Counts from server COUNT (not rendered row length); per-component columns show persisted values; sortable; row expansion works. Show count source. |
| PG-10 | Investigate wired | Investigate navigates to entity/anomaly detail. |
| PG-11 | Resolve wired | Resolve writes audit_logs row (paste; `profile_id` confirmed); anomaly self-clears. |
| PG-12 | Module gate | Surface renders under `tenants.features` ICM gate. |
| PG-13 | **THE SURFACE RENDERS END-TO-END ON BCL (completion gate)** | Log into BCL as admin, open /results: governance hero + anomaly Action Cards + non-empty regime-aware performance distribution + cost breakdown + scale-safe entity table ALL render with live BCL data. This is the perceptible-surface gate — the pass is not complete until this renders. (Architect SR-44 confirms; CC provides the localhost render evidence for every panel.) |
| PG-14 | Korean Test | Grep of classifier + surface selection/render → zero hardcoded domain/component/tenant/regime literals. Paste + zero-hit. |
| PG-15 | Build exit 0 | `npm run build` exit 0, warning-clean. |

Paste evidence for every PG. PG-13 is the completion gate: the surface must render, not just build.

### 6.5 Commit + PR
```bash
gh pr create --base main --head ob-207-inc2-pass2-admin-results \
  --title "OB-207 Inc 2 Pass 2: Admin ICM Results — Regime-Aware Performance Surface" \
  --body "ONE complete visible surface: the Admin ICM /results surface, governance-redesigned. Introduces the per-component performance-regime primitive (regime 1 no-target / 2 non-paying-target / 3 paying-target), classified STRUCTURALLY from component grammar (Decision 158, Korean Test) — accommodates all three regimes within one plan; BCL is all regime 1. Closes F-2 for Admin ICM: governance hero (payout/entities/components/anomalies + vs-prior), anomaly Action Cards with Investigate/Resolve (closes the actionless '3 anomalies'), regime-aware Performance Distribution (closes the empty 'No attainment data' — BCL shows payout distribution + trend + population shape, the CORRECT regime-1 representation, not a fallback), component cost breakdown with regime annotation, scale-safe entity table with persisted per-component values. Anomaly actions: Resolve→audit_logs(profile_id), self-clearing. Module-gated on tenants.features. Built on Bliss tokens. The regime model governs every future performance surface (Manager heatmap, Rep goal-gradient, allocation). SR-44: architect confirms the surface renders end-to-end on BCL."
```

---

## §7 — HALT CONDITIONS

- **HALT-1:** component grammar carries no discernible structural signal for target reference (can't classify regime from the definition). Report actual `rule_sets.components` shape; upstream finding.
- **HALT-2:** Results Proof View has a fundamentally different structure than expected. Report actual.
- **HALT-3:** BCL `calculation_results.attainment` carries per-component values (not `{overall:0}`) — BCL components aren't all regime 1. Report actual attainment shape; representation adjusts (data contradicts premise — report, don't force).
- **HALT-4:** OB-201 not merged. Proceed, report.
- **HALT-5:** Admin results read returns zero rows for BCL (known-calculated). Report; do not fabricate.
- **HALT-6:** any locked rule (Decision 158, Korean Test, DS-014 single-PDP, Bloodwork, IAP Gate, Five Elements, Decision 123) conflicts with a phase instruction. Surface verbatim per SR-42.

---

## §8 — REPORTING DISCIPLINE

Completion report: `docs/completion-reports/OB-207-INC2-PASS2_COMPLETION_REPORT_20260614.md`

Per Rules 25–28: SHA per phase commit, the regime ADR content, the FP-49 schema reads (calculation_results/entity_period_outcomes/rule_sets columns + the ACTUAL components/attainment jsonb shape pasted), the classifier worked trace (SR-38), pasted evidence for every §6.4 PG (especially PG-13 the render gate), SR-39 compliance, build output, PR URL.

```
ARTIFACT SYNC
MC: F-2 (Admin ICM results) → CLOSED by Pass 2 (pending SR-44). Regime-blind performance representation → RESOLVED via the per-component regime primitive. Actionless anomaly summary → CLOSED (Investigate/Resolve).
REGISTRY: NEW "Performance Regime Model" → per-component, structural, governs all performance surfaces. "Admin ICM Results" → governance surface, regime-aware distribution, anomaly actions. Decide agent advances toward L2 DEMONSTRATED on SR-44.
R1: Tier C candidate "results are persona-aware governance surfaces; performance represented per component-regime" → pending SR-44.
BOARD: Decide (Admin ICM results surface). Performance Regime Model established as a cross-surface primitive.
SUBSTRATE: Per-component performance regime (Decision 158 grammar-derived, Korean Test); accommodates no-target/non-paying-target/paying-target within one plan; DS-013 §5 Admin governance; DS-008-A3 Action Cards; Five Elements; the empty-panel defect reframed as regime-blindness and resolved.
```

---

## §9 — OUT OF SCOPE (subsequent one-surface passes)

- **Manager ICM results** — the heatmap on /results (regime-aware per the new model), coaching priority, Acceleration Cards. NEXT one-surface pass.
- **Individual ICM results** — earnings hero, goal-gradient (regime-aware: regime-3 components show goal-gradient-to-tier; regime-1 show trend-to-peer), component stack. Subsequent pass.
- **Financial module results** — FM 5-level hierarchy on committed_data. Subsequent pass.
- **Lifecycle cockpit (F-4)** — Cycle/Pulse/Queue. Subsequent pass.
- **Broad action proximity (F-5)** — Recognize/Coach/Intervene across surfaces (this pass wires only the Admin anomaly Investigate/Resolve). Subsequent pass.
- Engine-level: persisting per-component attainment for regime-2/3 components where the engine computes but doesn't store it (this pass READS what's persisted and classifies; if a regime-3 tenant needs per-component attainment that isn't stored, that's a named engine residual). Per-component attainment persistence — engine residual.
- Per-user module_access gating (DS-027 — tenant-level `features` until then).
- New schema/tables (attainment/components/attainment_summary columns exist; agent_inbox/audit_logs exist).
- OB-201 execution.

## §9A — RESIDUALS

- **R1 — Regime-2/3 surfaces.** This pass builds regime-1 representation fully (BCL) and the classifier handles all three, but regime-2/3 RENDERING (attainment-primary, tier structure) is exercised only when a regime-2/3 tenant/component exists. The representation descriptors are defined; their full visual build lands when a paying-target plan is onboarded. Named.
- **R2 — Per-component attainment persistence.** For regime-3 components, if the engine computes per-component attainment but persists only `{overall}`, a follow-on engine OB persists it. This pass reads what exists; classification uses the persisted shape.
- **R3 — Temporal performance persistence (MIR F-45).** Trend/period-over-period recomputed per load; a follow-on persists period deltas.
- **R4 — Scale (MIR F-51/53).** Entity table scale-safe (server counts); virtualization before MIR.
- **R5 — The regime model governs the remaining surfaces.** Manager heatmap, Rep goal-gradient, allocation all derive from this ADR — each subsequent pass references it rather than re-deciding.
- **R6 — R1 Exit Criteria.** On SR-44, propose updates (regime-aware performance representation; Admin governance results). One-way ratchet.
