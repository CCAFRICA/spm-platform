# DS-029: CARRIER EXPRESSION ARCHITECTURE

**VIALUCE**
*Intelligence. Acceleration. Performance.*

**Date:** 2026-06-13
**Category:** DS (Design Specification)
**Sequence number:** DS-029 — architect-asserted. Phase 0 of any implementing OB performs live collision check against repo directory.
**Status:** DRAFT — architect disposition pending
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — principles applied (DD-9 prose-implementation match, DD-11 no internal duplication); DS-category documents produce no code and no CC execution phases.

---

## Governing Documents (Authority Hierarchy)

| Tier | Document | Binding Authority |
|---|---|---|
| Constitutional | DS-021 (Substrate Architecture Biological Lineage, LOCKED 2026-04-30) | Role 3 Express — the Observation surface's commitments. "Read from the carrier, not from private narrowed copies." |
| Governing | DS-013 (Platform Experience Architecture, 2026-03-10) | Intelligence stream replaces navigation. Five Elements. CRL tiers. IAP Gate. 10-test battery. |
| Implementing | DS-015 (Intelligence Stream Evolution, 2026-03-14) | Intelligence element specifications. Action Proximity table. Phase A–E progression. |
| Research | DS-008 series (Performance Intelligence, A1/A2/A3, 2026-03-07) | Structural definition. Allocation intelligence. Platform agency tiers. Action Card anatomy. |
| Methodology | TMR-2 (Wayfinder), TMR-3 (Compensation Clock), TMR-5 (Intuitive Adjacency), TMR-6 (T-1 Data Visibility), TMR-7 (Persona Visualization Psychology), TMR-8 (Cognitive Fit Framework), Design Vision (five design tests) | Complete UX/UI methodology stack. |
| Commercial | PLG Strategy (2026-02), VVSPv3 | Activation moment. Value proposition. IAP Gate authority. |
| Component | DS-003 (Visualization Vocabulary), DS-005 §6 (Ingestion Dashboard) | Component specifications. Post-import dashboard design. |
| Inventory | FRMX Comprehensive Audit, FM Views Data Persona Analysis | Existing domain components. Persona roles. |
| Gap evidence | ICM User Production Readiness Audit, Launch Materials Gap Analysis, Platform Experience Assessment (2026-03-16) | Empirical ground: what's broken, what's missing, what was promised. |

---

## §1 — PROBLEM STATEMENT

### 1.1 The Gap

The substrate (DS-021) defines five expression surfaces under Role 3 (Express): Calculation, Observation (UI), User Modification (UI), Reporting, and Forensics (Consciousness). Of these, only Calculation is fully wired to the carrier. The Observation surface currently reads exclusively from `calculation_results` and `entity_period_outcomes` — tables that exist only after a plan is created, bindings converge, and the Calculation expression surface operates.

DS-021 §3 Role 3 specifies the Observation surface as: *"surfaces carried content + interpretations + calculation results to humans for trust, comprehension, and disposition."* The first two data sources — carried content and interpretations — are available the moment SCI import completes. The platform ignores them.

### 1.2 What Breaks

The value proposition (PLG Strategy §5) promises three things the platform cannot deliver post-import:

- **"Reps work with t-1 data — seeing yesterday's performance reflected today"** — Where? Nothing in the Operate workspace surfaces `committed_data`. TMR-6 redefined T-1 to mean "yesterday's data visible today," not monthly cycles.
- **"Full transparency into every transaction"** — Where? The MX Restaurant tenant has 160,443 transactions in `committed_data`. All invisible.
- **"Managers gain immediate visibility into performance, payouts, and exceptions"** — Where? The intelligence stream reads from calculation output. Before calculation, it has nothing to show.

The import completion screen says "Import Complete. Go to Calculate." If there is no plan, no bindings, no calculation — as with any Financial/POS tenant — the platform offers nothing. 162,956 carried rows vanish into the carrier with no return path to the user.

### 1.3 The Defect Class

This is not a missing page. It is a disconnected expression surface. The substrate's Carry role operates correctly (SCI proven across BCL, Meridian, CRP, MX Restaurant). The substrate's Interpret role operates correctly (classification, entity binding, convergence). The substrate's Express role operates correctly for Calculation. The Observation expression surface's connection to the carrier does not exist. DS-029 specifies that connection.

### 1.4 PLG Activation Impact

The PLG Strategy §3 (Activation) defines the "Aha Moment" as "see your first calculation result from your own data." But the trust-building bridge between upload and calculation — seeing the platform understood your data, recognized your entities, classified your sheets — currently does not exist. The user goes from "file uploaded" to "Import Complete" with no evidence that the platform comprehended what it received. DS-029 provides that confidence bridge. It makes the SCI intelligence visible to the user, which is the prerequisite for trusting the calculation that follows.

