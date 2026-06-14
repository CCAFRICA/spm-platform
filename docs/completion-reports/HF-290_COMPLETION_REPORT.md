# HF-290 — Import List Poller Terminal-Stop

**Repo:** `CCAFRICA/spm-platform` (VP) · **Authored:** 2026-06-14 · **Type:** HF (defect-class sibling of HF-286)
**Branch:** `hf/290-import-list-poller-terminal-stop` · **Base:** `main`
**Status:** **CLOSED — no-defect (HALT-3) + a poll-volume reduction.** All `/api/import/sci/session-state` pollers already carry terminal stops; the log was confirmed active-execution polling (expected, bounded). The one-line change below cuts the sub-cadence request volume that fills the `[import]` access log. No terminal-stop bug existed or was added.

**SHAs:** poll-volume reduction `09f505ab` (`SCIExecution.tsx`) · original HALT-3 audit report `374f4077` (this commit folds the reduction in).

---

## Collision gate

`ls docs/completion-reports/HF-290* docs/vp-prompts/HF-290*` → no matches. `git log --all --oneline | grep -i HF-290` → none. Clear; number retained.

---

## Phase 0 census (Rule 7 — pasted, durable evidence the surface was audited)

Every client caller of `/api/import/sci/session-state` and its terminal behavior:

| # | Caller | Cadence | Terminal stop | Verdict |
|---|---|---|---|---|
| 1 | `operate/import/page.tsx:69` `analyzeTabular` | `setInterval … 2000` | `finally { clearInterval(poll) }` (l.129) — bounded by the analyze promise | **stops** |
| 2 | `operate/import/page.tsx:108` recovery | `while … sleep(2000)` | bounded by `ANALYZE_STALL_MS` | **stops** |
| 3 | `SCIExecution.tsx:163` `settleFromSurface` | `while … sleep(2000)` | `STALL_MS=90_000` cap; returns at `settledCount >= trackedIds.length` (l.191) | **stops** |
| 4 | `SCIExecution.tsx:203` live execute-progress | `setInterval … 2000` | effect early-returns + cleanup `clearInterval` when `executionDone` **or** no unit `processing` (l.204-206, 222); unmounts at phase→`complete` | **stops** |
| 5 | `SCIProposal.tsx:383` | `setInterval … 1500` | **HF-286** `allUnitsSettled` → `clearInterval` (l.370-373) | **stops** (out of scope) |
| 6 | `ImportTelemetryPanel.tsx:77` | `setInterval … 2000` | **HF-286** `allUnitsSettled` → `clearInterval` (l.67-70) | **stops** (out of scope) |
| 7 | `ImportReadyState.tsx:71` (completion screen) | **once on mount** | single `await fetch`, no loop | **not a poller** |

**0.3 — response shape / stop predicate.** Terminal disposition is the settled-set
`bound | resolved | failed_interpretation` (`allUnitsSettled` in
`src/lib/sci/comprehension-state-service.ts`). The session-state view returns
`units: [{ unitId, state, sheetName, failureClass }]`; `state` is the terminal field.

**0.4 — does HF-286's `allUnitsSettled` apply?** Yes. Callers #5–#6 already use it directly;
callers #3–#4 use the equivalent local guard (`executionDone` / no unit in `processing`, both
derived from the same settled-set). No caller needs a *new* state model.

