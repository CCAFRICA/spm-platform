# HF-198 — Comprehension Surface Completeness Campaign

**Design Document v1.0 — 2026-05-04**

**Status:** DESIGN (pre-implementation)
**Type:** Multi-phase campaign (not a single HF)
**Framework:** Substrate Architecture (not tenant remediation)
**Verification anchor:** Synthetic tenant capability proof (not tenant regression)

---

## 1. Framing

### 1.1 What this campaign is

HF-198 is the structural completion of the platform's comprehension surface such that **any downstream consumer can query it for what it needs without consumer-specific code in the import pipeline.**

This is not a fix for three Meridian defects. This is the architectural closure of the seeds→signals rebuild mandated by Decision 147-A (April 9-10) and Decision 153 (LOCKED April 18-21). HF-193 (PR #339, April 24) partially landed the rebuild. The current Meridian regression is empirical evidence that the rebuild is incomplete.

### 1.2 What this campaign is NOT

- Not a Meridian-specific fix
- Not a "make it work for tenant N" deliverable
- Not a single atomic HF with one PR
- Not a regression test for past behavior
- Not within scope: format polymorphism (PDF/JSON/API ingestion), domain pack architecture, downstream-action declarative consumption — those are forward campaigns

### 1.3 Why a campaign instead of an HF

Decision 153 locked the principle (intelligence flows through the shared surface — always). HF-193 attempted single-HF cutover. The cutover is incomplete because:

1. Each consumer of the old `plan_agent_seeds` payload reads a different facet (tier matrices, metric semantics, variant discriminators, entity attributes)
2. Each facet requires its own signal_type, its own write surface, its own consumer wire-up
3. Verification of each facet is independently meaningful (binding correctness for one facet doesn't imply correctness for others)
4. Phasing reduces blast radius — a single PR landing all six facets at once cannot be safely rolled back if any facet regresses BCL

A campaign with phase-level commits, phase-level PRs, and phase-level verification preserves:
- BCL's $312,033 reconciliation throughout (any phase that regresses BCL halts the campaign)
- Meridian's eventual MX$185,063 reconciliation as the integrated acceptance test
- Synthetic tenant proof as the enduring-capability test (post-campaign)

---

## 2. Architectural framing

### 2.1 The comprehension surface contract

The comprehension surface is the union of:

- `classification_signals` (Decision 64 — single shared signal surface)
- `committed_data.metadata.field_identities` (per-row HC primacy substrate, HF-095/HF-186/HF-196)
- `entities.metadata` (entity-record attribute substrate)
- `structural_fingerprints.classification_result` (per-sheet shape recognition cache, HF-197B)

**Contract principle:** any downstream consumer (calc engine, reporting, dispute, AI explanation, regulatory disclosure, future domains) reads from this surface without coordinating with the import pipeline directly. The import pipeline's job is to populate the surface; downstream consumers' job is to query it for what they need.

This is the inversion that makes the platform enduring at scale: **import doesn't know about consumers; consumers don't know about import. They communicate through the surface.**

### 2.2 Signal type catalog (operative + new)

**Operative today (post HF-197B + HF-193):**
- `field_identity` — per-column structural classification (identifier, name, attribute, reference_key, temporal, measure, etc.)
- `agent_classification` — per-sheet agent decision (entity, transaction, reference, target, plan)
- `metric_comprehension` — partially operative; HF-198.2 completes
- `binding_evaluation` — convergence binding evaluation outcomes (operative)

**Introduced by this campaign:**
- `tier_matrix` — plan-interpreted tier grid for bounded_lookup_2d, bounded_lookup_1d, conditional_gate, scalar_multiply
- `entity_attribute` — roster-derived attribute projection intent (e.g., `Tipo_Coordinador → entity.materializedState.role`)
- `reconciliation_reference` — distinguishes pre-computed expected-output files from transaction data at import boundary

**Forward campaigns (not HF-198):**
- `format_recognition` — file format polymorphism signals (PDF table extraction, JSON schema mapping, etc.)
- `consumer_demand` — declarative downstream consumer needs
- `domain_routing` — domain pack dispatch signals

### 2.3 Producer-consumer matrix

| signal_type | Producer | Consumer | Failure mode if absent |
|---|---|---|---|
| field_identity | HC LLM during SCI analyze | entity-resolution.ts, all downstream | Resolver guards fire; entities not linked (HF-110 chain) |
| agent_classification | Agent scoring during SCI analyze | execute-bulk routing | Wrong pipeline ingests data (CLT-195 F03 class) |
| metric_comprehension | Plan interpreter during SCI execute | Convergence Pass 1 | AI hallucinates metric names; boundary fallback degenerate (Defect B) |
| tier_matrix | Plan interpreter during SCI execute | convertComponent → calcMethod.tiers | "no tiers" in calc; all components return 0 (Defect A) |
| entity_attribute | Entity resolution post-import | Variant discrimination, future reporting | tokens=[]; all entities excluded from calc (Defect C) |
| reconciliation_reference | SCI analyze classification | execute-bulk routing decision | Answer-key contaminates transaction substrate |

### 2.4 The atomic cutover principle (preserved from Decision 153)

Decision 153 disposition B-E4: every legacy seed reference eradicated. HF-193 partially landed this. HF-198 completes it.

**Within this campaign:** no parallel paths. Each phase replaces the legacy path entirely; legacy code is removed in the same PR as the new signal write/read is added. This is per Decision 153 — atomic cutover, not gradual migration.

**Verification per phase:** the phase's PR must show:
- New signal write at producer
- New signal read at consumer
- Legacy code path deleted (not commented, not feature-flagged — deleted)
- Verification probe demonstrating consumer's failure mode if signal absent

---

## 3. Campaign phases

### Phase 1 — HF-198.1: Tier matrix signal

**Defect closed:** Plan-tier extraction failure (Defect A — `[variant senior] [0] Revenue Performance - Senior: no tiers`)

**Producer:** Plan interpreter at SCI execute (the AI plan interpretation pipeline that consumes Plan_Incentivos sheet)

**Consumer:** convertComponent → calcMethod.tiers binding

**Signal schema (`signal_type = 'tier_matrix'`):**
```
signal_data: {
  rule_set_id: uuid,
  component_label: string,
  variant_label: string,
  calc_type: 'bounded_lookup_2d' | 'bounded_lookup_1d' | 'conditional_gate' | 'scalar_multiply' | 'ratio',
  tier_structure: {
    // For bounded_lookup_2d:
    rows: { dimension: string, boundaries: number[] },
    columns: { dimension: string, boundaries: number[] },
    matrix: number[][],
    // For bounded_lookup_1d:
    boundaries: number[],
    outputs: number[],
    // For conditional_gate:
    condition: { operator: '>=' | '>' | '=' | '<' | '<=', threshold: number },
    onTrue: number,
    onFalse: number,
    // For scalar_multiply:
    multiplier: number,
    // For ratio:
    numerator_role: string,
    denominator_role: string,
  },
  output_precision: { decimalPlaces: 0 | 2 },  // Decision 122
  source_evidence: {
    sheet_name: string,
    cell_range: string,
    extraction_confidence: number,
  }
}
```

**Producer responsibilities:**
1. Parse Plan_Incentivos sheet (or equivalent plan workbook structure) for explicit tier matrices
2. For each component × variant combination, emit one `tier_matrix` signal
3. Set `extraction_confidence` based on cell-layout regularity, boundary monotonicity, output value plausibility
4. If plan workbook doesn't contain explicit tier matrices for a component (e.g., plan describes tiers in prose), emit signal with `tier_structure: null` and architect-attention flag (this becomes a future format-polymorphism case for HF-198+N)

**Consumer responsibilities:**
1. Convergence Pass 0 (new): query `tier_matrix` signals for active rule_set
2. For each component, hydrate `calcMethod.tiers` from signal payload
3. If signal absent, fail closed: log structural deficiency, do not proceed with degenerate "no tiers" calc
4. convertComponent reads pre-hydrated calcMethod.tiers; no extraction logic in convertComponent itself

**Korean Test compliance:** Tier extraction uses cell-layout structural recognition (numeric value distributions, monotonic boundaries, matrix shape) — no language-specific or domain-specific cell-text matching.

**Phase 1 verification gate:**
- Synthetic plan workbook with explicit 2D tier matrix (3×4) → signal written → consumer hydrates → convertComponent receives populated tiers
- BCL plan workbook → re-import → BCL reconciles to $312,033 (regression test)
- Meridian Plan_Incentivos → signal written for all 10 components with non-null `tier_structure` for at least the 4 component types Meridian uses

**Phase 1 NOT in scope:**
- Plan formats other than Excel (PDF, prose) — forward
- Tier extraction from plan documents requiring NLP — forward
- Tier inference when plan is implicit/derived — forward

### Phase 2 — HF-198.2: Metric comprehension signal completion

**Defect closed:** Convergence column-to-metric binding misalignment (Defect B — `HF-114 AI response invalid (keys: hub_route_volume...) Falling back to boundary matching`)

**Producer:** Plan interpreter at SCI execute (same producer as Phase 1, different signal_type)

**Consumer:** Convergence column-to-metric binding (HF-112 surface) at calc-time convergence

**Signal schema (`signal_type = 'metric_comprehension'`):**
```
signal_data: {
  rule_set_id: uuid,
  metric_label: string,        // e.g., 'on_time_delivery_percentage'
  metric_op: string,           // e.g., 'bounded_lookup_1d'
  metric_inputs: {
    role: 'row' | 'column' | 'actual' | 'numerator' | 'denominator' | 'gate_input',
    semantic_intent: string,   // e.g., 'percentage of deliveries that arrived on time'
    expected_dimensionality: 'count' | 'percentage' | 'currency' | 'ratio' | 'attainment',
    derivation_hint: string?,  // e.g., 'derive from entregas_tiempo / entregas_totales'
  }[],
  source_evidence: {
    plan_section: string,
    confidence: number,
  }
}
```

**Producer responsibilities:**
1. For each component in plan interpretation output, emit `metric_comprehension` signals describing what the metric MEANS, what inputs it expects, and (when applicable) how to derive from raw data
2. The signal carries SEMANTIC INTENT, not column names — column names are a binding problem solved by the consumer

**Consumer responsibilities:**
1. Convergence Pass 1 reads `metric_comprehension` signals before any AI prompt is constructed
2. AI prompt for column-to-metric binding includes:
   - The metric_comprehension signals (authoritative semantic intent)
   - The per-sheet field_identity signals (HC's structural classification of source columns)
   - Source column samples
3. AI prompt asks: "given these metric semantic intents and these source columns with their HC classifications, produce the binding." NOT "what would you call this metric."
4. Boundary fallback acceptance threshold raised: minimum confidence 0.50 (current accepts 0.10 — degenerate). Below threshold: fail closed with diagnostic, not silently bind wrong column.
5. CONVERGENCE-VALIDATION (peer-median ratio check) preserved as defense-in-depth.

**Korean Test compliance:** metric_comprehension carries semantic intent in domain-neutral terms (count, percentage, currency); does not require domain-specific or language-specific lexical matching.

**Phase 2 verification gate:**
- Synthetic plan with raw data columns + derived metrics → AI binding produces correct source-column references at confidence ≥ 0.50
- BCL re-import → reconciles $312,033 (regression test)
- Meridian → `New Accounts:actual → Cuentas_Nuevas` (not `→ Año`); confidence ≥ 0.50

**Phase 2 NOT in scope:**
- Cross-tenant metric semantic transfer (foundational tier flywheel) — operative; not modified
- Multi-step derivation chains (metric A derived from metric B derived from raw column) — forward

### Phase 3 — HF-198.3: Entity attribute projection signal

**Defect closed:** Variant discrimination collapse (Defect C — `[VARIANT] X: tokens=[]; NO MATCH — excluded`)

**Producer:** Entity resolution at post-import materialization (DS-009 3.3 surface)

**Consumer:** Variant discrimination at calc-time, plus future consumers (reporting filters, dispute scoping, AI explanation context)

**Signal schema (`signal_type = 'entity_attribute'`):**
```
signal_data: {
  entity_id: uuid,
  attribute_role: string,      // e.g., 'role', 'region', 'tier', 'cohort'
  attribute_value: string,     // e.g., 'Senior', 'North', 'Gold', 'Q1-2025'
  source_evidence: {
    sheet_name: string,        // e.g., 'Plantilla'
    column_name: string,       // e.g., 'Tipo_Coordinador'
    field_identity_signal_id: uuid,
  },
  semantic_class: 'discriminator' | 'descriptor' | 'temporal_marker' | 'reference_key',
  confidence: number,
}
```

**Producer responsibilities:**
1. After entity resolution links rows, identify roster-derived attribute columns via field_identity signals (`role: attribute`)
2. For each entity × attribute column combination, emit `entity_attribute` signal
3. Mark `semantic_class: 'discriminator'` when the attribute appears in plan variant definitions (cross-reference plan tier_matrix signals' variant_label values)

**Consumer responsibilities:**
1. Variant discrimination (calc-time): query `entity_attribute` signals where `semantic_class = 'discriminator'` for active entities
2. Materialize entity tokens from attribute_value
3. variant_disc match against tokens — current logic, now fed by populated tokens
4. Reporting/dispute consumers: query by attribute_role for filtering, grouping, drill-down

**entities.metadata also populated** (denormalization for fast read in calc hot path):
- `entities.metadata.materializedState[attribute_role] = attribute_value` written by same producer
- This denormalization is a perf optimization, not the source of truth — signals are authoritative

**Phase 3 verification gate:**
- Synthetic roster with discriminator attribute → signals written → variant discrimination produces correct tokens
- BCL → no regression (BCL has single variant; signals written but discrimination outcome unchanged)
- Meridian → `[VARIANT] Claudia Cruz Ramírez: tokens=[senior]` (or [standard]); 79 entities pass variant discrimination

**Phase 3 NOT in scope:**
- Cross-roster entity attribute resolution (entity has attributes from multiple rosters) — forward
- Hierarchical attributes (region → sub-region → site) — forward
- Time-varying attributes (entity changes role mid-period) — forward

### Phase 4 — HF-198.4: Reconciliation-channel separation

**Defect closed:** Resultados_Esperados ingested as transaction data (architect-flagged as reconciliation-channel violation)

**Producer:** SCI analyze classification (extension of agent_classification with new signal_type)

**Consumer:** execute-bulk routing decision

**Signal schema (`signal_type = 'reconciliation_reference'`):**
```
signal_data: {
  file_name: string,
  sheet_name: string,
  recognition_pattern: 'expected_outputs' | 'gt_validation' | 'scenario_projection' | 'prior_period_baseline',
  recognition_evidence: {
    column_role_signature: string[],  // e.g., ['identifier', 'period_marker', 'currency_total']
    value_distribution: { suggests_computed: boolean, fingerprint_match: string? },
    file_name_pattern: string?,        // e.g., matches /resultados.*esperad/i
  },
  intended_substrate: 'reconciliation_substrate',  // NOT committed_data
  confidence: number,
}
```

**Producer responsibilities:**
1. SCI analyze examines each file/sheet for reconciliation-reference patterns BEFORE agent classification dispatch
2. If pattern matches with confidence ≥ threshold, emit `reconciliation_reference` signal
3. Agent classification dispatch checks for this signal first; if present, route to reconciliation_substrate path (not entity/transaction/reference/target/plan path)

**Consumer responsibilities:**
1. execute-bulk routing reads `reconciliation_reference` signals and dispatches to reconciliation_substrate write path
2. reconciliation_substrate is a NEW substrate surface (table TBD — likely `reconciliation_references` table) keyed on (tenant_id, period_id, entity_external_id, expected_value, source_file_name)
3. Calc engine NEVER reads from reconciliation_substrate during calculation
4. Reconciliation engine (separate from calc) reads from reconciliation_substrate to compare calc output against expected

**Korean Test compliance:** Recognition uses structural patterns (column role signature, value distribution, fingerprint match) — file_name_pattern is supplementary hint only, not gate.

**Phase 4 verification gate:**
- Synthetic file containing pre-computed expected outputs → signal written with `recognition_pattern: 'expected_outputs'` → routed to reconciliation_substrate
- File NOT routed to committed_data
- Reconciliation engine reads reconciliation_substrate → produces architect-channel comparison report
- BCL → no regression (BCL imports do not trigger this path)
- Meridian → Resultados_Esperados routed correctly; transaction substrate clean

**Phase 4 NOT in scope:**
- Reconciliation engine itself (separate forward HF — HF-198.4 only enables substrate separation)
- Multi-file reconciliation reference correlation — forward
- Calc-time reference checking (using reconciliation as a calc-time validator) — forward

### Phase 5 — HF-198.5: Self-correction cycle audit and fix

**Defect closed:** DS-017 §4.3 confidence-demote-on-binding-failure path inoperative (flagged earlier — confidence climbing despite 0% binding success on Meridian poisoned cache)

**This phase is diagnostic-then-fix:**

**Diagnostic step:**
1. Audit `writeFingerprint` UPDATE path against DS-017 §4.3 specification
2. Verify whether binding-success signal feeds into confidence calculation
3. Verify whether match_count increments on binding-failure (it should; the entry was structurally matched but produced wrong outcome — this is a signal for demotion, not deletion)
4. Verify demotion-to-Tier-2 threshold logic

**Fix shape (TBD pending diagnostic):**
- If signal not feeding confidence calculation → wire it
- If demotion threshold wrong → adjust per DS-017 §4.3
- If incrementing match_count without confidence demotion → fix increment logic

**Phase 5 verification gate:**
- Synthetic poisoning test: write a fingerprint, force N consecutive binding failures, observe confidence demote and tier transition
- BCL → no regression
- Meridian → if poisoning recurs (it shouldn't post HF-197B), self-correction kicks in autonomously without architect intervention

**Phase 5 NOT in scope:**
- Cross-tenant signal demotion (Tier 2 confidence at foundational tier) — operative; not modified
- Cache eviction policy (when do we delete vs demote) — forward

### Phase 6 — HF-198.6: Comprehension surface contract documentation

**Deliverable:** A document at `docs/architecture/COMPREHENSION_SURFACE_CONTRACT.md` (in repo) and uploaded to project knowledge.

**Document contents:**
1. **Purpose statement** — what the surface is, what it commits to, what it does not commit to
2. **Signal type registry** — every operative signal_type with schema, producer, consumer(s), failure mode
3. **Substrate locations** — classification_signals, committed_data.metadata, entities.metadata, structural_fingerprints — each with its purpose, update discipline, read pattern
4. **Producer-consumer wiring map** — visual + textual representation of every signal flow
5. **Korean Test compliance verification** — for each signal_type, the structural-vs-lexical analysis
6. **Decision lineage** — Decision 64, 92, 122, 147-A, 153 traced through to current implementation
7. **Forward extension guide** — how to add a new signal_type, how to add a new consumer, how to add a new domain
8. **Failure mode catalog** — what each signal absence means; how the platform should fail closed; how the platform should self-correct

**Phase 6 verification gate:**
- Document exists, in repo, uploaded to project knowledge
- Document covers every signal_type currently emitted in production
- Architect channel review: would a new architect joining the project be able to extend a new domain (e.g., FM) by reading this document alone?
- A 30-line plain-English summary suitable for cofounder/co-architect comprehension

**Phase 6 NOT in scope:**
- Implementation of new domains
- Ongoing document maintenance discipline (separate governance question)

---

## 4. Campaign-level verification gates

### 4.1 Per-phase gates (each phase ships independently)

Each phase's PR ships only when:
1. Phase verification gate met (per phase 3.x.verification gate above)
2. BCL regression test passes ($312,033 exact)
3. Build clean, lint clean, types clean
4. Phase commit history follows commit-per-step discipline
5. Phase completion report authored before push (Rule 25)
6. CC paste block last in any prompt (Rule 29)
7. SR-44 browser verification by architect post-merge

### 4.2 Campaign-level gate (after all six phases merge)

The campaign is "complete" only when:

**4.2.1 Meridian regression resolution:** Meridian fresh re-import on production reconciles to MX$185,063 ± reconciliation tolerance. Per-component reconciliation matches:
- C1 Revenue Performance: $44,000
- C2 On-Time Delivery: $15,550
- C3 New Accounts: $69,900
- C4 Safety Record: $20,700
- C5 Fleet Utilization: $34,913

This is the regression-test gate — it proves the campaign restored prior capability.

**4.2.2 Synthetic tenant capability proof:** A synthetic tenant **deliberately structured to be different from BCL and Meridian along multiple axes** is constructed and reconciled:

- Different language (e.g., German plan + data, or Vietnamese, or Arabic — pick a non-English non-Spanish language to exercise Korean Test rigorously)
- Different plan structure (e.g., single variant where Meridian has two; three variants where BCL has one; mix of plan primitives BCL doesn't use)
- Different data shape (e.g., raw operational data requiring derivation, multi-roster files, hybrid roster+transaction sheet)
- Different reference structure (e.g., multi-level hub hierarchy, or no hub reference at all)
- Different entity attribute discriminators (e.g., region+tier compound discriminator)

The synthetic tenant must reconcile to its synthetic ground truth without ANY code change between Meridian's reconciliation and the synthetic tenant's reconciliation.

**This is the enduring-capability gate — it proves the platform handles arbitrary new tenants, not just Meridian-shaped ones.**

**4.2.3 Documentation gate:** HF-198.6 contract document published; architect-channel review approved.

**4.2.4 Decision 153 closure:** With all three gates met, Decision 153 is operatively complete. Update INF_DECISION_REGISTRY noting closure date.

### 4.3 What success looks like

After this campaign:

- Adding tenant N+1 requires: importing data, importing plan, clicking calculate. No architect-channel diagnostic. No CC HF. No code change.
- Adding domain N+1 requires: declaring new signal_types (if any), new domain agent specification. No core platform change.
- Adding downstream consumer N+1 (reporting, dispute, AI explanation) requires: querying the comprehension surface for what it needs. No coordination with import pipeline.

This is the platform that scales to 100s of tenants. Anything less is tenant-specific code accumulation, which has a known terminal — it stops being a platform and becomes a portfolio of bespoke implementations.

---

## 5. Phase sequencing rationale

### 5.1 Recommended order: 3 → 1 → 2 → 4 → 5 → 6

**Phase 3 (entity attribute projection) FIRST.** Reason: variant discrimination is the gating filter. Without entities passing variant discrimination, the calc has 0 entities to operate on, and Phases 1 and 2 cannot be diagnosed against real calc output. Phase 3 unblocks observability of Phases 1 and 2.

**Phase 1 (tier matrix) SECOND.** Reason: structural fix at plan interpretation; once tiers populate, Phase 2's convergence binding has something concrete to bind into.

**Phase 2 (metric comprehension) THIRD.** Reason: convergence binding correctness needs Phases 1 and 3 operative to be diagnosable against real calc output.

**Phase 4 (reconciliation-channel separation) FOURTH.** Reason: independent of Phases 1-3 mechanically, but easier to verify after calc reconciliation works (so we have a clean pipeline against which to test that the answer-key file is properly excluded).

**Phase 5 (self-correction audit) FIFTH.** Reason: depends on observable cache state from Phases 1-4; better to audit the cycle when the rest of the pipeline is healthy.

**Phase 6 (documentation) SIXTH.** Reason: cannot document until the system being documented is stable.

### 5.2 Alternative order considerations

- Phase 1 first (tier matrix): defensible if architect prefers structural pipeline order over observability-unblocks order. Drawback: Phase 1 verification cannot use calc output until Phase 3 lands.
- Phase 4 anywhere: independent. Could land in parallel with any other phase. Consider for capacity-balancing across implementation conversations.
- Phase 6 in parallel: documentation could begin immediately and update with each phase landing. Consider as continuous deliverable rather than terminal phase.

### 5.3 Architect disposition required

The phase sequencing is the first architect decision when the campaign begins implementation. My recommendation above stands but is not load-bearing.

---

## 6. Out-of-scope (explicit forward campaigns)

These are NAMED here to prevent scope creep in HF-198 and to provide architect channel visibility into the longer arc:

### 6.1 Format polymorphism (forward HF-199 candidate)

"Receive any data file in any format" extends beyond XLSX/CSV. Forward campaign covers:
- PDF table extraction
- JSON schema-driven ingestion
- API webhook ingestion
- EDI / fixed-width parsing
- Image-based data (screenshots, scanned plan documents)
- Multi-language OCR

### 6.2 Domain pack architecture (forward HF-200 candidate)

ICM is one domain. Future domains (FM Field Maintenance, Workforce Planning, Revenue Operations, etc.) require:
- Domain-specific agent registration on the comprehension surface
- Domain-specific calc primitive types (beyond bounded_lookup_2d/1d, scalar_multiply, conditional_gate, ratio)
- Domain-specific reporting templates
- Domain-specific AI explanation prompts

### 6.3 Downstream-action declarative consumption (forward HF-201 candidate)

Currently calc reads the comprehension surface implicitly. Forward campaign:
- Each downstream action (reporting query, dispute scope, AI explanation context, regulatory disclosure) declares its data needs
- The comprehension surface satisfies the declaration
- This is the inversion that fully decouples downstream actions from import pipeline implementation details

### 6.4 Comprehension surface evolution (forward HF-N candidate)

As tenants and domains accumulate, the surface itself will need:
- Schema migration discipline for signal_data shape changes
- Signal_type deprecation governance
- Cross-tenant signal pattern mining (foundational tier flywheel beyond fingerprint cache)
- Synthetic-tenant continuous regression infrastructure

These are forward, not in HF-198.

---

## 7. Compliance and substrate citation

### 7.1 Compliance frame

- **Decision 64** (single shared signal surface): preserved; new signal_types extend, do not fragment
- **Decision 92** (Carry Everything, Express Contextually): preserved; all source columns flow to committed_data
- **Decision 122** (calculation precision standard, Banker's Rounding): tier_matrix signal carries output_precision per Decision 122
- **Decision 147-A** (intelligence flows through shared surface): operatively realized by this campaign
- **Decision 152** (import sequence independence): preserved; signals are independent of import order
- **Decision 153** (atomic cutover, seeds eradication): closure realized by this campaign
- **HF-094** (per-content-unit fingerprintMap): preserved; per-sheet keying operative (HF-197B)
- **HF-145** (optimistic locking on writeFingerprint UPDATE): preserved
- **HF-095/HF-186/HF-196** (HC primacy chain): preserved; HC roles flow into field_identity signals which feed all other producers
- **HF-110** (resolver fallback chain): preserved; entity_attribute signals layer above field_identity primary path
- **HF-197B** (per-sheet cache keying): foundational for this campaign; without it, signals would be cache-poisoned
- **AP-25 Korean Test**: every signal_type structurally derived; no language-specific or domain-specific lexical matching
- **SR-34 No Bypass**: structural fix; no workarounds; legacy paths eradicated per Decision 153
- **SR-39 Compliance Verification Gate**: N/A for HF-198.1-3; HF-198.4 may touch (reconciliation_substrate as new substrate may require SOC 2 review)
- **SR-44 (browser verification architect-only)**: preserved per phase
- **FP-49 SQL Schema Fabrication guard**: every phase prompts gate SQL through information_schema verify
- **FP-80 false PASS without evidence**: every phase requires pasted evidence at gates
- **FP-81 single-layer fix for multi-layer bug**: explicitly addressed — campaign structure prevents single-layer fix attempts

### 7.2 Substrate citation

This design references:
- DIAG-021 disambiguation report
- HF-197B completion report
- DS-017 fingerprint flywheel specification
- DS-016 ingestion architecture
- AUD-001 SCI Pipeline Code Extraction
- Decision 147-A amendment
- Decision 153 LOCKED disposition
- HF-193 plan_agent_seeds eradication completion (PR #339)
- INF_DECISION_REGISTRY

---

## 8. Architect dispositions required before implementation begins

1. **Campaign framing accepted** as multi-phase (not single atomic HF) — architect confirm or revise
2. **Phase sequencing** — architect confirms 3→1→2→4→5→6 or proposes alternative
3. **Synthetic tenant strategy** — architect commits to constructing a synthetic third tenant for capability gate; specifies axes of difference
4. **Phase 4 reconciliation_substrate table design** — architect dispositions whether new table is needed or whether reuse of existing structure (e.g., classification_signals with new signal_type only) is sufficient
5. **Phase 6 documentation timing** — terminal phase or continuous deliverable
6. **Implementation conversation strategy** — each phase its own implementation conversation, or campaign-level implementation conversation with phase-level handoffs
7. **Decision 153 closure ceremony** — when campaign completes, formal Decision 153 closure entry in INF_DECISION_REGISTRY and announcement at architect channel

---

## 9. What this design document is, and is not

**This document IS:**
- The campaign-level architectural design for completing the comprehension surface
- The contract that phase-level implementation prompts must satisfy
- The substrate reference that future campaigns build on
- The justification for treating this work as architectural completion, not tenant remediation

**This document is NOT:**
- An implementation prompt — phase-level prompts are separate, drafted per phase, with branch-state-conditional logic, continuous-processing discipline, named HALT conditions
- A scoping document — scope is locked here; phase prompts execute against this scope
- A timeline — phases ship as ready; no calendar commitments
- Final — version 1.0 anticipates revision as phases land and the substrate reveals more

**Document discipline:** This document is uploaded to project knowledge after architect review. Phase prompts reference it by file path. As phases complete, this document is updated to reflect operative state. Phase 6 (HF-198.6) replaces this document with the canonical contract documentation; this design document is archived to `docs/architecture/archive/` at campaign closure.

---

## 10. Honest framing for the architect channel

This campaign accepts costs:

- **Time cost:** six phases, six PRs, six verifications. Slower than a single atomic HF.
- **Coordination cost:** each phase is its own implementation conversation; handoff discipline matters.
- **Verification cost:** synthetic tenant construction is a non-trivial deliverable; building the regression infrastructure costs time that doesn't ship features.
- **Documentation cost:** Phase 6 is a real deliverable, not afterthought.

These costs are paid because the alternative is unbounded:

- Tenant-specific HFs accumulate
- Each new tenant exposes new defect classes that should have been closed structurally
- The platform stops scaling at the architect-channel debug bottleneck
- At some tenant count (probably 10-30, well below 100), the platform becomes too brittle to add new tenants safely

This campaign closes that trajectory. It is the work that distinguishes "we have a working ICM platform" from "we have a platform that endures."

The framing the cofounder/co-architect channel needs:

> HF-198 is the architectural completion of the comprehension surface mandated by Decision 153. It is not a Meridian fix. It is the work that makes the platform a platform.

Standing by for architect dispositions per Section 8.

---

**Document status:** v1.0 DESIGN — ready for architect review
**Next action:** Architect dispositions per Section 8; phase 1 implementation prompt drafted post-disposition
**Substrate location:** `docs/architecture/HF-198_COMPREHENSION_SURFACE_COMPLETENESS_DESIGN.md` (post-upload)
**Author channel:** architect (Claude design) → architect (Andrew disposition) → CC (per-phase implementation)
