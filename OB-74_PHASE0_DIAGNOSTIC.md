# OB-74 PHASE 0: FULL PIPELINE DIAGNOSTIC

## Date: 2026-02-21
## Branch: dev

---

## 0A: PLAN IMPORT PAGE

- **Location:** `web/src/app/admin/launch/plan-import/page.tsx`
- **Sidebar link:** `Sidebar.tsx:230` → `/admin/launch/plan-import` (vlAdminOnly)
- **Also:** `/design/plans/new` for plan creation, `/design/plans` for management

## 0B: PLAN IMPORT — HOW DOES IT SAVE?

- **API Routes:**
  - `/api/interpret-plan/route.ts` — AI plan interpretation via `getAIService().interpretPlan()`
  - `/api/plan/import/route.ts` — Save/activate rule_set using service role client
  - `/api/interpret-import/route.ts` — Import interpretation

## 0C: PLAN IMPORT API — SERVICE ROLE

- **`/api/plan/import/route.ts`** uses `createServiceRoleClient()` (line 62)
- UUID validation on tenantId (CLT-59 fix)
- Upserts to `rule_sets` table
- Activate option deactivates other active rule sets for tenant

## 0D: DATA IMPORT (ENHANCED)

- **Pages:**
  - `web/src/app/operate/import/enhanced/page.tsx`
  - `web/src/app/data/import/enhanced/page.tsx` (main entry point)
- **Flow:** Upload → Analyze → Map → Validate → Approve

## 0E: AI FIELD CLASSIFICATION

- **AI Service files:**
  - `src/lib/ai/ai-service.ts` — Provider abstraction
  - `src/lib/ai/providers/anthropic-adapter.ts` — Anthropic API calls
  - `src/app/api/ai/classify-file/route.ts` — File classification endpoint
  - `src/app/api/ai/classify-fields-second-pass/route.ts` — Second-pass for unresolved fields
- **ANTHROPIC_API_KEY:** Configured in anthropic-adapter.ts via `process.env.ANTHROPIC_API_KEY`

## 0F: FIELD MAPPING — HARDCODED CONSTANTS

- **FIELD_ID_MAPPINGS:** NONE (removed in OB-72)
- **YEAR_FIELDS/MONTH_FIELDS/etc:** NONE
- **Hardcoded Spanish field names in src/lib/:** NONE in import path
- **Korean Test:** PASSES at code level

## 0G: CONFIDENCE SCORES

- **Anthropic adapter line 437:** `const confidence = (result.confidence as number) / 100 || 0.5;`
  - This normalizes AI's 0-100 scale to 0-1 internally
  - The `|| 0.5` is a fallback for MISSING confidence only (not hardcoded 50%)
  - If AI returns confidence=85, this becomes 0.85 (correct)
  - If AI returns confidence=0 or undefined, falls back to 0.5
- **Enhanced Import three-tier system:**
  - Tier 1 (auto): ≥85% — pre-selected and confirmed
  - Tier 2 (suggested): 60-84% — pre-selected, flagged for review
  - Tier 3 (unresolved): <60% — requires human selection

## 0H: DATA COMMIT

- **Route:** `src/app/api/import/commit/route.ts`
- Uses `createServiceRoleClient()` for bulk operations
- Downloads file from Supabase Storage, parses XLSX server-side
- **row_data construction (lines 455-467):**
  ```
  For each row, row_data contains BOTH:
  - Original column names: "Cumplimiento": 95.5
  - Mapped semantic types: "attainment": 95.5
  ```
- Bulk inserts in 5000-row chunks

## 0I: ENTITY RESOLUTION

- Import commit extracts external IDs from entity columns
- Checks existing entities, creates new ones in bulk (5000-row batches)
- Entity ID column detected via `ENTITY_ID_TARGETS` (generic: entityid, employee_id, etc.)

## 0J: PERIOD CREATION

