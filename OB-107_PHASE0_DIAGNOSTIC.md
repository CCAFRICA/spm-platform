# OB-107 Phase 0: Import Pipeline Diagnostic

**Date**: 2026-02-26
**Status**: Complete — every file read and traced

---

## FILE INVENTORY

| # | File | Purpose |
|---|------|---------|
| 1 | `web/src/app/data/import/enhanced/page.tsx` | Main enhanced import UI (1900+ lines). Steps: upload → analyze → map → validate → approve → complete |
| 2 | `web/src/app/operate/import/enhanced/page.tsx` | Redirect → re-exports `@/app/data/import/enhanced/page` |
| 3 | `web/src/app/api/analyze-workbook/route.ts` | AI workbook analysis endpoint. Calls `aiService.analyzeWorkbook()` |
| 4 | `web/src/app/api/ai/classify-file/route.ts` | AI file classification endpoint. Calls `aiService.classifyFile()` |
| 5 | `web/src/app/api/ai/classify-fields-second-pass/route.ts` | Second-pass field classification with plan context |
| 6 | `web/src/app/api/import/prepare/route.ts` | Generates signed upload URL for Supabase Storage |
| 7 | `web/src/app/api/import/commit/route.ts` | Server-side import commit (734 lines). Bulk inserts to committed_data |
| 8 | `web/src/app/api/signals/route.ts` | GET/POST classification signals for closed-loop learning |
| 9 | `web/src/lib/import-pipeline/smart-mapper.ts` | Platform field definitions + fuzzy matching suggestions |
| 10 | `web/src/lib/import-pipeline/file-parser.ts` | Excel file parsing (getExcelWorksheets) |
| 11 | `web/src/lib/import/period-detector.ts` | Client-side period detection from field mappings (179 lines) |
| 12 | `web/src/lib/intelligence/classification-signal-service.ts` | Signal read/write facade — getSignals, getConfidentMappings, boostConfidence |
| 13 | `web/src/lib/ai/signal-persistence.ts` | Low-level Supabase persistence for classification_signals |
| 14 | `web/src/lib/ai/ai-service.ts` | AI service abstraction — analyzeWorkbook, classifyFile, classifyFieldsSecondPass |
| 15 | `web/src/lib/ai/anthropic-adapter.ts` | Anthropic API adapter with prompts for workbook analysis and field classification |
| 16 | `web/src/components/import/field-mapper.tsx` | Standalone field mapper component (uses smart-mapper PLATFORM_FIELDS) |
| 17 | `web/src/lib/ai/file-classifier.ts` | recordClassificationFeedback function |

---

## CURRENT DATA FLOW

```
1. User selects file(s) → handleFileSelect() in enhanced/page.tsx:1282
2. File parsed by → parseAllSheets() in enhanced/page.tsx:1021 (XLSX.read, all sheets)
3. AI analysis called → POST /api/analyze-workbook → aiService.analyzeWorkbook()
   Returns: sheet classifications, relationships, suggestedFieldMappings per sheet
4. Field mappings populated → Three-tier system in enhanced/page.tsx:1141-1226
   Tier 1 (auto): ≥85% AI confidence, pre-selected + confirmed
   Tier 2 (suggested): 60-84%, pre-selected, needs review
   Tier 3 (unresolved): <60%, requires human selection
5. Second-pass classification → POST /api/ai/classify-fields-second-pass
   Runs for sheets with unresolved fields (enhanced/page.tsx:785-904)
6. Validation runs → runValidation() in enhanced/page.tsx:1357
   Quality scores, period detection, cross-sheet entity matching
7. Import committed → handleSubmitImport() in enhanced/page.tsx:1704
   → POST /api/import/prepare (signed URL)
   → PUT to Supabase Storage (file upload)
   → POST /api/import/commit (metadata + server-side parsing + bulk insert)
   → POST /api/signals (field mapping signals captured)
```

---

## ROOT CAUSE 1 — CLASSIFICATION PROPAGATION

### File type classification is set at:
- `enhanced/page.tsx:1102-1117` — AI workbook analysis response populates `analysis.sheets[].classification`
- Type: `SheetClassification = 'roster' | 'component_data' | 'reference' | 'regional_partition' | 'period_summary' | 'unrelated' | 'pos_cheque'`

### It is read by validation at:
- `enhanced/page.tsx:409` — `validateCriticalFields()` skips roster/unrelated: `if (sheet.classification === 'unrelated' || sheet.classification === 'roster') continue;`
- This ONLY affects plan component metric checking. Other validation runs on ALL sheets.

### It is read by period detection at: **NEVER**
- **Client-side** (`period-detector.ts:39-113`): iterates ALL sheets and checks field MAPPINGS. If a roster column is mapped to `date`, `period`, `year`, or `month` target field, periods ARE created from roster dates.
- **Server-side** (`/api/import/commit:337-466`): iterates ALL sheets (`for (const sheet of sheetData)`) looking for PERIOD_TARGETS/YEAR_TARGETS/MONTH_TARGETS in mappings. Does NOT check classification. **This is where Caribe's 22 erroneous HireDate periods were created.**

