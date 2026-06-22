# DS-029: The Living Plan Surface

**Category:** DS (Design Specification)
**Date:** 2026-06-21
**Status:** SPECIFICATION — pending architect lock. Lock candidate as Decision 159-class (Plan Surface representation contract).
**Proof tenant:** MIR (5 plans, es-PE locale, ~75K rows, OB-214 interpreter scope)
**Primary persona (first build):** Admin. Persona-refraction (Rep / Manager / Admin) architected from day one; Rep/Manager refractions deferred to later slices.
**Drafting discipline:** Authored per `INF_Structured_Compliant_Drafting_Reference` (DD-1 through DD-12, §3 file-structure rules). Standing rules per `CC_STANDING_ARCHITECTURE_RULES.md` v2.0.

> **§0 sequence-number gate.** This artifact is numbered **DS-029**, assigned by the architect from the live `docs/` directory (2026-06-21). CC's collision-gate remains the safety net, not the source of the number.

> **§0 reconciliation-channel separation.** This is a DS (design artifact, architect channel). It contains **no verification anchors / GT values**. The OBs derived from it (§9 roadmap) carry their own reconciliation-channel separation headers; GT values never enter CC directives. BCL and Meridian Logistics Group GT figures are reconciled and remain architect-channel only.

---

## §1 Problem Statement

### 1.1 The market gap (spatial finding)

Every competitor renders the compensation plan as one of three static representations — a **spreadsheet surface** (CaptivateIQ SmartGrid, Spiff low-code: the plan *is* a grid, structure implied by formula references), a **component form-builder** (Performio, Everstage: discrete configurable blocks edited in modals), or a **formula/rule engine** (Xactly, Varicent, SAP, Oracle: the plan lives in a configuration language requiring expert or professional-services authoring). Across all three, the recurring end-user wound is identical and documented in category reviews: the plan is a **black box** — legible to its author, opaque to the rep whose pay it determines.

Every AI move in the market — including CaptivateIQ's May-2026 Agents launch — is a **production accelerator bolted onto a static representation**. The agent writes the grid faster, then hands back the same grid. The AI's job ends when the artifact is produced. The representation itself is not intelligent: it does not explain itself, adapt to its viewer, simulate on real data continuously, or surface its own improvement opportunities as a standing property. CaptivateIQ's agents + MCP server are in limited beta with GA "later in 2026" — the window is real but closing.

### 1.2 The Vialuce-specific gap (internal finding)

Per `VIALUCE_COMPREHENSIVE_GAP_ANALYSIS` (Category 2, Plan Management): **plan editing UI is NOT BUILT — admin cannot view/edit plan components, rates, or tier tables through the browser**, rated P1. Plan validation/anomaly detection is DESIGNED (OB-91) but only partially built. Plan simulation/sandbox ("what if I change this rate?") is NOT BUILT. The platform produces a rich interpreted rule-set (`rule_sets.components` JSONB with per-component, per-rate, per-condition confidence) and then has **no surface that lets a permitted user see, understand, or adjust it.** The intelligence exists; the expression surface does not.

### 1.3 The architectural opening (why only Vialuce can build this)

Four properties competitors lack, each making the Living Plan Surface computable rather than aspirational:

1. **The plan is already a structured object, not a formula.** The Plan Reader outputs `rule_sets.components` as `configuration.variants[].components[]` with `componentType ∈ {matrix_lookup, tier_lookup, percentage, conditional_percentage}`, each carrying its config (rowBands/columnBands/values, tiers, rate, conditions) and `calculationIntent` + confidence. **Structure is the representation** — no parse step required.
2. **Convergence makes "the plan acting on real data" computable at design time.** Convergence already answers "will this column's values, processed through this component's logic, produce plausible results." A plan-surface edit can therefore show its **real-data consequence instantly** against committed data — not a sandbox re-run.
3. **The Synaptic Surface makes the plan self-explaining and self-improving as a standing property.** Allocation Intelligence (DS-008-A2) already computes marginal return, gate dependency, and tier proximity per entity per component. The surface reads it directly.
4. **Three Tiers of Agency (Decision 114) is already specified** — observe / recommend-with-modeled-impact / recommend-and-execute-within-engine-contract. The agentic posture is doctrine, not new invention.

