# HF-359 — Architecture Decision Record

**Work item:** HF-359 — Byte-Budgeted Pulse + Restored Pulse Progression + Clean Slate Audit of What Was Cleared
**Worktree base SHA:** `34fe7db3` (origin/main — OB-255) · **Mode:** ULTRACODE · **Date:** 2026-06-29
Committed BEFORE implementation (§3 gate). Unifying invariant: **the system measures the real constraint and sizes itself to it — never a developer's guess as a load-bearing limit; it shows the work as it moves; it records what it destroys.**

---

## §3.1 — Schema facts (FP-49, live probe `scripts/_hf359_schema_probe.ts`)

```
— ingestion-raw bucket (getBucket) —
  id=ingestion-raw public=false file_size_limit=null allowed_mime=null
— listBuckets —
    imports            file_size_limit=524288000   (500 MB)
    ingestion-raw      file_size_limit=null
    ingest-quarantine  file_size_limit=null
— audit_logs columns —
  id, tenant_id, profile_id, action, resource_type, resource_id, changes, metadata, ip_address, created_at
  latest tenant.clean_slate changes keys: phase, perTable, residual, verified, categories, totalDeleted,
                                          collateralEffects, unlinkedCalcTraces
— import_session_telemetry columns —
  id, tenant_id, import_session_id, total_signals_written, signals_per_type, unit_states, conclusion, audit,
  created_at, updated_at
```

**Facts (stated, not assumed):**
- **The `ingestion-raw` bucket has NO per-bucket `file_size_limit` (null).** The enforced limit is therefore the **project global** storage file-size limit, which the storage API does **not** expose (`getBucket` returns null for the bucket). So at runtime the bucket limit reads as null → "the limit cannot be read for this bucket" → the labeled fallback applies and must surface (§3.2). The `imports` bucket carries 500MB, confirming `file_size_limit` is the right field when a bucket sets it.
- **`audit_logs.changes` is JSONB** and the live `tenant.clean_slate` completion record **already carries `perTable`** (HF-358 wrote `result.results`, each `{table, deleted, status, error}`) + `verified`/`residual`/`categories`/`totalDeleted`. So the per-table **deleted** counts are already captured; Part C's remaining gap is **rows-present-before** (§3.5).
- **`import_session_telemetry.unit_states`** (jsonb) holds the per-unit pulse counters (`pulsesTotal`, `pulsesLanded`, `rowsCommitted`, `expectedRows`) written by `accumulateUnitCommitFields`; `ImportTelemetryPanel` already renders "X of Y pulses" + rows from `projectImportTelemetry` — the existing infrastructure Part B reuses (§3.4).

## §3.2 — Limit-discovery decision (the key ULTRACODE call)

**Mechanism.** A new `lib/sci/storage-budget.ts:discoverUploadByteBudget(supabase)` reads `supabase.storage.getBucket('ingestion-raw').file_size_limit` at runtime. The byte budget = **`HEADROOM_FRACTION` × the discovered limit**, with a labeled fallback when the limit is unreadable:
- `effectiveLimit = (bucket.file_size_limit > 0) ? bucket.file_size_limit : FALLBACK_LIMIT_BYTES`.
- When the fallback is used (the `ingestion-raw` reality today — null), the function **surfaces it** (console.warn + a `usedFallback`/`limitSource` flag returned to the caller, which logs it on the commit trace) — never a silent guess.
- `byteBudget = floor(HEADROOM_FRACTION × effectiveLimit)`.

**The ONLY constants, both labeled safety bounds (neither is the pulse-sizing mechanism):**
- `HEADROOM_FRACTION = 0.8` — safety margin below the limit (quoting/encoding variance + the rare remediation-grown row).
- `FALLBACK_LIMIT_BYTES = 40 * 1024 * 1024` (40MB) — the conservative last-resort used ONLY when the bucket limit is null/unreadable; chosen below common Supabase global defaults so a pulse stays under the (unreadable) global limit. Surfaced when used.

**The 20,000-row count is ELIMINATED as the boundary.** It survives only as `MAX_PULSE_ROWS` — an upper **safety cap** on rows-per-pulse (bounds the raw rows held in memory for a pathologically narrow file), never the primary boundary. The budget governs; the cap only prevents an unbounded-rows pulse.

**Architect note (surfaced, SR-44):** because the bucket limit is null, the budget is governed by the conservative fallback. The architect may set `ingestion-raw.file_size_limit` (as `imports` does) so the budget derives from the real bucket limit — but the *effective* limit is `min(bucket, global)` and the global is not API-readable, so the fallback ceiling remains the safety bound regardless.

## §3.3 — Pulse mechanism decision (one path, not a new one)

