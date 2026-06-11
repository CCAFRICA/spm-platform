# DS-027 — Ingestion Comprehension & Signal Spine Architecture
**SUPERSEDED by DS-027 v0.2 (...20260610v2.md) — retained per revert-discipline; do not implement from this version (DI-9/DI-10 absent).**
**Version:** v0.1 DRAFT (lock follows brief_only scope-coherence IRA invocation)
**Date:** 2026-06-10
**DS-027** — Design Specification: ingestion comprehension pipeline, hierarchical recognition, and platform signal spine
**Registry derivation:** sequential DS registry runs to DS-026 (INF_GOVERNANCE_INDEX_20260406 + SESSION_HANDOFF_20260515: DS-022 Canonical Signal-Write Surface v2, DS-023 SCI, DS-024 Reconciliation Intelligence, DS-025 Convergence Unification, DS-026 Agentic Architecture Brief); DS-064/DS-077 are decision-number aliases, excluded from sequence. Next sequential: 027.
vialuce.ai
**Status:** Architect-approved resolutions locked 2026-06-10 (Q3-3c, Q1-1d, Q2-2a+invariant); document drafted against them.
**Provenance:** IRA Class A invocation `ecc3824e` (prompts/IRA_DS_INGESTION_SIGNAL_SPINE_Option_Evaluation_20260610.md, response commit 1c86522, $1.674465, fired_with_results, 0/41 unit failures). Dependency analysis commit 8a44fda. Defect evidence: Brasa y Maíz import failure 2026-06-10.
**Drafting discipline:** INF_Structured_Compliant_Drafting_Reference_20260513.md (STRUCTURED AND COMPLIANT invoked). This is a design specification, not an execution directive; no CC execution content appears here. Work items implementing this DS are drafted separately, each per the directive SOP.
**Phase 0 inputs:** IRA findings; Vialuce_IP_Inventory_20260307 (IP-inform); ViaLuce_Design_Vision (vision-guide); DS-021 v1.0 LOCKED (substrate lineage); SCHEMA_REFERENCE_LIVE.md governs all schema references.

---

## 1. Purpose and Defect Class

A production import (datos-cadena-restaurantes-mx.xlsx, 16 sheets, 162,956 rows) failed three consecutive times with the identical signature: one in-line header-comprehension LLM call covering all novel sheets ran 68 seconds, returned unparseable JSON, fell back silently to structural heuristics, and produced a proposal at zero comprehension confidence with the employee roster classified as transaction data. The HF-247 quality gate correctly refused to store the failed comprehension's fingerprints — and thereby guaranteed the next attempt repeats cold-start identically. The flywheel cannot learn from its own failures.

The structural class, confirmed by IRA against substrate: comprehension operates as a gate on ingestion (EECI inversion of T1-E902), session state is ephemeral so failure has nowhere durable to live (T1-E903 three-tier chain unmodelable), recognition is sheet-opaque so one unknown column poisons all learning (T1-E906 read-before-derive unreachable), and failure is silent (T1-E910 structured-failure violation). Hardening the in-line call was evaluated and rejected as an E907 Fix-Data-Not-Logic violation (IRA rank 9 of 10).

This DS defines the replacement architecture. It is the same architectural error the Design Vision records as the platform's founding correction — "the system was deleting genes during replication" — recurring at the comprehension layer instead of the persistence layer: the system was discarding *understanding* during interpretation.

## 2. Locked Resolutions

**R1 (Q3-3c) — Hierarchical recognition at column-atom granularity.** Every column receives a structural fingerprint (the atom). Sheet identity is a composition of atom fingerprints. Workbook semantics are a relational graph over sheet summaries (entity roster / reference / fact grain / derived aggregation). Atoms accumulate recognition signal at all three flywheel scopes (tenant, foundational, vertical).

**R2 (Q1-1d) — Comprehension state is durable, expressed as signals on the canonical surface.** Each unit's comprehension state lives as signals on `classification_signals`. The ephemeral in-memory session object ceases to be the system of record; it may persist as a per-request working cache only.

