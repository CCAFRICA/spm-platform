# OB-55: E2E PIPELINE PROOF — PIPELINE, LIFECYCLE, RECONCILIATION, AND SURFACE REBUILD

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

Two compounding failures make this the most critical OB in ViaLuce's history:

**Failure 1 — Pipeline never tested end-to-end.** Every calculation has used seeded data. Nobody has ever uploaded a PPTX plan through the UI, uploaded an XLSX data file, calculated against it, and seen results. The pipeline is theoretical.

**Failure 2 — UI surfaces don't render what was built.** CLT-54 browser verification (Feb 18, 2026) confirmed that despite OB-52/53/54 code being merged and deployed, production renders OLD components. The admin dashboard still shows the pre-OB-53 layout. The Canvas route shows a placeholder. Navigation is not consolidated. Language enforcement doesn't work. Pages make 300-580 Supabase requests taking 38-60 seconds to load. Prior OBs created components that were never wired to page routes.

**This OB abandons all prior UI components and rebuilds every surface the E2E journey touches FROM SCRATCH.** When the pipeline writes data, the surface that displays that data is rebuilt in the same phase. No inheritance from prior OBs. No assumption that existing components work.

**Four missions:**
- **MISSION A (Phases 0-6):** E2E pipeline — plan import → data import → calculate → results on dashboard. Each phase INCLUDES rebuilding the UI surface for that stage.
- **MISSION B (Phases 7-10):** Lifecycle completion — full state machine, approval workflow, post results. Action bar and subway rebuilt from scratch.
- **MISSION C (Phases 11-12):** Reconciliation — upload benchmark, adaptive depth comparison, false green detection. Reconciliation page rebuilt.
- **MISSION D (Phase 0):** Query audit and N+1 elimination — BEFORE any feature work, fix the 300-580 request per page problem.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Commit this prompt to git as first action.
7. Inline styles as primary visual strategy for any property that must not be overridden.
8. VL Admin: all users select preferred language. No forced English override.
9. Rule 25: Completion report is FIRST deliverable, not last. Create before final build, append results.
10. Domain-agnostic always. Labels from entity data, not hardcoded ICM vocabulary.

## CC ANTI-PATTERNS — LEARNED FROM 54 OBs OF FAILURE PATTERNS

| Anti-Pattern | What Happened | Prevention |
|---|---|---|
| **Component graveyard** | OB-53 created components that exist in files but no page.tsx imports them. Production renders old components. | Every new component MUST be imported and rendered in the page.tsx for its route. Proof gate = screenshot of rendered output, NOT "component file exists." |
| **Placeholder pages** | Canvas route renders "Pagina en Desarrollo" despite OB-52 claiming PG-29 through PG-34 PASS. | ZERO placeholder pages. If a route exists in navigation, its page.tsx must render real content or the nav item is removed. |
| **N+1 query explosion** | Admin dashboard makes 387 requests (38s). Canvas placeholder makes 293 requests (1.1 min). Every context provider fires independent queries on mount, many duplicated. | Each page makes ≤15 Supabase requests. Use a single server-side data fetch function per page that returns all needed data in one round trip. Ban individual component-level fetches. |
| **Self-verified proof gates** | CC reports 37/37 PASS but browser shows none of it. Proof was "code exists" not "page renders." | Proof gates in this prompt require PASTED BROWSER OUTPUT — `document.querySelector()` results, console logs from the running page, or curl responses. Not file existence checks. |
| **Language leak** | English selected in UI but labels render in Spanish. Language context exists but components read from tenant locale instead of user preference. | ALL user-facing text reads from user's language preference (profile or selection), NOT from tenant.settings.locale. Tenant locale is for currency/date formatting only. |
| **Placeholder calculations** | Engine must execute real tier lookups, variant routing, metric binding. Not mock payouts. |
| **Hardcoded tenant/plan IDs** | All IDs resolved from authenticated context + Supabase queries. |
| **localStorage in business logic** | Zero. Every read/write through Supabase. |
| **Silent failures** | Every error shown to user with toast/alert. Console breadcrumbs at every pipeline stage. |
| **Breaking existing seeded tenants** | OL and VD must continue to work after this OB. |

## THE N+1 QUERY RULE (NEW — ENFORCED IN EVERY PHASE)

**Every page.tsx loads data through a SINGLE server-side function that batches all queries.** No component-level Supabase calls on mount. No useEffect chains that each fire a query.

Pattern:
```typescript
// CORRECT — one function, all data, one round trip
async function loadDashboardData(tenantId: string, periodKey: string) {
  const [entities, batch, outcomes, period] = await Promise.all([
    supabase.from('entities').select('*').eq('tenant_id', tenantId),
    supabase.from('calculation_batches').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1),
    supabase.from('entity_period_outcomes').select('*').eq('tenant_id', tenantId).eq('period_key', periodKey),
    supabase.from('periods').select('*').eq('tenant_id', tenantId).eq('period_key', periodKey).single(),
  ]);
  return { entities: entities.data, batch: batch.data?.[0], outcomes: outcomes.data, period: period.data };
}
```

```typescript
// WRONG — every component fetches independently
function TotalCard() { const { data } = useQuery('calculation_batches'...); } // fires own query
function DistChart() { const { data } = useQuery('entity_period_outcomes'...); } // fires own query
function Lifecycle() { const { data } = useQuery('calculation_batches'...); } // DUPLICATE query
```

**Proof gate per phase:** `grep -c "supabase.from" web/src/app/[route]/page.tsx` — count must be 0 (data loaded via service function, not inline). Network tab request count for the page must be ≤20.

---

## SUPABASE SCHEMA REFERENCE

EXACT table and column names. Verify against `web/supabase/migrations/` if uncertain.