---

## §2 — SUBSTRATE-BOUND DISCIPLINE

### 2.1 DS-021 Binding (Constitutional)

DS-029 fulfills, does not amend, DS-021:

**Role 3 Express commitment:** "Read from the carrier, not from private narrowed copies." — DS-029 specifies how the Observation surface reads from `committed_data`, `entities`, `classification_signals`, `import_batches`, and `periods` directly.

**Express Contextually:** "Each surface narrows for its purpose at expression time." — The Observation surface does not dump all carrier data to the user. It expresses contextually: persona determines density, CRL determines confidence disclosure, domain classification determines component selection.

**No stale state (Decision 68):** Carrier-expression intelligence elements read live carrier state on each render. No cached snapshots of `committed_data` row counts or entity counts.

**Five Layers of Proof at Forensics:** DS-029 does not touch the Forensics expression surface, but carrier-expression elements must support trace-to-source: every intelligence element citing a carrier fact must link to the specific `import_batches` record and `committed_data` content unit that produced it.

### 2.2 DS-013 Binding (Governing)

**Paradigm 3:** DS-029 produces intelligence elements for the intelligence stream — not pages, not dashboards, not data viewers. The user does not navigate to carrier data. Carrier intelligence finds the user through the ranked intelligence stream.

**Five Elements mandatory:** Every carrier-expression intelligence element contains Value + Context + Comparison + Action + Impact. Elements missing any one fail the IAP Gate.

**CRL tiers govern:** What the Observation surface can say about carried content depends on the CRL confidence tier. Cold tier: factual inventory. Warm tier: comparative intelligence. Hot tier: predictive intelligence. The confidence tier system (DS-013 §3) extends to carrier expression, not just calculation output.

**Persona as intelligence filter:** Persona determines which carrier intelligence elements rank highest, not which page the user sees. Admin sees system health and import governance. Manager sees team-relevant entity data and binding status. Individual sees personal entity record and transaction coverage.

### 2.3 Design Test Battery

Every carrier-expression element and every carrier-expression surface must pass all tests before implementation:

From DS-015 §10: IAP Gate, Five Elements, Thermostat, Action Proximity, Cognitive Fit (DS-003), Reference Frame (DS-003), Korean Test, Confidence Disclosure, Stability Test, Scale (150K).

From Design Vision: Korean Test (structural, not linguistic), 150K Test (enterprise scale), River Test (every transformation traceable), Thermostat Test (what/why/what-to-do), Brilliant Functionality Test (compute cost predictable per tier).

From TMR-8: Cognitive Fit Test (six questions: decision task, form match, form reuse, reference frame, processing mode, nature metaphor).

---

## §3 — CARRIER INTELLIGENCE ELEMENTS

These are the new intelligence elements the intelligence stream produces from carrier state alone (no calculation dependency). Each extends DS-015 §5's existing element table.

### 3.1 Import Health (Admin Persona Primary)

| Element | Content | Source |
|---|---|---|
| Value | N rows committed across M content units from K files | COUNT(*) on `committed_data` grouped by `content_unit_type`; COUNT(*) on `import_batches` |
| Context | N entities bound (X% coverage). Classification confidence: Y%. Import time: Z seconds. | `entities` COUNT, `classification_signals` avg confidence, `import_batches.duration` |
| Comparison | Prior import: N-1 rows, M-1 content units. Delta: +/- rows, +/- entities. | Previous `import_batches` record for same tenant |
| Action | "Review classifications" (if confidence < 70%) / "Calculate this period" (if all bindings complete) / "Import additional data" (if entity binding incomplete) | Derived from classification confidence threshold + entity binding coverage |
| Impact | "Calculating will produce commission statements for N entities across M components." / "3 content units at <70% confidence — review before calculating to prevent misclassification." | Derived from `rule_sets.components` + entity count + classification confidence |

**Cognitive task:** Identification + Monitoring. **Visual form:** HeroMetric for row count + entity count. Sparkline for import-over-import trending (when ≥2 imports exist). **Density:** Admin-appropriate (high). **Persona color:** Indigo ambient.

**Action Proximity:** "Review classifications" → inline expansion showing content unit list with confidence bars and classification type. "Calculate" → navigates to /operate/calculate with period pre-selected. Both within the stream, per DS-015 §7.

### 3.2 Entity Landscape (Admin and Manager Persona)

