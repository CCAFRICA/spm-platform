# OB-70: CALCULATION TRIGGER + ENTITY VISIBILITY + PLATFORM POLISH

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with all sections (A through F).

Also read: `SCHEMA_REFERENCE.md` — the authoritative column reference for every Supabase query.

---

## ⚠️ CC COMPLIANCE ENFORCEMENT

### THE THREE VIOLATIONS THAT KEEP RECURRING

**VIOLATION 1: Inventing schema instead of checking it.**
RULE: Before writing ANY Supabase query, verify every column name against SCHEMA_REFERENCE.md.

**VIOLATION 2: Creating parallel implementations instead of wiring existing code.**
RULE: Before creating ANY new file, `grep -rn` for existing implementations. Extend, don't duplicate.

**VIOLATION 3: Claiming PASS via code review instead of proving with live tests.**
RULE: Every proof gate marked "browser test" or "SQL query" must include PASTED OUTPUT.

### COMPLIANCE CHECKPOINTS (Mandatory at end of each Mission)

```
COMPLIANCE CHECK — Mission N
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — list tables]
□ Searched for existing implementations before creating new files? [YES/NO — list grep commands]
□ Every state change persists to Supabase? [YES/NO — list write operations]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — list AP#]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**If ANY checkbox is NO without justification, the mission is INCOMPLETE.**

---

## WHY THIS OB EXISTS

**The platform cannot be validated without three capabilities that are currently broken:**

1. **Calculation trigger is dead.** The "Run Preview →" button on the Operate page produces zero network requests. No onClick handler fires. Without this, no calculation_results, no dashboard numbers, no reconciliation, no validation. This is the P0 blocker.

2. **Entities are invisible.** 24,833 entities exist in Supabase, but no page in the platform shows them with their `external_id`. The Personnel page crashes (ReactFlow provider error). Dashboard tables show UUIDs or empty. Without entity visibility, you cannot validate "did Entity #96568046 get the right payout?"

3. **Polish gaps erode trust.** Sidebar missing "Users" link. Dispute pages return empty arrays. Locale inconsistency (Spanish period names, English header). These are quick wins that compound into professional presentation.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
5. **Commit this prompt to git as first action.**
6. **profiles.id ≠ auth.uid(). Use auth_user_id.**
7. **Check SCHEMA_REFERENCE.md before any Supabase query.**
8. **RequireRole uses useAuth() not usePersona().**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase.
29. This prompt file committed to git as first action: `OB-70_SCOPE_DECISION.md`

---

## SCHEMA TRUTH — TABLES INVOLVED IN THIS OB

From SCHEMA_REFERENCE.md (verified 2026-02-20, post OB-69):

**entities**: id, tenant_id, entity_type, status, **external_id**, **display_name**, profile_id (FK → profiles.id, nullable), temporal_attributes, metadata, created_at, updated_at

**calculation_batches**: id, tenant_id, **period_id**, **rule_set_id**, batch_type, **lifecycle_state**, superseded_by, supersedes, entity_count, summary, config, started_at, completed_at, created_by, created_at, updated_at

**calculation_results**: id, tenant_id, **batch_id** (NOT calculation_batch_id), entity_id, rule_set_id, period_id, **total_payout** (numeric, top-level), components, metrics, attainment, metadata, created_at

**entity_period_outcomes**: id, tenant_id, entity_id, period_id, total_payout, rule_set_breakdown, component_breakdown, lowest_lifecycle_state, attainment_summary, metadata, materialized_at

**periods**: id, tenant_id, label, period_type, status, start_date, end_date, **canonical_key**, metadata, created_at, updated_at

**rule_sets**: id, tenant_id, name, description, status, version, effective_from, effective_to, population_config, input_bindings, **components** (jsonb), cadence_config, outcome_config, metadata, created_by, approved_by, created_at, updated_at

**disputes**: id, tenant_id, entity_id, period_id, batch_id, category, status, description, resolution, amount_disputed, amount_resolved, **filed_by**, resolved_by, created_at, updated_at, resolved_at

**profiles**: id, tenant_id, **auth_user_id**, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at

---

## CONTEXT: WHAT EXISTS TODAY

### From OB-69 (just completed, PR #62):
- 36 `.single()` → `.maybeSingle()` fixes — zero 406 errors in production
- Pipeline verified: 119K committed_data with period_id, 24K entities, 7 periods, 1 active rule_set
- Calculation code path verified correct: reads committed_data by period, writes to calculation_results + entity_period_outcomes
- **Zero calculation_results exist** — no calculation has been triggered
- Dashboard reads from entity_period_outcomes (primary) with calculation_results fallback

### From OB-68 (PR #61):
- Dispute API routes: POST/GET/PATCH `/api/disputes` and `/api/disputes/[id]`
- Approval API routes: POST/GET/PATCH `/api/approvals` and `/api/approvals/[id]`
- Async dispute service functions exist: `createDisputeAsync()`, `getDisputesAsync()`, etc.
- Dispute PAGES still call old sync functions that return `[]`

### From OB-67 (PR #60):
- `/configure/users` page exists but NOT in sidebar
- Status badges coded but NOT rendering in production
- `/unauthorized` page renders correctly

### Known data state (RetailCDMX tenant):
- Tenant ID: `9b2bb4e3-6828-4451-b3fb-dc384509494f`
- Entities: 24,833
- Periods: 7 (Jan-Jul 2024, canonical_key format `1_2024` through `7_2024`)
- committed_data: 119,129 (all with period_id)
- rule_set_assignments: 24,833
- calculation_results: **0** (no calculation triggered yet)

---

## PHASE 0: DIAGNOSTIC (MANDATORY — BEFORE ANY CODE)

### 0A: Trace the "Run Preview" button

```bash
echo "============================================"
echo "OB-70 PHASE 0A: RUN PREVIEW BUTTON TRACE"
echo "============================================"

