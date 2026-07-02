# OB258 — Quota Allocation Canvas & Quota Intelligence

*Directive file. This file IS the prompt (DD-11). No CC execution block, no tail summary; the file ends at §6A.*

*Path of record: `docs/vp-prompts/OB258_QUOTA_ALLOCATION_INTELLIGENCE_DIRECTIVE_20260701.md` (DD-10). Sequence number OB258 is architect-assigned; confirm no collision against the live board/`docs/diagnostics/` registry before dispatch (no invented sequence numbers).*

---

## §0 — CC Standing Rules Header

Binding throughout this directive:

- **`CC_STANDING_ARCHITECTURE_RULES.md`** — read in full at the top of this OB. The standing rules govern; this directive adds objectives, not exceptions. Rules most load-bearing here: AP-25 (no domain vocabulary in structural code / Korean Test), SR-34 & SR-35 (commit+push after every change; git from repo root `spm-platform`, not `web/`), SR-38 (kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before any completion report), SR-41 (final step is `gh pr create --base main --head dev`), Rules 25–28 (completion-report discipline: pasted evidence, correct path, no self-attestation).
- **`INF_Structured_Compliant_Drafting_Reference_20260513.md`** — the drafting-discipline source for this file. DD-5 (no tuning constants — structural literals only), DD-7 (preserve pre-existing behavior exactly; behavior expansion is named, not smuggled), DD-8 (fully-qualified paths, no placeholders), DD-9 (prose matches implementation verbatim).
- **`SCHEMA_REFERENCE_LIVE.md`** — the only authority for table/column names. FP-49 gate: before writing any SQL, query the live table schema via a `tsx` service-role script and paste the result; never write SQL against remembered schema.
- **Reconciliation-channel separation.** This directive is scrubbed of ground-truth verification values. CC reports calculated and rendered values verbatim; CC never produces reconciliation interpretation. Verification anchors live in the architect channel only.

CC reads the three governance documents above, then executes §3 onward in phase order. Ambiguities halt to the architect (§9); CC does not make scope decisions.

---

## §1 — Problem Statement

**The capability that does not yet exist.** Vialuce can carry, classify, and calculate against target (quota) data — the Target SCI recognizes it (Decision 92), it lands in `committed_data` with a target semantic role, and the engine already divides actual by target to produce `calculation_results.attainment`. What the platform cannot do today: (1) let a revenue leader **see** the quota structure as a living, hierarchical object; (2) let an authorized user **author or adjust** a quota inside the platform with full audit and automatic recalculation; (3) let the Intelligence module, when enabled, **advise** on quota decisions grounded in the platform's own attainment history. Quota is currently a silent input that arrives by import and is never surfaced, reasoned about, or edited in-product.

**Why this is the right surface for Vialuce specifically.** Quota is the bridge between two organizational functions the platform already serves separately. Sales/Revenue leadership *sets* quota (it is a target assigned to a person or team and tied to compensation — the translation of a revenue strategy into individual accountability). The compensation team *implements and executes* the plan that turns attainment against that quota into a payout. Vialuce holds both sides of that bridge, plus two assets no quota-planning competitor holds together: the **organizational graph** (`entity_relationships`, the same graph that resolves permission scope in DS-014) and the **closed-loop attainment record** (`calculation_results.attainment`, produced by the deterministic engine and reconciled to the cent). Quota planning tools (Varicent, Xactly, CaptivateIQ, Fullcast, Pigment) plan in a layer disconnected from execution and then hand numbers over a wall. Vialuce can make quota-setting, plan-execution, and the resulting attainment one continuous, auditable object.

**Defect-class lineage.** This is a build (new capability), not a repair, but it inherits three failure classes the directive must actively prevent:
- **Fabricated intelligence** (prior finding: SPIFs/alerts rendered on surfaces with no grounding data). Every Action Card in this OB must trace to a real value in a real table, or it does not render. See §2 and the O4 proof gates.
- **Structure-passes-experience-fails** (OB-84, OB-94, OB-95, OB-96, OB-97, PDR-03 ×8 sessions): CC builds routes and components, reports PASS, and the rendered experience does not work. Every proof gate in this OB is experiential — exact rendered value + its source + its reference frame + browser confirmation (DD per E905 "Prove Don't Describe").
- **Read-time aggregation** (the disease OB-237/MSP corrected): the cascade roll-ups in this OB must be served from a materialization written at author time, never aggregated at render time — not in the client, not in an RPC.

