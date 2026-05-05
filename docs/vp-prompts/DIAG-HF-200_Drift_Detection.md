# DIAG-HF-200 — Drift Detection: HF-190 + HF-199 + OB-177 Surface State (CC PROMPT)

**Type:** Read-only diagnostic. No code changes. No commits beyond completion report.
**Purpose:** Determine whether HF-199 introduced Adjacent-Arm Drift relative to HF-190's locked closure, whether HF-190 is intact at construction layer, and whether OB-177 bridge filter aligns with HF-199's projection.
**Predecessor:** HF-190 PR #337 (LOCKED 2026-04-05); HF-199 PR #362 (merged 2026-05-04).
**Branch:** `diag-hf-200-drift-detection` from `main` HEAD.
**Final step:** Diagnostic synthesis at `docs/diagnostics/DIAG-HF-200_Drift_Detection.md`; commit; push (PR optional, architect dispositions).

## Three drift hypotheses

- **H1 — HF-190 regressed.** OB-196 / HF-194 / HF-196 / HF-198 work overwrote HF-190's metadata spread.
- **H2 — HF-199 missed construction layer.** HF-190 intact; HF-199 wrote temporal_attributes at adjacent surface only; metadata not populated for re-imports.
- **H3 — Bridge filter excludes HF-199 entries.** HF-199 wrote temporal_attributes correctly; OB-177 bridge `effective_from <= asOfDate` filter excludes entries written with `effective_from='2026-05-04'` against period `end_date='2025-01-31'`.

Hypotheses are not mutually exclusive — multiple may hold.

## Phases

- **0 — Setup + Branch.** Verify HF-190/197B/198/199 in main; create diag branch.
- **α — H1 test.** Read `processEntityUnit` (HF-190 site); verify metadata spread at new-entity + existing-entity sites.
- **β — H2 test.** Read `resolveEntitiesFromCommittedData` (HF-199 site); identify whether metadata is co-written.
- **γ — H3 test.** Read calc/run OB-177 bridge; identify `asOfDate` + `effective_from` filter conditions.
- **δ — Empirical Meridian state.** Sample 10 entities; sample 1 period; sample period_entity_state.
- **ε — committed_data field_identities.** Confirm HF-199 had attribute-marked field_identities to consume.
- **ζ — Synthesis.** Author `docs/diagnostics/DIAG-HF-200_Drift_Detection.md` with verdicts + closure shape.

## Closure-shape disposition guide

- **Shape A** (H1 negative, H2 confirmed, H3 negative): mirror HF-190 metadata co-write at HF-199 site.
- **Shape B** (H1 negative, H2 confirmed, H3 confirmed): mirror HF-190 + fix `effective_from` alignment.
- **Shape C** (H1 confirmed): restore HF-190 first.

Architect dispositions Shape; CC drafts HF-200 directive against operative shape.

## Out of scope

- HF-200 directive drafting (architect dispositions Shape first)
- Fixing any surface (read-only diagnostic)
- D2 convergence binding gap (separate)
- Hub entity attribute projection (12 of 79; reference-typed; separate)

## Source

Architect-issued directive 2026-05-04 (this session). Synthesized report at
`docs/diagnostics/DIAG-HF-200_Drift_Detection.md` (verdicts + evidence + closure shape recommendation).
