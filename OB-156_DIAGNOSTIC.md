# OB-156 Phase 0: Import Transport Diagnostic

## Current Import Flow (AP-1/AP-2 Violations)

```
Browser                              Server
───────                              ──────
SCIUpload.tsx
  ├─ SheetJS: XLSX.read(arrayBuffer)
  ├─ sheet_to_json() → ALL rows in memory
  └─ Returns ParsedFileData { sheets[].rows }
        │
page.tsx (rawDataRef holds all rows)
  ├─ Takes 50-row sample
  └─ POST /api/import/sci/analyze (sample only)
        │
SCIExecution.tsx
  ├─ Chunks rows: MAX_ROWS_PER_CHUNK = 5000
  └─ For each chunk (sequential):     ←── AP-2: Sequential from browser
       POST /api/import/sci/execute    ←── AP-1: Row data in HTTP body
         ├─ committed_data insert
         └─ postCommitConstruction()   ←── O(n) per chunk
```

**OB-155 proof**: 119K rows across 7 sheets. 24 sequential HTTP calls. Timed out after 65+ minutes. Only 47,783 rows (40%) imported before UND_ERR_HEADERS_TIMEOUT.

## Existing Infrastructure

### upload-service.ts (ALREADY EXISTS — NOT connected to SCI)
- `uploadFile()` uploads to Supabase Storage bucket `ingestion-raw`
- Path: `${tenantId}/${batchId || timestamp}_${sanitized_filename}`
- Computes SHA-256 hash
- Registers event via `POST /api/ingest/event`
- Returns `{ eventId, storagePath, fileHash }`
- Has progress tracking (`onProgress` callback)

### Key Files to Modify

| File | Current Role | OB-156 Change |
|------|-------------|---------------|
| `web/src/components/sci/SCIUpload.tsx` | Client-side XLSX parse via SheetJS | Upload raw file to Storage; parse only sample for analysis |
| `web/src/components/sci/SCIExecution.tsx` | 5K-row chunked HTTP execution | Send storage path only; poll for server-side progress |
| `web/src/app/api/import/sci/execute/route.ts` | Receives row data in body | Accept storage path; download from Storage; parse + bulk insert server-side |
| `web/src/app/operate/import/page.tsx` | Holds all rows in rawDataRef | Pass storagePath instead of rawData to execution |
| `web/src/lib/ingestion/upload-service.ts` | Standalone upload pipeline | Reuse for SCI file upload |

### Database Tables (from SCHEMA_REFERENCE.md)

- `committed_data`: id, tenant_id, import_batch_id, entity_id, period_id, data_type, source_date, row_data, metadata
- `import_batches`: id, tenant_id, file_name, file_type, row_count, status, error_summary, uploaded_by
- `entities`: id, tenant_id, entity_type, status, external_id, display_name, metadata
- `rule_set_assignments`: id, tenant_id, rule_set_id, entity_id, effective_from, effective_to, assignment_type, metadata

## Target Architecture

```
Browser                              Server                           Storage
───────                              ──────                           ───────
SCIUpload.tsx
  ├─ Upload raw XLSX to Storage ──────────────────────────────────→ ingestion-raw/
  ├─ Parse 50-row sample (client-side, for analysis only)
  └─ POST /api/import/sci/analyze (sample)
        │
SCIExecution.tsx
  └─ POST /api/import/sci/execute-bulk
       { storagePath, analysisResult }  ←── NO row data (AP-1 fix)
         │
         Server (single request):
         ├─ Download file from Storage ←──────────────────────────── ingestion-raw/
         ├─ Parse XLSX server-side (SheetJS Node.js)
         ├─ Bulk insert ALL rows        ←── AP-2 fix (no sequential chunks)
         ├─ postCommitConstruction() once for entire dataset
         └─ Return { batchId, rowCount, entityCount }
```

## Anti-Pattern Checklist

| # | Anti-Pattern | Status |
|---|-------------|--------|
| AP-1 | Row data in HTTP bodies | WILL FIX — storage path only |
| AP-2 | Sequential chunk inserts from browser | WILL FIX — single server-side bulk |
| AP-3 | Browser Supabase client for bulk writes | WILL FIX — service role client |
| AP-4 | Sequential per-entity DB calls | WILL FIX — batch entity creation |
| AP-14 | Partial state on failure | WILL FIX — atomic batch with cleanup |
| AP-15 | No progress feedback | WILL ADDRESS — progress tracking |

## Scale Analysis

| Volume | Rows | Current (chunked HTTP) | Target (file storage) |
|--------|------|----------------------|----------------------|
| Small | 10K | ~2 min | < 30s |
| Medium | 119K | 65+ min (TIMEOUT) | < 5 min |
| Large | 500K | Impossible | < 20 min |
| Enterprise | 2M+ | Impossible | Config tuning only |