| Element | Content | Source |
|---|---|---|
| Value | N entities discovered. M with complete attribute sets, K with partial. | `entities` grouped by attribute completeness |
| Context | Binding coverage: X% of entities bound to imported transaction rows. Entity types: roster, location, hierarchy. | `committed_data` entity binding metadata |
| Comparison | Prior import generation: N-1 entities. New: +P. Unchanged: Q. | Entity count delta across import generations |
| Action | "View entity details" (inline expansion) / "Configure hierarchy" (navigates to /configure/entities) | Admin: both available. Manager: "View my team" scoped to visible_entity_ids |
| Impact | "Full entity binding enables per-entity commission calculation. K entities with incomplete attributes may produce partial results." | Derived from binding completeness + plan requirements |

**Cognitive task:** Identification (Admin), People-focused monitoring (Manager). **Visual form:** Admin: count cards + completeness bar. Manager: entity list sorted by team membership with binding status badges. **Density:** Admin high, Manager medium. **Persona color:** Admin indigo, Manager amber.

### 3.3 Data Coverage (All Personas, Scoped)

| Element | Content | Source |
|---|---|---|
| Value | Your data: N transactions imported across date range [start–end]. | `committed_data` WHERE entity matches user's entity (for Individual), WHERE entity IN visible_entity_ids (for Manager), WHERE tenant (for Admin) |
| Context | Content unit types present: Transaction (N rows), Roster (M rows), Target (K rows). Temporal span: [earliest source_date] to [latest source_date]. | `committed_data` grouped by `content_unit_type` + MIN/MAX `source_date` |
| Comparison | Cold: no comparison available (first import). Warm: "Feb has 12% more transaction rows than Jan." Hot: "Feb volume is consistent with seasonal pattern — expected range was N±σ." | CRL-governed: Cold=none, Warm=period-over-period, Hot=pattern-based prediction |
| Action | Individual: "View my transactions" (inline expansion). Manager: "View team data coverage" (inline expansion). Admin: "Drill into content unit" (inline expansion showing sheet-level breakdown). | Persona-scoped |
| Impact | "All transaction data for the current period is present. Ready for calculation." / "Missing: Target data for 12 entities. Import targets to enable attainment calculation." | Derived from content unit type coverage vs plan requirements |

**Cognitive task:** Identification (Individual — "is my data here?"), Monitoring (Manager — "is the team data complete?"), Planning (Admin — "are we ready to calculate?"). **Visual form:** Individual: single-row confirmation card with date range. Manager: team coverage summary. Admin: content unit breakdown table with completeness indicators. **Density:** Individual low (maximum 2 elements), Manager medium, Admin high.

### 3.4 Classification Intelligence (Admin Persona)

| Element | Content | Source |
|---|---|---|
| Value | SCI classification: N content units classified. M at Tier 1 (structural match, LLM skipped). K at Tier 2 (LLM-assisted). | `classification_signals` grouped by tier |
| Context | Flywheel status: "15th structural fingerprint match — classification is deterministic for this file structure." | Flywheel match count from `classification_signals` |
| Comparison | "First import required full LLM classification (4.2 seconds). This import used cached structural fingerprint (1.1 seconds)." | Processing duration delta |
| Action | "View classification trace" (inline expansion showing per-content-unit agent scores, confidence, classification rationale). | Admin only — diagnostic surface |
| Impact | "Deterministic classification reduces processing cost and eliminates classification variability. Progressive Performance active." | Flywheel maturity assessment |

**Cognitive task:** Monitoring (system health). **Visual form:** Tier distribution bar (Tier 1 green, Tier 2 amber, Tier 3 red). Processing time sparkline across imports. **Density:** Admin only, high density acceptable. **Persona color:** Indigo.

### 3.5 Pipeline Readiness (Admin Persona — DS-015 §5.5 Extension)

DS-015 §5.5 already specifies a Pipeline Readiness element. DS-029 extends it with carrier-direct data:

| Element | Content | Source |
|---|---|---|
| Value | Pipeline status: [Data: ✓] [Entities: ✓] [Plan: ✓/✗] [Bindings: ✓/✗] [Calculate: ready/blocked] | Carrier tables + `rule_sets` + convergence binding status |
| Context | "Data imported. Entities discovered. Plan active. Convergence bindings complete. Ready to calculate." OR "Missing: plan interpretation. Upload compensation plan to proceed." | Derived from presence/absence of each pipeline prerequisite |
| Comparison | Prior period: "January calculated in 3.2 seconds. February data is 12% larger — estimated calculation time: 3.6 seconds." | Historical calculation batch performance |
| Action | ConfigurablePipeline visualization (DS-003 §1.6): Import✓ → Classify✓ → Bind✓ → Calculate○ → Reconcile○. Active step highlighted with proximate action button. | Planning task — the pipeline IS the carrier expression's planning surface |
| Impact | "Calculating February will produce commission statements for 85 entities across 4 components." | Derived from entity count + component count |

