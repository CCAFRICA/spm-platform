# HF-055 DIAGNOSTIC — AI Signal System Audit

## 1. AIService Architecture

**Singleton:** `getAIService()` in `web/src/lib/ai/ai-service.ts`
- Provider-agnostic AIService with Anthropic adapter (only current provider)
- Every AI call goes through `execute()` method
- Lines 102-115: After every AI response, calls `getTrainingSignalService().captureAIResponse()`
- Signal capture is automatic — every AI response gets a `signalId`

**Convenience methods (all route through execute()):**
- `classifySheet()` — sheet classification
- `suggestFieldMapping()` — field mapping
- `classifyFieldsSecondPass()` — CLT-08 second-pass classification
- `interpretPlan()` — plan interpretation
- `analyzeWorkbook()` — multi-sheet analysis
- `suggestImportFieldMappings()` — import field mapping
- `detectAnomalies()` — anomaly detection
- `generateRecommendation()` — recommendation generation
- `query()` — natural language query

## 2. Signal Capture Points

### THREE signal services (all broken — localStorage removed):

**A) TrainingSignalService** (`lib/ai/training-signal-service.ts`)
- Called by: `AIService.execute()` at line 105
- `captureAIResponse()` creates TrainingSignal with: signalId, requestId, task, tenantId, userId, aiOutput, aiConfidence, userAction, metadata
- `getSignals()` → returns `[]` (line 116-118)
- `setSignals()` → no-op (line 238-240)
- `saveSignal()` → calls getSignals + push + setSignals, but both are no-ops

**B) ClassificationSignalService** (`lib/intelligence/classification-signal-service.ts`)
- Called by: `ai-column-mapper.ts` via `recordAIClassificationBatch()`, `recordUserConfirmation()`, `recordUserCorrection()`
- `recordSignal()` → calls `loadSignals()` + push + `saveSignals()`, but both are no-ops
- `loadSignals()` → returns `[]` (line 271-273)
- `saveSignals()` → no-op (line 276-278)
- `getConfidentMappings()` → calls `getSignals()` which calls `loadSignals()` → always empty

**C) NavigationSignals** (`lib/navigation/navigation-signals.ts`)
- User behavior analytics (search, workspace, queue clicks)
- `storeSignal()` → no-op
- `getStoredSignals()` → returns `[]`
- Out of scope for this HF (not AI prediction signals)

## 3. In-Memory Buffer Structure

**There is NO in-memory buffer.** The localStorage was completely removed, making all three signal services into no-ops. Signals are:
1. Created in memory (TrainingSignal or ClassificationSignal objects)
2. Passed to `saveSignals()` or `setSignals()`
3. Silently discarded (no-op functions)

The in-memory array only lives within the scope of a single function call and is never persisted.

## 4. Database State

**Table EXISTS** — created in migration 003, enhanced in migration 007.

**Columns (003 + 007 combined):**
| Column | Source | Type |
|--------|--------|------|
| id | 003 | uuid PK |
| tenant_id | 003 | uuid FK → tenants.id |
| entity_id | 003 | uuid FK → entities.id |
| signal_type | 003 | text NOT NULL |
| signal_value | 003 | jsonb NOT NULL DEFAULT '{}' |
| confidence | 003 | numeric(5,4) |
| source | 003 | text |
| context | 003 | jsonb NOT NULL DEFAULT '{}' |
| created_at | 003 | timestamptz NOT NULL DEFAULT now() |
| event_id | 007 | uuid FK → ingestion_events.id |
| ai_prediction | 007 | text |
| ai_confidence | 007 | float |
| user_decision | 007 | text |
| was_corrected | 007 | boolean DEFAULT false |

**RLS:** 3 policies (select_tenant, insert, vl_admin read, update)
**Indexes:** tenant_id, entity_id, (tenant_id, signal_type), event_id

## 5. getTrainingSignals / Existing Supabase Persistence

**ALREADY EXISTS in `data-service.ts`:**
- `recordClassificationSignal(tenantId, signal)` — line 390-415
  - Inserts into `classification_signals` using SCHEMA_REFERENCE.md columns
  - Works correctly with: tenant_id, entity_id, signal_type, signal_value, confidence, source, context
- `getClassificationSignals(tenantId, options)` — line 420-437
  - Reads from `classification_signals` with filtering by signal_type, entity_id, limit

**ALSO EXISTS:** `/api/ingest/classification/route.ts`
- Uses OB-50 columns: event_id, ai_prediction, ai_confidence, user_decision, was_corrected
- These are the 007-enhanced columns, different from the core columns
- May or may not work depending on whether 007 migration was applied

## 6. Gap Analysis

**The gap is NOT "no persistence code exists." The gap is "persistence code exists but signal services don't call it."**

```
CURRENT FLOW (BROKEN):
AIService.execute() → TrainingSignalService.captureAIResponse() → saveSignal() → setSignals() → NO-OP
ai-column-mapper → ClassificationSignalService.recordAIClassificationBatch() → recordSignal() → saveSignals() → NO-OP

DESIRED FLOW:
AIService.execute() → TrainingSignalService.captureAIResponse() → data-service.recordClassificationSignal() → Supabase
ai-column-mapper → ClassificationSignalService.recordSignal() → data-service.recordClassificationSignal() → Supabase
```

**Fix strategy:**
1. Table already exists — no migration needed (Mission 1: verify only)
2. Wire `classification-signal-service.ts` to call `data-service.ts` functions instead of no-op localStorage
3. Wire `training-signal-service.ts` to call `data-service.ts` functions
4. Sheet classification already calls ClassificationSignalService — once it persists, signals flow
5. Field mapping already calls ClassificationSignalService — same fix
6. Plan interpretation goes through AIService → TrainingSignalService — needs the training signal fix
