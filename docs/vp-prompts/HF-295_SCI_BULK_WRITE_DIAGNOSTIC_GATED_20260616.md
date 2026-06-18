# HF-295: SCI Bulk Import Write-Phase Silent Failure — Diagnostic-Gated Fix

**Date:** 2026-06-16
**Category:** HF (Hotfix) — ULTRACODE, diagnostic-gated
**Mode:** Part 1 is READ-ONLY diagnostic. Part 2 build is GATED on Part 1 output. CC does NOT write fix code until the trace proves the failure point.
**Symptom:** Multi-file SCI import (17 content units) commits 2, then halts. UI shows remaining units with no terminal state, no actionable affordance. Server logs show exactly ONE file group processed to completion ("Complete: 521 rows"), no subsequent file-group dispatch. Session-state polling continues indefinitely.
**Drafting reference:** `INF_Structured_Compliant_Drafting_Reference_20260513.md`

---

## §0 — DISCIPLINE (READ FIRST)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all standing rules apply.
2. **Rule 19 / Rule 21 / Rule 24:** Read the implementation. Do NOT theorize from logs. Every claim in the diagnostic output is backed by pasted live code, not inference. The architect's prior assessment (client-side `fetchWithTimeout` abort) is an UNCONFIRMED HYPOTHESIS — treat it as one candidate among several, not a conclusion to confirm. Disprove it or prove it with code.
3. **No fix code in Part 1.** Part 1 emits a diagnostic report only. If CC writes a single line of fix code before the §1 gate, that is an SOP violation.
4. **AUD-001 code extraction is dated 2026-03-21 and is STALE.** It is NOT authority. The live files on `main` are the only authority. Significant drift since HF-142/HF-157 is expected.

**Hypotheses to adjudicate (do not assume any is correct):**
- **H1 — Client-side timeout abort.** `fetchWithTimeout` aborts the bulk call before the server response is read; the catch block marks remaining units error and exits the file-group loop.
- **H2 — Server-side throw mid-loop.** A content unit throws inside the `execute-bulk` server loop; the loop's error handling returns partial results or 500s, halting the client iteration.
- **H3 — File-group iteration defect.** The client groups by `sourceFile`; if grouping collapses 16 files into one group (or mis-resolves storage paths), only one group dispatches.
- **H4 — Terminal-state / polling defect.** The execution completes or errors but the UI never receives a terminal signal; HF-286's polling fix does not cover this path. (The continued polling in logs is a direct symptom.)
- **H5 — Await/concurrency defect.** The file-group loop does not `await` each group correctly, or a promise rejection is swallowed, so iteration silently stops after the first.

---

## PART 1 — READ-ONLY DIAGNOSTIC

CC executes each probe, pastes the FULL output (code, not summary), and answers the adjudication question. No code changes.

### Probe 1 — Locate the execute orchestration (client)

```bash
cd /path/to/spm-platform
# Find the hook/component that orchestrates execution
grep -rn "execute-bulk\|executeBulkFileGroup\|fileGroups\|executeUnits" web/src --include='*.ts' --include='*.tsx' -l
```

Then `view` the file that contains `executeUnits` (the orchestrator). Paste:
- The full `executeUnits` function.
- The full function that dispatches per file group (the `for (const [sourceFile, groupUnits] ...)` loop).
- The catch block(s) for that loop.

### Probe 2 — The timeout wrapper (adjudicates H1)

```bash
grep -rn "fetchWithTimeout\|AbortController\|setTimeout.*abort\|maxDuration" web/src --include='*.ts' --include='*.tsx'
```

Paste the `fetchWithTimeout` definition in full, including the timeout constant. State the exact timeout value in milliseconds. Compare it against the observed server duration (the Clientes_Nuevos group took 24.9s; the Ventas/Cobranza files are larger). **Answer: would a file group of 8,000 rows plausibly exceed this timeout?**

### Probe 3 — The server bulk loop (adjudicates H2, H5)

