# OB-77 Phase 0: Diagnostic

## Current Architecture

### AI Plan Interpreter
- `src/lib/compensation/ai-plan-interpreter.ts` — Interprets plan documents
- Uses `AIService.interpretPlan()` via Anthropic adapter
- System prompt in `src/lib/ai/providers/anthropic-adapter.ts` under `plan_interpretation` key
- Returns `PlanInterpretation` → `InterpretedComponent[]` with `calculationMethod`
- Converted to `RuleSetConfig` via `interpretationToPlanConfig()` → `PlanComponent[]`
- AI currently returns domain-specific types (matrix_lookup, tiered_lookup, etc.)
- No structural intent vocabulary in AI output today

### Training Signal Infrastructure (ALREADY EXISTS)
- `src/lib/ai/training-signal-service.ts` — `captureAIResponse()`, `recordUserAction()`, `recordOutcome()`
- `src/lib/ai/signal-persistence.ts` — Writes to `classification_signals` table in Supabase
- Fire-and-forget pattern, works in browser + server contexts
- AI service already calls `captureAIResponse()` after every AI call
- Table columns: `id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at`

### Calculate Page + Trace Page
- `src/app/admin/launch/calculate/page.tsx` — Entity rows link to `/investigate/trace/[entityId]`
- `src/app/investigate/trace/[entityId]/page.tsx` — Uses `EmployeeTrace` component
- Currently loads from old `calculation_traces` table format
- OB-76 intent traces stored in `calculation_results.metadata.intentTraces` — NOT YET displayed

---

## ARCHITECTURE DECISION RECORD — OB-77

### DECISION 1: How does the AI produce Intents?
**CHOSEN: Option A** — Modify AI system prompt to return `calculationIntent` alongside PlanComponent.
Single AI call produces both formats. PlanComponent for backward compat. ComponentIntent for executor.
**Rationale:** AI already returns `calculationMethod`. Adding `calculationIntent` is a natural extension.
The transformer remains as validation reference and safety net.

### DECISION 2: How to validate AI-produced Intents?
**CHOSEN: Option B** — Dual-path: AI Intent vs transformer Intent only.
OB-76 already proved transformer = current engine (100.0% concordance, 719/719).
Just need AI to match transformer.
**Rationale:** Simpler. Triple-path is overkill given the OB-76 proof.

### DECISION 3: Where do training signals write?
**CHOSEN: Option A** — `classification_signals` table (already exists).
`persistSignal()` in signal-persistence.ts already writes to it. Infrastructure is fully built.
**Rationale:** Purpose-built, already designed, already working. No new table needed.

### DECISION 4: Trace UI — where does it surface?
**CHOSEN: Option A** — Inline expansion on calculate page + enhanced trace page.
Entity rows on calculate page already link to `/investigate/trace/[entityId]`.
Add inline expandable trace on calculate page for quick look.
Enhance trace page to show OB-76 intent traces from `metadata.intentTraces`.
**Rationale:** Both approaches serve different needs. Quick look (inline) + deep dive (full page).