---

## §2 — Substrate-Bound Discipline Applications

Per-entry application of the locked substrate to this OB. CC treats these as constraints, not suggestions.

- **Decision 158 (LLM recognizes; deterministic code constructs; Intelligence consumes, never re-derives) — applied at the quota-intelligence seam.** The Intelligence module reads `calculation_results.attainment`, entity capacity history, and the target data that already exists. It does not recompute attainment, re-run the engine's math to "check" it, or invent a parallel number. When a quota what-if needs a projected result, it calls the **actual engine** in a simulate mode (O5) — it never approximates the engine. Any code path where the intelligence layer derives a payout or attainment figure itself is a Decision-158 violation and a HALT.

- **Korean Test (T1-E910) / AP-25 — applied to capabilities and to the surface.** New permissions are structural, never domain-named: `target.author`, `target.propose`, `target.approve`, `target.simulate` — never `sales_sets_quota` or `can_manage_quota`. The organizational separation ("Sales sets quota, Comp executes") is expressed as **which structural capability a tenant grants to which role**, configured through the DS-014 tenant-policy overlay — not as a hard-coded domain role. A franchise operator allocating store targets and a bank allocating loan-officer quotas exercise the identical structural capability over different data.

- **Decision 92 (Target SCI; periods are user business decisions; SCI does not create periods) — applied to the write path.** Authoring a quota writes target data scoped to a period the user has already established. The quota write path does not invent periods; it attaches to existing ones. A quota with no period is a structured failure, not a silent default.

- **Carry Everything / Express Contextually (T1-E902) — applied to audit.** A quota edit carries everything: prior value, new value, author identity, reason, effective period, and the recalculation batch it triggered. Persistence-time narrowing (storing only the new number) is the prohibited violation class. This is what makes the value-proposition promise — "retroactive adjustments, fully tracked and recalculated automatically" — literally true rather than aspirational.

- **Materialized Serving Path (OB-237, Decision on read-time aggregation) — applied to the cascade.** Every node in the allocation cascade shows a roll-up (sum of descendant quotas), a reconciliation delta (node target vs. sum of children), and an attainment-health summary. These are **written to a materialization at author/commit time** and served by lookup. Aggregating at render time — including inside a Postgres RPC — is the same disease relocated, and is prohibited.

- **DS-008-A3 (Decision 114 candidate — three agency tiers; the Action Card) — the intelligence vocabulary.** Quota insights are Action Cards with the fixed anatomy: headline, impact model (projected revenue AND projected cost, plus ROI), affected population, confidence keyed to flywheel depth, time sensitivity, and action buttons. Tier 2 cards show **Simulate** only. Tier 3 cards show **Simulate + Apply**; an Apply that would move quota for more than 20% of a node's entities requires a secondary confirmation. Every surface declares its tier.

- **DS-013 (Intelligence Stream / Paradigm 3) — the interaction model.** The user does not browse to a quota editor buried under Configure → Plans → Edit. The intelligence surfaces the opportunity and embeds the control: the Simulate/Apply action executes in-stream or opens the minimum necessary context. Persona is an intelligence filter (which cards rank, which actions are available, which agency tier governs), not a page template.

- **DS-014 (Access control) — the persona and separation.** This OB formalizes the **Executive / Revenue-leader persona** (territory leader → VP Sales → CFO), previously identified but not designed — this is the **Decision-125 candidate** the DS-013/UI-to-Build sync anticipated. Persona derives deterministically from role + granted capabilities. The Simulate/Apply buttons render only when the corresponding capability is present (never rendered-then-disabled). Platform-admin-reachable, tenant-scoped API routes resolve the acting tenant via `resolveActor()`, never `profile.tenant_id`.

- **Decision 64 (module gating) — the on/off contract.** The Quota **Allocation Canvas** (view + author) is a platform capability available whenever the caller holds the capability. The **Quota Intelligence** layer (Action Cards, what-if recommendations) is gated on the Intelligence module being enabled for the tenant. Module OFF → the canvas renders and the write path works; zero Action Cards appear. Module ON → cards appear, each grounded in real data. Both states are proof gates (O4).

