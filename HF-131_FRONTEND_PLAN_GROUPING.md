# HF-131: Frontend Execute — Group Plan Units Into Single Request

## Phase 0 Diagnostic

### Root Cause
`executeUnits` in SCIExecution.tsx (line 281) splits units into plan and data groups.
Data units go through `executeBulk` (single request, all units). But plan units loop
individually at line 287: `for (const unit of planUnits) { await executeLegacyUnit(unit) }`

`executeLegacyUnit` sends `contentUnits: [execUnit]` — always a 1-element array (line 268).
The HF-130 backend batching receives 1 plan unit per request, so "batch" is always size 1.

### Current Flow
```
executeUnits(all)
  -> planUnits = filter(plan)
  -> for each planUnit:
      -> executeLegacyUnit(unit)  <- ONE request with contentUnits: [1 unit]
      -> backend gets 1 plan unit, "batches" it alone
  -> dataUnits via executeBulk (single request, all units)
```

### Required Flow
```
executeUnits(all)
  -> planUnits = filter(plan)
  -> if planUnits.length > 0:
      -> build ALL plan execUnits
      -> ONE request with contentUnits: [all plan units] + storagePath
      -> backend batches all plan sheets into single AI call
  -> dataUnits via executeBulk (unchanged)
```

### Key Facts
- storagePath is available (prop, line 119) and already in executeLegacyUnit body (line 269)
- Backend /api/import/sci/execute accepts contentUnits as array (line 109 of route.ts)
- executeBulk already demonstrates the grouped pattern (lines 152-230)
- pollPlanRecovery handles timeout recovery -- keep for the grouped call
- No processingOrder field in proposal -- order enforced by code (plan then data)
