# HF-129: SCI Execute — Plan Document Retrieval from Storage

## Phase 0 Diagnostic

### Root Cause

`executePlanPipeline()` in `web/src/app/api/import/sci/execute/route.ts:1050` checks
`unit.documentMetadata?.fileBase64`. For XLSX-based imports through the SCI pipeline,
the file is uploaded to Supabase Storage (`ingestion-raw` bucket) but **not** sent as
base64 in the execute request body.

The `storagePath` IS available:
- `web/src/app/operate/import/page.tsx:115` — stored after upload
- `web/src/app/operate/import/page.tsx:363` — passed as prop to SCIExecution
- `web/src/components/sci/SCIExecution.tsx:119` — received as prop

But the `executeLegacyUnit` function (line 262-270) does NOT include `storagePath` in
the API request body. The `SCIExecutionRequest` type also lacks `storagePath`.

### Data Flow Gap

```
import/page.tsx → uploads file → storagePath = "tenantId/batchId/file.xlsx"
                → passes storagePath to SCIExecution
SCIExecution    → executeLegacyUnit for plan units
                → POST /api/import/sci/execute
                → body: { proposalId, tenantId, contentUnits }  ← storagePath MISSING
route.ts        → executePlanPipeline
                → checks unit.documentMetadata?.fileBase64  ← always undefined for XLSX
                → returns "plan-deferred" (no-op)
```

### Fix Required

1. Add `storagePath?: string` to `SCIExecutionRequest` in `sci-types.ts`
2. Pass `storagePath` in `executeLegacyUnit` request body (SCIExecution.tsx)
3. Destructure `storagePath` from request body in `route.ts` POST handler
4. Pass `storagePath` through `executeContentUnit` → `executePlanPipeline`
5. In `executePlanPipeline`: when `!fileBase64` but `storagePath` exists, download
   from `ingestion-raw` bucket, convert to base64, continue with existing logic

### Proof Gate

- PG-01: `executePlanPipeline` retrieves file from storage when `fileBase64` missing
- PG-02: Build exits 0
- PG-03: storagePath flows from SCIExecution → execute API → executePlanPipeline