**Reconciliation-channel separation (architect-channel only — not for CC).** Proof-tenant selection and any expected numeric anchors are held by the architect. The BCL calculation in VLTEST2 currently produces zero payouts (open blocker), so attainment-grounded intelligence (O4) must be proven on a tenant whose engine produces non-zero attainment; the canvas, write path, and reconciliation math (O1–O3, O5-scenario) are provable on VLTEST2 target data independent of payout. The architect confirms tenant selection at the O0/O4 boundary (§9, HALT-3).

---

## §3 — Phase P0: Discovery & Grounding (no code changes)

Diagnostic-first. CC reads source, not logs, and produces a discovery report before touching any surface.

**P0.1 — Target data path.** Read the live path by which target data enters and is stored. Confirm from source: which `data_type` / semantic role marks target rows in `committed_data`; how the engine reads target to produce `calculation_results.attainment`; whether any write path to target data exists today. Paste the relevant source excerpts and the `SCHEMA_REFERENCE_LIVE.md` rows.

**P0.2 — Organizational graph.** Read `entity_relationships`: the edge shape, how DS-014 derives scope from it, and how a hierarchy (region → team → rep) is expressed. Paste the schema and one live example of a multi-level path from a proof tenant.

**P0.3 — Attainment record.** Read `calculation_results.attainment` structure (the per-component JSONB). Confirm what a node-level attainment-distribution summary would require, and that it can be produced by reading existing rows (Decision 158 — consume, never re-derive).

**P0.4 — Capability + persona substrate.** Read `lib/auth/permissions.ts` (DS-014 PDP) and the persona derivation. Enumerate every capability that exists today and where each is enforced (the four PEPs: middleware, page, API, RLS).

**P0.5 — Module gating.** Read how a module is determined enabled/disabled for a tenant and how a capability is namespaced by module (DS-014 §3.7). Paste the mechanism.

**P0.6 — Materialization precedent.** Read the OB-237 MSP materializations (`summary_artifacts`, `summary_artifacts_fine`) as the pattern to follow for the cascade roll-up materialization. Paste the write-time trigger pattern.

**EPG (Evidence Proof Gate) P0.** A discovery report at `docs/diagnostics/OB258_P0_DISCOVERY_<SHA>.md` containing, for each of P0.1–P0.6, pasted source excerpts and schema rows — not descriptions. No code changed in P0. Commit the report.

**HALT-1** if any of P0.1–P0.6 cannot be grounded in current source (e.g., no target write path and no clear place to add one without violating Decision 92). Report the gap; do not improvise.

---

## §4 — Phase O1: Capability Seam & Revenue-Leader Persona

Dependency: P0 complete. Delivers the separation of authority before any surface exists to exercise it.

**O1.1 — Structural capabilities.** Add to the single PDP (`lib/auth/permissions.ts`) the structural capabilities `target.author`, `target.propose`, `target.approve`, `target.simulate`. Names structural only (Korean Test). Wire them through all four PEPs identically to existing capabilities — one definition, enforced everywhere (DS-014 §2.2). Preserve every existing capability's behavior exactly (DD-7).

**O1.2 — Persona derivation.** Extend persona derivation so a role carrying `target.author`/`target.approve` derives the **Revenue-leader (Executive) persona**. Persona is derived, not selected (DS-014 §8.1). The compensation-admin persona (holds `configure_plans`, `run_calculation`) is unchanged and, by default tenant policy, does **not** hold `target.author` — this is the "Sales sets quota, Comp executes" separation, expressed as capability partition and overridable by tenant policy.

**O1.3 — Navigation derivation.** The Allocation Canvas route renders in the sidebar only when the caller holds a target capability; absent it, the item does not render (DS-014 §7.7 — no dead-end Access-Restricted pages).

**EPG O1 (experiential).** Two browser sessions on a proof tenant: (a) a user granted `target.author` sees the Allocation Canvas nav item and can reach the surface; (b) a compensation-admin user (no `target.author`) does not see the nav item and receives structured Unauthorized on direct URL. Paste both rendered outcomes (screenshot description + the exact capability set each user holds, read from the PDP). Commit.

**HALT-2** if adding the capabilities forces a change to any existing capability's enforcement (would indicate the PDP is not the single source of truth — a DS-014 violation to report, not patch).

---

## §5 — Phase O2: Quota Serving Layer & Audited Write Path

Dependency: O1 complete. This is the vertical-slice core — a quota change must flow to a recalculated attainment. Delivers read model + write path + recalculation in one PR.

