# OB-156: Architecture Decision Record

## Problem

119K rows cannot import through the browser in a reasonable time. OB-155 proved the current chunked HTTP approach fails after 65+ minutes on a 119K-row dataset (only 40% imported before timeout). The architecture violates AP-1 (row data in HTTP bodies) and AP-2 (sequential chunk inserts from browser).

Current flow:
```
SCIUpload (client-side XLSX parse via SheetJS)
  → page.tsx (holds ALL rows in rawDataRef)
  → SCIExecution (chunks 5,000 rows)
  → POST /api/import/sci/execute × N (row data in JSON body, sequential)
  → postCommitConstruction() per chunk (entity creation, binding, assignments)
```

Each 5K-row chunk sends ~2MB JSON payload. 119K rows = 24 sequential HTTP round-trips, each triggering O(n) post-commit work. Node.js undici throws UND_ERR_HEADERS_TIMEOUT after 300s.

## Option A: File Storage Transport (Server-Side Bulk)

Browser uploads raw XLSX to Supabase Storage (`ingestion-raw` bucket) → sends storage path + analysis metadata to a new API route → server downloads file from Storage, parses XLSX server-side, bulk inserts all rows in single transaction via service role client.

- Scale test: Works at 10x? **YES** — single file upload (Supabase Storage handles large files via TUS), server-side processing with no HTTP round-trip overhead. 2M rows = same single upload + larger server-side batch.
- AI-first: Any hardcoding? **NO** — reuses existing AI analysis/classification from the analyze step. Server-side processing consumes the same field mappings.
- Transport: Data through HTTP bodies? **NO** — only storage path (string) in HTTP body. Row data flows Storage → Server → Database.
- Atomicity: Clean state on failure? **YES** — single import_batch wraps all inserts. On failure, delete the batch and all committed_data rows.

## Option B: Client-Side Parse → JSON Upload to Storage

Browser still parses XLSX client-side via SheetJS → uploads parsed JSON to Supabase Storage → server reads JSON, bulk inserts.

- Scale test: Works at 10x? **PARTIAL** — removes HTTP body issue but client must still parse 2M rows in browser memory. Large files could crash the tab.
- AI-first: Any hardcoding? **NO**
- Transport: Data through HTTP bodies? **NO** — JSON in storage.
- Atomicity: Clean state on failure? **YES**

## Option C: Supabase Edge Function

Browser uploads to Storage → triggers Supabase Edge Function → Edge Function processes and inserts.

- Scale test: Works at 10x? **NO** — Edge Functions have 150s timeout (free) / 400s (pro). Cannot process 2M rows in that window.
- AI-first: Any hardcoding? **NO**
- Transport: Data through HTTP bodies? **NO**
- Atomicity: Clean state on failure? **PARTIAL** — harder to manage transactions from Edge Functions.

## CHOSEN: Option A

File Storage Transport with server-side XLSX parsing and bulk insert.

**Reasons:**
1. Eliminates client-side memory pressure (no parsing 2M rows in browser)
2. `upload-service.ts` already uploads to `ingestion-raw` bucket — reuse existing infrastructure
3. Server-side SheetJS parsing is well-supported (Node.js `xlsx` package)
4. Service role client enables bulk inserts without RLS overhead
5. Single API call (storage path) replaces 24+ sequential chunked HTTP calls
6. Scales to Enterprise tier (5M+ rows) with only chunk-size tuning

## REJECTED: Option B

Client-side parsing doesn't scale — browser memory limits hit at ~500K rows. Also adds unnecessary complexity (two serialization steps: XLSX → JSON → upload → JSON parse → insert).

## REJECTED: Option C

Edge Function timeout limits prevent processing large datasets. Would require re-architecture at Enterprise scale.

## Implementation Plan

1. **Phase 1**: Browser uploads raw file to Supabase Storage via existing `uploadFile()`. Analysis still uses 50-row sample (no change). Execution sends `{ storagePath, analysisResult }` instead of row data.

2. **Phase 2**: New server-side bulk processing route (`/api/import/sci/execute-bulk`) downloads file from Storage, parses XLSX server-side, inserts all rows in bulk via service role client. Runs `postCommitConstruction()` once for the entire dataset (not per-chunk).

3. **Phase 3**: Performance verification — 119K rows in under 5 minutes.