**The byte boundary REPLACES the row-window boundary inside the existing streamed/windowed commit path — `commitContentUnit` is unchanged.**
- `streamSheetWindows` (the streamed path) and the `openSheetWindow` reader loop (the XLSX.read path) flush a pulse by **bytes**, not by `windowRows`: a shared `lib/sci/pulse-accumulator.ts` tracks the accumulating pulse's serialized CSV bytes via a `rowBytes(row)` callback; it flushes the pulse **before** a row would push it over `byteBudget` (so every pulse ≤ budget), or at `MAX_PULSE_ROWS` (the safety cap). A single row larger than the budget is flushed alone and surfaced (never silently split a row).
- `rowBytes(row)` = `byteLength(committedRowToCsvLine(projection)) + 1` — the **same serializer** `commitContentUnit` uses, applied to the committed-row projection built from the unit's **real** metadata (`semantic_roles` via `buildSemanticRolesMap`, `field_identities` via the same `extractFieldIdentitiesFromTrace`/`buildFieldIdentitiesFromBindings` helpers `commitContentUnit` uses — REUSE, not a second serializer). Remediation corrections (a few cells) are not yet applied at measurement time; their byte drift is negligible and the headroom fraction covers it. A test asserts the estimator's per-row bytes match `commitContentUnit`'s actual CSV line within tolerance (PG-A3-adjacent).
- **Each byte-bounded pulse → one `commitContentUnit` call → its own `import_batch`** — identical topology to today's window→batch (`windowed-commit.ts:9`), only the boundary differs. This gives, for free: **byte-identical committed rows** (`commitContentUnit`'s `buildCommittedRow` + `committedRowsCsvStream` untouched — Decision 158), **per-pulse resumability** (a pulse failure rolls back only its own batch via the existing `failCommit`; prior pulse-batches survive), and **one telemetry pulse per byte-pulse** (the existing `accumulateUnitCommitFields` `pulsesLanded += 1` per `commitContentUnit` call — §3.4).
- **Memory stays flat (HF-358 preserved):** the accumulator holds one pulse's raw rows (≤ `MAX_PULSE_ROWS`, ≈ the prior window) and `commitContentUnit` streams the CSV (HF-358 `committedRowsCsvStream`) — peak heap is one bounded slice regardless of pulse/file size.
- **Σ(pulse row counts) = total rows, exactly:** the accumulator partitions the streamed rows — every row enters exactly one pulse, none dropped or duplicated (PG-A2 proves it).

## §3.4 — Progression decision (honest progress, reuse not parallel)

- **Rows:** the exact total is known from the parse (`streamSheetWindows`/reader `totalRows`); `rowsCommitted` accrues per pulse — both already in `import_session_telemetry` via `accumulateUnitCommitFields` → `ImportTelemetryPanel` "N of total rows committed".
- **Pulses:** the count is NOT known upfront under byte-budgeting (it emerges). `pulsesTotal` is set to an **estimate** = `ceil(estimatedTotalCsvBytes / byteBudget)` (estimatedTotalCsvBytes from a sampled average `rowBytes` × total rows), shown as **"~Y"** (honest estimate, never false precision); `pulsesLanded` increments per landed pulse and the estimate is refined as pulses land. **Reuses the existing `pulsesTotal`/`pulsesLanded` counters + `ImportTelemetryPanel`** (DS-016 PULSE vocabulary, "Writing pulse X of ~Y") — no parallel counting concept, no new surface.

## §3.5 — Clean Slate audit decision (extend, not a second path)

The completion audit already records `perTable: result.results` (per-table `deleted` count) + `verified`/`residual`. Part C **extends** `deleteTenantScoped` to also capture **`rowsBefore`** (a `count:'exact', head:true` read before the delete) on each `TableDeleteResult`, so the existing `perTable` payload answers "rows present before → rows deleted" per table — alongside who/when/tenant/categories/verified/residual already present. No second audit write.

## §3.6 — Anti-Pattern Registry pass

- **No enumerated-domain set (AUD-009):** the budget is derived from the runtime limit; no domain literals.
- **No parallel path:** byte-pulse replaces the row boundary inside the one commit path (`commitContentUnit` untouched); telemetry reuses `accumulateUnitCommitFields` + `ImportTelemetryPanel`; audit extends the one Clean Slate write.
- **No developer-set pulse-size number as the boundary:** the 20K row count is demoted to a labeled safety cap; the boundary is `HEADROOM_FRACTION × discovered_limit`; the only constants are the headroom fraction + the surfaced fallback floor (both safety bounds).
- **Decision 158 intact:** the commit is deterministic (no LLM); committed-row bytes are byte-identical (`commitContentUnit` unchanged); Σ(pulse counts) = total exactly.

**No structural conflict. Proceeding.** (Caveats surfaced: the bucket limit is null so the budget rides the conservative fallback; the FDW load + 86K end-to-end + live Clean Slate are architect-verified, SR-44.)
