# OB-156: FILE STORAGE TRANSPORT — SERVER-SIDE BULK PROCESSING
## AP-1 / AP-2 Compliance | 119K Rows in Minutes, Not Hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST (MANDATORY)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — AP-1, AP-2, Section E (Scale Reference)
2. `SCHEMA_REFERENCE.md` — committed_data, import_batches
3. `OB-155_COMPLETION_REPORT.md` — P0 finding: 119K rows timed out after 65+ minutes

---

## THE PROBLEM

The current import pipeline sends row data as JSON in HTTP request bodies (AP-1 violation), using sequential chunk inserts driven by the browser (AP-2 violation). 119K rows took 65+ minutes and failed. The architecture rules state this must work for 2M+ records without re-architecture.

### Current Flow (Broken)
```
Browser → parse XLSX → chunk 2,000 rows → POST /api/import/sci/execute (rows in body) → repeat 60x
```

### Required Flow (AP-1/AP-2 Compliant)
```
Browser → upload file to Supabase Storage → POST /api/import/sci/execute (storage path only) → Server reads file, bulk inserts
```

---

## PHASE 0: DIAGNOSTIC

### 0A: Map Current Import Flow

```bash
# Where does the browser send row data?
grep -rn "row_data\|rows\|chunk\|CHUNK\|PAGE_SIZE\|batch.*insert" web/src/app/api/import/sci/execute/route.ts | head -30

# Where does the browser parse the file?
grep -rn "XLSX\|SheetJS\|read.*file\|parse.*xlsx\|workbook" web/src/components/sci/ web/src/app/operate/import/ --include="*.tsx" --include="*.ts" | head -20

# Does Supabase Storage bucket exist?
grep -rn "ingestion-raw\|storage.*bucket\|supabase.*storage" web/src/ --include="*.ts" --include="*.tsx" | head -10
```

### 0B: Identify the Handoff Point

Where does the browser currently hand off to the server? What data does the API route receive? Document the exact request body shape.

### 0C: Measure Current Performance

The OB-155 report says 65+ minutes for 47,783 rows (40% of 119K). That's ~735 rows/minute. The target for 119K rows should be under 5 minutes (~24K rows/minute). For 2M rows, under 30 minutes.

**Commit:** `OB-156 Phase 0: Import transport diagnostic`

---

## PHASE 1: FILE UPLOAD TO SUPABASE STORAGE

### 1A: Upload Component

The import surface (`/operate/import`) currently parses the file client-side and sends chunks. Change to:

1. User selects file
2. Browser uploads the raw file to Supabase Storage (`ingestion-raw` bucket)
3. Browser receives the storage path
4. Browser sends ONLY the storage path + tenant context to the API route

```typescript
// Browser side — upload to storage
const { data, error } = await supabase.storage
  .from('ingestion-raw')
  .upload(`${tenantId}/${crypto.randomUUID()}/${file.name}`, file);

// Then call API with path only — no row data
const response = await fetch('/api/import/sci/execute', {
  method: 'POST',
  body: JSON.stringify({
    storagePath: data.path,
    fileName: file.name,
    fileType: file.type,
    tenantId,
    // NO row data, NO parsed sheets, NO chunks
  })
});
```

### 1B: Verify Storage Bucket

Ensure `ingestion-raw` bucket exists in Supabase. If not, create it with appropriate RLS policies (tenant-scoped access).

### Proof Gate 1:
- PG-1: File uploads to Supabase Storage (not sent as JSON body)
- PG-2: API route receives storage path, not row data
- PG-3: Build clean

**Commit:** `OB-156 Phase 1: File upload to Supabase Storage — no row data in HTTP bodies`

---

## PHASE 2: SERVER-SIDE FILE PROCESSING

### 2A: Server Reads from Storage

The API route receives the storage path, downloads the file from Supabase Storage using the service role client, and processes it entirely server-side:

```typescript
// Server side — read from storage
const { data: fileData, error } = await supabase.storage
  .from('ingestion-raw')
  .download(storagePath);

// Parse XLSX server-side
const workbook = XLSX.read(await fileData.arrayBuffer(), { type: 'array' });
```

### 2B: Bulk Insert

Instead of 2,000-row chunks via sequential HTTP calls, the server does ONE bulk operation per sheet:

```typescript
// Service role client for bulk writes (AP-3 compliant)
const serviceClient = createClient(url, serviceRoleKey);

// Bulk insert — 5,000+ row chunks minimum (AP-2 compliant)
const BULK_CHUNK_SIZE = 5000;
for (let i = 0; i < rows.length; i += BULK_CHUNK_SIZE) {
  const chunk = rows.slice(i, i + BULK_CHUNK_SIZE);
  await serviceClient.from('committed_data').insert(chunk);
}
```

