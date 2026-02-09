# OB-12 Phase 1: UI Data Flow Diagnostic

## Summary

The UI import flow IS calling `directCommitImportData()` (verified in enhanced/page.tsx line 1222).
Data IS being persisted via `persistAll()` (data-layer-service.ts line 749).

## The Flow

```
1. User uploads Excel file
   -> File stored in React state (uploadedFile)

2. User clicks through wizard
   -> Analysis stored in React state
   -> Field mappings stored in React state

3. User clicks "Approve & Import"
   -> handleSubmitImport() is called (line 1163)
   -> Parses full Excel file
   -> Gets field mappings from React state
   -> Calls directCommitImportData(tenantId, userId, fileName, sheetData)

4. directCommitImportData()
   -> Creates ImportBatch with tenantId
   -> For each row: creates CommittedRecord with:
      - importBatchId = batchId
      - content = row data + mapped fields + _sheetName
      - status = 'active'
   -> Adds to memoryCache.committed
   -> Calls persistAll()

5. persistAll()
   -> saveToStorage('data_layer_committed', memoryCache.committed)
   -> saveToStorage('data_layer_batches', memoryCache.batches)
   -> Data IS in localStorage

6. User navigates to Calculate page
   -> Uses runPeriodCalculation(currentTenant.id, ...)
   -> Creates CalculationOrchestrator(tenantId)

7. Orchestrator.getEmployees()
   -> Calls extractEmployeesFromCommittedData()
   -> Reads localStorage.getItem('data_layer_batches')
   -> Filters batches by this.tenantId
   -> If no batches match: returns []
   -> Falls back to getDemoEmployees()

8. DEMO EMPLOYEES SHOWN
```

## Root Cause Hypothesis

The tenantId used in import MAY differ from tenantId in calculate:
- Import page: `currentTenant?.id || 'retailcgmx'`
- Calculate page: `currentTenant.id` (no fallback)

If currentTenant is null during import (uses 'retailcgmx') but set during calculate (uses actual tenant), the batch tenantId filter will fail.

## Storage Keys

Data Layer writes to:
- `data_layer_committed` - committed records
- `data_layer_batches` - import batches with tenantId

Orchestrator reads from:
- `data_layer_committed` (MATCHES)
- `data_layer_batches` (MATCHES)

## Field Mapping Auto-Select

Current thresholds:
- `autoConfirmed = confidence >= 90` (line 734)
- `showSuggestion = confidence >= 70` (line 735)

Fields with confidence 70-89% DO get a targetField set (line 744), but dropdown shows them as unconfirmed.
The request is to lower auto-select threshold to 85%.

## Employee Detection Requirements

Orchestrator looks for records with:
1. Employee ID field: num_empleado, Num_Empleado, employee_id, etc.
2. Name field: nombre, name, first_name, Nombre, etc.
3. importBatchId matches a tenant's batch
4. status === 'active'

## What Needs Fixing

1. **TenantID Consistency**: Remove fallback on import page, ensure both pages require currentTenant
2. **Auto-select Threshold**: Change from 90% to 85%
3. **Debug Logging**: Add console logs to verify data flow
