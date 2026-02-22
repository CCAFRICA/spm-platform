# OB-75 Phase 0: Pipeline Diagnostic

## 0A: AI Import Context Flow

### Current State
- `storeImportContext()` at enhanced/page.tsx:90 is a NO-OP: `console.log()` only
- The `AIImportContext` object has rich data:
  - `sheets[].matchedComponent` (AI-determined component name)
  - `sheets[].matchedComponentConfidence` (confidence score)
  - `sheets[].fieldMappings[]` (source column → semantic type + confidence)
  - `rosterSheet`, `rosterEmployeeIdColumn`
- This is called at line 1837 BEFORE the commit API call
- **The AI context is NEVER sent to the /api/import/commit endpoint**
- **import_batches table has NO metadata column** — only error_summary JSONB

### SHEET_COMPONENT_PATTERNS in Calculation Path
1. `run-calculation.ts:26-27` — imports SHEET_COMPONENT_PATTERNS
2. `run-calculation.ts:268-283` — `findMatchingSheet()` uses regex patterns
3. `run-calculation.ts:313-377` — `buildMetricsForComponent()` calls findMatchingSheet
4. **Korean Test: FAILS** — Spanish regex patterns would not match Hangul sheet names

## 0B: Entity Assignment Flow

### Creation (import/commit/route.ts)
- Lines 514-570: ALL unique entities get assignments (no cap)
- Check existing: batches of 1000 (pagination only, no limit)
- Insert new: batches of 5000 (pagination only, no limit)

### Calculation Fetch (calculation/run/route.ts)
- **Line 70-74: `rule_set_assignments` query has NO .limit()**
- **Supabase JS client defaults to 1000 rows when no limit specified**
- **THIS IS THE 1000-ENTITY BUG** — PostgresT default, not a code cap
- Same issue on line 94-97 (entities query) and line 118-122 (committed_data query)
- committed_data for a period could be 17K+ rows but only 1000 fetched

## 0C: Period Creation Flow

### Period Detection (import/commit/route.ts lines 252-382)
- Extracts year/month from data (Excel serial dates + separate year/month columns)
- Validates: year 2020-2030, month 1-12
- **start_date IS set**: first day of month (e.g., 2024-01-01)
- **end_date IS set**: last day of month (e.g., 2024-01-31)
- canonical_key = "YYYY-MM"
- Deduplication: checks existing periods by canonical_key before creating

### Conclusion
Period creation code is CORRECT. The "phantom periods" from OB-75 prompt may be stale from earlier runs. Need to verify actual DB state.

## 0D: Calculation Result Display

### Summary vs Detail
- Batch summary stored in calculation_batches.summary JSONB
- Entity detail in calculation_results table
- Potential AP-21 violation: if summary reads from batch metadata but detail reads from calculation_results with a join issue

## ROOT CAUSES

1. **AI Context Lost**: storeImportContext is NO-OP + import_batches lacks metadata column
2. **1000-Entity Cap**: Supabase default row limit on 3 queries in calculation route
3. **Hardcoded Patterns**: SHEET_COMPONENT_PATTERNS replaces AI intelligence with regex