echo ""
echo "=== Find the Operate page ==="
find web/src/app -path "*operate*" -name "page.tsx" | grep -v "\[" | head -5

echo ""
echo "=== Find the Run Preview button ==="
OPERATE_PAGE=$(find web/src/app -path "*operate*" -name "page.tsx" | grep -v "\[" | head -1)
echo "File: $OPERATE_PAGE"
grep -n "Run Preview\|runPreview\|Run Calculation\|handleRun\|handlePreview\|onClick.*preview\|onClick.*calc" "$OPERATE_PAGE"

echo ""
echo "=== What does the onClick handler do? ==="
grep -n "const handleRun\|const runPreview\|const handlePreview\|const triggerCalc\|async function run\|async function handle" "$OPERATE_PAGE" | head -10

echo ""
echo "=== Does it import the calculation API or service? ==="
grep -n "import.*calc\|import.*api\|import.*run\|import.*trigger\|import.*preview" "$OPERATE_PAGE"

echo ""
echo "=== Does it call fetch or any API? ==="
grep -n "fetch\|axios\|api/calculation\|api/calc" "$OPERATE_PAGE"

echo ""
echo "=== Is the button disabled by a condition? ==="
grep -n "disabled\|isDisabled\|canRun\|isReady\|loading" "$OPERATE_PAGE" | head -10

echo ""
echo "=== Full button JSX ==="
grep -B2 -A5 "Run Preview" "$OPERATE_PAGE"
```

### 0B: Trace the Personnel page crash

```bash
echo "============================================"
echo "OB-70 PHASE 0B: PERSONNEL PAGE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Personnel page file ==="
find web/src/app -path "*people*" -o -path "*personnel*" | grep "page.tsx" | head -5

echo ""
echo "=== What it imports ==="
PEOPLE_PAGE=$(find web/src/app -path "*configure*people*" -name "page.tsx" | head -1)
echo "File: $PEOPLE_PAGE"
grep -n "import" "$PEOPLE_PAGE" | head -20

echo ""
echo "=== Does it use ReactFlow or Canvas? ==="
grep -rn "ReactFlow\|ReactFlowProvider\|@xyflow\|useReactFlow\|Canvas\|useCanvas" "$PEOPLE_PAGE"

echo ""
echo "=== Configure layout — what providers? ==="
CONFIGURE_LAYOUT=$(find web/src/app/configure -name "layout.tsx" | head -1)
cat "$CONFIGURE_LAYOUT" 2>/dev/null | head -30

echo ""
echo "=== Does the personnel component import canvas dependencies? ==="
PEOPLE_DIR=$(dirname "$PEOPLE_PAGE")
grep -rn "ReactFlow\|@xyflow\|Canvas\|useNodes\|useEdges" "$PEOPLE_DIR/" --include="*.tsx" --include="*.ts" 2>/dev/null