```
tenants             (id UUID, name, slug, settings JSONB, locale, currency_code)
profiles            (id UUID, tenant_id, display_name, role, entity_id UUID, capabilities TEXT[])
entities            (id UUID, tenant_id, external_id, entity_type, display_name, attributes JSONB, status)
entity_relationships (id UUID, tenant_id, source_entity_id, target_entity_id, relationship_type, confidence, source)
rule_sets           (id UUID, tenant_id, name, domain, components JSONB, status, input_bindings JSONB, population_config JSONB)
rule_set_assignments (id UUID, tenant_id, entity_id, rule_set_id, variant_key, entity_overrides JSONB, effective_start)
periods             (id UUID, tenant_id, period_key TEXT, period_type, label, start_date, end_date, status)
import_batches      (id UUID, tenant_id, file_name, status, classification JSONB)
committed_data      (id UUID, tenant_id, import_batch_id, entity_id UUID, entity_type, period_key, metrics JSONB)
calculation_batches (id UUID, tenant_id, rule_set_id, period_id UUID, lifecycle_state TEXT, entity_count, total_payout)
calculation_results (id UUID, tenant_id, calculation_batch_id UUID, entity_id UUID, period_label, components JSONB, total_payout DECIMAL)
entity_period_outcomes (tenant_id, period_key, entity_id, entity_type, rule_set_outcomes JSONB, total_payout DECIMAL)
usage_metering      (id UUID, tenant_id, event_type, quantity, metadata JSONB)
audit_logs          (id UUID, tenant_id, action, entity_type, entity_id, user_id, metadata JSONB)
```

Key relationships:
- `profiles.entity_id` → `entities.id` (links a login to an operational entity)
- `entity_relationships` defines org structure
- `calculation_results.components` JSONB contains per-component breakdown
- `entity_period_outcomes` is the materialized view dashboards read from

---

# ═══════════════════════════════════════════════════
# MISSION A: E2E PIPELINE PROOF (Phases 0-6)
# ═══════════════════════════════════════════════════

## PHASE 0: DESTROY AND REBUILD — QUERY FIX + ROUTE AUDIT + SURFACE WIRING

**This phase fixes the platform foundation before any feature work.** CLT-54 found 387 requests per page load (38s), placeholder pages in navigation, and components that exist in files but aren't rendered by any route. Fix all of it.

### 0A: N+1 Query Audit

```bash
echo "============================================"
echo "OB-55 PHASE 0A: N+1 QUERY AUDIT"
echo "============================================"

echo ""
echo "=== EVERY useEffect THAT CALLS SUPABASE ==="
grep -rn "useEffect.*supabase\|supabase.*from.*select" web/src/app/ web/src/components/ --include="*.tsx" | wc -l
echo "--- Detail (first 40) ---"
grep -rn "useEffect" web/src/app/ web/src/components/ --include="*.tsx" -A3 | grep -B1 "supabase\|fetch\|query" | head -40

echo ""
echo "=== CONTEXT PROVIDERS THAT FETCH ON MOUNT ==="
grep -rn "useEffect\|useMemo" web/src/contexts/ --include="*.tsx" -A5 | grep -B2 "supabase\|fetch" | head -30

echo ""
echo "=== DUPLICATE QUERY PATTERNS ==="
# Find the same table queried from multiple files
for table in tenants profiles entities calculation_batches rule_sets periods; do
  count=$(grep -rn "from('${table}')" web/src/app/ web/src/components/ web/src/contexts/ --include="*.tsx" --include="*.ts" | wc -l)
  echo "${table}: ${count} query sites"
done
```

### 0B: Create Batched Data Loader Pattern

Create `web/src/lib/data/page-loaders.ts` — ONE file, ALL page-level data loading:

```typescript
import { createClient } from '@/lib/supabase/client';

// Every page calls ONE loader. No component-level fetches.

export async function loadTenantDashboard(tenantId: string, periodKey?: string) {
  const supabase = createClient();
  
  // Resolve current period if not provided
  const periodQuery = periodKey 
    ? supabase.from('periods').select('*').eq('tenant_id', tenantId).eq('period_key', periodKey).single()
    : supabase.from('periods').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('start_date', { ascending: false }).limit(1).single();

  const [period, entities, latestBatch] = await Promise.all([
    periodQuery,
    supabase.from('entities').select('id, external_id, entity_type, display_name, status').eq('tenant_id', tenantId),
    supabase.from('calculation_batches').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1),
  ]);

  // Only fetch outcomes if we have a period
  let outcomes = { data: [] as any[] };
  let results = { data: [] as any[] };
  if (period.data?.period_key) {
    [outcomes, results] = await Promise.all([
      supabase.from('entity_period_outcomes').select('*').eq('tenant_id', tenantId).eq('period_key', period.data.period_key),
      supabase.from('calculation_results').select('entity_id, components, total_payout').eq('tenant_id', tenantId).eq('calculation_batch_id', latestBatch.data?.id || ''),
    ]);
  }

  return {
    period: period.data,
    entities: entities.data || [],
    latestBatch: latestBatch.data,
    outcomes: outcomes.data || [],
    results: results.data || [],
    entityCount: entities.data?.length || 0,
    totalPayout: latestBatch.data?.total_payout || 0,
  };
}

export async function loadOperatePage(tenantId: string) {
  const supabase = createClient();
  const [ruleSet, periods, batches] = await Promise.all([
    supabase.from('rule_sets').select('*').eq('tenant_id', tenantId).eq('status', 'active').order('created_at', { ascending: false }).limit(1),
    supabase.from('periods').select('*').eq('tenant_id', tenantId).order('start_date', { ascending: false }),
    supabase.from('calculation_batches').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5),
  ]);
  return { ruleSet: ruleSet.data?.[0], periods: periods.data || [], batches: batches.data || [] };
}

export async function loadReconciliationPage(tenantId: string, batchId?: string) {
  const supabase = createClient();
  const [batches, ruleSet] = await Promise.all([
    supabase.from('calculation_batches').select('*, periods(label, period_key)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
    supabase.from('rule_sets').select('id, name, components').eq('tenant_id', tenantId).eq('status', 'active').limit(1),
  ]);
  
  let results = { data: [] as any[] };
  if (batchId) {
    results = await supabase.from('calculation_results').select('entity_id, total_payout, components, entities(display_name, external_id)').eq('calculation_batch_id', batchId);
  }
  return { batches: batches.data || [], ruleSet: ruleSet.data?.[0], results: results.data || [] };
}
```

### 0C: Route Wiring Audit

