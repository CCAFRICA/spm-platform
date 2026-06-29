# OB-254 — Phase 1: Surface Discovery + Consumer Map (EPG-1) + HALT-1

Branch `ob-254-structural-construction` @ `da73d10c`. Date 2026-06-29. Evidence-backed (executed greps + first-hand reads). **Conclusion: HALT-1 (insertion-point mismatch) — the §2 insertion point does not exist in the live topology. Reported below for architect disposition; §3.2 NOT begun (directive: "do not improvise a different insertion point").**

The actual test file is recoverable: `processing_jobs` (Casa Diaz `2d9979ba`) carries `file_storage_path = 2d9979ba-.../1782750324291_0_01247327_COMISIONES___AUTORIZADOS_-_copia.xlsx`, downloadable from bucket **`ingestion-raw`** (90,535 bytes). Confirmed 8 sheets: `LOCALES REFAC | FORANEAS REFAC | MAQUINARIA (2) | MAQUINARIA | COMISIÓN GARANTIZADA | DISTRIBUIDORES | DIST Y SUC | PULL (EXTERNOS)`. LOCALES REFAC row0 = `["COMISIONES SUCURSALES LOCALES", null×9]` (title banner), row1 = all-null — real header is below, exactly as §1 describes. The EPG harnesses can download it from storage at runtime (reproducible; no customer data committed to the repo).

---

## §3.1 grep evidence (EPG-1)

**Parse / where header+columns are first established** (`web/src/app/api/import/sci/process-job/route.ts`):
```
:138  const workbook = XLSX.read(buffer, { type: 'array', dense: true });        // OB-251 dense read
:151  const reader = openSheetWindow(XLSX, ws, sheetName);                        // LARGE sheet: windowed
:153  sheets.push({ sheetName, columns: reader.columns, rows: sample, totalRowCount: reader.totalRows });
:158  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });  // NORMAL sheet
:159  const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];        // ← header-keyed (__EMPTY) HERE
:160  sheets.push({ sheetName, columns, rows: jsonData, totalRowCount: jsonData.length });
```
`web/src/lib/sci/sheet-stream.ts:25-40` — `openSheetWindow` builds canonical column keys "EXACTLY as `sheet_to_json`": a blank header cell → `'__EMPTY'` (repeats → `'__EMPTY_1'`). So **both** parse branches collapse the raw grid to header-keyed row-objects at parse, keyed on **row 1** — which is the banner/blank on 7 of 8 sheets → `__EMPTY` poisoning.

**Fingerprint computation** (`web/src/lib/sci/structural-fingerprint.ts`): `computeFingerprintHashSync(columns, sampleRows)` — "Operates on header + sample rows only" (`:12`); the composite hashes `columns` (the keyed header names) + per-column type detection (`:63-170`). A `__EMPTY` header → a meaningless, unstable fingerprint (the DS-017 poisoning).

**Content Profile entry** (`web/src/lib/sci/content-profile.ts`): `generateContentProfileStats(columns, sampleRows, totalRowCount, …)` (`:429`) — receives the **already-keyed columns + sample row-objects**, NOT the raw grid. `:454 columns.some(c => c.includes('__EMPTY'))` (it only *detects* the poisoning; it cannot fix it — the grid is gone).

**Header Comprehension** (`web/src/lib/sci/header-comprehension.ts` `runDecomposedComprehension`) — the LLM recognition boundary; consumes `{columns, rows}` per sheet.

**Agent scoring** (`web/src/lib/sci/synaptic-ingestion-state.ts`, `resolver.ts`, `agents.ts`) — `:227` even emits a warning "Auto-generated headers detected (__EMPTY pattern)".

**Routing / G7 signal write**: `committed_data` written via `commit-content-unit.ts` / `windowed-commit.ts`; `classification_signals` is the single signal surface (`classification-signal-service.ts:335/538/739`, `comprehension-state-service.ts:311/370`). Confirmed one signal table.

## Orchestration ORDER (the decisive evidence) — `process-job/route.ts`
```
:138-162  parse → sheets[] = {columns (KEYED, __EMPTY), rows (KEYED row-objects), totalRowCount}
:186-188  fingerprintHash = computeFingerprintHashSync(primarySheet.columns, primarySheet.rows)   ← FINGERPRINT
:197-200  lookupFingerprint(tenantId, sheet.columns, sheet.rows)   ← FLYWHEEL READ (Tier routing, skip-LLM decision)
:232-237  generateContentProfileStats(sheet.columns, sampleRows, …)   ← CONTENT PROFILE
:250-252  runDecomposedComprehension(…)   ← HEADER COMPREHENSION (LLM)
:278      generateContentProfilePatterns(…)
```

