# DS-031 — The Predictive Intelligence Substrate: Thalamus and the One Generative Model

**Status:** v0.1 DRAFT — architect-channel, pre-IRA-verification.
**Date:** 2026-06-28
**Authoring channel:** Architect (Claude) under directive disposition.
**Class:** DS (Design Specification) — foundational / architecture-defining.
**Verification:** This document is drafted **to be verified by IRA Invocation** against the substrate (Tier 0–6) before any implementation OB. It is not self-certifying. See §12.

**Relationship to prior substrate (binding):**
- **Extends, does not alter, DS-021 v1.0** (Substrate Architecture: Biological Lineage). DS-021's four Roles, eleven Properties (P1–P11), and eleven Commitments (G1–G11) are treated as **prime** (§3) and are preserved without modification. DS-031 is the **successor specification DS-021 itself names** — Drift Risk 2 (*"the Synaptic-State/carrier circular flow may need its own architectural section in a successor specification"*) and the G11 read-path gap (*"signals written but not read… a substrate violation that must close"*) are the two threads this document takes up.
- **Extends, does not alter, the Synaptic State Specification v1.** The synapse interface, the eight structural synapse types, the Synaptic Surface (Map-of-Maps, O(1)), the density execution modes, and "Observation IS Action" are **prime** and are built upon, not revised.
- **Preserves Decision 64 v2, Decision 92, Decision 154/158, the Korean Test, Carry Everything, Calculation Sovereignty.** DS-031 modifies none of them; it names the architecture they already compose into.

**The naming change (PRISM → Thalamus):** the data intelligence layer's internal name changes from PRISM to **Thalamus**. This is not a cosmetic rename pass; it is the consequence of the architectural recognition in this document — the layer's function is thalamic (the gateway through which all input passes, that comprehends it and precision-weights what reaches awareness versus what is predicted away). The old name (optical splitting) named a function the layer does not perform. The name changes as the architecture is re-founded (§11); PRISM persists in code until the re-founding naturally retires it.

---

## 0. The thesis, stated once

**The Vialuce substrate already IS a hierarchical predictive-coding system. DS-031 does not introduce a new paradigm — it names the architecture the substrate's existing primes already describe, and specifies the re-founding of the partial implementations onto it.**

This is a claim about recognition, not invention, and it is falsifiable. The test: do DS-021's locked properties already describe predictive coding? Read against the biology of the cerebral cortex (hierarchical prediction-error minimization under the free-energy principle), they do:

- **P5 — Reaction-Prediction Simultaneity** (*"the same substrate operating in two temporal frames"*) is the defining property of predictive coding: perception and prediction are one process, not two subsystems.
- **Synaptic Density execution modes** (silent ≥ 0.95 / light_trace 0.70–0.95 / full_trace < 0.70) are **precision-weighted prediction-error minimization**: structure the model predicts well is silent (no error propagates, no cost); structure that surprises the model propagates error (full_trace, effort, learning).
- **P3/P4 + "cost decreases with usage"** are the free-energy principle as an operational law: a well-modeled input is predicted away cheaply; the model's accumulated capability is its generative model of its own inputs.
- **The Adaptive Immunity progression** (innate heuristics → adaptive LLM classification → antibody recognition → affinity maturation 90→99%) is a generative model learning to predict its sensory stream.
- **G7 — Single Canonical Signal Surface** is the **one generative model**: not five models for five agents, one surface every level reads and writes.
- **G8 — Korean Test** is what makes the generative model **domain-agnostic** — it models structure, not domain semantics, so one model serves every domain.

The substrate did not borrow predictive coding. Evolution and the substrate independently converged on the same solution to the same problem — comprehend any input, spend effort only on surprise, let everything feed one accumulating model. DS-031 names that convergence so it can be built to completion.

---

## 1. Why this specification is comprehensive (the whole brain), and why that yields a working system

DS-031 specifies the **entire** predictive-coding substrate — comprehension (Thalamus), calculation, and convergence as levels of **one** generative model — not Thalamus in isolation. Two reasons, both binding on the document's structure:

**Thalamus cannot be correctly defined alone.** The thalamus's job is not "produce clean data" in the abstract — it is "comprehend input into the form the levels above it need to act on it." A perceptual layer specified without its consumers optimizes for the wrong target. Predictive coding is mutually-defining across levels: the higher level's predictions determine what the lower level bothers to comprehend (top-down prediction shapes bottom-up processing). So Thalamus's role is defined **by its place in the whole model**, which requires specifying the whole model.

