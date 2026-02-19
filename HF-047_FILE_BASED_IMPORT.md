# HF-047: FIX 413 PAYLOAD LIMIT — FILE-BASED IMPORT PIPELINE

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS HOTFIX EXISTS

CLT-64 testing: "Approve & Import" on RetailCDMX (119,129 records) returns HTTP 413 (Payload Too Large). HF-045 moved the import to a server-side API route but sends ALL transformed rows as JSON in a single POST body. Vercel serverless functions have a 4.5MB body limit. 119K records as JSON far exceeds this.

**This is an architecture design error.** A platform designed to process millions of records cannot send data as JSON payloads through serverless function HTTP bodies. The data must flow through storage, not HTTP.

**Console errors:**
```
POST https://vialuce.ai/api/import/commit [HTTP/2 413 1286ms]
Import commit error: Error: Import failed (413)
```

---

## THE DESIGN PROBLEM

HF-045 correctly moved the commit from browser-side to server-side but chose the wrong data transport:

```
WRONG (HF-045 approach):
Browser → [119K rows as JSON in HTTP body] → Vercel Function → Supabase
                    ↑ THIS IS 50-100MB
                    ↑ Vercel limit: 4.5MB

RIGHT (file-based approach):
Browser → [Upload file to Supabase Storage] → Vercel Function reads from Storage → Supabase tables
                                                        ↑ No payload limit
                                                        ↑ Scales to millions of rows
```

**The platform must handle:**
- 119K records (RetailCDMX — current test case)
- 500K records (mid-market customer with 12 months of history)
- 2M+ records (enterprise customer with daily transaction data)

Sending records as JSON in HTTP bodies will NEVER work at scale. The data pipeline must be file-based.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Final step: `gh pr create --base main --head dev`
4. **SUPABASE MIGRATIONS: Must execute live via `supabase db push` or SQL Editor AND verify with DB query. File existence ≠ applied.**

---

## THE FIX: FILE-BASED IMPORT PIPELINE

### Architecture

```
STEP 1: Client uploads Excel file to Supabase Storage
  → bucket: 'imports'
  → path: {tenant_id}/{batch_id}/{filename}
  → Returns: storage path

STEP 2: Client sends metadata to API route (tiny payload)
  POST /api/import/commit
  {
    tenantId: "...",
    importBatchId: "...",
    storagePath: "imports/{tenant_id}/{batch_id}/file.xlsx",
    fieldMappings: { ... },     // Small: ~2KB (column mappings, not row data)
    sheetConfig: { ... },       // Small: ~1KB (which sheets, entity roster, etc.)
    planConfig: { ... }         // Small: ~1KB (rule set ID, component mappings)
  }
  → Total payload: < 50KB regardless of file size

STEP 3: Server-side API route
  - Downloads file from Supabase Storage
  - Parses Excel server-side (using xlsx/sheetjs)
  - Applies field mappings
  - Resolves entities (bulk)
  - Detects/creates periods (deduplicated)
  - Bulk inserts committed_data (5,000-row chunks)
  - Updates import batch status
  - Returns result

STEP 4: Client receives result
  { success: true, entityCount: N, periodCount: N, recordCount: N }
```

### Why this scales to millions

1. **No payload limit** — File size is limited by Supabase Storage (5GB free tier), not HTTP body
2. **Server-side parsing** — Excel parsed on the server with full Node.js memory, not browser
3. **Streaming possible** — Future: read file in chunks, process rows as a stream
4. **Resumable** — If the function times out (Vercel Pro: 60s), the file is still in storage and can be retried
5. **Audit trail** — Original file preserved in storage alongside the processed results

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-047 PHASE 0: IMPORT PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CURRENT API ROUTE — PAYLOAD HANDLING ==="
head -80 web/src/app/api/import/commit/route.ts

echo ""
echo "=== 0B: WHAT THE CLIENT SENDS ==="
grep -B5 -A20 "api/import/commit" web/src/app/data/import/enhanced/page.tsx | head -40
grep -B5 -A20 "api/import/commit" web/src/app/operate/import/enhanced/page.tsx 2>/dev/null | head -40

echo ""
echo "=== 0C: SUPABASE STORAGE — EXISTING SETUP ==="
grep -rn "storage\|bucket\|upload\|supabaseStorage" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== 0D: XLSX PARSING — SERVER-SIDE AVAILABILITY ==="
grep -rn "xlsx\|sheetjs\|ExcelJS\|read.*xlsx\|parse.*xlsx" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10
ls web/node_modules/xlsx 2>/dev/null && echo "xlsx installed" || echo "xlsx NOT installed"

