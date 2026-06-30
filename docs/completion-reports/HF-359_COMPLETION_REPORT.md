# HF-359 — Completion Report

**Work item:** HF-359 — Byte-Budgeted Pulse + Restored Pulse Progression + Clean Slate Audit of What Was Cleared
**Worktree base SHA:** `34fe7db3` (origin/main — OB-255) · **Mode:** ULTRACODE · **Date:** 2026-06-29
**CC does not merge or run the live import (SR-44).** Unifying invariant honored: the system measures the real constraint and sizes itself to it; shows the work as it moves; records what it destroys.

## Decision 158 / HALT-CALC

The commit path stays deterministic (no LLM). **Committed-row bytes are byte-identical** — the metadata refactor (shared `buildUnitCsvMetadata`) produces the same key order + values as the prior inline literal (PG-A3), and `commitContentUnit`'s `buildCommittedRow` + `committedRowsCsvStream` are otherwise untouched. **Σ(pulse row counts) = total rows, exactly** — `planPulses` partitions the rows; no row in two pulses, none missing (PG-A2). Only the *boundary* (where one CSV ends and the next begins) and the *failure/telemetry/audit bookkeeping* changed.

## One path / no divergence

- **Commit:** the byte budget REPLACES the row-window boundary inside the existing `streamSheetWindows` + `commitUnitStreamed`/`commitUnitWindowed` path. `commitContentUnit` is unchanged; there is no second commit route (PG-A5).
- **Telemetry:** reuses `accumulateUnitCommitFields` → `import_session_telemetry` → `projectImportTelemetry` → `ImportTelemetryPanel` (PG-B3). No parallel counter or surface.
- **Audit:** extends the one Clean Slate completion audit write (PG-C1). No second audit path.

## Commits

| # | Commit | Part |
|---|---|---|
| 1 | `59da4782` | §3 ADR (committed before implementation) |
| 2 | `26234adf` | **A** — byte-budgeted dynamic pulse |
| 3 | `616d1682` | **B** — restored pulse progression |
| 4 | `38a17442` | **C** — Clean Slate audit of what was cleared |
| 5 | (this) | build hygiene + report |

12 files, +756 / −100.

---

## PART A — byte-budgeted dynamic pulse

DIAG-079: the commit was already pulsed (one CSV per 20,000-row window) but the boundary was **rows** while the storage limit is **bytes** — a 20K-row window of 87 wide cols serialized to tens of MB and the run died on pulse 1. The fix makes the boundary bytes, derived from the real limit at runtime.

