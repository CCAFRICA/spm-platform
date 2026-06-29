# OB-253 — Architecture Decision Record (Phases 2–4)

**Committed BEFORE implementation code (Standing Rules Section B).** Branch `ob-253-thalamus-substrate` @ `df792fc0`.
Grounded in the Phase-1 true-state map (`OB-253_TRUE_STATE_MAP.md`) + the architect HALT dispositions (`OB-253_HALT_DISPOSITION_20260628.md`). Naming: new re-founding code uses the **Thalamus** vocabulary (DS-031 §11 — the name changes as the architecture is re-founded); existing `prism`/`remediation` identifiers are NOT renamed (§6 out-of-scope).

---

## Problem
Re-found the Thalamus layer onto the predictive-coding architecture: (P2) close the loop via a logical co-present read surface; (P3) make remediation joint recognition across four facets, not a sequential pipeline; (P4) precision-weight surfacing for trust. Phase 1 proved comprehension-before-commit and the fingerprint read-path are already live — so the net-new architecture is the **read adapter**, the **joint-recognition facet framework** (re-founding the Normalizer), and **precision-weighting**.

## Decision 1 — The read adapter (HALT-1)

**Option A — Physically unify the 3 tables.** Rejected by architect (touches calc/G9, migration, large).
**Option B — Logical read adapter (CHOSEN, architect-approved).** A new read-only module `web/src/lib/thalamus/signal-surface.ts` exposing `readCoPresentSurface(sb, params)` that composes `structural_fingerprints` (sheet+atom), `classification_signals` (per-value assessments incl. remediation), and `synaptic_density` (calc-keyed accumulated learning) into ONE `CoPresentSurface` object.
- **Read-only.** Zero writes. Zero calc-engine changes (G9 untouched — it keeps its own `loadDensity`).
- **No new table** (G7 honored logically: one canonical *logical* surface composed from the structurally-decomposed physical tables).
- **Bridges key-spaces (HALT-2):** fingerprint-keyed (`fingerprint_hash`) + value/field-keyed (`classification_signals`) + calc-pattern-keyed (`synaptic_density.signature`) all returned together; no key-space is forced into another.
- **Korean-Test clean (G8):** scoping is by tenant + structural hash + `signal_type` + field name passed by the caller; the adapter contains no domain/language literal and no field-name heuristic.
- Scale (SR-2): bounded by tenant + explicit hash/type/field filters + limit; no full-table scans.

## Decision 2 — Consolidation write-back (Phase 2 §3A.3)
Fingerprint write-back is live (`writeFingerprint`/`writeAtoms`). `synaptic_density` write-back exists only on the calc path (key-space = calc pattern signature). Per HALT-2, density stays calc-keyed and is NOT written from ingestion. **Decision:** Phase 2 verifies the live fingerprint write-back end-to-end and documents the density write-back as calc-domain (architect disposition: do not re-key). The "consolidation that closes the loop" at ingestion IS the fingerprint match_count/confidence increment (already live) — verified, not rebuilt.

## Decision 3 — Joint-recognition facet framework (Phase 3)

**Option A — Add reconcile/dedup/anomaly as 3 more sequential agents** in the existing `runRemediationStage` loop. Rejected — that is the sequential pipeline DS-031 §2.3 says destroys joint information (each decides blind to the others).
**Option B — Joint recognition on the surface (CHOSEN).** A new orchestrator `web/src/lib/thalamus/joint-recognition.ts` that runs the four **facets** (normalization, reconciliation, deduplication, anomaly) in the negotiation-protocol shape:
1. **Deterministic round (Decision 158 below the boundary):** each facet `assess()` produces a structural assessment for each surprising value (prediction error from the fingerprint read-path) — pattern/distribution/cardinality heuristics + recall against the co-present surface (the adapter). Each posts its assessment to `classification_signals` with a facet-specific `signal_type` (`remediation:reconciliation` / `:deduplication` / `:anomaly`, alongside the existing `:normalization`). All assessments are co-present (same surface, readable by all facets via the adapter).
2. **Joint read + re-assess:** each facet re-reads ALL facets' assessments (via the adapter) and re-scores — "the absence of a competing signal is itself a signal" (a facet gains conviction when no other facet claims the value). Converge when assessments stabilize or a single facet owns the value.
3. **Apex (Decision 158 at the boundary):** ONLY the residue no facet can resolve deterministically (genuine novelty) escalates to ONE bounded LLM expression that sees all four co-present assessments and returns a single resolution. Iterative-joint (architect Q1): the apex itself can iterate assess→consolidate→re-recognize, not one monolithic prompt.
4. **Consolidate:** the resolution writes back to the surface so the same pattern is predicted (free) next time.