**The thesis (lock candidate):** *Competitors bolt an agent onto a spreadsheet to write it faster. Vialuce makes the plan itself a living, self-explaining, self-simulating organism — the agent is not beside the plan; the agent is the plan's nervous system.* This is the Design Vision applied to the plan surface: state lives on the data, identity lives in the space, the system never displays without recommending.

---

## §2 Substrate-Bound Discipline Applications

The eight-concept design is bound to the following substrate entries. Each concept that ships must hold its bound invariant or it does not ship.

| Substrate entry | Binding application to the Plan Surface |
|---|---|
| **Korean Test** (IGF-T1-E910, Decision 154 LOCKED) | The surface renders whatever `rule_sets.components` contains. No hardcoded component-type list, no enumerated field catalog, no language-specific label dictionary. A Korean tenant's Hangul plan renders identically. Component-type rendering dispatches on the `componentType` value present, with a **generic fallback renderer** for any type not yet given a bespoke visual — never an enumerated whitelist that silently drops unknown types (AUD-009 catalog-is-the-next-bug). |
| **Carry Everything** (T1-E902 v2) | The surface reads the full `components` JSONB and the full `row_data` for distribution overlays. AI confidence scores are **hints, not gates** — a low-confidence component is flagged, never hidden. Persistence-time narrowing is prohibited; the surface narrows by *expression context* (persona, viewport), never by discarding. |
| **Decision 158** (LLM recognizes; deterministic code constructs and guarantees) | The surface's *explanations, confidence, and improvement suggestions* are recognition (LLM/Allocation-Intelligence-sourced, advisory). The *rendered values and any committed edit* are deterministic — read from / written to `rule_sets.components` exactly, with the engine as the sole guarantor of what a saved edit computes. Consequence-on-hover (Concept ②) is a deterministic recompute, not an LLM estimate. |
| **Prove Don't Describe** (IGF-T1-E905) | Every proof gate verifies LIVE RENDERED state in the browser against MIR. Component cards rendering from a fixture do not count; they render from `rule_sets` rows for MIR's 5 plans or the gate fails. |
| **IAP Gate** (Principle 9, Decision-bound) | Every surface element scores Intelligence / Acceleration / Performance. §8 carries the scoring. Elements failing all three are cut from the slice. |
| **Vertical Slice Rule** | Engine and experience evolve together. No slice ships a canvas that renders a plan the engine cannot also recompute under it. Concept ② (consequence) and Concept ① (canvas) are co-dependent and ship in the same slice. |
| **Three-Scope Flywheel** | Every admin correction on the surface (a confirmed confidence flag, an applied improvement suggestion, an edited rate) emits a classification/learning signal (`classification_signals`) — Tenant scope immediately, Foundational/Domain on anonymization. One correction, four improvements. |

---

## §3 The Eight Concepts (locked design set)

All eight are RATIFIED by the architect as the design north-star (this session). They are **not eight independent builds** — they are facets of one organism, sequenced into vertical slices in §9. Each concept below: definition, the live data it reads, the substrate it advances, and its agency tier.

### Concept ① — The Living Plan Canvas *(core surface; Slice 1)*
The plan renders as a spatial graph of component cards — the prime-DAG made visible. Each card shows: component name, `componentType` primitive (tier / matrix / rate / scorecard / conditional / waterfall), the converged input binding (which `input_bindings` column feeds it), and — the differentiator — a **live distribution sparkline of where the tenant's actual entities land inside it**, computed from `committed_data.row_data` via the convergence binding. A tier card shows its tier table *with MIR's entities distributed across the tiers as a histogram*. This replaces both the grid and the form; it is the resting representation for view, edit, and simulate (no mode-switch).
- **Reads:** `rule_sets.components`, `rule_sets.input_bindings`, `committed_data.row_data`, `entities`.
- **Advances:** Korean Test (generic render dispatch), Thermostat (what/why/what-to-do per card).
- **Agency:** Tier 1 (observe) + edit affordance.

