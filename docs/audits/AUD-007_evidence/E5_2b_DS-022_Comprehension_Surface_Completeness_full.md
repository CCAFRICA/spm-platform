# E5.2b — DS-022 Comprehension Surface Completeness (verbatim with line numbers)

**File:** `docs/design-specifications/DS-022_Comprehension_Surface_Completeness_20260504.md`
**Total lines:** 594

Surfaced because grep returned SCI references.

```markdown
     1	# DS-022 — Comprehension Surface Completeness
     2	
     3	**Design Specification v1.0 — 2026-05-04**
     4	
     5	**Status:** DESIGN (pre-implementation)
     6	**Type:** Design Specification for HF-198 multi-phase implementation campaign
     7	**Implementation campaign:** HF-198 (phases HF-198.1 through HF-198.6)
     8	**Framework:** Substrate Architecture (not tenant remediation)
     9	**Verification anchor:** Synthetic tenant capability proof (not tenant regression)
    10	**Repo location:** `docs/design-specifications/DS-022_Comprehension_Surface_Completeness_20260504.md`
    11	
    12	---
    13	
    14	## 1. Framing
    15	
    16	### 1.1 What this campaign is
    17	
    18	HF-198 is the structural completion of the platform's comprehension surface such that **any downstream consumer can query it for what it needs without consumer-specific code in the import pipeline.**
    19	
    20	This is not a fix for three Meridian defects. This is the architectural closure of the seeds→signals rebuild mandated by Decision 147-A (April 9-10) and Decision 153 (LOCKED April 18-21). HF-193 (PR #339, April 24) partially landed the rebuild. The current Meridian regression is empirical evidence that the rebuild is incomplete.
    21	
    22	### 1.2 What this campaign is NOT
    23	
    24	- Not a Meridian-specific fix
    25	- Not a "make it work for tenant N" deliverable
    26	- Not a single atomic HF with one PR
    27	- Not a regression test for past behavior
    28	- Not within scope: format polymorphism (PDF/JSON/API ingestion), domain pack architecture, downstream-action declarative consumption — those are forward campaigns
    29	
    30	### 1.3 Why a campaign instead of an HF
    31	
    32	Decision 153 locked the principle (intelligence flows through the shared surface — always). HF-193 attempted single-HF cutover. The cutover is incomplete because:
    33	
    34	1. Each consumer of the old `plan_agent_seeds` payload reads a different facet (tier matrices, metric semantics, variant discriminators, entity attributes)
    35	2. Each facet requires its own signal_type, its own write surface, its own consumer wire-up
    36	3. Verification of each facet is independently meaningful (binding correctness for one facet doesn't imply correctness for others)
    37	4. Phasing reduces blast radius — a single PR landing all six facets at once cannot be safely rolled back if any facet regresses BCL
    38	
    39	A campaign with phase-level commits, phase-level PRs, and phase-level verification preserves:
    40	- BCL's $312,033 reconciliation throughout (any phase that regresses BCL halts the campaign)
    41	- Meridian's eventual MX$185,063 reconciliation as the integrated acceptance test
    42	- Synthetic tenant proof as the enduring-capability test (post-campaign)
    43	
    44	---
    45	
    46	## 2. Architectural framing
    47	
    48	### 2.1 The comprehension surface contract
    49	
    50	The comprehension surface is the union of:
    51	
    52	- `classification_signals` (Decision 64 — single shared signal surface)
    53	- `committed_data.metadata.field_identities` (per-row HC primacy substrate, HF-095/HF-186/HF-196)
    54	- `entities.metadata` (entity-record attribute substrate)
    55	- `structural_fingerprints.classification_result` (per-sheet shape recognition cache, HF-197B)
    56	
    57	**Contract principle:** any downstream consumer (calc engine, reporting, dispute, AI explanation, regulatory disclosure, future domains) reads from this surface without coordinating with the import pipeline directly. The import pipeline's job is to populate the surface; downstream consumers' job is to query it for what they need.
    58	
    59	This is the inversion that makes the platform enduring at scale: **import doesn't know about consumers; consumers don't know about import. They communicate through the surface.**
    60	
    61	### 2.2 Signal type catalog (operative + new)
    62	
    63	**Operative today (post HF-197B + HF-193):**
    64	- `field_identity` — per-column structural classification (identifier, name, attribute, reference_key, temporal, measure, etc.)
    65	- `agent_classification` — per-sheet agent decision (entity, transaction, reference, target, plan)
    66	- `metric_comprehension` — partially operative; HF-198.2 completes
    67	- `binding_evaluation` — convergence binding evaluation outcomes (operative)
    68	
    69	**Introduced by this campaign:**
    70	- `tier_matrix` — plan-interpreted tier grid for bounded_lookup_2d, bounded_lookup_1d, conditional_gate, scalar_multiply
    71	- `entity_attribute` — roster-derived attribute projection intent (e.g., `Tipo_Coordinador → entity.materializedState.role`)
    72	- `reconciliation_reference` — distinguishes pre-computed expected-output files from transaction data at import boundary
    73	
    74	**Forward campaigns (not HF-198):**
    75	- `format_recognition` — file format polymorphism signals (PDF table extraction, JSON schema mapping, etc.)
    76	- `consumer_demand` — declarative downstream consumer needs
    77	- `domain_routing` — domain pack dispatch signals
    78	
    79	### 2.3 Producer-consumer matrix
    80	
    81	| signal_type | Producer | Consumer | Failure mode if absent |
    82	|---|---|---|---|
    83	| field_identity | HC LLM during SCI analyze | entity-resolution.ts, all downstream | Resolver guards fire; entities not linked (HF-110 chain) |
    84	| agent_classification | Agent scoring during SCI analyze | execute-bulk routing | Wrong pipeline ingests data (CLT-195 F03 class) |
    85	| metric_comprehension | Plan interpreter during SCI execute | Convergence Pass 1 | AI hallucinates metric names; boundary fallback degenerate (Defect B) |
    86	| tier_matrix | Plan interpreter during SCI execute | convertComponent → calcMethod.tiers | "no tiers" in calc; all components return 0 (Defect A) |
    87	| entity_attribute | Entity resolution post-import | Variant discrimination, future reporting | tokens=[]; all entities excluded from calc (Defect C) |
    88	| reconciliation_reference | SCI analyze classification | execute-bulk routing decision | Answer-key contaminates transaction substrate |
    89	
    90	### 2.4 The atomic cutover principle (preserved from Decision 153)
    91	
    92	Decision 153 disposition B-E4: every legacy seed reference eradicated. HF-193 partially landed this. HF-198 completes it.
    93	
    94	**Within this campaign:** no parallel paths. Each phase replaces the legacy path entirely; legacy code is removed in the same PR as the new signal write/read is added. This is per Decision 153 — atomic cutover, not gradual migration.
    95	
    96	**Verification per phase:** the phase's PR must show:
    97	- New signal write at producer
    98	- New signal read at consumer
    99	- Legacy code path deleted (not commented, not feature-flagged — deleted)
   100	- Verification probe demonstrating consumer's failure mode if signal absent
   101	
   102	---
   103	
   104	## 3. Campaign phases
   105	
   106	### Phase 1 — HF-198.1: Tier matrix signal
   107	
   108	**Defect closed:** Plan-tier extraction failure (Defect A — `[variant senior] [0] Revenue Performance - Senior: no tiers`)
   109	
   110	**Producer:** Plan interpreter at SCI execute (the AI plan interpretation pipeline that consumes Plan_Incentivos sheet)
   111	
   112	**Consumer:** convertComponent → calcMethod.tiers binding
   113	
   114	**Signal schema (`signal_type = 'tier_matrix'`):**
   115	```
   116	signal_data: {
   117	  rule_set_id: uuid,
   118	  component_label: string,
   119	  variant_label: string,
   120	  calc_type: 'bounded_lookup_2d' | 'bounded_lookup_1d' | 'conditional_gate' | 'scalar_multiply' | 'ratio',
   121	  tier_structure: {
   122	    // For bounded_lookup_2d:
   123	    rows: { dimension: string, boundaries: number[] },
   124	    columns: { dimension: string, boundaries: number[] },
   125	    matrix: number[][],
   126	    // For bounded_lookup_1d:
   127	    boundaries: number[],
   128	    outputs: number[],
   129	    // For conditional_gate:
   130	    condition: { operator: '>=' | '>' | '=' | '<' | '<=', threshold: number },
   131	    onTrue: number,
   132	    onFalse: number,
   133	    // For scalar_multiply:
   134	    multiplier: number,
   135	    // For ratio:
   136	    numerator_role: string,
   137	    denominator_role: string,
   138	  },
   139	  output_precision: { decimalPlaces: 0 | 2 },  // Decision 122
   140	  source_evidence: {
   141	    sheet_name: string,
   142	    cell_range: string,
   143	    extraction_confidence: number,
   144	  }
   145	}
   146	```
   147	
   148	**Producer responsibilities:**
   149	1. Parse Plan_Incentivos sheet (or equivalent plan workbook structure) for explicit tier matrices
   150	2. For each component × variant combination, emit one `tier_matrix` signal
   151	3. Set `extraction_confidence` based on cell-layout regularity, boundary monotonicity, output value plausibility
   152	4. If plan workbook doesn't contain explicit tier matrices for a component (e.g., plan describes tiers in prose), emit signal with `tier_structure: null` and architect-attention flag (this becomes a future format-polymorphism case for HF-198+N)
   153	
   154	**Consumer responsibilities:**
   155	1. Convergence Pass 0 (new): query `tier_matrix` signals for active rule_set
   156	2. For each component, hydrate `calcMethod.tiers` from signal payload
   157	3. If signal absent, fail closed: log structural deficiency, do not proceed with degenerate "no tiers" calc
   158	4. convertComponent reads pre-hydrated calcMethod.tiers; no extraction logic in convertComponent itself
   159	
   160	**Korean Test compliance:** Tier extraction uses cell-layout structural recognition (numeric value distributions, monotonic boundaries, matrix shape) — no language-specific or domain-specific cell-text matching.
   161	
   162	**Phase 1 verification gate:**
   163	- Synthetic plan workbook with explicit 2D tier matrix (3×4) → signal written → consumer hydrates → convertComponent receives populated tiers
   164	- BCL plan workbook → re-import → BCL reconciles to $312,033 (regression test)
   165	- Meridian Plan_Incentivos → signal written for all 10 components with non-null `tier_structure` for at least the 4 component types Meridian uses
   166	
   167	**Phase 1 NOT in scope:**
   168	- Plan formats other than Excel (PDF, prose) — forward
   169	- Tier extraction from plan documents requiring NLP — forward
   170	- Tier inference when plan is implicit/derived — forward
   171	
   172	### Phase 2 — HF-198.2: Metric comprehension signal completion
   173	
   174	**Defect closed:** Convergence column-to-metric binding misalignment (Defect B — `HF-114 AI response invalid (keys: hub_route_volume...) Falling back to boundary matching`)
   175	
   176	**Producer:** Plan interpreter at SCI execute (same producer as Phase 1, different signal_type)
   177	
   178	**Consumer:** Convergence column-to-metric binding (HF-112 surface) at calc-time convergence
   179	
   180	**Signal schema (`signal_type = 'metric_comprehension'`):**
   181	```
   182	signal_data: {
   183	  rule_set_id: uuid,
   184	  metric_label: string,        // e.g., 'on_time_delivery_percentage'
   185	  metric_op: string,           // e.g., 'bounded_lookup_1d'
   186	  metric_inputs: {
   187	    role: 'row' | 'column' | 'actual' | 'numerator' | 'denominator' | 'gate_input',
   188	    semantic_intent: string,   // e.g., 'percentage of deliveries that arrived on time'
   189	    expected_dimensionality: 'count' | 'percentage' | 'currency' | 'ratio' | 'attainment',
   190	    derivation_hint: string?,  // e.g., 'derive from entregas_tiempo / entregas_totales'
   191	  }[],
   192	  source_evidence: {
   193	    plan_section: string,
   194	    confidence: number,
   195	  }
   196	}
   197	```
   198	
   199	**Producer responsibilities:**
   200	1. For each component in plan interpretation output, emit `metric_comprehension` signals describing what the metric MEANS, what inputs it expects, and (when applicable) how to derive from raw data
   201	2. The signal carries SEMANTIC INTENT, not column names — column names are a binding problem solved by the consumer
   202	
   203	**Consumer responsibilities:**
   204	1. Convergence Pass 1 reads `metric_comprehension` signals before any AI prompt is constructed
   205	2. AI prompt for column-to-metric binding includes:
   206	   - The metric_comprehension signals (authoritative semantic intent)
   207	   - The per-sheet field_identity signals (HC's structural classification of source columns)
   208	   - Source column samples
   209	3. AI prompt asks: "given these metric semantic intents and these source columns with their HC classifications, produce the binding." NOT "what would you call this metric."
   210	4. Boundary fallback acceptance threshold raised: minimum confidence 0.50 (current accepts 0.10 — degenerate). Below threshold: fail closed with diagnostic, not silently bind wrong column.
   211	5. CONVERGENCE-VALIDATION (peer-median ratio check) preserved as defense-in-depth.
   212	
   213	**Korean Test compliance:** metric_comprehension carries semantic intent in domain-neutral terms (count, percentage, currency); does not require domain-specific or language-specific lexical matching.
   214	
   215	**Phase 2 verification gate:**
   216	- Synthetic plan with raw data columns + derived metrics → AI binding produces correct source-column references at confidence ≥ 0.50
   217	- BCL re-import → reconciles $312,033 (regression test)
   218	- Meridian → `New Accounts:actual → Cuentas_Nuevas` (not `→ Año`); confidence ≥ 0.50
   219	
   220	**Phase 2 NOT in scope:**
   221	- Cross-tenant metric semantic transfer (foundational tier flywheel) — operative; not modified
   222	- Multi-step derivation chains (metric A derived from metric B derived from raw column) — forward
   223	
   224	### Phase 3 — HF-198.3: Entity attribute projection signal
   225	
   226	**Defect closed:** Variant discrimination collapse (Defect C — `[VARIANT] X: tokens=[]; NO MATCH — excluded`)
   227	
   228	**Producer:** Entity resolution at post-import materialization (DS-009 3.3 surface)
   229	
   230	**Consumer:** Variant discrimination at calc-time, plus future consumers (reporting filters, dispute scoping, AI explanation context)
   231	
   232	**Signal schema (`signal_type = 'entity_attribute'`):**
   233	```
   234	signal_data: {
   235	  entity_id: uuid,
   236	  attribute_role: string,      // e.g., 'role', 'region', 'tier', 'cohort'
   237	  attribute_value: string,     // e.g., 'Senior', 'North', 'Gold', 'Q1-2025'
   238	  source_evidence: {
   239	    sheet_name: string,        // e.g., 'Plantilla'
   240	    column_name: string,       // e.g., 'Tipo_Coordinador'
   241	    field_identity_signal_id: uuid,
   242	  },
   243	  semantic_class: 'discriminator' | 'descriptor' | 'temporal_marker' | 'reference_key',
   244	  confidence: number,
   245	}
   246	```
   247	
   248	**Producer responsibilities:**
   249	1. After entity resolution links rows, identify roster-derived attribute columns via field_identity signals (`role: attribute`)
   250	2. For each entity × attribute column combination, emit `entity_attribute` signal
   251	3. Mark `semantic_class: 'discriminator'` when the attribute appears in plan variant definitions (cross-reference plan tier_matrix signals' variant_label values)
   252	
   253	**Consumer responsibilities:**
   254	1. Variant discrimination (calc-time): query `entity_attribute` signals where `semantic_class = 'discriminator'` for active entities
   255	2. Materialize entity tokens from attribute_value
   256	3. variant_disc match against tokens — current logic, now fed by populated tokens
   257	4. Reporting/dispute consumers: query by attribute_role for filtering, grouping, drill-down
   258	
   259	**entities.metadata also populated** (denormalization for fast read in calc hot path):
   260	- `entities.metadata.materializedState[attribute_role] = attribute_value` written by same producer
   261	- This denormalization is a perf optimization, not the source of truth — signals are authoritative
   262	
   263	**Phase 3 verification gate:**
   264	- Synthetic roster with discriminator attribute → signals written → variant discrimination produces correct tokens
   265	- BCL → no regression (BCL has single variant; signals written but discrimination outcome unchanged)
   266	- Meridian → `[VARIANT] Claudia Cruz Ramírez: tokens=[senior]` (or [standard]); 79 entities pass variant discrimination
   267	
   268	**Phase 3 NOT in scope:**
   269	- Cross-roster entity attribute resolution (entity has attributes from multiple rosters) — forward
   270	- Hierarchical attributes (region → sub-region → site) — forward
   271	- Time-varying attributes (entity changes role mid-period) — forward
   272	
   273	### Phase 4 — HF-198.4: Reconciliation-channel separation
   274	
   275	**Defect closed:** Resultados_Esperados ingested as transaction data (architect-flagged as reconciliation-channel violation)
   276	
   277	**Producer:** SCI analyze classification (extension of agent_classification with new signal_type)
   278	
   279	**Consumer:** execute-bulk routing decision
   280	
   281	**Signal schema (`signal_type = 'reconciliation_reference'`):**
   282	```
   283	signal_data: {
   284	  file_name: string,
   285	  sheet_name: string,
   286	  recognition_pattern: 'expected_outputs' | 'gt_validation' | 'scenario_projection' | 'prior_period_baseline',
   287	  recognition_evidence: {
   288	    column_role_signature: string[],  // e.g., ['identifier', 'period_marker', 'currency_total']
   289	    value_distribution: { suggests_computed: boolean, fingerprint_match: string? },
   290	    file_name_pattern: string?,        // e.g., matches /resultados.*esperad/i
   291	  },
   292	  intended_substrate: 'reconciliation_substrate',  // NOT committed_data
   293	  confidence: number,
   294	}
   295	```
   296	
   297	**Producer responsibilities:**
   298	1. SCI analyze examines each file/sheet for reconciliation-reference patterns BEFORE agent classification dispatch
   299	2. If pattern matches with confidence ≥ threshold, emit `reconciliation_reference` signal
   300	3. Agent classification dispatch checks for this signal first; if present, route to reconciliation_substrate path (not entity/transaction/reference/target/plan path)
   301	
   302	**Consumer responsibilities:**
   303	1. execute-bulk routing reads `reconciliation_reference` signals and dispatches to reconciliation_substrate write path
   304	2. reconciliation_substrate is a NEW substrate surface (table TBD — likely `reconciliation_references` table) keyed on (tenant_id, period_id, entity_external_id, expected_value, source_file_name)
   305	3. Calc engine NEVER reads from reconciliation_substrate during calculation
   306	4. Reconciliation engine (separate from calc) reads from reconciliation_substrate to compare calc output against expected
   307	
   308	**Korean Test compliance:** Recognition uses structural patterns (column role signature, value distribution, fingerprint match) — file_name_pattern is supplementary hint only, not gate.
   309	
   310	**Phase 4 verification gate:**
   311	- Synthetic file containing pre-computed expected outputs → signal written with `recognition_pattern: 'expected_outputs'` → routed to reconciliation_substrate
   312	- File NOT routed to committed_data
   313	- Reconciliation engine reads reconciliation_substrate → produces architect-channel comparison report
   314	- BCL → no regression (BCL imports do not trigger this path)
   315	- Meridian → Resultados_Esperados routed correctly; transaction substrate clean
   316	
   317	**Phase 4 NOT in scope:**
   318	- Reconciliation engine itself (separate forward HF — HF-198.4 only enables substrate separation)
   319	- Multi-file reconciliation reference correlation — forward
   320	- Calc-time reference checking (using reconciliation as a calc-time validator) — forward
   321	
   322	### Phase 5 — HF-198.5: Self-correction cycle audit and fix
   323	
   324	**Defect closed:** DS-017 §4.3 confidence-demote-on-binding-failure path inoperative (flagged earlier — confidence climbing despite 0% binding success on Meridian poisoned cache)
   325	
   326	**This phase is diagnostic-then-fix:**
   327	
   328	**Diagnostic step:**
   329	1. Audit `writeFingerprint` UPDATE path against DS-017 §4.3 specification
   330	2. Verify whether binding-success signal feeds into confidence calculation
   331	3. Verify whether match_count increments on binding-failure (it should; the entry was structurally matched but produced wrong outcome — this is a signal for demotion, not deletion)
   332	4. Verify demotion-to-Tier-2 threshold logic
   333	
   334	**Fix shape (TBD pending diagnostic):**
   335	- If signal not feeding confidence calculation → wire it
   336	- If demotion threshold wrong → adjust per DS-017 §4.3
   337	- If incrementing match_count without confidence demotion → fix increment logic
   338	
   339	**Phase 5 verification gate:**
   340	- Synthetic poisoning test: write a fingerprint, force N consecutive binding failures, observe confidence demote and tier transition
   341	- BCL → no regression
   342	- Meridian → if poisoning recurs (it shouldn't post HF-197B), self-correction kicks in autonomously without architect intervention
   343	
   344	**Phase 5 NOT in scope:**
   345	- Cross-tenant signal demotion (Tier 2 confidence at foundational tier) — operative; not modified
   346	- Cache eviction policy (when do we delete vs demote) — forward
   347	
   348	### Phase 6 — HF-198.6: Comprehension surface contract documentation
   349	
   350	**Deliverable:** A new Design Specification at `docs/design-specifications/DS-NNN_Comprehension_Surface_Contract_<DATE>.md` (DS sequence number allocated at authoring time per SOP) and uploaded to project knowledge.
   351	
   352	**Document contents:**
   353	1. **Purpose statement** — what the surface is, what it commits to, what it does not commit to
   354	2. **Signal type registry** — every operative signal_type with schema, producer, consumer(s), failure mode
   355	3. **Substrate locations** — classification_signals, committed_data.metadata, entities.metadata, structural_fingerprints — each with its purpose, update discipline, read pattern
   356	4. **Producer-consumer wiring map** — visual + textual representation of every signal flow
   357	5. **Korean Test compliance verification** — for each signal_type, the structural-vs-lexical analysis
   358	6. **Decision lineage** — Decision 64, 92, 122, 147-A, 153 traced through to current implementation
   359	7. **Forward extension guide** — how to add a new signal_type, how to add a new consumer, how to add a new domain
   360	8. **Failure mode catalog** — what each signal absence means; how the platform should fail closed; how the platform should self-correct
   361	
   362	**Phase 6 verification gate:**
   363	- Document exists, in repo, uploaded to project knowledge
   364	- Document covers every signal_type currently emitted in production
   365	- Architect channel review: would a new architect joining the project be able to extend a new domain (e.g., FM) by reading this document alone?
   366	- A 30-line plain-English summary suitable for cofounder/co-architect comprehension
   367	
   368	**Phase 6 NOT in scope:**
   369	- Implementation of new domains
   370	- Ongoing document maintenance discipline (separate governance question)
   371	
   372	---
   373	
   374	## 4. Campaign-level verification gates
   375	
   376	### 4.1 Per-phase gates (each phase ships independently)
   377	
   378	Each phase's PR ships only when:
   379	1. Phase verification gate met (per phase 3.x.verification gate above)
   380	2. BCL regression test passes ($312,033 exact)
   381	3. Build clean, lint clean, types clean
   382	4. Phase commit history follows commit-per-step discipline
   383	5. Phase completion report authored before push (Rule 25)
   384	6. CC paste block last in any prompt (Rule 29)
   385	7. SR-44 browser verification by architect post-merge
   386	
   387	### 4.2 Campaign-level gate (after all six phases merge)
   388	
   389	The campaign is "complete" only when:
   390	
   391	**4.2.1 Meridian regression resolution:** Meridian fresh re-import on production reconciles to MX$185,063 ± reconciliation tolerance. Per-component reconciliation matches:
   392	- C1 Revenue Performance: $44,000
   393	- C2 On-Time Delivery: $15,550
   394	- C3 New Accounts: $69,900
   395	- C4 Safety Record: $20,700
   396	- C5 Fleet Utilization: $34,913
   397	
   398	This is the regression-test gate — it proves the campaign restored prior capability.
   399	
   400	**4.2.2 Synthetic tenant capability proof:** A synthetic tenant **deliberately structured to be different from BCL and Meridian along multiple axes** is constructed and reconciled:
   401	
   402	- Different language (e.g., German plan + data, or Vietnamese, or Arabic — pick a non-English non-Spanish language to exercise Korean Test rigorously)
   403	- Different plan structure (e.g., single variant where Meridian has two; three variants where BCL has one; mix of plan primitives BCL doesn't use)
   404	- Different data shape (e.g., raw operational data requiring derivation, multi-roster files, hybrid roster+transaction sheet)
   405	- Different reference structure (e.g., multi-level hub hierarchy, or no hub reference at all)
   406	- Different entity attribute discriminators (e.g., region+tier compound discriminator)
   407	
   408	The synthetic tenant must reconcile to its synthetic ground truth without ANY code change between Meridian's reconciliation and the synthetic tenant's reconciliation.
   409	
   410	**This is the enduring-capability gate — it proves the platform handles arbitrary new tenants, not just Meridian-shaped ones.**
   411	
   412	**4.2.3 Documentation gate:** HF-198.6 contract document published; architect-channel review approved.
   413	
   414	**4.2.4 Decision 153 closure:** With all three gates met, Decision 153 is operatively complete. Update INF_DECISION_REGISTRY noting closure date.
   415	
   416	### 4.3 What success looks like
   417	
   418	After this campaign:
   419	
   420	- Adding tenant N+1 requires: importing data, importing plan, clicking calculate. No architect-channel diagnostic. No CC HF. No code change.
   421	- Adding domain N+1 requires: declaring new signal_types (if any), new domain agent specification. No core platform change.
   422	- Adding downstream consumer N+1 (reporting, dispute, AI explanation) requires: querying the comprehension surface for what it needs. No coordination with import pipeline.
   423	
   424	This is the platform that scales to 100s of tenants. Anything less is tenant-specific code accumulation, which has a known terminal — it stops being a platform and becomes a portfolio of bespoke implementations.
   425	
   426	---
   427	
   428	## 5. Phase sequencing rationale
   429	
   430	### 5.1 Recommended order: 3 → 1 → 2 → 4 → 5 → 6
   431	
   432	**Phase 3 (entity attribute projection) FIRST.** Reason: variant discrimination is the gating filter. Without entities passing variant discrimination, the calc has 0 entities to operate on, and Phases 1 and 2 cannot be diagnosed against real calc output. Phase 3 unblocks observability of Phases 1 and 2.
   433	
   434	**Phase 1 (tier matrix) SECOND.** Reason: structural fix at plan interpretation; once tiers populate, Phase 2's convergence binding has something concrete to bind into.
   435	
   436	**Phase 2 (metric comprehension) THIRD.** Reason: convergence binding correctness needs Phases 1 and 3 operative to be diagnosable against real calc output.
   437	
   438	**Phase 4 (reconciliation-channel separation) FOURTH.** Reason: independent of Phases 1-3 mechanically, but easier to verify after calc reconciliation works (so we have a clean pipeline against which to test that the answer-key file is properly excluded).
   439	
   440	**Phase 5 (self-correction audit) FIFTH.** Reason: depends on observable cache state from Phases 1-4; better to audit the cycle when the rest of the pipeline is healthy.
   441	
   442	**Phase 6 (documentation) SIXTH.** Reason: cannot document until the system being documented is stable.
   443	
   444	### 5.2 Alternative order considerations
   445	
   446	- Phase 1 first (tier matrix): defensible if architect prefers structural pipeline order over observability-unblocks order. Drawback: Phase 1 verification cannot use calc output until Phase 3 lands.
   447	- Phase 4 anywhere: independent. Could land in parallel with any other phase. Consider for capacity-balancing across implementation conversations.
   448	- Phase 6 in parallel: documentation could begin immediately and update with each phase landing. Consider as continuous deliverable rather than terminal phase.
   449	
   450	### 5.3 Architect disposition required
   451	
   452	The phase sequencing is the first architect decision when the campaign begins implementation. My recommendation above stands but is not load-bearing.
   453	
   454	---
   455	
   456	## 6. Out-of-scope (explicit forward campaigns)
   457	
   458	These are NAMED here to prevent scope creep in HF-198 and to provide architect channel visibility into the longer arc:
   459	
   460	### 6.1 Format polymorphism (forward HF-199 candidate)
   461	
   462	"Receive any data file in any format" extends beyond XLSX/CSV. Forward campaign covers:
   463	- PDF table extraction
   464	- JSON schema-driven ingestion
   465	- API webhook ingestion
   466	- EDI / fixed-width parsing
   467	- Image-based data (screenshots, scanned plan documents)
   468	- Multi-language OCR
   469	
   470	### 6.2 Domain pack architecture (forward HF-200 candidate)
   471	
   472	ICM is one domain. Future domains (FM Field Maintenance, Workforce Planning, Revenue Operations, etc.) require:
   473	- Domain-specific agent registration on the comprehension surface
   474	- Domain-specific calc primitive types (beyond bounded_lookup_2d/1d, scalar_multiply, conditional_gate, ratio)
   475	- Domain-specific reporting templates
   476	- Domain-specific AI explanation prompts
   477	
   478	### 6.3 Downstream-action declarative consumption (forward HF-201 candidate)
   479	
   480	Currently calc reads the comprehension surface implicitly. Forward campaign:
   481	- Each downstream action (reporting query, dispute scope, AI explanation context, regulatory disclosure) declares its data needs
   482	- The comprehension surface satisfies the declaration
   483	- This is the inversion that fully decouples downstream actions from import pipeline implementation details
   484	
   485	### 6.4 Comprehension surface evolution (forward HF-N candidate)
   486	
   487	As tenants and domains accumulate, the surface itself will need:
   488	- Schema migration discipline for signal_data shape changes
   489	- Signal_type deprecation governance
   490	- Cross-tenant signal pattern mining (foundational tier flywheel beyond fingerprint cache)
   491	- Synthetic-tenant continuous regression infrastructure
   492	
   493	These are forward, not in HF-198.
   494	
   495	---
   496	
   497	## 7. Compliance and substrate citation
   498	
   499	### 7.1 Compliance frame
   500	
   501	- **Decision 64** (single shared signal surface): preserved; new signal_types extend, do not fragment
   502	- **Decision 92** (Carry Everything, Express Contextually): preserved; all source columns flow to committed_data
   503	- **Decision 122** (calculation precision standard, Banker's Rounding): tier_matrix signal carries output_precision per Decision 122
   504	- **Decision 147-A** (intelligence flows through shared surface): operatively realized by this campaign
   505	- **Decision 152** (import sequence independence): preserved; signals are independent of import order
   506	- **Decision 153** (atomic cutover, seeds eradication): closure realized by this campaign
   507	- **HF-094** (per-content-unit fingerprintMap): preserved; per-sheet keying operative (HF-197B)
   508	- **HF-145** (optimistic locking on writeFingerprint UPDATE): preserved
   509	- **HF-095/HF-186/HF-196** (HC primacy chain): preserved; HC roles flow into field_identity signals which feed all other producers
   510	- **HF-110** (resolver fallback chain): preserved; entity_attribute signals layer above field_identity primary path
   511	- **HF-197B** (per-sheet cache keying): foundational for this campaign; without it, signals would be cache-poisoned
   512	- **AP-25 Korean Test**: every signal_type structurally derived; no language-specific or domain-specific lexical matching
   513	- **SR-34 No Bypass**: structural fix; no workarounds; legacy paths eradicated per Decision 153
   514	- **SR-39 Compliance Verification Gate**: N/A for HF-198.1-3; HF-198.4 may touch (reconciliation_substrate as new substrate may require SOC 2 review)
   515	- **SR-44 (browser verification architect-only)**: preserved per phase
   516	- **FP-49 SQL Schema Fabrication guard**: every phase prompts gate SQL through information_schema verify
   517	- **FP-80 false PASS without evidence**: every phase requires pasted evidence at gates
   518	- **FP-81 single-layer fix for multi-layer bug**: explicitly addressed — campaign structure prevents single-layer fix attempts
   519	
   520	### 7.2 Substrate citation
   521	
   522	This design references:
   523	- DIAG-021 disambiguation report
   524	- HF-197B completion report
   525	- DS-017 fingerprint flywheel specification
   526	- DS-016 ingestion architecture
   527	- AUD-001 SCI Pipeline Code Extraction
   528	- Decision 147-A amendment
   529	- Decision 153 LOCKED disposition
   530	- HF-193 plan_agent_seeds eradication completion (PR #339)
   531	- INF_DECISION_REGISTRY
   532	
   533	---
   534	
   535	## 8. Architect dispositions required before implementation begins
   536	
   537	1. **Campaign framing accepted** as multi-phase (not single atomic HF) — architect confirm or revise
   538	2. **Phase sequencing** — architect confirms 3→1→2→4→5→6 or proposes alternative
   539	3. **Synthetic tenant strategy** — architect commits to constructing a synthetic third tenant for capability gate; specifies axes of difference
   540	4. **Phase 4 reconciliation_substrate table design** — architect dispositions whether new table is needed or whether reuse of existing structure (e.g., classification_signals with new signal_type only) is sufficient
   541	5. **Phase 6 documentation timing** — terminal phase or continuous deliverable
   542	6. **Implementation conversation strategy** — each phase its own implementation conversation, or campaign-level implementation conversation with phase-level handoffs
   543	7. **Decision 153 closure ceremony** — when campaign completes, formal Decision 153 closure entry in INF_DECISION_REGISTRY and announcement at architect channel
   544	
   545	---
   546	
   547	## 9. What this design document is, and is not
   548	
   549	**This document IS:**
   550	- The campaign-level architectural design for completing the comprehension surface
   551	- The contract that phase-level implementation prompts must satisfy
   552	- The substrate reference that future campaigns build on
   553	- The justification for treating this work as architectural completion, not tenant remediation
   554	
   555	**This document is NOT:**
   556	- An implementation prompt — phase-level prompts are separate, drafted per phase, with branch-state-conditional logic, continuous-processing discipline, named HALT conditions
   557	- A scoping document — scope is locked here; phase prompts execute against this scope
   558	- A timeline — phases ship as ready; no calendar commitments
   559	- Final — version 1.0 anticipates revision as phases land and the substrate reveals more
   560	
   561	**Document discipline:** This Design Specification is uploaded to project knowledge after architect review. Phase implementation prompts (HF-198.1 through HF-198.6) reference DS-022 by file path. As phases complete, this DS is updated to reflect operative state. Phase 6 (HF-198.6) authors a separate DS — the canonical Comprehension Surface Contract — at the next available DS sequence number (DS-NNN, allocated at authoring time, not pre-allocated). DS-022 remains the campaign design specification; the contract DS authored at Phase 6 closure is the operative consumer-facing reference. Archival convention for superseded DS artifacts pending architect disposition.
   562	
   563	---
   564	
   565	## 10. Honest framing for the architect channel
   566	
   567	This campaign accepts costs:
   568	
   569	- **Time cost:** six phases, six PRs, six verifications. Slower than a single atomic HF.
   570	- **Coordination cost:** each phase is its own implementation conversation; handoff discipline matters.
   571	- **Verification cost:** synthetic tenant construction is a non-trivial deliverable; building the regression infrastructure costs time that doesn't ship features.
   572	- **Documentation cost:** Phase 6 is a real deliverable, not afterthought.
   573	
   574	These costs are paid because the alternative is unbounded:
   575	
   576	- Tenant-specific HFs accumulate
   577	- Each new tenant exposes new defect classes that should have been closed structurally
   578	- The platform stops scaling at the architect-channel debug bottleneck
   579	- At some tenant count (probably 10-30, well below 100), the platform becomes too brittle to add new tenants safely
   580	
   581	This campaign closes that trajectory. It is the work that distinguishes "we have a working ICM platform" from "we have a platform that endures."
   582	
   583	The framing the cofounder/co-architect channel needs:
   584	
   585	> HF-198 is the architectural completion of the comprehension surface mandated by Decision 153. It is not a Meridian fix. It is the work that makes the platform a platform.
   586	
   587	Standing by for architect dispositions per Section 8.
   588	
   589	---
   590	
   591	**Document status:** v1.0 DESIGN — ready for architect review
   592	**Next action:** Architect dispositions per Section 8; Phase 1 implementation prompt (HF-198.1 or HF-198.3 per sequencing disposition) drafted in fresh implementation conversation post-disposition
   593	**Substrate location:** `docs/design-specifications/DS-022_Comprehension_Surface_Completeness_20260504.md` (post-architect-upload to repo and project knowledge)
   594	**Author channel:** architect (Claude design) → architect (Andrew disposition) → CC (per-phase implementation against locked DS-022)
```