**Cognitive task:** Planning. **Visual form:** ConfigurablePipeline (DS-003). **Action Proximity:** The active step's action button fires directly — "Calculate" at the Calculate step, "Import" at the Import step, "Upload Plan" at the Plan step. One click from status to action. TMR-5 (Intuitive Adjacency) compliant.

---

## §4 — POST-IMPORT TRANSITION

### 4.1 The Moment of Import Completion

Currently: "Import Complete. Go to Calculate." No evidence of comprehension.

DS-029 specifies: Import completion triggers an intelligence stream update. The import completion surface itself transforms from a terminal confirmation into a carrier intelligence summary with forward action.

**Import completion surface (replaces current static confirmation):**

The import completion screen renders as a carrier intelligence briefing containing:

1. **Import summary** (Five Elements: Value = row count + entity count + content unit count; Context = classification types + confidence; Comparison = vs prior import if exists; Action = "View in Stream" or "Calculate" or "Review Classifications"; Impact = what becomes possible with this data).

2. **Entity discovery summary** (Five Elements: Value = N entities found/matched; Context = binding coverage %; Comparison = new vs existing; Action = "View entities" inline; Impact = "N entities ready for per-entity calculation").

3. **Forward action** (Thermostat): the single highest-priority next step, derived from pipeline readiness state. If plan exists + bindings complete → "Calculate." If plan missing → "Upload plan." If bindings incomplete → "Review entity bindings."

The import completion surface is NOT a new page. It is the SCI wizard's final step, transformed from static confirmation into a carrier intelligence briefing that passes the DS-013 test battery.

### 4.2 Intelligence Stream Update on Import

When import completes, the intelligence stream (/stream) updates to reflect the new carrier state. The carrier intelligence elements from §3 re-evaluate. If the user navigates to /stream after import, they see:

- Import Health element with the just-completed import's statistics
- Pipeline Readiness updated to reflect new data availability
- Entity Landscape updated with any newly discovered entities
- Data Coverage updated with the imported content unit's date range

No page refresh required if the user is already on /stream — the elements re-render on carrier state change. This is the Observation expression surface consuming from the carrier in real time.

### 4.3 PLG Activation Bridge

For PLG (self-service onboarding), the import completion moment is the trust-building bridge between Step 2 (Upload Data) and Step 3 (See Results) of the PLG Strategy §3:

**What the user needs to believe at this moment:** "The platform understood my data." Without this belief, calculating produces anxiety, not confidence. The carrier intelligence briefing on import completion provides the evidence: "We found 85 employees across 6 locations. We classified your file as transaction data with 94% confidence. We matched all entities to your roster. You're ready to calculate."

This is the difference between "we stored your file" and "we understood your data." The first is infrastructure. The second is intelligence. DS-029 delivers the second.

---

## §5 — CARRIER EXPRESSION IN THE CIRCADIAN SYSTEM

### 5.1 The Queue (TMR-3, Mission Control Living System)

The Queue is the action stream — the peripheral nervous system telling each organ what it needs to do. DS-029 extends the Queue with carrier-derived action items:

| Queue Item | Persona | Trigger | Action |
|---|---|---|---|
| "3 files received, 2 processed, 1 pending classification review" | Admin | Import batch with <70% confidence content unit | Review classification |
| "February data imported. Ready to calculate." | Admin | Import complete + plan active + bindings complete | Calculate |
| "New entity detected: [entity name]. Not in current roster." | Admin | Entity created during import with no roster match |  Review entity |
| "Missing target data for current period." | Admin | Plan requires targets + no target content unit in carrier for active period | Import targets |

**Queue items for carrier state follow the same priority-ranking algorithm as lifecycle Queue items.** Carrier items that block calculation rank above informational items.

### 5.2 The Pulse (TMR-3, Mission Control Living System)

The Pulse is the vital signs — feedback loops that indicate organism health. DS-029 extends the Pulse with carrier health metrics:

| Pulse Metric | Decision Task | Visual Form (DS-003) |
|---|---|---|
| Entity binding coverage (%) | Monitoring | Sparkline trending over imports |
| Classification confidence (avg %) | Monitoring | Sparkline with threshold reference line at 70% |
| Import freshness (time since last import) | Monitoring | HeroMetric with T-1 reference ("Last import: 2 hours ago") |
| Content unit completeness (types present vs plan requirements) | Identification | Checklist with ✓/✗ per required type |

