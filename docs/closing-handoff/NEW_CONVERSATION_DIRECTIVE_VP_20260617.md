# NEW CONVERSATION DIRECTIVE — VP Session, 2026-06-17 (or next)

**Paste this as the opening message of the next VP conversation. The VP handoff is appended below this directive.**

---

## PRE-READ SEQUENCE (Correction 19 ordering — strategy → state → action → discipline → reference)

Read in this order before Turn 1:

1. **Handoff Section -1 (Critical Path to Objective)** — what Vialuce is, why it matters, the MIR demo milestone, the binding constraint (Calculate broken), and the frame of reference for this session.
2. **Handoff Section 0** — five critical orientation facts.
3. **Handoff Section 19** — the next-session start script (Turns 1–3).
4. **Handoff Section 20** — path detail (Path A = HF-300 is the binding constraint).
5. **`HANDOFF_TEMPLATE_CORRECTIONS.md`** — discipline reference, read at action time when a discipline issue surfaces, NOT as a pre-read wall.
6. **The transcript / completion reports** — provenance, read on-demand if reasoning-arc reconstruction is needed.

Do NOT pre-read the corrections file cover-to-cover. Apply corrections when discipline issues arise in chat.

---

## TURN 1 — ORIENTATION

State your orientation grounded in Section -1 sub-sections 3 and 4. Required form:

> "Milestone: MIR demo — Almacenes Mirasol, 5 plans, ~75k rows, calculated end-to-end and reconciled against locked ground truth in Spanish. Binding constraint: the Calculate page is broken on the MIR tenant — it shows 1 of 5 plans with 0 entities assigned. Root cause is confirmed (DIAG-071): tenant-scoped supersession archived 4 of 5 plans, and assignment creation fails in the new `waitUntil` background. The fix is HF-300, drafted and ready to run. This session's frame: does each action make MIR calculate all 5 plans and reconcile, or is it local optimization? If local optimization, defer."

Architect confirms or corrects. Do not proceed until oriented.

---

## TURN 2 — VERIFICATION (minimum-viable, Corrections 2 & 5)

- **Andrew runs locally:** `git log origin/main --oneline -3` — confirm `897009b2` (the PR #530 import fix) is main HEAD as the handoff describes. Paste output.
- **Verbal:** "Any manual changes to git, Supabase, Vercel, or credentials since 2026-06-16 close? If none, proceed."

That is the entire Turn 2. No `git status`, no `ls`, no `git pull`, no double-checks. The handoff body is the source of truth.

---

## TURN 3 — EXECUTE HF-300 (the binding constraint)

1. **Architect pastes** `HF-300_SUPERSESSION_ASSIGNMENT_FIX_20260616.md` to CC.
2. **CC** verifies HF-300 is unused in `docs/vp-prompts/` and `docs/completion-reports/` (300 is a fresh forward number chosen to move past the corrupted 295–297 range from the prior session; confirm it is free before committing), then fixes:
   - **C1:** plan-identity supersession in `plan-interpretation.ts:363-368` — supersede by content_hash/name, not tenant-wide; idempotent (reimport 5 plans → 5 active).
   - **C3:** assignment reliability — post-commit assignment work must not die in the `waitUntil` background on Vercel; CC verifies whether `waitUntil` runs in this runtime, then chooses fresh-client-in-background / deferred-single-post-import-step / calc-time-self-heal. Must NOT reintroduce the 300s import timeout (PR #530's win).
   - Reconcile the 553 stranded assignments on archived plan `c3574b89`.
3. **CC** commits the mandatory completion report to `docs/completion-reports/` BEFORE `gh pr create`.
4. **Architect (SR-44):** confirm the production deployment SHA contains the HF-300 commit (Vercel → vialuce-prod → Deployments → Production → Source). Then run the proof gate:
   - DB: exactly 5 active rule_sets for the MIR tenant (not 1, not 10).
   - DB: non-zero assignments on the active plans.
   - Browser: Calculate page shows 5 plans, each with its entity count.
   - Reimport the 5 plans again → still 5 active (idempotent).
   - Reimport the 15 data files → still fast, no timeout.
   - Calculate January 2025 → returns results, not "Failed to fetch."
   - Regression: BCL/Meridian/CRP single-plan tenants still calculate.

---

## AFTER HF-300 (do not start until Calculate works)

- **Path B:** regenerate `SCHEMA_REFERENCE_LIVE.md` (stale since 2026-03-18) — fold in alongside HF-300 since it reads schema.
- **Path C:** calculate MIR January 2025 across all 5 plans; CC reports values verbatim; architect reconciles against `MIR_Resultados_Esperados.xlsx` (reconciliation is architect-channel — CC never compares). Watch for the multi-plan materialization question (does `entity_period_outcomes` hold all 5 plans, or does delete-then-insert wipe prior plans?) and Plan 1's base+accelerator split (ground truth reconciles their SUM).
- **Path D (DEFERRED until C lands):** execute-phase polling noise (one change, two files: `SCIExecution.tsx` + `ImportTelemetryPanel.tsx` — must not START during execute); per-file 15× post-commit redundancy; `[TRACE-*]` log removal; numbering-ledger reconciliation.

---

## OPERATING DISCIPLINE FOR THIS SESSION (carried from 2026-06-16 defect analysis)

These are the failure patterns that cost the prior session hours. The architect should not have to re-flag them:

1. **Instrument and query before prescribing.** Do not theorize from logs. The prior session burned three fixes on an unverified assumption (per-file work ~2s; it was ~25s server-side). Trace/DB evidence is the circuit breaker.
2. **Verify the production deployment SHA before judging any fix's behavior.** A green PR check is the preview build, not production. The prior session nearly chased a phantom because behavior didn't change after merge — the cause was the wrong layer, surfaced only after confirming the deploy.
3. **Never fabricate a sequence number.** Read the live repo directory (`docs/vp-prompts/`, `docs/completion-reports/`, `docs/diagnostics/`) before assigning any HF/DIAG number. The prior session fabricated numbers in chat repeatedly; none must reach a committed artifact.
4. **The drafter does the synthesis; CC does the code reads/edits.** Do not hand CC an open investigation when the drafter has whole-arc context. Prescribe the precise, code-justified fix.
5. **Broken-stable-code is not missing-functionality.** If a path worked for weeks and now fails, find what broke it — do not propose building new features. (The Calculate regression was initially mis-framed this way.)
6. **Do not propose ending the conversation or handing off without critical evidence that it is warranted.** Solve in place.
7. **Every CRF+PCD gate is presented WITH evidence** (searches run, artifacts read, DB/schema verified) before drafting code, SQL, or CC prompts.
8. **Every directive presents the file for download via the artifact mechanism** — do not just describe it.

---

*Append the VP handoff (`VP_SESSION_HANDOFF_20260616.md`) below this line.*