**The comprehensive model exists to make the vertical slices visible (§10).** A total architecture that cannot be built incrementally is a manifesto, not a specification — the failure mode this document must avoid. The comprehensive model is the **map**; the vertical slices are **routes through it**. Specifying the whole is what lets each slice be a coherent path from data-arrival through comprehension through calculation to a rendered trusted outcome — a real thread, not a disconnected fragment. The Vertical Slice Rule (engine and experience evolve together in one increment) is honored *because* the whole model is specified: every slice cuts top-to-bottom through one architecture.

The comprehensive model and the incremental build path are therefore both in this document, the second derived from the first (§10).

---

## 2. The one generative model — the predictive-coding architecture

The platform is **one hierarchical generative model** that minimizes surprise about its inputs. It has four mechanisms, each already present in the substrate primes, here named as one coherent architecture.

### 2.1 Composition upward (the perceptual hierarchy)
Structure composes from the smallest unit to comprehension, at increasing levels of abstraction:

> **atom (nanosignal) → fingerprint → comprehension**

This is DS-021's Adaptive Immunity ladder and the Synaptic Surface's atom layer, named as a hierarchy. The atom is the lowest level (a structural fingerprint over value distribution, type, cardinality, pattern — Korean-Test clean, no header text in any language). Atoms compose into sheet/source fingerprints; fingerprints compose into comprehension (what this data *is* and *how it behaves* — Decision 64 v2's Classification and Comprehension levels). There is no separate "reasoning" engine above recognition; reasoning is **the same hierarchy operating where composition has not yet reached a recognized level.**

### 2.2 Prediction downward (accumulated knowledge sets expectation)
The accumulated generative model — the canonical signal surface (G7), consolidated from every prior run — sets **predictions** at every level. When new data arrives, the model already expects structure at each level based on everything it has seen (the flywheels: Tenant, Foundational, Domain). Recognized structure is structure the model **predicted**.

### 2.3 Only error propagates upward (the dissolution of the discrete-agent decomposition)
This is the load-bearing mechanism, and it dissolves a prior architecture rather than adding one.

**There is no separate "reasoning over the unrecognized residue." The residue is prediction error — structure a level could not predict — and it is handled by the same mechanism one level up, not by a different operation.** What the discrete-agent decomposition called "normalize, then reconcile, then dedup, then anomaly" are **not operations the system performs in sequence.** They are **names humans give to kinds of pattern the surface recognizes.** Whether a value is a typo (correction), a different entity (identity), a unit mismatch (reconciliation), or a genuine variant (normalization) is **not separable** — it depends on all of those analyses being co-present and mutually informing. Sequencing the operations decides each one blind to the others and **destroys the joint information that produces the correct answer.**

The substrate already proves joint recognition is the architecture: the **Synaptic Surface negotiation protocol** (Content Ingestion Specification) resolves classification by *rounds of spatial re-examination* — each agent posts to the surface, sees every other agent's claim, and re-examines its own (*"the absence of a signal is itself a signal"*: an agent gains conviction when no other agent competes for its territory). Neither agent reaches the right answer alone; the answer **emerges from all the analysis being on the surface together.** DS-031's commitment is that **repair is resolved the same way classification already is** — joint recognition on the shared surface, not a pipeline of stages.

**Consequence — the EECI five-agent roadmap is superseded.** There are not five agents to build (Normalizer, Reconciler, Profiler, Dedup, Anomaly) ranked by EECI. There is **one recognizing surface**, and "normalization / reconciliation / deduplication / anomaly" are **facets of one recognition**, not components. The prior ranking reified a decomposition that the surface makes obsolete (§3, composite).

### 2.4 The apex: bounded model-extension at irreducible surprise (Decision 158, sharpened)
When prediction error reaches the top of the hierarchy — structure no level can predict, genuine novelty — a **single bounded LLM expression** generates a new prediction for that structure. This is **Decision 158 sharpened to its true role**: the LLM does not "reason over a residue" and it does not drive agents. It is **the generative model's mechanism for extending itself at the apex when existing predictions fail.** One narrow expressive act, at the top, only on irreducible surprise — and the result **consolidates** into the model (§2.5) so the same structure is predicted (silent, free) forever after. The LLM expresses; deterministic code constructs and guarantees (G9); the separation is absolute. The more the model has seen, the less the apex fires — *cost decreases with usage*, mechanically.

### 2.5 Consolidation (the flywheel as model update)
Every resolution — recognized or apex-reasoned — **writes back** to the canonical signal surface as consolidated signal. Today's surprise becomes tomorrow's silent prediction. This is the flywheel (G7, the three scopes, the Multiplier Principle) named as **the generative model updating itself.** Consolidation is what makes recognition primary and apex-reasoning the bounded exception: the network, not the dataset, is the unit of learning — every tenant's resolution becomes every future tenant's prior (Mycorrhizal Cross-Flow, P8).

### 2.6 Why this is affordable when the frontier is not
Joint co-present analysis is expensive — it is why conventional holistic repair must approximate (combinatorial explosion) and conventional pipelines must sequence (destroying joint information). **The accumulated surface collapses the joint inference:** when most structure is *recognized* against accumulated signal rather than *inferred* from scratch, the expensive joint reasoning runs only over the small unrecognized residue at the apex. **Recall is what makes co-presence affordable.** Conventional methods have no accumulated surface, so their joint inference is always over the whole input — they must approximate or sequence. The substrate does not. This is the structural moat: the unit of learning is the network, and the network makes the correct (joint) approach tractable.

---

## 3. The first-principle test, and the prime/composite classification

**The test (binding):** *Is this element irreducible — does the architecture's coherence depend on it such that removing or altering it would collapse something essential?* This test is evaluated **against the present architecture**, not against any document's status label. "Locked" is a governance convention; it is **not a truth claim**. A principle earns standing by *still being load-bearing* (re-tested, never assumed); a state-description earns standing by *still being accurate* (verified, never trusted on label); **nothing carries authority from its status alone.** (This retires "LOCKED-as-authority" — see §3.3.)

### 3.1 Primes (irreducible — DS-031 extends, never alters)
Each passes the test: remove it and the architecture collapses.

| Prime | Why irreducible |
|---|---|
| **The four Roles** (Carry / Interpret / Express / Learn) | The substrate's structure; no level of the generative model exists without them. |
| **The eleven Properties P1–P11** | Constitutive — *"a substrate without permeability is not this substrate."* P5 (Reaction-Prediction Simultaneity) is predictive coding itself. |
| **The eleven Commitments G1–G11** | Enforceable obligations protecting the properties; the generative model is incoherent without them. |
| **The Synaptic Surface** (shared in-memory inference surface; Observation IS Action; density modes) | The one surface on which joint recognition happens. Remove it and recognition cannot be co-present — the architecture reverts to message-passing/sequencing. |
| **Single Canonical Signal Surface (G7)** | The one generative model. Two surfaces = two models = no joint inference, no flywheel coherence. |
| **Korean Test (G8)** | What makes the model domain-agnostic. Remove it and the model forks per domain — the category collapses. |
| **Deterministic Calculation Boundary + Decision 158 (G9)** | What makes the model *trustable*. Remove it and outputs are non-reconcilable — the trust paradigm collapses. |
| **Carry Everything (G1) + Calculation-Time Binding (G3)** | The model cannot predict-away structure it narrowed away at carry; recognition requires complete input. |

### 3.2 Composites (DS-031 re-founds these onto the primes — they are partial implementation, not foundation)
DS-021's own **Drift Risk 4 (the dressmaker's edict)** names these: the substrate that exists in code is a partial implementation of the substrate the primes specify.