### 5.3 The Cycle (TMR-3, Mission Control Living System)

The Cycle is the compensation rhythm — the pacemaker. DS-029 extends the Cycle to include ingestion state alongside lifecycle state:

Current Cycle: `DRAFT → PREVIEW → OFFICIAL → APPROVE → POST → CLOSE → PAID`

Extended Cycle with carrier phases: `IMPORT → CLASSIFY → BIND → [DRAFT → PREVIEW → OFFICIAL → APPROVE → POST → CLOSE → PAID]`

The carrier phases (Import, Classify, Bind) precede the lifecycle phases. They represent the data-readiness stages that must complete before calculation can begin. The ConfigurablePipeline (DS-003 §1.6) visualization extends to show these carrier phases as the upstream segment of the lifecycle stepper.

---

## §6 — PERSONA × CARRIER INTELLIGENCE MATRIX

Per TMR-7 (Persona-Driven Visualization Psychology), each persona has a different cognitive contract with carried data. This section specifies what each persona sees, the cognitive task it serves, the visualization form, the density, and the color psychology.

### 6.1 Admin — Governance and System Health Assessment

**Primary cognitive task:** "Is the data correct, complete, and ready for calculation?"

**Carrier intelligence elements (ranked by priority):**

1. Pipeline Readiness (§3.5) — Planning task — ConfigurablePipeline
2. Import Health (§3.1) — Identification + Monitoring — HeroMetric + Sparkline
3. Classification Intelligence (§3.4) — Monitoring — Tier distribution bar
4. Entity Landscape (§3.2) — Identification — Count cards + completeness bar
5. Data Coverage (§3.3) — Monitoring — Content unit breakdown table

**Density:** Highest. Multiple visualization types. Tables acceptable. Dense grid layouts. Maximum 5–6 elements from carrier state.

**Ambient environment:** Indigo (analytical, authority, trustworthiness).

**Reference frame:** Every carrier metric includes a reference: row count vs prior import, entity binding vs 100% target, classification confidence vs 70% threshold, import freshness vs T-1 standard.

### 6.2 Manager — People Development and Acceleration

**Primary cognitive task:** "Is my team's data present and complete?"

**Carrier intelligence elements (ranked by priority):**

1. Team Data Coverage — "All 12 team members have transaction data for February. Coverage: 100%." — Identification task
2. Entity Status — "2 new team members detected in this import. Binding status: matched." — Identification task
3. Forward Action — "Team data complete. When admin calculates, you'll see coaching priorities." — Planning task

**Density:** Medium. People-focused cards with entity names and status badges. 2-column layouts.

**Ambient environment:** Amber (optimism, mentorship, recognition).

**Key constraint:** Manager sees only entities within `visible_entity_ids`. Carrier expression respects the same entity-scoping rules as calculation-result expression. No carrier data leaks outside the manager's team boundary.

### 6.3 Individual — Self-Directed Mastery and Progress Tracking

**Primary cognitive task:** "Is my data here? Can I trust it?"

**Carrier intelligence elements (ranked by priority):**

1. Personal Data Confirmation — "Your transaction data for February is imported. N transactions across date range [start–end]." — Identification task
2. Forward Action — "Waiting for calculation. You'll see your commission statement once admin runs February calculations." — Planning task

**Density:** Lowest. Maximum 2 elements from carrier state. Hero confirmation dominant. Single-column focus.

**Ambient environment:** Emerald (growth, safety, trajectory). The carrier-expression element for the Individual should feel safe and confirmatory — "your data is here, the system has it, you'll see your results soon." This is trust-building, not information-dense.

---

## §7 — CRL CALIBRATION FOR CARRIER EXPRESSION

CRL (DS-013 §3, CRR Specification) governs the entire platform experience, not just SCI classification. DS-029 specifies how the three confidence tiers affect what carrier intelligence elements can say.

### 7.1 Cold Tier (First Import, Periods 1–2)

The system has just met this tenant. It knows the structural classification but has no historical patterns.

**Carrier intelligence says:** Factual inventory only. "162,956 rows across 16 content units. 85 entities bound. Classification confidence: 94%." No comparisons, no predictions, no anomaly detection. Value + Context only; Comparison element states "First import — no comparison available."

**Confidence disclosure:** "This is your first import. Classification is based on structural analysis. Subsequent imports will improve accuracy through flywheel learning."

### 7.2 Warm Tier (Repeat Imports, Periods 3–6)

The system has seen this tenant's data structure before. The flywheel has cached structural fingerprints. Import-over-import deltas are available.

