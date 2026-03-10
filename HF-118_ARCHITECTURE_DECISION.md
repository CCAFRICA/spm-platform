# HF-118 Phase 0: Architecture Decision Record
## Import Pipeline Truncation — 67 Rows In File, 50 In committed_data

### Problem
XLSX has 67 rows per sheet. committed_data has 50. 17 rows silently dropped during import.

### Truncation Point Found

**Where:** `web/src/components/sci/SCIUpload.tsx:177`

**What:** `SAMPLE_ROWS = 50` (line 144) — client-side truncation of parsed XLSX data:
```typescript
const SAMPLE_ROWS = 50;

// Line 167-170: Parse ALL rows from XLSX
const sampleData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
  defval: '',
  range: 0,
});

// Line 177: TRUNCATE to 50 rows — ALL DATA BEYOND ROW 50 IS DISCARDED
const sampleRows = sampleData.slice(0, SAMPLE_ROWS);
```

**Why it exists:** OB-156 comment: "Maximum rows to parse client-side (sample for AI analysis only). Full data is parsed server-side from the Storage-uploaded file."

The design intention was:
1. Client sends 50-row sample to AI for classification (analyze API)
2. Client uploads full file to Supabase Storage in parallel
3. Server downloads full file from Storage during execution (execute-bulk API)

**Why it fails:** When the Storage upload fails (permissions, network, bucket config), the fallback `executeLegacyUnit` path uses `rawData` which only contains the 50-row sample. The full data was parsed at line 167, then immediately discarded at line 177.

### Secondary Truncation
`web/src/app/operate/import/page.tsx:47` — `ANALYSIS_SAMPLE_SIZE = 50`:
```typescript
rows: s.rows.slice(0, ANALYSIS_SAMPLE_SIZE)
```
This truncates rows for the ANALYZE API call only. This is correct — AI classification only needs a sample. This limit should stay.

### Evidence
- `sampleData` at line 170: ALL 67 rows parsed from XLSX
- `sampleRows` at line 177: only 50 rows (`.slice(0, 50)`)
- `parsedData.sheets[].rows` at line 189: 50 rows stored
- `rawDataRef.current` at import/page.tsx:93: 50 rows persisted
- `executeLegacyUnit` at SCIExecution.tsx:247: `rawData: sheetData?.rows || []` — 50 rows sent to execute API

### Fix

**Option A: Keep all parsed rows in parsedData, sample only at analyze-time**
- Remove `.slice(0, SAMPLE_ROWS)` from SCIUpload.tsx line 177
- `ANALYSIS_SAMPLE_SIZE` in import/page.tsx already handles analyze-time truncation
- Scale test: Works at 10x? Yes — `sheet_to_json` already parses ALL rows (line 167), the slice only discards memory. For truly large files (10K+), Storage bulk path is primary; legacy fallback is degraded-mode safety net.
- AI-first: No hardcoding. No change to AI analysis.
- Transport: Analyze path sends sample. Execute bulk reads from Storage. Legacy fallback sends all rows (already sends rows via HTTP by design — this is the fallback, not the primary path).
- Atomicity: No change.

**Option B: Force Storage upload success**
- Scale test: Works at 10x? Depends on Storage availability.
- Problem: Can't guarantee external service availability.
- REJECTED: Does not fix the fallback path.

**Option C: Re-parse file in legacy fallback**
- Scale test: Works at 10x? Yes.
- Problem: Requires passing raw File object through React state, re-parsing is wasteful.
- REJECTED: Over-engineered. The data is already parsed — just don't throw it away.

**CHOSEN:** Option A — keep all parsed rows, sample only at analyze-time.

---
*HF-118 Phase 0 | March 9, 2026*
