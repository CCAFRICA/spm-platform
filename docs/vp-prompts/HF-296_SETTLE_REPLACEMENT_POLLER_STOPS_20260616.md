# HF-296: Execute-Phase Settle Replacement + Poller Terminal Stops + Performance Benchmark

**Date:** 2026-06-16
**Category:** HF (Hotfix) — ULTRACODE campaign, diagnostic-informed
**Predecessor:** DIAG-069 (settle-scope, H5 CONFIRMED), HF-295 Part 2 (file-scoped settle — shipped, dispatch works but stalls ~5 min per file via polling). OB-203 D19/D20 (known defects, never fixed).
**Blocks:** MIR 15-file data import. Current state: 3 of 17 files commit before Vercel 300s timeout kills the function. Per-file actual work is ~2 seconds; stall is ~298 seconds. The settle mechanism polls to re-confirm what the HTTP response already returned.
**Drafting reference:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

---

## §0 — DISCIPLINE

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules apply.
2. **Three distinct pollers exist.** This HF addresses ALL THREE, not just the settle. Fixing one while leaving the others running is the adjacent-arm pattern (SR-34).
3. **Benchmark before and after.** The completion report must contain measurable before/after evidence, not a claim that "it's faster."
4. **No over-correction.** The analyze-phase pollers (HF-286 already fixed SCIProposal.tsx, ImportTelemetryPanel.tsx) are NOT touched. Only execute-phase polling.

---

## §1 — ULTRACODE ORCHESTRATION

**Fan-out (paid once, before any build).** Five disjoint reads producing one merged STATE MAP:

- **T1 — The settle mechanism.** `settleFromSurface` in `SCIExecution.tsx`. Read the full function. Identify: what it polls, how often, its terminal condition, how it interacts with `executeBulk`, and what data the HTTP response already returns that makes the poll redundant. Paste the code.
- **T2 — The `[import] /` route poller.** Find the client-side caller that polls the import list/status route (the `[import] / status=200` noise). File, function, interval, terminal condition (or absence of one). Was HF-289's fix (import-list poller terminal-stop, drafted June 14) ever implemented? `git log --all --oneline | grep -i "289\|import.*poller\|import.*terminal"`. Paste findings.
- **T3 — The telemetry poller (`telemetry=1`).** The session-state variant with `telemetry=1` query param. HF-290 added `hasActiveUnits` for volume reduction. Does it have a terminal stop for the execute phase? Paste the code.
- **T4 — The HTTP response contract.** What does `execute-bulk/route.ts` return? The `SCIExecutionResult` shape — does it contain per-unit success/failure, row counts, everything the settle currently re-derives from polling? Paste the response construction.
- **T5 — Baseline benchmark capture.** From the most recent MIR import logs (June 16), extract and record:
  - Per-file actual work time (Download → Commit complete)
  - Per-file stall time (Commit complete → next file's Download)
  - Total session-state poll count during the execute phase
  - Total `[import] /` poll count during the execute phase
  - Total wall-clock for the import attempt
  - Whether `getUser() failed or timed out` appeared (auth starvation signal)

  Record these as the BASELINE in the completion report.

**Keystone (sequential, first).** The settle-mechanism replacement (§2) — this is the structural change everything else depends on.

**Parallel after keystone.** Two file-disjoint streams:
- **Stream A — `[import] /` poller terminal stop** (§3A). Separate file from the settle mechanism.
- **Stream B — telemetry poller terminal stop** (§3B). Separate file from both.

**Surfaced collision.** All three changes affect the import session lifecycle. The terminal-state signal that stops each poller must be consistent — if the settle mechanism now trusts the HTTP response, the pollers must also recognize that terminal state, not check a different source. State the terminal-state contract in the ADR.

**One batched sweep.** §4 proof gate runs once — the full 15-file MIR import, measured against the baseline.

**CC's formation deliverable:** state the orchestration plan as the ADR's first commit, then execute.

---

## §2 — THE SETTLE MECHANISM REPLACEMENT (keystone)

The current settle: after `executeBulk` POSTs a file group to the server, it enters `settleFromSurface()` which polls `/api/import/sci/session-state` at ~2s intervals, waiting for polled state to show all units terminal. If the poll doesn't converge within STALL_MS (90s), it re-POSTs the same file (up to MAX_EXECUTE_ATTEMPTS=3). Each non-final file burns ~3×90s = 4–5 minutes of stall before the loop advances.

The HTTP response from `execute-bulk` already contains `SCIExecutionResult` with per-unit `ContentUnitResult` — success/failure, row counts, error details. The settle polls to re-confirm what this response already said.

**The fix:** when `executeBulk` receives a successful HTTP response with per-unit results, it trusts that response and returns the `FileDispatchOutcome` immediately. The dispatch loop advances to the next file. No `settleFromSurface` call. No polling. No stall.

`settleFromSurface` is retained ONLY as a recovery path for genuinely lost connections (where the HTTP response never arrived — the `AbortError` / timeout case). It is not the primary mechanism. The primary mechanism is: POST → receive response → advance.

**Requirements:**
- On HTTP 200 with results: parse `SCIExecutionResult`, map to `FileDispatchOutcome`, return immediately. Zero polling.
- On HTTP error (4xx/5xx): mark file failed with the error, return immediately. Zero polling.
- On timeout/abort (DOMException): THEN fall to `settleFromSurface` as recovery — poll to check whether the server completed despite the lost connection. This is the only case where polling is justified.
- `MAX_EXECUTE_ATTEMPTS` retry semantics: if the POST itself fails (network error, not server error), retry the POST up to MAX_EXECUTE_ATTEMPTS. Do NOT retry on a successful response that contains per-unit failures — those are legitimate failures, not retryable.

---

## §3A — `[import] /` POLLER TERMINAL STOP

The `[import] / status=200` noise is a separate `setInterval` or polling hook on the import page that refreshes the import list/status. It runs continuously with no terminal stop.

CC identifies this poller in the fan-out (T2). The fix:
- Add a terminal-stop condition: when all content units in the current import session are in a terminal state (complete or error), clear the interval. Same pattern HF-286 applied to the analyze-phase pollers.
- If the poller is in a component that unmounts on navigation away from the import page, the unmount cleanup is already there — but the poller must ALSO stop when the import completes while the user is still on the page.
- Verify whether HF-289's original draft (June 14, `hf/289-import-list-poller-terminal-stop` branch) was ever merged. If yes, determine why it isn't working. If no, implement it now.

---

## §3B — TELEMETRY POLLER TERMINAL STOP

The `session-state?telemetry=1` poller runs during the execute phase. HF-290 added `hasActiveUnits` to reduce its frequency, but it may lack a hard terminal stop for the execute phase.

CC identifies this poller in the fan-out (T3). The fix:
- Add a terminal-stop condition for the execute phase: when the dispatch loop has completed (all files dispatched, all settled or failed), the telemetry poller stops.
- The stop signal must come from the dispatch completion, not from a separate poll. When the dispatch loop exits (all files processed), it sets a flag that the telemetry poller reads and clears its interval.

---

## §4 — PROOF GATE

### 4.1 — Benchmark comparison (the hard evidence)

CC runs the MIR 15-file import (excluding the GT file) and captures the same metrics from §1/T5:

| Metric | Baseline (from T5) | After fix | Pass criterion |
|---|---|---|---|
| Per-file actual work time | ~2s | ~2s | Unchanged (no regression) |
| Per-file stall time | ~298s | <5s | Stall eliminated |
| Total session-state polls (execute phase) | [T5 count] | <15 (one per file at most for recovery check) | >90% reduction |
| Total `[import] /` polls (execute phase) | [T5 count] | 0 after terminal | Zero post-terminal |
| Total wall-clock | >300s (Vercel timeout) | <120s for 15 files | Completes within Vercel ceiling |
| Auth timeout (`getUser() timed out`) | Present | Absent | Resource starvation resolved |
| Files committed | 3 of 17 (before timeout) | All 15 data files | 100% |

### 4.2 — Browser verification (architect, SR-44)

- [ ] All 15 data files dispatch and commit. UI shows each file reaching terminal state.
- [ ] No indefinite spinner. Failed files (if any) show the HF-295 Part 2 failure surface in Spanish.
- [ ] Session-state polling stops after all files terminal: zero `session-state` lines in server log 30 seconds after completion.
- [ ] `[import] /` polling stops after terminal: zero `[import] / status=200` lines 30 seconds after completion.
- [ ] `committed_data` row count verified via tsx-script matches sum of committed files.
- [ ] Vercel function log shows no `Runtime Timeout Error`.
- [ ] Progressive Performance: fingerprint confidence values increment (matchCount increases for recognized structures).

### 4.3 — Regression

- [ ] Single-file import unchanged in behavior and timing.
- [ ] Analyze-phase pollers (HF-286) still function — the analyze poll stops at proposal, unaffected.
- [ ] BCL anchor not disturbed (no engine change in this HF).

---

## §4A — RESIDUALS / OUT OF SCOPE

- **Log-level suppression of 200-status lines.** Once polling terminates correctly, the volume drops to near-zero. If residual noise remains from the analyze phase or page-load polls, that's a logging-hygiene item, not this HF.
- **GT file auto-exclusion.** Not selecting `MIR_Resultados_Esperados.xlsx` in the import batch. Architect responsibility, not a code change.
- **DS-029 completion screen.** Already shipped in a parallel session. Not in scope.
- **Engine invariants, disputes, screen fixes.** Next steps on the MIR critical path, gated on successful import. Not in scope.

---

## §5 — COMPLETION REPORT TEMPLATE

The completion report at `docs/completion-reports/HF-296_COMPLETION_REPORT.md` must contain:

### Section 1 — ADR (Orchestration Plan)
The ULTRACODE campaign plan: fan-out targets, keystone, parallel streams, surfaced collision, terminal-state contract.

### Section 2 — Baseline Benchmark
Pasted metrics from T5 (before fix). Source: Vercel production logs from the June 16 16:44–16:56 import attempt.

### Section 3 — Code Changes
For each of the three changes (settle replacement, `[import] /` stop, telemetry stop):
- File path and pasted diff
- Which poller it addresses
- The terminal-state condition added/changed

### Section 4 — Post-Fix Benchmark
Same metrics as Section 2, captured from the post-fix MIR import run. Side-by-side comparison table.

### Section 5 — Proof Gate Evidence
- Pasted server log showing all 15 files' `Downloading from Storage` + `Complete` entries
- Pasted server log showing zero polls 30s after terminal
- Pasted tsx-script output confirming `committed_data` row count
- Build exit-0 evidence
- Regression: single-file import timing unchanged

### Section 6 — Scope Fence
What was NOT changed: analyze-phase pollers, server routes, engine, schema, other tenants.

---

## §6 — CC PASTE BLOCK

```
HF-296 — Execute-Phase Settle Replacement + Poller Terminal Stops + Performance Benchmark. ULTRACODE.

THREE THINGS TO FIX, ALL IN THE EXECUTE-PHASE IMPORT LIFECYCLE:
1. The settle mechanism (settleFromSurface) — replace poll-based settle with HTTP-response-based settle. When executeBulk POST returns 200 with SCIExecutionResult, trust the response and advance immediately. settleFromSurface retained ONLY as recovery for genuinely lost connections (AbortError/timeout). This is the keystone — build first.
2. The [import] / route poller — find it, add terminal stop (clear interval when all units terminal). Check whether HF-289's June 14 branch (hf/289-import-list-poller-terminal-stop) ever merged; if yes, find why it isn't working; if no, implement it.
3. The telemetry poller (session-state?telemetry=1) — add terminal stop for execute phase; dispatch loop completion sets a flag that clears the interval.

ULTRACODE CAMPAIGN — form the plan first:
- FAN-OUT (5 disjoint reads → merged STATE MAP): T1 settleFromSurface code; T2 [import] / poller + HF-289 branch status; T3 telemetry poller; T4 execute-bulk HTTP response contract; T5 baseline benchmark from June 16 16:44-16:56 Vercel logs (extract per-file work time, stall time, poll counts, wall-clock, auth timeout occurrence).
- KEYSTONE: settle mechanism replacement (§2). Build and confirm first.
- PARALLEL: Stream A = [import] / terminal stop; Stream B = telemetry terminal stop. File-disjoint.
- SURFACED COLLISION: all three share the terminal-state signal — define the contract in the ADR.
- ONE SWEEP: §4 proof gate once (15-file MIR import, benchmark comparison).

BENCHMARK IS MANDATORY:
- BEFORE (baseline from logs): record per-file work time, stall time, poll counts, wall-clock, auth timeout.
- AFTER (post-fix run): same metrics. Side-by-side in the completion report. "It's faster" is NOT evidence; pasted numbers are.

CC states the orchestration plan as the ADR's first commit, then executes.

Per-file settle on HTTP response: POST → 200 with results → parse → FileDispatchOutcome → return immediately, zero polling. POST → 4xx/5xx → mark failed → return immediately. POST → timeout/abort → THEN settleFromSurface as recovery. MAX_EXECUTE_ATTEMPTS retries the POST on network error, NOT on successful-response-with-failures.

Terminal stops: clear interval when all units in current import session are terminal. Dispatch loop completion → flag → pollers read flag → clearInterval.

Do NOT touch: analyze-phase pollers (HF-286), server routes, engine, schema. Settle-scope change from HF-295 stays — this fixes the MECHANISM, not the scope.

After build: commit, push, kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000. Completion report at docs/completion-reports/HF-296_COMPLETION_REPORT.md per the template in §5 (baseline benchmark, code diffs, post-fix benchmark, proof gate evidence, scope fence). Then PR: gh pr create --base main --head [branch].

Architect runs §4 browser proof gate (SR-44) including the benchmark comparison and the 30-second-post-terminal zero-poll verification.
```

---

*HF-296 · Execute-Phase Settle Replacement + Poller Terminal Stops + Performance Benchmark · 2026-06-16*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md*