echo ""
echo "=== 0E: NEXT.CONFIG — CURRENT BODY SIZE LIMIT ==="
grep -A5 "bodyParser\|serverActions\|sizeLimit\|maxDuration" web/next.config.mjs | head -15

echo ""
echo "=== 0F: VERCEL CONFIG — FUNCTION LIMITS ==="
cat web/vercel.json 2>/dev/null || echo "No vercel.json"

echo ""
echo "=== 0G: GPV WIZARD — SAME ISSUE? ==="
grep -B5 -A20 "api/import/commit" web/src/components/gpv/GPVWizard.tsx | head -40
```

**Commit:** `HF-047 Phase 0: Import pipeline 413 diagnostic`

---

## PHASE 1: CREATE SUPABASE STORAGE BUCKET

### 1A: Create 'imports' bucket

Create a migration or script to set up the storage bucket:

```sql
-- Create imports bucket for file-based import pipeline
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,  -- private: only authenticated users
  524288000,  -- 500MB limit per file
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;
```

### 1B: Storage RLS policies

```sql
-- Users can upload to their tenant's folder
CREATE POLICY "Tenant upload access"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM profiles WHERE auth_user_id = auth.uid()
  )
);

-- Users can read their tenant's files
CREATE POLICY "Tenant read access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM profiles WHERE auth_user_id = auth.uid()
  )
);

-- VL Admin full access
CREATE POLICY "VL Admin full storage access"
ON storage.objects FOR ALL
USING (
  bucket_id = 'imports'
  AND EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
)
WITH CHECK (
  bucket_id = 'imports'
  AND EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
);
```

### 1C: Execute migration live

**CRITICAL:** Run this SQL in Supabase SQL Editor AND verify:

```sql
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'imports';
-- Expected: 1 row

SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
-- Expected: includes tenant and VL Admin policies
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | imports bucket exists | Supabase query | Row returned |
| PG-2 | Storage policies created | pg_policies query | Policies exist |

**Commit:** `HF-047 Phase 1: Supabase Storage bucket for imports`

---

## PHASE 2: UPDATE CLIENT — UPLOAD FILE TO STORAGE FIRST

### 2A: Enhanced Import page

Before calling `/api/import/commit`, upload the file to Supabase Storage:

```typescript
// Step 1: Upload file to Supabase Storage
const storagePath = `${tenantId}/${importBatchId}/${file.name}`;
const { data: uploadData, error: uploadError } = await supabase.storage
  .from('imports')
  .upload(storagePath, file, {
    contentType: file.type,
    upsert: true,
  });

if (uploadError) throw new Error(`File upload failed: ${uploadError.message}`);

// Step 2: Send metadata only to API route (tiny payload)
const response = await fetch('/api/import/commit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantId,
    importBatchId,
    storagePath,
    fieldMappings,    // ~2KB
    sheetConfig,      // ~1KB
    planConfig,       // ~1KB
  }),
});
```

### 2B: GPV Wizard — same change

Update the GPV wizard to upload file to storage first, then send metadata.

### 2C: Progress feedback

Show upload progress to user:
```
"Uploading file..." → "Processing data..." → "Import complete!"
```

The file upload has progress events. The server processing does not (single HTTP call), but it should complete in < 60 seconds.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-3 | Client uploads file to Supabase Storage | Code review | storage.upload() call present |
| PG-4 | API call payload < 50KB | Code review | Only metadata, no row data |
| PG-5 | GPV wizard uses same approach | Code review | storage.upload() in GPV |
| PG-6 | Progress feedback shown | Code review | Upload + processing status messages |

**Commit:** `HF-047 Phase 2: Client uploads file to storage before commit`

---

## PHASE 3: UPDATE API ROUTE — READ FROM STORAGE

### 3A: Rewrite /api/import/commit

The API route now:
1. Receives metadata (tiny payload) — NOT row data
2. Downloads the file from Supabase Storage using service role client
3. Parses the Excel file server-side
4. Applies field mappings from the metadata
5. Bulk inserts to committed_data, entities, periods

```typescript
// Download file from Supabase Storage
const { data: fileData, error: downloadError } = await serviceClient.storage
  .from('imports')
  .download(storagePath);

if (downloadError) throw new Error(`File download failed: ${downloadError.message}`);

// Parse Excel server-side
const buffer = Buffer.from(await fileData.arrayBuffer());
const workbook = XLSX.read(buffer, { type: 'buffer' });
// ... process sheets, apply mappings, bulk insert
```

