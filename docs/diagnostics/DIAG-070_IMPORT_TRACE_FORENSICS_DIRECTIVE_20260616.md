# DIAG-070: Import Write Path — Full Trace Instrumentation + Change Forensics

**Date:** 2026-06-16
**Category:** DIAG (Diagnostic) — read-and-instrument only. NO FIX.
**Number:** DIAG-070. Predecessor: DIAG-069 (settle-scope mismatch, H5 CONFIRMED). Sequence verified: DIAG-069 exists at `docs/diagnostics/DIAG-069*`.
**Context:** Three client-side fixes (HF-295, HF-295 Part 2, HF-296) merged to `main`. Production behavior unchanged — one file commits, ~5 min gap, next file, Vercel 300s timeout. The fixes targeted the client settle mechanism. The production logs show the symptom persists. No fix has been informed by (a) instrumenting the actual execution to see where time goes, or (b) forensically interrogating what recent commits changed in the import write path. This diagnostic does both.

---

## PART 1 — FORENSIC CHANGE INTERROGATION (git history, read-only)

The import worked cleanly in the past — BCL, Meridian, and CRP all imported and reconciled. Something in recent history introduced excessive session-state polling, the "pulse" concept, and possibly material changes to the import write path itself. Trace what, when, and what it changed.

### 1.1 — Establish the last-known-good point
```bash
git log --oneline --all --since="2026-02-01" --until="2026-04-15" -- web/src/components/**/SCIExecution.tsx web/src/app/api/import/sci/execute-bulk/route.ts | tail -40
```
Identify the commit range where the import write path was stable and multi-file import completed without the polling/stall symptom. Paste it.

### 1.2 — What introduced "pulses"?
```bash
git log --all --oneline -S "pulse" -- web/src --since="2026-03-01"
git log --all --oneline -S "Pulse" -- web/src --since="2026-03-01"
```
For each commit that introduced the pulse concept: `git show <sha> --stat`, then paste the diff of how it changed the import or execute path. Answer: is a "pulse" a display-only concept, or did it restructure how data is committed (e.g., chunking commits into smaller writes)? If pulses changed the commit loop, that is a candidate for the per-file slowness.

### 1.3 — What introduced and modified session-state polling?
```bash
git log --all --oneline -S "session-state" -- web/src --since="2026-03-01"
git log --all --oneline -S "settleFromSurface" -- web/src
git log --all --oneline -S "setInterval" -- web/src/components --since="2026-03-01"
```
For each commit that added or modified polling: `git show <sha>`, paste the diff. Build a timeline:
- When did polling enter the execute phase?
- When was it modified (HF-286, HF-290, HF-295, HF-296)?
- What did each change do to the poll's trigger, cadence, and stop conditions?

### 1.4 — What changed the import WRITE path (server-side)?
```bash
git log --all --oneline --since="2026-03-01" -- web/src/app/api/import/sci/execute-bulk/route.ts
git log --all --oneline -S "executePostCommit" -- web/src
git log --all --oneline -S "createMissingAssignments" -- web/src
git log --all --oneline -S "emitFlywheelSignals" -- web/src
git log --all --oneline -S "Entity Resolution" -- web/src
git log --all --oneline -S "commitContentUnit" -- web/src
git log --all --oneline -S "populateStoreMetadata" -- web/src
```
For each commit touching the write path since the last-known-good point: `git show <sha> --stat`. Identify any commit that ADDED synchronous work to the per-file commit path — entity resolution, post-commit construction, flywheel signals, assignment creation, metadata population. Paste the diffs that added inline per-file work.

### 1.5 — Diff the write path: last-known-good vs now
```bash
# Replace <GOOD_SHA> with the stable commit identified in 1.1
git diff <GOOD_SHA>..HEAD -- web/src/app/api/import/sci/execute-bulk/route.ts
```
Paste the full diff. This shows exactly what changed in the server-side write path between when it worked and now.

### 1.6 — Diff the client dispatch: last-known-good vs now
```bash
git diff <GOOD_SHA>..HEAD -- web/src/components/**/SCIExecution.tsx
```
Paste the full diff. This shows what changed on the client dispatch side.

---

## PART 2 — END-TO-END TRACE INSTRUMENTATION

Add timestamped trace logs through the ENTIRE import write path. Verbose logging is enabled in the environment. Use consistent prefixes: `[TRACE-SERVER]`, `[TRACE-CLIENT]`, `[TRACE-POLL]`.

### 2.1 — Server-side: per-phase timing inside execute-bulk

In `web/src/app/api/import/sci/execute-bulk/route.ts`, instrument every major phase within a single file's processing:

```typescript
const t0 = Date.now();
const traceLog = (phase: string) => console.log(`[TRACE-SERVER] ${fileName} | ${phase} | +${Date.now() - t0}ms`);
```

