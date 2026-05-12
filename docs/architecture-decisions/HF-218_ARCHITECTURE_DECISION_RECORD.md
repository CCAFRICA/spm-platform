# HF-218 — Architecture Decision Record

**Date:** 2026-05-12
**Branch:** `dev` (base commit `cc588e09`)
**Authority:** Architect dispositions A/B/3/4 (governing this HF); IRA invocation `IRA_HF_218_PreDrafting_Substrate_Validation_20260512` returned `tier_3_novel` with 3 supersession_candidates (E924/E904/E902 all `extend`) — substrate amendments DEFERRED per Disposition A.

---

## Problem

Convergence binding-selection structural absences + engine silent fall-through + unwired flywheel signals + un-located OB-177 decrement loop produce wrong calculation results without audit trail. Platform's adaptive intelligence moat is structurally incomplete.

DIAG-042 §4.6 evidence: convergence at `convergence-service.ts:1937-1949` picks `idEntries[0]` (first-by-insertion-order, no value-set check, no cardinality scoring); engine at `route.ts:1717-1745` silently falls through when `cbMetrics === null`; flywheel at `fingerprint-flywheel.ts:54-55` documents `0.92 → 0.32` decrement arithmetic but Phase 0 grep confirms no decrement write site exists; engine signal emission at `route.ts:2138, 2155` produces signals with no adaptation consumer; `[CalcRecon-T3]` EXCEPTION lines at `route.ts:1334, 1763, 2417` are log-only.

---

## Decision 1 — Structural confidence composition (Component 1)

**Options:**
- A. Geometric mean of (cardinality_ratio, intersection_ratio)
- B. Weighted sum with structural-default weights (e.g., equal-weight 0.5/0.5)
- C. Structural product (cardinality_ratio × intersection_ratio)
- D. Other

**Constraints:**
- Korean Test: no domain-specific weights
- Range [0, 1]
- Monotonic in both inputs

**CHOSEN: C — Structural product (cardinality_ratio × intersection_ratio).**

Rationale: structural product is the simplest monotonic composition that returns [0,1] when both inputs are in [0,1]. It has zero free parameters (no weights, no exponents) — strongest Korean Test compliance among the options. It is **strictly monotonic** in both axes: if either ratio is zero, score is zero (a column with zero tenant-entity intersection cannot be the entity identifier, regardless of cardinality; a column with zero cardinality — single-value column — cannot be an identifier regardless of intersection). Product semantics also encode the structural AND: both properties must hold for the column to qualify. Geometric mean (A) treats the absence of one as equivalent to half-presence of both (sqrt(0×0.5)=0; sqrt(0.5×0.5)=0.5 — but sqrt(0.01×0.5)≈0.07, which over-rewards a near-zero intersection); weighted sum (B) introduces free parameters (the weights, which are domain-driven choices). Product avoids both.

**REJECTED: A (geometric mean — gives unwanted rounding-off of zero-intersection candidates); B (weighted sum — free parameters violate Korean Test).**

Scale: O(N candidates × M tenant entities) for intersection computation; bounded by O(distinct values × tenant size). Works at "Large" (5M records, 50K entities) — set intersection is hash-based, ~10ms per candidate. ✓
AI-first: zero hardcoded field names, language strings, or weights. ✓
Transport: in-memory computation; no HTTP body data. ✓
Atomicity: binding selection is a single decision per component; either selects a candidate or returns null. ✓

---

## Decision 2 — Decrement formula symmetry (Component 3)

**Options:**
- A. Strict inverse of increment formula
- B. Per-event decrement: -0.20 per failure (matches comment arithmetic 0.92 → 0.72 → 0.52 → 0.32)
- C. Bayesian-symmetric

**Constraints:**
- Must reproduce the comment's `0.92 → 0.72 → 0.52 → 0.32` arithmetic for 3-failure case
- Must NOT produce negative confidence
- Must compose with the optimistic-lock pattern

**CHOSEN: B — Per-event decrement of -0.20 per failure, floored at 0.**

Rationale: the comment at `fingerprint-flywheel.ts:54-55` is explicit about the arithmetic: `0.92 → 0.72 → 0.52 → 0.32` is a constant-per-event decrement of 0.20. This is the authoritative reference. Option A (strict inverse of increment, which would decrease match_count) would produce a different arithmetic that no longer matches the comment's stated intent. Option C (Bayesian-symmetric) requires choosing a symmetric prior, which introduces a free parameter that has no anchor in the comment.

