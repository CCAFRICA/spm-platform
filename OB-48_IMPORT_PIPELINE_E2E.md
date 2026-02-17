# OB-48: IMPORT PIPELINE E2E ON SUPABASE + CONFIGURABLE LIFECYCLE PIPELINE

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Completion report file is created BEFORE final build verification, then appended with build results.
7. VL Admin: all users select preferred language. No forced English override.
8. Security/scale/performance by design not retrofitted. AI-first never hardcoded. Domain-agnostic always.

## CC Anti-Patterns (DO NOT DO THESE)
- **Placeholder Syndrome:** Substitutes stubs for real logic
- **Schema Disconnect:** Writes to one field, reads from another
- **Silent Fallbacks:** Returns zero/null instead of throwing errors
- **Report Burial:** Saves reports in subdirectories instead of project root
- **Autonomy Leakage:** Stops to ask despite explicit autonomy directive
- **localStorage Regression:** ANY code path that reads/writes localStorage for business data is a BUG. All business data flows through Supabase. The ONLY acceptable localStorage use is ephemeral UI state (sidebar collapsed, theme preference).
- **Hardcoded Lifecycle:** Do NOT hardcode a fixed sequence of lifecycle states. The lifecycle is a configurable pipeline, not a rigid subway.

---

## CONTEXT — WHY THIS MATTERS

ViaLuce's import pipeline is the core value proposition. A customer uploads a plan document and data files through the UI → AI interprets the plan → AI classifies and maps the data → calculations run → results appear. This pipeline worked on localStorage. It has NEVER been tested end-to-end on Supabase.

The two existing demo tenants (Óptica Luminar, Velocidad Deportiva) were populated via seed scripts that wrote directly to Supabase tables — bypassing the import pipeline entirely. This means:
- Plan import UI → Supabase: **UNTESTED**
- Data import UI → Supabase: **UNTESTED**
- AI classification → Supabase signals: **UNTESTED**
- Calculation trigger → Supabase results: **UNTESTED**

Without a working import pipeline, every new customer requires manual seed scripting. The platform cannot scale.

This OB also replaces the hardcoded 9-state linear lifecycle with a **configurable lifecycle pipeline** that adapts to tenant maturity — the most significant architectural innovation in ViaLuce's period management.

### What Must Work After This OB

A user logged into a tenant can:
1. Navigate to the import page and upload a plan document (PPTX/PDF)
2. AI interprets the plan → components, tiers, lookup tables extracted
3. Admin reviews and confirms the interpretation
4. Rule set is saved to `rule_sets` table in Supabase
5. Navigate to data import and upload an Excel data package
6. AI classifies sheets and maps fields
7. Admin reviews and confirms field mappings
8. Data is committed to `committed_data` table in Supabase
9. Entities are created/resolved in `entities` table
10. Periods are detected and created in `periods` table
11. Admin triggers calculation → results written to `calculation_results`
12. Lifecycle advances through a configurable pipeline (not a fixed subway)
13. Results appear on the dashboard

### Test Data Available

Use the Óptica Luminar demo file package (already created):
- **Plan:** The RetailCGMX plan document (PPTX with 7 components, Spanish language, tier tables)
- **Data:** The RetailCGMX data package (XLSX with 7 sheets, 22 employees for OL subset)

If the original files aren't available in the repo, use any of the demo file packages created during SD-002. The key is: upload through the UI, not via seed script.

---

## PHASE 0-PRE: FIX OBSERVATORY TENANT QUERY (HF-037 Residual)

**CONTEXT:** HF-037 moved Observatory queries to a server-side API route (`/api/platform/observatory/route.ts`) using `createServiceRoleClient()`. The service role client successfully queries `entities` (57), `calculation_batches` (9), and `periods` (2) — but the `tenants` table query returns 0 rows and `tenantCards: []`. This means the tenant fleet cards don't render and VL Admin cannot enter a tenant from the Observatory.

**The response from `/api/platform/observatory` is:**
```json
{
  "overview": {
    "tenantCount": 0,
    "activeTenantCount": 0,
    "totalEntities": 57,
    "totalBatches": 9,
    "activePeriodsCount": 2
  },
  "tenantCards": [],
  "queue": []
}
```

**Root cause is in the API route's tenant query.** The service role client works for other tables. Something specific to the tenants query is wrong. Likely causes:
1. Table name mismatch (`tenant` vs `tenants`)
2. Column name in select doesn't exist (causing silent empty return)
3. Status filter (`WHERE status = 'active'`) but tenants have a different status value
4. The tenants query has an error that's being swallowed (try/catch returning empty array)

### Fix Steps

1. **Open** `/api/platform/observatory/route.ts` (or wherever the fleet tab handler is)
2. **Find** the tenant count query and the tenant cards query
3. **Add explicit error logging** — if the Supabase query returns an error, log it:
   ```typescript
   const { data, error } = await serviceClient.from('tenants').select('*');
   if (error) console.error('TENANT QUERY ERROR:', error);
   ```
4. **Run the dev server** and hit the observatory endpoint, check server console for the error
5. **Fix** the actual query issue (table name, column name, status filter, or error handling)
6. **Verify** the response now includes `tenantCount: 2` and `tenantCards` with Óptica Luminar and Velocidad Deportiva

Also check: there are still **400 errors** on direct browser-side `tenants?select=...` calls in the network tab. Find and eliminate any remaining direct Supabase client calls to the tenants table from Observatory components. All Observatory data should flow through the `/api/platform/observatory` server route.

**Proof gate:** Visiting `/select-tenant` as VL Admin shows the Observatory with fleet cards for both tenants. Clicking a fleet card enters the tenant.

**Commit:** `OB-48 Phase 0-PRE: fix Observatory tenant query (HF-037 residual)`

