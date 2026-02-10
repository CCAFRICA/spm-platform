# AI/ML Intelligence Audit Report

## Executive Summary

The SPM Platform has a well-architected AI abstraction layer with provider-agnostic design. The AIService is the single entry point for all AI operations, with training signal capture built into every call. However, several AI capabilities are WIRED but not fully consumed, and some promised capabilities are MISSING.

---

## 1. AI Service Infrastructure

### Files Identified
```
src/lib/ai/ai-service.ts       - Core service (singleton pattern)
src/lib/ai/file-classifier.ts  - File classification helper
src/lib/ai/index.ts            - Public exports
src/lib/ai/providers/anthropic-adapter.ts - Anthropic Claude implementation
src/lib/ai/training-signal-service.ts - Training signal capture
src/lib/ai/types.ts            - Type definitions
```

### AIService Methods (12 methods)
| Method | Task Type | State |
|--------|-----------|-------|
| `execute()` | Any | ACTIVE - Core execution |
| `classifyFile()` | file_classification | ACTIVE |
| `classifySheet()` | sheet_classification | ACTIVE |
| `suggestFieldMapping()` | field_mapping | ACTIVE |
| `classifyFieldsSecondPass()` | field_mapping_second_pass | ACTIVE |
| `interpretPlan()` | plan_interpretation | ACTIVE |
| `analyzeWorkbook()` | workbook_analysis | ACTIVE |
| `suggestImportFieldMappings()` | import_field_mapping | ACTIVE |
| `detectAnomalies()` | anomaly_detection | WIRED (method exists, no callers found) |
| `generateRecommendation()` | recommendation | WIRED (method exists, no callers found) |
| `query()` | natural_language_query | WIRED (method exists, no callers found) |

### API Routes (5 routes)
| Route | AIService Method | State |
|-------|-----------------|-------|
| `/api/ai/classify-file` | classifyFile | ACTIVE |
| `/api/ai/classify-fields-second-pass` | classifyFieldsSecondPass | ACTIVE |
| `/api/analyze-workbook` | analyzeWorkbook | ACTIVE |
| `/api/interpret-import` | suggestImportFieldMappings | ACTIVE |
| `/api/interpret-plan` | interpretPlan | ACTIVE |

---

## 2. Training Signals

### State: ACTIVE

Training signal capture is properly integrated:
- Every AIService.execute() call captures a signal via `getTrainingSignalService()`
- Signal ID returned in every AI response
- API routes include PUT endpoints for recording user actions (accepted/corrected/rejected)
- Signals stored in localStorage: `clearcomp_training_signals_${tenantId}`

### Signal Capture Locations
- `/api/ai/classify-file/route.ts` - Lines 43, 78-90
- `/api/ai/classify-fields-second-pass/route.ts` - Lines 70, 88
- `/api/analyze-workbook/route.ts` - Lines 89, 114, 138-150
- `/api/interpret-import/route.ts` - Lines 67, 92, 116-128
- `/api/interpret-plan/route.ts` - Lines 42, 67, 92-104

### Gap: No Training Signal UI
There's no UI to view captured training signals or their outcomes. The data is captured but not surfaced.

---

## 3. Plan Interpretation

### State: ACTIVE

The plan interpretation flow is fully wired:
1. User uploads PPTX/PDF via `/admin/launch/plan-import/page.tsx`
2. API route `/api/interpret-plan` calls `AIService.interpretPlan()`
3. AI extracts: plan name, effective date, components, metrics, tiers
4. Confidence scores displayed in UI

### Gap: Tier Data Extraction
The plan interpretation extracts component STRUCTURE but may not fully extract tier/matrix VALUES. This is one of the CLT-08 diagnosed issues.

---

## 4. Sheet & Field Mapping

### State: ACTIVE

Multi-pass field classification is fully implemented:
1. **First pass**: `analyzeWorkbook()` classifies sheets and suggests field mappings
2. **Pattern matching**: COMPOUND_PATTERNS for Spanish/English field names
3. **Second pass**: `classifyFieldsSecondPass()` with plan context for unresolved fields

### AIImportContext Structure
- Stored in localStorage: `import_context_${tenantId}`
- Contains: sheets[], rosterSheet, componentMapping, fieldMappings per sheet
- Used by calculation orchestrator for metric resolution

---

## 5. Anomaly Detection

### State: WIRED (Not Consumed)

- `AIService.detectAnomalies()` method exists (line 260)
- Type `anomaly_detection` defined in AITaskType
- Anthropic adapter has system prompt for anomaly detection
- **BUT**: No callers found in the codebase
- UI has anomaly display capability (`import-summary-dashboard.tsx` line 261)

---

## 6. Recommendations & Acceleration

### State: STUB/HARDCODED

- `AIService.generateRecommendation()` method exists (line 281)
- `/acceleration/page.tsx` has recommendation display
- **BUT**: Recommendations are hardcoded (line 76: `const recommendations = [...]`)
- No AI calls generate dynamic recommendations

---

## 7. Normalizer

### State: MISSING

- No file matching `*normaliz*.ts` found
- Field normalization is done inline in various places
- No centralized field normalizer service

---

## 8. Technology Inventory

### Provider
- **Anthropic Claude API** via direct fetch (not SDK)
- API URL: `https://api.anthropic.com/v1/messages`
- Version: `2023-06-01`
- Default model: `claude-sonnet-4-20250514`

