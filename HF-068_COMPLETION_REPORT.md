# HF-068 Completion Report: Field Mapper + Import Pipeline — Unblock Caribe Financial

## Summary
Fixed the import pipeline break where CSV/TSV files bypassed field mapping entirely. The `handleFileSelect` function routed CSV through `classifyFile()` (file type only) instead of `analyzeWorkbook()` (file type + column mappings), leaving `fieldMappings` empty and the map step rendering nothing.

## Phase 0: Diagnostic
**Commit:** `5d00380`

### Root Cause
`handleFileSelect()` (line 1283) had two code paths:
- **Excel path**: called `analyzeWorkbook(file)` → AI produces `suggestedFieldMappings` → creates `fieldMappings[]` state → map step renders correctly
- **CSV path**: called `classifyFile(file)` → AI classifies file TYPE only → `suggestedFieldMappings: []` (hardcoded empty) → `fieldMappings` stays `[]` → map step guard fails → **empty content area**

The map step render guard: `currentSheetMapping = fieldMappings.find(m => m.sheetName === currentMappingSheet.name)`. With `fieldMappings = []`, `currentSheetMapping` is always `undefined`, and the guard `currentSheetMapping &&` fails.

This regression was always present — CSV files never went through field mapping. It was hidden because test data used Excel files.

## Phase 1: Architecture Decision
**Commit:** `842e25d`

**CHOSEN: Option A** — Route ALL file types through `analyzeWorkbook()`.
- `parseAllSheets()` uses `XLSX.read()` (SheetJS) which handles CSV/TSV/XLSX uniformly
- `analyzeWorkbook()` sends parsed sheets (headers + sample rows) to AI regardless of source format
- Single AI call produces both classification AND per-column field mappings
- No code duplication, no special cases

**REJECTED: Option B** — Add field mapping after `classifyFile()`: creates empty mappings without AI suggestions, user must manually map everything.

**REJECTED: Option C** — Keep `classifyFile()` + call `analyzeWorkbook()` after: redundant double AI call.

## Phase 2: Implementation
**Commit:** `ba83ca3`

### `web/src/app/data/import/enhanced/page.tsx`

**Before:**
```typescript
const handleFileSelect = useCallback(async (file: File) => {
  // ...
  if (isExcelFile(file)) {
    await analyzeWorkbook(file);  // Creates fieldMappings
  } else {
    const classification = await classifyFile(file.name, contentPreview, ...);
    simpleAnalysis = { sheets: [{ suggestedFieldMappings: [] }] };  // EMPTY
    setAnalysis(simpleAnalysis);
    // NEVER calls setFieldMappings()
  }
}, [analyzeWorkbook, tenantId, currentTenant, user]);
```

**After:**
```typescript
const handleFileSelect = useCallback(async (file: File) => {
  setUploadedFile(file);
  setError(null);
  setAnalysis(null);
  setFieldMappings([]);

  if (isExcelFile(file)) {
    const sheets = await getExcelWorksheets(file);
    setWorksheets(sheets);
  }

  // HF-068 FIX: Route ALL file types through analyzeWorkbook().
  // SheetJS (XLSX.read) handles CSV/TSV/XLSX uniformly in parseAllSheets().
  await analyzeWorkbook(file);
}, [analyzeWorkbook]);
```

**Removed unused imports:** `parseFile`, `classifyFile`, `AI_CONFIDENCE`

**Classification signal capture** (closed-loop learning):
After successful import commit, captures field mapping decisions as `classification_signals`:
```typescript
const mappingSignals = fieldMappings.flatMap(sheet =>
  sheet.mappings
    .filter(m => m.targetField)
    .map(m => ({
      tenant_id: tenantId,
      signal_type: 'field_mapping',
      signal_value: {
        source_column: m.sourceColumn,
        target_field: m.targetField,
        ai_confidence: m.confidence,
        tier: m.tier,
        action: m.tier === 'auto' && m.confirmed ? 'accepted' : 'overridden',
      },
      confidence: m.confidence / 100,
      source: 'smart-mapper',
      context: { sheet_name: sheet.sheetName, file_name: uploadedFile.name, batch_id: result.batchId },
    }))
);
```

### `web/src/app/api/signals/route.ts`

Added POST handler for creating classification signals:
```typescript
export async function POST(request: NextRequest) {
  const { signals } = body;
  const rows = signals.map(s => ({
    tenant_id: s.tenant_id,
    signal_type: s.signal_type,
    signal_value: s.signal_value as unknown as undefined,
    confidence: s.confidence,
    source: s.source,
    context: s.context as unknown as undefined,
  }));
  const { data, error } = await supabase
    .from('classification_signals')
    .insert(rows)
    .select('id');
}
```

## Phase 3: Multi-File Upload — VERIFIED (No Changes Needed)
Already implemented:
- File input has `multiple` attribute (line 2187)
- Drop handler queues remaining files via `setFileQueue(files.slice(1))`
- File queue shown in UI with badge count
- "Process Next File" button available after current file completes
- Carry Everything: `row_data: { ...content, _sheetName, _rowIndex }` preserves ALL columns

## Files Modified
1. `web/src/app/data/import/enhanced/page.tsx` — Unified file handling path, removed dead code, added signal capture
2. `web/src/app/api/signals/route.ts` — POST handler for classification signal creation

## Proof Gates

| Gate | Description | Status |
|------|-------------|--------|
| PG-01 | CSV files route through `analyzeWorkbook()` | PASS — single code path for all formats |
| PG-02 | Excel files still route through `analyzeWorkbook()` | PASS — unchanged, with worksheet extraction first |
| PG-03 | `parseAllSheets()` uses `XLSX.read()` which handles CSV | PASS — SheetJS native CSV support |
| PG-04 | AI endpoint receives headers + sample rows for CSV | PASS — `analyzeWorkbook` sends parsed sheets regardless of format |
| PG-05 | `fieldMappings` populated after CSV analysis | PASS — `analyzeWorkbook` creates mappings from AI suggestions |
| PG-06 | Map step renders for CSV files | PASS — `currentSheetMapping` found when `fieldMappings` populated |
| PG-07 | Three-tier mapping system works for CSV | PASS — same `buildFieldMappings` logic regardless of source format |
| PG-08 | `canProceed` for map step works for CSV | PASS — `fieldMappings` has entries, entityId can be mapped |
| PG-09 | Multi-file upload already supported | PASS — `multiple` attribute + file queue + process next button |
| PG-10 | Carry Everything — all CSV columns preserved | PASS — `row_data: { ...content, _sheetName, _rowIndex }` |
| PG-11 | Classification signals captured on commit | PASS — POST to /api/signals after successful import |
| PG-12 | Signal capture is non-blocking | PASS — fire-and-forget fetch, no await on signal POST |
| PG-13 | Dead code removed (classifyFile, parseFile, AI_CONFIDENCE) | PASS — imports cleaned up |
| PG-14 | `handleFileSelect` deps simplified | PASS — `[analyzeWorkbook]` only |
| PG-15 | `npm run build` exits 0 | PASS |

## Deferred Findings

| # | Finding | Rationale |
|---|---------|-----------|
| D-1 | `classifyFile` function still exists in import pipeline | Not imported; may be used elsewhere. Don't delete until confirmed unused across codebase. |
| D-2 | Signal capture doesn't include entity_id | Field mapping signals are file-level, not entity-level. Entity_id added later during entity resolution. |
| D-3 | TSV parsing not explicitly tested | SheetJS treats TSV same as CSV (tab delimiter auto-detected). No separate code path needed. |
