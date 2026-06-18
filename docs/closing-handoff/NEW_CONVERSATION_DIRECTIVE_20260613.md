# NEW CONVERSATION DIRECTIVE — 2026-06-13 close → next session

**Paste this block at the top of the next conversation, with `SESSION_HANDOFF_20260613.md` appended below it.**

---

## PRE-READ SEQUENCE (fresh-agent ordering, per Correction 19)

Read in this order before any work:

1. **Strategic frame** — `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md` (or current critical-path/strategic reference in project knowledge) — what we are building and where User-Ready stands.
2. **Handoff Section -1** — this session's strategic frame and the TWO binding constraints (Meridian convergence regression; DS-028 experience layer).
3. **Handoff Section 0** — five critical facts.
4. **Handoff Section 19** — next-session start script.
5. **Handoff Section 20** — path detail.
6. **`HANDOFF_TEMPLATE_CORRECTIONS.md` (+ patches: correction 5, corrections 8–18, correction 19)** — interrupt-driven discipline reference. Read at action time, not as pre-action ritual. (Mandatory pointer per Correction 3.)
7. **Provenance** — this close produced NO separate Closing Report; the session's provenance (the BCL PASS, the Meridian regression capture, the defect-class analysis) lives in Handoff Sections 4, 5, and 12. Read those on demand for reasoning-arc reconstruction.

Standing project references remain authoritative and are consulted at drafting time, not pre-read: `CC_STANDING_ARCHITECTURE_RULES.md`, `SCHEMA_REFERENCE_LIVE.md`, `INF_Structured_Compliant_Drafting_Reference_20260513.md`, the CLT Findings Registry R7 + addenda.

---

## TURN 1 — Orientation confirmation (Claude)

State back, grounded in Handoff Section -1 sub-sections 3 and 4:

- **Milestone:** User-Ready (first external user completes import → calculate → see results through the browser, no log access).
- **Binding constraint (A), correctness:** Meridian — a previously-CLOSED proof tenant ($185,063/$175,585/$196,337) — now aborts at convergence after the OB-203/HF-285 merge (HF-281 refuses an incomplete binding set; `Utilización de Flota [coordinador]` missing `cargas_totales_hub`; HF-222 rejected the n=9 coordinador-population binding). This is a REGRESSION. Root cause is NOT established.
- **Binding constraint (B), experience:** DS-028 — the platform cannot show the user that an import/plan/calculation succeeded without server-log access (the completion screen showed "0 Records Imported / Components: —" for a successful 10-component plan).
- **Engine status:** BCL re-proved anchor exact ($312,033) on production post-merge — the calculation engine itself is NOT in question.
- **Governing discipline:** the Meridian abort is diagnosed (DIAG), never rationalized as "the engine getting more correct"; no convergence code change until root cause is proven (Handoff D1/R1/R2). Every deliverable is authored as a repo MD file, never inline (Handoff D2).

Architect confirms or corrects. If you cannot ground this orientation in Section -1, the handoff failed Correction 19 verification — say so.

---

## TURN 2 — Verification (zero-command default, per Corrections 2/5)

The handoff body is the source of truth (main HEAD `1400fb9e`, PR #487 merge `63573051`). Default verification is ONE verbal confirmation, no git command:

> "Any manual state changes to git, Supabase, Vercel, or external credentials since 2026-06-13 close? Specifically: were any open PRs (#486/#421/#413/#394/#379) merged, and were any of the five flagged unknown tenants deleted? If none, proceed."

A single git command (`cd ~/spm-platform && git log origin/main --oneline -3`) is run ONLY if the architect wants merge-state confirmation; it carries its own branch (if merge `63573051` is not the most recent relevant merge, reconcile the delta before proceeding). Do not run ceremonial `git status` / `git checkout` / `ls` / `pull` (Correction 5).

---

## TURN 3 — Path selection (architect directs)

Forward paths (Handoff Section 20):

- **Path A — Meridian Regression DIAG** (recommended; correctness-binding). Establish the OB-203/HF-285 cause of the convergence abort. DIAG ships no code; read the HF-222/HF-281/convergence implementation and the original `cac8c391`-era closure record, and `conversation_search` the original closure (Correction 18), BEFORE asserting cause. Max 3 rounds (Rule 24).
- **Path B — HF-286 polling fix, re-authored as a file** (immediate; live production defect). The inline version from the prior session is VOID — re-author as a repo MD file with explicit BEGIN/END CC PASTE boundaries.
- **Path C — DS-028 experience-layer design spec** (recommended parallel; experience-binding). Three prioritized deliverables: completion screen reflects operation type → post-import data surfacing → operational feedback / stop polling. Design Gate: deliver the spec, recommend a separate implementation conversation.
- **Parallel housekeeping:** merge/close PRs #486/#421/#413/#394/#379; architect review of five unknown tenants for deletion.

Default if the architect gives no command (Correction 5 zero-command default): present the Section 20 path detail and the recommendation (A as correctness-critical, C as experience-critical, B as the immediate tactical fix), then wait for selection. Do NOT begin drafting any deliverable until a path is selected — and when drafting begins, run CRF + PCD first and author to a repo file, not inline.

---

*Pairs with `SESSION_HANDOFF_20260613.md`. Commit both to `docs/handoff-reports/`.*
*vialuce.ai · Intelligence. Acceleration. Performance.*