### 3B: Install xlsx if not already available

```bash
cd web && npm install xlsx
```

### 3C: Remove the 100MB body size limit from next.config.mjs

No longer needed — the API payload is < 50KB:

```javascript
// REMOVE this from next.config.mjs:
// experimental: { serverActions: { bodySizeLimit: '100mb' } }
```

### 3D: Set Vercel function timeout

In `vercel.json` or route config:

```typescript
export const maxDuration = 60; // 60 seconds for Pro plan
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-7 | API route reads from Supabase Storage | Code review | storage.download() present |
| PG-8 | API route parses Excel server-side | Code review | XLSX.read() present |
| PG-9 | No row data in request body | Code review | req.body has metadata only |
| PG-10 | 100MB body limit removed | next.config.mjs | No bodySizeLimit override |
| PG-11 | Function timeout set | Route export | maxDuration = 60 |

**Commit:** `HF-047 Phase 3: Server-side file download + parsing`

---

## PHASE 4: CLEAN UP RETAILCDMX + TEST

### 4A: Clean up (run in Supabase SQL Editor)

```sql
DELETE FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM rule_set_assignments WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

### 4B: Test on localhost

1. Login → select RetailCDMX
2. Navigate to Enhanced Import
3. Upload RetailCDMX Excel
4. Map fields → Validate → Approve & Import
5. **No 413 error**
6. **Import completes within 60 seconds**
7. Verify in Supabase:

```sql
-- Verify file in storage
SELECT name, created_at FROM storage.objects WHERE bucket_id = 'imports' ORDER BY created_at DESC LIMIT 5;

-- Verify committed data
SELECT COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: > 100,000

SELECT COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: > 0

SELECT COUNT(*) FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: 1-5 (deduplicated)

SELECT status, row_count FROM import_batches
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC LIMIT 1;
-- Expected: status='completed'
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-12 | No 413 error | Browser console | No HTTP 413 |
| PG-13 | File uploaded to Supabase Storage | Supabase query | Row in storage.objects |
| PG-14 | Import completes within 60 seconds | Timer | < 60s |
| PG-15 | committed_data > 100,000 | Supabase query | COUNT check |
| PG-16 | Periods deduplicated (≤ 5) | Supabase query | COUNT check |
| PG-17 | Import batch status = 'completed' | Supabase query | Status field |

**Commit:** `HF-047 Phase 4: RetailCDMX cleanup and import verification`

---

## PHASE 5: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-18 | TypeScript: zero errors | exit code 0 | |
| PG-19 | Build: clean | exit code 0 | |

### Completion report

Create `HF-047_COMPLETION_REPORT.md` at PROJECT ROOT with:
- Architecture diagram: before (JSON payload) vs after (file-based)
- Scale analysis: why this works for millions of rows
- All 19 proof gates with evidence
- Supabase query results
- Storage bucket + policy verification

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-047: File-Based Import Pipeline — Fix 413 and Scale to Millions" \
  --body "## Root Cause
HF-045 sent 119K records as JSON in HTTP body. Vercel limit: 4.5MB. Data: 50-100MB.

## Fix
- File uploaded to Supabase Storage first (no size limit)
- API route receives metadata only (~50KB payload)
- Server downloads file from storage + parses server-side
- Scales to millions of records without payload concerns
- Original file preserved for audit trail

## Proof Gates: 19 — see HF-047_COMPLETION_REPORT.md"
```

**Commit:** `HF-047 Phase 5: Build verification, completion report, PR`

---

## WHY JSON PAYLOAD WAS WRONG

For context on the architectural decision:

**HF-045's choice:** Send transformed rows as JSON. This works for small datasets (< 4.5MB ≈ ~10K records) but fails at any real scale. It was a shortcut to avoid the complexity of file storage.

**The right approach from the start:** File-based pipeline. The Excel file is already a binary blob — upload it to storage, reference it by path, process server-side. This is how every enterprise data platform works:
- AWS: S3 → Lambda → RDS
- GCP: GCS → Cloud Function → Cloud SQL
- Azure: Blob Storage → Functions → SQL

Supabase Storage is the equivalent of S3 in our stack. Using it for the import pipeline is not just a fix — it's the correct architecture for a platform that handles enterprise data volumes.

**Future enhancement:** When the import needs to handle millions of rows, add a Supabase Edge Function or background job that processes the file asynchronously with progress tracking via a status table. The API route returns immediately with a job ID, and the client polls for completion. But that's a future OB, not this HF.

---

*HF-047 — February 19, 2026*
*"Never serialize what you can reference."*