```bash
echo ""
echo "============================================"
echo "OB-55 PHASE 0C: ROUTE → COMPONENT AUDIT"
echo "============================================"

echo ""
echo "=== EVERY page.tsx AND WHAT IT IMPORTS ==="
for f in $(find web/src/app -name "page.tsx" | sort); do
  echo ""
  echo "--- ROUTE: $f ---"
  head -20 "$f" | grep "import\|export default\|function.*Page"
done

echo ""
echo "=== CANVAS PAGE SPECIFICALLY ==="
cat web/src/app/configure/canvas/page.tsx 2>/dev/null || cat web/src/app/*/canvas/page.tsx 2>/dev/null || echo "CANVAS PAGE NOT FOUND"

echo ""
echo "=== DASHBOARD / HOME PAGE ==="
cat web/src/app/page.tsx 2>/dev/null | head -40
cat web/src/app/dashboard/page.tsx 2>/dev/null | head -40

echo ""
echo "=== PLACEHOLDER PAGES (pages that render static "coming soon" text) ==="
grep -rn "Desarrollo\|Coming Soon\|Under Development\|coming.*soon\|placeholder\|en desarrollo" web/src/app/ --include="*.tsx" | head -20

echo ""
echo "=== ORPHANED COMPONENTS (built but not imported by any page) ==="
for comp in AssessmentPanel BudgetContextHero PeriodReadiness OutlierDetection TierProximity MomentumIndex ScenarioCard PaceClockWidget OpportunityMap; do
  files=$(grep -rn "$comp" web/src/app/ --include="*.tsx" | wc -l)
  echo "${comp}: imported by ${files} pages"
done
```

### 0D: Kill Placeholder Pages

For EVERY page.tsx that renders "Pagina en Desarrollo", "Coming Soon", or any placeholder text:
- If the page has a real purpose (like Canvas): replace placeholder with real implementation (done in later phases)
- If the page has no purpose: DELETE the page.tsx and remove the nav item pointing to it

### 0E: Strip Component-Level Supabase Calls

For EVERY component in `web/src/components/` that makes its own `supabase.from()` call:
1. Remove the Supabase call and useEffect
2. Change the component to accept data as props
3. The parent page.tsx passes data from the page loader

This is the critical structural change. Components receive data. Pages load data. Nothing else queries Supabase.

### 0F: Navigation — Simplified

Replace the current sidebar navigation with a clean structure:

**Admin:**
- Home (dashboard)
- Operate (import, calculate, lifecycle)
- Investigate (reconciliation, forensics)
- Configure (teams, people, canvas)
- Observatory (← link back to platform level)

**That's 4 workspace items + 1 back link.** Sub-items expand on click. Single-child sections navigate directly.

### 0G: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-1 | Page loader file exists with batched queries | `cat web/src/lib/data/page-loaders.ts \| head -5` |
| PG-2 | Dashboard page.tsx uses loadTenantDashboard, not inline queries | `grep "supabase.from" web/src/app/[dashboard-route]/page.tsx` returns 0 |
| PG-3 | Zero placeholder pages in navigation | `grep -rn "Desarrollo\|Coming Soon" web/src/app/ --include="*.tsx"` returns 0 |
| PG-4 | Admin nav has ≤5 top-level items | Count from rendered sidebar |
| PG-5 | Dashboard loads in <5s with ≤20 network requests | Network tab measurement |

**Commit:** `OB-55 Phase 0: N+1 query elimination, route wiring audit, placeholder destruction, navigation simplification`

---

## PHASE 1: FIX PLAN IMPORT → RULE SET PIPELINE

After Phase 0, you know exactly where the plan import UI is and how it writes to `rule_sets`. Fix whatever is broken so that:

1. Admin navigates to plan import page
2. Admin uploads a PPTX file (the plan document)
3. File is sent to the AI interpretation API endpoint
4. AI extracts: components (names, calculation types), tier tables (boundaries, rates), variant routing logic, input bindings
5. Admin reviews the AI interpretation (component list, tier tables displayed)
6. Admin confirms the interpretation
7. Confirmed interpretation writes to `rule_sets` in Supabase:
   - `tenant_id` from authenticated context
   - `name` from the file name or AI-extracted plan name
   - `domain` = 'compensation' (or whatever the AI detects)
   - `components` JSONB with the full component structure
   - `input_bindings` JSONB mapping metric names to data fields
   - `status` = 'active'
   - `interpretation_confidence` from AI response
8. A `usage_metering` event is written: `event_type = 'plan_import'`
9. An `ai_inference` metering event is written with token count

**Fix whatever is broken.** Common issues from history:
- Tenant context not available on the import page
- AI API endpoint unreachable or returning unexpected format
- `rule_sets` insert failing silently
- Post-import guidance not rendering

**DO NOT** create a mock or placeholder rule set. The AI must actually interpret the PPTX.

### 1A: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-1 | Plan import page loads without errors | Navigate to page |
| PG-2 | File upload accepts PPTX | Upload a .pptx file |
| PG-3 | AI interpretation API returns component structure | Console shows API response with components array |
| PG-4 | Admin can review and confirm interpretation | UI shows component list, confirm button works |
| PG-5 | `rule_sets` table has new row after confirmation | `SELECT * FROM rule_sets WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1` |
| PG-6 | `usage_metering` has plan_import event | `SELECT * FROM usage_metering WHERE event_type = 'plan_import' ORDER BY created_at DESC LIMIT 1` |

**Commit:** `OB-55 Phase 1: Plan import → rule_sets pipeline verified and fixed`

---

## PHASE 2: FIX DATA IMPORT → COMMITTED DATA + ENTITIES + PERIODS

After Phase 0, you know exactly where the data import UI is. Fix whatever is broken so that:

1. Admin navigates to data import page
2. Admin uploads an XLSX file (the data package)
3. File is parsed client-side (SheetJS)
4. Sheets are sent to AI classification API
5. AI classifies each sheet (roster, transactions, targets, etc.)
6. AI maps fields to semantic concepts (employee_id, sales_amount, attainment_pct, etc.)
7. Admin reviews and confirms field mappings
8. On confirmation, the pipeline:

   **a) Creates import batch:**
   ```sql
   INSERT INTO import_batches (tenant_id, file_name, status, classification)
   VALUES (?, ?, 'committed', ?::jsonb)
   ```

   **b) Resolves entities:**
   For each unique entity identifier in the data:
   - Query `entities` WHERE `tenant_id = ? AND external_id = ?`
   - If found: use existing entity UUID
   - If NOT found: INSERT new entity with `status = 'proposed'`, `entity_type` inferred from data context
   - Track entity resolution: `{external_id} → {entity_uuid}`

   **c) Detects/creates period:**
   - AI or parser detects period from data (column values, sheet names, date ranges)
   - Query `periods` WHERE `tenant_id = ? AND period_key = ?`
   - If found: use existing period
   - If NOT found: INSERT new period with `status = 'open'`

   **d) Writes committed data:**
   For each data row, resolved with entity UUID and period:
   ```sql
   INSERT INTO committed_data (tenant_id, import_batch_id, entity_id, entity_type, period_key, metrics)
   VALUES (?, ?, entity_uuid, ?, ?, ?::jsonb)
   ```
   The `metrics` JSONB contains all mapped field values for this entity-period combination.

   **e) Creates rule set assignments (if not already assigned):**
   For each entity that has committed data, if no assignment exists:
   ```sql
   INSERT INTO rule_set_assignments (tenant_id, entity_id, rule_set_id, effective_start)
   SELECT ?, entity_id, (SELECT id FROM rule_sets WHERE tenant_id = ? AND status = 'active' LIMIT 1), CURRENT_DATE
   WHERE NOT EXISTS (SELECT 1 FROM rule_set_assignments WHERE entity_id = ? AND rule_set_id = ?)
   ```

   **f) Writes metering events:**
   - `event_type = 'data_import'`, `quantity = row_count`
   - `event_type = 'ai_inference'` for classification calls

**CRITICAL REQUIREMENT:** Entity auto-creation is mandatory. If the import does not create entities in the `entities` table, the calculation engine has nothing to calculate. Verify this explicitly.

### 2A: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-7 | Data import page loads without errors | Navigate to page |
| PG-8 | XLSX upload triggers AI sheet classification | Console shows classification response |
| PG-9 | Field mapping UI shows auto-mapped fields | Visual verification |
| PG-10 | After confirmation: `entities` table has new rows | `SELECT count(*) FROM entities WHERE tenant_id = ? AND status = 'proposed'` returns > 0 |
| PG-11 | After confirmation: `periods` table has period row | `SELECT * FROM periods WHERE tenant_id = ?` returns detected period |
| PG-12 | After confirmation: `committed_data` has rows | `SELECT count(*) FROM committed_data WHERE tenant_id = ?` returns > 0 |
| PG-13 | After confirmation: `rule_set_assignments` exist | `SELECT count(*) FROM rule_set_assignments WHERE tenant_id = ?` returns > 0 |
| PG-14 | Metering events written | `SELECT * FROM usage_metering WHERE event_type = 'data_import'` |

**Commit:** `OB-55 Phase 2: Data import → committed_data + entities + periods + assignments`

---

## PHASE 3: FIX CALCULATION TRIGGER → RESULTS

The calculation orchestrator must read ALL inputs from Supabase and write ALL outputs to Supabase.

### 3A: Verify/fix orchestrator input resolution

The orchestrator needs these inputs — ALL from Supabase, ZERO from localStorage:

1. **Active rule set:** `SELECT * FROM rule_sets WHERE tenant_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
2. **Entity list with assignments:** `SELECT e.*, rsa.rule_set_id, rsa.variant_key, rsa.entity_overrides FROM entities e JOIN rule_set_assignments rsa ON e.id = rsa.entity_id WHERE e.tenant_id = ? AND rsa.rule_set_id = ?`
3. **Committed data for period:** `SELECT * FROM committed_data WHERE tenant_id = ? AND period_key = ?`
4. **Period:** `SELECT * FROM periods WHERE tenant_id = ? AND period_key = ?`

### 3B: Verify/fix calculation execution

The engine must:
1. For each entity with an assignment:
   a. Resolve variant (from assignment or entity attributes)
   b. Bind metrics from committed_data.metrics JSONB
   c. Execute tier lookups for each component
   d. Apply component calculations (percentage, flat, matrix, waterfall, etc.)
   e. Sum component payouts into total_payout
2. Track per-component results in JSONB

### 3C: Verify/fix output persistence

After calculation completes:

1. **Create calculation batch:**
   ```sql
   INSERT INTO calculation_batches (tenant_id, rule_set_id, period_id, lifecycle_state, entity_count, total_payout)
   VALUES (?, ?, ?, 'draft', ?, ?)
   ```

2. **Write calculation results (one per entity):**
   ```sql
   INSERT INTO calculation_results (tenant_id, calculation_batch_id, entity_id, period_label, components, total_payout)
   VALUES (?, batch_id, entity_uuid, period_key, ?::jsonb, ?)
   ```

3. **Materialize entity period outcomes:**
   ```sql
   INSERT INTO entity_period_outcomes (tenant_id, period_key, entity_id, entity_type, rule_set_outcomes, total_payout)
   VALUES (?, ?, ?, ?, ?::jsonb, ?)
   ON CONFLICT (tenant_id, period_key, entity_id) DO UPDATE SET ...
   ```

4. **Write metering event:** `event_type = 'calculation_run'`, `quantity = entity_count`

### 3D: REBUILD Admin Dashboard Surface

**DO NOT reuse any existing dashboard component.** Write a new dashboard page from scratch that reads from the `loadTenantDashboard()` function created in Phase 0.

The admin dashboard page.tsx must:
1. Call `loadTenantDashboard(tenantId)` ONCE on mount
2. Pass data as props to child components
3. Render these sections (ALL in English when English is selected):

**Hero Row (3 cards):**
- Total Payout: `MX${totalPayout.toLocaleString()}` with entity count
- Distribution: histogram of entity payouts (use inline SVG or simple div bars)
- Lifecycle State: current state with subway dots showing completed/current/future

**Entity Performance Table:**
- Columns: Entity Name, Payout, vs Budget (%), Components breakdown
- Sorted by payout descending
- Each row shows actual vs budget as a progress bar

**Component Composition:**
- Stacked bar or horizontal breakdown showing payout by component

**ALL labels read from user's language preference, NOT tenant locale.** Currency formatting uses tenant locale. Text uses user language.

**Network request budget: ≤15 requests for the entire dashboard.**

### 3E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-15 | Calculate button exists and is clickable | Navigate to operate/calculate page |
| PG-16 | Orchestrator reads from Supabase (zero localStorage) | `grep -rn "localStorage" web/src/lib/orchestration/ web/src/lib/calculation/` returns 0 |
| PG-17 | `calculation_batches` has new row after clicking Calculate | SQL query |
| PG-18 | `calculation_results` has rows (one per entity) | `SELECT count(*) FROM calculation_results WHERE calculation_batch_id = ?` |
| PG-19 | Results have non-zero total_payout | `SELECT SUM(total_payout) FROM calculation_results WHERE calculation_batch_id = ?` > 0 |
| PG-20 | `entity_period_outcomes` materialized | `SELECT count(*) FROM entity_period_outcomes WHERE tenant_id = ? AND period_key = ?` |
| PG-21 | Admin dashboard shows calculation results | Visual verification — totals match Supabase |
| PG-22 | Metering event for calculation_run | SQL query |

**Commit:** `OB-55 Phase 3: Calculation trigger → Supabase results with materialization`

---

## PHASE 4: VERIFY SEEDED TENANTS UNBROKEN

Before proceeding to Mission B, verify that Óptica Luminar and Velocidad Deportiva still work:

```bash
echo "=== EXISTING TENANT VERIFICATION ==="
echo "--- Optica Luminar ---"
# Query entity count, calculation_batches count, total_payout from latest batch
echo "--- Velocidad Deportiva ---"
# Same queries
echo "--- New tenant from Phases 1-3 ---"
# Same queries — this is the E2E proof
```

### 4A: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-23 | OL tenant: entity count unchanged | SQL query matches pre-OB-55 count |
| PG-24 | VD tenant: entity count unchanged | SQL query matches pre-OB-55 count |
| PG-25 | New tenant: entities + results exist | SQL query from Phases 1-3 |

**Commit:** `OB-55 Phase 4: Existing tenant regression check — OL and VD verified`

---

## PHASE 5: METERING ACCUMULATION PROOF

After Phases 1-3, the usage_metering table should have multiple events. Verify the Observatory Billing tab reflects them:

1. Navigate to Observatory → Billing tab
2. The tab should show:
   - plan_import events (from Phase 1)
   - data_import events (from Phase 2)
   - ai_inference events (from Phases 1 and 2)
   - calculation_run events (from Phase 3)
3. Cost projection should be non-zero (AI inference tokens × rate)

### 5A: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-26 | Observatory Billing shows ≥4 metering event types | Visual verification |
| PG-27 | AI cost projection is non-zero | Visual verification — Anthropic cost > $0.00 |

**Commit:** `OB-55 Phase 5: Metering accumulation proof — Observatory billing reflects pipeline usage`

---

# ═══════════════════════════════════════════════════
# MISSION B: LIFECYCLE COMPLETION (Phases 6-9)
# ═══════════════════════════════════════════════════

## PHASE 6: COMPLETE LIFECYCLE TRANSITION MAP

The lifecycle service (from Phase 0 diagnostic) has an incomplete transition map. Fix it.

### 6A: Define the canonical 9-state lifecycle

Replace the existing transition map with the complete version:

```typescript
export const LIFECYCLE_STATES = [
  'draft', 'preview', 'reconcile', 'official',
  'pending_approval', 'approved', 'posted',
  'closed', 'paid', 'published'
] as const;