**Carrier intelligence says:** Comparative intelligence. "February has 12% more rows than January. 3 new entities detected since last import. Classification confidence improved from 88% to 94% — flywheel learning active." All Five Elements fully populated. Action elements become specific: "February data is complete and matches January's structure. Calculate to see period-over-period trajectory."

**Confidence disclosure:** "Classification is based on 6 prior imports with structural fingerprint match. Reliability: high."

### 7.3 Hot Tier (Established Patterns, Periods 7+)

The system knows this tenant's data deeply. Behavioral patterns established. Cross-tenant priors available.

**Carrier intelligence says:** Predictive intelligence. "February import matches expected pattern. Note: Target data sheet is missing — prior imports included targets. Import targets to enable attainment calculation." Anomaly detection active: "3 entities show transaction volume 2σ below their 6-month mean. Flag for manager review after calculation."

**Confidence disclosure:** "Based on 12 prior imports and cross-tenant structural patterns. Reliability: very high. Anomaly detection active."

---

## §8 — DOMAIN EXPRESSION COMPONENTS

### 8.1 Architecture

The Observation expression surface invokes domain-specific visualization components based on what the carrier carries and what the interpretations classified. The selection is structural (content type, classification signals), never domain-string-matched. Korean Test compliant.

**Selection logic:**

```
IF carrier contains content_unit_type matching Financial/POS classification signals
  → invoke Financial domain components (Network Pulse, Revenue Timeline, etc.)
IF carrier contains content_unit_type matching ICM classification signals  
  → invoke ICM domain components (transaction trace, entity performance, etc.)
IF carrier contains content_unit_type with no domain-specific match
  → invoke structural-only components (content unit browser, entity explorer, row-level drill)
```

The domain component selection reads from `classification_signals`, not from tenant module configuration. A tenant that imports POS data gets Financial domain components regardless of whether the "Financial module" is commercially activated. The data determines the expression; the commercial module determines the billing.

### 8.2 Financial Domain Components (Reconnection)

The five existing FM visualization components (built OB-11 through OB-13B) become domain expressions of the carrier:

| Component | Current Data Source | DS-029 Data Source | Reconnection |
|---|---|---|---|
| Network Pulse | Old FM import pipeline (localStorage) | `committed_data` WHERE content_unit_type = POS/Financial classification | Read from carrier instead of legacy FM tables |
| Location Benchmarks | Old FM import pipeline | `committed_data` + `entities` WHERE entity_type = location | Entity-scoped carrier read |
| Revenue Timeline | Old FM import pipeline | `committed_data` temporal aggregation by source_date | Carrier temporal expression |
| Staff Leaderboard | Old FM import pipeline | `committed_data` + `entities` WHERE entity_type = staff | Entity-scoped carrier read |
| Leakage Monitor | Old FM import pipeline | `committed_data` WHERE classification contains leakage indicators | Carrier-classified expression |

**Korean Test:** These components read from `committed_data` using structural identifiers (content_unit_type, entity_type, classification signals). They do not reference "FM" or "Financial" or "POS" in their data access layer. A Korean restaurant uploading Korean-language POS data would produce the same component selection.

**Six FM persona roles (from FM Views Data Persona Analysis):** Franchisor HQ, Regional Manager, Location Manager, Multi-Location Manager, Server/Mobile, Corporate. These map onto the three structural persona tiers (Admin, Manager, Individual) with density and scope variations. The mapping is domain configuration, not architectural — the carrier expression architecture is domain-agnostic.

### 8.3 ICM Domain Components (Future, Governed by DS-029)

ICM-specific carrier expression components — not yet built — follow the same architecture:

| Component | Purpose | Data Source |
|---|---|---|
| Transaction Viewer | Browse individual transactions for an entity | `committed_data` scoped by entity + period |
| Entity Roster | View all entities with attributes and binding status | `entities` + `committed_data` binding metadata |
| Rule Assignment Viewer | View which entities are assigned to which rule sets | `rule_set_assignments` + `entities` |

These are the "full transparency into every transaction" surfaces the value proposition promises. They exist in the carrier and require no calculation to express.

### 8.4 Structural-Only Components (Domain-Agnostic)

For data that matches no domain-specific classification (or for tenants in cold-start before domain classification matures), structural-only components provide carrier expression:

| Component | Purpose | Data Source |
|---|---|---|
| Content Unit Browser | Browse all content units committed for this tenant, with row counts, classification types, date ranges | `committed_data` grouped by content_unit + `classification_signals` |
| Entity Explorer | Browse all discovered entities with attributes, relationships, binding status | `entities` + `entity_relationships` |
| Import History | View all import batches with file names, row counts, processing duration, classification confidence | `import_batches` + `classification_signals` |