- **`pulse-budget.ts`** — `discoverUploadByteBudget` reads `getBucket('ingestion-raw').file_size_limit`; budget = `HEADROOM_FRACTION (0.8) × (limit ?? FALLBACK_LIMIT_BYTES 40MB)`. The bucket limit is **null** (FP-49) → the fallback **surfaces** (`console.warn` + `limitSource='fallback'`). The 20K row count is eliminated as the boundary — demoted to `MAX_PULSE_ROWS` (a memory safety cap).
- **`pulse-accumulator.ts`** — the ONE byte-boundary rule (`shouldFlushBeforeAdd` / `planPulses`), shared by both paths. Flushes BEFORE a row would exceed the budget.
- **`commit-content-unit.ts`** — shared `buildUnitCsvMetadata` used by `buildCommittedRow` AND `makeRowByteEstimator` (`rowBytes` via the SAME `committedRowToCsvLine` on the unit's real metadata). One source of truth.
- **`sheet-stream.ts` + `windowed-commit.ts`** — the streamer + reader loop flush by bytes; each byte-bounded pulse → one `commitContentUnit` call → own batch → byte-identical rows, one telemetry pulse, resumable.

**PG-A1 (byte-bounded + adaptive)**, **PG-A2 (Σ=total)**, **PG-A3 (byte-identity + round-trip)**, **PG-A4 (limit discovered, no magic number)**, **PG-A6 (resumability)** — `scripts`/`hf359-part-a.test.ts`, 6/6:
```
   [PG-A1] 5000 rows: narrow(3col)=5 pulses, wide(87col)=18 pulses; all ≤ 1MB        (ADAPTS to width)
   [PG-A2] 86607 rows × 87 cols → 10 byte-budgeted pulses (budget 32MB), Σ rows = 86607 (exact), contiguous
   [PG-A3] metadata byte-identical (no-change + changed-row) and round-trips
   [PG-A4] bucket→419430400 bytes; fallback→33554432 bytes (surfaced); 20K is MAX_PULSE_ROWS cap, not the boundary
   [PG-A6] cross-pulse rollback removed; failure returns prior batchIds (resumable); lone oversized row not split
✔ PG-A1 ✔ PG-A2 ✔ PG-A3 ✔ PG-A4 ✔ PG-A4b ✔ PG-A6   (6/6)
```
**PG-A6:** the cross-pulse `rollbackBatches` is removed (D16 unit-atomic → pulse-atomic): a mid-sequence pulse failure leaves all prior pulse-batches committed (resumable); the failed pulse rolled back its own batch (`commitContentUnit.failCommit`); the failure is recorded at the boundary by execute-bulk (HF-358 Part B `recordCommitFailureOnJob`).

---

## PART B — restored pulse progression

The per-unit pulse counters are SET per key (last-write-wins), so a multi-pulse unit showed only the last pulse. `commitUnitStreamed`/`commitUnitWindowed` now own the unit telemetry — seed (exact total + the `~Y` estimate), per landed pulse write the CUMULATIVE pulse index + rows through the EXISTING `accumulateUnitCommitFields` (after `commitContentUnit`, so last-write wins), then resolve `~Y` → the exact count + `batchCommitted` on success. `ImportTelemetryPanel` renders **"Writing pulse X of ~Y"** + "N of M rows committed" from the existing `t.pulses`/`t.rows`. `~Y` = `estimatePulseTotal(total, avgRowBytes, budget)`, refined upward by `Math.max` as pulses land (honest estimate, never false precision; streamed total via a cheap `streamSheetMeta` `<dimension>` read).

**PG-B1 / PG-B2 / PG-B3** — `hf359-part-b.test.ts`, 4/4:
```
✔ PG-B1: commitUnitStreamed/Windowed emit cumulative per-pulse telemetry through the existing counters
✔ PG-B1b: estimatePulseTotal is the honest est-total-bytes / budget (refined upward by Math.max)
✔ PG-B2: the import surface renders "Writing pulse X of ~Y" from the existing telemetry counters
✔ PG-B3: reuse — the panel reads the existing session-state telemetry endpoint, not a new surface
```
Live browser-render confirmation is architect-pending (SR-44); the wiring + component are proven above.

---

## PART C — Clean Slate audit of what was cleared

HF-358 already threaded `perTable` (each table's `deleted` count) + `verified`/`residual` into the completion audit. Part C extends `deleteTenantScoped` to also capture **`rowsBefore`** (a tenant-scoped head-count before the delete), so the existing `perTable` payload answers **"present-before → deleted"** per table, alongside who/when/tenant/categories/verified/residual. Best-effort (failed pre-count → null; the delete still runs + reports). No second audit path; tenant-scoped (SR-39).

**PG-C1** — `hf359-clean-slate-audit.test.ts`, 3/3:
```
✔ PG-C1: a delete records rowsBefore (present-before) AND deleted, both tenant-scoped
✔ PG-C1: rowsBefore is best-effort — a failed pre-count → null, the delete still runs + reports
✔ PG-C1: the completion audit threads per-table counts + who/when/tenant/categories/verified/residual
```

---

## §5 — Build hygiene

- **PG-G1 (tsc):** clean at es2017 after every part.
- **PG-G2 (next build):** `rm -rf .next && npm run build` → "✓ Compiled successfully" and **`.next/BUILD_ID` generated** (`cIsL_-RP2IuB2FNhtNerp`) — verified the BUILD_ID exists, not the exit code alone (the HF-358 build-status hole). The "dynamic server usage" notices in the log are pre-existing, expected for cookie/request-using API routes; they do not fail the build (BUILD_ID present).
- **PG-G3 (clean build + dev):** `rm -rf .next` → build (BUILD_ID) → `npm run dev` → Ready in 1110ms; `/`→307, `/operate/import`→307 (login redirect — expected).
- **PG-G4 (FP-49):** probe output in `HF-359_ADR.md §3.1`.

**Test totals:** 35/35 (HF-359: 6 Part A + 4 Part B + 3 Part C; regression: 7 committed-row-csv + 3 p8 + 7 clean-slate-verify + 5 tenant-deletion).

## Zero residuals

All three parts complete to their proof gates: **A** (byte budget from the runtime limit, Σ-exact, byte-identical, resumable), **B** (cumulative pulse progression on the existing surface), **C** (audit of present-before → deleted). No deferrals, no reduced gates. Out-of-scope DIAG-078 Q5 (comprehension atoms) untouched.

## Architect-pending (SR-44 — yours; not CC-attested)

1. Merge the PR.
2. Clean Slate Casa Diaz (`2d9979ba…`, select `data`) → confirm `ok:true`, `verified:true`, **and** the audit record now shows per-table `rowsBefore` + `deleted`.
3. Re-import the 86,607-row file → confirm it commits the **full** row count across N byte-sized pulses with **no object-size failure**, and the **pulse progression ("Writing pulse X of ~Y")** is visible on the import surface as it runs.
4. Re-verify the sealed calculation anchors (BCL/Meridian/MIR) through this path before anything relies on it.
5. Cron stays off (`CRON_SECRET` unset) until you restore it; the HF-358 reclaim cap remains the prerequisite guard.
6. **Optional:** set the `ingestion-raw` bucket's `file_size_limit` so the budget derives from the real limit instead of the conservative 40MB fallback (the budget then = 0.8 × your bucket limit; the global limit still caps).

**Scale notes (architect-side):** keep the staged CSVs uncompressed (the S3 FDW loads a compressed file fully into DB memory); confirm whether the S3 wrapper streams or batch-fetches the per-pulse CSV read at gigabyte scale (a DB-side measurement).