export type LifecycleState = typeof LIFECYCLE_STATES[number];

// Additional terminal states
export type SpecialState = 'superseded' | 'rejected';

export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:              ['preview'],
  preview:            ['draft', 'reconcile', 'official'],
  reconcile:          ['preview', 'official'],
  official:           ['preview', 'pending_approval'],
  pending_approval:   ['official', 'approved', 'rejected'],
  rejected:           ['official'],
  approved:           ['official', 'posted'],
  posted:             ['closed'],
  closed:             ['paid'],
  paid:               ['published'],
  published:          [],          // terminal
  superseded:         [],          // terminal
};

// Required capabilities for each transition target
export const TRANSITION_CAPABILITIES: Record<string, string> = {
  preview:            'run_calculation',
  reconcile:          'run_calculation',
  official:           'run_calculation',
  pending_approval:   'run_calculation',     // submitter
  approved:           'approve_results',     // must be DIFFERENT user from submitter
  rejected:           'approve_results',
  posted:             'approve_results',
  closed:             'close_period',
  paid:               'confirm_payroll',
  published:          'close_period',
};
```

### 6B: Implement transition with audit logging

Every transition must:
1. Validate: is the transition allowed from current state?
2. Validate: does the user have the required capability?
3. For `approved`: validate the user is NOT the same user who submitted for approval
4. Execute: update `calculation_batches.lifecycle_state`
5. Log: write to `audit_logs` with from_state, to_state, user_id, timestamp
6. Return: success/failure with clear error message

```typescript
export async function advanceLifecycle(
  supabase: SupabaseClient,
  batchId: string,
  targetState: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Get current batch
  const { data: batch } = await supabase
    .from('calculation_batches')
    .select('id, lifecycle_state, tenant_id, metadata')
    .eq('id', batchId)
    .single();

  if (!batch) return { success: false, error: 'Batch not found' };

  const currentState = batch.lifecycle_state;

  // 2. Check transition validity
  const allowed = VALID_TRANSITIONS[currentState] || [];
  if (!allowed.includes(targetState)) {
    return { success: false, error: `Cannot transition from ${currentState} to ${targetState}. Allowed: ${allowed.join(', ')}` };
  }

  // 3. Separation of duties check for approval
  if (targetState === 'approved') {
    const submitterId = batch.metadata?.submitted_by;
    if (submitterId === userId) {
      return { success: false, error: 'Separation of duties: approver must be different from submitter' };
    }
  }

  // 4. Execute transition
  const updateData: any = { lifecycle_state: targetState };

  // Record who performed each action in metadata
  const metadata = { ...(batch.metadata || {}) };
  if (targetState === 'pending_approval') metadata.submitted_by = userId;
  if (targetState === 'approved') metadata.approved_by = userId;
  if (targetState === 'rejected') metadata.rejected_by = userId;
  if (targetState === 'posted') metadata.posted_by = userId;
  if (targetState === 'paid') metadata.paid_confirmed_by = userId;
  if (targetState === 'closed') metadata.closed_by = userId;
  updateData.metadata = metadata;

  const { error } = await supabase
    .from('calculation_batches')
    .update(updateData)
    .eq('id', batchId);

  if (error) return { success: false, error: error.message };

  // 5. Audit log
  await supabase.from('audit_logs').insert({
    tenant_id: batch.tenant_id,
    action: 'lifecycle_transition',
    entity_type: 'calculation_batch',
    entity_id: batchId,
    user_id: userId,
    metadata: { from: currentState, to: targetState, reason }
  }).catch(() => {}); // Non-blocking

  return { success: true };
}
```

### 6C: Side effects per transition

| Transition Target | Side Effect |
|-------------------|-------------|
| `official` | Mark calculation results as immutable (set flag or no-update policy) |
| `pending_approval` | Store `submitted_by` in batch metadata |
| `approved` | Store `approved_by` in batch metadata. Clear from approval queue. |
| `rejected` | Store `rejected_by` + reason in batch metadata. Lifecycle returns to official. |
| `posted` | Materialize `entity_period_outcomes` if not already done. Results now visible to all roles. |
| `closed` | Update `periods.status = 'closed'` for this period. Immutable snapshot. |
| `paid` | Record payment_date in batch metadata. |
| `published` | Terminal. Full audit trail sealed. |

### 6D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-28 | VALID_TRANSITIONS defines all 10 states + 2 terminal | Paste transition map from code |
| PG-29 | Transition from APPROVED → POSTED is defined | Grep transition map |
| PG-30 | Transition from APPROVED → DRAFT is NOT defined (prohibited) | Grep shows no such transition |
| PG-31 | Separation of duties: same user cannot submit AND approve | Unit test or code inspection |
| PG-32 | Every transition writes audit_log | Query audit_logs after a transition |

**Commit:** `OB-55 Phase 6: Complete lifecycle transition map — 10 states, audit logging, separation of duties`

---

## PHASE 7: LIFECYCLE ACTION BAR UI

The calculation/operate page needs an action bar that shows ONLY the valid actions for the current lifecycle state.

### 7A: Action bar rendering logic

```typescript
function getAvailableActions(lifecycleState: string, userCapabilities: string[], userId: string, batchMetadata: any) {
  const actions = [];

  switch (lifecycleState) {
    case 'draft':
      if (userCapabilities.includes('run_calculation'))
        actions.push({ label: 'Run Preview', target: 'preview', variant: 'primary' });
      break;
    case 'preview':
      if (userCapabilities.includes('run_calculation')) {
        actions.push({ label: 'Re-run Preview', target: 'preview', variant: 'secondary' });
        actions.push({ label: 'Run Official', target: 'official', variant: 'primary' });
      }
      break;
    case 'official':
      if (userCapabilities.includes('run_calculation'))
        actions.push({ label: 'Submit for Approval', target: 'pending_approval', variant: 'primary' });
      break;
    case 'pending_approval':
      if (batchMetadata?.submitted_by === userId) {
        // Submitter sees waiting state
        actions.push({ label: 'Awaiting Approval', target: null, variant: 'disabled' });
      } else if (userCapabilities.includes('approve_results')) {
        actions.push({ label: 'Approve', target: 'approved', variant: 'success' });
        actions.push({ label: 'Reject', target: 'rejected', variant: 'danger', requiresReason: true });
      }
      break;
    case 'approved':
      actions.push({ label: 'Post Results', target: 'posted', variant: 'primary' });
      actions.push({ label: 'Export CSV', target: 'export', variant: 'secondary' });
      break;
    case 'posted':
      actions.push({ label: 'Close Period', target: 'closed', variant: 'primary' });
      actions.push({ label: 'Export CSV', target: 'export', variant: 'secondary' });
      break;
    case 'closed':
      actions.push({ label: 'Confirm Payment', target: 'paid', variant: 'primary' });
      actions.push({ label: 'Export CSV', target: 'export', variant: 'secondary' });
      break;
    case 'paid':
      actions.push({ label: 'Publish', target: 'published', variant: 'primary' });
      break;
    case 'published':
      actions.push({ label: 'Period Complete', target: null, variant: 'disabled' });
      break;
  }

  return actions;
}
```

### 7B: Wire action buttons to lifecycle service

Each button click calls `advanceLifecycle()` and:
1. Shows loading spinner
2. On success: refreshes batch data, updates subway visualization
3. On failure: shows error message as toast (not silent!)

### 7C: Enhance lifecycle subway visualization

The existing subway (from CLT-39) renders but may not reflect all states. Update it:
- Show all 9 states (draft through published)
- Current state: highlighted with pulse/glow
- Completed states: checkmark + timestamp
- Future states: dimmed
- Next valid action: subtle pulse on the next button

### 7D: Export CSV (available from APPROVED onward)

When Export button is clicked:
1. Query `calculation_results` for this batch
2. Join with `entities` for display_name and external_id
3. Generate CSV:
   - Columns: External ID, Entity Name, Period, [one column per component from rule_set.components], Total Payout
   - Currency formatted for tenant locale
   - File name: `{TenantSlug}_{PeriodKey}_Results.csv`
4. Trigger browser download

### 7E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-33 | Action bar renders with correct buttons for DRAFT state | Visual verification |
| PG-34 | Clicking "Run Preview" advances to PREVIEW | Click button → lifecycle state updates |
| PG-35 | Clicking "Run Official" advances to OFFICIAL | Click button → lifecycle state updates |
| PG-36 | Clicking "Submit for Approval" advances to PENDING_APPROVAL | Click button → lifecycle state updates |
| PG-37 | Subway visualization shows all states with current highlighted | Visual verification |
| PG-38 | Export CSV downloads file with correct data | Download file, verify content |

**Commit:** `OB-55 Phase 7: Lifecycle action bar, enhanced subway, CSV export`

---

## PHASE 8: APPROVAL WORKFLOW

### 8A: Approval queue data source

When lifecycle transitions to `pending_approval`:
1. The batch metadata stores `submitted_by`
2. Any user with `approve_results` capability who is NOT the submitter can approve

The action bar (from Phase 7) already handles this: non-submitter with `approve_results` sees Approve/Reject buttons.

### 8B: Approval in Observatory queue

The Observatory or Govern workspace should show pending approvals. Check if a Queue/Approval component exists. If so, wire it to read:

```sql
SELECT cb.*, t.name as tenant_name, p.label as period_label
FROM calculation_batches cb
JOIN tenants t ON cb.tenant_id = t.id
JOIN periods p ON cb.period_id = p.id
WHERE cb.lifecycle_state = 'pending_approval'
```

### 8C: Reject with reason

When "Reject" is clicked:
1. Show a text input for rejection reason (required)
2. On submit: call `advanceLifecycle(batch_id, 'rejected', userId, reason)`
3. Batch returns to `official` state with rejection reason in metadata
4. UI shows the rejection reason: "Rejected by [name]: [reason]. Returned to Official."

### 8D: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-39 | Submitter sees "Awaiting Approval" (no approve button) | Login as submitter, verify |
| PG-40 | Different user with approve_results sees Approve/Reject | Login as different user, verify |
| PG-41 | Approve advances to APPROVED, records approver | Click Approve, verify batch metadata |
| PG-42 | Reject requires reason and returns to OFFICIAL | Click Reject, enter reason, verify |

**Commit:** `OB-55 Phase 8: Approval workflow — separation of duties, approve, reject with reason`

---

## PHASE 9: POST → CLOSE → PAID → PUBLISHED

### 9A: Post (results visible to reps/managers)

When lifecycle reaches `posted`:
1. Materialize `entity_period_outcomes` (if not already done at calculation time)
2. The rep/manager dashboards read from `entity_period_outcomes`
3. Before POSTED: rep dashboard shows "Results are being processed for this period"
4. After POSTED: rep dashboard shows their personal payout and component breakdown

Verify that the dashboard data query respects lifecycle state:
```sql
-- Only show results from batches that are at least 'posted'
SELECT epo.* FROM entity_period_outcomes epo
JOIN calculation_batches cb ON cb.tenant_id = epo.tenant_id AND cb.period_id = (
  SELECT id FROM periods WHERE tenant_id = epo.tenant_id AND period_key = epo.period_key
)
WHERE cb.lifecycle_state IN ('posted', 'closed', 'paid', 'published')
```

OR: simpler approach — `entity_period_outcomes` is only materialized AFTER reaching `posted`. If the row exists in `entity_period_outcomes`, results are visible.

### 9B: Close (period immutable)

When lifecycle reaches `closed`:
1. Update `periods.status = 'closed'` for this period
2. No further modifications to calculation_results for this batch
3. Any late data for a closed period creates an adjustment in the CURRENT period (future OB)

### 9C: Paid (payment confirmation)

When lifecycle reaches `paid`:
1. Record `payment_date` in batch metadata
2. This is an external signal — admin confirms payroll was processed

### 9D: Published (terminal)

When lifecycle reaches `published`:
1. Full audit trail sealed
2. No further transitions
3. Historical reporting can reference this period

### 9E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-43 | Advance from APPROVED → POSTED succeeds | Click "Post Results" → lifecycle state = posted |
| PG-44 | Advance from POSTED → CLOSED succeeds | Click "Close Period" → lifecycle state = closed |
| PG-45 | Advance from CLOSED → PAID succeeds | Click "Confirm Payment" → lifecycle state = paid |
| PG-46 | Advance from PAID → PUBLISHED succeeds | Click "Publish" → lifecycle state = published |
| PG-47 | After POSTED: entity_period_outcomes visible to dashboard | Navigate to admin dashboard → verify totals |
| PG-48 | After CLOSED: periods.status = 'closed' | SQL query |

**Commit:** `OB-55 Phase 9: Post → Close → Paid → Published — full lifecycle path`

---

# ═══════════════════════════════════════════════════
# MISSION C: RECONCILIATION (Phases 10-11)
# ═══════════════════════════════════════════════════

## PHASE 10: RECONCILIATION WITH UI-IMPORTED DATA

After Mission A produces calculation results from UI-imported data, test reconciliation.

### 10A: Navigate to reconciliation page

The reconciliation page should:
1. Show available calculation batches for the current tenant/period
2. Show the "Upload Benchmark" button
3. Accept CSV or XLSX as the benchmark file

### 10B: Upload benchmark and assess comparison depth

When admin uploads a benchmark file:
1. Parse the file (SheetJS for XLSX, Papaparse for CSV)
2. AI assesses comparison depth:
   - Level 1 (Total): Can we match employee IDs and compare total payouts? (Almost always yes)
   - Level 2 (Component): Do file columns map to plan components? (Maybe)
   - Level 3 (Metric): Do file columns contain attainment/metric data? (Maybe)
3. Display assessment to user BEFORE running comparison:
   ```
   Comparison Depth Assessment:
   ✅ Level 1: Employee total payout (30 employees found)
   ✅ Level 2: Component comparison (4 of 6 components mapped, 85% confidence)
   ⚠️ Level 3: Attainment data (2 columns found, 72% confidence)
   
   [Run Reconciliation]
   ```

### 10C: Execute multi-layer comparison

On "Run Reconciliation":
1. **Employee matching:** Normalize IDs (trim, strip leading zeros, case-insensitive). Match VL entities to benchmark rows.
2. **Level 1 comparison:** For each matched employee, compare VL total_payout vs benchmark total. Track: exact (<$0.01), tolerance (<1%), amber (1-5%), red (>5%).
3. **Level 2 comparison (if available):** For each mapped component, compare VL component payout vs benchmark column.
4. **False green detection:** Employees where Level 1 matches but Level 2 has differences > tolerance.
5. **Population tracking:** Matched, VL-only, file-only.

### 10D: Display results

Summary panel:
- Comparison depth achieved
- Match rate (N of M employees matched)
- Aggregate: VL total, benchmark total, delta, delta %
- False green count (HIGHEST PRIORITY)
- Distribution: exact, tolerance, amber, red

Employee table:
- Sortable by delta amount, delta %, flag severity
- Expandable rows showing per-component comparison
- False greens flagged distinctly

### 10E: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-49 | Reconciliation page loads with calculation batches listed | Navigate to reconciliation page |
| PG-50 | Benchmark file upload succeeds (CSV or XLSX) | Upload a file |
| PG-51 | Comparison depth assessment shown before running | Visual verification — shows levels |
| PG-52 | "Run Reconciliation" produces matched employees > 0 | Results show non-zero match count |
| PG-53 | Employee table shows VL total vs benchmark total per employee | Visual verification |
| PG-54 | False green detection runs (even if 0 found, the check exists) | Console or UI confirms false green scan ran |

**Commit:** `OB-55 Phase 10: Reconciliation with UI-imported data — adaptive depth, false green detection`

---

## PHASE 11: VERIFICATION AND PR

### 11A: Build verification

```bash
cd web
echo "=== TypeScript check ==="
npx tsc --noEmit 2>&1 | tail -10
echo "=== Build ==="
npm run build 2>&1 | tail -10
echo "=== localStorage audit ==="
grep -rn "localStorage" src/lib/orchestration/ src/lib/calculation/ src/lib/lifecycle/ --include="*.ts" 2>/dev/null | wc -l
echo "=== Metering event types ==="
# Count distinct event types that exist
echo "Check usage_metering for: plan_import, data_import, ai_inference, calculation_run"
```

### 11B: E2E proof summary

Document the COMPLETE pipeline trace:
```
1. Plan Import:    PPTX uploaded → rule_sets row ID: [uuid]
2. Data Import:    XLSX uploaded → entities: [N], committed_data: [N], period: [key]
3. Calculation:    Triggered → batch ID: [uuid], results: [N], total: $[amount]
4. Lifecycle:      DRAFT → PREVIEW → OFFICIAL → PENDING_APPROVAL → APPROVED → POSTED
5. Reconciliation: Benchmark uploaded → [N] matched, [N] false greens
6. Metering:       [N] events across [M] types
7. Dashboard:      Admin sees $[amount] total for [N] entities
```

### 11C: Proof gates

| # | Gate | Method |
|---|------|--------|
| PG-55 | TypeScript: zero errors | `npx tsc --noEmit` exits 0 |
| PG-56 | Build: clean | `npm run build` exits 0 |
| PG-57 | localhost:3000 responds | curl returns 200 or 307 |
| PG-58 | Zero localStorage in calculation/orchestration/lifecycle | grep count = 0 |

### 11D: Completion report

Create `OB-55_COMPLETION_REPORT.md` at PROJECT ROOT with:

```markdown
# OB-55 COMPLETION REPORT
## E2E Pipeline Proof, Lifecycle Completion, and Reconciliation
## Date: [date]

