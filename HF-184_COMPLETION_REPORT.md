# HF-184 Completion Report

## Changes Summary

**processEntityUnit (execute-bulk/route.ts):** Added committed_data write section AFTER entity creation. Previously only wrote to `entities` table — now also writes to committed_data with source_date + entity_id_field. Entity creation side effect preserved.

**executeEntityPipeline (execute/route.ts):** Changed `source_date: null` to `extractSourceDate(...)`. Added entity_id_field to metadata.

**executeReferencePipeline (execute/route.ts):** Changed `source_date: null` to `extractSourceDate(...)`. Added entity_id_field to metadata.

**Note:** processReferenceUnit (execute-bulk) was already correct — no changes needed.

## Verification Gates

| # | Gate | How to Verify | PASS/FAIL | Evidence |
|---|------|---------------|-----------|----------|
| 1 | `npm run build` exits 0 | `cd web && npm run build` | PASS | Build completed, 0 errors |
| 2 | `tsc --noEmit` exits 0 | `npx tsc --noEmit` | PASS | No output (0 errors) |
| 3 | `npx next lint` exits 0 | `npx next lint` | PASS | Pre-existing warnings only |
| 4 | extractSourceDate in ALL bulk pipelines | `grep -c "extractSourceDate" execute-bulk/route.ts` = 4 | PASS | 4 (processDataUnit x2 + processReferenceUnit + processEntityUnit) |
| 5 | extractSourceDate in ALL execute pipelines | `grep -c "extractSourceDate" execute/route.ts` = 5 | PASS | 5 (target + transaction + entity + reference + import) |
| 6 | entity_id_field in ALL bulk pipeline metadata | `grep -c "entity_id_field" execute-bulk/route.ts` = 5 | PASS | 5 (processDataUnit + processReferenceUnit + processEntityUnit + 2 log lines) |
| 7 | entity_id_field in ALL execute pipeline metadata | `grep -c "entity_id_field" execute/route.ts` = 4 | PASS | 4 (entity + reference + 2 bindings) |
| 8 | Entity pipeline still creates entities | `grep -n "from('entities')" execute-bulk/route.ts` | PASS | 11 matches — entity creation, enrichment, update logic all preserved |
| 9 | No unauthorized changes | `git diff --stat HEAD` | PASS | `execute-bulk/route.ts` (+92/-1), `execute/route.ts` (+19/-3), 2 files only |

## Files Modified (2)

```
web/src/app/api/import/sci/execute-bulk/route.ts  +92/-1  (committed_data write in processEntityUnit)
web/src/app/api/import/sci/execute/route.ts       +19/-3  (source_date + entity_id_field in entity + reference)
```