These are the minimum viable carrier expression surfaces. Every tenant, regardless of domain, gets these. They are the Observation expression surface's structural baseline.

---

## §9 — SIGNAL CAPTURE FROM CARRIER INTERACTION

### 9.1 Progressive Performance Contract

DS-021 Property P3 (Progressive Optimization): "Better interpretations, better expressions, better operational behavior emerge through continued use." DS-029 extends this property to the Observation surface: every user interaction with carrier-expression elements produces a signal that feeds the tenant flywheel from import day one, before any calculation runs.

### 9.2 Signal Types

| Interaction | Signal Type | Feeds |
|---|---|---|
| User drills into content unit detail | `carrier_observation.content_unit_drill` | Tenant flywheel: which content units users inspect most → future import summary prioritization |
| User browses entity in Entity Explorer | `carrier_observation.entity_browse` | Tenant flywheel: which entities are inspected → coaching priority seed |
| User confirms/overrides classification | `carrier_observation.classification_disposition` | SCI classification flywheel (existing) + CRL authority update |
| User clicks "Calculate" from carrier intelligence element | `carrier_observation.calculate_trigger` | Pipeline readiness assessment: how quickly users move from import to calculation |
| User views import history | `carrier_observation.import_history_view` | Tenant flywheel: import frequency patterns → T-1 freshness expectations |

### 9.3 Signal Storage

Carrier-expression signals are stored in `classification_signals` (the existing canonical signal surface per Decision 64 v2), with `signal_source = 'carrier_observation'` as a new source type. They follow the same three-level structure (Classification, Comprehension, Convergence) as SCI classification signals.

This means the carrier-expression layer is non-amnesiac from its first activation. Every user interaction with carried data strengthens future classification, future carrier expression prioritization, and future intelligence element ranking. The surface produces value on its first encounter and compounds with every subsequent one.

---

## §10 — IMPLEMENTATION PATH

DS-029 is a governing specification, not an OB prompt. Implementation will be phased across multiple OBs. The phasing follows the carrier→intelligence→domain progression:

### Phase 1: Structural Carrier Expression (Cold Tier)

Build the five carrier intelligence elements (§3.1–§3.5) and the three structural-only components (§8.4). Wire the import completion transition (§4.1). Signal capture infrastructure active but adaptation dormant.

**Proof:** Any proof tenant post-import renders carrier intelligence elements in the intelligence stream. Import completion shows carrier intelligence briefing. Content Unit Browser, Entity Explorer, and Import History accessible from stream actions. All elements pass the 10-test battery.

**Prerequisite OBs/HFs:** DS-027 (User Provisioning/RBAC) for persona-scoped carrier expression. OB-201 (Bliss design system) for visual foundation.

### Phase 2: Domain Component Reconnection

Reconnect existing FM visualization components to read from `committed_data` instead of legacy FM import pipeline (§8.2). Add ICM transaction viewer and entity roster (§8.3). Domain component selection driven by classification signals.

**Proof:** MX Restaurant (Financial/POS tenant) import → intelligence stream invokes Network Pulse, Revenue Timeline, etc., reading from `committed_data`. BCL (ICM tenant) import → intelligence stream invokes transaction viewer, entity roster. Korean Test: a tenant importing data classified as POS produces FM components regardless of tenant module configuration.

### Phase 3: Circadian Integration + CRL Warm Tier

Extend Queue/Cycle/Pulse with carrier-derived items (§5). Activate CRL Warm tier for carrier expression (§7.2): comparative intelligence, import-over-import deltas, flywheel maturity indicators.

**Proof:** BCL with 6+ periods of import history shows comparative carrier intelligence ("February has 12% more rows than January"). Queue shows carrier-derived action items. Pulse shows carrier health metrics.

### Phase 4: CRL Hot Tier + Predictive Intelligence

Activate CRL Hot tier for carrier expression (§7.3): predictive intelligence, anomaly detection on carrier data, missing-data prediction based on prior import patterns.

**Proof:** Established tenant shows predictive carrier intelligence ("Based on prior imports, Target data is expected but not yet received for this period").

Each phase is a vertical slice: carrier data flows through the Observation expression surface, intelligence elements render with Five Elements, persona scoping applies, signal capture stores observations, and the user sees the result. Engine and experience together. Always.

---

## §11 — WHAT THIS REPLACES

