# HF-053 Diagnostic — Period Detection Pipeline Blocker

## 1. "Not detected" Root Cause

**File:** `web/src/app/data/import/enhanced/page.tsx`
**Line 3146:** Period card only renders when `validationResult.periodInfo.detected === true`
**Line 1698-1705:** `periodInfo.detected` comes from `analysis.periodDetected.found`
**Line 1516:** For CSV files, hardcoded to `{ found: false }`
**Line 1252:** For Excel, relies on AI `/api/analyze-workbook` response

The AI analysis prompt schema only requests `{ found: boolean, dateColumn, dateRange: { start, end } }`.
The AI typically returns `found: false` because the schema doesn't ask for year/month column detection.
Result: The period card is hidden entirely (line 3146 condition = false).

## 2. Data Available at Validate Step

- `analysis.sheets[].sampleRows` — **ONLY 5 ROWS** per sheet (line 1226: `jsonData.slice(0, 5)`)
- `analysis.sheets[].rowCount` — Total row count (correct)
- `analysis.sheets[].headers` — All column headers (correct)
- `fieldMappings` — `SheetFieldMapping[]` with user-confirmed mappings
- Full workbook data is NOT stored — only parsed once then discarded

## 3. Period-Related Target Fields

**Line 816-831:** `extractTargetFieldsFromPlan()` defines base fields:
- `date` (id: 'date', category: 'date', required: true)
- `period` (id: 'period', category: 'date', required: false)
- **NO `year` or `month` target fields exist**

This means: users CANNOT map Mes/Año columns to year/month because those options don't exist in the dropdown.

## 4. Server-Side Period Creation (HF-048)

**File:** `web/src/app/api/import/commit/route.ts`
**Lines 255-393:** Period detection works with two strategies:
- Strategy A: Combined period column (Excel serial date)
- Strategy B: Separate year + month columns

**Critical mismatch:** The server checks field mapping targets against `YEAR_FIELDS = ['year', 'año', 'ano', 'anio']` and `MONTH_FIELDS = ['month', 'mes']` (line 44-45). But client target field IDs are `'date'` and `'period'` — NOT `'year'` or `'month'`. So the mapping-based path ALWAYS fails.

**Auto-detect fallback (line 272-278):** Checks raw column header names against `YEAR_FIELDS`/`MONTH_FIELDS`. This works if columns are literally named "Año"/"Mes" (case-insensitive).

## 5. Cross-Sheet Entity Count: SAMPLING BUG

**Line 1723:** `rosterSheet.sampleRows.forEach(...)` — only 5 rows
**Line 1734:** `sheet.sampleRows.forEach(...)` — only 5 rows
**Result:** Shows "In roster: 5, In data: 10" instead of actual 2,157

## 6. Confidence Score

**Line 1285:** `setAnalysisConfidence(data.confidence || 0)` — uses AI API response confidence
**Line 1527:** For CSV: `setAnalysisConfidence(classification.confidence)` — uses classifier confidence
**Line 2388:** Displays `{analysisConfidence}%` — NOT hardcoded 50% in current code
The 50% value seen in browser likely comes from the AI returning 50% confidence for the analysis.

## 7. Commit Payload

**Line 2005-2015:** Sends `{ tenantId, userId, fileName, storagePath, sheetMappings }`.
Does NOT include detected periods.

## Fix Plan

1. Add `year` and `month` to target fields (line 817-831)
2. Store full row data alongside sample rows for validation scanning
3. Create `period-detector.ts` using field mappings + full data
4. Replace period card (line 3146) with actual detected periods
5. Fix entity counting to use full data, not sampleRows
6. Pass detected periods in commit payload
