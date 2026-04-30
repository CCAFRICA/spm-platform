# Phase 4 Audit Execution Plan — Operationalizing DIAG-DS021-Phase4 Against Locked Dispositions (v1.1)

**Status:** Phase 4 audit execution plan v1.1 — amended 2026-04-30
**Date:** 2026-04-30
**Authoring channel:** Architect (Claude) under directive disposition
**Synthesis conversation source:** Fresh-context synthesis conversation following DS-021 v1.0 lock + DIAG-DS021-Phase4 production
**Audit subject:** DS-021 v1.0 LOCKED 2026-04-30 (`DS-021_Substrate_Architecture_Biological_Lineage_v1_0_LOCKED_20260430.md`)
**Specification source:** DIAG-DS021-Phase4 LOCKED 2026-04-30 (`DIAG_DS021_Phase4_Comprehensive_Audit_Specification_20260430.md`)

**v1.1 amendment summary:** v1.0 mis-specified IRA invocation as architect-channel external work pausing CC mid-engagement. The canonical pattern (per prior IRA work, conversations 2026-04-13 onward) is **deliverable-internal IRA** — CC runs the IRA invocation as part of its own execution, captures the IRAPacket in the deliverable's evidence package. Architect-channel CLI invocation is the exception, used only where the architect needs a substrate-served brief for design work (DS-020, OB-13, etc.). v1.1 corrects Section 4 (channel disposition) and Section 5 (execution sequence) to match the canonical deliverable-internal pattern. Sections 1, 2, 3, 6, 7, 8 unchanged from v1.0.

---

## 0. Document Purpose and Scope

This Plan operationalizes the DIAG into an executable audit work-order. It does not replace the DIAG; the DIAG remains the canonical specification of *what* to audit. This Plan specifies:

- *Which channel executes which probes in which sequence*
- *Three probe refinements that supersede the DIAG's probe specifications at named locations*
- *One probe-count correction that supersedes the DIAG's prose count*
- *The handoff structure between CC, IRA, and architect channels*
- *The artifact lifecycle from probe execution → Completion Report → Phase 5 disposition signal*

**Documentary discipline.** This Plan is a separable artifact with its own SHA256 and lifecycle. It is not co-located with DS-021 v1.0 or the DIAG. It references both by SHA256. When Phase 4 audit execution begins, this Plan + the DIAG + DS-021 v1.0 form the canonical input set; this Plan governs execution mechanics, the DIAG governs probe semantics, DS-021 v1.0 governs commitment definitions.

**Substrate Bounded Authority.** Per DS-021 v1.0 Section 12, the Plan inherits the DIAG's Section 9 substrate-bounded annotations (SBA-1 through SBA-4) without modification. The probe refinement for P5 (Section 3.3 below) is itself a substrate-bounded-authority disposition; it extends but does not override SBA-1.

---

## 1. Locked Dispositions from Synthesis Conversation

The synthesis conversation locked four dispositions that this Plan operationalizes:

**LD-1 — Three probe refinements accepted (Q1 disposition (a)).** All three O-2 refinements accepted into this Plan. The DIAG's probe specifications at the named locations are superseded by Section 3 of this Plan. Where this Plan's specifications and the DIAG's specifications conflict, this Plan governs for Phase 4 execution; the DIAG remains the canonical record of what the synthesis conversation refined.

**LD-2 — IRA invocation second within Cluster A, deliverable-internal mode (Q2 disposition + v1.1 amendment).** CC executes PF-02 evidence collection first; then PF-01 evidence collection; then runs the IRA invocation as the closing step of Cluster A (Phase 4.A step 4) per the directive-supplied template (Section 5.bis). The IRA invocation is **deliverable-internal** — CC runs it as part of its own execution, not as an external architect-channel CLI call. CC drafts invocation content from the evidence collected in steps 1-2 and the substrate bindings the template names. Architect channel reviews the IRAPacket post-checkpoint as part of Cluster A evidence package. This sequencing grounds architectural-disposition reasoning in pasted code evidence rather than ungrounded substrate review.

**LD-3 — Phase 4 Audit Execution Plan as synthesis artifact (Q3 disposition).** This document is the synthesis output. ~150-250 lines, separable, standalone canonical specification of execution mechanics.

