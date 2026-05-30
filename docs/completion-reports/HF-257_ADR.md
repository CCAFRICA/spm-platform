# ARCHITECTURE DECISION RECORD — HF-257

*Enforce Single Plan-Interpretation Pipeline (AP-17)*
*Standing Rules Section B — committed BEFORE any implementation code.*

```
ARCHITECTURE DECISION RECORD — HF-257
=====================================
Problem: AP-17 ("two separate code paths for the same feature -> single pipeline") is
violated: plan interpretation runs in two functions — executeBatchedPlanInterpretation
and executePlanPipeline (per-unit case 'plan'). They perform the same process with the
same format-extraction logic. The batched path runs first and marks units handled; the
per-unit plan path is reached only on an unhandled throw from the batched path (which
returns its known failures as values, not throws), so the duplicate is nearly unreachable
but present. HF-256 left it in place (its Phase 6 retire-only-if-no-consumer conditional
preserved it).

Decision: Collapse plan interpretation to ONE path. executeBatchedPlanInterpretation is
the sole plan pipeline. The per-unit dispatch's case 'plan' is removed; executePlanPipeline
is deleted. Any plan-specific resilience that only the per-unit path provided is folded
into the batched function (Phase 3 finding); if none exists, the duplicate is removed
outright. The four non-plan switch arms (target/transaction/entity/reference) are the sole
path for their classification and are untouched.

Mandatory, not conditional: AP-17 forbids the duplicate's existence, independent of its
current reachability. No retire-only-if-unreachable gate.

CHOSEN: single batched plan pipeline; remove the per-unit plan duplicate; fold any unique
resilience into the batched path.

REJECTED — leave the duplicate in place but unreachable (the HF-256 outcome). Violates
AP-17 (duplicate exists) and SR-34 (bypass: unused != removed).

REJECTED — keep both and "document" the duplication. AP-17 requires one path, not a
documented two.

Scale: unchanged — one path, per-file as today. PASS.
Korean Test: no new format/language/domain literal introduced (removal only). PASS.
Single pipeline (AP-17): satisfied — one plan-interpretation function. PASS.
DD-7: single/multi-sheet plan imports (batched path) byte-identical; non-plan pipelines
untouched. PASS.
```

## GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)
```
G1 - Standard: AP-17 (single pipeline, CLT-63 origin). The rule this HF enforces.
G2 - Architectural Embodiment: ONE plan-interpretation function structurally guarantees a
     single pipeline — duplication cannot drift if the duplicate does not exist.
G3 - Traceability: one function (executeBatchedPlanInterpretation); the per-unit case 'plan'
     dispatch removed; auditable by zero remaining references to executePlanPipeline.
G4 - Discipline: software single-source-of-truth / DRY at the pipeline layer.
G5 - Abstraction: "one feature, one path" is domain-universal.
G6 - Innovation Boundary: removal of a duplicate; no new concept.

Relevant gates G2,G3,G4,G5 pass.
```

## RELATION TO HF-256 (my prior decision, now reversed by the architect)
HF-256 Phase 6 was written as conditional ("retire the body-transport only if no live
consumer"); I found `documentMetadata.fileBase64` set/forwarded/preferred and so PRESERVED
the duplicate. The architect's correction: AP-17 forbids the duplicate's existence
regardless of reachability — the conditional was itself the defect. HF-257 removes it
unconditionally. The body-transport FIELD (set in analyze-document, forwarded by
SCIExecution) is a separate transport-cleanup item (§6/§6A), not removed here; this HF
removes the duplicate interpretation PATH and its execute-side consumption.

## SCOPE BOUNDARY (DD-7 / SR-38)
PRESERVE byte-identical: single-sheet and multi-sheet plan imports through the batched
path; the four non-plan pipelines (target/transaction/entity/reference). REMOVE: the
per-unit `case 'plan'` dispatch + `executePlanPipeline` definition + its import. ADD: an
explicit-failure record in the batched dispatch catch (so removing the duplicate-as-safety-
net does not silently drop plan units on an unexpected throw). OUT OF SCOPE: the
`documentMetadata.fileBase64` field itself; HF-256 capability; HF-254 surface.
```