### It is read by plan association at: **NEVER**
- Plan is loaded once on mount (line 975-984). Classification doesn't influence plan context.

### CRITICAL GAP:
The AI correctly classifies roster sheets as `'roster'`, but this classification is NOT propagated to:
1. Period detection (both client and server) — will create periods from any mapped date column on roster
2. Server-side commit route — processes all sheets identically regardless of classification
3. Plan association — no per-file plan routing

---

## ROOT CAUSE 2 — SINGLE PLAN CONTEXT

### Plan is set at:
- `enhanced/page.tsx:975-984` — `useEffect` loads first active rule_set via `getRuleSets(tenantId)`
- Sets `activePlan` state (single RuleSetConfig) and `targetFields` (derived from plan)

### Plan is used at:
- `enhanced/page.tsx:606-740` — `extractTargetFieldsFromPlan()`: generates target field dropdown options
- `enhanced/page.tsx:1076-1082` — AI workbook analysis: sends `planComponents` in prompt
- `enhanced/page.tsx:785-904` — Second-pass classification: uses `activePlan` components
- `enhanced/page.tsx:333-475` — `validateCriticalFields()`: checks plan component metric mappings
- `enhanced/page.tsx:1580-1652` — Calculation preview: uses `activePlan` configuration

### Plan changes per file: **NO**
- `activePlan` is set once on mount and never reset during file queue processing
- File queue handler (line 3725-3737) resets `analysis`, `fieldMappings`, `validationResult` but NOT `activePlan`
- ALL files in a batch use the same plan context — Deposit data, Insurance data, Mortgage data all go to the first active plan

### CRITICAL GAP:
For multi-plan tenants like Caribe Financial (Mortgage, Consumer Lending, Deposits, Insurance), every file imports under the Mortgage plan context because it's the only active plan. The AI suggests field mappings based on Mortgage component metrics, even for Consumer Lending or Deposit Growth files.

---

## ROOT CAUSE 3 — FIELD MAPPER AS GATE

### Target field options defined at:
- `enhanced/page.tsx:606-740` — `extractTargetFieldsFromPlan()` returns 25+ base fields + plan-specific component fields
- Base fields: entityId, name, storeId, date, period, year, month, role, amount, goal, attainment, quantity, storeRange, branch_name, branch_id, region, department, location, manager_id, manager_name, email, phone, hire_date, status, product_licenses
- Component fields: Dynamically extracted from plan's matrixConfig, tierConfig, percentageConfig, conditionalConfig

### smart-mapper.ts PLATFORM_FIELDS (separate from enhanced import):
- orderId, transactionId, externalId, repId, repName, date, amount, quantity, productId, productName, customerId, customerName, region, territory, channel, status, currency, commissionRate, notes

### Unmapped columns handled at:
- `/api/import/commit:540-551` — **ALL columns ARE preserved!**
```typescript
for (const [sourceCol, value] of Object.entries(row)) {
  const targetField = sheet.mappings[sourceCol];
  if (targetField && targetField !== 'ignore') {
    mapped[targetField] = value;  // Add semantic target
  }
  mapped[sourceCol] = value;  // ALWAYS preserves original column
}
```
- `row_data` at line 566: `{ ...content, _sheetName: sheet.sheetName, _rowIndex: i }`
- Content includes ALL original columns PLUS mapped semantic targets

### Unmapped columns in committed_data: **PRESERVED** ✓
The data layer already carries everything. The "gate" issue is at the UI/UX layer — columns without a target field match show as "Unresolved" (Tier 3) which implies a problem, even though the data IS preserved.

### Taxonomy limitations:
- The target field list is broad but retail-focused. Banking-specific fields (loan_amount, origination_date, deposit_balance, referral_count) are NOT in the base taxonomy.
- The AI can only map to fields in the target list. If "LoanDisbursementAmount" doesn't match any target field ID/label, it goes to Tier 3 (unresolved) even though the data is preserved.

---

## CONFIDENCE SCORES

### Classification confidence:
- `classificationConfidence` comes from AI response (0-100 integer from analyze-workbook prompt)
- Displayed at `enhanced/page.tsx:2051`: `{sheet.classificationConfidence}%`
- **NOT hardcoded** — actual AI output

### Matched component confidence:
- `matchedComponentConfidence` comes from AI response
- Displayed at `enhanced/page.tsx:2551`: `{currentMappingSheet.matchedComponentConfidence}% confidence`
- **POTENTIAL BUG**: If AI returns `null` or `undefined` for matchedComponentConfidence, this renders as `null% confidence` or just `% confidence` (literal text with no number)
- CLT-102 F-47 reported: "Matched Component: mortgage_origination_bonus, % confidence" — confirms the AI returned null/undefined

### Overall confidence:
- `analysisConfidence` at line 1118: `setAnalysisConfidence(data.confidence || 0)`
- Falls back to 0, so no "% confidence" bug here