echo ""
echo "=== Does entities table have data? ==="
# Verify via REST:
# SELECT count(*), entity_type, status FROM entities WHERE tenant_id = '9b2bb4e3-...' GROUP BY entity_type, status
```

### 0C: Audit sidebar navigation

```bash
echo "============================================"
echo "OB-70 PHASE 0C: SIDEBAR NAVIGATION AUDIT"
echo "============================================"

echo ""
echo "=== Find sidebar component ==="
find web/src/components -name "*sidebar*" -o -name "*Sidebar*" | grep "\.tsx$" | head -5

echo ""
echo "=== Where is the nav item list defined? ==="
SIDEBAR=$(find web/src/components -name "*Sidebar*" -o -name "*sidebar*" | grep "\.tsx$" | head -1)
grep -n "users\|Users\|configure/users\|People\|people" "$SIDEBAR"

echo ""
echo "=== Status badge rendering ==="
grep -n "badge\|Badge\|status.*dot\|status.*indicator\|blue.*dot\|preview.*badge" "$SIDEBAR" | head -10

echo ""
echo "=== Full Configure section of nav ==="
grep -B2 -A20 "configure\|Configure" "$SIDEBAR" | head -40
```

### 0D: Audit dispute page wiring

```bash
echo "============================================"
echo "OB-70 PHASE 0D: DISPUTE PAGE WIRING"
echo "============================================"

echo ""
echo "=== Dispute pages ==="
find web/src/app -path "*dispute*" -name "page.tsx" | sort

echo ""
echo "=== Which service functions do they call? ==="
for f in $(find web/src/app -path "*dispute*" -name "page.tsx"); do
  echo "--- $f ---"
  grep -n "getAllDisputes\|getDisputes\|createDispute\|updateDispute\|Async\|async" "$f" | head -5
done

echo ""
echo "=== Async vs sync function calls ==="
grep -rn "getDisputesAsync\|createDisputeAsync\|updateDisputeAsync" web/src/app/ --include="*.tsx" | head -10
grep -rn "getAllDisputes\b\|getDispute\b" web/src/app/ --include="*.tsx" | grep -v "Async" | head -10
```

### 0E: Audit hardcoded field names

```bash
echo "============================================"
echo "OB-70 PHASE 0E: HARDCODING AUDIT"
echo "============================================"

echo ""
echo "=== Spanish field names in logic code ==="
grep -rn "'año'\|'ano'\|'anio'\|'mes'\|'fecha'\|'periodo'" web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== ICM-specific language in components ==="
grep -rn "commission\|Commission\|compensation\|Compensation\|incentive\|Incentive" web/src/app/ web/src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "// \|/\*\|import " | head -20

echo ""
echo "=== FIELD_ID_MAPPINGS or static dictionaries ==="
grep -rn "FIELD_ID_MAPPINGS\|YEAR_FIELDS\|MONTH_FIELDS\|PERIOD_FIELDS" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

### 0F: Document findings