### Configuration
- API key via `process.env.ANTHROPIC_API_KEY`
- Model configurable via `NEXT_PUBLIC_AI_MODEL`
- Provider configurable via `NEXT_PUBLIC_AI_PROVIDER`

### Future Providers (Stubbed)
```typescript
// case 'openai':
//   return new OpenAIAdapter(this.config);
// case 'azure_openai':
//   return new AzureOpenAIAdapter(this.config);
// case 'local':
//   return new LocalModelAdapter(this.config);
```

---

## 9. Application Routes

### Total Routes: 110 pages

| Category | Count | AI Involvement |
|----------|-------|----------------|
| Admin | 9 | 4 ACTIVE (plan-import, calculate, demo) |
| Data | 9 | 3 ACTIVE (import/enhanced, imports, quality) |
| Financial | 5 | 0 |
| Govern | 6 | 0 |
| Insights | 8 | 0 |
| Operate | 9 | 2 ACTIVE (import/enhanced) |
| Performance | 11 | 0 |
| Transactions | 8 | 0 |
| Other | 45 | 0 |

### Pages with ZERO AI Involvement: 95+

---

## 10. State Classification Summary

| Touchpoint | State | Evidence |
|------------|-------|----------|
| AIService core | ACTIVE | Singleton, 12 methods, used by 5 API routes |
| Anthropic adapter | ACTIVE | Direct API calls, working |
| Training signals | ACTIVE | Captured on every AI call, stored |
| File classification | ACTIVE | API route + UI integration |
| Sheet classification | ACTIVE | Part of workbook analysis |
| Field mapping (1st pass) | ACTIVE | Analyze workbook flow |
| Field mapping (2nd pass) | ACTIVE | Plan-context reclassification |
| Plan interpretation | ACTIVE | PPTX/PDF parsing |
| Anomaly detection | WIRED | Method exists, no callers |
| Recommendations | STUB | Hardcoded data, method unused |
| Natural language query | WIRED | Method exists, no callers |
| Normalizer | MISSING | No centralized service |
| Compensation explainer | MISSING | Not implemented |

---

## 11. Data Flow Map

```
[Import Flow]
User uploads file
    → /api/ai/classify-file → AIService.classifyFile()
    → Anthropic Claude → File classification
    → Training signal captured
    ↓
XLSX parsed
    → /api/analyze-workbook → AIService.analyzeWorkbook()
    → Anthropic Claude → Sheet + field mappings
    → Training signal captured
    ↓
Unresolved fields?
    → /api/ai/classify-fields-second-pass → AIService.classifyFieldsSecondPass()
    → Anthropic Claude → Plan-context classification
    → Training signal captured
    ↓
AIImportContext stored → Used by Orchestrator

[Plan Import Flow]
User uploads PPTX
    → /api/interpret-plan → AIService.interpretPlan()
    → Anthropic Claude → Component extraction
    → Training signal captured
    ↓
Plan stored → Used by Calculation Engine

[Dead Ends]
detectAnomalies() → Never called → No consumer
generateRecommendation() → Never called → Hardcoded instead
query() → Never called → No NLQ feature
Training signals → Captured → No visualization
```

---

## 12. First Principles Compliance

### Principle 1: ONE IMPORT EXPERIENCE
**Status: COMPLIANT**
- Single enhanced import page handles all file types
- AI classifies and routes appropriately

### Principle 2: SHARED ENTITIES, NOT DUPLICATED PAGES
**Status: COMPLIANT**
- AIService is shared across all modules
- Same import pipeline for ICM and FM

### Principle 3: PLATFORM ACCESS, NOT URL ACCESS
**Status: COMPLIANT**
- AI features accessed through navigation
- No hidden AI-only URLs

### Principle 4: NO EMPTY SHELLS
**Status: PARTIAL VIOLATION**
- Anomaly detection method exists but never renders results
- Recommendations page uses hardcoded data

### Principle 5: BE THE THERMOSTAT
**Status: PARTIAL VIOLATION**
- Import flow provides actionable suggestions
- BUT: No AI-powered compensation explainer
- BUT: No dynamic recommendations

### Principle 6: CC ADMIN ALWAYS ENGLISH
**Status: COMPLIANT**
- AI prompts are in English
- Training signals use English labels

---

## 13. Counts Summary

| Metric | Count |
|--------|-------|
| ACTIVE AI touchpoints | 8 |
| WIRED (unused) touchpoints | 3 |
| STUB touchpoints | 1 |
| MISSING touchpoints | 2 |
| AI call sites WITH training signal capture | 5/5 (100%) |
| AI call sites WITHOUT training signal capture | 0 |
| Pages with AI involvement | 6 |
| Pages with ZERO AI involvement | 95+ |

---

## 14. Recommendations

### High Priority (Mission A2 - ICM Engine)
1. Fix isCertified derivation from employee role
2. Ensure plan components have tier/matrix data
3. Fix metric name resolution (prefixed names)

### Medium Priority (Mission C - Value Prop)
1. Implement AI Compensation Explainer
2. Wire anomaly detection into import flow
3. Replace hardcoded recommendations with AIService.generateRecommendation()

### Low Priority (Future)
1. Add training signal visualization dashboard
2. Implement natural language query for compensation questions
3. Create centralized field normalizer service

---

*Generated by OB-20 Phase 1: AI/ML Intelligence Audit*
*Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>*