**O2.1 — Node roll-up materialization.** Following the MSP pattern (P0.6), create the materialization that holds, per graph node per period: the node's own target, the sum of descendant targets, the reconciliation delta (own target − sum of children), the descendant count, and an attainment-distribution summary for the node's leaf population (min / p25 / median / mean / p75 / max, count-below-threshold, count-above-threshold) read from `calculation_results.attainment`. Written at author/commit time; served by lookup. No render-time or RPC-time aggregation (§2, MSP).

**O2.2 — Audited write path.** A `target.author`-gated API route (tenant resolved via `resolveActor()`) that writes a target value for an entity and period and records the full audit tuple (Carry Everything, §2): prior value, new value, author, reason, effective period, timestamp, and the recalculation batch id it triggers. The write attaches to an existing period (Decision 92 — never creates one). Retroactive edits (a prior period) are permitted and flagged as retroactive in the audit record. This is the structural basis for the value-proposition promise of tracked clawbacks/reversals/corrections.

**O2.3 — Automatic recalculation.** A target write triggers recomputation of the affected entities' `calculation_results` and the O2.1 materialization for every ancestor node. The engine recomputes; the intelligence layer does not (Decision 158). Recalculation is a real engine run, not a patch of the stored number.

**EPG O2 (experiential).** On the proof tenant: read one entity's current attainment for a component and its target (paste both values + source rows). Author a new target via the O2.2 route. Re-read: the target changed, `calculation_results.attainment` recomputed to the new ratio, the audit tuple persisted with all fields populated, and the ancestor node's roll-up materialization updated. Paste every before/after value with its source row. Commit.

**HALT-3** if the proof tenant's engine produces zero payouts (attainment denominator issues), preventing a meaningful before/after — request architect tenant confirmation (§2 reconciliation note) before proceeding.

---

## §6 — Phase O3: The Allocation Canvas (spatial surface)

Dependency: O2 complete. Delivers the spatial surface the revenue leader works in. Eight named surfaces, each browser-verified with real data.

The Canvas renders the org graph as a **cascade**: the top-of-tenant target at the root, cascading down region → team → rep along `entity_relationships`. It is spatial in the Synaptic-Surface sense — imbalance is itself a signal, read at a glance from position and color, not from reading numbers cell by cell.

**O3.1 — Cascade tree.** The hierarchy rendered top-down; each node shows its target and its descendant roll-up (from the O2.1 materialization). Expand/collapse to traverse depth.

**O3.2 — Reconciliation ribbon (the over-assignment signal).** At each parent node, a visual delta between the node's target and the sum of its children's targets — the over/under-assignment gap that quota science treats as the central reconciliation of top-down target against bottom-up allocation. Green when reconciled within tolerance; directional color when over- or under-assigned.

**O3.3 — Attainment-health coloring.** Each node colored by the health of its leaf population's historical attainment distribution (from O2.1): a node whose reps cluster far from target reads hot, a well-calibrated node reads calm. This is the quota-difficulty diagnostic made spatial.

**O3.4 — Node inspector.** Selecting a node opens the attainment-distribution histogram for its population plus its target/roll-up/delta, with the entity list on demand (progressive disclosure).

**O3.5 — Seasonality curve.** For the selected node, the per-period target curve across the tenant's periods (the surface that exposes the seasonal redistribution — e.g., a year-end or fiscal-close push — as an editable object; average-of-1.0 redistribution keeps the annual target constant).

**O3.6 — Ramp overlay.** For entities flagged as ramping (new/tenure attribute), the ramped target curve distinct from steady-state, so a ramping rep is not measured at day-one capacity.

**O3.7 — Capacity reference.** Per leaf, the proposed target shown against the entity's trailing capacity (derived from its own attainment history — consume, never re-derive), so an author sees when a target exceeds demonstrated capacity.

**O3.8 — Author affordance.** In-place target authoring on a node (gated by `target.author`), writing through the O2.2 path. The revenue leader allocates on the canvas; the roll-up and reconciliation ribbon update from the recomputed materialization.

**EPG O3 (experiential).** For each of O3.1–O3.8: the exact rendered value(s), the source row(s), and the reference frame, browser-confirmed on the proof tenant using its real target/attainment data. A surface that renders a placeholder, a hard-coded number, or a value with no traceable source fails the gate. Paste all eight. Commit.

---

## §7 — Phase O4: Quota Intelligence (module-gated Action Cards)

Dependency: O3 complete. Delivers the module-gated advisory layer. Every card is real or it does not render.