---

## PHASE 0: DIAGNOSTIC — Map the Current Pipeline

This is the most important phase. Read everything, change nothing. Document what exists.

### 0A: Find the import pages

```bash
echo "=== IMPORT ROUTES ==="
find web/src/app -path "*import*" -name "page.tsx" 2>/dev/null
find web/src/app -path "*operate*" -name "page.tsx" 2>/dev/null

echo ""
echo "=== PLAN IMPORT ROUTES ==="
find web/src/app -path "*plan*" -name "page.tsx" 2>/dev/null
find web/src/app -path "*design*" -name "page.tsx" 2>/dev/null
```

### 0B: Find the import service layer

```bash
echo "=== IMPORT SERVICES ==="
find web/src -name "*import*" -name "*.ts" | grep -v node_modules | grep -v .next
find web/src -name "*upload*" -name "*.ts" | grep -v node_modules | grep -v .next

echo ""
echo "=== DATA LAYER SERVICES ==="
find web/src -name "*data-layer*" -o -name "*DataLayer*" -o -name "*committed*" | grep -v node_modules | grep -v .next

echo ""
echo "=== AI SERVICES ==="
find web/src -name "*ai-service*" -o -name "*AIService*" -o -name "*ai_service*" | grep -v node_modules | grep -v .next
find web/src -name "*classify*" -o -name "*interpret*" | grep -v node_modules | grep -v .next
```

### 0C: Find localStorage references in business logic

```bash
echo "=== localStorage IN BUSINESS LOGIC (POTENTIAL BUGS) ==="
grep -rn "localStorage" web/src/lib/ web/src/app/ web/src/components/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | \
  grep -v "theme\|sidebar\|collapsed\|preference\|locale" | head -30
```

Any localStorage reference in import, calculation, plan, data-layer, orchestration, or engine code is a BUG that must be fixed.

### 0D: Find the plan interpretation pipeline

```bash
echo "=== PLAN INTERPRETER ==="
grep -rn "interpretPlan\|planInterpret\|parsePlan\|analyzePlan" web/src/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -15

echo ""
echo "=== WHERE DOES THE RULE SET GET SAVED? ==="
grep -rn "rule_set\|ruleset\|compensation_plan\|savePlan\|createPlan" web/src/lib/ \
  --include="*.ts" | grep -v node_modules | grep -v .next | head -15
```

### 0E: Find the calculation trigger

```bash
echo "=== CALCULATION TRIGGER ==="
grep -rn "runCalculation\|triggerCalculation\|startCalculation\|executeCalculation" web/src/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -15

echo ""
echo "=== ORCHESTRATOR ==="
find web/src -name "*orchestrat*" -name "*.ts" | grep -v node_modules | grep -v .next
```

### 0F: Find API routes for server-side operations

```bash
echo "=== API ROUTES ==="
find web/src/app/api -name "route.ts" 2>/dev/null
ls -la web/src/app/api/ 2>/dev/null

echo ""
echo "=== ANTHROPIC KEY USAGE ==="
grep -rn "ANTHROPIC\|anthropic\|claude\|ai.*key" web/src/app/api/ \
  --include="*.ts" | grep -v node_modules | head -10
```

### 0G: Check Supabase write paths

```bash
echo "=== SUPABASE INSERTS IN IMPORT/CALC CODE ==="
grep -rn "\.insert\|\.upsert\|\.update" web/src/lib/ \
  --include="*.ts" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== WHICH TABLES GET WRITTEN TO? ==="
grep -rn "from('\|from(\"" web/src/lib/ \
  --include="*.ts" | grep -v node_modules | grep -v .next | \
  grep "insert\|upsert\|update" | head -20
```

### 0H: Find current lifecycle state machine

```bash
echo "=== CURRENT LIFECYCLE STATES ==="
grep -rn "LIFECYCLE_STATES\|LifecycleState\|lifecycle_state\|lifecycleState" web/src/lib/ \
  --include="*.ts" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== CURRENT TRANSITION RULES ==="
grep -rn "VALID_TRANSITIONS\|allowedTransitions\|transitionLifecycle" web/src/lib/ \
  --include="*.ts" | grep -v node_modules | grep -v .next | head -15

echo ""
echo "=== LIFECYCLE SERVICE FILE ==="
cat web/src/lib/lifecycle/lifecycle-service.ts 2>/dev/null | head -60
cat web/src/lib/calculation/calculation-lifecycle-service.ts 2>/dev/null | head -60
```

### Phase 0 Required Output

Document in the completion report:

```
IMPORT PIPELINE AUDIT
=====================================
Plan Import Page:          [path or NOT FOUND]
Data Import Page:          [path or NOT FOUND]
Enhanced/DPI Import:       [path or NOT FOUND]
Plan Interpreter Service:  [path or NOT FOUND]
AI Service:                [path or NOT FOUND]
Data Layer Service:        [path or NOT FOUND]
Calculation Orchestrator:  [path or NOT FOUND]

STORAGE BACKEND
=====================================
Plan/Rule Set saves to:    [Supabase table / localStorage / NOT FOUND]
Committed data saves to:   [Supabase table / localStorage / NOT FOUND]
Entities save to:          [Supabase table / localStorage / NOT FOUND]
Periods save to:           [Supabase table / localStorage / NOT FOUND]
Calc results save to:      [Supabase table / localStorage / NOT FOUND]
Classification signals:    [Supabase table / localStorage / NOT FOUND]
Lifecycle state:           [Supabase table / localStorage / NOT FOUND]

localStorage REFERENCES IN BUSINESS LOGIC
=====================================
[List every file:line that reads/writes localStorage for non-UI data]
[Each of these is a bug that must be fixed]

API ROUTES
=====================================
/api/ai/classify:          [EXISTS / NOT FOUND]
/api/ai/interpret-plan:    [EXISTS / NOT FOUND]
/api/import/upload:        [EXISTS / NOT FOUND]
/api/calculations/run:     [EXISTS / NOT FOUND]

ANTHROPIC_API_KEY
=====================================
Referenced in:             [which files]
Available in env:          [check process.env — DO NOT LOG THE KEY]

LIFECYCLE STATE MACHINE
=====================================
States defined:            [list all states]
Transition map:            [paste the map]
Service file:              [path]
Is it a hardcoded array:   [YES/NO]

CRITICAL GAPS
=====================================
[List every step in the import pipeline that is NOT wired to Supabase]
[This list becomes the fix phases]
```