Read the route top to bottom. Do NOT guess the phases — identify every named operation in the actual code and bracket each with a traceLog. Expected phases (confirm from the code, add any missing):
- Storage download
- XLSX parse (or companion HIT)
- Header comprehension / field binding
- Entity resolution (DS-009)
- commitContentUnit (the DB insert)
- Post-commit construction (executePostCommit)
- Assignment creation (createMissingAssignments)
- Flywheel signal emission (emitFlywheelSignals)
- Store metadata population (populateStoreMetadata)
- Input binding clearance
- Response construction

Each phase gets a START and END trace. The goal: when a file takes 25,000ms, the trace shows WHICH phase consumed the time.

### 2.2 — Client-side: dispatch loop and settle decision

In `SCIExecution.tsx`, instrument `executeUnits` (the file-group loop, ~598-622) and `executeBulk`:

In the file-group loop, per file:
```typescript
console.log(`[TRACE-CLIENT] DISPATCH-START file=${sourceFile} at +${Date.now()-loopStart}ms`);
// ... await executeBulk ...
console.log(`[TRACE-CLIENT] DISPATCH-END file=${sourceFile} settled=${outcome.settled} at +${Date.now()-loopStart}ms`);
```

In executeBulk, at every branch:
```typescript
// After fetch returns:
console.log(`[TRACE-CLIENT] ${sourceFile} FETCH-RETURNED http=${res.status} ok=${res.ok} at +${Date.now()-fetchStart}ms`);

// At the branch decision:
console.log(`[TRACE-CLIENT] ${sourceFile} PATH=immediate-return`);
// or:
console.log(`[TRACE-CLIENT] ${sourceFile} PATH=settle-recovery reason=<the specific condition that triggered it>`);

// If settleFromSurface is called:
console.log(`[TRACE-CLIENT] ${sourceFile} SETTLE-POLL attempt=${n} settledCount=${c}/${total}`);
```

### 2.3 — Poll lifecycle

In every component that polls session-state (SCIExecution live-progress, ImportTelemetryPanel), log the lifecycle:
```typescript
console.log(`[TRACE-POLL] <component> START interval=${interval}ms`);
// each tick:
console.log(`[TRACE-POLL] <component> TICK units-settled=${n}/${total}`);
// stop:
console.log(`[TRACE-POLL] <component> STOP reason=<executionDone|allSettled|unmount|stall-timeout>`);
```

---

## PART 3 — BUILD, DEPLOY, CONFIRM DEPLOYMENT

```bash
rm -rf .next && npm run build   # must exit 0
git add -A && git commit -m "DIAG-070: import write-path trace instrumentation + per-phase timing"
git push origin <branch>
gh pr create --base main --head <branch> --title "DIAG-070: import write-path trace instrumentation" --body "Adds [TRACE-SERVER], [TRACE-CLIENT], [TRACE-POLL] timestamped logs across the entire import write path. No behavior change — instrumentation only. Change forensics in the diagnostic report."
```

**State the PR number and the HEAD commit SHA in your report.** After the architect merges, the architect will confirm the production deployment SHA matches this commit in the Vercel dashboard before re-running the import. This verification step is mandatory — we will not re-run against an unconfirmed deployment.

---

## PART 4 — DIAGNOSTIC REPORT

Commit a report at `docs/diagnostics/DIAG-070_IMPORT_TRACE_FORENSICS.md`.

### Section A — Change Forensics
1. The last-known-good commit for the import write path (from 1.1).
2. What introduced "pulses" — sha, date, whether it changed the write path or only display (from 1.2).
3. The polling timeline — every commit that touched session-state polling, what each changed (from 1.3).
4. Every commit that added synchronous work to the per-file server write path — with diffs (from 1.4). This is the headline finding.
5. The full `git diff <GOOD_SHA>..HEAD` of execute-bulk/route.ts (from 1.5).
6. The full `git diff <GOOD_SHA>..HEAD` of SCIExecution.tsx (from 1.6).

### Section B — One-sentence hypothesis (evidence-backed)
Based ONLY on the diffs from Section A, state in one sentence: what commit(s) changed the import from fast to slow, and what operation(s) they added? If the forensics show no added server work, say so explicitly — then the trace (Part 2) on the next run will locate the time, and the hypothesis is deferred until that evidence arrives.

### Section C — Deployment confirmation record
The PR number, the HEAD commit SHA, and a note that the architect must verify the production deployment SHA matches before re-running.

**Do NOT write a fix.** The instrumented run produces the per-phase evidence. The forensics produce the change history. The fix follows both — not before.

---

*DIAG-070 · Import Write Path Trace + Change Forensics · 2026-06-16*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md*