When the Intelligence module is enabled (Decision 64 gating, §2), the Canvas overlays Action Cards (DS-008-A3 anatomy, §2). Five grounded insight classes, each consuming existing data (Decision 158) and each an Action Card with headline + impact model (revenue + cost + ROI) + affected population + confidence + time sensitivity + Simulate/[Apply]:

- **O4.1 — Quota-difficulty diagnosis.** Reads the node's attainment distribution. Flags a target likely mis-set (population clusters well below or well above target relative to the healthy band). Card proposes a calibrated target and models the projected shift in the distribution and the payout-cost delta.
- **O4.2 — Over-assignment reconciliation.** Reads the O2.1 reconciliation delta. When Σ children diverges from the parent target beyond tolerance, proposes a reallocation that closes the gap, modeling per-child impact.
- **O4.3 — Capacity/ramp check.** Compares a proposed or current target to trailing capacity (O3.7) and ramp state (O3.6). Flags targets exceeding demonstrated capacity; proposes a capacity-anchored value.
- **O4.4 — Seasonality suggestion.** Reads the period-over-period actual pattern and proposes a seasonal redistribution of an annual target (constant-annual, average-1.0), modeling the per-period attainment effect.
- **O4.5 — Fairness flag.** Surfaces targets that are systematically inequitable relative to node-relative opportunity/capacity, so the author can see and justify or correct.

Confidence on every card keys to flywheel depth (e.g., high with several periods of history; moderate when cost is deterministic but behavioral response is estimated). No card asserts a behavioral certainty the data does not support.

**Agency tier.** O4.1–O4.5 render as **Tier 2 (Simulate only)** by default. A card graduates to **Tier 3 (Simulate + Apply)** only where the caller holds `target.approve`; an Apply moving >20% of a node's entities requires secondary confirmation (§2).

**EPG O4 (experiential, two states).**
- **Module ON:** on a tenant with non-zero attainment (architect-confirmed, HALT-3), each of O4.1–O4.5 renders with numbers traceable to real source rows; paste each card's headline, its impact numbers, and the source rows that produced them. Trigger one Simulate and paste the modeled result. A card that renders with no traceable grounding is a fabricated-intelligence failure (§1) and fails the gate.
- **Module OFF:** the same tenant/canvas renders fully with zero Action Cards. Paste the rendered canvas confirming absence. This proves the gating contract.

**HALT-4** if any insight class cannot be grounded in existing data without the intelligence layer re-deriving an engine result — report the class; do not ship an approximated card.

---

## §8 — Phase O5: What-If Scenario & Activation Proof

Dependency: O4 complete. Delivers the scenario simulator and the end-to-end activation proof.

**O5.1 — Scenario simulator.** An authorized user assembles a proposed target set (one node, a subtree, or the tenant) and runs it through the **actual engine in simulate mode** (the DS-008-A2 marginal-return/what-if computation extended to a full proposed target set) — not an approximation (Decision 158). The simulator returns the projected attainment distribution, the projected payout cost, and the capacity fit, **before** any commit. This is the "test before rollout" bar of modern quota planning (cost + capacity + attainment modeled pre-commit).

**O5.2 — Scenario compare.** Present best-/most-likely-/conservative-style scenarios side by side (the same simulator run over different proposed target sets), so the revenue leader chooses with the trade-offs visible.

**O5.3 — Commit path.** Committing a chosen scenario writes through the O2.2 audited path for every affected entity, in one tracked batch, triggering O2.3 recalculation. The audit records that these targets originated from a named scenario.

**Activation proof gates (named, browser-verified, in order).** Prove the whole slice end-to-end:
- **PG-1** — A `target.author` user reaches the Canvas; a comp-admin cannot (O1).
- **PG-2** — Authoring one target recomputes that entity's attainment and updates the ancestor roll-up (O2).
- **PG-3** — All eight O3 surfaces render on real proof-tenant data.
- **PG-4** — Reconciliation ribbon shows a real over/under-assignment delta at a real parent node.
- **PG-5** — Module ON: five insight classes render, each traceable to source (O4).
- **PG-6** — Module OFF: canvas renders, zero cards (O4 gating).
- **PG-7** — Scenario simulator returns projected distribution + cost + capacity for a proposed target set via the real engine, pre-commit (O5.1).
- **PG-8** — Committing a scenario writes the audited batch and recomputes attainment for the affected population (O5.3).

