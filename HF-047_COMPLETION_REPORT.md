# HF-047 Completion Report — FILE-BASED IMPORT PIPELINE

**Status**: COMPLETE (code ready, manual testing pending)
**Date**: 2026-02-19
**Branch**: dev

---

## Commits

| Commit | Phase | Description |
|--------|-------|-------------|
| `e89ae27` | Phase 0 | Import pipeline 413 diagnostic |
| `3c86d52` | Phase 1 | Supabase Storage bucket migration |
| `15ac3e3` | Phase 2 | Client uploads file to storage before commit |
| `6406879` | Phase 3 | Server-side file download + parsing |

---

## Architecture: Before vs After

### BEFORE (HF-045 — JSON payload)

```
Browser                       Vercel Function          Supabase
  │                                │
  ├── Parse 119K rows (XLSX)       │
  ├── Serialize as JSON (~80MB)    │
  └── POST /api/import/commit ─────┤
                                   │ ← HTTP 413 (4.5MB limit)
                                   │   BLOCKED
```

### AFTER (HF-047 — File-based pipeline)

```
Browser                       Supabase Storage    Vercel Function          Supabase DB
  │                                │                    │
  ├─ POST /api/import/prepare ─────│────────────────────┤
  │                                │                    ├── Creates bucket (if needed)
  │  ← signedUrl, storagePath ─────│────────────────────┤   Returns signed upload URL
  │                                │                    │
  ├─ PUT signedUrl (file) ─────────┤                    │
  │  (direct to Storage,           │                    │
  │   bypasses Vercel)             │                    │
  │                                │                    │
  ├─ POST /api/import/commit ──────│────────────────────┤
  │  (metadata only, < 50KB)       │                    ├── Download file from Storage
  │                                │ ← download ────────┤   Parse Excel (XLSX.read)
  │                                │                    ├── Bulk entity resolution
  │                                │                    ├── Period deduplication
  │                                │                    ├── committed_data (5K chunks)
  │                                │                    ├── Rule set assignments
  │  ← { recordCount, ... } ──────│────────────────────┤   Update batch status
```

---

## Why This Scales

| Metric | HF-045 (JSON) | HF-047 (File-based) |
|--------|---------------|---------------------|
| Max records | ~10K (4.5MB limit) | Millions (500MB file limit) |
| HTTP payload | 50-100MB | < 50KB |
| Vercel involvement | Receives ALL data | Receives metadata only |
| File preserved | No | Yes (audit trail in Storage) |
| Resumable | No | Yes (file persists on failure) |

---

## Files Modified

| File | Change |
|------|--------|
| `web/src/app/api/import/prepare/route.ts` | **NEW** — Signed upload URL generation + bucket creation |
| `web/src/app/api/import/commit/route.ts` | **REWRITTEN** — Downloads from Storage, parses server-side |
| `web/src/app/data/import/enhanced/page.tsx` | Upload to Storage first, send metadata-only commit |
| `web/src/components/gpv/GPVWizard.tsx` | Same file-based pipeline |
| `web/next.config.mjs` | Removed 100MB bodySizeLimit (no longer needed) |
| `web/supabase/migrations/010_import_storage_bucket.sql` | **NEW** — Bucket + RLS policies |

---

## Proof Gates

### Phase 0: Diagnostic
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| — | Current API receives all rows as JSON | route.ts: `sheetData: SheetInput[]` in body | PASS |
| — | JSON payload ~80MB for 119K records | RetailCDMX → HTTP 413 at 4.5MB limit | PASS |

### Phase 1: Storage Bucket
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-1 | Migration file exists | `010_import_storage_bucket.sql` | **PASS** |
| PG-2 | Bucket created programmatically | `prepare/route.ts:ensureBucket()` | **PASS** |

### Phase 2: Client Upload
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-3 | Client calls /api/import/prepare | page.tsx: `fetch('/api/import/prepare')` | **PASS** |
| PG-4 | File uploaded via signed URL | page.tsx: `fetch(signedUrl, { method: 'PUT', body: uploadedFile })` | **PASS** |
| PG-5 | API payload < 50KB | `{ tenantId, storagePath, sheetMappings }` — no row data | **PASS** |
| PG-6 | GPV wizard uses same approach | GPVWizard.tsx: prepare → upload → commit | **PASS** |

### Phase 3: Server-Side Parsing
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-7 | API route downloads from Storage | route.ts: `supabase.storage.from('imports').download(storagePath)` | **PASS** |
| PG-8 | Excel parsed server-side | route.ts: `XLSX.read(buffer, { type: 'buffer' })` | **PASS** |
| PG-9 | No row data in request body | CommitRequest has `storagePath` + `sheetMappings`, no `sheetData` | **PASS** |
| PG-10 | 100MB body limit removed | next.config.mjs: comment + no bodySizeLimit | **PASS** |
| PG-11 | Function timeout set | route.ts: `export const maxDuration = 120` | **PASS** |

### Phase 4: Integration (Manual)
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-12 | No 413 error | Browser console | PENDING (manual) |
| PG-13 | File in Supabase Storage | `SELECT * FROM storage.objects WHERE bucket_id='imports'` | PENDING (manual) |
| PG-14 | Import < 60 seconds | Timer | PENDING (manual) |
| PG-15 | committed_data > 100K | `SELECT COUNT(*) FROM committed_data` | PENDING (manual) |
| PG-16 | Periods deduplicated | `SELECT COUNT(*) FROM periods` | PENDING (manual) |
| PG-17 | Batch status = 'completed' | `SELECT status FROM import_batches` | PENDING (manual) |

### Phase 5: Build
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-18 | TypeScript: zero errors | `npx tsc --noEmit` exit 0 | **PASS** |
| PG-19 | Build: clean | `npm run build` — compiled successfully | **PASS** |

---

## RetailCDMX Cleanup SQL

Run in Supabase SQL Editor BEFORE re-testing import:

```sql
-- Clean up RetailCDMX data from previous attempts
DELETE FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM rule_set_assignments WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

## Storage Bucket Setup

The `/api/import/prepare` route creates the bucket programmatically on first use.
For production hardening, run `010_import_storage_bucket.sql` in SQL Editor to add RLS policies.

## Post-Import Verification SQL

```sql
-- Verify file in storage
SELECT name, created_at FROM storage.objects
WHERE bucket_id = 'imports' ORDER BY created_at DESC LIMIT 5;

-- Verify committed data
SELECT COUNT(*) as rows FROM committed_data
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: > 100,000

SELECT COUNT(*) as entities FROM entities
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

SELECT COUNT(*) as periods FROM periods
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: 1-5 (deduplicated)

SELECT status, row_count FROM import_batches
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC LIMIT 1;
-- Expected: status='completed'
```

---

## Manual Browser Gates (for Andrew)

| # | Test | Expected |
|---|------|----------|
| M-1 | Login VL Admin → RetailCDMX → Enhanced Import | Page loads |
| M-2 | Upload RetailCDMX Excel | Console: "Uploading... to storage" |
| M-3 | Approve & Import | No HTTP 413, console shows file-based pipeline steps |
| M-4 | Import completes < 60 seconds | Timer check |
| M-5 | Supabase Storage: file exists | SQL query |
| M-6 | committed_data > 100K | SQL query |
| M-7 | GPV Wizard: Upload data → Commit | Same file-based path |

---

*HF-047 — February 19, 2026*
*"Never serialize what you can reference."*