## Consumer table
| Surface | File:entry | In | Out |
|---|---|---|---|
| Parse | `process-job/route.ts:138-162` (XLSX.read + sheet_to_json / openSheetWindow) | raw buffer | `sheets[] = {columns(keyed), rows(keyed objects), totalRowCount}` — **grid already collapsed** |
| Fingerprint | `structural-fingerprint.ts:computeFingerprintHashSync` (called `process-job:186`, `:197`) | `columns, sampleRows` | hash → flywheel Tier — **BEFORE Content Profile** |
| Content Profile | `content-profile.ts:generateContentProfileStats` (`process-job:232`) | `columns, sampleRows` | `ContentProfile` (no raw grid) |
| Header Comprehension | `header-comprehension.ts:runDecomposedComprehension` (`process-job:250`) | `{sheetName,columns,rows}` | interpretations (LLM) |
| Agent scoring | `synaptic-ingestion-state.ts` / `resolver.ts` / `agents.ts` | profile + interpretations | classification |
| Routing | `commit-content-unit.ts` / `windowed-commit.ts` | content unit | `committed_data.row_data` (+ windowed re-read of the sheet at commit) |
| Signal write (G7) | `classification-signal-service.ts` | observations | `classification_signals` (single surface ✓) |

---

## HALT-1 — the §2 insertion point does not exist in the live topology

§2/§3.1 specify the insertion point as *"the first step inside Content Profile, operating on the parsed cell grid, before structural profiling and before the fingerprint is computed."* §3.1 then states the explicit HALT-1 trigger: *"If ... fingerprint is computed before Content Profile, OR parsing already collapses to a single header upstream ... HALT-1 and report — do not improvise."* **Both triggers are met, plus a third scale divergence:**

1. **The fingerprint is computed/looked-up BEFORE Content Profile** — `process-job:186` & `:197` precede `:232`. So "inside Content Profile, before the fingerprint" is impossible: by the time Content Profile runs, the (poisoned) fingerprint has already been computed and the flywheel Tier (skip-LLM) decision already made. To fix the DS-017 poisoning, the header MUST be corrected before `:197`, which is **before** Content Profile.
2. **Parsing already collapses to a single (row-1) header** at `process-job:158-160` (`sheet_to_json` → `Object.keys`) and `:151-153` (`openSheetWindow`, identical key rule). Content Profile never receives the raw cell grid the de-bander needs — it receives keyed columns + sample row-objects. The grid (array-of-arrays) is not retained as an artifact.
3. **Scale path (OB-251) does not materialize the full grid** for large sheets — `process-job:148-153`: a sheet over the cell ceiling is read by `openSheetWindow` on a **bounded sample**, never the full grid (the OOM defense). The de-bander needs the full grid to classify every row and segment blocks. SR-2 (singular path for *all* sheets) collides with the windowed-parse-for-scale path here: an 86K-row transaction extract cannot be fully materialized for de-banding without re-introducing the OOM that OB-251 fixed.

### The actual correct insertion point (reported, NOT improvised/built)
The de-bander must run at the **parse→sheets boundary** in `process-job/route.ts` (and the parallel `analyze/route.ts`), immediately after the worksheet is read, taking the **raw grid** (`sheet_to_json(ws, {header:1})` — array-of-arrays, which the live code does NOT currently produce; it goes straight to the keyed form), de-banding into tidy units, and emitting corrected `{columns, rows}` per unit that then flow into fingerprint (`:186/197`) → Content Profile (`:232`) → HC (`:250`). The degenerate single-header sheet passes through unchanged.

### Architect dispositions needed before §3.2
- **D1 — Insertion point:** confirm the de-bander inserts at the parse→sheets boundary (before fingerprint), in BOTH `process-job` and `analyze` (a shared helper), reading the raw `{header:1}` grid — NOT "inside Content Profile" (which is after the fingerprint and never sees the grid).
- **D2 — Scale composition (SR-2 vs OB-251 windowing):** how does the de-bander compose with the windowed-parse path for over-ceiling sheets? Options: (a) de-band only sheets that fit the cell ceiling (full grid); over-ceiling sheets are treated as degenerate single-header (banded reports are small — Casa Diaz is 257 rows — so this is safe in practice, but it means the singular-path is "de-band when the grid fits, degenerate otherwise"); (b) window-aware de-banding on the bounded sample (detect bandedness from the sample, apply at commit). (a) is simpler and preserves OB-251; (b) is more general but heavier. CC recommends (a) but will not pick silently.
- **D3 — Commit-time reproducibility:** the actual commit re-reads the sheet **windowed** (`windowed-commit.ts` / `commit-content-unit.ts`) for lossless byte-identical commit (OB-251 PG-11). The de-bander's row classification + `__section` lift + sidecar must be reproducible at commit time (or persisted from Phase A), so the windowed commit writes the *tidy* rows + `__section`, not the raw banded rows. Confirm whether the de-bander output is carried into the commit path as a per-row transform map, or re-derived at commit.

None of these can be improvised without violating §4 HALT-1. The build (§3.2) proceeds once D1–D3 are dispositioned. The de-bander algorithm itself (§3.2a–2h) is unaffected by these — only its *insertion + scale composition* depend on the dispositions; CC can build and EPG-2-prove the stage as a pure function on the raw grid in parallel, but will not WIRE it (§3.4) until D1–D3 are settled.
