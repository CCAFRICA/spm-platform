# DIAG-DS021-Phase4 — Comprehensive Audit Specification Against Locked DS-021 v1.0

**Status:** Phase 4 audit directive (specification only; does not execute audit)
**Date:** 2026-04-30
**Authoring channel:** Architect (Claude) under directive disposition following DS-021 v1.0 lock
**Audit subject:** DS-021 v1.0 LOCKED 2026-04-30 (`DS-021_Substrate_Architecture_Biological_Lineage_v1_0_LOCKED_20260430.md`, SHA256 `7fa895291514a6de873a1114e30f678dadf895d23f499b5426dcef069a088edb`)
**Companion artifacts:** IRA Phase 3 review (commits `66fb75e` / `d192eef` / `f1803fa` on `origin/ds-021-phase-1b-ira` in vialuce-governance repo); AUD-002 v2 (architectural remediation findings); AUD-004 Remediation Design Document v3 (load-bearing biological analogies discipline)
**Forward direction:** This DIAG is canonical input to a fresh-context synthesis conversation that produces development specification(s) for Phase 5 disposition (remediate vs. rebuild per dressmaker's edict)

---

## 0. Document Purpose and Scoping Discipline

This DIAG is a **specification of audit work**, not the audit itself. It defines:

- What to audit (commitments G1–G11 from DS-021 v1.0; substrate properties P1–P11 by inference where directly measurable)
- What evidence to collect (code paths, schema state, classification_signals queries, UI surfaces, test executions)
- What compliance verdicts mean (ADHERED / DEVIATED / NEW)
- What audit gates must PASS before audit results inform disposition
- What forensic methodology applies (CC-UAT Dual-Trace extended with substrate-trace probes)
- What the Phase 4 audit Completion Report structure produces

This DIAG also includes **preliminary architect-channel findings** (Section 8) that pre-identify high-confidence DS-021 v1.0 compliance gaps based on AUD-002 v2 evidence already in the substrate. These are not findings *of* the Phase 4 audit; they are findings the Phase 4 audit will encounter, and the DIAG names them upfront so the audit execution can prioritize accordingly.

**Substrate Bounded Authority applies to this DIAG itself.** Three categories of audit findings will be substrate-extending and warrant successor re-evaluation when ICA captures relevant lineage. These are named explicitly in Section 9 to prevent over-weighting Phase 4 findings on substrate-extending concerns.

**Documentary discipline:** This DIAG is a standalone canonical specification. It is not co-located with the session handoff (`SESSION_HANDOFF_20260430.md`); the handoff references this DIAG by SHA256 and filename. The two documents serve different purposes and have different lifecycles: the DIAG is consulted by every Phase 4 audit execution (potentially multiple, by different agents, over time); the handoff is read once at the start of the next conversation and then archived.

---

## 1. Audit Objectives

The Phase 4 audit produces evidence-grounded answers to four questions:

**Q-A. For each commitment G1–G11, what is the platform's actual compliance state?** ADHERED, DEVIATED (with magnitude and locus), or NEW (commitment not previously in the substrate, no prior compliance state to compare).

**Q-B. For each property P1–P11, is the property operationally observable in current platform behavior?** Properties are constitutive (the substrate is or is not permeable; the substrate does or does not adapt) — observability is the audit measure.

**Q-C. What is the gap between DS-021 v1.0's specified substrate and the platform's actual substrate?** Quantified by commitment compliance, weighted by architectural significance, and characterized as remediable-by-targeted-work vs. requiring-substantial-rework.

**Q-D. Which commitments' compliance gaps are interconnected such that fixing one independently is mechanically impossible?** Interconnected gaps require coordinated remediation (or rebuild). Independent gaps can be remediated in parallel.

The Phase 4 audit answers these questions with pasted evidence: code excerpts, schema query results, signal-surface query results, test execution outputs. Self-attestation is not accepted (per Standing Rule 27).

---

## 2. Audit Methodology — CC-UAT Dual-Trace Extended with Substrate-Trace

### 2.1 The three trace surfaces

**Architecture Trace (16-probe, per TMR Addendum 10).** The platform's structural health at every layer. Existing methodology; reused without modification.

**Calculation Trace (single-entity forensic execution path, per TMR Addendum 10).** The platform's correctness for a single calculation against ground truth. Existing methodology; reused without modification.

**Substrate Trace (new, this DIAG).** The platform's compliance with DS-021 v1.0's eleven commitments. Each commitment has dedicated probes that map commitment language to observable platform state.

The three traces are complementary. Architecture Trace surfaces structural decay; Calculation Trace surfaces correctness gaps; Substrate Trace surfaces commitment compliance gaps. A fully compliant platform passes all three; a partially compliant platform fails at distinct points across the three.

### 2.2 Substrate-Trace probe construction

For each commitment G1–G11, the probe set consists of:

**Probe type S-CODE.** Code-path inspection. Identifies the source file(s) and function(s) where the commitment is mechanically enforced (or violated). Pasted excerpts required.

**Probe type S-SCHEMA.** Schema state inspection. Verifies database structure aligns with commitment (column existence, column nullability, constraint presence, index coverage). SQL query + pasted output required.

**Probe type S-SIGNAL.** Classification-signals surface inspection. Verifies signal flow honors commitment (signal levels written, signal levels read, signal vocabulary canonicality). SQL query against `classification_signals` + pasted output required.

**Probe type S-RUNTIME.** Runtime behavior inspection. Verifies platform behavior at execution honors commitment (calculation criteria immutability, sequence independence, AI-confidence-zero degradation). Test execution output + pasted result required.

**Probe type S-UI.** UI / expression-surface inspection. Verifies expression surfaces honor commitment (read-from-carrier, contextual narrowing, no private state copies). UI screenshot or DOM-state capture + pasted observation required.

Not every commitment requires all five probe types. Probe-type selection per commitment is specified in Section 4.

### 2.3 Substrate-Trace as Tier-3 audit work

Substrate-Trace probes generate findings the platform's existing audit methodology has not generated before. This is *Tier 3 novel audit work* in the IRA-tier-verdict sense. Findings should be expected to surface failure modes that AUD-002 v2 did not catch, because AUD-002 v2 audited against partial substrate definition; Substrate-Trace audits against full v1.0 specification.

---

## 3. Compliance Verdict Definitions

Each commitment G1–G11 receives one of three verdicts:

**ADHERED.** Platform's actual behavior matches commitment specification. No architectural action required. Audit evidence demonstrates compliance.

**DEVIATED (magnitude X, locus Y).** Platform's actual behavior does not match commitment specification. Magnitude X ∈ {minor, moderate, severe, blocking} reflects how far the deviation is from compliance:
- *minor* — local fix; commitment achievable through targeted code change in one or two files
- *moderate* — multi-file remediation; commitment achievable through coordinated changes across a workstream
- *severe* — architectural pattern change required; commitment achievable but requires new architectural disposition
- *blocking* — commitment not achievable in current architecture; rebuild of affected layer required

Locus Y identifies where the deviation occurs (file paths, function names, schema tables, signal flows). Locus is required for every DEVIATED finding so remediation can target precisely.

**NEW.** Commitment introduced or substantially extended in DS-021 v1.0 with no prior compliance state to compare. Audit evidence establishes baseline. Commitment compliance state is "baseline established at v1.0 lock" rather than "compared to prior state." NEW findings still require evidence collection per probe specification but do not produce magnitude/locus characterization.

The audit's overall verdict is the aggregate: count of ADHERED, count of DEVIATED at each magnitude, count of NEW; identification of which commitments cluster into interconnected-deviation patterns; and a recommended-disposition signal (remediate-targeted, remediate-coordinated, remediate-architectural, rebuild) per Phase 5.

---

## 4. Per-Commitment Probe Specification

This section specifies probe sets for each commitment G1–G11. Probes are minimum required; additional probes may be added during audit execution if architect-channel determines additional evidence is needed.

### 4.1 G1 — Carry Everything

**Commitment:** the carrier preserves every piece of ingested content completely. No narrowing at carry time. Provenance retained.

**Probes:**

- **S-CODE-G1-01.** Inspect SCI ingestion code paths (web/lib/sci/*, web/lib/data-classification/*) for any pattern that filters columns at carry time based on AI classification or registry membership. Required output: pasted code excerpts or pasted grep results showing absence of carry-time filtering.
- **S-CODE-G1-02.** Inspect `committed_data` write path for unmapped-column handling. The architectural commitment per Decision 51 + DS-021 G1: ALL columns persist (mapped + unmapped). Required output: pasted code excerpts showing the write path's column-handling logic.
- **S-SCHEMA-G1-01.** Verify `committed_data` schema admits arbitrary column structure (JSONB extensibility, no fixed-column-only constraint). Required output: pasted schema definition + sample row showing carried unmapped columns.
- **S-SCHEMA-G1-02.** Verify provenance metadata columns exist on `committed_data` (source_file_id, import_timestamp, source_row_index, raw_row_payload). Required output: pasted schema query result.
- **S-RUNTIME-G1-01.** Execute test import of file with unmapped columns (column AI did not classify); verify all columns landed in `committed_data`. Required output: pasted import log + post-import row inspection.

**Evidence threshold for ADHERED:** All five probes return clean evidence. Carrying is mechanical and unconstrained at carry time.

**Known prior evidence (AUD-002 v2 territory):** plan_agent_seeds storage in `rule_sets.input_bindings` as private JSONB key — not directly G1 violation but indicates parallel pattern of bypassing canonical surfaces. Probe S-CODE-G1-01 should specifically check that carrier does not have an analogous bypass pattern.

### 4.2 G2 — Express Contextually

**Commitment:** expression surfaces narrow for context at expression time. They do not maintain private narrowed copies of carried content; they read from the carrier and contextualize.

**Probes:**

- **S-CODE-G2-01.** Inspect Calculation expression surface for read-path. Verify calculation reads from `committed_data` (carrier) at runtime, not from pre-computed narrowed tables. Required output: pasted code excerpts of calculation read path + identification of any precomputed narrowed tables that violate.
- **S-CODE-G2-02.** Inspect Reporting expression surface for read-path. Same verification as G2-01 for reporting code paths. Required output: pasted code excerpts.
- **S-CODE-G2-03.** Inspect UI expression surfaces for read-path. Verify UI components read from carrier-equivalent canonical APIs (committed_data queries, materialized aggregates that derive from committed_data, not stale snapshot tables). Required output: pasted code excerpts of UI data-fetching layer.
- **S-SCHEMA-G2-01.** Identify any persistent tables that hold narrowed copies of `committed_data` content (denormalizations, projections, snapshot tables). Map each to its derivation path. Required output: pasted schema inventory + per-table derivation map.
- **S-UI-G2-01.** Render UI for representative tenant with known data state; verify rendered content matches `committed_data` content via spot-check. Required output: UI screenshot + corresponding committed_data query result.

**Evidence threshold for ADHERED:** All probes return clean evidence; no private narrowed copies maintained at expression boundaries; expression surfaces read from carrier or carrier-derived canonical APIs.

**Known prior evidence:** Convergence read-path (G7+G11) is currently write-only per AUD-002 v2 — this is a G11 issue but its mechanism (private signal channel via plan_agent_seeds) is the pattern G2 forbids at expression boundaries. Probe S-CODE-G2-01 should explicitly check whether calculation has analogous private state.

### 4.3 G3 — Calculation-Time Binding

**Commitment:** Import carries truth; calculation applies context. Period binding, entity binding, normalization binding happen at calculation time, not import time.

**Probes:**

- **S-CODE-G3-01.** Inspect import code for any period binding, entity binding, or normalization logic at carry time. Per Decision 92, none should exist. Required output: pasted grep results for binding patterns in import code.
- **S-CODE-G3-02.** Inspect calculation engine for source_date-based period binding (BETWEEN start AND end). Per Decision 92, period binding happens here. Required output: pasted code excerpts of calculation period-binding logic.
- **S-SCHEMA-G3-01.** Verify `committed_data.period_id` is nullable and `committed_data.source_date` exists. Per Decision 92 (Decision 92 Locked status). Required output: pasted schema query.
- **S-RUNTIME-G3-01.** Execute calculation against test data with multiple plan periods; verify same committed_data rows bind to different periods based on active plan. Required output: pasted calculation test execution.

**Evidence threshold for ADHERED:** All probes return clean evidence; no carry-time binding; calculation-time binding via source_date BETWEEN.

**Known prior evidence:** Decision 92 LOCKED. Architecture commits to G3. Compliance is plausible but not yet verified at full scope; SCI period creation has been a recurring contradiction surface.

### 4.4 G4 — Sequence Independence

**Commitment:** Imports are independent. No import requires another to have happened first. Operations that create ordering dependencies are deferred to calculation time.

**Probes:**

- **S-CODE-G4-01.** Inspect SCI ingestion code for inter-import dependencies (e.g., entity SCI requires roster import to have happened; transaction SCI requires entity binding to have happened). Required output: pasted code excerpts showing import code's pre-conditions.
- **S-RUNTIME-G4-01.** Execute test imports in shuffled order (transaction file first, plan file second, roster file third); verify each import succeeds and downstream calculation produces correct result. Required output: pasted test execution.
- **S-RUNTIME-G4-02.** Execute test import of single file in isolation (no other files imported); verify import succeeds and is queryable. Required output: pasted test execution.

**Evidence threshold for ADHERED:** All probes return clean evidence; carry boundary is sequence-independent by construction (per Decision 92 calc-time binding eliminates ordering dependency at carry).

**Known prior evidence:** DIAG-012 SCI Import Audit (March 2026) surfaced sequence-independence as a principle. Decision 152 (T2-E26) locked it. Compliance is architecturally committed; runtime verification at full scope is Phase 4 work.

### 4.5 G5 — Registry as Canonical Processing Vocabulary

**Commitment:** Boundaries that dispatch on, validate, calculate against, or transform on primitive identifiers derive their vocabulary from the canonical registry. Private vocabulary copies at processing boundaries are substrate violations. The carrier itself is unconstrained; the registry governs *processing*, not *carrying*.

**Probes:**

- **S-CODE-G5-01.** Identify all dispatch sites (switch/case statements, if-chains, lookup tables) operating on primitive identifiers. For each, verify the identifier vocabulary derives from canonical registry (not hardcoded enums, not duplicated lists). Required output: pasted code excerpts of every dispatch site + identification of any private vocabulary.
- **S-CODE-G5-02.** Identify primitive-identifier validation surfaces. Verify validation references canonical registry. Required output: pasted code excerpts.
- **S-SCHEMA-G5-01.** Verify the canonical registry table(s) exist with structured primitive-identifier definitions. Required output: pasted schema + sample registry entries.

**Evidence threshold for ADHERED:** All dispatch sites + validation surfaces consult canonical registry; no private vocabulary at processing boundaries. Note: carrier is explicitly unconstrained; this commitment is *processing-boundary scoped*, not import-boundary scoped.

**Known prior evidence:** The narrow-list dispatch-site pattern at consumer boundaries (multiple AUD-002 v2 findings) is a known G5 violation pattern. Probe S-CODE-G5-01 will likely surface multiple instances. Severity TBD by probe execution.

### 4.6 G6 — Structured Failure on Unrecognized at Processing Boundaries

**Commitment:** Every dispatch boundary produces named, observable, structured failure on identifiers not registered. No silent default. No silent fall-through.

**Probes:**

- **S-CODE-G6-01.** For every dispatch site identified in G5-01, verify presence of structured failure for unregistered identifier. Patterns acceptable: explicit throw with named error class, structured fallthrough with named fallback case + error logging + signal emission. Patterns unacceptable: silent default, return null, return empty array, swallowed exception. Required output: pasted code excerpts of failure-handling at each dispatch site.
- **S-CODE-G6-02.** Verify named error classes exist for substrate failures (e.g., `UnregisteredPrimitiveError`, `CanonicalRegistryViolation`). Required output: pasted code excerpts of error-class definitions.

**Evidence threshold for ADHERED:** Every dispatch site produces structured failure on unregistered identifier. Decision 154 applies.

**Known prior evidence:** Mixed compliance per AUD-002 v2. Decision 154 was locked but enforcement has not been mechanically tested at every dispatch site.

### 4.7 G7 — Single Canonical Signal Surface

**Commitment:** Classification signals flow to one canonical surface (`classification_signals`). No private signal channels. Three signal levels (Classification, Comprehension, Convergence). Signals are aggregable across SCI agents and expression surfaces.

**Probes:**

- **S-CODE-G7-01.** Inspect every SCI agent for signal-write code. Verify all writes target `classification_signals` table. Required output: pasted code excerpts of signal-write paths per SCI agent.
- **S-CODE-G7-02.** Inspect for any private signal channels (private JSONB keys storing signal-equivalent intelligence; alternate signal tables; signal data stored on entity tables). The plan_agent_seeds anti-pattern in `rule_sets.input_bindings` is the canonical example. Required output: pasted grep results for `_seeds`, `signal`, `intelligence` on JSONB columns + identification of any analogous patterns.
- **S-SCHEMA-G7-01.** Verify `classification_signals` schema supports three signal levels (signal_type column with vocabulary covering classification / comprehension / convergence prefixes). Required output: pasted schema + sample rows.
- **S-SIGNAL-G7-01.** Query `classification_signals` for signal-type distribution across signal levels and SCI agents. Verify all five SCI agents (Plan, Entity, Target, Transaction, Reference) appear in signal authorship. Required output: pasted query result.

**Evidence threshold for ADHERED:** All signal flows route to canonical surface; no private channels; three-level vocabulary present; all five SCI agents represented.

**Known prior evidence:** plan_agent_seeds in `rule_sets.input_bindings` is a confirmed G7 violation per AUD-002 v2. Probe S-CODE-G7-02 will surface this as a pre-known DEVIATED finding. Magnitude likely *severe* (architectural pattern change required) per AUD-002 v2 disposition.

### 4.8 G8 — Korean Test Universally on Structural Identification

**Commitment:** All field identification uses structural heuristics (value ranges, data types, column distributions); never field-name string matching in any natural language. Zero language-specific or domain-specific string literals in foundational code.

**Probes:**

- **S-CODE-G8-01.** Grep foundational code (web/lib/sci/foundational/* and equivalent) for natural-language field-name string literals. Required output: pasted grep results.
- **S-CODE-G8-02.** Inspect SCI agents' field-identification logic. Verify structural heuristics only. Required output: pasted code excerpts of field-identification methodology per SCI agent.
- **S-CODE-G8-03.** Inspect AI prompt construction for SCI agents. Verify prompts request structural classification, not name-based classification. Required output: pasted prompt-construction code.

**Evidence threshold for ADHERED:** Zero natural-language field-name literals in foundational code; SCI agents identify fields structurally; AI prompts request structural classification.

**Known prior evidence:** AP-25 (the most fundamental hardcoding prohibition) was surfaced as a recurring violation pattern. Probe S-CODE-G8-01 will likely surface multiple instances. Magnitude variable per locus.

### 4.9 G9 — Deterministic Calculation Boundary with Criteria Immutability *(Amendment 3 in DS-021 v1.0)*

**Commitment:** All AI calls above the boundary; all math below. 100% reconciliation. SOC1/SOC2/GAAP auditable. Calculation Sovereignty: calculation depends only on committed data + active plan at runtime — never on import-time logic. **Calculation criteria (the active plan) are immutable during a calculation run** — once a run begins, criteria cannot change.

**Probes:**

- **S-CODE-G9-01.** Verify code organization separates AI-call code from math code (separate modules, separate file conventions). Required output: pasted directory structure + module boundary verification.
- **S-CODE-G9-02.** Inspect calculation engine entry point. Verify it loads active plan once at run start, references plan via run-scoped invariant for entire run, and does not re-fetch or mutate plan during run. Required output: pasted code excerpts of calculation engine run lifecycle.
- **S-RUNTIME-G9-01.** Execute test calculation; mid-run, attempt to modify the active plan (via API call or direct DB write); verify either (a) the modification is rejected, or (b) the modification does not affect the running calculation's results. Required output: pasted test execution.
- **S-RUNTIME-G9-02.** Execute reconciliation test against ground-truth data (CRP $566,728.97 pre-clawback); verify 100% reconciliation. Required output: pasted reconciliation result.

**Evidence threshold for ADHERED:** AI/math separation in code organization; active plan loaded once and run-scoped-invariant during run; runtime test confirms criteria immutability; reconciliation against ground truth passes.

**Known prior evidence:** CRP $566,728.97 pre-clawback was proven April 9–10 2026 via Decision 147 synaptic forwarding. Reconciliation gate is committed; criteria immutability runtime test is *new* under Amendment 3 and has not been performed. Probe S-RUNTIME-G9-01 is Tier 3 novel audit work.

### 4.10 G10 — No Stale State

**Commitment:** DELETE before INSERT. Database UNIQUE constraints enforce architecturally.

**Probes:**

- **S-CODE-G10-01.** Inspect persistent expression surfaces (Calculation results write, Reporting outputs write) for DELETE-before-INSERT pattern. Required output: pasted code excerpts.
- **S-SCHEMA-G10-01.** Verify UNIQUE constraints exist on persistent expression tables at the appropriate identity granularity. Required output: pasted schema constraint inventory.
- **S-RUNTIME-G10-01.** Execute calculation twice for same tenant + plan + period; verify second execution does not produce duplicate rows or stale rows. Required output: pasted test execution.

**Evidence threshold for ADHERED:** DELETE-before-INSERT pattern present; UNIQUE constraints enforce architecturally; runtime test confirms no stale state.

**Known prior evidence:** TMR Addendum 10 Decision 68 locked No Stale State as architectural commitment. Compliance is plausible but specific UNIQUE-constraint coverage has not been audited at full scope.

### 4.11 G11 — Read-Path Coherence at the Signal Surface

**Commitment:** Signals are not just written; they are read. Convergence and learning loops actually consume the canonical signal surface to refine future interpretation.

**Probes:**

- **S-CODE-G11-01.** Inspect convergence service code for read-path that queries `classification_signals` to inform convergence decisions. Required output: pasted code excerpts (or pasted grep results showing absence — the latter would be a confirmed G11 violation).
- **S-CODE-G11-02.** Inspect flywheel aggregation code for read-path that queries `classification_signals` and aggregates across runs. Required output: pasted code excerpts.
- **S-SIGNAL-G11-01.** Query `classification_signals` for evidence of cross-run aggregation (signals from prior runs being referenced or aggregated by subsequent runs). Required output: pasted query result.
- **S-RUNTIME-G11-01.** Execute test sequence: run calculation A producing classification signals; run calculation B for same/similar tenant; verify calculation B's results show evidence of having consumed calculation A's signals (e.g., higher confidence, different convergence outcome). Required output: pasted test execution showing run-to-run learning.

**Evidence threshold for ADHERED:** Convergence and flywheel aggregation read from canonical signal surface; cross-run learning observable in runtime tests.

**Known prior evidence:** AUD-002 v2 confirmed signal surface is currently *write-only*. G11 is a NEW commitment in DS-021 v1.0 (formalizing what AUD-002 v2 surfaced). Probe S-CODE-G11-01 will likely confirm DEVIATED with magnitude *severe* or *blocking* (architectural pattern change or rebuild of convergence service required). This is the highest-priority Phase 4 finding in pre-known evidence.

---

## 5. Property Observability Probes (P1–P11)

Properties are constitutive; observability is the audit measure. Property probes are lighter-weight than commitment probes (properties cannot be DEVIATED in the same sense — a substrate either has the property or is not the substrate DS-021 specifies). Property probes verify the platform's behavior is consistent with property presence.

### 5.1 Per-property observability tests

| Property | Observability test | Evidence required |
|---|---|---|
| **P1 Permeability** | Import file with novel columns; verify ingestion succeeds, columns persist | Import test output; post-import schema/row inspection |
| **P2 Adaptation** | Compare classification confidence on tenant N's first import vs. tenth import; verify confidence improves | Confidence trajectory query |
| **P3 Progressive Optimization** | Compare calculation execution time at tenant inception vs. after 100 calculations; verify execution time decreases or stays stable while compliance improves | Execution timing + compliance metric trajectory |
| **P4 Perpetuating Inertia of Intelligence** | Verify learned patterns from tenant N persist across system restarts and propagate (anonymized) to tenant M classification | Pattern persistence test + cross-tenant propagation test |
| **P5 Reaction-Prediction Simultaneity** | Verify substrate produces both reactive output (this transaction's calculation) and predictive output (forecast / clawback prediction) for same input | Output inspection demonstrating both modes |
| **P6 Sequence Independence** | Verified by G4 probes; no separate test required |
| **P7 Heterogeneous Consumer Service** | Verify multiple expression surfaces (UI / Reporting / Calculation / Forensics) operate against same `committed_data` without conflict | Multi-surface concurrent operation test |
| **P8 Mycorrhizal Cross-Flow** | Verify a correction in tenant N's data (signal-level) propagates as improved classification probability for tenant M | Cross-tenant signal propagation test |
| **P9 Trophic Resilience** | Verify removal of one piece of carried content (one column, one provenance metadata field) produces observable downstream failure rather than silent corruption | Removal-cascade test |
| **P10 Graceful Degradation** | Verify substrate behavior with LLM unavailable (mock LLM error); verify Three-Tier Resolution Chain operates | LLM-unavailable test |
| **P11 Self-Awareness** | Verify CC-UAT Dual-Trace operates and produces coherent diagnostic output | Dual-Trace execution output |

**Evidence threshold for property observability:** Each test produces clean evidence of property presence. Property absence is a *substrate violation*, not a deviation — property absence means the platform is not the substrate DS-021 v1.0 specifies, which is a Phase 5 rebuild signal.

### 5.2 Properties under substrate-bounded authority

P5 (Reaction-Prediction Simultaneity) is currently the platform's most architecturally extending property. Predictive capability beyond reactive calculation is not yet broadly populated in substrate; auditing this property's observability may reveal *substrate-extending* rather than *substrate-deviating* findings. Note this in audit report per Section 9.

---

## 6. Audit Gates

Audit findings are accepted into the Phase 4 Completion Report only after passing the following gates:

**Gate AG-01.** Every commitment finding includes pasted evidence per probe specification. Self-attestation rejected.

**Gate AG-02.** Every DEVIATED finding includes magnitude (minor/moderate/severe/blocking) AND locus (file path, function name, schema artifact, signal flow). Magnitude without locus rejected.

**Gate AG-03.** Every NEW finding includes baseline-state-establishment evidence. NEW without baseline rejected.

**Gate AG-04.** Property observability tests run against representative tenant data (not synthetic toy data). Toy-data tests rejected.

**Gate AG-05.** Reconciliation tests run against ground-truth proof tenants (CRP, BCL, Meridian Logistics Group). New ground-truth tenants without architect approval rejected.

**Gate AG-06.** Audit findings include explicit substrate-bounded-authority annotation per Section 9 where applicable. Findings on substrate-extending content without annotation are flagged for re-categorization.

**Gate AG-07.** Audit Completion Report includes interconnection map per Q-D (which commitments' deviations are mechanically dependent on other commitments' deviations). Independent treatment of interconnected gaps rejected.

**Gate AG-08.** Audit Completion Report's Phase 5 disposition signal is one of {remediate-targeted, remediate-coordinated, remediate-architectural, rebuild} with interconnection-map-grounded reasoning. Disposition without supporting reasoning rejected.

---

## 7. Phase 4 Completion Report Structure

The Phase 4 audit produces one canonical Completion Report. Structure:

**Section 1.** Executive summary (1 page maximum; verdict counts; top-three highest-priority findings; Phase 5 disposition signal)

**Section 2.** Per-commitment findings G1–G11 with full probe evidence, verdict, magnitude/locus, interconnection annotations

**Section 3.** Per-property observability findings P1–P11 with test evidence and observability verdict

**Section 4.** Substrate-Trace probe set — full output inventory (all probes executed, all results, organized by probe type)

**Section 5.** Architecture-Trace + Calculation-Trace results (existing methodology; included for completeness)

**Section 6.** Interconnection map (per Q-D) — which commitments' deviations are mechanically dependent

**Section 7.** Substrate-bounded authority annotations — findings warranting successor re-evaluation when ICA functions; explicit "do not over-weight" markers

**Section 8.** Phase 5 disposition signal with supporting reasoning

**Section 9.** Forward-looking architectural items (G11 enforcement mechanism specification candidate; Decision 64 v3 supersession candidate; ICA capture queue updates derived from audit evidence)

**Section 10.** Audit gates verification table — every AG-01 through AG-08 with PASS evidence

**Document control.** Audit subject SHA256 (DS-021 v1.0); audit completion date; audit-execution channel (CC / IRA / architect / hybrid); commit history of audit work.

---

## 8. Preliminary Architect-Channel Findings (Scope B Material)

The Phase 4 audit will encounter the following findings based on AUD-002 v2 evidence already in substrate. These are pre-identified to enable audit prioritization.

### 8.1 Highest-priority pre-known findings (likely DEVIATED severe-or-blocking)

**PF-01 — G7 violation: plan_agent_seeds private channel.** AUD-002 v2 confirmed `rule_sets.input_bindings.plan_agent_seeds` stores agent-to-agent intelligence as a private JSONB key, bypassing canonical signal surface. Per DS-021 G7 ("No private signal channels"), this is a confirmed violation. Probe S-CODE-G7-02 will surface. Likely magnitude *severe* (architectural pattern change required: migrate seed data from input_bindings to classification_signals as Level 2 Comprehension signals). Pre-known remediation: AUD-002 v2 named this; remediation has not yet been built.

**PF-02 — G11 violation: convergence read-path absent.** AUD-002 v2 confirmed signal surface is currently write-only. Convergence service writes signals but does not read them across runs. Per DS-021 G11 ("Signals are not just written; they are read"), this is a confirmed violation. Probe S-CODE-G11-01 will surface. Likely magnitude *severe* or *blocking* depending on whether the convergence service can be remediated in place or requires rebuild of cross-run learning. The 24% Decision 155 compliance figure from AUD-002 v2 is the quantitative benchmark.

**PF-03 — G5 violation: narrow-list dispatch sites at consumer boundaries.** AUD-002 v2 surfaced multiple instances of dispatch sites operating on hardcoded primitive-identifier lists rather than canonical registry. Per DS-021 G5, these are processing-boundary violations. Probe S-CODE-G5-01 will surface multiple instances. Magnitude variable per locus; aggregate likely *moderate* to *severe* depending on consumer-boundary count.

### 8.2 Medium-priority pre-known findings (likely DEVIATED moderate)

**PF-04 — G8 violation: AP-25 hardcoding instances in foundational code.** AP-25 is documented as the most fundamental hardcoding prohibition. Specific instances surface periodically. Probe S-CODE-G8-01 will likely surface multiple instances. Magnitude per-instance moderate; aggregate severity depends on instance count and locus.

**PF-05 — G9 partial compliance: criteria immutability runtime test never executed.** Amendment 3 is NEW in DS-021 v1.0 — calculation criteria immutability has not been runtime-tested before. Probe S-RUNTIME-G9-01 is Tier 3 novel audit work. Likely outcome: NEW finding establishing baseline. May surface unintended runtime mutability if calculation engine has any "live re-fetch" pattern that violates run-scoped invariant.

**PF-06 — G10 specific UNIQUE-constraint coverage: not audited at full scope.** Decision 68 locked the architectural commitment but specific UNIQUE-constraint coverage on every persistent expression table has not been audited. Probe S-SCHEMA-G10-01 may surface gaps.

### 8.3 Lower-priority pre-known findings (likely ADHERED with verification work)

**PF-07 — G1 (Carry Everything).** Architecture commits explicitly via Decision 51. Compliance plausible but Probe S-RUNTIME-G1-01 (test import with unmapped columns) needs to confirm at runtime.

**PF-08 — G3 (Calculation-Time Binding).** Decision 92 LOCKED. Compliance plausible but full-scope verification at runtime is Phase 4 work.

**PF-09 — G4 (Sequence Independence).** Decision 152 locked. Compliance plausible but shuffled-import runtime test is Phase 4 work.

### 8.4 Audit prioritization recommendation

Phase 4 audit execution should sequence probes in this order:

1. **PF-02 first (G11 read-path).** Highest-priority finding; outcome shapes Phase 5 disposition most directly. If convergence service requires rebuild, all other remediation work is downstream of that decision.
2. **PF-01 second (G7 plan_agent_seeds).** Architecturally adjacent to PF-02 (both involve signal surface bypass patterns); coordinated remediation likely.
3. **PF-03 third (G5 narrow-list dispatch sites).** Distinct workstream; can be remediated in parallel with PF-01/PF-02 if independent.
4. **PF-05 fourth (G9 criteria immutability).** NEW finding; baseline establishment; may surface unexpected runtime issues.
5. **All remaining commitments and properties.** Standard audit execution.

Substrate-Trace probes should be executed before Architecture-Trace and Calculation-Trace probes; the existing 16-probe Architecture-Trace + Calculation-Trace are well-understood and should not block Substrate-Trace exposure of novel findings.

### 8.5 Interconnection map (preliminary)

**Cluster A: Signal Surface Coherence (interconnected severe).** PF-01 (G7) + PF-02 (G11) are mechanically dependent. plan_agent_seeds migration to classification_signals + convergence read-path implementation are co-evolving work. Independent treatment is rejected; remediation must coordinate.

**Cluster B: Processing Boundary Discipline (interconnected moderate).** PF-03 (G5) + PF-04 (G8). Narrow-list dispatch sites and AP-25 violations share root cause: bypassing canonical registry. Coordinated remediation through registry-canonical-vocabulary enforcement.

**Cluster C: Calculation Engine Discipline (independent).** PF-05 (G9 criteria immutability) is largely independent of Cluster A and Cluster B; can be addressed in parallel.

**Cluster D: Schema Architectural Constraints (independent).** PF-06 (G10 UNIQUE constraints) is independent; can be addressed via schema migration parallel to other work.

**Phase 5 disposition signal (preliminary):** Based on pre-known evidence, the audit is likely to surface **remediate-architectural** disposition for Cluster A (signal surface coherence requires architectural pattern change but not full rebuild), **remediate-coordinated** for Cluster B (processing boundary discipline through registry enforcement), and **remediate-targeted** for Clusters C and D. The dressmaker's edict (rebuild) becomes the disposition signal only if Cluster A audit findings exceed the architectural-pattern-change threshold and indicate convergence service rebuild is required.

This is preliminary. Phase 4 audit evidence may revise.

---

## 9. Substrate-Bounded Authority Annotations

Per DS-021 v1.0 Section 12 (Substrate Bounded Authority), the following Phase 4 audit findings will be substrate-bounded and warrant successor re-evaluation when ICA captures relevant lineage.

### 9.1 Substrate-bounded findings to flag explicitly

**SBA-1 — Property P5 observability (Reaction-Prediction Simultaneity).** Predictive capability beyond reactive calculation is substrate-extending; the substrate as currently populated does not yet hold the architectural reasoning that makes predictive capability mechanically observable. Phase 4 audit findings on P5 should be flagged as substrate-bounded; do not treat absence-of-prediction as DEVIATED if the substrate does not yet specify how prediction is mechanically constructed.

**SBA-2 — Property P8 observability (Mycorrhizal Cross-Flow).** Cross-tenant intelligence propagation is substrate-extending; the substrate as currently populated commits to it (P8) but the privacy-firewall constraints are still under formalization. Phase 4 audit findings on P8 should be flagged as substrate-bounded; cross-tenant propagation absence may reflect privacy-firewall conservatism rather than commitment violation.

**SBA-3 — Commitment G11 enforcement mechanism.** G11 is committed but the *enforcement mechanism* for G11 is forward-looking architectural work (per DS-021 v1.0 Section 14 Forward-Looking Architectural Items 1). Phase 4 audit will surface DEVIATED on G11 (per PF-02), but the *remediation specification* depends on architectural work not yet in substrate. Remediation disposition for G11 should be flagged as awaiting Decision-class enforcement-mechanism specification.

**SBA-4 — Triple Intelligence audit (Decision 64 v2 + Decision 92 additive).** DS-021 v1.0 frames triple intelligence as additive per Decision 92 (Amendment 1). Phase 4 audit testing whether all three intelligences (Data, Plan, Reference) operate autonomously and converge correctly is substrate-bounded: if Decision 64 v3 supersession is later locked, audit framing changes. Findings on triple-intelligence observability should be flagged as substrate-bounded.

### 9.2 Audit findings NOT substrate-bounded

The following findings are substrate-defensible without ICA dependency:

- All G1–G6 findings (commitments locked through Decision 51, Decision 92, Decision 154, Decision 152; substrate population sufficient)
- G7 plan_agent_seeds finding (AUD-002 v2 evidence is substrate-defensible; PF-01)
- G9 reconciliation-against-ground-truth findings (CRP/BCL/Meridian ground truth is substrate-defensible)
- G10 UNIQUE-constraint findings (Decision 68 locked)
- G11 *presence-or-absence* finding (write-only signal surface is substrate-defensible per AUD-002 v2; PF-02). Only the *enforcement mechanism specification* is substrate-bounded (SBA-3).

---

## 10. Substrate-Trace Probe Catalog (Reference)

For ease of reference during audit execution, the full substrate-trace probe inventory is consolidated below. Total: 36 probes across G1–G11 plus 11 property observability tests.

| Probe ID | Type | Commitment | Subject |
|---|---|---|---|
| S-CODE-G1-01 | code | G1 | SCI ingestion code carry-time filtering |
| S-CODE-G1-02 | code | G1 | committed_data write path unmapped column handling |
| S-SCHEMA-G1-01 | schema | G1 | committed_data schema arbitrary-column admission |
| S-SCHEMA-G1-02 | schema | G1 | provenance metadata column existence |
| S-RUNTIME-G1-01 | runtime | G1 | unmapped-column import test |
| S-CODE-G2-01 | code | G2 | calculation read-path |
| S-CODE-G2-02 | code | G2 | reporting read-path |
| S-CODE-G2-03 | code | G2 | UI read-path |
| S-SCHEMA-G2-01 | schema | G2 | persistent narrowed-copy table inventory |
| S-UI-G2-01 | ui | G2 | UI render verification against committed_data |
| S-CODE-G3-01 | code | G3 | import code period/entity/normalization binding |
| S-CODE-G3-02 | code | G3 | calculation period-binding logic |
| S-SCHEMA-G3-01 | schema | G3 | period_id nullable + source_date present |
| S-RUNTIME-G3-01 | runtime | G3 | multi-period calculation test |
| S-CODE-G4-01 | code | G4 | inter-import dependencies |
| S-RUNTIME-G4-01 | runtime | G4 | shuffled-import test |
| S-RUNTIME-G4-02 | runtime | G4 | single-file isolation import test |
| S-CODE-G5-01 | code | G5 | dispatch site vocabulary |
| S-CODE-G5-02 | code | G5 | validation surface vocabulary |
| S-SCHEMA-G5-01 | schema | G5 | canonical registry table |
| S-CODE-G6-01 | code | G6 | dispatch-site failure handling |
| S-CODE-G6-02 | code | G6 | named error class definitions |
| S-CODE-G7-01 | code | G7 | SCI agent signal-write paths |
| S-CODE-G7-02 | code | G7 | private signal channel detection |
| S-SCHEMA-G7-01 | schema | G7 | classification_signals three-level support |
| S-SIGNAL-G7-01 | signal | G7 | signal-type distribution across SCI agents |
| S-CODE-G8-01 | code | G8 | foundational code field-name literals |
| S-CODE-G8-02 | code | G8 | SCI agent field-identification logic |
| S-CODE-G8-03 | code | G8 | AI prompt construction |
| S-CODE-G9-01 | code | G9 | AI/math code organization |
| S-CODE-G9-02 | code | G9 | calculation engine plan-loading lifecycle |
| S-RUNTIME-G9-01 | runtime | G9 | criteria immutability runtime test |
| S-RUNTIME-G9-02 | runtime | G9 | reconciliation against ground truth |
| S-CODE-G10-01 | code | G10 | DELETE-before-INSERT pattern |
| S-SCHEMA-G10-01 | schema | G10 | UNIQUE constraint coverage |
| S-RUNTIME-G10-01 | runtime | G10 | duplicate-execution test |
| S-CODE-G11-01 | code | G11 | convergence service read-path |
| S-CODE-G11-02 | code | G11 | flywheel aggregation read-path |
| S-SIGNAL-G11-01 | signal | G11 | cross-run aggregation evidence |
| S-RUNTIME-G11-01 | runtime | G11 | run-to-run learning test |
| (P1–P11) | varies | n/a | Property observability tests per Section 5.1 |

---

## 11. Audit Execution Channel Disposition

The Phase 4 audit can be executed by multiple channels. Channel disposition is architect-determined and depends on the synthesis-conversation findings.

**Channel options:**

- **CC autonomous execution.** CC executes all probes against working tree; produces evidence; submits Completion Report. Architect dispositions findings.
- **IRA invocation per cluster.** Each preliminary-finding cluster (PF-01 / PF-02 / PF-03 / PF-05 / etc.) becomes an IRA invocation question. IRA returns findings against substrate. Architect aggregates.
- **Architect-channel direct execution.** Architect (Claude in conversation) inspects code via tool calls, produces findings directly. Most direct but most context-expensive.
- **Hybrid.** Architect produces probe specifications; CC executes probes; architect dispositions findings; IRA invocations for specific high-stakes commitments (e.g., G11 architectural-rework decision).

**Recommended (Phase 4 entry):** Hybrid. Architect-channel produces refined probe specifications based on synthesis findings; CC executes probes with evidence collection per gate AG-01; architect dispositions findings; IRA invocation for Cluster A (signal surface coherence) since that cluster's disposition determines Phase 5 rebuild-vs-remediate signal.

---

## 12. Forward-Looking Items Surfaced by This DIAG

These items are surfaced here for the synthesis conversation (next session) to incorporate:

**FLI-1 — G11 enforcement mechanism specification.** DS-021 v1.0 Section 14 Forward-Looking Architectural Items 1 names this as Phase 4 disposition territory. The synthesis conversation produces the development specification for G11 enforcement mechanism if Phase 4 audit confirms G11 violation requires architectural pattern change.

**FLI-2 — Decision 64 v3 supersession workstream.** DS-021 v1.0 Section 14 Forward-Looking Architectural Items 2 names this as parallel workstream. The synthesis conversation determines whether Decision 64 v3 work is sequenced before, alongside, or after Phase 5 remediation.

**FLI-3 — DS-020 supersession ICA capture entry.** DS-021 v1.0 Section 13. The synthesis conversation produces the formal Decision register entry text if ICA is operational by then.

**FLI-4 — Cross-flow boundary specification for P8.** Synthesis conversation may need to draft this specification if Phase 4 audit on P8 surfaces ambiguity that depends on its existence.

**FLI-5 — Substrate-Trace methodology canonicalization.** This DIAG introduces Substrate-Trace as a new audit methodology. If the methodology proves productive in Phase 4 execution, the synthesis conversation should propose Substrate-Trace as a standing audit methodology for all future DS-class lock dispositions.

---

## 13. Document Control

- **Status:** Phase 4 audit specification — locked at production 2026-04-30
- **Authority:** Architect channel (Claude) under directive disposition
- **Audit subject:** DS-021 v1.0 LOCKED 2026-04-30 (SHA256 `7fa895291514a6de873a1114e30f678dadf895d23f499b5426dcef069a088edb`)
- **Companion artifacts at session close:** `DS-021_Substrate_Architecture_Biological_Lineage_v1_0_LOCKED_20260430.md`; `SESSION_HANDOFF_20260430.md`
- **Forward usage:** This DIAG is canonical input to the next session's synthesis conversation. The synthesis conversation will:
  - Read DS-021 v1.0 + this DIAG together
  - Refine probe specifications based on architect-channel review
  - Disposition audit execution channel (hybrid recommended; per Section 11)
  - Surface forward-looking items per Section 12 for downstream development specification work
- **Successor specification:** A development specification, produced in a subsequent conversation following Phase 4 audit completion, will operationalize remediation work per Phase 5 disposition. The development specification is *not* this DIAG; this DIAG specifies what to audit, the development specification specifies what to build.
- **Lifecycle:** This DIAG is consulted at every Phase 4 audit execution. It does not lock to a versioned state in the same sense DS-021 does; it can be revised as audit methodology improves, but architect-channel revision is required (CC cannot revise specifications per Standing Rule 35).

*End of DIAG-DS021-Phase4 — Comprehensive Audit Specification — LOCKED 2026-04-30 by architect disposition.*

*Vialuce.ai · Intelligence. Acceleration. Performance.*
*Substrate-Trace audits what substrate-coherence verification could not yet weight: the gap between specification and execution.*
