# DIAG-069 — SCI Bulk Import Write-Phase Silent Failure (HF-295 Part 1)

**Date:** 2026-06-16 · **Mode:** READ-ONLY diagnostic · **Authority:** live `main` (AUD-001 March extraction is STALE, not used).
**Symptom:** 17-unit multi-file SCI import commits the first file group (2 units / 521 rows), then appears to halt; one `[SCI Bulk] Complete` log, no subsequent file-group dispatch; session-state polling continues.

> Verdict up front: **H5 CONFIRMED** (with H4 PARTIAL as a downstream symptom). The architect's H1 (`fetchWithTimeout` abort) is **DISPROVEN** — the first group completed in 24.9s, far under the 300s timeout; the failure is *non-dispatch of subsequent groups*, not an aborted request.

---

## Probe 1 — execute orchestration (client)

`web/src/components/sci/SCIExecution.tsx`. Data units are dispatched **per file group**, each group awaited sequentially (`:525-537`):

```ts
// :513
if (dataUnits.length > 0 && (storagePaths && Object.keys(storagePaths).length > 0 || storagePath)) {
  const fileGroups = new Map<string, ExecutionUnit[]>();
  for (const unit of dataUnits) {
    const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
    const sourceFile = proposalUnit?.sourceFile || '_default';
    if (!fileGroups.has(sourceFile)) fileGroups.set(sourceFile, []);
    fileGroups.get(sourceFile)!.push(unit);
  }
  // :525
  for (const [sourceFile, groupUnits] of Array.from(fileGroups.entries())) {
    const hasMultipleFiles = fileGroups.size > 1;
    const filePath = storagePaths?.[sourceFile] || (!hasMultipleFiles ? storagePath : undefined);
    if (filePath) {
      await executeBulk(groupUnits, filePath);   // ← awaited per group
    } else { /* legacy per-unit fallback */ }
  }
}
```

`executeBulk` (`:231-318`) wraps each group's POST in a bounded **resume loop** that gates on `settleFromSurface()`:

```ts
// :268
const MAX_EXECUTE_ATTEMPTS = 3;
let settled = false;
for (let attempt = 1; attempt <= MAX_EXECUTE_ATTEMPTS && !settled; attempt++) {
  ...
  const res = await fetchWithTimeout('/api/import/sci/execute-bulk', { ... body: { storagePath: effectivePath, contentUnits: bulkUnits } });
  ...
  settled = await settleFromSurface();   // :308 — gate
}
```

**The loop DOES await each group sequentially (no swallowed rejection at the loop level).** The defect is the gate's scope (Probe 5).

## Probe 2 — timeout wrapper (adjudicates H1)

`SCIExecution.tsx:28` + `:64-81`:
```ts
const FETCH_TIMEOUT_MS = 300_000;            // :28 — "Match server maxDuration (300s)"
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timeoutId); }
}
```
**Timeout = 300,000 ms (300s).** Observed first-group duration = 24.9s. **Answer:** an 8,000-row group would need to exceed 300s server-side to trip this; the *observed* group completed in 24.9s and returned normally → the timeout did **not** fire. A timeout is not the cause of the halt (a timeout would still mark a request attempted; here subsequent groups are never *dispatched*).

## Probe 3 — server bulk loop (adjudicates H2, H5-server)

`web/src/app/api/import/sci/execute-bulk/route.ts`: `maxDuration = 300` (`:6`). The server processes **every file in `storagePaths`** (download/parse loop `:193-261`) then **every content unit** with a **per-unit try/catch** (`:424-582`):
```ts
for (const unit of sortedUnits) {
  ...
  try { const result = await processContentUnit(...); results.push(result); /* emit bound/failed per unit */ }
  catch (err) { results.push({ ...unit, success: false, error: String(err) }); /* emit failed_interpretation */ }
}
```
**Answer:** one unit throwing does **not** abort the loop — it records a per-unit failure and continues. The only whole-request abort is a *file download* failure (`:199` returns 500). **Answer (multi vs one):** the server can process MANY files per request (it iterates `fileEntries`), but the CLIENT sends **one file group per `executeBulk` call** (`:281` sends a single `storagePath`), so each server invocation logs one `Downloading`/`Complete`. → H2 disproven.

## Probe 4 — file-group resolution (adjudicates H3)

Client grouping keys by `proposalUnit.sourceFile` (`:514-520`, pasted in Probe 1); distinct filenames → distinct groups (`fileGroups.size` logged at `:522` `[HF-142] File groups (N): ...`). The first group committing 2 units proves grouping resolved at least one file correctly; 16 distinct MIR filenames map to ~16 distinct groups. The loop is `await`-ed per group. **Answer:** the 16 files do NOT collapse into one group; grouping is not the defect.

## Probe 5 — terminal state & polling (adjudicates H4, **confirms H5**)

