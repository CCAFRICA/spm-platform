# HF-068 Phase 0: Import Pipeline Diagnostic — Field Mapper Break Point

## IMPORT PIPELINE STEPS

| Step | Name | File | Status |
|------|------|------|--------|
| 1 | Upload | `enhanced/page.tsx` handleFileSelect (L1283) | WORKS |
| 2 | Analyze | `enhanced/page.tsx` analyzeWorkbook (L1066) — Excel only | WORKS for Excel |
| 2b | Classify | `enhanced/page.tsx` classifyFile (L1306) — CSV/TSV only | WORKS but INCOMPLETE |
| 3 | Map | `enhanced/page.tsx` map step render (L2524) | **BROKEN for CSV** |
| 4 | Validate | `enhanced/page.tsx` runValidation (L1427) | WORKS (if map passes) |
| 5 | Approve | `enhanced/page.tsx` commitImportData (L1770) | WORKS (if validate passes) |

## AI ANALYSIS OUTPUT FORMAT

**Excel path** (`analyzeWorkbook` → `/api/analyze-workbook`):
```json
{
  "sheets": [{
    "name": "Sheet1",
    "classification": "roster|component_data|...",
    "classificationConfidence": 85,
    "suggestedFieldMappings": [
      { "sourceColumn": "num_empleado", "targetField": "entityId", "confidence": 92 }
    ],
    "headers": ["num_empleado", "nombre", ...],
    "rowCount": 25,
    "sampleRows": [...]
  }]
}
```

**CSV path** (`classifyFile` → `/api/classify/route.ts`):
```json
{
  "sheets": [{
    "name": "filename.csv",
    "classification": "component_data",
    "classificationConfidence": 85,
    "suggestedFieldMappings": [],  // ← ALWAYS EMPTY
    "headers": [...],
    "rowCount": 100,
    "sampleRows": [...]
  }]
}
```

## FIELD MAPPING INPUT FORMAT

The map step rendering guard (line 2524):
```typescript
{currentStep === 'map' && analysis && currentMappingSheet && currentSheetMapping && (
```

Where:
- `currentMappingSheet` = `mappableSheets[currentMappingSheetIndex]` (from analysis.sheets filtered by classification)
- `currentSheetMapping` = `fieldMappings.find(m => m.sheetName === currentMappingSheet.name)`

## THE BREAK POINT

### Primary: CSV/TSV files never create field mappings

The `handleFileSelect` function (line 1283) has TWO code paths:

**Excel path** (line 1289-1293):
```typescript
if (isExcelFile(file)) {
  await analyzeWorkbook(file);  // ← Creates fieldMappings at line 1268
}
```

**CSV path** (line 1294-1367):
```typescript
else {
  const classification = await classifyFile(file.name, contentPreview, ...);
  simpleAnalysis = { sheets: [{ suggestedFieldMappings: [] }] };  // ← EMPTY
  setAnalysis(simpleAnalysis);
  setCurrentStep('analyze');
  // ← NEVER calls setFieldMappings()
  // ← NEVER calls analyzeWorkbook()
}
```

**Result:** For CSV files, `fieldMappings` stays `[]` (set to empty at line 1287). When user navigates to map step:
- `currentSheetMapping` = `[].find(m => m.sheetName === 'file.csv')` = `undefined`
- Guard `currentSheetMapping &&` fails
- **Map step renders NOTHING — empty content area**

### Secondary: CSV `suggestedFieldMappings` is hardcoded to `[]`

Even if we fixed the field mappings creation, the CSV path creates `simpleAnalysis` with `suggestedFieldMappings: []` (line 1342). The AI classification via `classifyFile()` detects file TYPE but does NOT produce per-column field mappings. The Excel path sends column headers + sample data to the AI which returns per-column suggestions. The CSV path only classifies the file type.

## NEXT BUTTON CONDITION

`canProceed()` for map step (line 2020-2029):
```typescript
case 'map': {
  const allMapped = fieldMappings.flatMap(s => s.mappings.filter(m => m.targetField));
  const mappedIds = new Set(allMapped.map(m => m.targetField));
  return mappedIds.has('entityId');
}
```

This never returns true for CSV because `fieldMappings` is `[]` → `allMapped` is `[]` → `mappedIds` has nothing.

## ROOT CAUSE

**The CSV file path was never wired to create field mappings.** The `classifyFile()` function only determines file type (roster, transaction_data, pos_cheque). It does NOT analyze individual columns or produce `suggestedFieldMappings`. The CSV path needs to either:

1. Call `analyzeWorkbook()` after classification (same AI that works for Excel), OR
2. Create field mappings from the parsed headers with the AI column suggestions

The Excel path works because `analyzeWorkbook()` sends sheets + headers + sample data to the AI, gets back `suggestedFieldMappings`, and transforms them into `SheetFieldMapping[]` state. The CSV path skips ALL of this.

**This regression was always present** — CSV files never went through field mapping. It was hidden because previous test data (Pipeline Test Co, Óptica) used Excel files. Caribe Financial likely uses CSV files for its banking data.

## FIX APPROACH

Route CSV files through the same `analyzeWorkbook()` path that Excel files use. The `parseAllSheets()` function already handles CSV via XLSX.read() (SheetJS can parse CSV). The `analyzeWorkbook()` function already receives parsed sheets (headers + sample rows) regardless of source format. The fix is to call `analyzeWorkbook(file)` for CSV files too, after the initial classification.
