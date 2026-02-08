# OB-11 Storage Key Diagnostic

## Executive Summary

**ROOT CAUSE FOUND:** The UI import page's `handleSubmitImport` function is a MOCK that never persists data.

## Storage Key Analysis

### UI Import Path (data-layer-service.ts)
```
Key: data_layer_committed
Structure: [[id, CommittedRecord], [id, CommittedRecord], ...]
Written by: commitRecords() in data-layer-service.ts:278
Function: Saves via persistAll() which calls saveToStorage()
```

### Orchestrator Read Path (calculation-orchestrator.ts)
```
Key: data_layer_committed (STORAGE_KEYS.DATA_LAYER_COMMITTED)
Structure: [[id, {importBatchId, status, content}], ...]
Read by: extractEmployeesFromCommittedData() at line 601
Function: localStorage.getItem() then JSON.parse()
```

### Key Match: YES
The storage keys are identical: `data_layer_committed`

### Format Match: YES
Both use array of tuples format: `[string, object][]`

## The REAL Problem

The keys match, but **the UI never calls the data layer service**.

### Evidence: handleSubmitImport() in enhanced/page.tsx (lines 1159-1171)

```typescript
const handleSubmitImport = useCallback(() => {
  setIsImporting(true);

  // Simulate import processing  <-- MOCK!
  setTimeout(() => {
    const id = `IMP-${Date.now().toString(36).toUpperCase()}`;
    setImportId(id);
    setIsImporting(false);
    setImportComplete(true);
    setCurrentStep('complete');
  }, 2000);
}, []);
```

This function:
- Sets UI state only
- Shows "Import Complete" success message
- **NEVER calls any data persistence functions**

### What SHOULD happen (import-service.ts)

```typescript
export async function initiateImport(parsed, config): Promise<ImportResult> {
  const batch = createImportBatch(config, parsed);
  createRawRecords(batch, rawRecords);
  await transformRecords(batch.id, pipeline, config.userId);
  // ...eventually calls commitRecords()
}

export function approveImport(batchId, userId, recordIds?) {
  commitRecords(batchId, approvalId, userId, recordIds);
}
```

These functions ARE defined but NEVER called from the UI.

## Fix Required

The `handleSubmitImport` function in `src/app/data/import/enhanced/page.tsx` must:

1. Collect all parsed data from the current workbook
2. Create field mappings from the UI state
3. Call the data layer service to persist:
   - Create import batch
   - Create raw records
   - Transform records
   - Commit records
4. Only then show success

## Secondary Issue: Field Mapping Auto-Select

The UI shows AI suggestions as badges but doesn't auto-populate dropdowns.
The fix requires:
1. Find where dropdown values are initialized
2. Apply AI suggestion as default when confidence >= 85%
3. Store the mappings so calculation can use them

## Files to Modify

1. `src/app/data/import/enhanced/page.tsx` - Fix handleSubmitImport to persist data
2. `src/app/data/import/enhanced/page.tsx` - Fix field mapping auto-select
3. Possibly `src/lib/calculation/data-component-mapper.ts` - Ensure mappings are read correctly

## Test Approach

After fix:
1. Upload Excel file through UI
2. Map fields (verify auto-select works)
3. Approve import
4. Run calculation
5. Verify real employees found (not demo)
6. Verify metrics connected (not "No metrics found")
