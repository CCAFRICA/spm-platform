# HF-260 — Import Hang + Dropped Signal Writes: HF-259 Parallel Phase B Regression
# Repo: CCAFRICA/spm-platform (VP)
# Date: 2026-06-01
# Sequence: HF-260 (of-record; HF-258 merged #446, HF-259 merged #447)
# File path (this directive): docs/vp-prompts/HF-260_PARALLEL_PHASEB_REGRESSION_DIRECTIVE_20260601.md
# SSOT reference: docs/code-references/SCI_INGESTION_PLAN_EXECUTION_TRACE_LIVE_dede922b.md (AUD-0015)

---

## §0 — CC Standing Rules
Read CC_STANDING_ARCHITECTURE_RULES.md and COMPLETION_REPORT_ENFORCEMENT.md before starting.
In force: ADR before code (Architecture Decision Gate, Section B); commit+push per phase; final-build
sequence (kill dev → rm -rf .next → npm run build → npm run dev → confirm localhost:3000) before the
completion report; git from repo root; `gh pr create --base main --head dev` final. **EVIDENTIARY
GATES: every proof gate verifies LIVE/RENDERED/RUNNING state — pasted logs, terminal, or DB query —
never file existence, code review, or self-attestation (AP-9/AP-10).** zsh: single-quote grep patterns.

This file IS the prompt (DD-11): no execution block, no paste block, no tail. It ends at §6A.

---

## §1 — Problem & Scope