- Import commit detects year/month from mapped columns
- Supports: separate year+month columns, combined period column, Excel serial dates
- Creates periods with canonical_key format `YYYY-MM`

## 0K: CALCULATION ENGINE

- **Two implementations:**
  1. `src/lib/calculation/run-calculation.ts` — Browser client (not used for clean pipeline)
  2. `src/app/api/calculation/run/route.ts` — Server-side API with service role (THE ONE)
- **Data reads:** rule_sets → rule_set_assignments → entities → committed_data
- **Metric aggregation:** `aggregateMetrics()` sums ALL numeric values by key across all rows
- **Evaluators have fallbacks:**
  - `tier_lookup`: `metrics[config.metric] ?? metrics['attainment'] ?? 0`
  - `percentage`: `metrics[config.appliedTo] ?? metrics['amount'] ?? 0`
  - `matrix_lookup`: `metrics[config.rowMetric] ?? 0` (NO FALLBACK)
  - `conditional_percentage`: base has `metrics['amount']` fallback, conditions don't

## 0L: CALCULATION API

- **Route:** `src/app/api/calculation/run/route.ts`
- Uses `createServiceRoleClient()`
- Creates `calculation_batches`, writes `calculation_results`, materializes `entity_period_outcomes`
- Transitions batch to PREVIEW state

## 0M: RULE_SET_ASSIGNMENTS

- Created in import commit (Step 9, lines 514-570)
- Auto-assigns all imported entities to the active rule set
- Checks for existing assignments to avoid duplicates

## 0N: FIELD MAPPING PERSISTENCE

- **CRITICAL FINDING:** `storeImportContext()` is a NO-OP (line 90):
  ```typescript
  function storeImportContext(ctx: AIImportContext) { console.log('[Import] Context stored:', ctx.sheets.length, 'sheets'); }
  ```
  The AI import context (sheet→component mapping) is NOT persisted to Supabase.
- **However:** Field mappings ARE applied to `row_data` during commit — both original column names AND mapped semantic types are stored.
- **classification_signals:** Writes exist but are fire-and-forget. NOT read by calculation engine.
- **import_batches:** Metadata stored but not read by calculation engine.

## 0O: SCHEMA CHECK

- Calculation engine selects: `entity_id, row_data` from committed_data
- Rule sets select: `id, name, components, input_bindings, population_config, metadata`
- Results write: `tenant_id, batch_id, entity_id, rule_set_id, period_id, total_payout, components, metrics, attainment, metadata`

---

## CRITICAL FINDINGS

### Finding 1: Import Context is a No-Op
The `storeImportContext()` function just logs to console. The AI import context (which sheet maps to which component, which columns map to which semantic types) is NOT persisted. However, this doesn't block the pipeline because field mappings are applied directly to `row_data` JSONB during the commit step.

### Finding 2: Calculation Engine Uses Generic Fallbacks
For `tier_lookup` and `percentage` components, the engine falls back to `metrics['attainment']` and `metrics['amount']` if the plan-specific metric name isn't found. This means the generic semantic types from field mapping (`"attainment"`, `"amount"`) will be picked up even if the plan component expects `"store_optical_sales_attainment"`.

### Finding 3: matrix_lookup Has No Fallback
`evaluateMatrixLookup` reads `metrics[config.rowMetric] ?? 0` with NO semantic fallback. If the plan's `rowMetric` is `"store_optical_sales_attainment"` but `row_data` only has `"attainment"`, matrix components will get $0. This may need fixing if matrix components exist in the test plan.

### Finding 4: Korean Test Passes at Code Level
Zero FIELD_ID_MAPPINGS, zero hardcoded Spanish field names in the import/calculation path. The metric-resolver.ts has Spanish patterns but is NOT used by the server-side calculation API route.

### Finding 5: Confidence Score is Real (Not Hardcoded 50%)
The `|| 0.5` in anthropic-adapter.ts is a fallback for MISSING values, not a hardcoded override. Real AI confidence flows through when available.