### 2C: SCI Classification Still Runs

The file storage transport changes HOW data gets to the server, not WHAT happens to it. SCI classification (analyze), entity construction, source_date extraction, assignment creation — all still run. They just run server-side on the full dataset instead of being called 60 times from the browser.

### 2D: Progress Reporting

The browser needs to know import progress. Two options:

**Option A (Simple):** Polling. Browser sends import request, receives a job ID. Polls `/api/import/status/{jobId}` every 5 seconds. Server updates progress in import_batches table.

**Option B (Real-time):** Supabase Realtime subscription on import_batches row. Server updates `status` and `metadata.progress` as it processes. Browser sees live progress.

Option A is simpler and sufficient for now. Option B is better UX for later.

### Proof Gate 2:
- PG-4: Server downloads file from storage and parses server-side
- PG-5: Bulk insert uses service role client with ≥5,000-row chunks
- PG-6: SCI classification runs server-side
- PG-7: Browser does not send row data

**Commit:** `OB-156 Phase 2: Server-side bulk processing — file storage transport`

---

## PHASE 3: PERFORMANCE VERIFICATION

### 3A: Import Óptica Dataset

Nuclear clear Óptica first (HF-088 script). Then import the full 119K-row file through the browser using the new transport.

### 3B: Measure Time

```
Start: [timestamp]
Upload to storage: [seconds]
Server processing: [seconds]
Total: [seconds]
```

Target: under 5 minutes for 119K rows. Under 2 minutes is ideal.

### 3C: Verify Data Integrity

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id) as total_rows,
  (SELECT count(*) FROM import_batches WHERE tenant_id = t.id) as batches
FROM t;
```

Expected: ~119,129 rows in committed_data. Fewer import_batches than before (not 26+ chunks).

### Proof Gate 3:
- PG-8: 119K rows imported in under 5 minutes
- PG-9: committed_data count ≈ 119,129
- PG-10: Import batches ≤ 10 (not 26+)
- PG-11: Build clean

**Commit:** `OB-156 Phase 3: Performance verified — 119K rows in [time]`

---

## PHASE 4: COMPLETION REPORT + PR

Write `OB-156_COMPLETION_REPORT.md`. Include:
1. Before/after performance comparison (65+ min → [new time])
2. Architecture compliance (AP-1, AP-2, AP-3 all satisfied)
3. Scale analysis: will this work for 2M rows? 10M?
4. All proof gates PASS/FAIL

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-156: File Storage Transport — Server-Side Bulk Processing" \
  --body "## What This OB Fixes

### Before
- 119K rows: 65+ min, timed out at 40%
- Row data in HTTP bodies (AP-1 violation)
- Sequential 2K-row chunks from browser (AP-2 violation)

### After
- 119K rows: [time]
- File uploaded to Supabase Storage, path sent to API
- Server-side bulk insert (5K+ chunks, service role client)

### Scale Analysis
- 119K rows: [time]
- Projected 2M rows: [estimate]
- Architecture supports 10M+ without modification

## Proof Gates: see OB-156_COMPLETION_REPORT.md"
```

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | File to storage | Uploaded, not in HTTP body |
| PG-2 | API receives path | No row data in request |
| PG-3 | Build clean | `npm run build` exits 0 |
| PG-4 | Server reads from storage | Downloads + parses server-side |
| PG-5 | Bulk insert | ≥5,000-row chunks, service role |
| PG-6 | SCI runs server-side | Classification on full dataset |
| PG-7 | No row data in HTTP | Request body < 1KB |
| PG-8 | Performance | 119K in < 5 minutes |
| PG-9 | Data integrity | ≈ 119,129 committed rows |
| PG-10 | Batch count | ≤ 10 import_batches |
| PG-11 | Build clean | Final build |

---

## WHAT NOT TO DO

1. **Do NOT keep chunked HTTP as a fallback.** Remove it. One code path.
2. **Do NOT parse the file client-side.** The browser uploads the raw file. The server parses.
3. **Do NOT use the browser Supabase client for bulk writes.** Service role on server only. (AP-3)
4. **Do NOT process one sheet at a time via separate API calls.** One upload, one API call, server handles all sheets.
5. **Do NOT add progress via console.log.** Use import_batches metadata for progress tracking.

---

*OB-156 — March 4, 2026*
*"The file goes up once. The server does the work. The browser watches."*
