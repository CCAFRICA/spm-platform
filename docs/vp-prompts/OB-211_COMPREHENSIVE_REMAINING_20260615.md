# OB-211 COMPREHENSIVE REMAINING: NAV KEYSTONE → VERIFIED FIXES → RLS → SIMULATE ALIGNMENT — THE COMPLETE EFFORT (ULTRACODE-ORCHESTRATED)

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-15 (architect channel)
**Type:** OB-211 — the COMPLETE remaining body of work as one orchestrated campaign. The security foundation (WS7-A + Stage 1) is done. This carries the rest through to completion: the agent-governed nav keystone (Phase A), the verified fixes (Phase B), the RLS/defense-in-depth verification (Phase C), AND **the Simulate alignment (Phase D) — folded into the OB effort as a co-equal phase, not a deferred thread.** The #508-classifier signal verification is incorporated AS a function of the larger effort (it is Phase D's foundation, already run — see below). Nothing is fragmented; nothing easy-executable displaces the larger effort.
**Gate:** #519 (WS7 Stage 1) on main (`0dc3260`) — confirmed. The security foundation is complete; this builds on it.
**Branch:** CC's orchestration — the phases as dependency-ordered, architect-SR-44-gated increments. Never push to main directly. tsc --noEmit before every push.

**THE PRINCIPLE (architect-set): one comprehensive effort, Simulate incorporated, signal-verification as a phase-function — not a side-check.** OB-211 is not done. The remaining nav/fixes/RLS work AND the Simulate alignment are the SAME effort and complete together under one orchestration. The easy-executable (the nav keystone) does NOT get to ship alone while the harder, more strategic Simulate work is deferred — they are co-phases. The #508 signal verification is not a question parked outside the work; it is Phase D's grounding, performed as part of scoping (and it DECISIVELY collapses the Simulate scope — see §5.0).