| Previous Concept | Status | Replaced By |
|---|---|---|
| Import completion as static confirmation | SUPERSEDED | Import completion as carrier intelligence briefing with Five Elements and forward action (§4) |
| "Go to Calculate" as post-import CTA | SUPERSEDED | Context-derived next action: Calculate, Upload Plan, Review Classifications, or Review Bindings depending on pipeline readiness state |
| FM views as standalone pages wired to old FM import | ABSORBED | FM views as domain expression components invoked by the intelligence stream based on carrier content classification (§8.2) |
| DS-005 §6 Ingestion Dashboard | ABSORBED | DS-005 §6 designed Operate-workspace ingestion sections. DS-029 absorbs this into the intelligence stream paradigm — the intelligence stream IS the ingestion dashboard, ranked by impact, persona-scoped |
| "Data Explorer" as a page concept | PREVENTED | DS-013 eliminated dashboard-first. There is no Data Explorer page. There are carrier intelligence elements in the stream and domain expression components reached from stream actions |

---

## §12 — WHAT THIS DOES NOT REPLACE

| Concept | Status | Why Preserved |
|---|---|---|
| DS-013 (Platform Experience Architecture) | PRESERVED AND GOVERNING | DS-029 is an application of DS-013, not a replacement. The intelligence stream, Five Elements, CRL tiers, persona model — all DS-013 — remain the governing architecture. |
| DS-015 (Intelligence Stream Evolution) Phases A–E | PRESERVED AND EXTENDED | DS-029 adds carrier intelligence elements to DS-015's element table. DS-015's Phase A–E progression remains the implementation framework; DS-029's phases integrate with it. |
| DS-003 (Visualization Vocabulary) | PRESERVED AND EXTENDED | DS-029 may add new component types (Content Unit Browser, Entity Explorer) to the DS-003 vocabulary. Existing components unchanged. |
| Calculation expression surface | UNTOUCHED | DS-029 specifies carrier expression only. The Calculation expression surface (engine contract, calculation pipeline, reconciliation) is separate and unaffected. |
| TMR methodology stack | PRESERVED AND APPLIED | TMR-2, 3, 5, 6, 7, 8 are applied, not modified. |

---

## §13 — OUT OF SCOPE

- Calculation expression surface redesign (engine contract, calculation pipeline, reconciliation)
- Reporting expression surface (payroll export, commission statements, CFDI)
- Forensics expression surface (CC-UAT, Architecture Trace, Calculation Trace)
- User Modification expression surface (disposition, correction, override workflows)
- SCI agent architecture changes (SCI operates correctly; DS-029 consumes its output)
- Schema changes to `committed_data` or carrier tables (DS-029 reads existing schema)
- New CRL computation logic (DS-029 consumes existing CRL tiers; any CRL changes follow the CRR spec)
- Billing or metering changes (domain component activation is independent of commercial module billing)
- Mobile/responsive design (structural design; responsive implementation follows OB-201 Bliss design system)

---

## §14 — RESIDUALS

**R1 — Carrier expression for non-SCI import paths.** If legacy import paths (pre-SCI) still produce `committed_data` rows, carrier expression should include them. Requires audit of whether non-SCI import paths still exist in the codebase.

**R2 — Real-time carrier expression for SFTP/API ingestion.** TMR-6 defines T-1 as continuous, not batch. When SFTP/API ingestion lands (PLG Strategy §7), carrier expression elements must update on each ingestion event, not just on browser-initiated import. DS-029's architecture supports this (carrier intelligence reads from live carrier state), but the real-time update mechanism (WebSocket, polling, server-sent events) is deferred.

**R3 — Cross-tenant carrier intelligence.** Foundational flywheel priors from other tenants could inform carrier expression: "This file structure matches 47 other tenants. Classification confidence: 98%." This is CRL Hot tier + foundational flywheel interaction, deferred to Phase 4+.

**R4 — Entity relationship visualization.** Hierarchical entity relationships (org charts, territory trees) are carrier data that could be visually expressed. Deferred pending DS-027 (User Provisioning/RBAC) completion, which establishes the entity-to-user linking that hierarchy visualization depends on.

**R5 — R1 Exit Criteria amendment.** DS-029 identifies a gap in the User Ready Exit Criteria R1: no Tier A–D criterion for "data visible after import without calculation prerequisite." A new criterion (proposed Tier C or D) should be drafted after DS-029 is ratified, making this gap visible at the governance layer.

---

*DS-029: Carrier Expression Architecture*
*2026-06-13 · vialuce.ai · Intelligence. Acceleration. Performance.*

*The user does not navigate to carrier data. Carrier intelligence finds the user.*
*Every import produces visible value. Every interaction strengthens the flywheel.*
*The Observation surface reads from the carrier. This is what DS-021 always required.*
