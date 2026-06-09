ARCHITECTURE DECISION RECORD — HF-276
=====================================
Problem: Evaluator-side scaled ratio-keyed breakpoints are in ratio space
(0.8/0.9/1.0/1.3) while the OB-200 evaluator scales the ratio operand to percent
space (×100 via meta.scale). The comparison ratio×100 (110.31) vs 0.8 is trivially
true for nearly every entity → all entities enter the top (≥130%) tier → overpay.

Confirmed on rule_set a1b8684e-272a-4d95-8a97-71b39e217d08, variant `coordinador`
(the payee variant), component "Rendimiento de Ingreso":
  compositional_intent.scale = {side:"evaluator", unit:"percent", value:100}
  dim[0] breaks = [0.8, 0.9, 1.0, 1.3]   (ratio space)
  constructed outermost compare constant = 1.3 with meta.scale = 100
(The sibling variant `coordinador-senior` recognized {evaluator, ratio, value:1}
with the same ratio breaks — meta.scale 1 — which is already commensurate and must
remain unchanged.)

Option A: Pre-multiply breakpoint constants by scale.value in constructTree  [CHOSEN]
  - Scale test: Yes — any tenant, any evaluator-side ratio-keyed band
  - AI-first: Yes — consumes the LLM's declared scale metadata
  - Korean Test: Yes — structural scale.side + ratio-key check; the multiplier is
    the recognizer's own scale.value, no developer-stated constant
  - DD-7: Yes — only evaluator-side + ratio keys affected; scale.value === 1 (the
    coordinador-senior / ratio-unit case) is a ×1 no-op; convergence-side
    (HF-274) untouched
  - Symmetric with HF-274's convergence-side fix (which keeps the percent-space
    breakpoint and scales the ratio UP; here the breakpoint is in ratio space and
    is scaled UP to meet the already-scaled ratio)
  - Chosen

Option B: Remove the evaluator-side scaling (don't multiply ratio ×100)
  - Rejected: would break other evaluator-side consumers (non-ratio keys,
    boundary matching) that depend on the scaling

Residual (BCL double-scale risk, §6A): the pre-multiplication assumes the
evaluator-side breakpoint is in RATIO space (needs ×scale.value to reach the
scaled space). If a tenant's evaluator-side ratio-keyed band instead emits
breakpoints ALREADY in percent space (e.g. 85) with value 100, the pre-multiply
would double-scale them (85 → 8500). Observed convention in the current Meridian
recognition: evaluator-side bands emit ratio-space breaks (coordinador +
coordinador-senior both 0.8–1.3); convergence-side bands emit percent-space breaks
(c1: 85–98). Under that convention the fix is safe. BCL has no rule_set at HF-276
authoring time (not yet re-imported), so it cannot be verified live; the
verification script demonstrates the double-scale behaviour on a synthetic
percent-break evaluator-ratio band so the pattern is detectable, and BCL must be
re-checked against the EPG-2 trace pattern at its first post-import calc.