**Commit:** `OB-48 Phase 0: import pipeline and lifecycle diagnostic audit`

---

## PHASE 1: FIX PLAN IMPORT → SUPABASE

Based on Phase 0 findings, ensure:

1. **Plan upload page** renders and accepts PPTX/PDF files
2. **AI plan interpretation** calls the Anthropic API (via AIService or API route) and returns structured components
3. **Rule set creation** writes to the `rule_sets` Supabase table, NOT localStorage
4. **Rule set assignment** creates entries in `rule_set_assignments` linking entities to the rule set

If the plan interpreter still writes to localStorage:
- Find the save function
- Replace localStorage write with Supabase `.insert()` or `.upsert()`
- Ensure `tenant_id` is included (from tenant context)
- Ensure the JSONB `components` field contains the AI-extracted structure

If there's no API route for AI calls:
- Create `/api/ai/interpret-plan/route.ts` that:
  1. Accepts the plan file (or already-parsed text)
  2. Calls Anthropic API using server-side `ANTHROPIC_API_KEY`
  3. Returns structured components
  4. Does NOT expose the API key to the client

**Test:** Navigate to plan import, upload a plan document, verify:
- AI interpretation runs (check browser network tab for API call)
- Components appear in the review UI
- After confirmation, query Supabase: `SELECT * FROM rule_sets WHERE tenant_id = [current_tenant]` returns the new rule set

**Proof gate:** Rule set exists in Supabase `rule_sets` table after plan import through the UI.

**Commit:** `OB-48 Phase 1: plan import pipeline wired to Supabase`

---

## PHASE 2: FIX DATA IMPORT → SUPABASE

Based on Phase 0 findings, ensure:

1. **Data upload page** renders and accepts XLSX/CSV files
2. **AI sheet classification** calls Anthropic API and returns sheet types
3. **AI field mapping** maps columns to semantic fields
4. **Entity resolution** creates or matches entities in `entities` table
5. **Period detection** creates periods in `periods` table
6. **Data commitment** writes to `committed_data` table

If any of these steps write to localStorage:
- Replace with Supabase writes
- Ensure `tenant_id` is included in every record
- Ensure entity external IDs are resolved against the `entities` table

The critical chain:
```
Upload → Parse XLSX → AI classify sheets → AI map fields →
User confirms → Create entities → Detect period →
Normalize data → Write to committed_data
```

Every step in this chain must write to Supabase, not localStorage.

**Test:** Navigate to data import, upload an Excel file, walk through the stepper:
- Sheet analysis appears with AI classifications
- Field mapping shows auto-mapped fields
- After approval, query Supabase:
  - `SELECT count(*) FROM entities WHERE tenant_id = ?` should show new entities
  - `SELECT count(*) FROM committed_data WHERE tenant_id = ?` should show committed records
  - `SELECT * FROM periods WHERE tenant_id = ?` should show the detected period

**Proof gate:** Committed data, entities, and periods exist in Supabase after data import through the UI.

**Commit:** `OB-48 Phase 2: data import pipeline wired to Supabase`

---

## PHASE 3: FIX CALCULATION TRIGGER → SUPABASE

Based on Phase 0 findings, ensure:

1. **Calculate button** on the Operate page creates a `calculation_batch` in Supabase
2. **Orchestrator** reads from `rule_sets`, `committed_data`, `entities`, `rule_set_assignments`
3. **Engine** executes component calculations (variant routing, metric binding, lookup execution)
4. **Results** written to `calculation_results` with per-component breakdown in JSONB
5. **Batch** updated with `total_payout`, `entity_count`, `lifecycle_state`

If the orchestrator still reads from localStorage:
- Replace every localStorage read with Supabase query
- The orchestrator needs: active rule set + committed data for the period + entity list + assignments
- All of these should come from Supabase tables

**Test:** After plan import (Phase 1) and data import (Phase 2):
- Navigate to Calculate page
- Click "Run Calculation" (or equivalent trigger)
- Verify in Supabase:
  - `SELECT * FROM calculation_batches WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1` returns a batch
  - `SELECT count(*) FROM calculation_results WHERE calculation_batch_id = ?` returns results for all entities
  - `SELECT total_payout FROM calculation_batches WHERE id = ?` shows the aggregate payout

**Proof gate:** Calculation results exist in Supabase after clicking Calculate through the UI.

**Commit:** `OB-48 Phase 3: calculation trigger wired to Supabase`

---

## PHASE 4: CONFIGURABLE LIFECYCLE PIPELINE

**THIS IS THE KEY INNOVATION.** Replace the hardcoded 9-state linear array with a configurable lifecycle pipeline. The lifecycle adapts to tenant maturity rather than forcing every period through every step.

### 4A: Lifecycle Pipeline Data Model

Create or update `web/src/lib/lifecycle/lifecycle-pipeline.ts`:

```typescript
// ============================================================
// LIFECYCLE PIPELINE — Configurable, Not Hardcoded
// ============================================================

/**
 * Gate types in the lifecycle pipeline:
 * 
 * REQUIRED — Always present. Cannot be skipped. Compliance-mandatory.
 *   - calculate: Engine produces results
 *   - approve: Separation of duties (SOC/GAAP requirement)
 *   - close: Period immutability (accounting requirement)
 *
 * CONDITIONAL — Platform recommends include/skip based on context.
 *   - preview: Recommended for first N periods or plan changes
 *   - reconcile: Recommended when data structure changes or first period
 *   - validate: Can be merged into approve (approver sees validation inline)
 *
 * EXTERNAL_SIGNAL — State advanced by external system, not user click.
 *   - paid: Payroll system confirms payment processed
 *
 * AUTO — Platform advances automatically based on config.
 *   - post: Results become visible to entities (can be auto after approve)
 *   - publish: Results available for reporting (can be auto after close)
 */

export type GateType = 'required' | 'conditional' | 'external_signal' | 'auto';

export type GateKey = 
  | 'calculate'    // Required: engine produces results
  | 'preview'      // Conditional: admin reviews before making official
  | 'reconcile'    // Conditional: compare against external source
  | 'official'     // Required: freeze results as record of truth
  | 'approve'      // Required: separation of duties sign-off
  | 'post'         // Auto: results visible to entities
  | 'paid'         // External: payroll confirms payment
  | 'close'        // Required: period immutability
  | 'publish';     // Auto: results available for reporting/analytics

export interface GateDefinition {
  key: GateKey;
  type: GateType;
  label: string;                          // Display label (respects locale)
  description: string;                    // What this gate means
  requires_different_user?: boolean;      // Separation of duties (approve = true)
  required_capability?: string;           // Capability needed to execute this gate
  sla_hours?: number;                     // Expected time to complete (for escalation)
  auto_advance_after?: GateKey;           // For auto gates: advance after this gate
  skip_conditions?: SkipCondition[];      // When this gate can be skipped
}

export interface SkipCondition {
  type: 'period_count' | 'plan_unchanged' | 'data_structure_unchanged' | 'variance_below_threshold' | 'manual_override';
  threshold?: number;                     // e.g., period_count > 3
  description: string;                    // Human-readable reason for skip
}

export interface LifecycleConfig {
  tenant_id: string;
  gates: GateDefinition[];                // Ordered list of active gates for this tenant
  created_at: string;
  updated_at: string;
}

export interface PeriodLifecycle {
  tenant_id: string;
  period_id: string;
  current_gate: GateKey;
  gate_history: GateEvent[];              // Immutable audit trail
  skipped_gates: GateKey[];               // Gates that were skipped with reason
  config_snapshot: LifecycleConfig;       // Config at time period was created (immutable)
}

export interface GateEvent {
  gate: GateKey;
  action: 'entered' | 'completed' | 'skipped' | 'rejected' | 'rolled_back';
  performed_by: string;                   // User ID
  performed_at: string;                   // ISO timestamp
  reason?: string;                        // Required for skip, reject, rollback
  metadata?: Record<string, unknown>;     // Gate-specific data (e.g., approval comments)
}
```

### 4B: Default Lifecycle Configurations

Create `web/src/lib/lifecycle/lifecycle-defaults.ts`:

```typescript
import { GateDefinition, LifecycleConfig } from './lifecycle-pipeline';

/**
 * LAUNCH MODE — Full pipeline for new tenants (first 3 periods).
 * Every gate active. Maximum visibility and control.
 */
export const LAUNCH_CONFIG: GateDefinition[] = [
  {
    key: 'calculate',
    type: 'required',
    label: 'Calculate',
    description: 'Engine processes all entities against active rule set',
    required_capability: 'run_calculation',
  },
  {
    key: 'preview',
    type: 'conditional',
    label: 'Preview',
    description: 'Admin reviews calculation results before making official',
    required_capability: 'run_calculation',
    skip_conditions: [
      { type: 'period_count', threshold: 3, description: 'Auto-skip after 3 clean periods' },
    ],
  },
  {
    key: 'reconcile',
    type: 'conditional',
    label: 'Reconcile',
    description: 'Compare results against external benchmark or legacy system',
    required_capability: 'run_calculation',
    skip_conditions: [
      { type: 'data_structure_unchanged', description: 'Skip when data format unchanged from prior period' },
      { type: 'plan_unchanged', description: 'Skip when no plan modifications since last period' },
    ],
  },
  {
    key: 'official',
    type: 'required',
    label: 'Official',
    description: 'Freeze results as the record of truth for this period',
    required_capability: 'run_calculation',
  },
  {
    key: 'approve',
    type: 'required',
    label: 'Approve',
    description: 'Separation of duties sign-off on official results',
    requires_different_user: true,
    required_capability: 'approve_results',
    sla_hours: 48,
  },
  {
    key: 'post',
    type: 'auto',
    label: 'Post',
    description: 'Results become visible to entities (reps, managers)',
    auto_advance_after: 'approve',
  },
  {
    key: 'paid',
    type: 'external_signal',
    label: 'Paid',
    description: 'Payroll system confirms payment has been processed',
    required_capability: 'confirm_payroll',
    sla_hours: 120,
  },
  {
    key: 'close',
    type: 'required',
    label: 'Close',
    description: 'Period locked. No further changes. Accounting immutability.',
    required_capability: 'close_period',
  },
  {
    key: 'publish',
    type: 'auto',
    label: 'Publish',
    description: 'Results available for historical reporting and analytics',
    auto_advance_after: 'close',
  },
];

/**
 * PRODUCTION MODE — Streamlined for mature tenants (period 4+).
 * Preview and Reconcile removed. Post is auto after Approve.
 * Minimum friction, maximum compliance.
 * 
 * Steady-state flow: Calculate → Official → Approve → [Post auto] → Paid → Close → [Publish auto]
 * That's 4 human actions, not 9.
 */
export const PRODUCTION_CONFIG: GateDefinition[] = [
  {
    key: 'calculate',
    type: 'required',
    label: 'Calculate',
    description: 'Engine processes all entities against active rule set',
    required_capability: 'run_calculation',
  },
  {
    key: 'official',
    type: 'required',
    label: 'Official',
    description: 'Freeze results as the record of truth for this period',
    required_capability: 'run_calculation',
  },
  {
    key: 'approve',
    type: 'required',
    label: 'Approve',
    description: 'Separation of duties sign-off on official results',
    requires_different_user: true,
    required_capability: 'approve_results',
    sla_hours: 48,
  },
  {
    key: 'post',
    type: 'auto',
    label: 'Post',
    description: 'Results become visible to entities',
    auto_advance_after: 'approve',
  },
  {
    key: 'paid',
    type: 'external_signal',
    label: 'Paid',
    description: 'Payroll system confirms payment has been processed',
    required_capability: 'confirm_payroll',
    sla_hours: 120,
  },
  {
    key: 'close',
    type: 'required',
    label: 'Close',
    description: 'Period locked. Accounting immutability.',
    required_capability: 'close_period',
  },
  {
    key: 'publish',
    type: 'auto',
    label: 'Publish',
    description: 'Results available for historical reporting',
    auto_advance_after: 'close',
  },
];

/**
 * Determine which config a tenant should use.
 * AI can recommend switching from LAUNCH to PRODUCTION after N clean periods.
 */
export function getRecommendedConfig(
  completedPeriodCount: number,
  hasRecentPlanChange: boolean,
  hasRecentDataStructureChange: boolean,
): { config: GateDefinition[]; mode: 'launch' | 'production'; reason: string } {
  if (completedPeriodCount < 3) {
    return {
      config: LAUNCH_CONFIG,
      mode: 'launch',
      reason: `${completedPeriodCount} of 3 required launch periods completed`,
    };
  }

  if (hasRecentPlanChange) {
    return {
      config: LAUNCH_CONFIG,
      mode: 'launch',
      reason: 'Plan changed since last period — full validation recommended',
    };
  }

  if (hasRecentDataStructureChange) {
    return {
      config: LAUNCH_CONFIG,
      mode: 'launch',
      reason: 'Data structure changed — reconciliation recommended',
    };
  }

  return {
    config: PRODUCTION_CONFIG,
    mode: 'production',
    reason: `${completedPeriodCount} clean periods completed. Streamlined workflow active.`,
  };
}
```