**EPG O5.** All eight PGs, each with pasted rendered values, source rows, and browser confirmation. SAY-TODAY ratchet: no capability moves to "shipped" language until its PG is production-verified (browser, SR-43). Commit; then `gh pr create --base main --head dev` (SR-41).

---

## §9 — HALT Conditions

- **HALT-1** (P0) — Any P0 grounding cannot be established from current source. Report the specific gap.
- **HALT-2** (O1) — Adding target capabilities forces a change to an existing capability's enforcement (PDP-not-single-source signal).
- **HALT-3** (O2/O4) — The proof tenant's engine produces zero payouts, preventing a meaningful before/after or a grounded intelligence card. Request architect tenant confirmation.
- **HALT-4** (O4) — An insight class cannot be grounded without the intelligence layer re-deriving an engine result (Decision-158 pressure). Report the class.
- **HALT-5** (any phase) — A proof gate can only be passed by rendering a placeholder, a hard-coded value, or a value with no traceable source. Stop; this is the structure-passes-experience-fails class. Report.
- **HALT-6** (any phase) — A required table/column named here does not match `SCHEMA_REFERENCE_LIVE.md` on live query (FP-49). Stop; do not fabricate schema.

CC halts to the architect on any of the above and does not make the scope decision itself.

---

## §10 — Reporting Discipline

Completion report at `docs/completion-reports/OB258_COMPLETION_REPORT.md` (never repo root; Rules 25–28). Structure:
1. Per-phase evidence (P0, O1–O5): for every EPG and every PG, the pasted rendered value(s), source row(s), reference frame, and browser confirmation. Self-attestation (PASS/FAIL with no pasted evidence) is not accepted.
2. The final merge SHA and PR link.
3. **ARTIFACT SYNC block** (governance-loop closure; CC emits deltas, does not edit governance artifacts):
```
ARTIFACT SYNC
MC: [new items discovered → status]
REGISTRY: [Quota-management capability row → evidence to add; proposed L-level]
R1: [any exit criterion this touches → status evidence]
BOARD: [CAPS field deltas for the quota lane]
SUBSTRATE: [entries exercised — DS-008-A3, DS-013, DS-014, Decision 158, Decision 92, Decision 64, MSP; candidate captures: Executive-persona formalization as Decision-125 candidate; target.* capability family]
```
Diagnostic (P0) report lives in `docs/diagnostics/` alongside diagnostic artifacts, not in `docs/completion-reports/`.

---

## §11 — Out of Scope

- Territory *design* (account-to-rep assignment). This OB allocates targets over an existing graph; it does not redraw territories.
- Automated quota-setting without human authorization. All Apply actions are human-authorized; Tier 3 is assistive, not autonomous.
- Per-transaction dispute submission and clawback/reversal *workflow*. The audited write path (O2.2) is the structural basis those features build on, but their UI/workflow is separate scope.
- New engine calculation primitives. O5 uses the existing engine in a simulate mode; it does not add calculation operations.
- Cross-tenant quota benchmarking. Foundational-flywheel structural learning is unaffected, but no cross-tenant quota values surface (privacy firewall).
- Formalizing the Decision-125 (Executive persona) lock. This OB *exercises and evidences* the persona; the architect ratifies the Decision separately on the strength of the O1 proof.

---

## §6A — Residuals

Operative-state known gaps named explicitly:

- **Attainment dependency.** Attainment-grounded intelligence (O4) requires a tenant whose engine produces non-zero attainment. The BCL calculation in VLTEST2 currently produces zero payouts (open blocker: convergence abstract-input→data-column mapping and the variant-assignment tokenization defect). Until resolved, O4 is proven on an architect-confirmed working-calc tenant; the VLTEST2 seasonal target dataset proves the canvas, write path, and reconciliation math (O1–O3, O5-scenario) independent of payout. Follow-on: re-run O4 proof on VLTEST2/BCL once the zero-payout blocker closes.
- **Bottom-up capacity ingestion.** O3.7/O4.3 derive capacity from the platform's own attainment history. External capacity inputs (pipeline, TAM, activity data) are not ingested here; a later OB may add a capacity-data path via the Reference/Target SCI.
- **Scenario persistence.** O5 runs and commits scenarios; a saved-scenario library (name, revisit, compare across time) is a candidate follow-on, not built here.
- **Decision-125 ratification.** The Executive/Revenue-leader persona is exercised and evidenced by O1; the formal Decision lock is an architect action post-merge.