## MISSION SUMMARY
| Mission | Phases | Status |
|---------|--------|--------|
| A: E2E Pipeline Proof | 0-5 | |
| B: Lifecycle Completion | 6-9 | |
| C: Reconciliation | 10-11 | |

## E2E PIPELINE TRACE
[Paste the complete trace from 11B]

## COMMITS
[All phases with hashes]

## PROOF GATES — HARD (58 gates)
[Every gate with PASS/FAIL and pasted evidence]

## STANDING RULE COMPLIANCE
[Rules 1-10 verified]

## SEEDED TENANT REGRESSION
[OL and VD verification data]

## KNOWN ISSUES
[Any deferred items]
```

### 11E: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-55: E2E Pipeline Proof — Plan Import to Published Lifecycle" \
  --body "## The Most Important OB

This is the first time ViaLuce has processed data uploaded through the 
browser — not seeded via scripts — through the complete pipeline.

### Mission A: E2E Pipeline Proof (Phases 0-5)
- Plan import: PPTX → AI interpretation → rule_sets in Supabase
- Data import: XLSX → AI classification → committed_data + entities + periods
- Entity auto-creation from imported data
- Rule set auto-assignment
- Calculation trigger → results in calculation_results + entity_period_outcomes
- Dashboard shows real results from UI-imported data
- Metering events accumulate across all pipeline stages

### Mission B: Lifecycle Completion (Phases 6-9)
- Complete 10-state transition map (was incomplete — only backward transitions defined)
- Separation of duties: submitter ≠ approver
- Lifecycle action bar: context-aware buttons per state
- Full path: Draft → Preview → Official → Pending Approval → Approved → Posted → Closed → Paid → Published
- CSV export from Approved onward
- Audit logging on every transition

### Mission C: Reconciliation (Phase 10)
- Upload benchmark file
- AI-assessed comparison depth (Level 1-3)
- Multi-layer comparison with employee matching
- False green detection (matching totals, mismatched components)

## Proof Gates: 58 — see OB-55_COMPLETION_REPORT.md"
```

