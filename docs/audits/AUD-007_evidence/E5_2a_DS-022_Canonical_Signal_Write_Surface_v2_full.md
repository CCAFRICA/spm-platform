# E5.2a — DS-022 Canonical Signal Write Surface v2 (verbatim with line numbers)

**File:** `docs/design-specifications/DS-022_Canonical_Signal_Write_Surface_v2.md`
**Total lines:** 450

Surfaced because grep returned SCI references (matches: 'SCI emission'/'Synaptic Content Ingestion' present).

```markdown
     1	# DS-022 v2 — Canonical Signal-Write Surface
     2	
     3	**Status:** DRAFT v2 for architect ratification (post-IRA review)
     4	**Type:** Architectural design specification — substrate-grounded, no implementation
     5	**Repository:** `CCAFRICA/spm-platform`
     6	**Output location:** `docs/specs/DS-022_Canonical_Signal_Write_Surface.md`
     7	**Sequence:** DS-022 v2 (supersedes DS-022 v1; predecessor DS-021 Substrate Architecture Biological Lineage v1.0 LOCKED 2026-04-30)
     8	**Authoring conversation:** AUD-006 disposition arc
     9	**Empirical predecessor:** AUD-006 Signal-Write Pipeline Comprehensive Audit (PR #384, daccb7d8)
    10	**Substrate predecessor:** AUD-004 v3 Universal Calculation Primitive Remediation (E1-E6 + Decisions 154/155 LOCKED 2026-04-27)
    11	**IRA review:** PR #54 (Class A Innovation, tier_3_novel, hash 962a877f, $1.659135) — 4 option_recommendations + 2 supersession_candidates
    12	**Supersedes:** DS-022 v1 (drafted same session, superseded post-IRA)
    13	
    14	---
    15	
    16	## Section 0 — Revision history
    17	
    18	| Version | Status | Notes |
    19	|---|---|---|
    20	| v1 | SUPERSEDED-BY-V2 | Initial draft authored in AUD-006 disposition arc; submitted to IRA for Class A Innovation review |
    21	| v2 | DRAFT (this document) | Post-IRA revision incorporating 5 changes (Section 0.2) |
    22	
    23	### 0.1 IRA review summary
    24	
    25	IRA (Class A Innovation, tier_3_novel) reviewed DS-022 v1 against AUD-006 findings. Outputs:
    26	- **Q1 (substrate coherence):** DS-022 v1 substantially closes the multi-pathway defect at substrate-coherence level; one coherence concern surfaced (Carry Everything tension with structured failure)
    27	- **Q2 (sequencing):** introduced substrate-superior 4th option `Sequence_A_modified_with_registry_gate` ranked above all three architect-supplied sequences
    28	- **Q3 (Decision 30 v2 bound):** honor `[0.0, 1.0]` inclusive; `confidence = 1.0` admissible; clamp-induced `[0.0, 1.0)` semantics were T1-E907 violation, not decision amendment
    29	- **Q4 (AUD-004 v3 N3 applicability):** N3 does NOT apply to DS-022; non-blocking compatibility verification note recommended
    30	- **Q5 (gap detection):** 2 supersession candidates surfaced (IGF-T2-E29 reaffirm_as_exception; IGF-T1-E902 extend); neither blocks ratification
    31	
    32	### 0.2 Changes from v1 to v2
    33	
    34	| # | Section | Change | Type | Source |
    35	|---|---|---|---|---|
    36	| 1 | §3 (substrate citations) | Add T1-E902, E905, E912, E920, E930 | Citation extension | IRA brief preamble + supersession candidate 2 |
    37	| 2 | §5.2 (structural enforcement) | Specify row-persistence vs confidence-rejection distinction | Substantive refinement | IRA Q5 supersession candidate IGF-T1-E902 |
    38	| 3 | §5.6 (historical row disposition) | Resolve to clean-slate at Beta-prep | Architect disposition | Architect position + IRA Q3 |
    39	| 4 | §6 (implementation phases) | Reorder to Phase 1 → 4 → 2 → 3 → 5 → 6 | Substantive sequencing | IRA Q2 ranked-1 option |
    40	| 5 | §8 (clarification candidates) | Replace open candidates with resolved dispositions + non-blocking compatibility note | Disposition resolution | IRA Q3 + Q4 |
    41	
    42	---
    43	
    44	## Section 1 — The verbatim problem (unchanged from v1)
    45	
    46	> The platform has fifteen-plus writer sites that mutate `classification_signals` through inconsistent paths, derive identifiers from inconsistent sources, enforce the [0.0, 1.0] contract inconsistently, and converge on no canonical surface. The flywheel cannot accelerate against this; it accumulates noise.
    47	
    48	Binary, present-tense, architectural. The defect is not any single writer, normalizer, clamp, or bypass. It is the absence of the canonical signal-write surface AUD-004 v3 E1-E6 + Decisions 154/155 require. AUD-001 named it as F-002 in March. AUD-006 names it as F-AUD-006-001 through F-AUD-006-007 in May. The dual-write architecture has survived two audits and a substrate lock cycle because the substrate convergence has not been implemented.
    49	
    50	DS-022 specifies that convergence. **Per T1-E912 (Principle-Rule Coherence), this is precisely the "applicability without coherence" pattern: AUD-004 v3 locked E1-E6 but omitted F-002 from its closure map. DS-022 IS the coherence corrective.** Per T1-E920 (Repeated Fix Failure Is a Pattern), the defect surviving two audit cycles + the fragmented DIAG-035→036→037→038 + HF-214/HF-215 cycle qualifies as pattern, not bug — structural response required, not another targeted fix. Per T1-E930 (Choose Right Over Quick), the cost of redesign at decision time is less than the cost of fixing an incorrect solution after deployment; DS-022's six-phase comprehensive approach is the right-over-quick choice.
    51	
    52	---
    53	
    54	## Section 2 — Empirical defect inventory (unchanged from v1)
    55	
    56	Each AUD-006 finding restates as a structural property the canonical surface must guarantee.
    57	
    58	| AUD-006 finding | Severity | Restated as design obligation |
    59	|---|---|---|
    60	| F-AUD-006-001: B2 dead code on production path | P0 | Producer normalization must occur at exactly one site, on the path every writer consumes. No class-wrapped normalizer that production routes bypass. |
    61	| F-AUD-006-002: Clamp masks Decision 30 v2 violations; 4 bypass writers + 1 route call site | P0 | Decision 30 v2 enforced structurally, not by clamping. Zero bypass paths. Every write goes through the canonical surface. |
    62	| F-AUD-006-003: `response.confidence` vs `response.result.confidence` 100x asymmetry on inputs | P0 | One canonical normalization site at the producer boundary. Both top-level and nested confidence representations agree before either reaches a writer. |
    63	| F-AUD-006-004: Dual write architecture (JSONB + dedicated columns) | P1 | One writer interface. The two existing paths collapse to one. |
    64	| F-AUD-006-005: 16 unregistered `ai_`-prefix signal_types | P1 | Identifier derivation from the registry (Decision 155). Unregistered types fail at write time per E2. |
    65	| F-AUD-006-006: 30 historical exact-1.0 rows pre-clamp | P1 | Clean-slate at Beta-prep reset boundary closes by wipe. (See §5.6) |
    66	| F-AUD-006-007: `lifecycle:briefing` + `lifecycle:stream` omit confidence | P1 | Required fields per signal level enforced at the surface. Null confidence rejected for signal levels where confidence is mandatory; admitted where the registry per signal level declares it optional. |
    67	| F-AUD-006-008: Other prompt templates retain (0-100) | P2 | Out of DS-022 scope (prompt-template work, not surface work) |
    68	| F-AUD-006-009: B2 fallback semantic carry-forward | P2 | Closes structurally if B2 ceases to exist (replaced by canonical normalization site). |
    69	| F-AUD-006-010: Cosmetic display drift | P3 | Out of DS-022 scope |
    70	
    71	DS-022 v2 closes F-AUD-006-001 through F-AUD-006-007 and F-AUD-006-009 structurally. Eight of ten audit findings.
    72	
    73	---
    74	
    75	## Section 3 — Substrate citations (CHANGE 1: extended with T1-E902, E905, E912, E920, E930)
    76	
    77	Each citation is a locked substrate entry DS-022 consumes. DS-022 does not amend any of these; it implements the surface they require.
    78	
    79	### Decisions (locked)
    80	
    81	- **Decision 30 v2** — Confidence convention `[0.0, 1.0]` inclusive bound, schema `NUMERIC(5,4)`. Values outside this range are contract violations.
    82	- **Decision 64 v2** — Dual Intelligence Architecture / `classification_signals` singular shared surface / L1 Classification, L2 Comprehension, L3 Convergence partitioning.
    83	- **Decision 153** (LOCKED 2026-04-20) — Atomic cutover from `plan_agent_seeds` to signal-surface architecture. Signal_type naming uses structural prefixes.
    84	- **Decision 154** (LOCKED 2026-04-27) — Korean Test for operation/primitive vocabulary; structured failure on unrecognized identifiers.
    85	- **Decision 155** (LOCKED 2026-04-27) — Canonical declaration is a surface (registry); federated per-domain entries.
    86	
    87	### AUD-004 v3 substrate extensions (LOCKED 2026-04-27)
    88	
    89	- **E1** — Single canonical declaration surface
    90	- **E2** — Dispatch surface integrity / structured failure
    91	- **E3** — Read-before-derive structurally partitioned by signal level
    92	- **E5** — Closed-loop intelligence; read-before-derive as principle-level obligation
    93	- **E6** — Korean Test for operation vocabulary (captured in Decision 154)
    94	
    95	### T1 substrate entries
    96	
    97	- **T1-E902** (Carry Everything, Express Contextually) — *added in v2*. The platform persists ALL data regardless of whether AI has classified it. AI classifications are hints, not gates. **Operative implication for DS-022:** structured failure on confidence value out-of-range must NOT gate signal row persistence. The signal row carries the data; the confidence field carries the AI assertion; structured-failure handling preserves the row while flagging the assertion. (See §5.2.)
    98	- **T1-E905** (Prove, Don't Describe) — *added in v2*. Every number must be traceable to its source data cell. Nothing is asserted without an evidence chain. **Operative implication for DS-022:** value-trust property (§4.1) is the direct substrate expression. Persisted confidence must reflect producer assertion within schema precision; F-AUD-006-003 (100x asymmetry) is the empirical violation this principle names.
    99	- **T1-E906** (Closed-Loop Intelligence) — Every interaction generates a classification signal that accumulates into the platform's learning systems. **Trustworthy accumulation is constitutive; an untrustworthy surface accumulates noise, not learning.**
   100	- **T1-E907** (Fix Logic, Not Data) — Defects are closed at structural sites, not by data-layer compensation. The clamp at the writer is data-layer compensation; the fix is structural enforcement.
   101	- **T1-E910** (Korean Test) — All field identification uses structural heuristics; zero language-specific string literals in foundational code.
   102	- **T1-E912** (Principle-Rule Coherence and the Supersession Surface) — *added in v2*. When the substrate is queried for binding intelligence, two findings are possible: (1) applicability — which rules govern; (2) coherence — whether rules at lower tiers still serve principles at higher tiers. **Operative implication for DS-022:** AUD-004 v3 locked E1-E6 but omitted F-002 from its closure map — applicability without coherence. DS-022 IS the coherence response.
   103	- **T1-E920** (Repeated Fix Failure Is a Pattern, Not a Bug) — *added in v2*. A defect fixed multiple times that continues failing verification is no longer a bug — it is a pattern. Patterns require structural responses. **Operative implication for DS-022:** F-002 surviving AUD-001 → AUD-004 v3 → AUD-006 + the DIAG-035/036/037/038 + HF-214/HF-215 cycle qualifies as pattern. DS-022 is the structural response this principle demands.
   104	- **T1-E930** (Choose Right Over Quick) — *added in v2*. The cost of redesign at decision time is less than the cost of fixing an incorrect solution after deployment. **Operative implication for DS-022:** DS-022's six-phase comprehensive approach over incremental hotfixes is the right-over-quick choice.
   105	- **T1-E931** (Locked Decision Immutability) — Locked decisions are operative authority; cannot be modified, only superseded by new decisions that explicitly reference and override.
   106	- **T1-E947** (Reasoning-Scope Binding Specificity) — Carry what actually binds at the relevant scope. The canonical surface carries every signal_type the registry declares; bindings activate at consumer scope.
   107	
   108	---
   109	
   110	## Section 4 — The four trust properties (closure criteria, unchanged from v1)
   111	
   112	These are the verification gates. The canonical surface succeeds when all four hold.
   113	
   114	### 4.1 Value-trust
   115	
   116	**Claim:** A persisted confidence value of `c` means the producer asserted `c` to within the schema's precision. (Direct expression of T1-E905 Prove Don't Describe applied to the signal-write surface.)
   117	
   118	**Today:** Plan-comprehension-emitter persists 0.9999 because the writer-side clamp masks an upstream raw value of 95. The producer asserted 0.95. Persisted value disagrees with producer assertion. T1-E905 violated.
   119	
   120	**Closure path:** Producer normalization at canonical site; structured failure at writer for out-of-range values; no clamp.
   121	
   122	**Closes:** F-AUD-006-001, -002, -003.
   123	
   124	### 4.2 Identity-trust
   125	
   126	**Claim:** Every persisted `signal_type` is a registered identifier whose readers are declared and whose level is structurally known.
   127	
   128	**Today:** 16 unregistered `ai_`-prefix types from `AI_TASK_LEVEL_MAP` fire soft-warns on every write. Production writers can persist arbitrary strings.
   129	
   130	**Closure path:** Registry derivation at write boundary. Unregistered types fail at write per E2 structured-failure obligation.
   131	
   132	**Closes:** F-AUD-006-005.
   133	
   134	### 4.3 Coverage-trust
   135	
   136	**Claim:** Every signal write in the codebase converges on the canonical surface. Zero bypass paths.
   137	
   138	**Today:** Four direct `.from('classification_signals').insert(...)` writers (`convergence-service:363`, `briefing-signals:67`, `stream-signals:66`, `sci/classification-signal-service:91`) plus `route.ts:376` writing literal 1.0. Dual-write architecture (JSONB + dedicated-column) coexists.
   139	
   140	**Closure path:** One writer interface; consolidate or refactor every direct insert path through it; eliminate the dual architecture.
   141	
   142	**Closes:** F-AUD-006-002 (bypass), F-AUD-006-004 (dual architecture).
   143	
   144	### 4.4 Continuity-trust
   145	
   146	**Claim (revised v2):** Aggregations across time on the signal surface are not distorted by pre-substrate-convergence data. **Trivially satisfied post-Beta-prep clean-slate** (see §5.6); aggregations begin fresh from substrate-convergence forward.
   147	
   148	**Closes:** F-AUD-006-006.
   149	
   150	---
   151	
   152	## Section 5 — The canonical surface specification
   153	
   154	### 5.1 One writer interface (unchanged from v1)
   155	
   156	**Obligation:** All signal writes — from any module, any agent, any route — call exactly one entry point. No module imports `supabase.from('classification_signals')` directly.
   157	
   158	**Mechanism:**
   159	- One module is the canonical writer entry point. The DS does not prescribe the file name; it specifies the singular entry-point obligation.
   160	- The entry point exposes a single function (or single class with single write method). Batch and single-row writes share the same validation surface.
   161	- Existing callers of `persistSignal`, `persistSignalBatch`, `writeClassificationSignal`, and direct `.from(...).insert(...)` all migrate to the canonical entry point.
   162	
   163	**Verification:** `grep -rn "from('classification_signals')" web/src/` returns matches only inside the canonical writer module.
   164	
   165	**Substrate basis:** Decision 64 v2, AUD-004 v3 E1, AUD-001 F-002, T1-E920 (Repeated Fix Failure Is a Pattern).
   166	
   167	### 5.2 Structural contract enforcement at the boundary (CHANGE 2: extended with row-persistence vs confidence-rejection distinction)
   168	
   169	**Obligation:** Decision 30 v2 (`confidence ∈ [0.0, 1.0]` inclusive) is enforced as a precondition. Out-of-range values produce structured failure with named, observable error class. **Carry Everything (T1-E902) honored: the signal row persists; the confidence field reflects the structured failure.**
   170	
   171	**Mechanism:**
   172	- The canonical entry point validates every required field per signal level before the database call.
   173	- Validation outcomes per field:
   174	  - **Confidence in `[0.0, 1.0]` inclusive:** value persists as asserted by producer; no transformation
   175	  - **Confidence out-of-range (>1.0, <0.0, NaN, Infinity):** persistence proceeds with `confidence = null` + a separate structured-failure signal emitted to `classification_signals` with signal_type `cost:event` (or a registered observability signal_type) capturing (offending field, expected range, actual value, producing module, source signal_type). The original signal row persists per Carry Everything; the confidence field reflects the assertion failure
   176	  - **Confidence missing where required:** typed error class thrown to caller; signal row NOT persisted; producer must remediate and retry. (This case differs from out-of-range because there is no producer assertion at all.)
   177	  - **Confidence missing where optional per registry per signal level:** persists as null; no failure
   178	- No silent clamping. No `console.warn` and proceed for out-of-range values.
   179	- Callers handle the typed error class explicitly. Fire-and-forget swallowed failures are an architectural anti-pattern (AUD-001 F-003); the canonical surface does not produce them.
   180	
   181	**Required-field rules per signal level (per Decision 64 v2):**
   182	- L1 Classification signals: `tenant_id`, `signal_type`, `signal_value`, `confidence` REQUIRED
   183	- L2 Comprehension signals: same as L1
   184	- L3 Convergence signals: same as L1
   185	- `lifecycle:*` signals: per-signal-type registry declares whether confidence is mandatory or optional (closes F-AUD-006-007 by registry-driven specification rather than blanket rule)
   186	
   187	**Why row-persistence-on-confidence-failure honors both T1-E902 and T1-E907:**
   188	- T1-E902 (Carry Everything): the signal row IS the data; AI classifications are hints. Confidence is the AI hint. The row persists; the hint reflects the failure. Data is preserved.
   189	- T1-E907 (Fix Logic Not Data): the structured-failure signal makes the producer-side defect observable. The producer must fix the derivation. The fix lives at the producer, not at the writer.
   190	
   191	**Verification:** Schema test produces a known out-of-range value; assert (a) original signal row persists with `confidence = null`, (b) structured-failure signal persists with offending-field metadata. Reader test asserts no row in `classification_signals` violates Decision 30 v2 inclusive bound (no clamping has masked anything; out-of-range values surface as null + structured-failure signal).
   192	
   193	**Substrate basis:** Decision 30 v2 (confidence convention inclusive bound), AUD-004 v3 E2 (structured failure), T1-E902 (Carry Everything), T1-E907 (Fix Logic, Not Data).
   194	
   195	### 5.3 Identifier derivation from the registry (unchanged from v1)
   196	
   197	**Obligation:** `signal_type` is not a free string. It is a registered identifier. Writers receive identifiers from the registry; unregistered identifiers cannot be persisted.
   198	
   199	**Mechanism:**
   200	- Canonical entry point accepts a registered-identifier type (TypeScript discriminated union, enum derived from registry, or runtime check against registry).
   201	- At runtime, writer asserts `signal_type` is a registered identifier. Unregistered identifiers throw the typed error class. Soft-warn becomes structured failure.
   202	- Registration is the first-class admission ceremony. New signal_types are added to the registry before code that writes them is merged.
   203	- `AI_TASK_LEVEL_MAP` (currently the parallel identifier source per F-AUD-006-005) collapses into the registry.
   204	
   205	**Verification:** Production logs show zero `[SignalRegistry] not registered` soft-warns post-DS-022. Test asserts unregistered identifier produces typed error class.
   206	
   207	**Substrate basis:** Decision 154, Decision 155, AUD-004 v3 E1, E2, E3, E6.
   208	
   209	### 5.4 Producer-side normalization at canonical site (unchanged from v1)
   210	
   211	**Obligation:** AI confidence values are normalized at exactly one producer-side site. By the time any value reaches the canonical writer, it is in ratio form `[0.0, 1.0]`.
   212	
   213	**Mechanism:**
   214	- `anthropic-adapter.ts` returns `AIResponse` with both `response.confidence` and `response.result.confidence` (and any nested component confidences) in ratio form. The asymmetry causing F-AUD-006-003 closes at the producer boundary.
   215	- The DS does not prescribe the implementation site within `anthropic-adapter.ts`; it specifies that `AIResponse` is in ratio form when it leaves the adapter.
   216	- B2 normalizer in `ai-plan-interpreter.ts` becomes redundant. Either removed (closes F-AUD-006-001 + F-AUD-006-009 by deletion) or retained as defense-in-depth that no longer fires (architect dispositions).
   217	
   218	**Verification:** Producer-side test asserts `response.result.confidence` is in `[0.0, 1.0]` for every prompt template that returns confidence. Production logs show zero `[AIPlanInterpreter] confidence normalized` warnings.
   219	
   220	**Substrate basis:** AUD-004 v3 E1, T1-E907, T1-E905.
   221	
   222	### 5.5 No writer-side clamp (unchanged from v1)
   223	
   224	**Obligation:** The writer-side clamp (HF-214 Phase 2 A) is removed. Decision 30 v2 violations produce structured failure per §5.2, not silently masked persistence.
   225	
   226	**Mechanism:**
   227	- `signal-persistence.ts:62-76` and `:135-149` clamp blocks are removed.
   228	- Validation in 5.2 (structural contract enforcement) replaces clamp behavior. Out-of-range values produce row-persistence-with-null-confidence + structured-failure signal.
   229	
   230	**Verification:** `grep -n "0.9999\|Math.min.*Math.max\|clampedConfidence" web/src/lib/ai/signal-persistence.ts` returns zero matches. Database state shows no row at exactly 0.9999 from new writes.
   231	
   232	**Substrate basis:** T1-E907, AUD-004 v3 E2.
   233	
   234	### 5.6 Historical row continuity strategy (CHANGE 3: resolved to clean-slate at Beta-prep)
   235	
   236	**Obligation (resolved v2):** The 30 historical exact-1.0 rows pre-Phase-2 close by clean-slate at the next reset boundary. Production database is wipeable until Beta is achieved (architect position).
   237	
   238	**Disposition:**
   239	- F-AUD-006-006 closes by database wipe at Beta-prep, not by migration, exclusion, or acceptance.
   240	- No migration script is required.
   241	- Continuity-trust property (§4.4) is trivially satisfied post-wipe; aggregations begin fresh from substrate-convergence forward.
   242	
   243	**Substrate basis:** Architect's Beta-prep reset authority + IRA Q3 disposition (Decision 30 v2 inclusive bound; the 30 rows were Decision 30 v2 compliant when written but their continued presence is unnecessary given the reset boundary).
   244	
   245	**Verification:** Post-wipe SQL `SELECT count(*) FROM classification_signals WHERE confidence = 1.0` returns zero.
   246	
   247	### 5.7 Dispatch surface diagram (unchanged from v1)
   248	
   249	```
   250	                    ┌──────────────────────────────┐
   251	                    │       AI Provider Layer      │
   252	                    │     (anthropic-adapter)      │
   253	                    │                              │
   254	                    │  Producer-side normalization │
   255	                    │   (5.4): AIResponse leaves   │
   256	                    │     in ratio form [0,1]      │
   257	                    └──────────────┬───────────────┘
   258	                                   │
   259	                ┌──────────────────┼─────────────────┐
   260	                ▼                  ▼                 ▼
   261	      ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
   262	      │ plan-comp-emit  │ │ training-signal │ │ convergence-svc │
   263	      │                 │ │                 │ │                 │
   264	      │ (and every      │ │ (and every      │ │ (and every      │
   265	      │  other producer)│ │  other producer)│ │  other producer)│
   266	      └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
   267	               │                   │                    │
   268	               └───────────────────┼────────────────────┘
   269	                                   ▼
   270	              ┌────────────────────────────────────────────┐
   271	              │         CANONICAL SIGNAL WRITER            │
   272	              │                                            │
   273	              │  5.1 One entry point                       │
   274	              │  5.2 Decision 30 v2 enforcement            │
   275	              │      (row persists; confidence = null +    │
   276	              │       structured-failure signal on OOR)    │
   277	              │  5.3 Registry-derived signal_type only     │
   278	              │      (structured failure on unregistered)  │
   279	              │  5.5 No clamp                              │
   280	              └────────────────────┬───────────────────────┘
   281	                                   │
   282	                                   ▼
   283	              ┌────────────────────────────────────────────┐
   284	              │         classification_signals             │
   285	              │           (Decision 64 v2)                 │
   286	              │                                            │
   287	              │  Every persisted row:                      │
   288	              │    • value-trustworthy (5.4 + 5.5)         │
   289	              │    • identity-trustworthy (5.3)            │
   290	              │    • coverage-trustworthy (5.1)            │
   291	              │    • continuity-trustworthy (5.6 wipe)     │
   292	              └────────────────────────────────────────────┘
   293	                                   │
   294	                                   ▼
   295	              ┌────────────────────────────────────────────┐
   296	              │          Reader / Flywheel surfaces        │
   297	              │                                            │
   298	              │  Convergence-service / calibration / etc.  │
   299	              │  AUD-004 v3 E5: read-before-derive obeyed  │
   300	              │  T1-E906: closed-loop intelligence         │
   301	              └────────────────────────────────────────────┘
   302	```
   303	
   304	---
   305	
   306	## Section 6 — Implementation phases (CHANGE 4: reordered to IRA-recommended Sequence A modified with registry gate)
   307	
   308	**Sequence: Phase 1 → Phase 4 → Phase 2 → Phase 3 → Phase 5 → Phase 6**
   309	
   310	Rationale: closes P0 findings at source first per T1-E907; establishes identity-trust foundation per Decision 154 + T1-E910 before §5.3 enforcement activates; canonical writer deploys with both correct-magnitude inputs (from Phase 1) AND complete registry (from Phase 4), enabling full §5.2 + §5.3 enforcement from day one. No deployment coupling. Lowest structural risk per IRA Q2 ranking.
   311	
   312	### Phase 1 — Producer-side normalization
   313	
   314	**Closes:** F-AUD-006-001, F-AUD-006-003, F-AUD-006-009.
   315	
   316	**Scope:** Single canonical normalization site at `anthropic-adapter.ts` ensures `AIResponse.confidence` and `AIResponse.result.confidence` (and nested component confidences) are in ratio form [0.0, 1.0] before leaving the adapter.
   317	
   318	**Verification:** producer-side test per §5.4.
   319	
   320	### Phase 4 — Registry consolidation
   321	
   322	**Closes:** F-AUD-006-005.
   323	
   324	**Scope:** `AI_TASK_LEVEL_MAP` collapses into `signal-registry.ts`. The 16 `ai_`-prefix types register with declared readers per Decision 64 v2 L1/L2/L3 partitioning. Registry surface is complete.
   325	
   326	**Verification:** zero `[SignalRegistry] not registered` warnings on representative AI-call paths.
   327	
   328	### Phase 2 — Canonical writer entry point
   329	
   330	**Closes:** F-AUD-006-002 (clamp dimension), F-AUD-006-004, F-AUD-006-007, AUD-001 F-002, AUD-001 F-003.
   331	
   332	**Scope:** Build canonical entry point per §5.1. Migrate `persistSignal` + `persistSignalBatch` + `writeClassificationSignal` into it. Add §5.2 row-persistence-with-structured-failure logic and §5.3 identifier derivation. Remove §5.5 clamp.
   333	
   334	**Verification:** schema test per §5.2; registry test per §5.3.
   335	
   336	### Phase 3 — Bypass writer migration
   337	
   338	**Closes:** F-AUD-006-002 (bypass dimension).
   339	
   340	**Scope:** Refactor four bypass writers (`convergence-service:363`, `briefing-signals:67`, `stream-signals:66`, `sci/classification-signal-service:91`) and route call site at `route.ts:376` to route through canonical entry point.
   341	
   342	**Verification:** `grep -rn "from('classification_signals')" web/src/` returns matches only inside canonical writer module.
   343	
   344	### Phase 5 — Historical row clean-slate
   345	
   346	**Closes:** F-AUD-006-006.
   347	
   348	**Scope:** Database wipe at Beta-prep reset boundary per §5.6. No migration script.
   349	
   350	**Verification:** post-wipe SQL `SELECT count(*) FROM classification_signals WHERE confidence = 1.0` returns zero.
   351	
   352	### Phase 6 — Verification and lock
   353	
   354	**Closes:** four trust properties verified empirically.
   355	
   356	**Scope:** End-to-end test on Meridian + a second proof tenant. Every persisted confidence value reflects producer assertion within schema precision. Production logs show zero `[SignalRegistry] not registered` warnings, zero `[SignalPersistence] confidence clamped` warnings (clamp removed), zero unhandled out-of-range confidence values (all surface as null + structured-failure signal). AUD-006 P0 findings F-AUD-006-001, -002, -003 close empirically. AUD-001 F-002 closes after surviving since March.
   357	
   358	DS-022 ratifies on architect approval post-implementation.
   359	
   360	---
   361	
   362	## Section 7 — Audit-finding closure map (revised v2 with Phase reordering)
   363	
   364	| Finding | Severity | Closure path | Closure phase |
   365	|---|---|---|---|
   366	| F-AUD-006-001 | P0 | 5.4 (producer normalization) | Phase 1 |
   367	| F-AUD-006-002 | P0 | 5.1 (one writer) + 5.2 (structural enforcement) + 5.5 (no clamp) | Phases 2, 3 |
   368	| F-AUD-006-003 | P0 | 5.4 (producer normalization at canonical site) | Phase 1 |
   369	| F-AUD-006-004 | P1 | 5.1 (one writer interface) | Phase 2 |
   370	| F-AUD-006-005 | P1 | 5.3 (registry-derived identifiers) | Phase 4 |
   371	| F-AUD-006-006 | P1 | 5.6 (clean-slate at Beta-prep) | Phase 5 |
   372	| F-AUD-006-007 | P1 | 5.2 (registry-driven required-field rules per signal level) | Phase 2 |
   373	| F-AUD-006-008 | P2 | (out of DS-022 scope; prompt-template work) | — |
   374	| F-AUD-006-009 | P2 | 5.4 (B2 becomes redundant or deletes) | Phase 1 |
   375	| F-AUD-006-010 | P3 | (out of DS-022 scope; UI work) | — |
   376	| AUD-001 F-002 | P1 | 5.1 (one writer) | Phase 2 |
   377	| AUD-001 F-003 | P1 | 5.2 (no fire-and-forget; structural failure surfaces explicitly) | Phase 2 |
   378	
   379	DS-022 v2 closes 8 of 10 AUD-006 findings + 2 AUD-001 findings.
   380	
   381	---
   382	
   383	## Section 8 — Clarification dispositions (CHANGE 5: replaces v1 §8 open candidates)
   384	
   385	DS-022 v1 §8 surfaced two clarification candidates as open questions for IRA review. Both are now resolved.
   386	
   387	### Clarification 1 — Decision 30 v2 inclusive vs exclusive bound (RESOLVED)
   388	
   389	**Disposition:** Honor the inclusive bound. `confidence = 1.0` is admissible.
   390	
   391	**Substrate reasoning (per IRA Q3):** T1-E931 (Locked Decision Immutability) — Decision 30 v2 reads `[0.0, 1.0]` inclusive. The clamp at 0.9999 was a workaround (T1-E907 violation), not a decision amendment. Effective `[0.0, 1.0)` semantics emerged from defense-in-depth — never locked. Treating 1.0 as a violation would either silently narrow Decision 30 v2 (T1-E931 violation) or require a superseding Decision 30 v3 with no structural justification.
   392	
   393	**Operative implication:** §5.2 enforces `[0.0, 1.0]` inclusive. `confidence = 1.0` writes pass validation.
   394	
   395	### Clarification 2 — AUD-004 v3 N3 applicability (RESOLVED)
   396	
   397	**Disposition:** N3 does NOT apply to DS-022's canonical writer surface.
   398	
   399	**Substrate reasoning (per IRA Q4):** N3's C1 (persistence-before-declaration), C2 (structural-identification), C3 (resolution-chain compatibility) are SCI emission constraints operating at emission point. DS-022's canonical writer is the persistence-point convergence layer. Different points in the pipeline. N3's C2 is subsumed by DS-022 §5.3 + Decision 154 through a different mechanism (registry lookup vs emission ordering). N3's C1 and C3 are SCI-specific and downstream of the write surface. T1-E947 (Reasoning-Scope Binding Specificity) supports separation: N3 and DS-022 operate at different pipeline points.
   400	
   401	### Compatibility verification note (non-blocking)
   402	
   403	When §5.1 makes the canonical writer the sole write path, SCI emissions that previously bypassed will flow through it. **Post-ratification verification:** confirm canonical writer interface (§5.1) does not conflict with N3's C1-C3 SCI emission constraints when SCI emissions transit the canonical surface. This is a non-blocking verification scoped to the successor implementation conversation; does not block DS-022 ratification.
   404	
   405	---
   406	
   407	## Section 9 — What DS-022 v2 does NOT do (unchanged from v1 + IRA confirmation)
   408	
   409	- ❌ Does NOT amend any locked substrate (Decisions 30 v2, 64 v2, 153, 154, 155 + AUD-004 v3 E1-E6 + T1 entries are all consumed, not modified)
   410	- ❌ Does NOT prescribe implementation file names beyond noting current candidate sites
   411	- ❌ Does NOT direct CC; specification for architect ratification + successor implementation conversation
   412	- ❌ Does NOT address the c4 magnitude defect at `route.ts:1793/1798` (calculation-engine concern, separate surface)
   413	- ❌ Does NOT address calc-execution surfaces (AUD-005 governs)
   414	- ❌ Does NOT address other prompt templates retaining (0-100) language (F-AUD-006-008; prompt-template work)
   415	- ❌ Does NOT address UI display drift (F-AUD-006-010; UI work)
   416	- ❌ Does NOT introduce new substrate; cites existing substrate via §3 extension
   417	
   418	---
   419	
   420	## Section 10 — Successor handoff (post-ratification, revised v2)
   421	
   422	After architect ratification of DS-022 v2:
   423	
   424	**Successor implementation conversation produces:**
   425	1. Phase B boundary inventory (per AUD-004 v3 Section 9 convention, applied to DS-022 surface) — read-only inventory of every dispatch boundary on the signal-write pipeline that DS-022 consolidates
   426	2. Mechanism specification — concrete implementation plan per Phase 1 → 4 → 2 → 3 → 5 → 6
   427	3. Vertical slice CC directive(s) — Phase 1 first (producer-side normalization, closes 3 P0 findings), then Phase 4 (registry consolidation), then Phase 2 (canonical writer with full enforcement), then Phases 3, 5, 6 sequenced
   428	4. Compatibility verification (per §8): canonical writer ↔ N3 SCI emission constraints non-blocking check
   429	
   430	**Reconciliation gate (Decision 95):** Meridian batch totals 55,909 / 53,559 / 57,534 (DIAG-038 + AUD-006 reading) preserve bit-identically across DS-022 v2 implementation. The c4 magnitude defect remains a separate target; DS-022 does not change calculation values.
   431	
   432	**Trust property verification (post-implementation):**
   433	- Value-trust: every persisted confidence reflects producer assertion within schema precision
   434	- Identity-trust: zero unregistered signal_type warnings
   435	- Coverage-trust: zero direct `.from('classification_signals').insert(...)` calls outside canonical writer module
   436	- Continuity-trust: post-wipe surface; aggregations begin fresh from substrate-convergence forward
   437	
   438	---
   439	
   440	## Section 11 — At-close / what makes this a singular surface (revised v2 with IRA validation)
   441	
   442	DS-022 v2 closes the multi-pathway architectural defect the architect has called out across threads and workstreams. AUD-001 named it in March; AUD-004 v3 locked the substrate that requires its closure in April; AUD-006 surfaced it empirically in May with the holistic aperture fragmented DIAGs lacked. IRA's tier_3_novel review (PR #54) confirmed substrate coherence and surfaced the IRA-superior implementation sequencing now adopted in §6.
   443	
   444	The flywheel runs on a singular surface: producers write to one canonical entry; readers read from `classification_signals` (Decision 64 v2); learning accumulates trustworthily because the surface guarantees value-trust, identity-trust, coverage-trust, continuity-trust. Each second encounter of the same fingerprint reads accumulated signals whose confidence values are real — not clamped, not masked, not asymmetric. The platform's value proposition — Tier 1 cache at $0 / ~100ms — depends on that trustworthiness.
   445	
   446	DS-022 v2 is the substrate convergence that makes the platform's locked decisions operative on the platform's signal-write surface for the first time. Per T1-E912, this is the principle-rule coherence corrective AUD-004 v3's closure-map omission required. Per T1-E920, this is the structural response a pattern (not a bug) demands. Per T1-E930, this is the right-over-quick choice that the multi-audit defect arc has shown to be the lower-cost path.
   447	
   448	---
   449	
   450	*DS-022 v2 — Canonical Signal-Write Surface · DRAFT for architect ratification · Post-IRA review (PR #54, tier_3_novel, hash 962a877f, $1.659135) · Substrate baseline: Decisions 30 v2, 64 v2, 153, 154, 155 LOCKED + AUD-004 v3 E1-E6 LOCKED 2026-04-27 + DS-021 LOCKED 2026-04-30 · Empirical predecessor: AUD-006 (PR #384, daccb7d8) · Closes 8 of 10 AUD-006 findings + 2 AUD-001 findings · Implementation by successor conversation post-ratification · Five changes from v1 documented in §0.2.*
```
