ARCHITECTURE DECISION RECORD — HF-280
=====================================
Problem: Plan import is not atomic over components. Post-HF-279 cold
re-imports persisted BCL with a 3-component variant (Captacion absent
from ejecutivo/V1) and Meridian with 4 of 5 components in both variants.
The HF-279 coherence invariant correctly rejected incoherent component
intents through the retry budget; on exhaustion the orchestrator
recorded a failed outcome and the import persisted the partial plan.
Calc then reported resolutionFailures=[none] — the failure predates
calc. Totals were clean-looking and wrong by exactly one component.

Phase 0.5 DB evidence (import_batches.error_summary, BCL rule_set
4e5d0f1e, 2026-06-09T17:52:38Z) — the smoking gun:
  [ok  ] c2-ejecutivo-senior "Captacion de Depositos" attempts=1
  [FAIL] c2-ejecutivo        "Captacion de Depositos" attempts=3
         errClass=cognition_violation
         msg="...a ratio-source band (reference_field=
         'deposit_achievement') was emitted WITH a scale
         (side='convergence', value=100..."
  partialSuccess=true -> rule_set persisted with ejecutivo missing c2.
This confirms the mechanism and clears both HALTs: the component WAS
attempted (3 = full retry budget; not an enumeration defect -> HALT-2
cleared), the HF-279 invariant fired exactly as designed, and the
import persisted the partial plan anyway (HALT-1 cleared — the
orchestrator/caller does not abort on partial; plan-interpretation.ts
only refuses to persist when ZERO components succeed). All three
attempts produced the identical violation — the model never received
the violation message, so the retry was not a retry.

Invariant: a rule set persists only if every component of every
variant completed recognition successfully. Any component failure
after retry exhaustion aborts the import as a whole with a structured,
importer-visible failure naming the component (and its variant, as
display data) and the violated invariant. No partial variant or plan
ever persists.

Secondary: the retry loop feeds the structured violation message back
to the model on each retry so a coherent emission is reachable within
the budget. The message passes through verbatim (no interpretation —
Korean Test). Confirmed necessary: attempts=3 all returned the same
cognition_violation with no feedback.

Korean Test: predicate is recognition outcome only
(any outcome.status !== 'success' -> abort). No component/tenant/field
literals, no failure-cause enumeration; every cause aborts identically
(AUD-009 — no registry of drop reasons). The component name + variant
in the message are DISPLAY data carried verbatim from the outcome, not
predicate inputs.

GOVERNING PRINCIPLES (Decisions 123 & 124)
==========================================
G1 (GP-1 transparent architectural compliance): atomicity IS the
   control — a rule set is a financial artifact; "every component
   recognized or the import fails" is a structural assertion an auditor
   reads from the guard, not a procedural after-check. Mirrors the
   immutable-batch / supersession-blocks-upsert precedents (HF-244).
G4 (discipline): transaction atomicity / all-or-nothing — a partially
   constructed aggregate that validates structurally but is semantically
   incomplete is the classic torn-write failure; the fix is a commit
   barrier, not per-field repair.

Option A: Abort the import on ANY non-success component outcome,
          before any rule_set persistence; surface a structured
          importer-visible failure. Feed the violation back on retry.  [CHOSEN]
  - Scale: unaffected (a guard before persistence; no per-row change).
  - AI-first / Korean Test: outcome-only predicate; no literals, no
    cause enumeration.
  - Atomicity: no partial variant/plan ever persists; the existing
    failRun + structured-error-return path is reused (single code path).

Option B: Persist successful components, flag failures for later
  repair — REJECTED. A partial plan calculates plausible wrong totals;
  the two re-imports are the proof. Silent partial state IS the defect.
Option C: Per-cause handling (treat coherence violations differently
  from other recognition failures) — REJECTED. Registry pattern; every
  cause must abort identically.
Option D: Raise the retry budget without feedback — REJECTED.
  Identical prompt -> identical violation (attempts=3 proved it); not a
  retry. Feedback (2.2) is the reachability fix, atomicity (2.1) is the
  safety guarantee — both, not either.