**R3 (Q2-2a + invariant) — One signal spine with read-side density governance.** Every machine state transition and every user interaction emits to the single canonical surface, consumed by observability, adaptive UI, flywheel, and audit. Synaptic Density modes govern read/activation only.

## 3. Design Invariants

One invariant per layer; zero enumerated failure shapes (AUD-009 discipline). These are the testable commitments every implementing work item is verified against.

- **DI-1 (Pipeline):** No unit's persistence state may depend on any unit's comprehension state. All sheets, columns, and rows persist deterministically; comprehension annotates persisted data. (T1-E902 expressed at pipeline granularity.)
- **DI-2 (Cost):** Comprehension cost scales with novelty, never with size. LLM payload is bounded by novel atoms plus context; it is never a function of row count or of already-recognized structure. (Progressive Performance as an ingestion invariant.)
- **DI-3 (Identity):** All recognition identity is structural — value distributions, types, cardinality, repeat ratios — at atom granularity; sheet identity derives from atom composition; workbook semantics derive from inter-sheet relations. Zero language- or domain-specific literals at any layer. (T1-E910 / Decision 154.)
- **DI-4 (Failure):** Every comprehension boundary produces a named, durable, user-visible state on failure. A unit without successful comprehension occupies a named state; it cannot appear in a proposal as if comprehended. Silent fallback is structurally impossible, not procedurally discouraged.
- **DI-5 (Density):** Signals are always written; density modes govern read/activation only. The platform never economizes by not learning. (IRA-contributed constraint resolving the E902/E0-E05 tension; rejection basis for option 2c.)
- **DI-6 (Surface):** One canonical signal surface. Machine comprehension events and human interaction events are the same object class, distinguished by provenance, never by table. (Decision 64 v2; G7.)
- **DI-7 (Learning):** A blocked or failed learning write emits a remediation signal on the same surface. The flywheel can stall on a unit; it can never silently dead-end. (HF-247 companion behavior.)
- **DI-8 (Temporal identity):** An atom recognized in period N is recognizable in period N+1 without re-derivation. Atom fingerprint identity persists across temporal boundaries. (Decision 92 extension.)

## 4. Architecture

### 4.1 Hierarchical Recognition

**Atoms.** The recognition and learning unit is the column-atom: a structural fingerprint over value distribution, data type, cardinality profile, repeat ratio, and temporal/currency/identifier pattern flags — bucketed for fuzzy matching, consistent with the existing composite-signature mechanics (IP-013), extended from sheet scope to column scope. Atom fingerprints contain no header text in any language (DI-3); header text is carried as display metadata, never as identity.

**Composition.** Sheet identity is the ordered multiset of its atom fingerprints plus sheet-level structural profile. Recognition is therefore partial by construction: a never-seen sheet composed of 28 known atoms and 2 novel atoms yields comprehension work of exactly 2 atoms (DI-2). This dissolves the all-or-nothing failure of opaque sheet hashes and the HF-247 dead-end: known atoms carry their accumulated roles regardless of novel neighbors.

**Workbook graph.** A synthesis pass over compact per-sheet summaries (atoms, roles, keys, profiles — kilobytes regardless of row count) derives inter-sheet relations: which sheet's key column the fact grain references (entity roster), which sheets share vocabulary and aggregate the fact grain (derived), which are reference tables. Relational understanding flows downward to re-score atom roles: a key column referenced by the fact table is an entity identifier whatever its local profile suggested. Derived sheets are classified as derived — persisted in full, annotated as informational (hint, never gate; DI-1; D3 default behavior remains an open section, §7).

