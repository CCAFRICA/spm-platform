ARCHITECTURE DECISION RECORD — HF-279
=====================================
Problem: Recognizer emits break-space inconsistently for ratio-keyed bands
(Meridian c1 percent breaks [85..98] + scale 100, internally coherent; BCL c1
ejecutivo ratio breaks [0.6..1.3] + the SAME scale 100, internally incoherent —
1.03x100=103 >= 1.3 -> top tier -> Oct/Nov/Dec overpay) and nothing enforces
break/scale agreement. Break-space is not recoverable downstream: not encoded
in the operand shape (both are structurally identical DAG divides), and
inferring it from magnitudes violates Decision 154 (Korean Test). HF-274
(convergence attach), HF-276 (pre-multiply, reverted PR #464), HF-277
(evaluator-side omit), HF-278 (omit-both-sides at construction) each fixed one
configuration and broke the other; HF-278's HALT-2 proved the wall from both
real persisted intents at once. The determinant — which space the breaks are
in — exists ONLY in the source plan text at recognition time.

Invariant: a DAG-divide band's breaks are declared in the quotient's own space;
therefore no scale accompanies them. Enforced at three points, shipped together:
  (1) Recognition prompt — a banded_lookup dimension whose reference_source.type
      is 'ratio' emits its breaks in the quotient's own space ("85%" -> 0.85,
      "1.3x"/"130%" -> 1.3) and emits NO scale for that band.
  (2) Recognition-output validation (plan-orchestration.ts, the HF-271
      structural-coherence seam, before persistence) — deterministic loud
      failure (StructuralCoherenceError -> cognition_violation) if a ratio-source
      band arrives paired with a scale that would bind to it. Structured
      resolution failure; never silent construction.
  (3) Construction — buildConstantWithScale omits meta.scale for any DAG-divide
      compare operand, on EITHER side (generalizes HF-277's evaluator-only rule;
      retires HF-274's convergence attach for divides).

Why together: construction-omit alone floors Meridian's current percent-break
intent (a 0-1 quotient compared against a 0.85..0.98 break that the recognizer
declared in percent space); recognition-change alone leaves HF-274 scaling any
stale or non-conforming intent. Cold re-import regenerates both tenants' intents
under the invariant so both reconcile. The stale Meridian percent-break c1 is
NOT migrated in code — it regenerates on cold re-import (part of this work item
per SR-43, not optional follow-up).

GOVERNING PRINCIPLES (Decisions 123 & 124)
==========================================
G1 Standard: GP-1 transparent architectural compliance — the coherence invariant
   ("ratio source => quotient-space breaks, no scale") is a structural property
   of the recognition output, not a procedural test. An auditor reads the
   invariant and the loud-failure guard, not the calc.
G4 Discipline: dimensional analysis / commensurateness — a comparison is only
   valid between quantities in the same space. A quotient and its breaks share
   one space by construction; a scale on that comparison is a unit error.
G5 Abstraction: SR-34 class — the invariant keys on declared structure
   (reference_source.type) and is domain/field/tenant-agnostic. It holds for any
   ratio-keyed band in any domain. BCL and Meridian are the first two instances.

Option A: Recognition coherence (quotient-space breaks, no scale) +
          loud-failure invariant + side-agnostic construction omit   [CHOSEN]
  - Scale test (10x): unaffected — recognition emission shape only; no per-row
    or transport change.
  - AI-first / Korean Test: keys on reference_source.type + scale presence/binding
    + prime/op. No field/component/tenant literals, no magnitude thresholds, no
    break-space sniffing anywhere.
  - Atomicity: violation => structured failure, component NEVER persisted; on
    retry exhaustion a `failed` outcome is recorded. No partial/silent state.
  - Registry test (AUD-009): ONE invariant, loud failure on the incoherent class
    wholesale — not an enumeration of failure shapes.

Option B: Deterministic /scale normalization at the seam — REJECTED. It destroys
  BCL: BCL's scale is the LYING member (breaks already in ratio space), so
  dividing by scale corrupts a coherent-after-omit band. Which member is
  authoritative exists only in plan text — unrecoverable at the seam.
Option C: Magnitude / commensurateness heuristics (sniff "breaks look like
  percents") — REJECTED. Decision 154 violation; the structurally identical BCL
  and Meridian divides differ only in plan-stated intent.
Option D: Construction-only rules (HF-276 pre-multiply, HF-278 omit-both) —
  REJECTED. Proven impossible: each fixes one tenant and breaks the other because
  break-space is not in the operand shape (HF-278 HALT-2, both real intents).

RECONCILIATION NOTE — construction omit predicate (change 2.3)
==============================================================
The directive's §3B illustrative snippet reads `const attach = !operandIsDagDivide`.
Taken literally that drops the scale.side guard and would ATTACH meta for a
convergence-side NON-ratio operand — where HF-244 places the scale_factor on the
binding and the engine multiplies the bound column by it (run-calculation.ts:188;
convergence-service.ts scale_factor consumption). Attaching meta there too would
DOUBLE-scale that column — a regression the directive explicitly does not intend:
its own prose binds the outcome ("meta.scale attaches only for single pre-computed
reference operands (DD-7 path unchanged)") and §6 states "single pre-computed
reference operand scale semantics — unchanged." The faithful generalization that
honors the prose and preserves all four cases is:

    attach = scale.side === 'evaluator' && !otherSideIsDagDivide

  evaluator + non-ratio (single pre-computed column)  -> ATTACH  (DD-7, KEPT)
  evaluator + ratio (DAG divide)                      -> OMIT    (HF-277, KEPT)
  convergence + non-ratio                             -> OMIT    (scale_factor
                                                                  on binding, KEPT)
  convergence + ratio (DAG divide)                    -> OMIT    (NEW; retires
                                                                  HF-274 attach)

This omits for EVERY DAG-divide operand on either side (the directive's stated
invariant) while leaving the convergence-non-ratio binding path untouched. The
reference_field guard (scale.reference_field must match the compared field) is
preserved as part of the unchanged DD-7 path.

Korean Test: keys on reference_source.type + scale presence + scale.side +
prime/op only. No field/component/tenant literals, no magnitudes, no break-space
detection. Registry test: one invariant, loud failure, no enumerated shapes.