**0.5 — one or two callers (the same-second double-hit).** During the **executing** phase,
**three** pollers hit session-state concurrently at 2 s — `settleFromSurface` (#3), the live
poll (#4), and `ImportTelemetryPanel` (#6). That clustering explains the `:33.276` + `:33.287`
pair (11 ms apart). The live poll (#4) additionally fires an immediate `void poll()` on every
`units` change (its `useEffect` deps include `units`, l.223), adding sub-cadence hits during
active work. This is two/three **distinct concurrent pollers**, not a remount loop — and all of
them stop at terminal.

---

## HALT-3 verdict

**Every poller on this surface already stops at terminal. No in-scope poller "clears only on
unmount, never on terminal state."** The directive's §1 premise — a `setInterval` that clears
only on unmount — does not hold against the code as it stands.

The `[import] / status=200` 2 s stream at `04:54` is therefore one of:
- **active-execution polling** — three correct, bounded pollers running *while units settle*. Not a
  leak; all stop at terminal (settled-set / `executionDone` / unmount at phase→`complete`). **OR**
- **a unit that never reaches a terminal server state** (`bound`/`resolved`/`failed_interpretation`).
  Then `allUnitsSettled` stays `false` and the settled-set guard **correctly never fires.** That is a
  **server settle-completeness** issue, *not* a missing client stop. "Add a terminal stop like
  HF-286" cannot fix it — the stop already exists and is gated on a condition the server never
  reaches.

Per directive §4, CC stops here for the architect's scope decision rather than forcing a redundant
stop-guard onto already-terminal-aware code (DD-7: pollers that already stop are unchanged).

---

## Log-verbosity finding — no source `info` line exists

A follow-on scope ask was to lower the `[info] [import] / status=200` line from `info` to `debug`.
**Exhaustive grep proves the application emits no such line:** zero `console.info` in the entire
codebase; no `instrumentation.ts`, custom server, or `next.config` logging block; no route-handler
logging wrapper; the session-state route handler has zero `console.*`; middleware only `console.error`s
on auth. The import routes that do log use tags `[ImportPrepare]`/`[ImportCommit]` — never `[import]`,
never `status=`. `[info] [import] / status=200` is a **Vercel platform access log** (`[info]` = its
level, `[import]` = its function/route grouping, `status=200` = its request outcome), not app code.
There is no `info` log to downgrade; a fabricated `console.debug` would leave the real access log
unchanged. The only code-side lever is to reduce the **number of requests** — done below.

## Poll-volume reduction (lever 1) — SHA `09f505ab`

The Vercel access log fires once per request; fewer polls = fewer lines. Caller #4 (the live
execute-progress poll) re-subscribed on every per-unit settle and fired an extra immediate
`void poll()` each time — the same-second double/triple hits. Gating on the **derived
`hasActiveUnits` boolean** instead of the volatile `units` array makes the effect re-run only when
the boolean toggles (start `false→true`, finish `true→false`), not on every per-unit flip.

**Before** (`SCIExecution.tsx`):
```ts
useEffect(() => {
  if (executionDone) return;
  const hasActive = units.some(u => u.status === 'processing');
  if (!hasActive) return;
  // … interval @ 2000ms + immediate void poll() …
}, [executionDone, units, tenantId, proposal.proposalId]);   // ← `units` churns every settle
```

**After:**
```ts
const hasActiveUnits = units.some(u => u.status === 'processing');
useEffect(() => {
  if (executionDone || !hasActiveUnits) return;
  // … interval @ 2000ms + immediate void poll() …
}, [executionDone, hasActiveUnits, tenantId, proposal.proposalId]);   // ← boolean toggles twice
```

**Why a literal `units` removal would be wrong (and the build proves the fix is correct):** the
effect body read `units` only at the start gate, which must observe the `pending→processing`
transition to *start*. Dropping `units` outright would either never start the poller or trip
`react-hooks/exhaustive-deps`. Lifting the gate to the derived boolean satisfies the linter (the
body no longer references `units`) **and** preserves start/stop semantics.

**Evidence the double-hit is gone (static, deterministic — browser run is auth-gated):**
- The effect's only re-subscription trigger was the `units` array identity. It is removed from the
  deps; the remaining deps (`executionDone`, `hasActiveUnits`, `tenantId`, `proposal.proposalId`)
  change at most twice over a run. Per-unit settles (N flips for N units) no longer re-run the
  effect, so the N−1 extra immediate `void poll()` calls per run are eliminated. Steady cadence is
  the single `setInterval(…, 2000)` — **unchanged**.
- Terminal stop **unchanged**: effect still early-returns + clears on `executionDone` OR
  `!hasActiveUnits` (last unit leaves `processing`), and still unmounts at phase→`complete`.
- **Build:** `rm -rf web/.next && npm run build` → **exit 0**, no `exhaustive-deps` regression on
  the edited effect (the only `SCIExecution.tsx` lint note is the pre-existing `rawData` dep at
  l.609, untouched).

---

## Disposition — RESOLVED (CLOSED, no-defect)

**Architect confirmed (2026-06-14): the production log was captured during ACTIVE EXECUTION.**

That is the **expected bounded polling** path — three correct, terminal-aware pollers (#3/#4/#6)
running concurrently *while units settle*, every one stopping at terminal. **No polling defect; no
server settle-completeness issue.** HF-290 is **closed no-defect.** The shipped poll-volume
reduction (`09f505ab`) stands as a quieting improvement: the per-unit-settle sub-cadence double-hits
are eliminated, so the same active-execution window now logs at a clean 2s cadence.

The idle-still-polling branch (a unit stuck non-terminal server-side → a new settle-completeness
DIAG) did **not** materialize and is recorded here only for provenance.

---

## Residuals

- **Active-execution double-hit (caller #4) — RESOLVED** in `09f505ab` (poll-volume reduction above).
  The sub-cadence extra ticks from the `units`-array dep are eliminated; clean 2s cadence retained.
- **The platform access log itself** is unchanged by code — only its request *count* drops. Lowering
  Vercel's `[info]` access-log verbosity (sampling / log drains / level filter) is an infra/dashboard
  lever, not a code change. Flagged for the architect if further suppression is wanted.
- **DS-029** still retires the polling pattern entirely (SSE/push), which is the durable fix for all
  interval pollers on this surface.
- No additional import-surface pollers were discovered beyond the 7 census rows.

---

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: HF-290 → CLOSED no-defect (active-execution polling confirmed); HALT-3 + poll-volume reduction (09f505ab); [import] info log is Vercel platform, no source line to downgrade
REGISTRY: import-list polling surface audited — 7 callers, all bounded; caller #4 sub-cadence double-hit RESOLVED
R1: D-tier operational quality — import-list log volume reduced (per-unit-settle extra polls eliminated)
BOARD: Performance +
SUBSTRATE: ICA candidate — "HALT-3 is a valid work-item outcome; the audit itself has value as durable evidence" + "gate polling effects on derived booleans, not the volatile arrays they read — array-identity deps re-subscribe per mutation"
```

---

*HF-290 · import-list poller audit + poll-volume reduction · 2026-06-14 · vialuce.ai*