### 4C: Lifecycle Pipeline Service

Create or replace `web/src/lib/lifecycle/lifecycle-service.ts`:

```typescript
import { createClient } from '@/lib/supabase/client';
import type { GateKey, GateEvent, PeriodLifecycle, GateDefinition, LifecycleConfig } from './lifecycle-pipeline';
import { LAUNCH_CONFIG, getRecommendedConfig } from './lifecycle-defaults';

/**
 * Get the lifecycle for a specific period.
 * If none exists, create one from the tenant's lifecycle config.
 */
export async function getPeriodLifecycle(
  tenantId: string,
  periodId: string,
): Promise<PeriodLifecycle | null> {
  const supabase = createClient();

  // Check for existing period lifecycle in calculation_batches
  const { data: batch } = await supabase
    .from('calculation_batches')
    .select('id, lifecycle_state, metadata')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!batch) return null;

  // Parse lifecycle from batch metadata (or derive from lifecycle_state)
  const lifecycle = batch.metadata?.lifecycle as PeriodLifecycle | undefined;
  if (lifecycle) return lifecycle;

  // Fallback: derive from legacy lifecycle_state field
  return {
    tenant_id: tenantId,
    period_id: periodId,
    current_gate: (batch.lifecycle_state || 'calculate') as GateKey,
    gate_history: [],
    skipped_gates: [],
    config_snapshot: { tenant_id: tenantId, gates: LAUNCH_CONFIG, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  };
}

/**
 * Advance the lifecycle to the next gate.
 * Validates:
 *   - The requested gate is the NEXT gate in the config
 *   - The user has the required capability
 *   - Separation of duties is enforced (different user for approve)
 *   - Auto gates are executed automatically
 */
export async function advanceLifecycle(
  tenantId: string,
  periodId: string,
  batchId: string,
  targetGate: GateKey,
  userId: string,
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; newState: GateKey; autoAdvanced?: GateKey[] }> {
  const supabase = createClient();

  const lifecycle = await getPeriodLifecycle(tenantId, periodId);
  if (!lifecycle) {
    return { success: false, error: 'No lifecycle found for this period', newState: 'calculate' };
  }

  const config = lifecycle.config_snapshot;
  const currentIndex = config.gates.findIndex(g => g.key === lifecycle.current_gate);
  const targetIndex = config.gates.findIndex(g => g.key === targetGate);
  const targetGateDef = config.gates[targetIndex];

  // Validate: target must be the next active gate (skipping any already-skipped gates)
  if (targetIndex <= currentIndex) {
    return { success: false, error: `Cannot go backward to ${targetGate} from ${lifecycle.current_gate}`, newState: lifecycle.current_gate };
  }

  // Validate: separation of duties
  if (targetGateDef?.requires_different_user) {
    const lastEvent = lifecycle.gate_history[lifecycle.gate_history.length - 1];
    if (lastEvent && lastEvent.performed_by === userId) {
      return {
        success: false,
        error: 'Separation of duties: this action requires a different user than the previous step',
        newState: lifecycle.current_gate,
      };
    }
  }

  // Record the gate event
  const event: GateEvent = {
    gate: targetGate,
    action: 'completed',
    performed_by: userId,
    performed_at: new Date().toISOString(),
    metadata,
  };

  const updatedHistory = [...lifecycle.gate_history, event];
  const autoAdvanced: GateKey[] = [];

  // Check for auto-advance gates after this one
  let finalGate = targetGate;
  let nextIndex = targetIndex + 1;
  while (nextIndex < config.gates.length) {
    const nextGateDef = config.gates[nextIndex];
    if (nextGateDef.type === 'auto' && nextGateDef.auto_advance_after === finalGate) {
      // Auto-advance
      updatedHistory.push({
        gate: nextGateDef.key,
        action: 'completed',
        performed_by: 'system',
        performed_at: new Date().toISOString(),
        metadata: { auto_advanced: true },
      });
      autoAdvanced.push(nextGateDef.key);
      finalGate = nextGateDef.key;
      nextIndex++;
    } else {
      break;
    }
  }

  // Update in Supabase
  const updatedLifecycle: PeriodLifecycle = {
    ...lifecycle,
    current_gate: finalGate,
    gate_history: updatedHistory,
  };

  const { error } = await supabase
    .from('calculation_batches')
    .update({
      lifecycle_state: finalGate,
      metadata: { ...(lifecycle as any), lifecycle: updatedLifecycle },
    })
    .eq('id', batchId);

  if (error) {
    return { success: false, error: error.message, newState: lifecycle.current_gate };
  }

  // Record audit trail entry
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'lifecycle_advance',
    entity_type: 'calculation_batch',
    entity_id: batchId,
    performed_by: userId,
    details: { from: lifecycle.current_gate, to: finalGate, auto_advanced: autoAdvanced },
  });

  return { success: true, newState: finalGate, autoAdvanced };
}

/**
 * Skip a conditional gate with reason.
 * Only conditional gates can be skipped.
 */
export async function skipGate(
  tenantId: string,
  periodId: string,
  batchId: string,
  gateToSkip: GateKey,
  userId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const lifecycle = await getPeriodLifecycle(tenantId, periodId);
  if (!lifecycle) return { success: false, error: 'No lifecycle found' };

  const gateDef = lifecycle.config_snapshot.gates.find(g => g.key === gateToSkip);
  if (!gateDef) return { success: false, error: `Gate ${gateToSkip} not found in config` };
  if (gateDef.type !== 'conditional') {
    return { success: false, error: `Gate ${gateToSkip} is ${gateDef.type} and cannot be skipped` };
  }

  const event: GateEvent = {
    gate: gateToSkip,
    action: 'skipped',
    performed_by: userId,
    performed_at: new Date().toISOString(),
    reason,
  };

  const supabase = createClient();
  const updatedLifecycle: PeriodLifecycle = {
    ...lifecycle,
    gate_history: [...lifecycle.gate_history, event],
    skipped_gates: [...lifecycle.skipped_gates, gateToSkip],
  };

  const { error } = await supabase
    .from('calculation_batches')
    .update({
      metadata: { lifecycle: updatedLifecycle },
    })
    .eq('id', batchId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Get the next action for the current lifecycle state.
 * Returns the next gate that needs attention (skipping already-skipped gates).
 * Used by THE QUEUE and thermostat guidance.
 */
export function getNextAction(lifecycle: PeriodLifecycle): {
  gate: GateDefinition;
  action: string;
  isSkippable: boolean;
} | null {
  const config = lifecycle.config_snapshot;
  const currentIndex = config.gates.findIndex(g => g.key === lifecycle.current_gate);

  for (let i = currentIndex + 1; i < config.gates.length; i++) {
    const gate = config.gates[i];
    // Skip auto gates (they fire automatically) and already-skipped gates
    if (gate.type === 'auto') continue;
    if (lifecycle.skipped_gates.includes(gate.key)) continue;

    return {
      gate,
      action: gate.type === 'external_signal'
        ? `Awaiting: ${gate.label}`
        : `Action: ${gate.label}`,
      isSkippable: gate.type === 'conditional',
    };
  }

  return null; // Lifecycle complete
}

/**
 * Get the active gates for display (subway visualization).
 * Returns only gates in the current config, marking completed, current, skipped, and pending.
 */
export function getGateDisplayStates(lifecycle: PeriodLifecycle): {
  key: GateKey;
  label: string;
  status: 'completed' | 'current' | 'skipped' | 'pending';
  type: GateType;
}[] {
  const config = lifecycle.config_snapshot;
  const currentIndex = config.gates.findIndex(g => g.key === lifecycle.current_gate);
  const completedGates = lifecycle.gate_history
    .filter(e => e.action === 'completed')
    .map(e => e.gate);

  return config.gates.map((gate, index) => ({
    key: gate.key,
    label: gate.label,
    type: gate.type,
    status: lifecycle.skipped_gates.includes(gate.key)
      ? 'skipped'
      : completedGates.includes(gate.key)
      ? 'completed'
      : index === currentIndex
      ? 'current'
      : 'pending',
  }));
}
```