`settleFromSurface` (`:163-197`) — the gate `executeBulk` awaits per group:
```ts
const settleFromSurface = useCallback(async (): Promise<boolean> => {
  const STALL_MS = 90_000;
  const trackedIds = confirmedUnits.map(u => u.contentUnitId);   // :166 — ALL import units (17), not the group
  let lastSettled = -1, lastProgressAt = Date.now();
  while (Date.now() - lastProgressAt < STALL_MS) {
    ... // poll /api/import/sci/session-state, reflect bound/resolved/failed
    const settledCount = trackedIds.filter(id => terminal(id)).length;
    if (settledCount > lastSettled) { lastSettled = settledCount; lastProgressAt = Date.now(); }
    if (settledCount >= trackedIds.length) return true;          // :191 — true only when ALL 17 terminal
    await sleep(2000);
  }
  return false;                                                  // :196 — 90s stall → false
}, [tenantId, proposal.proposalId, confirmedUnits]);
```
**Answer:** the stop condition is **all `confirmedUnits` terminal** (import-wide), but `settleFromSurface` is invoked **per file group** inside `executeBulk`. After group 1 commits its 2 units, only 2 of 17 are terminal — groups 2..N have not been dispatched yet — so `settledCount` (2) can never reach `trackedIds.length` (17) within group 1's call. It polls until the 90s stall, returns false; the resume loop then **re-POSTs group 1** (idempotent; server resume-skips the bound units) for attempts 2 and 3, then `executeBulk` returns. Only THEN does the `:525` loop advance to group 2 — which repeats the same 3×90s stall. The terminal-state machinery itself works for *dispatched* units; the remaining 15 stay non-terminal because they are **starved of dispatch**, not because a terminal write is missing → H4 PARTIAL (symptom), H5 root.

## Probe 6 — reconcile against the logs

`[SCI Bulk] Complete: 521 rows in 24887ms` is emitted at `execute-bulk/route.ts:652`, immediately after the per-unit loop; the route then emits `bound` states (`:658`) and returns the response (`:678`). The client receives it (`SCIExecution.tsx:295` seeds units optimistically) and calls `settleFromSurface()` (`:308`), which **blocks** waiting for all 17 units. No second `Downloading from Storage` appears because the `:525` loop is still inside group 1's `executeBulk` (stalling + re-POSTing the same group) and has not advanced to group 2's `executeBulk` call.

---

## §1 — DIAGNOSTIC VERDICT

| Hypothesis | Verdict | Code evidence |
|---|---|---|
| **H1** client timeout abort | **DISPROVEN** | `FETCH_TIMEOUT_MS=300_000` (`SCIExecution.tsx:28`); first group returned in 24.9s; symptom is non-dispatch, not abort |
| **H2** server throw mid-loop | **DISPROVEN** | per-unit try/catch (`execute-bulk/route.ts:460,555`) continues on throw; only a file-download error 500s, and the group COMPLETED (521 rows) |
| **H3** group collapse | **DISPROVEN** | `fileGroups` keyed by `sourceFile` (`SCIExecution.tsx:514-520`); distinct files → distinct groups; first group committed correctly |
| **H4** terminal state / polling | **PARTIAL (symptom)** | remaining units stay non-terminal because never dispatched; the spine settles units that ARE dispatched (`execute-bulk/route.ts:515-554`). Polling-forever is the *visible symptom* of H5 |
| **H5** await/concurrency | **CONFIRMED** | `settleFromSurface` waits for ALL `confirmedUnits` (`SCIExecution.tsx:166`, returns true only at `:191` `settledCount >= trackedIds.length`) but is awaited **per file group** (`:308` inside `executeBulk`, called per group at `:537`) |

### Root cause (one sentence)
`SCIExecution.tsx` dispatches data units per file group (`:525` → `await executeBulk(group)` `:537`), but each `executeBulk` gates on `settleFromSurface()`, whose terminal condition is the **whole import** (`trackedIds = confirmedUnits.map(...)`, `:166`; true only at `settledCount >= trackedIds.length`, `:191`) — so after the first group commits, the gate can never be satisfied (later groups are not dispatched yet), stalling 90s and re-POSTing the same group 3× before the loop can advance, which starves every subsequent file group and makes the import appear to halt after the first file.

### Precise mechanics (not a literal permanent hang)
The resume loop is bounded (`MAX_EXECUTE_ATTEMPTS=3`, `STALL_MS=90_000`), so each non-final group consumes ≈3×90s ≈ 4–5 min (plus 3 redundant re-POSTs) before `executeBulk` returns and the `:525` loop advances. Across ~16 groups this is ≈80 min of apparent hang with ~3× wasted server re-POSTs per group; the final group's `settleFromSurface` is the only one that can reach 17/17. Functionally broken; not strictly permanent.

### Proposed minimal fix (Part 2 — GATED, NOT written here)
Scope the settle to the **current group's** unit ids: pass `groupUnits`' ids into `executeBulk`/`settleFromSurface` (replace the import-wide `confirmedUnits` at `:166` with the per-call set), so each group settles when ITS units are terminal and the loop advances immediately. One-invariant-per-layer (AUD-009): this is a single client-side scope fix; the server per-unit terminal emission is already correct. (H4's "polling forever" resolves as a consequence once dispatch is unblocked.)

**STOP — Part 1 complete. Awaiting architect authorization for Part 2 (no fix code written).**
