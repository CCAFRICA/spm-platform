# OB-66 Phase 5: AI/ML Signal Mesh Audit

## AI Service Architecture

### Provider Abstraction Layer

| File | Purpose |
|------|---------|
| `lib/ai/ai-service.ts` | Provider-agnostic AI service (singleton pattern) |
| `lib/ai/providers/anthropic-adapter.ts` | Anthropic Claude adapter |
| `lib/ai/types.ts` | Request/response types for all AI operations |
| `lib/ai/index.ts` | Export barrel (`getAIService()`) |
| `lib/ai/file-classifier.ts` | Heuristic file classification (non-AI fallback) |
| `lib/ai/training-signal-service.ts` | Signal capture/persistence service |

**Provider:** Anthropic Claude (configurable via `NEXT_PUBLIC_AI_PROVIDER`)
**Model:** `claude-sonnet-4-20250514` (default)
**Pattern:** All AI calls go through `getAIService()` → `AIService.execute()` → provider adapter

### Direct API Bypass (AP violation)

| File | Line | Issue |
|------|------|-------|
| `api/ai/assessment/route.ts` | 11-79 | **BYPASSES AIService** — calls Anthropic API directly via `fetch()` |

This is the only bypass found. All other AI routes use `getAIService()`.

## AI Touchpoint Inventory

### API Routes (5 total)

| Route | Method | AIService? | Purpose |
|-------|--------|-----------|---------|
| `/api/ai/classify-file` | POST | Yes | File type classification |
| `/api/ai/classify-fields-second-pass` | POST | Yes | Field mapping refinement |
| `/api/ai/assessment` | POST | **NO — direct** | Persona-based dashboard assessment |
| `/api/analyze-workbook` | POST | Yes | Multi-sheet workbook analysis |
| `/api/interpret-plan` | POST | Yes | Compensation plan structure extraction |
| `/api/interpret-import` | POST | Yes | Import field mapping suggestions |

### Client-Side Call Sites

| File | Line | Endpoint Called |
|------|------|---------------|
| `data/import/enhanced/page.tsx` | 1045 | `/api/ai/classify-fields-second-pass` |
| `data/import/enhanced/page.tsx` | 1274 | `/api/analyze-workbook` |
| `lib/ai/file-classifier.ts` | 171 | `/api/ai/classify-file` |
| `components/design-system/AssessmentPanel.tsx` | 33 | `/api/ai/assessment` |
| `components/gpv/GPVWizard.tsx` | 548 | `interpretPlanDocument` (calls `/api/interpret-plan`) |

## Training Signal Pipeline

### Signal Capture

| Signal Type | Captured? | Method | File |
|-------------|----------|--------|------|
| File classification response | Yes | `captureAIResponse()` via AIService | `ai-service.ts` |
| Field mapping response | Yes | `captureAIResponse()` via AIService | `ai-service.ts` |
| Workbook analysis response | Yes | `captureAIResponse()` via AIService | `ai-service.ts` |
| Plan interpretation response | Yes | `captureAIResponse()` via AIService | `ai-service.ts` |
| User mapping corrections | Yes | `recordMappingFeedback()` | `ai-column-mapper.ts:134` |
| User field corrections | Yes | `recordUserCorrection()` | `classification-signal-service.ts:131` |

### Signal Persistence

| Storage | Table | Status |
|---------|-------|--------|
| Supabase | `classification_signals` | ACTIVE — signals written via `data-service.ts:412` |
| localStorage | `vialuce_classification_signals_{tenantId}` | ACTIVE — local cache for quick access |

### Signal Consumption

| Consumer | Reads From | Purpose |
|----------|-----------|---------|
| Observatory AI Intelligence tab | `classification_signals` (DB) | Confidence distribution, signal counts |
| Smart mapper boosting | localStorage signals | Prior corrections boost future mappings |
| `getClassificationSignals()` | DB via `data-service.ts:423` | Read signals for a tenant |

### Closed-Loop Status

| Touchpoint | Signal Captured | Persisted to DB | Consumed by Learning | Corrections Fed Back |
|------------|----------------|-----------------|---------------------|---------------------|
| File classification | Yes | Yes | Partial (Observatory stats) | No |
| Field mapping | Yes | Yes | Yes (smart mapper boost) | Yes (recordMappingFeedback) |
| Workbook analysis | Yes | Yes | Partial | No |
| Plan interpretation | Yes | Yes | Partial | No |
| Period detection | No (client-side) | No | No | No |
| Assessment | No (direct API) | No | No | No |

**Closed-loop score:** 1/6 fully closed (field mapping). 3/6 partially closed. 2/6 open.

## Heuristic Fallbacks

| File | Line | Type | Masquerades as AI? |
|------|------|------|-------------------|
| `lib/ai/file-classifier.ts` | full file | Regex-based file classification | Yes — called "classifier" but pure heuristic |
| `lib/forensics/ai-forensics.ts` | 29 | "Uses heuristic matching — no external API call" | Labeled clearly |
| `lib/ingestion/validation-service.ts` | 269-341 | Column name pattern matching for dates/amounts | No — utility function |
| `lib/compensation/plan-interpreter.ts` | 1082 | "Fallback to heuristic detection when API unavailable" | Labeled clearly |
| `lib/compensation/calculation-engine.ts` | 239 | Variant selection fallback | No — calculation logic |
| `lib/reconciliation/engine.ts` | 240 | "Try fuzzy matching as fallback" | Labeled clearly |

**Note:** `file-classifier.ts` is the most concerning — it performs regex/heuristic classification but is imported as an "AI" classifier. The actual AI classification goes through `/api/ai/classify-file`.

## Recommendations

1. **Close the assessment loop** — Route `/api/ai/assessment` through AIService, capture signal
2. **Add period detection signals** — When periods are detected client-side, persist the signal
3. **Close plan interpretation loop** — Feed user corrections back into prompt context
4. **Label heuristics clearly** — Rename `file-classifier.ts` to `heuristic-file-classifier.ts`
5. **Track signal consumption** — The Observatory shows counts but doesn't show learning improvement

---
*OB-66 Phase 5 — February 19, 2026*