**Governing specs:** the verification (#517), WS7-A + Stage 1 (the security foundation), the authoritative capability map (the four agents), the OB-207 Regime ADR + **#508 `performance-regime.ts` (the structural classifier — Phase D's foundation)**, #509 field-identity, DS-014 (access scoping), DS-008-A3 (Action Card / Simulate impact, the Thermostat/IAP model), the `tenants.features` gating, DS-013, #510, HF-293, Korean Test, SR-34, SR-38, Bloodwork.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: AP-25 (Korean Test — agent vocab + the regime-driven simulation are structural, no domain literals; Simulate must NOT hardcode "tiered" as the only simulatable shape), SR-34 (reorganize/compose/extend; no third path — converge Simulate onto the existing classifier, don't add a parallel signal), SR-38 (every simulated/displayed value traces to the engine payout — the Thermostat what-if is anchored), SR-39 (scope holds through the read — the security foundation is in place; the fixes don't widen it), SR-41, SR-42, SR-43, SR-44. Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Leverage, do not create (verification + WS7-A + Stage 1 + the #508 read confirmed):** the scope mechanism, the payroll export, the results table, the secure rep statement, the nav config, the gating filter, the `useDrillThrough` target — ALL exist. **AND the regime classifier EXISTS** (`performance-regime.ts`: `classifyComponentRegime` → regime 1/2/3 + `attainmentFields`; `representationForRegime`). The Simulate phase COMPOSES that classifier; it does NOT build a new one. **HALT-GENERAL** if about to build what exists — especially a parallel structural signal when `classifyComponentRegime` already provides it.

**Read-before-assume:** every item is verified at a cited line. The Simulate divergence is located: the loader keys Simulate on `parseTiers` (`:594/:734/:835/:1050/:1091`) and does NOT import `performance-regime.ts` (verified absent) → it asks "is there a tiers array" instead of "what regime" → dead on BCL's regime-2 components. CC re-reads each slice before changing it.

**FP-49:** scope reads the persona context; the Finance gate reads `tenants.features`; the regime is read from the component grammar via the existing classifier; writes use correct columns. Confirm live.

AUTONOMY: NEVER ask yes/no. Act. tsc --noEmit before push. Git from repo root.

**Reconciliation-channel separation:** No ground-truth values.

---

## §1 — ULTRACODE ORCHESTRATION (the work is FORMED as orchestration — fan-out, keystone, parallel, batched sweep)

This is not a linear directive with an orchestration label. CC FORMS the work as ultracode and commits the plan (`docs/architecture/OB211_COMPREHENSIVE_ORCHESTRATION_20260615.md`). Four orchestrated movements:

### 1.1 The OPENING VERIFY FAN-OUT (parallel read-only, before any build)
As every prior increment opened (the 6-agent Phase-0, the 14-agent audit), CC opens with a parallel read-only fan-out that RE-GROUNDS all four phases on current main and produces a verified state map BEFORE building. The directive carries the prior findings (#517 + the #508 read); the fan-out CONFIRMS them at execution time (main moves). Disjoint read targets, one agent each:
- (a) the nav state (the verb→agent map; the `:257` override; the inert menu gate at `:223`)
- (b) the results-table double-gate + G1 read site (`calculation-service.ts:385`)
- (c) the `useDrillThrough` two inline states (`:113/:119`)
- (d) the payroll export + the hierarchy gap (`entity_relationships`)
- (e) **the Simulate divergence — the FIVE `parseTiers` sites in the loader (`:594/:734/:835/:1050/:1091`) + the rep `SelfSimulateCard` + the population `PopulationWhatIf` + confirm the classifier is still not imported** (this is Phase D's ground truth; it MUST be re-read fresh — the convergence touches every site)
- (f) the regime classifier's current shape (`performance-regime.ts` — confirm `classifyComponentRegime` + `attainmentFields` unchanged)
One verified map = the build scope. **HALT-0:** any item whose state needs an authenticated browser CC can't mint → flag architect-SR-44-required.

### 1.2 The BUILD ORCHESTRATION (keystone → parallel arms)
- **KEYSTONE (sequential, first): Phase A nav reorganization** — defines where surfaces live; the keystone the results-table placement references.
- **THEN three PARALLEL ARMS (disjoint trees, one orchestrated stream each):**
  - **Arm 1 — Phase B verified fixes:** results-table gate+G1 ∥ `useDrillThrough` extraction ∥ export hierarchy (these three are themselves disjoint files → sub-parallel within the arm).
  - **Arm 2 — Phase D Simulate convergence (INDEPENDENT of A/B's files — runs parallel):** this is itself a MULTI-SITE orchestrated pass, not a single edit — one coordinated change across the five `parseTiers` sites + the two cards, with a shared `regimeForComponent` router so all sites route IDENTICALLY (no site left on the old `parseTiers` gate). The orchestration ensures consistency across the sites (the failure mode is converging four of five and leaving one on `parseTiers`).
  - **Arm 3 — Phase C RLS plan:** the architect-context verification plan (read-only authoring; runs anytime).
- **THE SEQUENCING CONSTRAINTS (formed, not discovered):**
  - Phase A's Finance menu gate ↔ WS7-A's Finance route gate = the same entitlement boundary (cohere).
  - `useDrillThrough` extracts once; the results-table drill consumes it (intra-Arm-1 order).
  - Phase D is file-disjoint from A/B (loader Simulate path + cards vs nav config + results table) → genuinely parallel; CC confirms the disjointness in the plan.
  - Phase D EXTENDS HF-293 (regime-3 stays correct), does not undo it — the convergence ADDS the regime-2/1 routing.

### 1.3 The BATCHED ADVERSARIAL SWEEP (a parallel LENS fan-out, not a checklist)
The sweep is FORMED as a fan-out — each lens an agent reasoning about a bug CLASS across all the surfaces the batch touched (this is what caught the three right-by-luck bugs: wrong-rule-set, attainment-vs-dollars, empty-scope-means-all). Run ONCE over A/B/D, lenses in parallel:
- **SR-39 scope lens (ELEVATED):** the security foundation holds; the fixes + the regime-driven Simulate don't widen scope (population Simulate still over the persona's scoped set).
- **Finance entitlement lens (ELEVATED):** denied at route (WS7-A) AND menu (Phase A).
- **SR-38 Simulate-math lens (ELEVATED for D — the dimension that bit THREE times):** every regime's projection anchors to the engine payout — regime-3 the tiered `sf`; regime-2 the close-the-gap projection at the current attainment equals the persisted payout (delta=0 at rest); NO fabricated dollar where the anchor fails. This lens hunts the SAME class across ALL of Phase D's sites, not one.
- **Korean Test lens (ELEVATED for D):** Simulate routes on regime (structural) at EVERY site — never tiered-only, never a component-name literal. The lens checks all five converged sites.
- **scale (G1) + right-by-luck lenses:** standard.
Every HIGH fixed at the CLASS layer (AUD-009 — one general fix, not per-instance) + re-verified.

### 1.4 The MERGE STRATEGY
Phase A (keystone) → {Arm 1 Phase B ∥ Arm 2 Phase D ∥ Arm 3 Phase C}, each architect-SR-44-gated, dependency-ordered. CC states branches + confirms Phase D's file-disjointness from A/B (the basis for running it parallel).

CC FORMS this plan, then executes — the opening fan-out, the keystone-then-parallel build, and the lens-fan-out sweep paid ONCE across the whole remaining effort. The Simulate convergence is orchestrated ACROSS its sites, not edited linearly.

---

## §2 — PHASE A: NAV REORGANIZATION KEYSTONE (agent-governed)

Reorganize `workspace-config.ts`/`navigation.ts` → agent governance (Phase-0 confirmed: regrouping, NO schema change).
- **Platform Core** — substrate (config-as-settings: `/configure/*`), not a verb-peer.
- **Calculation** — cockpit/import/calculate + **reconciliation** (from removed Consolidate) + the **admin results table** (move `/operate/results` decide→Calculation, removing the `:257` override) + payroll export.
- **Performance** — `/stream`, dashboards, the rep statement home.
- **Finance** — LICENSABLE: `/financial/*` (from Consolidate), gated via `tenants.features` (WS7-A route gate + the menu fix §2.2).
- **"Consolidate" REMOVED** (reconciliation→Calculation, financial→Finance).

### 2.2 Fix the inert Finance MENU gate
The `featureFlag:'financial'` filter (`:222-224`) is short-circuited (`:223`) because no caller passes `enabledFeatures` (`ChromeSidebar.tsx:180`). **Fix:** pass `currentTenant.features` at the render call sites → the section gates. The visible reflection of WS7-A's route gate (route = hard boundary, menu = visible reflection).

### 2.3 Naming + nature
Agent names govern (verbs relabeled); capabilities by nature (forensics/dispute/next-best-action are contextual depth, not menu items). Korean Test: agent vocab structural.

### 2.4 Commit
`feat(OB-211 Phase A): agent-governed nav keystone — Calculation/Performance/Finance/Platform Core; Consolidate removed; results-table→Calculation; Finance menu gate fixed`

---

## §3 — PHASE B: VERIFIED FIXES (parallel, against the keystone)

### 3.1 Admin results-table access double-gate + G1
**Verified:** outer `RequireCapability view.all_results` admits a tenant admin, inner `isVLAdmin` (platform-only) BLOCKS them. **Fix:** collapse the double-gate — a `view.all_results` tenant admin is admitted (remove the redundant inner `isVLAdmin`; the capability gate is authority). **G1:** `entityCount = results.length` off an unbounded read (`calculation-service.ts:385`) → use the EXISTING `count:'exact',head:true` helper. Row drill + Full Trace exist. **SR-39:** tenant-bounded (Stage-1 scope is sound).

### 3.2 `useDrillThrough` extraction (the WS-3 enabler)
**Verified:** drill is two inline states (`drillAnomaly:119` + `expandedEntity:113`); NO HALT-C3-ADAPTER. **Extract:** `useDrillThrough<T>() = {target, open, close}` over one `useState<T|null>`, `open` firing the EXISTING `captureStreamSignal` (no new path) + reset-on-batch; the per-surface VIEW + context adapter stay OUT. Refactor `/results` to use it (remove the inline parallel, SR-34). WS-3 consumes it.

### 3.3 Payroll export hierarchy
**Verified:** `generatePayrollCSV` EXISTS (ID/Name/Total/period); **hierarchy ABSENT** (in `entity_relationships`). **Work:** surface in the Calculation results flow (sign-off→export); **HALT-EXPORT** — join from `entity_relationships` if cheap, else document the gap. No fabrication. **SR-38:** monto = persisted `total_payout`.

### 3.4 Commits (per fix)
`fix(OB-211 Phase B): results-table access double-gate + G1 server COUNT` ·
`refactor(OB-211 Phase B): extract useDrillThrough (WS-3 enabler)` ·
`feat(OB-211 Phase B): surface payroll export; hierarchy gap named (HALT-EXPORT)`

---

## §4 — PHASE C: RLS / DEFENSE-IN-DEPTH VERIFICATION (architect-context)
WS7-A + Stage 1 close the application-read layer. A complete boundary wants **RLS** on `calculation_results`/`committed_data`/`entities` (or a server route/RPC re-checking scope) so a DIRECT data-API call is denied at the DB. CC produces the verification plan (which tables, what policy each needs); the architect runs the authenticated check (CC's scan is sandbox-blocked). **HALT-RLS:** if RLS is absent on a scope-gated table, a defense-in-depth follow-on; the app layer holds for app traffic. Document; do not assume.

### 4.1 Commit
`docs(OB-211 Phase C): RLS/defense-in-depth verification plan — the data-layer boundary beneath the app-layer scope`

---

## §5 — PHASE D: SIMULATE ALIGNMENT (structure-derived, actionable — the strategic phase)

### 5.0 The signal verification (performed as a function of this effort — it COLLAPSES the scope)
**The #508 regime classifier ALREADY provides the structural signal Simulate needs** (verified in `performance-regime.ts`): `classifyComponentRegime(componentDef)` reads the payout DAG and returns the regime (1/2/3) + `attainmentFields {actual, target}` for regimes 2/3; `representationForRegime` maps regime → render flags (incl. `tierStructure` true for regime 3 only). **Therefore Phase D is NOT a new architecture — it is converging Simulate onto the existing classifier.** The current Simulate keys on `parseTiers` (the loader, 5 sites; does NOT import the classifier — verified absent) → asks "is there a tiers array" instead of "what regime" → dead on BCL's regime-2 components (attainment, no tier gate). The fix is to drive Simulate off `classifyComponentRegime`, not `parseTiers`.

### 5.1 The model (regime → actionable simulation, derived dynamically)
Each component's regime determines its actionable what-if (Thermostat/IAP — name the lever, the consequence, AND the action):
- **Regime 3** (gating target, `tierStructure`) → **"cross the boundary"**: the existing tiered simulation (HF-293's `SelfSimulateCard` / `PopulationWhatIf`). Action: coach the N reps near the boundary. UNCHANGED (correct today).
- **Regime 2** (target tracked, no tier gate — BCL's Colocación/Captación) → **"close the target gap"**: the classifier hands `attainmentFields {actual, target}`. The what-if projects the payout at a higher attainment toward 100% (the gap is the lever); the action is the lift to recover the left-on-table amount. **SR-38:** anchored to the engine payout (the #515 `sf` reconciliation generalizes — the projection at the current attainment must equal the persisted payout, delta=0 at rest). This is the NEW path that makes Simulate live on BCL.
- **Regime 1** (no target, relative) → **no inflection to simulate**: surface the volume/relative action (the existing trend/rank), NOT a fake slider. Honest absence.

### 5.2 The convergence (SR-34 — one signal, not two)
Replace the `parseTiers`-as-activation-gate with `classifyComponentRegime`-as-the-router at the Simulate sites:
- The rep-own path (HF-293 `buildRepData`/`SelfSimulateCard`): for each of the rep's components, the regime routes — regime 3 → the tiered slider (today); regime 2 → the close-the-gap what-if (NEW, using `attainmentFields`); regime 1 → no slider (trend instead). EXTENDS HF-293, does not undo it.
- The population path (`computeOptimizationOpportunities`/`PopulationWhatIf`): the opportunity's simulation type is the component's regime; the zero-payout structural fallback is REPLACED by the regime-2 "close-the-gap" opportunity where applicable (BCL's "zero payout" components are regime-2 attainment — the actionable opportunity is the gap, not a dead "zero payout" card).
- **Korean Test:** the router is the regime (structural), never a hardcoded component name or a tiered-only assumption.

### 5.3 Actionability (Thermostat/IAP — the named requirement)
Each simulation NAMES the action, not just the number: regime 3 → "coach these N near the boundary (+$X)"; regime 2 → "close the gap to target — the lift recovers $Y; coach on attainment"; regime 1 → "drive volume" (the relative action). The what-if LEADS TO the action (Recognize/Coach/Intervene — the action-proximity surfaces), not a bare readout. **DS-008-A3 (the Action Card / impact model) governs the framing.**

### 5.4 The honest valve
**HALT-SIM-REGIME:** a component's regime can't be classified (the classifier returns regime 1 for a component that should be 2/3 because the DAG operands are composed without top-level fields → `attainmentFields` null). Then the gap can't be computed structurally → fall back to the relative/volume action for that component (regime-1 treatment), and REPORT the component (its `attainmentFields` is unrecoverable from the grammar) — do NOT fabricate a target or a gap. **SR-38:** if the close-the-gap projection can't anchor to the engine payout (the `sf` reconciliation fails), do NOT show a dollar figure — show the attainment lever without a fabricated dollar delta.

### 5.5 Commit
`feat(OB-211 Phase D): Simulate derives the actionable what-if from component regime (#508 classifier) — regime-2 close-the-gap (live on BCL), regime-3 cross-boundary (HF-293), regime-1 volume-action; converged onto the existing classifier (SR-34), Thermostat-actionable`

---

## §6 — GATES + THE BATCHED SWEEP

### 6.1 Per-phase re-verify
- Phase A: sidebar agent-governed; Finance menu gate live (absent for non-Finance tenant); results-table under Calculation.
- Phase B: tenant admin reaches the table (double-gate collapsed); server COUNT (G1); `useDrillThrough` unifies the two states; export surfaces with hierarchy gap named.
- Phase C: the RLS verification plan + the architect's data-layer finding.
- **Phase D: Simulate is LIVE on BCL — a regime-2 component (Colocación/Captación) shows the "close-the-gap" what-if (not a dead "zero payout" card); a regime-3 component shows the tiered slider (HF-293, intact); a regime-1 component shows the volume action (no fake slider). Both admin/manager (population) and rep (own) route by regime. Screenshot each regime's simulation rendering.**

### 6.2 The batched adversarial sweep (ELEVATED: SR-39 scope + Finance entitlement + SR-38 Simulate math)
- **SR-39 scope:** the security foundation holds; the fixes + the regime-driven Simulate don't widen scope (the population Simulate still runs over the persona's scoped set).
- **Finance entitlement:** denied at route (WS7-A) AND menu (Phase A) for a non-Finance tenant.
- **SR-38 Simulate math (ELEVATED for Phase D):** every regime's projection anchors to the engine payout — regime-3 the tiered `sf` (today); regime-2 the close-the-gap projection at the current attainment equals the persisted payout (delta=0 at rest); NO fabricated dollar where the anchor fails. This is the #515 dimensional-payout lesson applied to the NEW regime-2 math — the dimension that bit three times.
- **Korean Test (ELEVATED for Phase D):** Simulate routes on regime (structural), never tiered-only or a component-name literal.
- **scale (G1), right-by-luck:** standard.
Every HIGH fixed + re-verified.

### 6.3 Build
tsc --noEmit → 0. `npm run build` exit 0. localhost:3000.

### 6.4 Proof gates
| PG | PASS |
|---|---|
| NAV-agents | sidebar Calculation/Performance/Finance/Platform Core; Consolidate gone; results-table→Calculation. Screenshot. |
| NAV-finance-menu | Finance section absent for non-Finance tenant (menu + the route gate from WS7-A). |
| TABLE-gate | tenant admin reaches the table (double-gate collapsed); tenant-bounded. |
| TABLE-G1 | count from server COUNT; correct >1000 entities. |
| DRILL | useDrillThrough unifies the two states; drill + Full Trace intact; no new signal path. |
| EXPORT | export surfaces; monto = persisted (SR-38); hierarchy gap named. |
| RLS-plan | the data-layer verification plan delivered; architect's finding recorded. |
| SIM-regime2 | **a BCL regime-2 component shows the close-the-gap what-if, LIVE (not a dead zero-payout card); the projection anchors to the engine payout (delta=0 at rest); the action is named. Screenshot.** |
| SIM-regime3 | a regime-3 component shows the tiered slider (HF-293 intact). |
| SIM-regime1 | a regime-1 component shows the volume action, no fake slider. |
| SIM-router | Simulate routes on classifyComponentRegime, NOT parseTiers; no tiered-only literal (Korean Test). Paste the router. |
| KoreanTest | agent vocab + gate logic + the regime router structural; no domain literal. |
| Build | tsc 0 + build exit 0. |
| PER-PHASE SR-44 | each renders/enforces on the live tenant; architect confirms — especially SIM-regime2 LIVE on BCL. |

### 6.5 PRs (dependency-ordered, each SR-44-gated)
Phase A: `OB-211 Phase A: agent-governed nav keystone + Finance menu gate` →
Phase B: `OB-211 Phase B: results-table gate+G1, useDrillThrough, export hierarchy` ∥
Phase D: `OB-211 Phase D: Simulate regime-driven (close-the-gap live on BCL)` →
Phase C: `OB-211 Phase C: RLS verification plan`
(CC states whether D runs parallel to A/B — it's independent of their files.)

---

## §7 — HALT CONDITIONS
- **HALT-GENERAL:** about to build what exists — especially a parallel structural signal when `classifyComponentRegime` provides it, or a new nav/gate/surface. Compose/reorganize/extend.
- **HALT-SIM-REGIME:** a component's regime/`attainmentFields` is unrecoverable from the grammar (composed operands → null fields). Fall back to the regime-1 relative/volume action + REPORT the component; do NOT fabricate a target or gap.
- **HALT-EXPORT:** hierarchy not joinable cheaply → assemble persisted + name the gap; no fabrication.
- **HALT-RLS:** RLS absent on a scope-gated table → document as a defense-in-depth follow-on.
- **HALT-NAV:** (not expected) agent grouping needs a schema change → reorganize within the existing structure.
- **HALT-LOCKED:** any locked rule (Korean Test, DS-014, the regime ADR, SR-34, SR-38, Bloodwork) conflicts. Surface verbatim per SR-42.

---

## §8 — REPORTING
Per-phase completion reports + a campaign summary. Each per Rules 25-28: SHA, the nav reorganization, the verified fixes + re-verify, the RLS plan + architect finding, **Phase D's regime-driven Simulate (the #508 convergence, the regime-2 close-the-gap LIVE on BCL, the SR-38 anchoring, the Thermostat actionability) with a screenshot per regime**, the batched sweep, build+tsc, PR URLs. Confirm: nav reorganized not replaced; fixes composed not rebuilt; Simulate CONVERGED onto the existing classifier (not a new signal); HF-293's regime-3 path intact; the comprehensive effort completed, Simulate incorporated, nothing dropped.

```
ARTIFACT SYNC (OB-211 comprehensive remaining)
MC: OB-211 COMPLETED — agent-governed nav reorganized (Calculation/Performance/Finance/Platform Core, Consolidate removed, Finance gated route+menu); verified fixes shipped (results-table double-gate+G1, useDrillThrough extraction, payroll export hierarchy); RLS/defense-in-depth verified; AND Simulate ALIGNED — converged onto the #508 regime classifier so it derives the actionable what-if from component STRUCTURE (regime-2 close-the-gap LIVE on BCL, regime-3 cross-boundary intact, regime-1 volume-action), Thermostat-actionable. The comprehensive effort completed, Simulate incorporated as a co-phase, nothing abandoned. Pending per-phase SR-44.
REGISTRY: "Agent-Governed Nav" → the four agents; "Finance Entitlement" → route+menu; "Results Table" → tenant-admin-reachable, server-COUNT, drillable; "useDrillThrough" → extracted (WS-3 enabler); "Payroll Export" → surfaced, hierarchy named; "RLS Boundary" → verified; "Simulate" → regime-driven (classifyComponentRegime, not parseTiers), actionable per regime, live across the three structures. All agents formalized; Simulate live on BCL's regime-2 plans.
R1: Tier-C "nav agent-governed; Finance gated route+menu; results table reachable+drillable; export surfaced; RLS verified; Simulate live + actionable across regimes on BCL" → pending SR-44.
BOARD: OB-211 complete (nav + fixes + RLS + Simulate alignment). The Simulate strategic thread is now EXECUTED (regime-driven, actionable), not queued.
SUBSTRATE: Simulate converged onto the existing #508 classifier (SR-34 — one structural signal, not parseTiers-vs-regime divergence); regime → actionable what-if (Thermostat/IAP: lever + consequence + action); SR-38 anchoring extended to the regime-2 close-the-gap math (the #515 dimensional lesson); Korean Test (regime router, not tiered-only); agent-governed nav; Finance entitlement at two layers; defense-in-depth verified; the comprehensive effort completed with the strategic Simulate work incorporated, not displaced by the easy-executable.
```

---

## §9 — THE LARGER EFFORT BEYOND THIS DIRECTIVE (tracked, not abandoned)
This directive completes the remaining OB-211 (nav + fixes + RLS + Simulate alignment). The campaign continues:
- **WS-2 inc-2b** — B1 expand/react (C3's `useDrillThrough` extracted in Phase B; inc-2b consumes it).
- **WS-3 dead controls** — consumes `useDrillThrough`; the 19-handler + no-handler-button inventory.
- **WS-4/5/6** — Manager/Individual results surfaces, Finance agent capability build-out (the map's 6), action proximity (the surfaces Phase D's "name the action" leads INTO — Recognize/Coach/Intervene).
- **i18n debt** — `WhatIfSlider` hardcoded Spanish chrome (Korean-Test-adjacent) — now MORE relevant (Phase D extends the Simulate surface).
- **RLS follow-on** — if Phase C finds RLS absent.
- **Demo `profile_scope` seeding** (HALT-SCOPE-DEMO from Stage 1) + scope-cache invalidation (the transient MEDIUM).

## §9A — RESIDUALS
- R1 — `useDrillThrough` (Phase B) is the WS-3 enabler.
- R2 — payroll hierarchy column (HALT-EXPORT).
- R3 — **Simulate's action-proximity wiring (Phase D names the action; the Recognize/Coach/Intervene surfaces it leads into are WS-4/5/6) — the Thermostat loop closes when the named action is clickable.**
- R4 — Finance agent's unbuilt capabilities (the map's 6).
- R5 — RLS defense-in-depth (Phase C finding).
- R6 — i18n localization (now spanning the extended Simulate surface).
- R7 — demo `profile_scope` seeding + scope-cache invalidation.
- R8 — HALT-SIM-REGIME reported components (composed-operand DAGs where `attainmentFields` is unrecoverable) — a grammar/classifier refinement if they recur.
- R9 — R1 exit criteria on per-phase SR-44.