| Composite | The drift | Re-founding |
|---|---|---|
| **The Normalizer built beside the surface** (OB-249) | A discrete remediation stage with one LLM call, run as its own pipeline. | Becomes prediction-error resolution **on** the Synaptic Surface — one facet of joint recognition, not a standalone stage (§2.3, Phase 3 / §10). |
| **The discrete five-agent decomposition** (EECI roadmap) | Reifies normalize/reconcile/dedup/anomaly as separate components to build and rank. | Dissolved into facets of one recognition. The roadmap is superseded (§2.3). |
| **The half-open read-path (G11 violation)** | Signals written but not read for cross-run learning (AUD-002). The predictive loop is open — prediction-downward is not actually closed because consolidated signal is not consumed to set the next prediction. | Closed: the canonical signal surface is **read** to set predictions (§2.2), not only written. This is the substrate violation DS-021 says *"must close."* |
| **Remediation positioned inside ingestion** | PRISM as a step in a pipeline. | Thalamus positioned **in front of** ingestion as the perceptual layer, writing atoms/signals that persist on the shared surface the engine and convergence read (§4). |

### 3.3 State-descriptions are quarantined until verified
Per the test, state-descriptions carry authority only while accurate. **AUD-001 is known-stale and is excluded as a source of truth for DS-031.** Any fact DS-031 needs that a stale state-description once carried is re-established against the present system (Phase 1 / §10), not inherited. (This is the governance-layer analogue of precision-weighting, §5: do not let a confident label predict-away the fact that a description went stale.)