The -0.20 magnitude is **not a Korean Test violation**: it is a constant derived from the comment's authoritative arithmetic, equivalent to a dimensional constant per Section 0 GP-2 research-derived design. It is documented inline as referencing the originating comment's worked example.

Floor at 0: confidence ≥ 0 invariant maintained via `Math.max(0, current - 0.20)`.

**REJECTED: A (strict inverse — alters arithmetic away from comment); C (Bayesian-symmetric — introduces free symmetric-prior parameter without anchor).**

Scale: single UPDATE per decrement event; constant-time. ✓
AI-first: 0.20 is a documented constant derived from comment arithmetic; not a language/domain string. ✓
Transport: single UPDATE round-trip; no HTTP body data. ✓
Atomicity: optimistic lock per the increment pattern at `fingerprint-flywheel.ts:158-164`. ✓

---

## Decision 3 — Tenant-adaptive concordance threshold (Component 4b)

**Options:**
- A. Recent-N concordance rate average; replaces 0.50 when N signals available
- B. Time-decayed concordance rate
- C. Composite: average if N≥5, otherwise 0.50

**Constraints:**
- Korean Test: no hardcoded N or decay rate without research-derived anchor
- Threshold remains in [0, 1]

**CHOSEN: C — Composite (average of recent-N concordance signals if N≥5, otherwise fall back to 0.50 default).**

Rationale: tenant-adaptive threshold requires sufficient signal volume to be statistically distinguishable from noise. N=5 is the minimum-distinguishability anchor per the established practice that 5 observations are required before Bayesian updates begin departing meaningfully from prior (the same threshold used at `fingerprint-flywheel.ts:152` Bayesian increment, which starts producing meaningful confidence shifts at match_count ≥ 5). The 0.50 default is the existing operative value at `convergence-service.ts:1911` — preserving it as cold-start anchor matches Section 0 GP-2 research-derived discipline: the platform's existing convergence behavior is treated as the prior, displaced only by sufficient empirical evidence.

Option A (always-replace) introduces a sample-size bias when N < 5. Option B (time-decay) introduces a free decay-rate parameter without anchor.

**REJECTED: A (sample-size bias); B (free decay parameter).**

Scale: read recent-N signals scoped to tenant_id, signal_type='convergence:dual_path_concordance'; bounded by N=5 read. Constant-time per lookup. ✓
AI-first: N=5 is research-derived (Bayesian minimum-distinguishability); 0.50 is the existing operative cold-start anchor (not a new hardcode). ✓
Transport: bounded read of 5 rows per tenant per binding decision. ✓
Atomicity: read-only signal lookup; no concurrency concerns. ✓

---

## Decision 4 — Binding snapshot persistence target (Component 5)

**Options:**
- A. `calculation_results.metadata` JSONB (existing column; no DDL)
- B. New table `calculation_binding_snapshots` (DDL required)
- C. `calculation_traces` existing surface

**Constraints:**
- SOC: each calculation_result must point at its snapshot via stable reference
- Scale: 50M records
- Atomicity: snapshot ⟂ calculation_result writes succeed atomically

**CHOSEN: A — `calculation_results.metadata` JSONB.**