**Flywheel scopes.** Atoms accumulate at tenant scope (this customer's patterns), foundational scope (cross-tenant structural patterns, anonymized, no tenant identifiers or values), and vertical scope (per-industry patterns) — the three-flywheel architecture (T1-E906, DS-021) operating at the granularity where recurrence is highest.

**Staging note (open, §7).** IRA designates atom-without-hierarchy (3b) as a viable intermediate with a PREPARE obligation: if implementation stages, atom-level data is captured from the first work item in the shape the full hierarchy consumes, so staging strands nothing (E914).

### 4.2 Durable Comprehension State

**Unit state machine.** Every unit (sheet; atoms within it) progresses through named states: `persisted → profiled → recognized(tier) → comprehended → classified → bound`, with `failed_interpretation` and `resolved` as first-class states. `persisted` is state zero and unconditional (DI-1). States are monotonic per unit and independent across units: one sheet's parse failure marks one unit `failed_interpretation` while fifteen proceed.

**State as signal.** State transitions are written as signals on `classification_signals` (R2), making the signal surface the canonical observation memory for comprehension: read-before-derive (T1-E906 v2) becomes a native query — recognition reads prior signal on the same fingerprint before any LLM call fires. Every comprehension attempt, success or failure, is thereby a learning signal (DI-7). Schema specifics are authored at implementation against `SCHEMA_REFERENCE_LIVE.md`; this DS commits the semantics, not column DDL.

**Session lifecycle.** An import session is a durable identity grouping its units' signals; it has no completion gate on comprehension. The session is "open" while units progress, and units in `failed_interpretation` are retryable and human-resolvable without re-ingestion. Resolution writes the correction as a signal with human provenance — the existing override mechanics (IP-011, `field_binding_outcome`) generalized to every comprehension state.

**Comprehension calls.** With recognition claiming known atoms first, LLM comprehension fires per bounded unit on novel residue only, with sheet context supplied (atoms are comprehended as members of a composition, not in isolation). Each call's response contract is small and schema-validated; a parse failure costs that unit one retry then `failed_interpretation` — never silent fallback (DI-4), never workbook-wide blast radius.

### 4.3 Signal Spine

**Vocabulary.** The signal-type vocabulary (Decision 30) extends to cover, structurally and without domain terms: atom recognition confidence, composition confidence, relational-graph confidence, tier-of-resolution (LLM / deterministic / human), comprehension session lifecycle, interpretation failure and resolution, learning-write remediation (DI-7), and interaction signal classes (generalizing DS-015's `stream_interaction` pattern from Briefings to all surfaces, including import).

**Consumers.** Four, all reading the one surface (DI-6): observability (architect/CC diagnosis becomes signal queries — the Brasa y Maíz forensics class becomes a query, not a log courier operation); adaptive UI (DS-015 CRL consumption, dormant-V1/organic-V2 promotion model unchanged); flywheel (already a consumer; now fed by comprehension states and resolutions); audit (Five Layers of Proof extended upstream — every *interpretation* traceable, the seller-transparency value proposition applied to ingestion).

**Density.** Synaptic Density modes (IP-015: full_trace / light_trace / silent) govern which signals are *read and surfaced* per context. Writes are unconditional (DI-5). Volume economics are achieved at consumption, never at learning.

### 4.4 Observer Import Experience

The import dialog is reclassified: it is a state-machine observer over unit states (the Mission Control Cycle pattern applied to ingestion), not a request handler awaiting a synchronous result. Sheets appear at `persisted`, light up through recognition and comprehension, hold visibly at `failed_interpretation` with resolution actions whose outcomes are signals. Persona and action-verb principles apply. The interpretation-failure UX converges with the action set already pending from the CRP Plan 3 arc — one surface, two triggering arcs. Per the Vertical Slice Rule, no implementing work item ships engine-side state without its observer rendering; the existing import dialogs are revised as part of this DS's execution, not as a separate UI effort.

## 5. Decision Extensions (acted by this DS; formally recorded in the work item CR)

| Decision | Extension this DS effects |
|---|---|
| Decision 77 (SCI) | Content unit defined at atom granularity; "the file is not the unit of intelligence" extended one level down to the column |
| Decision 64 v2 (Dual Intelligence) | AI-primary / deterministic-fallback / human-authority chain operates per atom, with tier-of-resolution recorded as signal |
| Decision 92 (Temporal Binding) | Atom fingerprint identity persists across periods (DI-8) |
| Decision 30 (Signal Terminology) | Vocabulary extended per §4.3; structural terms only |

## 6. Substrate Gaps (policy stated here; ICA capture candidates post-lock)

- **G-1 Signal-volume density policy at atom granularity:** resolved by DI-5 — write-everything, read-contextually; density tiers keyed to accumulated fingerprint confidence.
- **G-2 Session-state lifecycle governance:** resolved by §4.2 — durable session identity, no comprehension completion gate, named unit states, human resolution with provenance.
- **G-3 Comprehension-cost scaling policy:** resolved by DI-2 — cost proportional to novel atoms; recognition before derivation mandatory (read-before-derive as a hard precondition on LLM dispatch).

## 7. Open Sections (explicitly not locked by this DS)

- **D3 — Derived-data default at proposal time.** Derived sheets are detected and annotated (§4.1). Whether the convergence proposal defaults them out of calculation binding (reversible hint) or merely flags them is a product-behavior decision pending discussion. Double-counting risk argues for default-out; user-agency argues for flag-only.
- **Staging.** Direct-to-hierarchy (3c in one arc) versus atom-first with PREPARE shape (3b→3c). Decision belongs to execution sequencing against B3 and demo-timeline constraints.

## 8. IP Impact

This DS extends four inventoried innovations and contributes candidates for inventory update (numbering at inventory revision, not assigned here): hierarchical atom-composition fingerprinting (extends IP-013 Composite Structural Signatures); comprehension-state-as-signal on the canonical surface (extends IP-012 Classification Signals Architecture and IP-014 Prior Signal Consultation Chain); write-everything/read-contextually density invariant (extends IP-015 Synaptic Density); novelty-proportional comprehension cost as an enforced pipeline property (new; the commercial expression of the Progressive Performance moat at ingestion). Patent-attorney briefing update is a named follow-on at DS lock.

## 9. Compliance Gates

Every implementing work item carries: Korean Test gate (DI-3 verified by inspection of fingerprint construction — no name literals); EECI gate (DI-1 — no persistence-time narrowing; DIAG-050 class check); SR-39 review where signals capture user interaction (interaction signals contain behavioral data — tenant isolation per flywheel-scope privacy rules in DS-021, no cross-tenant identifiers at foundational scope); CLT browser verification of the observer experience per the CLT Registry; evidentiary completion reports per Rules 25-28.

## 10. Execution Shape

Work items are drafted separately per the directive SOP, each a vertical slice (engine + observer together), each carrying one invariant. Sequencing principles, not a locked plan: the structured-failure surface (DI-4 minimal form — comprehension failure emits a named signal and the proposal surface renders an interpretation-failure state) is execution item one, as it stops the silent-garbage-proposal bleeding independent of the larger build; recognition (§4.1) and durable state (§4.2) follow as the core arc; spine vocabulary and consumers (§4.3) land with them per DI-6; dialog revision (§4.4) rides each slice. Interplay with B3 dev/prod substrate separation is sequenced at session planning. Exit criteria reference: VIALUCE_USER_READY_EXIT_CRITERIA_R1.

## 11. Out of Scope / Residuals

Out of scope: CRP Plans 2+4; tester re-verification arc; any Tier 0 substrate amendment; VG runtime changes. Residuals carried from the IRA arc: v1.1 invocation-reference mirror and CLI-doc staleness corrections in the governance repo; four-table CR produced at this work item's close; brief_only scope-coherence invocation on this draft (carrying deferred F7) precedes lock.

---

*DS-027 — Ingestion Comprehension & Signal Spine Architecture — v0.1 DRAFT — 2026-06-10*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted under STRUCTURED AND COMPLIANT against IRA invocation ecc3824e findings and architect-locked resolutions R1/R2/R3.*
