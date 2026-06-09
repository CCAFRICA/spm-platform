ARCHITECTURE DECISION RECORD — HF-281
=====================================
Problem: The convergence/binding layer absorbs partial success the same way
the recognition layer did before HF-280. A component binding that failed to map
its intent-required tokens persisted as an INCOMPLETE binding, and calc ran
against it, paying flagged zeros. From the post-HF-280 Meridian cold re-import
(rule_set be74de80, convergence_version=HF-234): the senior variant group's
"Utilización de Flota" binding (component_4) carries only [period,
entity_identifier] — neither of its two intent-required tokens — while the
coordinador group's binding for the same component (component_9) carries both.
Calc fires RESOLUTION_FAILURE token="cargas_totales_hub" per senior entity and
the component pays 0; deltas match exactly (Jan -17,878, Feb -18,972).

Phase 0.5 cause determination — DB evidence (scripts/hf281-phase0-evidence.ts):
  component_4 [senior]    roles=[period, entity_identifier]                       <- MISSING both tokens (no entry at all, not even a match_pass:'failed' marker -> the SILENT ambiguous-gap path, convergence-service.ts ~2881-2886, wrote nothing)
  component_9 [coordinador] roles=[period, entity_identifier, cargas_totales_hub->Cargas_Flota_Hub[mp=1], capacidad_total_hub->Capacidad_Flota_Hub[mp=1]]  <- COMPLETE
  Both components' intents require IDENTICAL tokens: [cargas_totales_hub, capacidad_total_hub].
Therefore:
  Cause = (b) validated-partial / silent-gap mapping. The senior group's per-variant-group
    AI mapping (HF-253) did not produce columns for the two tokens; the boundary fallback
    found candidates insufficiently distinct to bind (distinctEnoughToBind=false) and took the
    SILENT path (no marker, no entry). The incomplete binding persisted; calc ran.
  NOT (a): the intent requirements are identical across both variant groups — the tokens ARE
    required for both; the senior group simply failed to map them.
  NOT (c): convergence_version=HF-234 (current) — bindings were freshly derived by calc-time
    convergence (HF-165), not reused from a stale prior generation. HF-269 Phase C already
    clears input_bindings on import.

HALT-1 cleared: no completeness gate exists at the binding phase — the incomplete binding
  persisted and calc proceeded (HF-165 convergence failure is even caught NON-BLOCKING,
  run/route.ts:307-310). HALT-2 cleared: not cause (c); the binding phase ran. So §2.3
  (binding invalidation on supersede) is NOT in scope. §2.4 retry surface is optional: the
  AI mapping call is one-shot per group with no retry loop at that seam; the completeness
  GATE is the fix.

Invariant: a component binding is complete only if it maps every token the component's intent
requires. The binding phase succeeds only if every component binding of every variant group is
complete. Any incomplete binding fails the binding phase as a whole — a structured, visible
failure naming the variant group, component, and unmapped token(s). Calc never executes against
a binding set known at bind time to be incomplete. The calc-time T3 RESOLUTION_FAILURE surface
is RETAINED as backstop (defense in depth for data-shape drift between bind and calc).

Korean Test (Decision 154): the predicate is structural —
  requiredTokens(componentIntent) ⊆ mappedTokens(componentBinding),
where requiredTokens = the intent's DAG reference fields (extractInputRequirements, already the
binding-time requirement source) and mappedTokens = binding roles with a resolved real column
(non-empty column AND match_pass !== 'failed'). No field/component/tenant literals, no
token-name patterns; names appear only as display data in the failure message.

AUD-009: one invariant (binding completeness), loud failure, no enumeration of WHY a token is
unmapped (silent-gap, failed-marker, requirements-omitted all abort identically). No registry
of drop reasons.

GOVERNING PRINCIPLES (Decisions 123 & 124)
==========================================
G1 (GP-1 transparent architectural compliance): "every required token bound or the binding
   phase fails" is a structural control over the financial artifact, readable from the gate —
   not a calc-time after-check. SR-34 third arm: HF-279 (no incoherent persists), HF-280 (no
   incomplete recognition persists), HF-281 (no unbindable calc runs).
G4 (discipline): transaction atomicity / all-or-nothing — a payout batch computed against a
   binding set known incomplete is a torn financial artifact; the fix is a commit barrier at
   the binding phase, not per-token calc-time repair.

Option A: Completeness predicate (requiredTokens ⊆ mappedTokens) + binding-phase gate that
          aborts calc atomically (no persist of an incomplete binding set, no calc against
          one), at BOTH the fresh-convergence path and the reuse/skip path.   [CHOSEN]
  - Scale: unaffected (a set-subset check over already-loaded bindings; no per-row work).
  - Korean Test: outcome/structure-only predicate; no literals, no per-cause handling.
  - Atomicity: incomplete -> nothing persists to input_bindings, calc does not run; structured
    error through the existing run-route failure channel (operator-visible).

Option B: Keep flagged-zero calc behavior as sufficient — REJECTED. A payout batch computed
  against a known-incomplete binding is a torn financial artifact; loud-but-paying-zero is the
  same plausible-wrong-totals failure HF-280 closed (Meridian shorted by exactly the senior c4
  zeros). Loud at calc is necessary but not sufficient.
Option C: Per-cause handling (treat silent-gap vs failed-marker vs requirements-omitted
  differently) — REJECTED. Registry pattern; every cause must abort identically.
Option D: Auto-repair by silently re-running only the missing mapping — REJECTED. Silent
  self-repair of a financial binding without surfacing is the same absorption pattern. A re-run
  is acceptable only as part of a visible, whole-phase retry (out of scope here; the gate makes
  the failure a dispositionable surface).