### 4D: Wire Lifecycle to UI

Find the existing lifecycle stepper / subway component and replace its data source:

1. **LifecycleStepper** — Instead of reading from a hardcoded `LIFECYCLE_STATES` array, call `getGateDisplayStates()` which returns only the gates active for this tenant's config
2. **Action buttons** — Instead of hardcoded "Run Preview" / "Run Official" / "Submit for Approval", derive buttons from `getNextAction()`. Only show the NEXT valid action.
3. **Skip button** — For conditional gates (preview, reconcile), show a "Skip" option with required reason field
4. **Separation of duties** — Approve button checks `requires_different_user` and compares against the user who submitted for approval
5. **Auto gates** — Post and Publish should never have manual buttons. They fire automatically when their `auto_advance_after` gate completes.

### 4E: Thermostat Guidance Integration

The lifecycle service informs thermostat guidance. After each gate completes, the guidance panel shows:

- **What just happened:** "Official results frozen. 22 entities, MX$20,662 total."
- **What's next:** derived from `getNextAction()` — "Submit for approval. Requires a different user."
- **Recommendations:** If this is period 4+, show "This is your 4th clean period. Consider switching to Production Mode for streamlined processing."

### 4F: Close Gate Special Behavior

When the Close gate is reached:
1. **AI-assisted close check** — Platform verifies:
   - All entities have been calculated and are in the batch
   - No open disputes remain for this period
   - Payroll confirmation received (paid gate completed)
   - Variance from prior period within expected range