### 1.1 — Regression: introduced by the recent HF chain, confirmed by timing
An import now HANGS (the UI never completes; the user must refresh the browser to escape), and flywheel
signal writes are FAILING (`CanonicalWriteError ... TypeError: fetch failed` on `classification:outcome`).
**This worked before this session's HF chain.** The controlling fact is temporal: HF-258 (#446) and
HF-259 (#447) merged tonight; the hang and the write failures appear immediately after. Whatever the
precise line, the regression was introduced by that change set. This HF fixes it.

### 1.2 — Observed evidence (live, 2026-06-01, BCL tenant b1c2d3e4-...)
- The data import (`BCL_Datos_Oct2025.xlsx`) analyzed to completion server-side (`[SCI-PROPOSAL] 1 content
  units` at 03:57:14) — so analysis terminates; the symptom is the operation as a whole not settling /
  the UI not advancing.
- `CanonicalWriteError (insert_failed): ... classification:outcome ... TypeError: fetch failed` — fired
  multiple times (03:57:00 x2, and in earlier runs tonight). `fetch failed` is a CONNECTION-LEVEL failure
  reaching Supabase, not a logic/schema error.
- The plan import in the SAME session ran clean and parallel (HF-259 working: one rule_set, Phase B
  components concurrent at 03:52:09, 35.6s). So HF-259's parallelization is live and functioning on the
  plan path — the regression is in how that concurrency interacts with the rest of the import.

### 1.3 — Prime suspect (to CONFIRM in the ADR, not assumed) and the mechanism
**HF-259 introduced bounded-concurrency Phase B** — component construction changed from sequential
(one model call at a time) to parallel (a promise pool). Sequential→parallel is the new variable, and
it maps to the symptom three ways:
1. **Connection contention →** the `fetch failed` writes. Parallel execution opens multiple concurrent
   connections to Supabase where there was one at a time. Connection-pool exhaustion or write contention
   under concurrency produces exactly `TypeError: fetch failed` on writes that previously succeeded
   serially. (CAVEAT: `CanonicalWriteError` also appeared in a run earlier tonight — so parallelization
   may have WORSENED a pre-existing intermittent write failure into a reliable one by adding concurrency,
   rather than introducing it outright. The ADR confirms which; either way the fix is the same class.)
2. **Unsettled promise →** the hang. If a concurrent unit rejects (or a `fetch failed` throws) on a path
   that is not awaited/caught so the overall import promise resolves, the operation never settles → the
   UI spins until refresh. This is the **AP-14 violation**: partial state left on failure instead of
   atomic completion-or-cleanup.
3. **Stuck single-flight claim →** the documented HF-259 residual. The `plan_interpretation_runs` row goes
   `in_progress` → `completed`; if a concurrent failure prevents the completion handler from running, the
   claim never flips (stuck `in_progress`), blocking re-import of that exact content — and is itself a
   non-settling/partial-state symptom.

### 1.4 — What "fix" means here (the class, not the instance)
Restore the import path to terminate deterministically and record its signal writes, under the new
parallel Phase B, at scale. Three coupled corrections (confirm each applies in the ADR):
1. **Bound/scope the concurrency's resource use** so parallel component construction does not exhaust or
   race the Supabase connection (parallelism is a CONFIG knob per the scale principle — a concurrency
   limit and/or serialized writes within the parallel region, NOT a re-architecture).
2. **Guarantee settlement (AP-14 atomicity):** every concurrent unit's outcome is awaited and its failure
   caught so the overall import promise ALWAYS settles (success or clean failure) — never hangs. A failed
   unit produces a reported error, not an abandoned promise.
3. **Guarantee claim resolution:** the single-flight claim (`plan_interpretation_runs`) flips to
   `completed` OR `failed` on every exit path — including when a concurrent unit fails — so no claim is
   left stuck `in_progress`. (This is the HF-259 "thin async envelope" residual, now load-bearing.)
And the dropped signal write itself: the `classification:outcome` write must succeed under concurrency
(via #1) OR fail without aborting/handing the import (it is a flywheel signal, not import-critical) —
but a silently-swallowed recurring write failure is not acceptable; it must be handled, not ignored.

### 1.5 — This is a regression fix against a known window
The regression window is HF-258 + HF-259 (merged tonight). The ADR confirms the cause is in that change
set (prime suspect: HF-259 parallelization). No standalone DIAG — the enumeration phase IS the
confirmation, and the ADR HALTs (§4) if the read shows the cause is NOT the recent change.

---

## §2 — Substrate-Bound Discipline
- **AP-14 (atomicity / no partial state on failure):** the core invariant. The parallel region must
  complete-or-clean-up; the import promise must settle on every path; the claim must never be abandoned.
- **Scale by design (parallelism is configuration, not re-architecture):** the concurrency fix is a limit
  / serialized-write correction within the existing pool — NOT a redesign of Phase B. Must still hold at
  the 10x case (thousands of tenants, concurrent imports).
- **DD-7 (preserve the proven):** HF-259's parallel Phase B already produces correct, byte-identical
  component outputs (the clean plan run proves it). The fix must NOT regress that — it bounds the resource
  use and guarantees settlement, leaving per-component construction logic and the parallel result intact.
  The duplicate-run fix (one rule_set), the content channel (HF-258), the moat, and the calc handoff are
  PRESERVED.
- **AP-16 (no refresh-to-escape):** the user-facing symptom; resolved as a consequence of settlement (#2)
  — the operation completing means the UI advances. (A dedicated progress/job-status surface, AP-15, is a
  separate concern — see §6.)
- **EVIDENTIARY GATES (AP-9/AP-10):** every proof gate pastes LIVE evidence — a completing import log, a
  settled promise, a `completed` claim row, signal writes succeeding — never "code looks right."
- Any locked-rule conflict → SR-42 (surface verbatim, name the action, HALT).

---

## §3 — Phases

### §3.1 — Phase 1: ADR (Architecture Decision Gate — confirm cause BEFORE any edit)
Using AUD-0015 as the map and reading live HEAD + the HF-258/259 diffs, CC produces an ADR
(docs/completion-reports/) that CONFIRMS or REDIRECTS the §1.3 suspect against actual code:
- **The parallel Phase B implementation** (the promise pool HF-259 added at the orchestrator): paste it.
  Confirm: does a concurrent unit's rejection propagate so the overall promise can hang? Is there an
  unbounded fan-out, or a limit? Where do per-unit failures go?
- **The connection/write path under concurrency:** where `classification:outcome` (and other writes in
  the parallel region) hit Supabase. Confirm whether parallel execution multiplies concurrent connections
  / contends a pool / shares a client in a way that yields `fetch failed`.
- **The completion + claim path:** where the import promise settles and where the `plan_interpretation_runs`
  claim flips to `completed`/`failed`. Confirm whether a concurrent-unit failure bypasses these (the
  unsettled-promise + stuck-claim mechanism).
- **Which import path the DATA/transaction import takes** vs the plan path — confirm whether the data
  import shares the parallelized orchestrator/region or is a distinct path (determines whether the hang is
  the same parallel region or an adjacent one).
- **The fix design** for §1.4's three corrections, instantiated against the live code: the concurrency
  bound/serialization point; the settlement (await-all + catch) point; the claim-resolution-on-every-exit
  point.
**If the read shows the cause is NOT in the HF-258/259 change set (e.g. the hang predates it, or the
`fetch failed` is an unrelated infra issue) → HALT (§4), report the ADR, do not implement.** This replaces
a standalone DIAG: the ADR is the confirmation gate.

### §3.2 — Phase 2: Enumeration (DD-1/DD-2 — every affected site, before editing)
Enumerate and paste (live HEAD; cite AUD-0015 / the HF-259 diff):
- The parallel pool site(s) in the orchestrator (HF-259).
- Every write inside the parallel region (esp. the `CanonicalWriter` `classification:outcome` call) and
  the Supabase client/connection each uses.
- The import-promise settlement site (where the overall operation resolves to the caller/UI).
- The claim claim/complete/fail sites (`plan-idempotency` / `plan-interpretation`).
No edits. Output: the complete affected-site inventory.

### §3.3 — Phase 3: Implement the three coupled corrections
Per the ADR:
1. Bound/scope concurrency resource use (limit and/or serialize the contended writes within the pool).
2. Await-all + catch so the import promise ALWAYS settles; a failed unit → reported error, not a hang.
3. Claim flips to `completed`/`failed` on EVERY exit path (success, partial failure, throw).
4. The `classification:outcome` write either succeeds under the bounded concurrency or fails non-fatally
   and handled (not silently swallowed) — it must not abort or hang the import.
Commit + push.

### §3.4 — Phase 4: Verification (the settlement + write gates — LIVE evidence)
Paste evidence (logs + browser + DB) on the BCL tenant:
- **Settlement (the headline):** the data import (`BCL_Datos_Oct2025.xlsx`) that previously hung now
  COMPLETES end-to-end — the UI advances WITHOUT a refresh, and the log shows a terminal `Complete:` /
  settled response. Paste the completing log tail.
- **No dropped writes:** the `classification:outcome` write succeeds (no `CanonicalWriteError`), OR if it
  fails it is handled and the import still completes — paste the relevant log (the warning is gone or
  explicitly handled, not silently recurring).
- **Claim resolved:** query `plan_interpretation_runs` — the run row is `completed` (or `failed`), not
  stuck `in_progress`. Paste the query result.
- **DD-7 / parallel intact:** the plan import still runs parallel, one rule_set, components byte-identical
  (the HF-259 behavior preserved) — paste the plan-run log showing concurrent Phase B + single rule_set.
- **Re-import unblocked:** the same content can be re-imported (no stuck-claim block) — paste.

### §3.5 — Phase 5: Final build + PR
Final-build sequence (§0), confirm localhost:3000, `gh pr create --base main --head dev`. Completion
report FIRST (Rule 25), LIVE evidence pasted, before the final build is appended.

---

## §4 — HALT Conditions
- **HALT-1 (cause not in the window):** the ADR read shows the hang/`fetch failed` is NOT introduced or
  worsened by HF-258/259 (predates it, or is an unrelated infra/connection issue) → report the ADR, HALT.
  Do not implement a fix against the wrong cause.
- **HALT-2 (DD-7 risk):** the concurrency bound/settlement fix cannot be done without regressing HF-259's
  correct parallel result (byte-identical components, one rule_set) → HALT and report.
- **HALT-3 (schema):** if claim-resolution requires a schema change beyond what migration
  20260531000000_hf259 created → FP-49 (paste live schema), report, HALT before authoring SQL.
- **HALT-4 (SR-42):** any locked rule appears to dictate an out-of-scope change → surface verbatim, name
  the action, HALT.

---

## §5 — Reporting Discipline
Completion report (docs/completion-reports/), report-first, LIVE evidence pasted:
HEAD SHA → ADR (confirmed cause + instantiated fix) → enumeration inventory → the three-correction diff
(pasted) → Phase-4 verification (completing import log; signal write succeeding/handled; claim row
`completed`; plan-run parallel + one rule_set preserved; re-import unblocked) → final build → PR link.
CC reports observed values verbatim; no reconciliation interpretation.

---

## §6 — Out of Scope
- **HF-258 / HF-259 behavior that is correct** — the content channel, the one-rule_set dedup, the parallel
  result — PRESERVED, not re-touched (only the resource-use/settlement/claim-resolution defects fixed).
- **A dedicated progress / job-status UI (AP-15):** surfacing import progress to the user is a separate
  experience concern; this HF makes the operation SETTLE, not adds a progress bar.
- **The full async-queue form of Q4** (HF-259 §6) — out of scope; this is the "thin envelope" settlement
  correction, not the queue.
- **Calc-execution internals** (AUD-005); **VG substrate work.**

## §6A — Residuals
- **Stuck-claim TTL reclaim:** even with claim-resolution-on-every-exit, an out-of-band process crash
  (between claim and any handler) could still strand an `in_progress` row. A TTL/age-based reclaim is the
  durable backstop (the HF-259 "thin async envelope" residual). If Phase 3 fully covers in-process exits,
  the TTL is the remaining edge — record; a small follow-on.
- **CanonicalWriter resilience (broader):** if the ADR shows `fetch failed` is a general write-path
  fragility (retry/backoff absent) beyond this parallel region, that hardening is a separate item — record.
- **AUD-0015 refresh:** after this merges, regenerate the trace to a new SHA (the orchestrator parallel
  region + completion path change here).
