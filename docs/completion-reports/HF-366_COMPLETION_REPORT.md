# HF-366 COMPLETION REPORT — Parse "0 rows" Regression Fix

## Summary

**Symptom (as reported):** After Clean Slate + reimport on VLTEST2, the BCL Plantilla file (85 rows × 8 columns, ~50KB) returns `Parsed 0 rows across 1 sheets` and a 0.0MB companion; classification falls through to `reference@0.50`, no entities are built, the roster is lost.

**Directive hypothesis (REFUTED):** that HF-362 (PR #639) routed small files through the streaming parse path (`sheet-stream.ts`, which produces `rows: []` by design), and the fix was to "restore the byte-size gate."

**Actual carrier (HALT-3 triggered):** The `Parsed 0 rows` log originates from `process-job/route.ts:173`, in the **`XLSX.read` (non-streaming) path** — a 50KB file is far below the 20MB `STREAM_BYTES_THRESHOLD`, so it is NEVER streamed. The 0 rows come from **`constructStructure` in `structural-construction.ts` (OB-254, PR #629, commit `0b34e77b`)** — the ONLY commit that ever touched that file. For an **all-text records sheet** (an employee/customer master: alphanumeric IDs like `EMP001`, branch codes like `SUC01`, text-formatted dates like `2020-01-15`, category codes, and **no numeric measure value anywhere**), the per-row HEADER heuristic fires on EVERY row, `firstDataIdx === -1`, and the whole roster is sidecar'd as one giant header → **zero records**.

**Fix:** In `constructStructure`, when the sheet has **no numeric anchor at all** (no row classified DATA), separate header from data by structural equality rather than the numeric heuristic: the leading row is the header; each subsequent HEADER-classified row is a repeated header only if it is byte-for-byte equal to the leading header, otherwise it is a text DATA record. A sheet with ANY numeric data is untouched (byte-identical) — the streaming gate, its 20MB threshold, and the Casa Diaz large-file path are all unmodified.

---

## Phase 0: Routing Gate Analysis

### EPG-0.1 — the parse routing gate (execute-bulk)

`web/src/app/api/import/sci/execute-bulk/route.ts:255`:

```ts
const streaming = isSpreadsheetPath(path) && isLargeByBytes(buffer.byteLength);
```

The streaming decision is gated **solely on file byte size** via `isLargeByBytes` (OB-251 HOTFIX). HF-362's `shouldHandOff` / `estTotalPulses` logic governs the **commit** step (pulse hand-off), never parse routing. A 50KB file → `isLargeByBytes(50_000) === false` → NOT streamed. So execute-bulk does not route the Plantilla to streaming.

### EPG-0.2 — source of the `Parsed 0 rows` log

`web/src/app/api/import/sci/process-job/route.ts:173`:

```ts
console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Parsed ${sheets.reduce((s, sh) => s + sh.totalRowCount, 0)} rows across ${sheets.length} sheets`);
```

The `[SCI-WORKER]` prefix in the production log confirms this is **process-job**, not execute-bulk. For a sub-20MB file, process-job takes the `else` branch (`process-job/route.ts:142–171`): `XLSX.read` → per sheet, `exceedsCellCeiling(85, 8)` is false → `debandWorksheet(...)`, pushing `totalRowCount: deband.rows.length`. `Parsed 0 rows` therefore means **`deband.rows.length === 0`**.

`deband-sheet.ts:34–44` delegates to `constructStructure(...)` and returns the `records` unit's rows. So the 0 rows come from `constructStructure`.

### EPG-0.3 — HF-362 diff does NOT touch the parse gate

`git diff 6a22b684^..6a22b684 -- .../execute-bulk/route.ts`: the `import { isLargeByBytes } from '@/lib/sci/sheet-stream'` line and the `const streaming = ...` gate appear as **unchanged context** (no `+`/`-`). Every `+`/`-` line is in the **hand-off/pulse** block (`handOff` → `estTotalPulses > 1`, `enqueuePulseLoadJob`, sync-path finalize). HF-362 did not alter parse routing.

`git log --oneline -- src/lib/sci/structural-construction.ts` and `-- src/lib/sci/deband-sheet.ts`: **one commit each — `0b34e77b` (OB-254, PR #629)**. Neither HF-362 (#639), HF-364 (#641), nor DIAG-080 (#640) touched them.

### Empirical reproduction (Prove, Don't Describe)

`constructStructure` run directly on a synthetic 85-row × 8-col Plantilla:

| Fixture | records rows | classes |
|---|---|---|
| **All-text roster** (alphanumeric IDs, text dates) | **0** (expected 85) | 86× HEADER, 0× DATA |
| Same roster with **one numeric column** | **85** ✓ | 1× HEADER, 85× DATA |

The all-text sheet's "header" was the concatenation of every column's every value — the signature of the misclassification.

---

## Phase 1: Architecture Decision

```
ARCHITECTURE DECISION RECORD
============================
Problem: `constructStructure` (OB-254 de-bander) classifies EVERY row of an
         all-text records sheet as HEADER. With no numeric measure cell, no
         column profiles as 'measure', so every data row has measPop===0 and
         numCells===0, tripping the mostly-text/covers-footprint HEADER rule
         (structural-construction.ts:199–202). firstDataIdx === -1, canonicalBand
         swallows every row, all rows are sidecar'd → 0 records.

Scenario: C — NOT a routing regression (HALT-3). The byte-size parse gate
          (isLargeByBytes / STREAM_BYTES_THRESHOLD = 20MB) is correct and
          unchanged since HF-358. HF-362 changed only commit hand-off. The
          carrier is OB-254 (structural-construction.ts, PR #629).

Fix: When the sheet has NO row classified DATA (no numeric anchor), fall back to
     structural equality to split header from data: the first HEADER row is the
     header; a later HEADER row is a repeated header ONLY if byte-equal to it,
     else it is a text DATA record. Runs BEFORE header recovery so firstDataIdx,
     canonicalBand, and the walk all see corrected classes.

Scale test: Works at 10x? YES — O(rows) demotion pass; a 100k-row all-text sheet
            is over the cell ceiling → windowed (fullGrid:false), unaffected;
            an under-ceiling all-text sheet demotes in one linear scan.
Korean Test: Any hardcoded field names? NO — structural equality only (cell-tuple
             compare); zero language/domain tokens.
HALT-CALC: BCL/Meridian/MIR stay byte-identical? YES — all have numeric data →
           firstDataIdx >= 0 → guard skipped entirely.
Streaming preserved: Casa Diaz (52MB) still streams? YES — sheet-stream.ts and
           the 20MB threshold are untouched.

CHOSEN: Scenario C, fix in structural-construction.ts — because the evidence
        (EPG-0.1/0.2/0.3 + reproduction) proves the parse gate is correct and the
        0 rows are produced by the OB-254 de-bander on all-text rosters. Restoring
        or re-threshold-ing the streaming gate (the directive's Scenario A/B) would
        change nothing — a 50KB file never streams. Honest carrier: OB-254, not HF-362.
```

**HALT-3 report:** The regression is NOT HF-362. The `Parsed 0 rows` log originates from `process-job/route.ts:173` in the non-streaming `XLSX.read` path, and the 0-row value is produced by `constructStructure` (`structural-construction.ts`, OB-254 / PR #629). Per the directive's HALT-3 instruction ("Report the actual carrier with file:line evidence — the regression may not be HF-362"), the fix is applied to the true carrier. The directive's objective — make the Plantilla parse its 85 rows — is delivered.