**LD-4 — In-conversation production (Q4 disposition).** This Plan is produced by the synthesis conversation that disposed Q1-Q3, not deferred to a fresh-context drafting session.

---

## 2. Probe Count Correction

**DIAG Section 10 prose says "Total: 36 probes across G1–G11 plus 11 property observability tests."** The probe table in DIAG Section 10 contains 40 commitment-probe rows (G1: 5, G2: 5, G3: 4, G4: 3, G5: 3, G6: 2, G7: 4, G8: 3, G9: 4, G10: 3, G11: 4 = 40).

**Correction:** Total is **40 substrate-trace probes across G1–G11 plus 11 property observability tests = 51 total verifications**. The handoff Section 9 used the correct count; the DIAG prose contains the typo. Phase 4 execution operates against 40 commitment probes; downstream documents reference 40 not 36.

This correction is non-substantive (the table content was correct; only the prose count was wrong) but is recorded here to prevent the typo propagating.

---

## 3. Probe Refinements (Three, Each Supersedes Named DIAG Specification)

### 3.1 Refinement R-1 — S-CODE-G7-02 reframed structural-not-lexical

**DIAG specification (Section 4.7, S-CODE-G7-02):** "pasted grep results for `_seeds`, `signal`, `intelligence` on JSONB columns."

**Defect.** The grep tokens are name-based. Plan-agent-seeds was caught because it was named obviously; the next bypass may be named anything. This violates Korean Test discipline applied to the audit itself: structural inspection should not depend on field-name vocabulary in any natural language.

**Refinement.** S-CODE-G7-02 is reframed as a two-step structural probe:

1. **Step 1 — JSONB column enumeration.** Query `information_schema.columns WHERE data_type IN ('jsonb','json')` across all persistent tables in `public` schema. Required output: pasted table-and-column inventory.
2. **Step 2 — Per-column key vocabulary inspection.** For each JSONB column from Step 1, query distinct top-level keys actually present in production data (e.g., `SELECT DISTINCT jsonb_object_keys(column_name) FROM table_name`). For each distinct key, classify by inspection: *(a)* configuration data, *(b)* user-supplied content, *(c)* agent-to-agent or run-to-run intelligence transport. Required output: pasted per-column key inventory + classification rationale per key.

**Verdict:** Any key classified as (c) is a candidate G7 violation regardless of its name. plan_agent_seeds is one such key; others may surface.

**This refinement protects future audits** because it does not depend on the next bypass being conveniently named. Korean Test on the audit itself.

### 3.2 Refinement R-2 — S-CODE-G11-01 split into within-run and cross-run probes

**DIAG specification (Section 4.11, S-CODE-G11-01):** "Inspect convergence service code for read-path that queries `classification_signals` to inform convergence decisions."

**Defect.** The probe conflates two architecturally distinct read-paths:
- **Within-run read-path** — convergence reads signals produced earlier in the *same* calculation run (synaptic-state-adjacent; observation-IS-action territory)
- **Cross-run read-path** — convergence reads signals from *prior* runs to inform current run (flywheel territory; what AUD-002 v2 named as missing)

If audit surfaces "no read of any kind, ever," that is *blocking* magnitude. If audit surfaces "within-run reads exist; cross-run reads don't," that is *severe* but not blocking. The DIAG's single probe cannot distinguish.

**Refinement.** S-CODE-G11-01 splits into two probes:

- **S-CODE-G11-01a (within-run read-path).** Inspect convergence service for code paths that query `classification_signals` filtered to current run's `run_id` (or equivalent run-scoping identifier). Required output: pasted code excerpts showing within-run signal consumption, OR pasted grep results showing absence.
- **S-CODE-G11-01b (cross-run read-path).** Inspect convergence service for code paths that query `classification_signals` with no run_id filter, or with explicit cross-run aggregation (joining to prior runs' signals, querying signal history, applying flywheel learning). Required output: pasted code excerpts showing cross-run signal consumption, OR pasted grep results showing absence.

**Verdict matrix:**

| 11-01a (within-run) | 11-01b (cross-run) | Magnitude |
|---|---|---|
| ABSENT | ABSENT | *blocking* — no read-path of any kind exists; convergence rebuild required |
| PRESENT | ABSENT | *severe* — flywheel learning missing; cross-run read-path can be added but is architectural pattern change |
| ABSENT | PRESENT | *severe* — within-run signal coordination missing; synaptic state coherence broken |
| PRESENT | PRESENT | candidate ADHERED pending S-RUNTIME-G11-01 confirmation |

This refinement enables disposition signal precision that single-probe formulation cannot reach.

### 3.3 Refinement R-3 — P5 observability redefined under substrate-bounded authority

**DIAG specification (Section 5.1):** "Verify substrate produces both reactive output (this transaction's calculation) and predictive output (forecast / clawback prediction) for same input."

**Defect.** Section 9.1 SBA-1 acknowledges predictive capability is substrate-extending; the substrate as currently populated does not yet hold the architectural reasoning for prediction. The Section 5 evidence threshold ("Property absence is a substrate violation") and SBA-1 ("do not treat absence-of-prediction as DEVIATED") are in tension. Audit cannot resolve this with the DIAG's specifications as-locked.

**Refinement.** P5 observability is redefined under Substrate Bounded Authority:

- **P5 observability test (revised).** Verify the *architectural mechanism* for prediction is present, not whether specific predictions are currently generated. Mechanism presence is observable through: *(a)* code paths that consume current-state substrate content and produce forward-looking output (forecast, clawback prediction, attainment trajectory); *(b)* schema artifacts that hold predictive output distinguishable from reactive output (e.g., `predicted_*` columns, prediction-specific tables); *(c)* signal types in `classification_signals` that capture predictive reasoning.
- **Verdict thresholds.**
  - *PRESENT* — at least one of (a)/(b)/(c) is observable; substrate has predictive mechanism even if not broadly used.
  - *ABSENT-BOUNDED* — no observable mechanism, but DS-021 v1.0 Section 12 + SBA-1 places this under substrate-bounded authority. Verdict is *substrate-extending* not *substrate-violating*. Phase 5 disposition: defer P5 enforcement work to substrate population catching up to the architectural lineage.
  - *ABSENT-UNBOUNDED* — no observable mechanism AND substrate has population sufficient to require the mechanism. This verdict is currently unreachable per SBA-1; reserved for successor audits when ICA captures the architectural reasoning.

This refinement reconciles the DIAG's evidence threshold with SBA-1 by distinguishing *substrate-violating absence* from *substrate-extending absence*. It is itself a substrate-bounded-authority disposition: when ICA captures the predictive-capability architectural lineage, this refinement may itself need re-disposition.

---

## 4. Channel Disposition (Hybrid, Locked)

The audit operates across three channels with locked role separation:

**Architect channel (Claude in conversation).**
- Refines probe specifications further if synthesis-extending evidence surfaces during execution
- Dispositions findings as ADHERED / DEVIATED (with magnitude/locus) / NEW
- Receives CC evidence and IRA findings; produces Completion Report
- Maintains substrate-bounded-authority annotations per DS-021 v1.0 Section 12

**CC channel (autonomous implementation agent).**
- Executes all 40 substrate-trace probes per refined specification
- Executes 11 property observability tests
- Executes Architecture-Trace (16-probe) and Calculation-Trace (single-entity) per existing TMR Addendum 10 methodology
- Produces pasted evidence per Audit Gates AG-01 through AG-05
- Submits evidence packages per cluster (Section 5 below) for architect disposition
- Does **not** disposition findings; does not characterize magnitude; does not interpret
- Operates under Standing Rule 35 (no unauthorized behavioral changes), Standing Rule 27 (no self-attestation), Rule 51v2 (verification gates)

**IRA channel (substrate-grounded review tool — deliverable-internal mode).**
- One invocation only: Cluster A (signal surface coherence — G7 plus G11)
- **Invocation runs within CC execution** as the closing step of Cluster A evidence collection (Phase 4.A). Per canonical pattern (prior IRA work, 2026-04-13 onward), IRA invocations embedded within an OB/HF/audit run as part of CC's own work, not as external architect-channel CLI calls.
- **CC drafts invocation content from a directive-supplied template** — the directive (Section 5) supplies the prompt template (with placeholders for evidence pastes, the specific Cluster A question, the substrate bindings to load); CC may establish content within those placeholders (paste collected PF-01/PF-02 evidence, format the question against actual evidence shape).
- IRAPacket captured verbatim in CC's Cluster A evidence package alongside PF-01/PF-02 pasted evidence
- Cost recorded per Correction 6 (cost instrumentation on paid-API surface)
- Architect channel reviews IRAPacket as part of Cluster A evidence package post-CC-checkpoint; weights per substrate-bounded-authority; dispositions Phase 5 signal candidate
- Operates within bounded authority per DS-021 v1.0 Section 12

---

## 5. Execution Sequence (Locked, Phased)

### Phase 4.A — Cluster A (signal surface coherence): evidence collection + IRA invocation (CC, sequential, single CC engagement)

CC executes in this order, submitting the full Cluster A evidence package only after the IRA invocation step (4.A.4) completes:

1. **PF-02** — S-CODE-G11-01a, S-CODE-G11-01b, S-CODE-G11-02, S-SIGNAL-G11-01, S-RUNTIME-G11-01. Verdict matrix per R-2 governs magnitude. CC pastes evidence; does not disposition.
2. **PF-01** — S-CODE-G7-01, S-CODE-G7-02 (refined per R-1), S-SCHEMA-G7-01, S-SIGNAL-G7-01. CC pastes evidence; does not disposition.
3. **Cluster A pre-IRA evidence assembled** — PF-02 and PF-01 evidence ready as input to IRA invocation.
4. **IRA invocation (deliverable-internal).** CC runs the IRA invocation per the directive's invocation template (Section 5.bis below). CC drafts the Cluster A question content using the assembled PF-02 + PF-01 evidence and the substrate bindings the template names. CC executes the invocation, captures the IRAPacket verbatim, and records cost per Correction 6.
5. **Cluster A checkpoint** — CC submits the complete Cluster A evidence package: PF-02 evidence + PF-01 evidence + IRA invocation prompt (as drafted) + IRAPacket (verbatim) + cost. CC pauses for architect disposition before proceeding to Phase 4.C.

Architect-channel work post-checkpoint: receive evidence package, disposition findings (ADHERED/DEVIATED with magnitude/locus/NEW), weight IRA reasoning under substrate-bounded authority, lock Cluster A Phase 5 disposition signal candidate, signal CC to resume.

### Phase 4.B — REMOVED in v1.1

(v1.0 had Phase 4.B as a separate architect-channel IRA invocation step. v1.1 folds the IRA invocation into Phase 4.A step 4 as deliverable-internal CC work. Phase 4.B no longer exists; Phase 4.C now follows directly after Phase 4.A architect checkpoint.)

### Phase 4.C — Cluster B and parallel cluster evidence collection (CC, parallelizable, post-Phase-4.A-checkpoint)

CC executes the remaining clusters in parallel where independent, sequential where dependent:

4. **PF-03** — S-CODE-G5-01, S-CODE-G5-02, S-SCHEMA-G5-01 (Cluster B start). Architect dispositions.
5. **PF-04** — S-CODE-G8-01, S-CODE-G8-02, S-CODE-G8-03 (Cluster B continued). Architect dispositions.
6. **PF-05** — S-CODE-G9-01, S-CODE-G9-02, S-RUNTIME-G9-01, S-RUNTIME-G9-02 (Cluster C). Architect dispositions.
7. **PF-06** — S-CODE-G10-01, S-SCHEMA-G10-01, S-RUNTIME-G10-01 (Cluster D). Architect dispositions.

### Phase 4.D — Lower-priority and remaining-commitment evidence (CC, parallel)

8. **PF-07, PF-08, PF-09** — G1 / G3 / G4 probe sets. Architect dispositions.
9. **G2 and G6** — full probe sets. Architect dispositions.
10. **Property observability tests P1–P11** — per Section 5.1 (with R-3 governing P5). Architect dispositions.
11. **Architecture-Trace (16-probe) and Calculation-Trace (CRP/BCL/Meridian)** — existing methodology.

### Phase 4.E — Completion Report assembly (architect-channel)

Architect assembles Completion Report per DIAG Section 7 structure. Audit Gates AG-01 through AG-08 verified. Phase 5 disposition signal locked.

---

## 5.bis IRA Invocation Template (Cluster A, deliverable-internal, Phase 4.A step 4)

The directive supplies this template. CC executes the invocation with content established from collected Cluster A evidence.

**Invocation tool:** `npm run ira -- "<task description>"` from `vialuce-governance` repo root, OR equivalent runtime invocation if architect-channel CLI is not available from CC's working environment. CC verifies invocation tool availability before drafting content; if unavailable, CC HALTs and surfaces to architect channel (do not infer alternative invocation paths).

**Task class (CC pre-classifies):** `audit_finding_disposition_review` — substrate-coherence verification on a specific cluster of pre-known findings.

**Bindings to load (CC names in invocation):**
- DS-021 v1.0 Section 6 G7 commitment text (single canonical signal surface)
- DS-021 v1.0 Section 6 G11 commitment text (read-path coherence)
- DS-021 v1.0 Section 12 (Substrate Bounded Authority methodology)
- DIAG-DS021-Phase4 Section 4.7 (G7 probe specifications)
- DIAG-DS021-Phase4 Section 4.11 (G11 probe specifications)
- DIAG-DS021-Phase4 Section 8.5 Cluster A interconnection
- This Plan Section 3.1 (R-1 G7-02 structural reframe)
- This Plan Section 3.2 (R-2 G11-01 within-run vs cross-run split)
- AUD-002 v2 plan_agent_seeds finding
- AUD-002 v2 write-only signal surface finding (24% Decision 155 compliance)

**Evidence pastes (CC populates from Phase 4.A steps 1-2):**
- `[PF-02 PASTED EVIDENCE]` — full output of S-CODE-G11-01a, S-CODE-G11-01b, S-CODE-G11-02, S-SIGNAL-G11-01, S-RUNTIME-G11-01
- `[PF-01 PASTED EVIDENCE]` — full output of S-CODE-G7-01, S-CODE-G7-02 (R-1 refined), S-SCHEMA-G7-01, S-SIGNAL-G7-01

**Question CC drafts (template):**

> Cluster A (signal surface coherence) substrate-coherence review.
>
> The Phase 4 audit collected the following evidence against G7 (Single Canonical Signal Surface) and G11 (Read-Path Coherence at the Signal Surface):
>
> [PF-02 PASTED EVIDENCE]
>
> [PF-01 PASTED EVIDENCE]
>
> Per the verdict matrix in this Plan Section 3.2 (R-2):
> - 11-01a (within-run read-path) result: [CC fills from evidence: PRESENT or ABSENT]
> - 11-01b (cross-run read-path) result: [CC fills from evidence: PRESENT or ABSENT]
> - Aggregate G11 magnitude per matrix: [CC fills: blocking / severe / candidate ADHERED]
>
> Per R-1 (structural-not-lexical G7-02): plan_agent_seeds is confirmed via JSONB key inspection. Additional bypass keys identified: [CC fills from G7-02 evidence: list of any (c)-classified keys, or "none"].
>
> Architect-channel question for IRA review:
>
> *Given this evidence and the substrate's commitment to G7 + G11, is Cluster A's compliance gap (a) remediable through architectural pattern change (severe magnitude — migrate plan_agent_seeds + any other bypass keys to classification_signals; build cross-run read-path on convergence service in place; coordinated remediation), OR (b) requires rebuild of the convergence service (blocking magnitude — current convergence service architecture cannot support read-path coherence in place)?*
>
> Substrate-bounded authority note: G11 enforcement mechanism specification is forward-looking architectural work (DS-021 v1.0 Section 14 FLI-1, this Plan Section 7 deferred). IRA review should flag if its disposition depends on enforcement-mechanism content not yet in substrate.
>
> Expected output: substrate-grounded reasoning on (a) vs (b), with named bindings, magnitude justification, and any substrate-bounded-authority flags.

**CC discipline during invocation:**
- CC does NOT disposition the IRA verdict (architect channel work)
- CC does NOT modify the IRAPacket (capture verbatim)
- CC records cost from IRAPacket per Correction 6
- CC includes invocation prompt (as drafted, with placeholders filled) in evidence package alongside packet
- If invocation throws, CC HALTs and surfaces to architect channel (do not retry without architect direction)

---

## 6. Audit Gates (Inherited from DIAG Section 6)

All Audit Gates AG-01 through AG-08 inherit from DIAG Section 6 without modification. The Plan adds one operational note:

**Operational note on AG-06 (Substrate-Bounded-Authority annotations).** R-3's distinction between ABSENT-BOUNDED and ABSENT-UNBOUNDED applies. P5 findings under ABSENT-BOUNDED automatically carry the AG-06 annotation; the verdict label itself encodes the substrate-bounded posture.

---

## 7. Forward-Looking Items (Status Update from DIAG Section 12)

The synthesis conversation determined that **none of the five DIAG FLIs are dischargeable in this synthesis conversation**:

- **FLI-1 (G11 enforcement mechanism specification)** — deferred until post-Phase-4-audit-evidence; specifying enforcement before knowing whether convergence service requires rebuild is premature.
- **FLI-2 (Decision 64 v3 supersession)** — deferred per DS-021 v1.0 Section 12 Substrate Bounded Authority; substrate-extending lineage not yet populated.
- **FLI-3 (DS-020 supersession ICA capture entry)** — deferred to ICA-queue-discharge work; ICA-not-functioning means register entry sits in queue regardless.
- **FLI-4 (Cross-flow boundary specification for P8)** — deferred until Phase 4 audit on P8 produces evidence requiring it.
- **FLI-5 (Substrate-Trace methodology canonicalization)** — deferred until post-Phase-4-execution proves methodology productive; canonicalizing before execution begs the question.

This Plan does not produce FLI-discharge artifacts. FLIs remain open and queued.

---

## 8. Artifact Lifecycle

**Inputs (canonical):**
- DS-021 v1.0 LOCKED — SHA256 `7fa895291514a6de873a1114e30f678dadf895d23f499b5426dcef069a088edb`
- DIAG-DS021-Phase4 — SHA256 `1c814df14778a0c0a407c788c021a14732ec4ea6b366d4363c7d76bdbe2a18de`
- This Plan — SHA256 [computed at file commit]

**Outputs (Phase 4 execution produces):**
- CC evidence packages per cluster (ephemeral; ingested into Completion Report)
- IRA invocation prompt + IRA response on Cluster A (committed to repo per IGF documentary discipline; PG-02 prompt commit + PG-05 response commit pattern)
- Phase 4 Audit Completion Report (canonical artifact; SHA256-tracked; structure per DIAG Section 7)

**Successor specification (out of scope of this Plan):**
- A development specification produced after Phase 4 Completion Report, in a subsequent fresh-context conversation, operationalizing remediation work per Phase 5 disposition signal. This Plan produces audit *execution* mechanics; the development specification produces remediation *implementation* mechanics. Two artifacts, two conversations, two SHA256s.

---

## 9. Document Control

- **Status:** Phase 4 audit execution plan v1.1 — amended 2026-04-30 (deliverable-internal IRA correction)
- **Predecessor:** v1.0 produced 2026-04-30 in same synthesis conversation; superseded by v1.1 mid-conversation when the canonical IRA invocation pattern (deliverable-internal, CC-runs-it) was surfaced. v1.0 mis-specified IRA as architect-channel external work; v1.1 corrects to canonical pattern.
- **Authority:** Architect channel (Claude) under directive disposition
- **Synthesis conversation source:** Fresh-context synthesis conversation following DS-021 v1.0 lock + DIAG-DS021-Phase4 production (this conversation)
- **Companion artifacts:** DS-021 v1.0 LOCKED; DIAG-DS021-Phase4; SESSION_HANDOFF_20260430
- **Forward usage:** This Plan v1.1 is consulted by Phase 4 audit execution. It governs execution mechanics; the DIAG governs probe semantics; DS-021 v1.0 governs commitment definitions. Where this Plan's refinements (Section 3) conflict with DIAG specifications, this Plan governs Phase 4 execution.
- **Lifecycle:** v1.1 locks at production. Refinements during execution that surface novel evidence may warrant a v1.2; architect-channel revision required (CC cannot revise specifications per Standing Rule 35).
- **Save to Project Files:** Yes, alongside DS-021 v1.0 + DIAG + handoff. v1.1 supersedes v1.0; v1.0 superseded mid-conversation and not committed to project files.

*End of PHASE_4_AUDIT_EXECUTION_PLAN v1.1 — amended 2026-04-30 by architect disposition (deliverable-internal IRA correction).*

*Vialuce.ai · Intelligence. Acceleration. Performance.*
*v1.1 amendment: IRA invocation is deliverable-internal. CC runs it. Directive supplies the template; CC establishes content. Single CC engagement for Cluster A; one checkpoint after IRA returns.*
