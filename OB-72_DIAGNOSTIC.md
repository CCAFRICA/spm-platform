# OB-72 Phase 0: Diagnostic Report

## 1. Five Layers of Proof — Current State

### What Exists
- **Trace page**: `/investigate/trace/[entityId]/page.tsx` — full forensic trace per entity
- **EmployeeTrace component**: `components/forensics/EmployeeTrace.tsx` renders trace data
- **Results dashboard**: `/operate/results/page.tsx` — L5 summary cards + entity table
- **RepDashboard**: Expandable component list per entity (pattern to reuse)
- **calculation_results JSONB**: `components`, `metrics`, `attainment` columns
- **entity_period_outcomes**: Materialized aggregates per entity+period
- **Calculation service**: `getEntityResults()`, `getCalculationResults()`, `getEntityPeriodOutcomes()`

### JSONB Structure (components)
```json
[{
  "componentId": "string",
  "componentName": "string",
  "componentType": "string",
  "payout": number,
  "outputValue": number,
  "details": { ... }
}]
```

### What's Missing
- **No L5 Outcome summary** with aggregate stats on results page (total, mean, median, anomaly count)
- **No L4 Population drill-down** — entity table exists but no "click to see proof" expandable detail
- **No L3 Component detail** — component breakdown shows name+amount but no formula/inputs/output trace
- **No L2 Metric detail** — no way to see raw metric values, goal, attainment per component
- **No anomaly auto-invoke** — anomaly detection exists but is never called

## 2. FIELD_ID_MAPPINGS — Current State

### Location & Size
- `web/src/app/data/import/enhanced/page.tsx` lines 546-703: **80+ entries** in FIELD_ID_MAPPINGS
- `web/src/app/data/import/enhanced/page.tsx` lines 707-751: **30+ entries** in COMPOUND_PATTERNS
- `web/src/lib/supabase/data-service.ts` lines 590-627: Hardcoded Spanish field names (periodFieldNames, yearFieldNames, monthFieldNames)

### Korean Test Violation
If headers are in Korean/Japanese/Arabic, FIELD_ID_MAPPINGS returns null and no mapping occurs.
The AI classifier IS already called and CAN handle any language — but the hardcoded mapping runs FIRST
and masks the AI's role. The AI suggestion normalizer also depends on FIELD_ID_MAPPINGS.

### Functions Using FIELD_ID_MAPPINGS
1. `normalizeFieldWithPatterns()` — Step 1 checks FIELD_ID_MAPPINGS exact match
2. `normalizeAISuggestionToFieldId()` — tries direct mapping first, then targetField matching

### Plan
Replace hardcoded mappings with AI-first approach. Keep targetField matching (language-agnostic).
Move remaining lookup to a config/DB table if needed for fallback.

## 3. Audit Logs — Current State

### Table: audit_logs
Columns: `id, tenant_id, profile_id, action, resource_type, resource_id, changes, metadata, ip_address, created_at`
NOTE: Schema uses `profile_id` (not user_id), `resource_type` (not entity_type), `resource_id` (not entity_id)

### Logger: Already Exists
`web/src/lib/audit/audit-logger.ts` — `writeAuditLog(supabase, entry)` utility
- Non-fatal: logs error but does not throw
- Accepts any Supabase client

### Already Instrumented
1. `web/src/app/api/disputes/route.ts` — POST (dispute.created)
2. `web/src/app/api/disputes/[id]/route.ts` — PATCH (dispute.status_changed)
3. `web/src/app/api/approvals/route.ts` — POST (approval.requested)
4. `web/src/app/api/approvals/[id]/route.ts` — PATCH (approval.status_changed)

### Not Yet Instrumented
- Lifecycle transitions (batch state changes)
- Data import completion
- Calculation run start/complete

## 4. Dispute Detail — Current State

### Problem
`/transactions/disputes/[id]/page.tsx` line 45: `const loaded = getDispute(disputeId)` — calls sync in-memory function that ALWAYS returns null (localStorage removed in OB-68).

### Async Functions Available
- `getDisputeAsync(disputeId)` — fetches from `/api/disputes/:id`
- `getDisputesAsync(filters)` — fetches list from `/api/disputes`
- API routes exist: POST/GET `/api/disputes`, GET/PATCH `/api/disputes/:id`

### Fix Required
Rewire detail page to use `getDisputeAsync()` instead of sync `getDispute()`.
Also rewire `startReview()` and `resolveDispute()` to use `updateDisputeAsync()`.

## 5. Anomaly Detection — Current State

### Utility Exists
`web/src/lib/intelligence/anomaly-detection.ts` — `detectAnomalies(records, assignedEntityIds)`
Detects: identical_values, outlier_high, outlier_low, zero_payout, missing_entity

### Problem: ORPHANED
- Never imported or called from any production code
- Assessment API (`/api/ai/assessment`) does not invoke anomaly detection
- Import service has a LOCAL duplicate (different implementation)

### Fix Required
Wire `detectAnomalies()` into the assessment API, passing results to the AI prompt as context.

---

## Architecture Decisions

### Decision 1: Five Layers UI Pattern
**Choice: Inline expandable rows on existing results page**

Rationale:
- Results page already has entity table with click-to-trace navigation
- RepDashboard already uses expandable component pattern
- No new routes needed — add expandable detail inline
- L5 = summary cards (already exist, enhance), L4 = entity rows (already exist, add expand), L3/L2 = expanded detail

### Decision 2: FIELD_ID_MAPPINGS Replacement
**Choice: AI-first with targetField fallback**

Approach:
1. Remove FIELD_ID_MAPPINGS constant entirely
2. Remove COMPOUND_PATTERNS constant entirely
3. `normalizeFieldWithPatterns()` → try targetField direct match first (language-agnostic), then return null
4. `normalizeAISuggestionToFieldId()` → keep only the targetField matching logic (already language-agnostic)
5. AI classifier remains the primary mapping engine (already works for any language)
6. data-service.ts Spanish field names for period detection → keep but document (these are data parsing, not UI mapping)

Korean Test verification: After removal, a Korean header should flow through to AI classifier and get properly mapped.

### Decision 3: Audit Log Pattern
**Choice: Existing pattern is correct — add to lifecycle transitions**

The logger + dispute/approval instrumentation already follow the right pattern.
Add audit logging to:
- Lifecycle transitions in calculation-service
- Import completion events (if route exists)
- Calculation batch creation
