# HF-290 — Import List Poller Terminal-Stop

**Repo:** `CCAFRICA/spm-platform` (VP) · **Authored:** 2026-06-14 · **Type:** HF (defect-class sibling of HF-286)
**Branch:** `hf/290-import-list-poller-terminal-stop` · **Base:** `main`
**Status:** **HALT-3 — no code change.** All `/api/import/sci/session-state` pollers already carry terminal stops.

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

## Open question (decides disposition)

**Was the production log captured during active execution, or at idle (sitting on the "Import
Complete" screen)?**

- **During active execution** → expected bounded polling. Close HF-290 as **no-defect**. Optional
  micro-fix below.
- **At idle, still polling** → a unit stuck non-terminal server-side. Spin a **new DIAG** on
  server settle-completeness (which units, which session, why no terminal disposition); candidate
  remedies are (a) server-side guarantee every unit terminalizes, or (b) a defensive wall-clock
  max-poll cap on callers #3/#4/#6.

---

## Residuals

- **Active-execution double-hit (caller #4).** The live execute-progress poll lists `units` in its
  `useEffect` deps (`SCIExecution.tsx:223`), so it tears down + recreates the interval and fires an
  immediate `void poll()` on every unit-state change — extra sub-cadence requests during active
  work. **Micro-optimization candidate, not a defect** (it is bounded and stops at `executionDone`).
  Dropping `units` from the deps would silence the double-hit. **DS-029 scope** (SSE/push replacement
  retires the polling pattern entirely).
- No additional import-surface pollers were discovered beyond the 7 census rows.

---

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: HF-290 → HALT-3 (no code change; all pollers already terminal-aware)
REGISTRY: import-list polling surface audited — 7 callers, all bounded
R1: no change
BOARD: no change
SUBSTRATE: ICA candidate — "HALT-3 is a valid work-item outcome; the audit itself has value as durable evidence"
```

---

*HF-290 · import-list poller audit · 2026-06-14 · vialuce.ai*
