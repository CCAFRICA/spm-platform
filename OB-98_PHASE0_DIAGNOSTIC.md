# OB-98 Phase 0: Agentic Intelligence Diagnostic

## 0A: Existing AI/Assessment Components
- `web/src/lib/ai/ai-service.ts` — Provider-agnostic AI abstraction (Anthropic adapter)
- `web/src/lib/ai/training-signal-service.ts` — Classification signal capture
- `web/src/lib/agents/insight-agent.ts` — Dual-mode: inline (during calc) + full analysis (post-run)
- `web/src/lib/intelligence/ai-metrics-service.ts` — Signal accuracy/calibration metrics
- `web/src/lib/intelligence/classification-signal-service.ts` — Signal recording/retrieval
- `web/src/components/design-system/AssessmentPanel.tsx` — AI-powered markdown assessment card
- `web/src/components/agents/AgentInbox.tsx` — Agent recommendations/alerts
- `web/src/components/platform/AIIntelligenceTab.tsx` — Observatory AI metrics
- `web/src/lib/forensics/ai-forensics.ts` — Forensic AI analysis
- `web/src/lib/compensation/ai-plan-interpreter.ts` — Plan interpretation
- `web/src/lib/reconciliation/ai-column-mapper.ts` — Reconciliation column mapping

## 0B: Existing LLM Call Sites
- All LLM calls go through `AIService` abstraction
- `web/src/lib/ai/providers/anthropic-adapter.ts` — Direct Anthropic SDK
- `/api/ai/assessment` — Dashboard assessment (POST, persona + data → narrative)
- `/api/ai/classify-file` — File classification
- `/api/ai/classify-fields-second-pass` — Field classification
- `/api/interpret-plan` — Plan interpretation
- Zero direct provider coupling in feature code

## 0C: AI Service Abstraction
- `AIService` class with `execute()` method
- Provider: `process.env.NEXT_PUBLIC_AI_PROVIDER` (default: 'anthropic')
- Model: `process.env.NEXT_PUBLIC_AI_MODEL` (default: 'claude-sonnet-4-20250514')
- Graceful degradation: returns `{ error, fallback: true, confidence: 0 }` on failure
- Signal capture: auto-records AI calls to classification_signals

## 0D: Dashboard Components Per Persona
- **Admin:** `web/src/components/dashboards/AdminDashboard.tsx` (8 visual forms + AssessmentPanel + AgentInbox)
- **Manager:** `web/src/components/dashboards/ManagerDashboard.tsx` (zone metrics + pacing + AssessmentPanel + AgentInbox)
- **Rep:** `web/src/components/dashboards/RepDashboard.tsx` (10 visual forms + AssessmentPanel + AgentInbox)
- **All render from:** `web/src/app/perform/page.tsx` (persona-conditional)

## 0E: Existing Insight Card Pattern
- No standalone `InsightCard` component exists
- AssessmentPanel renders AI markdown in collapsible glass card
- AgentInbox renders agent recommendations/alerts
- OB-96 Financial pages have inline insight cards (not componentized)

## 0F: Data Structures
### AdminDashboardData
- totalPayout, entityCount, attainmentDistribution[], storeBreakdown[], lifecycleState, exceptions[], componentComposition[], aiMetrics?

### ManagerDashboardData
- teamTotal, teamMembers[], zoneAverage, accelerationOpportunities[]

### RepDashboardData
- totalPayout, components[], rank, totalEntities, neighbors[], history[], attainment

### calculation_results (SCHEMA_REFERENCE)
- entity_id, batch_id, rule_set_id, period_id, total_payout (numeric), components (jsonb), metrics (jsonb), attainment (jsonb)

### rule_sets (SCHEMA_REFERENCE)
- components (jsonb) — contains tier/matrix structures for trajectory parsing

## 0G: POST OB-97 Route Structure
### Perform workspace (integration targets):
- `/perform/page.tsx` — Persona dashboard hub (AdminDashboard | ManagerDashboard | RepDashboard)
- `/perform/dashboard/page.tsx` — Re-exports /perform/page.tsx
- `/perform/compensation`, `/perform/inquiries`, `/perform/team`, `/perform/transactions`, `/perform/trends`

### Operate workspace:
- `/operate/page.tsx`, `/operate/results`, `/operate/reconciliation`, `/operate/calculate`
- `/operate/import/enhanced`, `/operate/import/history`

### Financial workspace:
- `/financial/page.tsx`, `/financial/performance`, `/financial/staff`, `/financial/products`
- `/financial/timeline`, `/financial/patterns`, `/financial/summary`, `/financial/leakage`

## 0H: Context Providers
### SessionContext (`web/src/contexts/session-context.tsx`)
- SessionCounts: entityCount, periodCount, batchCount, ruleSetCount, importBatchCount, signalCount
- loadCounts() — batched Promise.all()

### OperateContext (`web/src/contexts/operate-context.tsx`)
- Plans, Periods, Batches with cascading selections
- selectedPlanId, selectedPeriodId, selectedBatchId
- Persists in sessionStorage

### PersonaContext (`web/src/contexts/persona-context.tsx`)
- persona: 'admin' | 'manager' | 'rep'
- entityId (for rep persona)
- derivePersona() from role + capabilities

## 0I: Service Layer
- `web/src/lib/supabase/calculation-service.ts` — Batch/results CRUD
- `web/src/lib/supabase/rule-set-service.ts` — getRuleSets(), getRuleSet(), getActiveRuleSet()
- `web/src/lib/supabase/data-service.ts` — Import/committed data CRUD
- `web/src/lib/supabase/entity-service.ts` — Entity CRUD
- `web/src/lib/supabase/auth-service.ts` — Auth operations
- `web/src/lib/data/persona-queries.ts` — Persona-scoped dashboard queries

## 0J: Integration Point Map

| Feature | Target File | Location |
|---------|------------|----------|
| InsightPanel (Admin) | `web/src/components/dashboards/AdminDashboard.tsx` | Below hero metrics, above tables |
| InsightPanel (Manager) | `web/src/components/dashboards/ManagerDashboard.tsx` | Below team summary |
| InsightPanel (Rep) | `web/src/components/dashboards/RepDashboard.tsx` | Below hero, above components |
| RepTrajectory | `web/src/components/dashboards/RepDashboard.tsx` | Below scenario cards |
| NextAction | `web/src/app/perform/page.tsx` | Below PeriodRibbon, above dashboard |
| Financial insights | Already inline in OB-96 financial pages | Extend existing pattern |