---

## 4. Thalamus — the perceptual layer, defined by its place in the whole

**Thalamus is Roles 1–2 (Carry + Interpret) operating as prediction-error minimization at the comprehension frontier, positioned in front of ingestion.** Its function is thalamic: the gateway through which all input passes, that comprehends it against the accumulated model and precision-weights what propagates (surfaces for attention/judgment) versus what is predicted away (silent, recognized).

**Thalamus comprehends before, and independently of, the remediation/promotion path.** When any file in any format arrives, Thalamus composes it into atoms (§2.1) and writes them, with confidence/precision, to the canonical signal surface — **the same surface the calculation engine and convergence read.** Comprehension is not a remediation step inside ingestion; it is the perceptual front of the one model. (This is the topology correction: PRISM-as-pipeline-step → Thalamus-as-perceptual-layer.)

**Thalamus's output is defined by its consumers.** It produces the comprehension the calculation level needs to bind data at calculation time (G3) and the signals convergence needs to observe matches (Decision 64 v2). It is specified *for* those levels, which is why §1 requires the whole model.

**What Thalamus is NOT:** it is not "a data-cleaning layer," not "the product" (Vialuce is the product; Thalamus is the data intelligence layer), not agentic (it is a recognizing surface with a bounded apex, not an orchestrator of autonomous agents). The synapse types it writes are structural (G8): `confidence`, `anomaly`, `correction`, `pattern`, `data_quality`, `resolution_hint`, plus `boundary_behavior`, `performance` — never domain-specific.

---

## 5. Precision-weighting — the trust safeguard (the one genuinely new specification)

This is the part the efficiency story alone gets **wrong**, and the part that makes this a **trust** paradigm rather than merely an efficient one.

**The hazard:** predictive coding's power and its danger are the same mechanism. A strongly-predicting model **hallucinates** — it sees what it expects and **predicts away real signal it should have surfaced.** In the brain this is the source of illusory perception (*what is seen is unduly influenced by what is expected*). For a **trust** platform, this is the failure mode that matters most: an overconfident surface predicts away a genuine anomaly — a real data error, a true novelty in a high-stakes calculation — as "expected," and the operator never sees it. Maximum prediction-away (maximum efficiency, silent ≥ 0.95) is **maximum hallucination risk.**