`view` `web/src/app/api/import/sci/execute-bulk/route.ts`. Paste:
- The main `for` loop over content units.
- The try/catch inside that loop.
- The final response construction (`overallSuccess`, results array).
- The `maxDuration` export at top of file.

**Answer: if one content unit throws, does the loop continue to the next, or does the whole request fail? Does the server process MULTIPLE files per request, or ONE file group per request?**

### Probe 4 — File-group resolution (adjudicates H3)

In the client orchestrator, paste the code that builds `fileGroups` (the `Map<string, ExecutionUnit[]>`) and the code that resolves `sourceFile` for each unit. Then trace: for the MIR import, each of the 17 files has a distinct filename.

```bash
# How is sourceFile populated on each proposal unit?
grep -rn "sourceFile" web/src --include='*.ts' --include='*.tsx'
```

**Answer: do the 16 remaining files resolve to 16 distinct groups, or could they collapse into fewer? Is the loop `await`-ing each group sequentially?**

### Probe 5 — Terminal state and polling (adjudicates H4)

```bash
grep -rn "session-state\|sessionState\|terminal\|pollStatus\|setUnits.*complete\|setUnits.*error" web/src --include='*.ts' --include='*.tsx'
```

Find the polling logic that hits `/api/import/sci/session-state`. Paste:
- The poll trigger and its stop condition.
- The code that transitions a unit to `complete` or `error` terminal state.
- Any HF-286 marker comments.

**Answer: what condition stops the polling? If the file-group loop exits early (via H1/H2/H5), does any code path set the remaining units to a terminal state, or do they stay pending forever?**

### Probe 6 — Reconcile against the live logs

Given the probes above, map the observed log sequence to the code:
- `[SCI Bulk] Complete: 521 rows in 24887ms` — which function emits this, and what does the code do IMMEDIATELY after this log line?
- Why is there no second `Downloading from Storage` for any subsequent file?

Paste the code immediately following the "Complete" log emission and trace what should happen next.

### §1 — DIAGNOSTIC GATE

CC produces a **Diagnostic Verdict** table:

| Hypothesis | Verdict (CONFIRMED / DISPROVEN / PARTIAL) | Code evidence (file:line + pasted snippet) |
|---|---|---|
| H1 client timeout | | |
| H2 server throw | | |
| H3 group collapse | | |
| H4 terminal state | | |
| H5 await/concurrency | | |

**The root cause is the hypothesis (or combination) backed by pasted code.** CC states it in one sentence with the file:line reference. If the evidence is ambiguous between two hypotheses, CC says so and proposes the minimal additional probe — it does NOT guess.

**STOP HERE. Do not proceed to Part 2 until the architect reviews the Diagnostic Verdict and authorizes the build.**

---

## PART 2 — GATED BUILD (authorize after §1)

> CC does not begin Part 2 until the architect says proceed. The build scope is written against the CONFIRMED root cause, not against this document's hypotheses. The text below is conditional scaffolding — the architect finalizes scope after seeing Part 1.

### Build principles (apply regardless of which cause is confirmed)

1. **One-invariant-per-layer (AUD-009).** If multiple layers are implicated (e.g., timeout AND terminal-state), each gets a discrete, separately-verifiable fix. No omnibus change.
2. **No silent failure.** Whatever the cause, the end state must be: every content unit reaches a terminal state (complete or error) visible in the UI, and the user is never left with an indefinite spinner. A failed write must SAY it failed, on the unit, in the UI.
3. **Iteration isolation.** If the cause is in the file-group loop, one group's failure must NOT abort sibling groups. Each group succeeds or fails independently and reports independently. (This is the SR-34 adjacent-arm discipline: fix the class, not the instance.)
4. **Polling terminates.** If H4 is implicated, the poll must stop on terminal state for ALL units, not just the first. Align with HF-286's intent.

### Conditional fix templates (architect selects based on §1)

