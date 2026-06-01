# HF-260 — ADR (Architecture Decision Gate / Confirmation Gate)

**HF:** HF-260 — Import Hang + Dropped Signal Writes: HF-259 Parallel Phase B Regression
**Date:** 2026-06-01
**HEAD SHA read:** `2dcf324c28cce579eb786e759be44df8bde04bd2` (branch `dev`)
**Window under test:** HF-258 (`18e055c7`, merged #446) → HF-259 (`1bf13a84..2dcf324c`, merged #447)
**Map:** AUD-0015 (`SCI_INGESTION_PLAN_EXECUTION_TRACE_LIVE_dede922b.md`)
**Classification:** read-only ADR confirmation gate. **No code edited.**

> **VERDICT: HALT-1.** The ADR read shows the reported `classification:outcome` `fetch failed`
> is an **unrelated, pre-existing, already-handled infra/connection event** in a file the
> HF-258/259 window did not touch, and HF-259's parallel Phase B **performs no Supabase I/O**
> and is temporally separated from the failures. The §1.3 prime suspect is **REDIRECTED, not
> confirmed.** Per §3.1 / §4 HALT-1: report the ADR, do **not** implement the three corrections
> against this cause.

---

## §A — Problem (as stated)

An import HANGS (UI never advances; user must refresh — AP-16) and flywheel signal writes FAIL
(`CanonicalWriteError (insert_failed): ... classification:outcome ... TypeError: fetch failed`),
observed live 2026-06-01 on the BCL tenant immediately after HF-258 (#446) + HF-259 (#447) merged.
§1.3 prime suspect (to confirm or redirect): HF-259's bounded-concurrency parallel Phase B
introduced/worsened Supabase **connection contention** → `fetch failed` writes + an unsettled
promise → hang + a stuck single-flight claim.

---

## §B — What the live code actually shows (evidence)

### B1 — The failing write (`classification:outcome`) is NOT in the regression window
The only two emit sites of the failing signal:
- `app/api/import/sci/analyze/route.ts:642-660` (sync tabular classifier)
- `app/api/import/sci/process-job/route.ts:379` (async XLSX classifier)

Provenance and window membership (git):
- Introduced in **OB-199 (#385)** — `git log -S "classification:outcome CanonicalWriteError"` → `3b22eff2 OB-199` (the Canonical Signal Write Surface, DS-023). Long predates the window.
- `git log 18e055c7..2dcf324c -- analyze/route.ts` → **empty** (not touched in window).
- `git log 18e055c7..2dcf324c -- process-job/route.ts` → **empty** (not touched in window).
- Same query for `commit-content-unit.ts`, `flywheel-signal-emission.ts`, `canonical-signal-writer.ts`, `classification-signal-service.ts` → **0 commits each in window.**

**The entire write path that emits `classification:outcome` and the data-commit path are byte-unchanged across HF-258+HF-259.**

### B2 — The failing write is ALREADY handled non-fatally (cannot hang the import)
`analyze/route.ts:633-666`:
```ts
try {
  for (const unit of proposal.contentUnits) {
    ...
    writeClassificationSignal({...}, URL, SERVICE_KEY).catch((err) => {
      if (err instanceof CanonicalWriteError)
        console.warn(`[SCIAnalyze] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
      else console.warn('[SCIAnalyze] classification:outcome unexpected error:', ...);
    });
  }
} catch { /* Signal capture failure must NEVER block import */ }
return NextResponse.json(proposal);   // :666 — returns regardless of the write outcome
```
The write is **fire-and-forget with a `.catch()` that only logs**, inside an outer try/catch that
"must NEVER block import," immediately followed by `return NextResponse.json(proposal)`. This is
**already** the §1.4 desired behavior ("fail without aborting/hanging the import — handled, not
swallowed"). `TypeError: fetch failed` is the Node/undici **network-level** error (transient
unreachable Supabase / socket / DNS), i.e. a CONNECTION event, consistent with §1.2's own
characterization and with it "appearing in earlier runs tonight" (intermittent infra).

### B3 — HF-259's parallel Phase B performs ZERO Supabase I/O
`plan-orchestration.ts` HF-259 diff (the new pool) and a full grep:
- `grep -n 'supabase|\.from(|insert|update|upsert|createClient' plan-orchestration.ts` → only the worker-pool line (`:271`). **No database operations.**
- `ai-service.ts` (called by `callPlanComponentWithRetry`) → no Supabase usage.
- The pool is **bounded** (`PHASE_B_CONCURRENCY = 4`), order-preserving (shared cursor → index slots), and assembles `components[]`/`outcomes[]` in `componentIndex` order (DD-7 byte-identical).
- It parallelizes **`aiService.interpretPlanComponent` → Anthropic API calls**, not Supabase writes. The rule_set upsert + signal writes happen **after** orchestration returns, **sequentially**, in `plan-interpretation.ts`.

So the §1.3 mechanism — "parallel execution opens multiple concurrent connections **to Supabase**
where there was one at a time" — **does not apply to Phase B.** Phase B adds concurrency on the
Anthropic provider, capped at 4; it does not multiply Supabase connections at all.

### B4 — Temporal separation refutes the contention link
§1.2 observed timeline: plan Phase B parallel run **03:52:09** (35.6s, settled by ~03:52:45);
`classification:outcome` failures **03:57:00** (×2); data proposal **03:57:14**. The parallel
region had completed **~4 minutes** before the write failures. There is no concurrency overlap to
contend a pool.

### B5 — The claim path resolves on every in-process EXPLICIT exit (settlement, mostly intact)
`plan-idempotency.ts` is fully degrade-safe (every helper try/catches; `claimRun` returns
`{claimed:true}` on any non-23505 error). In `plan-interpretation.ts`, after `claimRun` succeeds:
- skeleton/no-components failure → `failRun` (`:221`)
- supersession-query failure → `failRun` (`:261`)
- upsert failure → `failRun` (`:314`)
- success → `completeRun` (`:326`)

The plan import in §1.2 **"ran clean"** — so in that run the claim DID flip to `completed` and Phase
B did not throw. There is **no observed stuck claim** in the incident.

### B6 — The data import does not traverse the parallelized region
Per AUD-0015 §2-§3: the DATA path is `analyze → execute-bulk (data units) → commitContentUnit →
post-commit emitFlywheelSignals`. The parallel Phase B lives only on the **plan** path
(`plan-orchestration.ts`, reached via `executeBatchedPlanInterpretation`). The reported hanging
import (`BCL_Datos_Oct2025.xlsx`) is a **data** import and **never enters** the parallel region.
HF-258's only `execute-bulk` change in-window is a **type-level retirement** of `fileBase64` from
plan-unit `documentMetadata` (Q5) — it does not touch the data-unit commit/write logic.

---

## §C — Governing-principle / anti-pattern read
- **GP-1 / "Prove, Don't Describe" (AP-9/AP-10):** every claim above is git/grep/live-code evidence, not assertion.
- **AP-14 (atomicity):** the asserted violation (unsettled promise from a Phase-B Supabase write) does not exist — Phase B has no Supabase writes; the `classification:outcome` write is already non-blocking.
- **DD-7:** the parallel result is byte-identical (order-preserving pool) — nothing to preserve-by-not-fixing, because there is no in-window write-path defect to fix.

---

## §D — Decision

**HALT-1 (cause not in the window).** The hang + `classification:outcome fetch failed` are **not
introduced or worsened by HF-258/259**:
1. The failing write is in `analyze.ts`/`process-job.ts` (OB-199, #385), **0 commits in window**, and is **already** fire-and-forget non-fatal.
2. `fetch failed` is a **network/connection-level** infra event (transient Supabase unreachability), not a logic/concurrency defect — and it appeared in earlier runs tonight (intermittent).
3. HF-259's parallel Phase B does **no Supabase I/O** (bounded Anthropic-only concurrency) and ran ~4 min before the failures — it cannot have contended a Supabase pool.
4. The reported hanging import is a **data** import that does not enter the parallel region.

Implementing §1.4's three "corrections" against HF-259's Phase B would be **fixing the wrong
cause** (the directive's own HALT-1 prohibition). The build is therefore **not** proceeding to
Phase 3.

### What IS real (recorded, not implemented here — outside the HALT-1 cause)
- **R1 — stuck-claim-on-throw (genuine HF-259 residual, already §6A-scoped):** there is no
  `try/finally` around the single-flight claim in `plan-interpretation.ts`; a **thrown** exception
  between `claimRun` and `completeRun`/`failRun` (e.g. an unexpected orchestration throw) would
  strand an `in_progress` row, blocking re-import of that exact plan content. All **explicit**
  in-process exits are covered (B5); only an uncaught throw is not. This is the §6A "thin async
  envelope / TTL reclaim" residual — a **small follow-on**, not the reported symptom, and not a hang.
- **R2 — CanonicalWriter write-path resilience (§6A, broader):** the durable remedy for transient
  `fetch failed` on signal writes is retry/backoff in the write surface
  (`canonical-signal-writer.ts`), independent of this window. §6A already records this as a
  separate item.
- **R3 — the actual hang mechanism (out-of-window, to be diagnosed separately):** the data import's
  non-settlement is **downstream of `analyze`** (which returned the proposal at 03:57:14), in the
  data execute path (`execute-bulk` data branch → `commitContentUnit` → post-commit) and/or the
  client `SCIExecution` wait. If the same transient `fetch failed` infra struck an **uncaught**
  Supabase write there, the route would 500 / not settle → UI spin. That path is **unmodified by
  HF-258/259**; the correct fix is write-path resilience (R2) + a client settlement/timeout review,
  scoped as its own DIAG/HF against live runtime logs — **not** an HF-259 Phase-B fix.

---

## §E — Recommendation to the architect
1. **Do not** implement the §1.4 three corrections against HF-259 Phase B (wrong cause).
2. Treat the `fetch failed` as the **infra/connection** event it is; confirm Supabase
   reachability/health at the incident window and whether a transient outage explains the
   03:57 failures (and the "earlier runs tonight" occurrences).
3. If a code follow-on is wanted, scope **R2 (CanonicalWriter retry/backoff)** and **R1 (claim
   try/finally + TTL reclaim)** as small, independent items — both already named in HF-259 §6A.
4. The real hang (**R3**) needs a separate, runtime-log-driven DIAG on the **data** execute path /
   client settlement — it is not the parallel Phase B.

*HF-260 ADR — read-only confirmation gate at `2dcf324c`. HALT-1 declared. No implementation performed.*