**The safeguard (the biology's own answer):** the brain weights how much to trust a prediction versus an error by **estimated precision** — and *attention* is precisely the up-weighting of prediction error when it matters. DS-031 commits the substrate to the analogue:

> **Precision-weighting governs when recognition may predict-away versus when surprise must surface for human judgment — and it is tuned so that trust-critical surprise is never silently predicted away by a confident model.**

Operationally, this extends — does not replace — Synaptic Density:
- Density (confidence) decides *baseline* execution mode (silent / light_trace / full_trace).
- **Precision-weighting overrides density toward surfacing** when the *consequence* of a wrong prediction is high — a value feeding a high-stakes calculation, a pattern whose misclassification is expensive, a region where the model's confidence is high but its *exposure* (how much it has actually seen of this exact structure) is low. High confidence on thin exposure is exactly where a model hallucinates; precision-weighting catches it.
- The trust-critical residue **always surfaces** rather than being predicted away. This is the thalamic attention mechanism, and it is what keeps the cost-decreases-with-usage law from becoming a trust liability at the limit.

**Falsifiable commitment (the Phase 4 proof, §10):** demonstrate that a genuine anomaly the model "expects" (high prediction confidence) but should not silently accept (high consequence, thin exposure) is **surfaced, not predicted away.** If the efficient path silently absorbs it, precision-weighting has failed and the trust paradigm is not yet real.

---

## 6. The architecture is the trust paradigm (why "not agentic" is correct, not a limitation)

The platform's value proposition is **justified trust** (the Vialuce Paradigm). Trust is earned by being right, verifiably, every time. Therefore the architecture must be the **most deterministic, most auditable, most reconcilable** system available — not the least.

Agentic systems are presently the **least** trustable class of AI: non-deterministic, hard to audit, prone to confident error. DS-031's architecture is the opposite by construction: recognition against an accumulated, inspectable model; a single bounded expressive act at the apex (Decision 158); deterministic construction below the boundary (G9); provenance and confidence native to every synapse; precision-weighting keeping the confident model honest (§5). **The substrate is not agentic, and that is the architecture of trustable AI** — it delivers the one thing the agentic frontier cannot: an answer a customer can stake a payroll on. "Capability disrupts the market; vocabulary does not." Thalamus is not named "agentic" to seem advanced; it is named for what it does.

---

## 7. What DS-031 does NOT change (guardrails for the re-founding)

To prevent the re-founding from sprawling into a rebuild of things that are prime:
- **It does not modify DS-021's Roles, Properties, or Commitments.** They are extended (named as predictive coding), not altered.
- **It does not modify the Synaptic State Specification.** The synapse interface, types, surface, and density modes are built upon.
- **It does not modify the Deterministic Calculation Boundary, Calculation Sovereignty, or criteria immutability (G9).** The calculation level is a consumer of comprehension; its internal commitments are untouched.
- **It does not introduce a registry, an allowed-values list, or a fixed taxonomy at any layer** (the no-registry prime holds; recognition validates structural properties, never set membership).
- **It does not make the apex LLM a driver/orchestrator.** The LLM extends the model at irreducible surprise; it does not control the surface (Decision 158 absolute).

---

## 8. Open architectural questions (carried to IRA verification and Phase 4)

Honest, named, not hidden — the document's quality depends on surfacing these:

- **Q1 — The structure of apex reasoning.** "All the analysis together" must hold *at the apex too*: the bounded reasoning over the unrecognized residue must itself be **joint** (one act over the whole residue, all facets co-present), not internally decomposed — otherwise the sequencing problem is merely relocated to the frontier. Whether the apex act is monolithic, partitioned by structural similarity of the residue, or iterative (reason → consolidate → re-recognize → repeat, per the negotiation protocol's rounds) is the **spine of the Thalamus build** and is not yet settled. *Lead hypothesis:* iterative-joint, because the negotiation protocol already resolves classification that way; the apex resolves repair the same way.
- **Q2 — Precision-weighting calibration.** §5 commits to the safeguard; the *calibration* (the exposure/consequence function that overrides density toward surfacing) is unspecified and is trust-critical. Phase 4 territory.
- **Q3 — The read-path closure mechanism (G11).** DS-021 says the read-path gap must close and that the *enforcement mechanism* may warrant a Decision-class specification at Phase 4. DS-031 names the closure architecturally (prediction-downward reads consolidated signal); the mechanism is Phase-1/Phase-2 implementation territory.
- **Q4 — Cross-flow boundary (P8 / DS-021 Q5).** Mycorrhizal cross-flow makes the network the unit of learning; privacy firewalls (Tenant isolation) constrain it. The boundary specification (what propagates, what does not) is inherited-open from DS-021 and is not DS-031-resolved.

---

## 9. Relationship to the IGF and the recursive substrate

The IGF (governance substrate) and the Vialuce platform substrate share the four-agent and signal-surface architecture (DS-021 Q7, the recursive substrate principle). DS-031's predictive-coding framing **applies recursively**: IRA Invocation verifying this document against the substrate is itself prediction-error minimization at the governance level — the substrate's model of itself, catching where a specification surprises the established primes. This is why DS-031 is drafted *for* IRA verification (§12) rather than self-certified: the governance brain must keep its own model honest, including its model of this document.

---

## 10. The vertical slices (how the comprehensive model becomes a working system)

The seams where slices cut through the whole model. Each is top-to-bottom (Vertical Slice Rule); each builds on **verified** state, not prior-phase claims (the session's hard lesson); each has a real gate.

**Phase 0 — DS-031 itself, IRA-verified.** This specification, verified by IRA Invocation against the substrate (§12), architect-approved. *Gate: IRA coherence findings dispositioned; architect signoff. No implementation before this.*

**Phase 1 — Reconcile spec to built state (verify before re-founding).** Establish honestly how far the *implementation* has drifted from the primes (the dressmaker's-edict evidence: the Normalizer-beside-the-surface, the half-open read-path, the density modes' actual implementation). Quarantine stale state-descriptions (AUD-001 excluded). *Gate: a true-state map, architect-reviewed — built on present truth, not labels.*

**Phase 2 — Thalamus as the perceptual front + close the read-path.** Position the atom layer as comprehension **in front of** ingestion, writing atoms/signals to the shared surface; **close the G11 read-path** so prediction-downward actually consumes consolidated signal to set the next prediction. Largely elevation of what exists (atom layer) plus the read-path closure the substrate already mandates. *Gate: data arriving is comprehended into atoms on the shared surface, and a prior run's consolidated signal demonstrably sets the next run's prediction — verified in data.*

**Phase 3 — Re-found remediation as joint recognition (the paradigm shift).** The Normalizer stops being a discrete stage and becomes prediction-error resolution on the surface; the normalize/reconcile/dedup/anomaly facets resolve **jointly** via the negotiation protocol applied to repair (§2.3). This subsumes the five-agent roadmap. The hardest build. *Gate: a value's resolution (canonical / correction / identity / anomaly) falls out of one joint recognition with co-presence preserved — verified against real tenant data, reconciliation architect-channel.*

**Phase 4 — Precision-weighting (the trust safeguard).** Build §5: precision-weighting overriding density toward surfacing on high-consequence / thin-exposure structure. *Gate: the falsifiable proof — a genuine anomaly the model "expects" is surfaced, not silently predicted away.*

Sequence shape: **specify → verify → re-found → transform → safeguard.** Phases 0–1 are paper-and-verification (no code risk); Phase 2 is mostly elevation; Phase 3 is the transformation; Phase 4 is the new safeguard. Each is a single coherent slice through the whole model.

---

## 11. The naming transition (operational)

PRISM → Thalamus is established by this document and used in all subsequent artifacts. It is **not** a rename OB. PRISM persists in `main` as the old internal name until the Phase 2–3 re-founding naturally retires it (the name changes as the architecture is re-founded, not before). User-facing labels are unaffected (PRISM was always internal; the user-facing label remains "Data Operations" or its successor). The biological vocabulary (Thalamus, perceptual hierarchy, prediction error, precision-weighting) is **elevated deliberately** because it *teaches* the architecture — a new engineer reading "Thalamus: the gateway that comprehends input and precision-weights what reaches awareness" learns what the layer does in a way "PRISM" never conveyed.

---

## 12. Verification by IRA Invocation (this document is not self-certifying)

DS-031 is drafted **to be verified**, not asserted. Before any implementation OB:

- **Invocation scope:** architectural coherence — *does DS-031's predictive-coding framing, prime/composite classification, and Thalamus definition cohere with the substrate's Tier 0–6 primes, or does it surface supersession/coherence findings that must be dispositioned first?*
- **Prohibition check (T0-E08 Step 2):** DS-031 does **not** amend a Tier 0 agent-governing entry (T0-E09/E10/E11/E12/E08). It specifies platform-substrate architecture, not the IRA/IVA/IMA/ICA prompt templates. **IRA invocation is therefore permitted** for this verification. (If any future revision amends an agent-governing entry, invocation becomes prohibited for that revision and verification reverts to architect spec review per the reference.)
- **The verification is the governance-level instance of this document's own thesis:** IRA catches where DS-031 *surprises* the established primes (prediction error at the governance level). Findings are dispositioned (ACT/DEFER/REJECT/WATCH) before Phase 0 signoff.
- **Architect-channel discipline:** this DS is architect-channel design; CC executes nothing from it until Phase 0 closes and per-phase OBs are drafted and dispatched. SR-44 holds throughout.

---

## Document control
- **Version:** v0.1 DRAFT — pre-IRA-verification, architect-channel.
- **Extends (does not alter):** DS-021 v1.0 (four Roles, P1–P11, G1–G11); Synaptic State Specification v1; Decision 64 v2; Decision 92; Decision 154/158; Korean Test; Carry Everything; Calculation Sovereignty.
- **Supersedes:** the EECI five-agent remediation roadmap (the discrete-agent decomposition; §2.3, §3.2) — superseded by joint recognition on the surface, pending IRA confirmation.
- **Names the successor specification DS-021 requested:** Drift Risk 2 (Synaptic-State/carrier circular flow) and the G11 read-path gap.
- **Next:** IRA Invocation verification (§12) → disposition findings → architect Phase 0 signoff → per-phase OB drafting (§10).

*Vialuce.ai · Intelligence. Acceleration. Performance.*
*The substrate is one generative model. It predicts what it has seen, spends effort only on surprise, and keeps itself honest where trust is at stake. Thalamus is the gateway through which the world enters the model.*
