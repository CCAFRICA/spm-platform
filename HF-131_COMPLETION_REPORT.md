# HF-131 Completion Report — Frontend Plan Unit Grouping

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `eb1595e2` | Frontend execute grouping diagnostic |
| 1-2 | (this commit) | Grouped plan execution + build verification |
| 3 | (next commit) | Completion report + PR |

## Files Changed

### Modified
- `web/src/components/sci/SCIExecution.tsx` — Plan units grouped into single request

## Hard Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-01 | Plan units grouped into single fetch call | **PASS** | `planExecUnits = planUnits.map(...)` then single `fetchWithTimeout('/api/import/sci/execute', { contentUnits: planExecUnits })` |
| PG-02 | storagePath in grouped plan request | **PASS** | `...(storagePath ? { storagePath } : {})` in the grouped fetch body |
| PG-03 | contentUnits array contains ALL plan units | **PASS** | `contentUnits: planExecUnits` where planExecUnits is built from ALL `planUnits.map(...)` |
| PG-04 | Non-plan units still execute correctly | **PASS** | Data units path unchanged: `executeBulk(dataUnits)` or per-unit `executeLegacyUnit` fallback |
| PG-05 | Processing order: plan first, then data | **PASS** | Plan block executes first (lines 288-402), then data block (lines 404-440) |
| PG-06 | Build exits 0 | **PASS** | `npm run build` exit 0, Middleware 75.4 kB |
| PG-07 | No new API endpoints | **PASS** | `ls web/src/app/api/import/sci/` = analyze, analyze-document, execute, execute-bulk, trace |
| PG-08 | VL Admin profile unchanged | **DEFERRED** | No DB access — code changes are frontend only, no profile modifications |

## Soft Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-S1 | UI shows per-type progress | **PASS** | All plan units marked 'processing' together, then results mapped back per-unit |
| PG-S2 | Plan error doesn't block data | **PASS** | Plan block in try/catch, data block executes independently after |

## What Changed

### Before (broken)
```
executeUnits(all)
  planUnits = filter(plan)
  for each planUnit:                    <- N iterations
    executeLegacyUnit(unit)             <- N HTTP requests
    POST { contentUnits: [1 unit] }     <- backend "batches" 1 unit each time
  executeBulk(dataUnits)                <- 1 request for all data units
```

### After (fixed)
```
executeUnits(all)
  planUnits = filter(plan)
  planExecUnits = planUnits.map(build)  <- build ALL payloads
  POST { contentUnits: planExecUnits,   <- ONE request with ALL plan units
         storagePath }
  map results back per-unit             <- update UI per unit from response
  executeBulk(dataUnits)                <- 1 request for all data units (unchanged)
```

## Build

```
npm run build -- exit 0
No TypeScript errors
Middleware: 75.4 kB
1 file changed
```