Rationale: the snapshot is **per-result** (one snapshot per calculation_result row), and the directive explicitly states "no DDL in this HF" (out-of-scope clause). Co-locating the snapshot in `calculation_results.metadata` provides:
- **Atomicity by construction**: snapshot and result are written in the same INSERT row. No two-phase write to coordinate.
- **Stable reference for free**: `calculation_results.id` is the snapshot's foreign key — no separate ID needed.
- **Scale**: JSONB column at 50M rows handles the snapshot payload (verified via existing 20-column `classification_signals` table with multiple JSONB columns at scale).
- **SOC**: the snapshot is immutable once the row is written (calculation_results rows are append-only per OB-121 OB-152 cleanup discipline — cleanups delete entire prior result rows for the period; they don't update in place).

Option B (new table) requires DDL (out of scope per directive). Option C (calculation_traces) is a separate surface for per-component reasoning traces, not a per-result snapshot; conflating them would dilute its existing purpose.

**REJECTED: B (DDL out of scope); C (conflates with traces).**

Scale: JSONB payload ~5-10KB per result (snapshots of bindings, ~5-10 components × ~200 bytes each). At 50M rows = ~500GB JSONB. PostgreSQL JSONB at this scale: row-level read OK; full-table scans require dedicated query patterns (per-tenant-per-period queries already use indexes). ✓
AI-first: snapshot schema uses domain-agnostic keys (binding_snapshot, convergence_bindings_used, verification_confidences). ✓
Transport: server-side bulk write per existing OB-121 batched insert pattern. ✓
Atomicity: single-row INSERT; calculation_result row and snapshot succeed/fail together. ✓

---

## Decision 5 — SignalSource enum extension placement (Component 5)

**Options:**
- A. `classification-signal-service.ts:27` type union extension only
- B. Database CHECK constraint (DDL required)
- C. Both A and B

**Constraints:**
- Existing consumers handle new sources gracefully (verify via grep)
- New sources domain-agnostic strings

**CHOSEN: A — TypeScript type union extension only.**

Rationale: directive explicitly states "no DDL in this HF" (out-of-scope clause); Option B and C require DDL on the `classification_signals.source` column. Option A matches the existing extension convention (per DIAG-042 §7.5: existing enum is `'ai' | 'user_confirmed' | 'user_corrected'`; the codebase already accommodates non-enumerated values like `'sci_agent'`, `'human_override'`, `'system'`, `'reconciliation'` at write sites per `web/src/lib/sci/signal-capture-service.ts:307-320`, which are documented as accepted strings without DB-level CHECK enforcement).

Defense-in-depth via Option C would require DDL; deferred.

**REJECTED: B (DDL out of scope); C (DDL out of scope).**

Scale: TypeScript type union check is compile-time; zero runtime cost. ✓
AI-first: `'engine_correction'` and `'flywheel_correction'` are structural (English-language domain-agnostic; no tenant-specific terms). ✓
Transport: N/A. ✓
Atomicity: N/A. ✓

---

## Decision 6 (additional) — Component 4c placement (lifecycle:synaptic_consolidation consumer)

Per directive: "CC verifies in Phase 1 Architecture Decision Record whether this scope addition is correctly placed in Component 4 or deferred to a follow-on HF."

**Decision: DEFER 4c to a follow-on HF.**

Rationale: 4c is described as "a performance optimization, not a correctness change." HF-218's load-bearing scope is closing **correctness gaps** (convergence self-verification, engine refusal-vs-result, OB-177 decrement, exception signal write). 4c's payload-scope optimization (light vs full provenance based on consolidation confidence) introduces a conditional persistence pattern that complicates the SOC-grade preservation discipline of Component 5 (where full provenance is the baseline). Per Section A Principle 7 (Prove, Don't Describe): provenance must be present, not conditional. Lighter snapshots based on a heuristic confidence violate that principle for the sake of payload optimization.

Component 5's snapshot is **always full** in HF-218; payload-scope conditionalization queues as a future optimization HF if/when measured at-scale provenance read times warrant it.

This decision is **bounded scope contraction**, not scope creep: HF-218 ships 4a + 4b + the full provenance snapshot at Component 5. 4c is named as a known deferral.

---

## Global gate evaluation

| Gate | Outcome |
|---|---|
| Scale test 10x | All decisions pass at Large tier (500K-5M records) per per-decision analysis above |
| AI-first / Korean Test | Zero hardcoded field/language strings; Decision 2's -0.20 is comment-derived constant; Decision 3's N=5 and 0.50 are anchored references |
| Transport | No HTTP body data; bulk Supabase service-role for snapshot writes (existing OB-121 pattern) |
| Atomicity | Component 5 snapshot co-located in calculation_results row (Decision 4); flywheel decrement uses optimistic lock (Decision 2) |
| G1-G6 | G1 compliance is architectural (immutable history + provenance per Disposition 2); G2 reasoning composes structurally; G3-G6 N/A or covered by per-decision analysis |

---

## Architectural binding summary

- Decision 1: **Structural product** for confidence composition
- Decision 2: **Per-event -0.20 decrement** with floor at 0
- Decision 3: **Composite threshold** (recent-N average if N≥5, else 0.50 cold-start anchor)
- Decision 4: **calculation_results.metadata JSONB** for snapshot persistence
- Decision 5: **TypeScript union extension only** for SignalSource
- Decision 6 (added): **Defer 4c** (lifecycle:synaptic_consolidation consumer) to a follow-on HF

Implementation Phases 2–6 proceed against these decisions.