Create `OB-70_DIAGNOSTIC.md` at project root with:
1. **Run Preview button:** What the onClick does (or doesn't), what API it should call
2. **Personnel page:** What causes the crash, what import/provider is broken
3. **Sidebar:** Where nav items are defined, why Users is missing, why badges don't render
4. **Dispute pages:** Which functions they call (sync vs async)
5. **Hardcoding:** List of files with violations, count per severity
6. **Entity data state:** COUNT by entity_type and status

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-0A | OB-70_DIAGNOSTIC.md exists | File check | All 6 sections with grep evidence |
| PG-0B | Run Preview root cause identified | Diagnostic section 1 | Specific file, line, what's missing |
| PG-0C | Personnel crash root cause identified | Diagnostic section 2 | Provider or import that breaks |

**Commit:** `OB-70 Phase 0: Diagnostic — calculation trigger, personnel, sidebar, disputes, hardcoding`

---

## ARCHITECTURE DECISION GATE (MANDATORY — BEFORE MISSION 1)

```
ARCHITECTURE DECISION RECORD — OB-70
=====================================

DECISION 1: Calculation Trigger Wiring

Problem: "Run Preview" button on /operate page has no onClick handler or dead handler.

Option A: Wire button to POST /api/calculation/run with selected period + tenant.
  - API route exists (OB-69 verified). Just need frontend wiring.
  
Option B: Navigate to /operate/calculate page which has its own trigger.
  - May have a working trigger already.
  
CHOSEN: Option ___ because ___

---

DECISION 2: Personnel Page Fix

Problem: /configure/people crashes with ReactFlow provider error.

Option A: Remove ReactFlow/Canvas dependency from Personnel page.
  - Personnel should be a simple entity table, not a canvas.
  
Option B: Wrap Personnel in ReactFlowProvider.
  - Only if Personnel legitimately needs canvas rendering.

CHOSEN: Option ___ because ___

---

DECISION 3: Entity Display in Results

Problem: Dashboard/results tables need to show entity display_name + external_id.

Option A: JOIN entities table in the dashboard query.
  - Adds a JOIN but gives immediate access to names.

Option B: Denormalize entity_name into calculation_results.
  - Faster reads but stale if entity name changes.

CHOSEN: Option ___ because ___
```

### Proof gate

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-ADR | Architecture Decision committed | Git log | 3 decisions with evidence |

**Commit:** `OB-70 Architecture Decision: calculation trigger, personnel fix, entity display`

---

## MISSION 1: WIRE THE CALCULATION TRIGGER (P0 BLOCKER)

This is the highest-priority item. Without this, nothing downstream works.

### 1A: Find the correct API route

```bash
echo "=== Calculation run API route ==="
find web/src/app/api -path "*calculat*" -name "route.ts" | head -5

echo ""
echo "=== What does it expect as input? ==="
CALC_ROUTE=$(find web/src/app/api -path "*calculat*run*" -name "route.ts" | head -1)
echo "File: $CALC_ROUTE"
grep -n "request\|body\|tenantId\|periodId\|ruleSetId\|batch_type\|lifecycle" "$CALC_ROUTE" | head -15
```

### 1B: Wire the Operate page button

The "Run Preview →" button must:
1. Read the currently selected period from page state/context
2. Read the tenant ID from tenant context
3. POST to `/api/calculation/run` with `{ tenantId, periodId }` (or whatever the route expects)
4. Show a loading state while the calculation runs
5. On success: refresh the page data (lifecycle stepper advances to PREVIEW, Calculation Summary populates)
6. On error: show error message

**CRITICAL:** Do NOT create a new API route. The route exists at `/api/calculation/run/route.ts`. Wire to it.

### 1C: Verify the button fires

After wiring, on localhost:
1. Navigate to /operate
2. Select a period (e.g., Feb 2024)
3. Click "Run Preview →"
4. **Network tab must show a POST request to /api/calculation/run**
5. **Response must be 200 (or processing indicator)**
6. **After completion: calculation_batches should have a new row**

### 1D: Verify results exist after calculation

```sql
-- After triggering via the button:
SELECT id, lifecycle_state, entity_count, period_id, started_at, completed_at
FROM calculation_batches 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC LIMIT 5;

SELECT COUNT(*) as results, SUM(total_payout) as total, AVG(total_payout) as avg
FROM calculation_results 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1A | Button onClick wired to API | grep output | fetch('/api/calculation/run') in operate page |
| PG-1B | POST fires on click | Browser Network tab — PASTE | POST to /api/calculation/run with 200 response |
| PG-1C | calculation_batches has new row | SQL output pasted | lifecycle_state = PREVIEW or DRAFT |
| PG-1D | calculation_results populated | SQL output pasted | COUNT > 0, SUM > 0 |
| PG-1E | Lifecycle stepper advances | Browser — PASTE what stepper shows | Not on "Draft" anymore |

```
COMPLIANCE CHECK — Mission 1
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — calculation_batches, calculation_results]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — batch + results written]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-17 (no parallel calc trigger)]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-70 Mission 1: Wire calculation trigger — Run Preview fires POST to /api/calculation/run`

---

## MISSION 2: FIX PERSONNEL PAGE + ENTITY ROSTER

### 2A: Fix the crash

Based on Phase 0 diagnostic, remove the ReactFlow/Canvas dependency from the Personnel page, OR add the missing provider. The Personnel page should render a simple entity table, not require canvas infrastructure.

### 2B: Wire entity roster to Supabase

The Personnel page must query the `entities` table and display:

| Column | Source | Notes |
|--------|--------|-------|
| External ID | entities.external_id | The employee number from source data |
| Name | entities.display_name | Human-readable name |
| Type | entities.entity_type | individual, location, team, etc. |
| Status | entities.status | proposed, active, suspended, terminated |
| Created | entities.created_at | When imported |

**Query:**
```typescript
const { data, count } = await supabase
  .from('entities')
  .select('id, external_id, display_name, entity_type, status, created_at', { count: 'exact' })
  .eq('tenant_id', tenantId)
  .order('display_name', { ascending: true })
  .range(page * pageSize, (page + 1) * pageSize - 1);