**The Normalizer is re-founded, not deleted (3B.2):** its existing `RemediationAgent` (`createNormalizer`) becomes the **normalization facet** — `identify`/`construct` stay; its deterministic structural grouping is the facet's first-pass; its `propose` LLM call becomes the apex expression invoked only on residue. The new facets implement the same `RemediationAgent` contract (the framework is already agent-opaque) + a new `assess()` seam for the joint round. Existing sequential `runRemediationConstruct` (the deterministic committed_data gate) is preserved for the construct/apply step; the JOINT layer sits at propose/assess time.

**Facets are structural (G8), domain-agnostic (Principle 8):** normalization = variant surface forms of one value; reconciliation = unit/format alignment (structural shape divergence); deduplication = identity collision (value-overlap/cardinality); anomaly = genuine outlier (distribution distance). None reference domain vocabulary.

## Decision 4 — Precision-weighting (Phase 4)
`web/src/lib/thalamus/precision-weighting.ts`: deterministic `consequence(signal)` (structural: feeds-a-calc-component? field-historically-corrected? affects-entity-resolution? high-density-tenant? — all from structural position, NO registry) × `exposure(signal)` (from `synaptic_density.total_executions` + `structural_fingerprints.match_count` + recency, read via the adapter — bridging the key-space per HALT-2). The override is DETERMINISTIC (Decision 158): `consequence HIGH ∧ exposure THIN → override execution_mode toward surfacing`. The calibration is a **learning surface** (architect Q2): initial conservative structural threshold; operator confirm/correct feeds back (`classification_signals` with a feedback `signal_type`) so the threshold converges — NOT a hardcoded constant. The override is consumed by `getExecutionMode`'s caller path so a would-be-`silent` value surfaces.

## Decision 5 — Wire `/data/page.tsx` live (HALT-3)
Replace the hardcoded mock in `web/src/app/data/page.tsx` with live reads (a new `GET /api/data/overview` route, `prism_enabled`-gated, service-role) composing the co-present surface (recent `classification_signals`, `structural_fingerprints` flywheel state, `processing_jobs` history) + Phase 4's precision-weighted trust-flagged items with an acknowledgment write-back. NOT a new surface (route/nav/gate already exist — Vertical Slice Rule completes it).

## Governing Principles Evaluation (Decisions 123/124)
- **G1 (standards):** SOC2 (audit/provenance native to every signal), GAAP-adjacent reconcilability (G9 untouched), free-energy/predictive-coding (the architecture's research basis, DS-031 §0).
- **G2 (architecture embodies compliance):** the read adapter IS G7 (one logical surface); the deterministic facets + bounded apex ARE Decision 158; precision-weighting IS the trust safeguard (structural, auditable).
- **G3 (traceability):** every facet assessment + apex resolution writes a `classification_signals` row with `decision_source` + `confidence` + provenance → auditable from the surface.
- **G4 (discipline):** predictive coding / free-energy minimization (DS-031), not "data-cleaning best practice."
- **G5 (domain-agnostic):** facets are structural; the same code serves ICM/Financial/Distribution (Principle 8).
- **G6 (no speculative mechanism):** reuses the proven SCI negotiation protocol shape + the existing RemediationAgent contract + the live fingerprint flywheel.

## Anti-Pattern Registry check
AP-25 (read existing code first): done — remediation framework, signal writer, fingerprint flywheel read first-hand. AP-8/AP-13/FP-49: no new SQL/schema (read adapter is read-only over existing live-verified tables). AP-26 (no closed registry): facet `signal_type`s are open-vocabulary strings; precision-weighting validates structural properties, never set membership. Decision 158: LLM only at apex, deterministic everywhere else.

## HALT posture
Build proceeds on the three dispositioned HALTs. New HALT-DIVERGE/HALT-SURFACE/HALT-158 conditions, if encountered, stop and report (anti-narrowing binding). G9 is a hard boundary — zero calc-engine evaluation-path edits.
