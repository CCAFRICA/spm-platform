# OB-38 Phase 0: Storage Key Diagnostic

## STORAGE KEY MAP

### PLAN IMPORT
```
WRITES TO:
  Key: 'compensation_plans'
  Written by: src/lib/compensation/plan-storage.ts:16 (STORAGE_KEY_PLANS)
  Data shape: Array<{ id, tenantId, name, configuration, status, ... }>
```

### DATA IMPORT (Committed Data)
```
WRITES TO:
  Key: 'data_layer_batches'   (batch metadata)
  Key: 'data_layer_committed' (committed imported data)
  Written by: data-layer-service (via import pipeline)
```

### CALCULATION RUNS -- TWO SYSTEMS
```
SYSTEM 1 -- Orchestrator (the one actually used by calculate page):
  Key: 'vialuce_calculation_runs'
  Written by: src/lib/orchestration/calculation-orchestrator.ts:1113
  Data shape: Array<{ id, tenantId, periodId, status, startedAt, results, ... }>

SYSTEM 2 -- Results Storage (OB-29, NOT used by calculate page):
  Key: 'calculation_runs'
  Written by: src/lib/calculation/results-storage.ts:505
  Data shape: Array<{ id, tenantId, period, status, calculatedAt, ... }>
```

### CALCULATION RESULTS -- TWO SYSTEMS
```
SYSTEM 1 -- Orchestrator:
  Chunk key: 'vialuce_calculations_chunk_{N}'
  Index key: 'vialuce_calculations_index'
  Legacy key: 'vialuce_calculations'
  Written by: src/lib/orchestration/calculation-orchestrator.ts:1192,1229

SYSTEM 2 -- Results Storage:
  Chunk key: 'calculation_results_{runId}_{N}'
  Meta key: 'calculation_results_{runId}_meta'
  Written by: src/lib/calculation/results-storage.ts:276,281
```

### LIFECYCLE STATE
```
WRITES TO:
  Key pattern: individual keys scanned by listCycles()
  Written by: src/lib/calculation/calculation-lifecycle-service.ts:92
```

## READER MAP

```
CompensationClockService READS:
  Plans:              'vialuce_plans'            -- MISMATCH (writer uses 'compensation_plans')
  Data batches:       'data_layer_batches'       -- MATCH
  Calc runs:          'vialuce_calculation_runs'  -- matches orchestrator
  Lifecycle:          via listCycles()            -- MATCH

CycleIndicator/cycle-service READS:
  Data batches:       'data_layer_batches'       -- MATCH
  Committed data:     'data_layer_committed'     -- MATCH
  Calc runs:          'vialuce_calculation_runs'  -- matches orchestrator

Queue Service READS:
  Plans:              'vialuce_plans'            -- MISMATCH (writer uses 'compensation_plans')
  Data batches:       'data_layer_batches'       -- MATCH
  Committed data:     'data_layer_committed'     -- MATCH
  Calc runs:          'vialuce_calculation_runs'  -- matches orchestrator

Pulse Service READS:
  Plans:              'compensation_plans'       -- MATCH
  Data batches:       'data_layer_batches'       -- MATCH
  Calc runs:          'vialuce_calculation_runs'  -- matches orchestrator
  Calc results:       'calculation_results_{runId}_{N}' -- MISMATCH (orchestrator writes to 'vialuce_calculations_chunk_{N}')

Perform Page READS (via results-storage):
  Runs:               'calculation_runs'         -- MISMATCH (orchestrator writes to 'vialuce_calculation_runs')
  Results:            'calculation_results_{runId}_{N}' -- MISMATCH (orchestrator writes to 'vialuce_calculations_chunk_{N}')

Operate Landing READS:
  Via CompensationClockService -- inherits all its mismatches

Reconciliation READS:
  Calc runs:          'vialuce_calculation_runs'  -- matches orchestrator
  Calc results:       Orchestrator getAllResults() -- MATCH
```

## MISMATCHES FOUND

### MISMATCH 1 (CRITICAL): Plans Key
```
WRITER: plan-storage.ts writes to 'compensation_plans'
READER: compensation-clock-service.ts reads 'vialuce_plans'
READER: queue-service.ts reads 'vialuce_plans'
IMPACT: Clock and Queue NEVER find plans -> always "Import Commission Plan"
```

### MISMATCH 2 (CRITICAL): Pulse Results Key Pattern
```
READER: pulse-service.ts finds runs from 'vialuce_calculation_runs' (orchestrator)
READER: pulse-service.ts reads results from 'calculation_results_{runId}_{N}' (results-storage format)
WRITER: orchestrator stores results in 'vialuce_calculations_chunk_{N}' (indexed by chunk number, not runId)
IMPACT: Pulse finds runs but can NEVER load their results -> shows dashes
```

### MISMATCH 3 (CRITICAL): Perform Page Uses Wrong System
```
READER: perform/page.tsx imports from results-storage (getLatestRun, getCalculationRuns)
READER: results-storage reads from 'calculation_runs' key
WRITER: orchestrator writes runs to 'vialuce_calculation_runs'
IMPACT: Perform page NEVER finds calculation runs -> "not yet available"
```

### MISMATCH 4 (SECONDARY): Two Calculation Systems
```
The orchestrator and results-storage are two independent systems
that write to completely different keys. The calculate page uses
the orchestrator, but several consumer pages use results-storage.
Neither system writes to the other's keys.
```

## FIX STRATEGY

The orchestrator is the PRODUCER (calculation page uses it). All consumers
must read from the orchestrator's keys. Three fixes needed:

1. **compensation-clock-service.ts**: Change 'vialuce_plans' to 'compensation_plans'
2. **queue-service.ts**: Change 'vialuce_plans' to 'compensation_plans'
3. **pulse-service.ts**: Change result loading to read from orchestrator's chunk format
4. **perform/page.tsx**: Change to read runs from 'vialuce_calculation_runs' and results from orchestrator format

Alternative: make the orchestrator ALSO write to results-storage keys after calculation.
This is the better approach as it consolidates consumers around one format.