```

**Features:**
- Search by display_name or external_id (client-side filter or `.ilike()`)
- Sort by any column
- Paginated (25 per page, server-side with `.range()`)
- Shows total count in header ("24,833 entities")

### 2C: Verify on localhost

Navigate to /configure/people. The page must:
1. Not crash
2. Show entity data from Supabase
3. Show external_id prominently (this is the cross-reference key)
4. Show entity count

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-2A | Personnel page loads without crash | Browser — PASTE | No error screen |
| PG-2B | Entity roster shows real data | Browser — PASTE | external_id, display_name, entity_type visible |
| PG-2C | Entity count shown | Browser | "24,833 entities" or similar count |
| PG-2D | Search works | Browser test | Type an entity name, results filter |
| PG-2E | Zero ReactFlow errors in console | DevTools Console | Clean |

```
COMPLIANCE CHECK — Mission 2
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — entities table]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — reads only]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-11 (no shell pages)]
□ Scale test: would this work for 150K entities? [YES/NO — paginated query]
```

**Commit:** `OB-70 Mission 2: Fix personnel page + entity roster from Supabase with search and pagination`

---

## MISSION 3: ENTITY NAMES IN RESULTS AND DASHBOARD

### 3A: Find where results are displayed

```bash
echo "=== Dashboard components that show entity data ==="
grep -rn "entity_id\|entityId\|entity_name\|entityName" web/src/app/operate/ web/src/app/perform/ --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== persona-queries entity resolution ==="
grep -rn "entities\|entity_id\|display_name\|external_id" web/src/lib/data/persona-queries.ts | head -15

echo ""
echo "=== Calculation results display ==="
find web/src/app -path "*calculat*" -name "page.tsx" | head -5
```

### 3B: Add entity name resolution to results queries

Wherever calculation_results or entity_period_outcomes are queried for display, JOIN to entities to get `display_name` and `external_id`:

```typescript
// Instead of showing entity_id UUID:
const { data } = await supabase
  .from('calculation_results')
  .select(`
    id, entity_id, total_payout, components,
    entities!inner(display_name, external_id, entity_type)
  `)
  .eq('batch_id', batchId)
  .order('total_payout', { ascending: false });
```

Display format: **"Maria Rodriguez (96568046)"** — display_name + external_id in parentheses.

### 3C: Verify on localhost

After a calculation has run (Mission 1), navigate to any results view. Entity names and external IDs must be visible.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-3A | Results query JOINs entities | grep output | `entities!inner` or equivalent JOIN |
| PG-3B | Display shows name + external_id | Browser — PASTE | "Name (ID)" format visible |
| PG-3C | Dashboard shows entity-level breakdown | Browser | Individual rows with names, not just totals |

```
COMPLIANCE CHECK — Mission 3
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — calculation_results, entities]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — reads only]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-13 (correct column names in JOIN)]
□ Scale test: would this work for 150K entities? [YES/NO — paginated, not SELECT *]
```

**Commit:** `OB-70 Mission 3: Entity names in calculation results — display_name + external_id`

---

## MISSION 4: SIDEBAR + DISPUTE PAGES + LOCALE FIX

### 4A: Add Users to sidebar navigation

Find the sidebar nav definition and add `/configure/users` under the Configure section, between People and Organization (or at an appropriate position).

### 4B: Fix sidebar status badges

From Phase 0 diagnostic, determine why badges aren't rendering. Likely causes:
- Badge component exists but CSS class doesn't render in production (Tailwind purge)
- Badge data isn't being passed to the sidebar component
- Badge rendering is conditional on something that evaluates false in production

### 4C: Wire dispute pages to async functions

Find all dispute pages that call sync functions (`getAllDisputes()`, `getDispute()`) and replace with the async Supabase-backed versions (`getDisputesAsync()`, `getDisputeAsync()`).

OB-68 created these async functions. The pages just need to call them instead of the sync no-ops.

### 4D: Fix locale inconsistency

The period header badge shows English ("July 2024") while the period selector bar shows Spanish ("Ene", "Dic"). Both should use the tenant's locale setting consistently.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4A | /configure/users appears in sidebar | Browser — PASTE | Link visible under Configure |
| PG-4B | Status badges render | Browser — PASTE | Colored dots visible next to nav items |
| PG-4C | Dispute list page shows real data (or clean empty) | Browser | Not returning [] silently |
| PG-4D | Period names consistent locale | Browser | Both header and bar use same language |

```
COMPLIANCE CHECK — Mission 4
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — disputes read from Supabase via async]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-17 (single dispute code path)]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-70 Mission 4: Sidebar users link, status badges, dispute wiring, locale fix`

---

## MISSION 5: HARDCODING CLEANUP (CRITICAL + HIGH)

### 5A: Remove Spanish field names from logic code

From Phase 0 findings, every instance of hardcoded Spanish field names in `data-service.ts` or any lib file used in logic paths must be replaced with AI-driven field resolution.

**Pattern:**
```typescript
// WRONG — hardcoded Spanish
const year = record['año'] || record['Año'];
const month = record['mes'] || record['Mes'];