**Commit:** `OB-55 Phase 11: Verification, completion report, PR`

---

## PROOF GATE SUMMARY (63 gates)

| Range | Mission | Phase | Count |
|-------|---------|-------|-------|
| PG 1-5 | D/A | Query Fix + Route Audit | 5 |
| PG 6-11 | A | Plan Import | 6 |
| PG 12-19 | A | Data Import | 8 |
| PG 20-29 | A | Calculation + Dashboard Rebuild | 10 |
| PG 30-32 | A | Regression | 3 |
| PG 33-34 | A | Metering | 2 |
| PG 35-39 | B | Lifecycle Map | 5 |
| PG 40-45 | B | Action Bar + Subway | 6 |
| PG 46-49 | B | Approval | 4 |
| PG 50-55 | B | Post→Publish | 6 |
| PG 56-61 | C | Reconciliation | 6 |
| PG 62-63 | — | Build + Verification | 2 |

**CRITICAL PROOF GATE RULE:** Gates that verify UI rendering MUST use one of:
1. `document.querySelector('[data-testid="..."]')` output pasted from browser console
2. Network tab screenshot showing request count ≤20 for the page
3. `curl -s localhost:3000/[route] | grep "[expected text]"` showing rendered content
4. Console log output from the running page showing data loaded

**"Component file exists" is NOT a valid proof.** The component must be RENDERED and VISIBLE.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-55_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## WHAT IS EXPLICITLY OUT OF SCOPE

| Item | Why | When |
|------|-----|------|
| Rep/manager personal payout views | Requires user-to-entity mapping (profile_id → entity_id) for non-seeded users | OB-56 |
| Configurable lifecycle (Launch vs Production mode) | Needs multi-period maturity data | OB-56 |
| Thermostat guidance panel at each lifecycle gate | UI enhancement after core works | OB-56 |
| Multi-period lifecycle management | Test single period first | OB-56 |
| Dispute submission workflow | Requires posted results first (this OB enables it) | OB-57 |
| Interactive Canvas (OB-54) | Route exists, React Flow may be installed — separate interactivity pass | OB-56 |
| AI Assessment Panels | Requires Anthropic API call per page load — add after pipeline is proven | OB-56 |
| Mobile responsiveness | Desktop-first for pipeline proof | Future |
| Performance optimization beyond N+1 fix | Phase 0 fixes the structural issue; further optimization is separate | Future |

---

*OB-55 — February 18, 2026*
*"A platform where every demo requires seed scripts is a prototype. A platform where you upload your data and see your results is a product."*
*"The most dangerous proof gate is the one CC verifies against its own output. The only proof that matters is what renders in the browser."*
*"387 requests for a dashboard is not a platform — it's a denial of service attack on your own database."*