2. **Immutable snapshot** — On Close, the calculation results for this period become permanent. The `periods` table status changes to 'closed'.
3. **Retroactive handling** — If a late transaction arrives for a closed period, the platform creates an adjustment event in the CURRENT period. The closed period is NOT reopened.

### 4G: Verification

After implementation, verify:

```bash
echo "=== LIFECYCLE PIPELINE FILES ==="
cat web/src/lib/lifecycle/lifecycle-pipeline.ts | head -20
cat web/src/lib/lifecycle/lifecycle-defaults.ts | head -20
cat web/src/lib/lifecycle/lifecycle-service.ts | head -20

echo ""
echo "=== NO HARDCODED STATE ARRAYS ==="
# Should NOT find fixed arrays like ['draft','preview','reconcile','official',...]
grep -rn "LIFECYCLE_STATES.*=.*\[" web/src/lib/ --include="*.ts" | head -5

echo ""
echo "=== SEPARATION OF DUTIES ==="
grep -rn "requires_different_user\|different.*user" web/src/lib/lifecycle/ --include="*.ts" | head -5
```

**Proof gates:**
- `lifecycle-pipeline.ts` exports type definitions for GateType, GateKey, GateDefinition, LifecycleConfig, PeriodLifecycle, GateEvent
- `lifecycle-defaults.ts` exports LAUNCH_CONFIG (9 gates) and PRODUCTION_CONFIG (7 gates, no preview/reconcile)
- `lifecycle-service.ts` exports `advanceLifecycle()`, `skipGate()`, `getNextAction()`, `getGateDisplayStates()`
- Zero hardcoded state arrays in lifecycle code
- Approve gate has `requires_different_user: true`
- Post gate has `auto_advance_after: 'approve'`
- Conditional gates (preview, reconcile) have `skip_conditions`

**Commit:** `OB-48 Phase 4: configurable lifecycle pipeline (replaces hardcoded 9-state subway)`

---

## PHASE 5: ELIMINATE ALL localStorage BUSINESS DATA

Using the list from Phase 0, fix EVERY localStorage reference in business logic:

For each localStorage reference found in import/calculation/plan/data-layer code:
1. Identify what data it's reading/writing
2. Replace with the equivalent Supabase query
3. If the Supabase table doesn't have the right column, document what's missing

Acceptable localStorage uses (DO NOT CHANGE):
- `theme` / `darkMode` / `sidebarCollapsed` — UI preferences
- `locale` / `language` — language selection
- `vialuce-tenant-id` — tenant context (cookie is preferred but localStorage may be backup)

Everything else in `web/src/lib/`, `web/src/app/`, or service files must use Supabase.

**Proof gate:** Zero localStorage references in business logic files (import, calculation, plan, data-layer, orchestrator, engine, lifecycle).

**Commit:** `OB-48 Phase 5: eliminate localStorage from business logic`

---

## PHASE 6: END-TO-END SMOKE TEST

Run through the complete pipeline in sequence, documenting each step:

```
STEP 1: Login as admin@opticaluminar.mx
  → Result: [dashboard loads / error]

STEP 2: Navigate to plan import page
  → Result: [page renders / 404 / error]

STEP 3: Upload plan document
  → Result: [AI interpretation runs / API error / other]
  → Supabase check: rule_sets table has new record? [YES/NO]

STEP 4: Navigate to data import page
  → Result: [page renders / 404 / error]

STEP 5: Upload data package
  → Result: [sheet classification appears / error]

STEP 6: Confirm field mappings
  → Result: [data committed / error]
  → Supabase check: committed_data has records? [YES/NO]
  → Supabase check: entities created? [YES/NO]
  → Supabase check: period created? [YES/NO]

STEP 7: Navigate to Calculate page
  → Result: [page renders with period/rule set selectable / error]

STEP 8: Run calculation
  → Result: [calculation completes / error]
  → Supabase check: calculation_results has records? [YES/NO]
  → Supabase check: calculation_batch has total_payout > 0? [YES/NO]

STEP 9: Advance lifecycle — Calculate → Official
  → Result: [lifecycle advances / error]
  → Is Preview available to skip? [YES/NO — depends on tenant config]

STEP 10: Advance lifecycle — Official → Approve
  → Result: [requires different user / advances / error]

STEP 11: Check dashboard
  → Result: [hero card shows calculation total / still shows old data / error]

STEP 12: Check lifecycle display
  → Result: [subway shows configurable gates, not hardcoded 9 / error]
```

Document HONESTLY. If a step fails, document the error. Do not paper over failures.

**Commit:** `OB-48 Phase 6: end-to-end smoke test documentation`

---

## PHASE 7: VERIFICATION BUILD

```bash
npx tsc --noEmit        # Must exit 0
npm run build            # Must exit 0
npm run dev              # Must start without errors
```

### Proof Gates