// RIGHT — use AI field mappings from import context
const yearField = fieldMappings.find(m => m.targetField === 'year')?.sourceField;
const monthField = fieldMappings.find(m => m.targetField === 'month')?.sourceField;
const year = yearField ? record[yearField] : null;
const month = monthField ? record[monthField] : null;
```

If the code path doesn't have access to field mappings, add a parameter or read from the import batch metadata.

**Do NOT replace Spanish with English hardcoding.** That's the same violation in a different language. The fix must be AI-driven or configuration-driven.

### 5B: Remove ICM-specific language from visible UI

Find components that say "Commission", "Compensation", "Incentive" in user-visible text and replace with domain-agnostic labels:
- "Commission Plan" → "Plan" or "Rule Set"
- "Compensation" → "Outcomes" or "Results"
- "Incentive" → "Component" or use the actual component name from the plan

**Exception:** If the tenant's own plan uses these words (e.g., "Optical Sales Incentive"), those are DATA — not hardcoding. Only fix labels that the PLATFORM defines, not labels that come from tenant data.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5A | Zero Spanish field names in logic code | grep output | 0 matches for 'año', 'mes', 'fecha', 'periodo' in lib/ |
| PG-5B | ICM-specific labels replaced in UI components | grep output | Reduced count vs Phase 0 baseline |
| PG-5C | Korean Test: no hardcoded field names in new code | Code review | All field access via mappings or config |

```
COMPLIANCE CHECK — Mission 5
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — N/A, label changes]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-5, AP-6, AP-7]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-70 Mission 5: Hardcoding cleanup — zero Spanish field names, domain-agnostic labels`

---

## MISSION 6: EMPTY STATES + INTEGRATION CLT

### 6A: Empty state pattern on key pages

For these pages, ensure the loading → empty → populated pattern works:
1. **Personnel** (/configure/people) — "No entities found" if empty
2. **Dashboard** (/operate) — "No calculation results" (already working per OB-69)
3. **Disputes** (/transactions/disputes) — "No disputes filed" if empty
4. **Approvals** (/govern/calculation-approvals) — "No pending approvals" (already working)
5. **Calculation Results** (wherever results table renders) — "Run a calculation first"

Each empty state should have:
- An icon or illustration
- A clear message explaining why it's empty
- A CTA pointing to the next action (e.g., "Import data to get started")

### 6B: Integration CLT on localhost

Walk through these pages and verify clean rendering:

```
CLT CHECKLIST — OB-70
======================
1. /operate — Run Preview button fires, lifecycle stepper correct
2. /operate (after calc) — Calculation Summary shows real numbers
3. /configure/people — Entity roster with external_id, search, count
4. /configure/users — User table renders, accessible from sidebar
5. /govern/calculation-approvals — Empty or populated state clean
6. /transactions/disputes — Empty or populated state clean
7. Console — Zero errors on all 6 pages
8. Sidebar — Users link visible, status badges present
9. Locale — Period names consistent across header and bar
```

### 6C: Build clean

```bash
cd web && rm -rf .next && npx tsc --noEmit && npm run build && npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6A | 5 key pages have empty state handling | Code review + browser | All 5 pages show clean empty state |
| PG-6B | CLT checklist — all 9 items pass | Browser verification | Each item documented with PASS/FAIL |
| PG-6C | Build clean | npm run build | Exit 0, zero errors |
| PG-6D | Zero console errors on 6 key pages | DevTools Console | Clean on all |
| PG-6E | Dev server responds | curl localhost:3000 | 200 or 307 |