### Concept ② — Consequence-on-Hover *(co-dependent with ①; Slice 1)*
"Observation IS Action" as UX. When an admin drags a tier boundary or edits a rate, **every affected entity's payout delta recomputes live** — the canvas surfaces "N entities cross the threshold, aggregate payout Δ, M entities now at $0." This is the deterministic engine doing at design-time what it does at calc-time, over `committed_data` for the selected period. Distinct from a What-If sandbox: the plan *itself* is predictive.
- **Reads:** `committed_data.row_data`, `periods`; recomputes via engine contract.
- **Advances:** Decision 158 (deterministic recompute, not LLM estimate), Reaction-Prediction Simultaneity.
- **Agency:** Tier 2 (recommend with modeled impact) — the modeled impact *is* the consequence preview.

### Concept ③ — Plan Confidence Topology *(Slice 2)*
Per-component / per-rate / per-condition confidence (already produced by the Plan Reader) renders as a **visual heat-overlay**: high-confidence components recede; low-confidence or anomaly-flagged components glow amber/red and surface. The Plan Anomaly Registry severity model maps directly — Critical = red, expanded by default, requires acknowledgment; Warning = amber, collapsed but visible; Info = grey. Bloodwork Principle: clean summary, surface exceptions, detail on demand. *The number that matters is "Needs Review."*
- **Reads:** `rule_sets.components` (confidence fields), anomaly outputs, `classification_signals`.
- **Advances:** Carry Everything (flag-don't-hide), Bloodwork.
- **Agency:** Tier 1 (observe) + acknowledge affordance.

### Concept ④ — The Provenance Thread *(Slice 2)*
River Test made interactive. Every value traces to origin: click a rate → source plan-document sentence the Reader read it from + confidence + every tenant correction history; click a binding → which column, why it matched, token-overlap score. Directly attacks the category black-box wound; renders the audit/explainability value-prop rather than asserting it.
- **Reads:** `rule_sets.metadata` (provenance), `calculation_traces`, correction history in `classification_signals`.
- **Advances:** Prove Don't Describe, River Test.
- **Agency:** Tier 1 (observe).

### Concept ⑤ — Conversational Plan Authoring *(table-stakes, done structurally better; Slice 3)*
Natural-language plan/component creation and edit. Now table-stakes (CaptivateIQ, QuotaPath, Everstage claim it). Vialuce's version is structurally superior: because output is a convergence-bound structured rule-set, an NL edit ("add a 1.2× accelerator above 110% attainment") *instantiates a primitive, binds it, and immediately shows ② consequence-on-real-data* — a validated, simulated component, not a grid to then validate. Positioned as an **input method to ①②**, not the differentiation lead.
- **Reads/Writes:** LLM → structured component → `rule_sets.components` (deterministic write); ② preview before commit.
- **Advances:** Decision 158 (recognize→construct boundary at the authoring seam).
- **Agency:** Tier 3 (recommend-and-execute within engine contract), human-confirmed.

### Concept ⑥ — SPIFF Studio *(agentic showcase; Slice 4)*
Admin states a behavioral goal ("push Optical sales in Q3, Lima region"); the **Insight Agent + Allocation Intelligence** propose a SPIFF *designed against the tenant's actual entity distribution and marginal-return surface* — "what incentive, at what rate, on whom, moves the needle most per dollar." Then (Tier 3) instantiate the SPIFF as a real plan component within the engine contract. Beyond anyone in market: Everstage has SPIFF *contests with leaderboards* (gamified display of a human-designed SPIFF); this *designs the SPIFF from the performance surface*.
- **Reads:** Allocation Intelligence surface (marginal return, tier proximity, gate dependency), `entity_period_outcomes`, `committed_data`.
- **Advances:** DS-008-A2 productized, Three Tiers of Agency (full Tier 3).
- **Agency:** Tier 3.

### Concept ⑦ — Plan Improvement Advisor *(Slice 4)*
A standing panel (not a chatbot) reading confidence topology + anomaly registry + cross-component anomalies (metric-reuse inconsistency, disproportionate component weight >70% of payout, redundant component detection) + live entity distribution, surfacing ranked **modeled** improvement suggestions: "Component 3 and 5 are structurally redundant — consolidate? Component 2's gate excludes 31 entities who clear every other component — intended?" Each suggestion carries modeled impact (Tier 2); highest-confidence applies in one action (Tier 3). Thermostat at plan level: never a number without a recommendation.
- **Reads:** anomaly outputs, `rule_sets.components`, `entity_period_outcomes`, Allocation Intelligence.
- **Advances:** Thermostat, Three-Scope Flywheel (applied suggestions are training signal).
- **Agency:** Tier 2 → Tier 3.

### Concept ⑧ — Persona-Refracted Plan View *(architected day one; Rep/Manager refractions Slice 3)*
The *same plan object* renders differently by viewer (Briefing-First / persona-color model). **Admin** sees the editable canvas + confidence topology. **Manager** sees the plan as the Entity×Component heatmap (Decision-land: rows = team members, columns = components, cell intensity = attainment, tap-cell → bar detail) — the plan *as their team's performance through it*. **Rep** sees only their own path through the plan: "here's how your number becomes your payout," every component a transparent step, structured-dispute affordance inline. One object, three refractions. The architectural answer to the black-box rep-view wound.
- **Reads:** `profile_scope` (visible_rule_set_ids / visible_entity_ids), persona from `profiles`, `entity_period_outcomes`.
- **Advances:** Synaptic adaptation, Briefing-First.
- **Agency:** Tier 1 (Rep/Manager observe), Tier 1+edit (Admin).

> **Persona architecture decision (binding on Slice 1).** Even though Rep/Manager refractions are deferred, Slice 1 builds the canvas behind a **persona-resolution boundary** reading `profile_scope` and `profiles.persona` — so the Admin canvas is *one refraction of a persona-aware surface*, not a hardcoded admin page later retrofitted. The refraction seam is a Slice-1 structural requirement; the Rep/Manager renderers are the deferred part. This is the literal reading of "the ADMIN is the first view but the PERSONA will be important."

---

## §4 The Data Contract (against live MIR schema)

Verified against `SCHEMA_REFERENCE_LIVE.md` (36 tables). Every surface element binds to a real column; no element reads a field that does not exist. This is the DD-3-style classification: what each surface reads, from where, and whether it is structure / real-data-overlay / provenance / persona-scope.

### 4.1 Plan structure (the canvas skeleton) — `rule_sets`
| Surface element | Column | Class |
|---|---|---|
| Plan identity, name, version, status, effective window | `rule_sets.name`, `.version`, `.status`, `.effective_from/to` | structure |
| Component cards (the graph) | `rule_sets.components` JSONB → `configuration.variants[].components[]` | structure |
| Per-card primitive type | `components[].componentType` ∈ {matrix_lookup, tier_lookup, percentage, conditional_percentage, …} | structure |
| Per-card config (tier table, matrix grid, rate, conditions) | `components[].tierConfig` / `.matrixConfig` (rowBands/columnBands/values) / `.percentageConfig` / `.conditionalConfig` | structure |
| Per-card structural intent + confidence | `components[].calculationIntent`, `.confidence` | structure + provenance |
| Input bindings (which column feeds each component) | `rule_sets.input_bindings` JSONB | structure |
| Population / variant routing | `rule_sets.population_config` | structure |

> **HALT condition on JSONB shape (HALT-1, §7).** `rule_sets.components` shape has two observed dialects across tenants (the BCL Array vs Sabor Object divergence proven in OB-227, guarded by `breakdownToRecord`). The canvas reader **must** normalize via the same contract — never assume a single shape. MIR's actual shape is read at build time, not assumed from this spec.

### 4.2 Real-data overlays (the distribution sparklines, ① / ②) — `committed_data`, `entities`
| Surface element | Column | Class |
|---|---|---|
| Entity distribution inside a tier/matrix card | `committed_data.row_data` JSONB, joined to the component's bound column via `input_bindings` | real-data overlay |
| Period scoping for the overlay | `committed_data.period_id` / `.source_date`, `periods.start_date/end_date` | real-data overlay |
| Entity roster for "N entities" counts | `entities` (filtered by tenant + period resolution) | real-data overlay |

### 4.3 Consequence preview (②) — recompute surface
| Surface element | Source | Class |
|---|---|---|
| Pre-edit per-entity payout (baseline) | `calculation_results.components` / `.total_payout`, or `entity_period_outcomes.component_breakdown` | real-data overlay |
| Post-edit recompute | engine recompute over `committed_data.row_data` under the edited component (deterministic, Decision 158) | computed |
| Aggregate Δ, threshold-crossers, new-zeros | diff(baseline, recompute) | computed |

### 4.4 Confidence topology + provenance (③ / ④) — `calculation_traces`, `metadata`, `classification_signals`
| Surface element | Column | Class |
|---|---|---|
| Per-component / per-rate confidence heat | `components[].confidence` (+ anomaly outputs) | provenance |
| Value → source-sentence trace | `rule_sets.metadata` (provenance block) | provenance |
| Per-value calculation trace | `calculation_traces.formula/.inputs/.output/.steps` | provenance |
| Correction history | `classification_signals` (scope='tenant') | provenance |

### 4.5 Persona refraction (⑧) — `profile_scope`, `profiles`
| Surface element | Column | Class |
|---|---|---|
| Which plans this viewer may see | `profile_scope.visible_rule_set_ids` (uuid[]) | persona-scope |
| Which entities (Manager team / Rep self) | `profile_scope.visible_entity_ids` (uuid[]) | persona-scope |
| Persona (Admin/Manager/Rep) → refraction selector | `profiles.persona` (resolve at build; confirm column name in live `profiles`) | persona-scope |

> **Schema-verification gate (FP-49, binding on the Slice-1 OB).** Before any SQL/read ships, the OB queries `information_schema` for: the exact `profiles` persona column name, the `rule_sets.components` dialect for MIR's 5 plans, and the `input_bindings` shape. No assumption from this spec substitutes for the live query. This DS names the contract; the OB proves it.

---

## §5 Spatial Layout (Slice 1, Admin refraction)

The canvas is a three-zone surface. Layout is described structurally; the OB's frontend-design phase produces the rendered tokens per `frontend-design` SKILL and the Vialuce three-layer token architecture (Deep Indigo #2D2F8F / Gold #E8A838).

**Zone A — Plan Rail (left, persona-scoped).** MIR's 5 plans as a vertical list, each showing name, version, status chip, and a one-glyph health summary (the Concept-③ "Needs Review" count, dormant-but-present in Slice 1). Filtered by `profile_scope.visible_rule_set_ids`. Selecting a plan loads it into Zone B.

**Zone B — The Canvas (center, primary).** The selected plan's components as a spatial graph of cards (Concept ①). Variant selector at top (population_config-driven) when the plan has multiple variants. Each card:
- Header: component name + `componentType` primitive glyph + bound-column chip (from `input_bindings`).
- Body: the primitive's native visual — tier table / matrix grid / rate field / condition list — rendered by a **type-dispatched renderer with a generic fallback** (Korean Test).
- Footer: the live distribution sparkline (Concept ①) over MIR's committed data for the selected period; a confidence glyph (Concept ③, dormant Slice 1).
- Edit affordance: drag a tier boundary / edit a rate → Concept ② consequence preview fires inline.

**Zone C — Consequence Tray (right or bottom-docked, ② surface).** Appears on edit. Shows: baseline → proposed, aggregate payout Δ, count of threshold-crossers, count of new-zeros, per-affected-entity list (drill-through). Commit / discard. Commit writes to `rule_sets.components` (deterministic) and emits a `classification_signals` learning signal.

**Thermostat compliance:** every zone answers what / why / what-to-do. Zone B card = what (the rule) + why (the binding + distribution) + what-to-do (edit affordance). Zone C = what (the Δ) + why (which entities) + what-to-do (commit/discard).

---

## §6 Out of Scope (this DS)

- Plan **creation from scratch** as a blank-canvas flow — Concept ⑤ covers NL authoring of components into an existing or new rule_set, but a full guided blank-plan wizard is a separate DS if the NL path proves insufficient.
- Plan **versioning lifecycle** (mid-year change → new `rule_sets.version`) — named in the gap analysis as P1 but is its own surface; this DS reads `version` and `status`, does not build the version-transition workflow.
- **i18n full-site remediation** (Tier-1 demo blocker, MIR es-PE renders English) — the canvas must render labels from `components[]` (which carry es-PE labels) correctly, but the platform-wide i18n defect is tracked separately and is a hard dependency for the MIR demo, not solved here.
- Engine **calculation correctness** for MIR's plans (OB-214 interpreter scope) — the canvas renders and recomputes whatever the engine produces; it does not fix interpreter defects. If MIR plan interpretation is defective, the canvas will faithfully render the defect (which is itself diagnostically useful via Concept ④).
- Rep / Manager **rendered refractions** (Concept ⑧) — the refraction *seam* is in Slice 1; the Rep/Manager *renderers* are Slice 3.

---

## §6A Residuals (operative-state known gaps)

- **MIR interpreter defects (OB-214).** The 5 MIR plans have open interpreter defects. The canvas will surface them via Concept ③/④ rather than hide them, but a plan that interprets wrongly will render wrongly. Forward dependency: OB-214 closure improves canvas fidelity but is not a blocker for Slice 1 (the canvas renders whatever is in `rule_sets`).
- **`rule_sets.components` dialect divergence.** OB-227 proved Array vs Object shape divergence. The Slice-1 reader normalizes, but the canonical-shape question (should the engine emit one dialect?) is an open architectural item beyond this DS.
- **Allocation Intelligence surface availability.** Concepts ⑥/⑦ depend on the Allocation Intelligence surface (DS-008-A2) being populated for MIR. If unpopulated, Slice 4 is gated on a prior population pass. Confirm before Slice 4 intake.
- **i18n.** Platform-wide English-render defect for es-PE/es-MX tenants is a demo blocker for MIR independent of this surface. Must close in a parallel track before the MIR demo regardless of canvas state.

---

## §7 HALT Conditions

- **HALT-1 — `components` JSONB shape ambiguity.** If MIR's `rule_sets.components` does not match the `configuration.variants[].components[]` shape this DS assumes (e.g. a flat-components dialect, or the OB-227 Object dialect), CC halts and surfaces the actual shape verbatim for architect disposition before building the renderer. Do not coerce silently.
- **HALT-2 — `input_bindings` cannot resolve a component's column.** If a component's bound column is absent from `committed_data.row_data` for MIR (binding points at a column the data lacks), CC halts — the distribution sparkline (①) has no source. Surface the unresolved binding; do not fabricate a distribution.
- **HALT-3 — persona column absent.** If `profiles` has no persona/role column to drive the refraction seam, CC halts and surfaces the actual `profiles` + `profile_scope` columns for architect disposition. The refraction seam is a Slice-1 requirement; it cannot be stubbed with a hardcoded "admin" constant (that would violate the §3 persona architecture decision).
- **HALT-4 — recompute path unavailable.** If the engine cannot be invoked for a design-time recompute over `committed_data` without a full calculation-batch lifecycle, CC halts and surfaces the constraint. Concept ② requires a lightweight recompute path; if only the full batch path exists, that is an architect-disposition design question (the recompute seam may itself be a prerequisite OB).

---

## §8 EECI + IAP Scoring

### 8.1 Micro-EECI (the tetrad, per concept-set)
- **Efficiency.** One representation serves view + edit + simulate (no mode-switch, no separate sandbox). The renderer dispatches on `componentType` with a generic fallback — minimal general invariant, not an enumerated per-type page. Passes the AUD-009 test (no catalog that becomes the next bug).
- **Efficacy.** The gap-analysis WHEN-COMPLETE statement — "admin can view/edit plan components, rates, tier tables through the browser" — becomes literally true in a browser against MIR's 5 plans. Concept ② makes "what if I change this rate" (NOT BUILT, P2) true.
- **Comprehensive.** Substrate (Korean Test, Carry Everything, Decision 158, Three Tiers of Agency), CLT/anomaly registry (Concept ③/⑦), gap analysis (Category 2 P1 items), and the live schema (§4) all consulted and named. Domain-agnostic: renders ICM and Financial tenants identically.
- **Innovate.** Advances Reaction-Prediction Simultaneity (②), Synaptic adaptation (⑧), Progressive Performance (corrections feed the flywheel), and the Three Tiers of Agency to full Tier 3 (⑤/⑥). Not parity restoration — the Living Plan Canvas + consequence-on-hover has no market analog.

### 8.2 IAP Gate (Principle 9 — every UI measure scores all three or is cut)
| Concept | Intelligence | Acceleration | Performance |
|---|---|---|---|
| ① Living Canvas | distribution = real-data intelligence on every card | one surface, no mode-switch | scales to MIR 75K rows via aggregated sparkline (no per-row render) |
| ② Consequence-on-hover | modeled impact pre-commit | eliminates the run-to-see-result cycle | deterministic recompute, bounded to affected entities |
| ③ Confidence topology | confidence as first-class property | "Needs Review" focuses attention | recede-the-confident reduces visual load |
| ④ Provenance thread | every value explains its origin | one click to source | trace read on demand, not pre-rendered |
| ⑤ NL authoring | recognize→construct seam | concept-to-validated-component in one step | structured write, not formula parse |
| ⑥ SPIFF Studio | designs incentive from performance surface | goal-to-instantiated-SPIFF | reads precomputed Allocation Intelligence |
| ⑦ Improvement Advisor | modeled, ranked suggestions | one-action apply | reads existing anomaly/AI surfaces |
| ⑧ Persona refraction | viewer-adapted intelligence | right view, no navigation | one object, refracted at expression time |

All eight pass all three. None is cut.

---

## §9 Build Roadmap (vertical slices)

The eight concepts ship as four vertical slices. Each slice = one OB (engine + experience together, Vertical Slice Rule). Sequence numbers assigned from the live repo directory at each OB's intake — **not pre-assigned here** (no-invented-sequence-numbers). This DS is the citation source each OB's §0 references.

| Slice | Concepts | Why this grouping | Proof gate (browser, MIR) |
|---|---|---|---|
| **Slice 1** | ① + ② + ⑧-seam | The resting representation and its consequence preview are co-dependent (Vertical Slice Rule); the persona seam must exist day one. This is the minimal shippable organism. | MIR's 5 plans render as canvases from `rule_sets`; a tier-boundary edit shows live consequence over MIR committed data; the surface resolves through `profile_scope` (admin refraction). |
| **Slice 2** | ③ + ④ | Confidence topology and provenance are read-only overlays on the Slice-1 canvas; they share the trace/metadata read path. | A low-confidence MIR component glows and is acknowledgeable; a rate traces to its source sentence + correction history. |
| **Slice 3** | ⑤ + ⑧ Rep/Manager renderers | NL authoring writes into the Slice-1 structure and previews via ②; the Rep/Manager refractions consume the same object behind the Slice-1 seam. | An NL edit instantiates a validated MIR component with consequence preview; a Manager sees the Entity×Component heatmap; a Rep sees their own path. |
| **Slice 4** | ⑥ + ⑦ | Both consume the Allocation Intelligence surface and the anomaly registry; both are full Tier-3 agentic. Gated on Allocation Intelligence populated for MIR (§6A). | SPIFF Studio designs a SPIFF from MIR's marginal-return surface and instantiates it; the Advisor surfaces a modeled, applicable improvement on a real MIR plan. |

**First action.** On architect lock of this DS, intake **Slice 1 as an OB** through the capability-governance INTAKE checklist (parse → substrate consult → Micro-EECI → standing protocol with live sequence number → cross-link to this DS §9 + the gap-analysis Category-2 P1 row + the relevant MC#). The Slice-1 OB is the "build out ASAP" artifact; this DS is its locked design source.

---

*DS-029 · The Living Plan Surface · 2026-06-21*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Proof tenant: MIR · Primary persona: Admin (persona-refracted from day one)*
*Authored per INF_Structured_Compliant_Drafting_Reference (DD-1–DD-12) · Standing rules per CC_STANDING_ARCHITECTURE_RULES.md v2.0*
*Lock candidate: Decision 159-class (Plan Surface representation contract)*