**If H1 confirmed (client timeout):**
- Raise `fetchWithTimeout` deadline for the bulk path to cover the largest plausible file group, OR move to the async processing-job path (the logs reference `processing_jobs` and `chunk_progress` — determine in Part 1 whether that path exists and is wired). The server `maxDuration` is 300s (Vercel Pro ceiling); the client timeout must not be shorter than the server's worst case.

**If H2 confirmed (server throw):**
- The throwing content unit must be caught at the per-unit boundary (the loop already has a try/catch per AUD-001 — verify it still does), returning `{success: false, error}` for that unit while the loop continues. Identify which MIR file/unit throws and why (likely the ground-truth file `MIR_Resultados_Esperados.xlsx`, which has two sheets and atypical structure — but PROVE it).

**If H3 confirmed (group collapse):**
- Fix `sourceFile` resolution so each distinct file is its own group.

**If H4 confirmed (terminal state):**
- Ensure every exit path from the execution flow sets remaining units to a terminal state. Stop polling when all units are terminal.

**If H5 confirmed (await/concurrency):**
- Fix the loop to correctly await each group and surface (not swallow) rejections.

### §2 — PROOF GATE (build verification)

After the fix, re-run the MIR import (architect, browser) and verify:

- [ ] All 17 content units reach a terminal state. None stuck pending.
- [ ] Successful units show committed row counts; the server logs show a `Downloading from Storage` + `Complete` for EACH file group, not just one.
- [ ] If any unit legitimately fails (e.g., the GT file is rejected or excluded), it shows an ERROR state with a message — not silence.
- [ ] Session-state polling STOPS after all units terminal (grep server log: zero `session-state` polls 30s after completion).
- [ ] `committed_data` row count in Supabase matches the sum of committed units (architect tsx-script verification).
- [ ] Regression: a single-file import still works (no over-correction breaking the common path).

### §2A — Residuals / out of scope

- The ground-truth file (`MIR_Resultados_Esperados.xlsx`) should not be in the import batch at all — it is reconciliation data. Whether HF-295 EXCLUDES it or merely handles its failure gracefully is an architect decision after Part 1. Excluding GT files by convention is a separate concern (naming heuristic) and likely out of scope for this HF.
- The 200-status `session-state` log noise the architect flagged: if Part 1 shows the polling is functioning but verbose, log-level suppression is a one-line change that MAY ride this HF or defer to a logging-hygiene item — architect decides at §2.
- PDR-01, currency convergence, DS-028, disputes — all untouched.

---

## §3 — CC PASTE BLOCK

```
HF-295 — SCI Bulk Import Write-Phase Silent Failure — DIAGNOSTIC-GATED.

EXECUTE PART 1 ONLY. This is a READ-ONLY diagnostic. Write ZERO fix code.

Discipline:
- Rule 19/21/24: read live code, do not theorize from logs. AUD-001 (March) is STALE — live main is the only authority.
- The architect's hypothesis (client-side fetchWithTimeout abort) is ONE candidate. Disprove or prove it with pasted code. Do not assume it.

Run Probes 1–6 exactly as specified in Part 1. For each probe:
- Paste the FULL code (view output), not a summary.
- Answer the adjudication question in the probe.

Produce the §1 Diagnostic Verdict table (H1–H5, each CONFIRMED/DISPROVEN/PARTIAL with file:line + pasted snippet).

State the root cause in ONE sentence with a file:line reference. If ambiguous between two hypotheses, say so and propose the minimal additional probe. Do NOT guess.

Then STOP. Do not write Part 2 fix code. Report the Diagnostic Verdict and wait for architect authorization.

Commit nothing in Part 1 except, if useful, a diagnostic report file at docs/diagnostics/DIAG-[N]_SCI_BULK_WRITE_HALT.md (sequence number from live docs/diagnostics/ directory — read it first, do not fabricate). Report evidence: pasted probe outputs in the report.
```

---

*HF-295 · SCI Bulk Import Write-Phase Silent Failure · Diagnostic-Gated · 2026-06-16*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md*