### Quality score:
- Computed dynamically in `runValidation()` (lines 1365-1465) — NOT hardcoded
- Completeness, validity, consistency scores all computed from actual data

### Per-field confidence:
- Comes from AI response per field mapping suggestion
- Displayed as percentage badges — actual values, not hardcoded

### FIX NEEDED:
- `matchedComponentConfidence` display (line 2551): guard against null → `{(currentMappingSheet.matchedComponentConfidence ?? 0)}%`

---

## SIGNAL LOOP

### Signals WRITTEN at:
- `enhanced/page.tsx:1848-1885` — After successful import commit, POST to `/api/signals` with all confirmed field mappings
- Each signal includes: source_column, target_field, ai_confidence, tier, action (accepted/overridden), sheet_name, file_name, batch_id

### Signals READ at: **NEVER** (during import flow)
- `classification-signal-service.ts` has `getSignals()` (line 163), `getConfidentMappings()` (line 185), and `boostConfidence()` (line 242)
- These functions exist and work (read from Supabase via signal-persistence.ts)
- **BUT** the enhanced import page **NEVER** calls any of these functions
- `grep getSignals|getConfidentMappings|boostConfidence enhanced/page.tsx` → **0 matches**
- The AI prompt in `anthropic-adapter.ts` does NOT include prior signals

### CRITICAL GAP:
The signal write path works. The signal read path exists. But the import pipeline never connects them. Prior mapping decisions are stored in Supabase but never retrieved during subsequent imports. The AI makes fresh suggestions every time with no learning.

---

## MULTI-FILE

### File queue managed at:
- `enhanced/page.tsx:919` — `const [fileQueue, setFileQueue] = useState<File[]>([])`
- Drop handler (line 1302-1312): first file processed immediately, remaining queued

### Each file gets independent analysis: **YES**
- File queue handler (line 3725-3737) resets: currentStep, analysis, fieldMappings, validationComplete, validationResult, importResult, importId, importComplete, periodsCreated
- Then calls `handleFileSelect(nextFile)` which triggers fresh AI analysis

### Plan context resets per file: **NO**
- `activePlan` and `targetFields` are NOT in the reset list at lines 3729-3736
- All files in queue use the same plan context from mount

---

## SUMMARY OF FIXES NEEDED

| # | Root Cause | Current State | Fix Required |
|---|-----------|---------------|-------------|
| RC-1a | Classification → Period Detection (client) | `detectPeriods()` runs on ALL sheets | Add classification parameter; skip roster/personnel |
| RC-1b | Classification → Period Detection (server) | `/api/import/commit` Step 7 runs on ALL sheets | Pass classification in aiContext; skip roster sheets |
| RC-1c | Classification → Validation | Partially done (skips roster for component checks) | Extend: different validation rules for roster vs transaction |
| RC-2 | Single plan context | `activePlan` set once on mount | Add per-file plan selector; AI suggests plan per file; roster gets null plan |
| RC-3a | Taxonomy too narrow | 25+ base fields, retail-focused | Not a code fix — taxonomy is adequate with "carry everything" already working |
| RC-3b | "Unresolved" UI messaging | Shows red "Unresolved" badge for unmapped columns | Change to grey "Will be preserved" — cosmetic only |
| CS-1 | matchedComponentConfidence null display | `{matchedComponentConfidence}%` renders "% confidence" when null | Guard: `(matchedComponentConfidence ?? 0)%` |
| SL-1 | Signal loop not closed | Signals written but never read during import | Call `getConfidentMappings()` before AI analysis; include in prompt |

---

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `web/src/app/data/import/enhanced/page.tsx` | RC-1a: pass classification to detectPeriods. RC-2: per-file plan selector. SL-1: read prior signals. CS-1: guard null confidence. RC-3b: "Unresolved" → "Will be preserved" |
| `web/src/lib/import/period-detector.ts` | RC-1a: accept classification parameter; skip roster sheets |
| `web/src/app/api/import/commit/route.ts` | RC-1b: check aiContext classification before period detection per sheet |
| `web/src/lib/ai/anthropic-adapter.ts` | SL-1: accept prior signals in workbook analysis prompt |

---

## Proof Gates (Phase 0)

| # | Gate | Status |
|---|------|--------|
| PG-01 | Every import file read | **PASS** — 17 files traced |
| PG-02 | Data flow documented | **PASS** — 7-step flow mapped |
| PG-03 | Root Cause 1 located | **PASS** — classification NOT read by period detection (both client + server) |
| PG-04 | Root Cause 2 located | **PASS** — activePlan set once (line 975), never per-file |
| PG-05 | Root Cause 3 located | **PASS** — data layer ALREADY carries everything; issue is UI/taxonomy only |
| PG-06 | Confidence bug found | **PASS** — matchedComponentConfidence can be null → "% confidence" literal |
| PG-07 | Signal loop gap found | **PASS** — getConfidentMappings() exists but never called during import |