| # | Gate | Check |
|---|------|-------|
| PG-0 | Observatory shows fleet cards for both tenants (HF-037 residual fix) | |
| PG-1 | Plan import page renders | |
| PG-2 | Plan upload triggers AI interpretation (API call visible in network tab) | |
| PG-3 | Rule set saved to Supabase rule_sets table | |
| PG-4 | Data import page renders | |
| PG-5 | Data upload triggers AI sheet classification | |
| PG-6 | Field mapping shows auto-mapped fields | |
| PG-7 | Data committed to Supabase committed_data table | |
| PG-8 | Entities created in Supabase entities table | |
| PG-9 | Period detected and created in Supabase periods table | |
| PG-10 | Calculate page renders with period/rule set selectable | |
| PG-11 | Calculation trigger writes results to Supabase | |
| PG-12 | calculation_batch total_payout > 0 | |
| PG-13 | Lifecycle pipeline types exported (GateType, GateKey, GateDefinition, etc.) | |
| PG-14 | LAUNCH_CONFIG has 9 gates including preview and reconcile | |
| PG-15 | PRODUCTION_CONFIG has 7 gates, no preview, no reconcile | |
| PG-16 | advanceLifecycle() enforces separation of duties on approve | |
| PG-17 | skipGate() only allows skipping conditional gates | |
| PG-18 | Post gate auto-advances after approve | |
| PG-19 | getNextAction() returns correct next gate | |
| PG-20 | Zero localStorage in business logic | |
| PG-21 | Dashboard reflects newly calculated results | |
| PG-22 | npx tsc --noEmit exits 0 | |
| PG-23 | npm run build exits 0 | |
| PG-24 | No console errors during full pipeline walkthrough | |

---

## WHAT SUCCESS LOOKS LIKE

After this OB, the demo flow becomes:

1. Login as admin → Enter tenant
2. Navigate to Operate → Import Plan
3. Upload RetailCGMX plan document → AI extracts 7 components → Confirm
4. Navigate to Operate → Import Data
5. Upload RetailCGMX data package → AI classifies 7 sheets, maps 48 fields → Confirm
6. Navigate to Operate → Calculate
7. Click Run → 22 entities calculated → results appear
8. **Lifecycle shows tenant-appropriate gates** — not a fixed 9-stop subway
9. Advance through Calculate → Official → Approve (with separation of duties)
10. Post auto-fires → entities can see their results
11. Dashboard shows MX$20,662 total compensation
12. After 3 clean periods, platform recommends switching to Production Mode

This is the "show, don't tell" moment. The entire value proposition — including adaptive lifecycle — in one walkthrough.

---

## LIFECYCLE DESIGN PRINCIPLES (Reference for CC)

These principles inform WHY the lifecycle is built this way. DO NOT violate them.

1. **Required gates are compliance-mandatory.** Calculate, Official, Approve, and Close cannot be removed by any config. They exist for SOC/GAAP/audit requirements.

2. **Conditional gates adapt to maturity.** Preview and Reconcile are essential for launch but add friction for mature tenants. The platform recommends when they can be safely skipped.

3. **External signals are not user actions.** Paid comes from payroll confirmation. The platform waits for the signal rather than forcing a manual click.

4. **Auto gates reduce clicks.** Post and Publish fire automatically after their trigger gate. No human action needed.

5. **Separation of duties is enforced, not suggested.** The approve gate MUST be completed by a different user than the one who ran the calculation. This is not optional.

6. **The config snapshot is immutable per period.** When a period is created, the tenant's current lifecycle config is snapshotted. Changing the config mid-period does NOT affect in-flight periods.

7. **Close creates an immutable snapshot.** After Close, the period's results are permanent. Late transactions create adjustments in the CURRENT period, not by reopening the closed period.

8. **The lifecycle is domain-agnostic.** The gate definitions work for ICM, FRMX, telecom, or any domain. The gates describe process control, not compensation concepts. Korean Test: would these gate labels make sense in Hangul for a restaurant franchise? YES — Calculate, Official, Approve, Close are universal.

---

## COMMIT SEQUENCE

```
Phase 0-PRE: git commit -m "OB-48 Phase 0-PRE: fix Observatory tenant query (HF-037 residual)"
Phase 0: git commit -m "OB-48 Phase 0: import pipeline and lifecycle diagnostic audit"
Phase 1: git commit -m "OB-48 Phase 1: plan import wired to Supabase"
Phase 2: git commit -m "OB-48 Phase 2: data import wired to Supabase"
Phase 3: git commit -m "OB-48 Phase 3: calculation trigger wired to Supabase"
Phase 4: git commit -m "OB-48 Phase 4: configurable lifecycle pipeline"
Phase 5: git commit -m "OB-48 Phase 5: eliminate localStorage from business logic"
Phase 6: git commit -m "OB-48 Phase 6: end-to-end smoke test"
Phase 7: git commit -m "OB-48 Phase 7: verification build and completion report"
Final:   gh pr create --base main --head dev --title "OB-48: Import Pipeline E2E + Configurable Lifecycle Pipeline" --body "Fixes HF-037 residual: Observatory tenant query returning 0 (service role client works for other tables but tenant query fails silently). Verifies and fixes complete import pipeline on Supabase: plan upload → AI interpretation → data upload → AI classification → field mapping → data commitment → entity resolution → period detection → calculation. Replaces hardcoded 9-state lifecycle subway with configurable pipeline: required gates (calculate/official/approve/close) are compliance-mandatory; conditional gates (preview/reconcile) adapt to tenant maturity; external signals (paid) from payroll; auto gates (post/publish) reduce friction. LAUNCH_CONFIG for first 3 periods, PRODUCTION_CONFIG for steady state. Separation of duties enforced on approve. 25 proof gates."
```

---

*ViaLuce.ai — The Way of Light*
*OB-48: The pipeline that proves the platform. The lifecycle that adapts to the customer.*
*"Every period is a conversation between the platform and the process. Launch mode listens carefully. Production mode knows the language."*
