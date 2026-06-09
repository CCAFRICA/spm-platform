ARCHITECTURE DECISION RECORD — HF-277
=====================================
Problem: Evaluator-side DAG-computed ratios carry meta.scale from the recognizer's
declaration. The recognizer inconsistently pairs scale.value=100 with ratio-space
breaks on some variants (Meridian Coordinador c0) and scale.value=1 on others
(Meridian Senior c0). Construction-time pre-multiplication is unsafe (HF-276 proved
it — fixed Meridian, regressed BCL c1; reverted PR #464). Proofread-style assertions
enumerate failure shapes (registry / AUD-009).

Insight: A DAG-computed ratio (arithmetic divide of two raw references) defines its
own space. Both operands are data values; the quotient is a 0–N ratio. Breakpoints
declared against this ratio are (by the recognizer's intent) in that same ratio
space. There is nothing to scale. Scale is meaningful only when a single pre-computed
column needs reconciliation — but that column appears as a `reference`, not an
`arithmetic divide`, in the DAG.

Option A: Omit meta.scale when evaluator-side + DAG divide   [CHOSEN]
  - Korean Test: Yes — structural (scale.side + ratio operand type); no magnitude
    heuristic, no break-space detection, no proofread assertion
  - Single code path: same buildConstantWithScale, one conditional flip
  - Meridian fixed: Coordinador c0 ratio compared raw against raw breaks
  - DD-7: scale.value=1 bands (Senior c0) — omitting a ×1 no-op meta is identical
  - Mirror of HF-274: convergence-side breaks ARE percent-space and the bound ratio
    is scaled UP to meet them (attach meta); evaluator-side DAG ratios are already
    in break space (omit meta)

Option B: Pre-multiply breakpoints (HF-276) — REJECTED, proven unsafe (regressed BCL).
Option C: Proofread on break/scale commensurateness — REJECTED, enumerates a failure
  shape (registry pattern).

KNOWN PRECONDITION / safety gate (Phase 3 Test 2): HF-277 is correct iff evaluator-
side DAG-ratio breakpoints are declared in RATIO space. If a band instead declares
PERCENT-space breaks (e.g. 85) for a DAG-ratio with scale.value=100, omitting the
meta would compare a 0–1 ratio against 85 and floor it — the MIRROR of HF-276's
failure. Meridian c0 (both variants) uses ratio-space breaks (verified prior:
[0.8,0.9,1.0,1.3]). BCL c1 (Depósitos) is evaluator+ratio (it was affected by HF-276)
but its break-space has NOT been read (rule_set wiped during the current re-import).
Phase 3 Test 2 MUST confirm BCL c1's OLD===NEW (DD-7) against its real persisted
intent before merge. Implementation is safe to stage; the merge is gated on that test.