```
COMPLIANCE CHECK — Mission 6
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — all data from DB]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-9, AP-10 (live verification)]
□ Scale test: would this work for 150K entities? [YES/NO]
```

**Commit:** `OB-70 Mission 6: Empty states on key pages + integration CLT`

---

## PHASE FINAL: COMPLETION REPORT + PR

### Completion report

Create `OB-70_COMPLETION_REPORT.md` at PROJECT ROOT **BEFORE final build** with:

1. **Diagnostic Summary** — Run Preview root cause, Personnel crash cause, hardcoding count
2. **Architecture Decisions** — 3 decisions with evidence
3. **Mission 1: Calculation Trigger** — Button wired, POST fires, results in DB
4. **Mission 2: Personnel + Entity Roster** — Crash fixed, entity table with external_id
5. **Mission 3: Entity Names in Results** — JOIN to entities, display_name + external_id shown
6. **Mission 4: Sidebar + Disputes + Locale** — Users link, badges, async dispute functions, locale fix
7. **Mission 5: Hardcoding** — Spanish field names removed, ICM labels replaced
8. **Mission 6: Empty States + CLT** — All 9 CLT items, all 5 empty states
9. **COMPLIANCE CHECKS** — All 6 mission compliance blocks (pasted, not summarized)
10. **ALL PROOF GATES** — 29 total, evidence for every gate
11. **STANDING RULE COMPLIANCE**
12. **KNOWN ISSUES**

### Section F Quick Checklist

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
```

### Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-70: Calculation Trigger + Entity Visibility + Platform Polish" \
  --body "## What This OB Delivers

### Mission 1: Calculation Trigger (P0)
- 'Run Preview' button wired to POST /api/calculation/run
- Calculation runs, produces results, lifecycle advances
- Dashboard shows real numbers

### Mission 2: Entity Roster
- Personnel page crash fixed
- Entity table: external_id, display_name, type, status
- Search, sort, pagination (24K+ entities)

### Mission 3: Entity Names in Results
- calculation_results JOINs entities
- Display format: 'Name (External ID)'

### Mission 4: Sidebar + Disputes + Locale
- /configure/users in sidebar navigation
- Status badges rendering
- Dispute pages use async Supabase functions
- Period locale consistent

### Mission 5: Hardcoding Cleanup
- Zero Spanish field names in logic code
- ICM-specific labels → domain-agnostic

### Mission 6: Empty States + CLT
- 5 key pages with empty state handling
- 9-point CLT checklist all pass

## Proof Gates: 29 — see OB-70_COMPLETION_REPORT.md
## Compliance Checks: 6 mission-level blocks in report"
```

**Commit:** `OB-70 Final: Build verification, completion report, PR`

---

## MAXIMUM SCOPE

This OB has **6 missions + Phase 0 + Architecture Decision + Phase Final = 8 phases total.**
This produces **29 proof gates** (within the 25-35 limit).

**DO NOT add scope.** Do not build reconciliation improvements. Do not build AI assessment panels. Do not refactor the calculation engine. Do not add new dashboard features beyond entity name resolution. The scope is:

1. Calculation trigger works ✓
2. Personnel page shows real entity data ✓
3. Results show entity names + external_id ✓
4. Sidebar complete, disputes wired, locale consistent ✓
5. Hardcoding cleaned ✓
6. Empty states on key pages ✓

That's it. OB-71 handles AI intelligence. OB-72 handles proof layers. Stay focused.

---

## ANTI-PATTERNS TO WATCH

- **AP-5**: No hardcoded field names — even in "temporary" fallbacks
- **AP-6**: No language-specific strings in logic paths
- **AP-11**: No shell pages (entity table must show REAL data)
- **AP-13**: Every column from SCHEMA_REFERENCE.md
- **AP-17**: Single code path (don't create parallel calculation triggers)

---

*OB-70 — February 20, 2026*
*"If the button doesn't fire, the platform doesn't compute. If entities have no names, results have no meaning."*
