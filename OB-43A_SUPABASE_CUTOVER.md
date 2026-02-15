# OB-43A: SUPABASE CUTOVER — KILL LOCALSTORAGE

NEVER ask yes/no. NEVER say "shall I". Just act.

---

## CONTEXT

OB-42 created 23 Supabase tables, 8 service files, and seed data. But it LEFT 93 files still reading localStorage. It created a "dual-mode" pattern where every Supabase service falls back to localStorage. The result: the entire UI still shows localStorage data. Auth works through Supabase. Everything else doesn't.

**This OB kills dual-mode. Every page reads from Supabase or it doesn't render.**

The proof gate for every page is simple: **clear localStorage in the browser, refresh the page, verify it still works.** If it breaks, it's not migrated.

**What exists from OB-42:**
- `src/lib/supabase/entity-service.ts` — Entity CRUD, temporal resolution, graph traversal (20KB)
- `src/lib/supabase/rule-set-service.ts` — Rule set CRUD, 5-layer JSONB (13KB)
- `src/lib/supabase/data-service.ts` — Import, committed data, entity auto-creation (25KB)
- `src/lib/supabase/calculation-service.ts` — Batch lifecycle, Rule 30, results, traces (size TBD)
- `src/lib/supabase/auth-service.ts` — Supabase Auth
- `src/lib/supabase/client.ts` — Client factory with `isSupabaseConfigured()`
- `src/hooks/useCapability.ts` — Capabilities-based rendering (NOT USED BY ANY PAGE)

**What must die:**
- Every `localStorage.getItem()` and `localStorage.setItem()` call in application logic
- Every `isSupabaseConfigured()` fallback branch — remove the branch, keep only the Supabase path
- The old service files: `plan-storage.ts`, `data-layer-service.ts`, `calculation-lifecycle-service.ts`, `results-storage.ts`
- Type aliases that paper over the rename: `RuleSetConfig = CompensationPlanConfig` — the real type becomes the only type

---

## FIRST PRINCIPLES

1. **NO DUAL-MODE.** Remove every `if (isSupabaseConfigured())` branch. Supabase IS configured. There is no fallback.
2. **NO TYPE ALIASES.** `RuleSetConfig` is the type. `CompensationPlanConfig` is deleted. `entityId` is the field. `employeeId` is deleted.
3. **CLEAR LOCALSTORAGE TEST.** After every phase: open browser DevTools → Application → Local Storage → Clear All → Refresh. If anything breaks, the phase is not done.
4. **KOREAN TEST.** Zero hardcoded field names or English-specific string matching in any modified file.
5. **PROVE DON'T DESCRIBE.** Paste grep output, not claims.

---

## STANDING RULES

1. Always commit + push after changes.
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`.
3. Git commit messages: ASCII only.
4. Completion reports at PROJECT ROOT.
5. NEVER ask yes/no. Just act.
6. FIRST PRINCIPLES OVERRIDE EVERYTHING.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output.
28. One commit per phase.

---

## PHASE 0: RECONNAISSANCE — MAP THE KILL LIST

Before writing any code, map every localStorage reference and every old service import:

```bash
echo "=== LOCALSTORAGE REFERENCES BY FILE ==="
grep -rn "localStorage" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | cut -d: -f1 | sort | uniq -c | sort -rn

echo ""
echo "=== OLD SERVICE IMPORTS ==="
grep -rn "plan-storage\|plan_storage\|PlanService\|getActivePlan\|getAllPlans\|savePlan" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
grep -rn "data-layer-service\|DataLayerService\|getCommittedData\|getRawData\|getTransformedData" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
grep -rn "calculation-lifecycle\|LifecycleService\|getLifecycleState\|transitionLifecycle" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
grep -rn "results-storage\|ResultsStorage\|getCalculationResults\|saveCalculationResults" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

echo ""
echo "=== EMPLOYEE_ID / COMPENSATION_PLAN / PLAN_ID COUNTS ==="
grep -rn "employeeId\|employee_id\|employeeName\|employee_name" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
grep -rn "CompensationPlan\|compensation_plan\|compensation_plans" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
grep -rn "planId\|plan_id\|plan\.id" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

echo ""
echo "=== DUAL-MODE BRANCHES ==="
grep -rn "isSupabaseConfigured" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

echo ""
echo "=== TYPE ALIASES ==="
grep -rn "RuleSetConfig = \|RuleSetStatus = \|EntityMetrics = " src/ --include="*.ts" --include="*.tsx"

echo ""
echo "=== ALL PAGE FILES ==="
find src/app -name "page.tsx" | sort | wc -l
find src/app -name "page.tsx" | sort
```

Document all findings. This is the kill list.

**Commit:** `OB-43A Phase 0: Reconnaissance — localStorage kill list documented`

---

## PHASE 1: KILL DUAL-MODE IN SUPABASE SERVICES

### 1A: Remove isSupabaseConfigured() branches

In each of the 4 Supabase service files, remove the `if (isSupabaseConfigured())` check and the entire `else` (localStorage fallback) branch. Keep only the Supabase code path.

Files:
- `src/lib/supabase/entity-service.ts`
- `src/lib/supabase/rule-set-service.ts`
- `src/lib/supabase/data-service.ts`
- `src/lib/supabase/calculation-service.ts`

### 1B: Remove isSupabaseConfigured() function

In `src/lib/supabase/client.ts`, remove the `isSupabaseConfigured()` export. If Supabase env vars are missing, the app should throw on startup — not silently fall back.

### 1C: Verify

```bash
grep -rn "isSupabaseConfigured" src/ --include="*.ts" --include="*.tsx"
# Must return 0 results
```

**Commit:** `OB-43A Phase 1: Kill dual-mode — remove all isSupabaseConfigured branches`

---

## PHASE 2: KILL TYPE ALIASES — RENAME IS REAL

### 2A: Delete aliases, make domain-agnostic types the source of truth

In `src/types/compensation-plan.ts`:
- Rename `CompensationPlanConfig` → `RuleSetConfig` (the real name, not an alias)
- Rename `PlanStatus` → `RuleSetStatus`
- Rename `CompensationPlan` → `RuleSet`
- Delete all `export type X = Y` alias lines
- Update every file that imports the old names to import the new names

In `src/types/calculation-engine.ts`:
- Rename `EmployeeMetrics` → `EntityMetrics`
- Rename `EmployeeCalculationResult` → `EntityCalculationResult`
- Remove `employeeId` from any interface that has both `employeeId` and `entityId` — keep only `entityId`
- Update all consumers

### 2B: Global rename in all files

```bash
# Find every file that needs updating
grep -rn "CompensationPlan\|EmployeeMetrics\|EmployeeCalculationResult\|employeeId\|employee_id" \
  src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | cut -d: -f1 | sort -u
```

For each file: rename types, rename variables, rename props. This is not a find-and-replace — each occurrence must be evaluated. But the direction is clear:
- `employeeId` → `entityId`
- `employee_id` → `entity_id`
- `employeeName` → `entityName` or `displayName`
- `employee_count` → `entity_count`
- `CompensationPlan` → `RuleSet`
- `plan_id` / `planId` → `rule_set_id` / `ruleSetId`

### 2C: Verify

```bash
grep -rn "CompensationPlan[^C]" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
# Must return 0 (exclude CompensationPlanConfig which is now RuleSetConfig)

grep -rn "employeeId\b" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
# Must return 0

grep -rn "RuleSetConfig = \|EntityMetrics = " src/ --include="*.ts" --include="*.tsx" | wc -l
# Must return 0 (no aliases)
```

**Commit:** `OB-43A Phase 2: Kill type aliases — RuleSet, EntityMetrics, entityId are the real types`

---

## PHASE 3: AUTH CONTEXT — FULL SUPABASE, NO DEMO FALLBACK

### 3A: Rewrite auth-context.tsx

The auth context currently has a demo user switcher and localStorage-based auth as a fallback. Rewrite it to use Supabase Auth exclusively:

- `login(email, password)` → calls `supabase.auth.signInWithPassword()`
- `logout()` → calls `supabase.auth.signOut()`
- `user` → derived from Supabase session + profiles table join
- `tenant` → derived from user's profile → tenant_id → tenants table
- `capabilities` → from user's profile.capabilities array
- On mount: check `supabase.auth.getSession()` — if no session, redirect to /login
- On auth state change: `supabase.auth.onAuthStateChange()` updates context

### 3B: Remove demo user switcher

The "Demo User" toggle at the bottom of the sidebar — remove it entirely. Users authenticate through the login page. The three seed users (platform, sofia, diego) serve as demo accounts.

### 3C: Profile loading with scope

After auth, load the user's profile from Supabase. If the profile has an `entity_id`, also load their `profile_scope` for data visibility. Store scope in context so every page can access it.

### 3D: Tenant context from database

Remove all localStorage tenant logic. The tenant comes from the user's profile. `TenantContext` reads from the `tenants` table only.

### 3E: Verify

- Sign in as platform@vialuce.com → sees admin capabilities
- Sign in as diego@retailco.mx → sees restricted capabilities
- Clear localStorage → refresh → still authenticated (session is in Supabase cookie)
- Sign out → redirected to /login

**Commit:** `OB-43A Phase 3: Auth context — full Supabase, no demo fallback, scope loading`

---

## PHASE 4: OPERATE WORKSPACE — IMPORT, CALCULATE, LIFECYCLE

The Operate workspace is the critical path. These pages must read from Supabase.

### 4A: Import page (`/operate/import` or `/data/import`)

- File upload still works client-side (parse XLSX/CSV in browser)
- After parsing, write to Supabase: `import_batches` + `committed_data` via data-service.ts
- Entity auto-creation: new entity_ids create `entities` records with `status = 'proposed'`
- AI classification: calls server-side `/api/ai/classify-file` (already exists)
- Remove all localStorage writes from import flow

### 4B: Calculation page (`/operate/calculate`)

- Load active rule sets from `rule_sets` table via rule-set-service.ts
- Load entity data from `period_entity_state` (materialized) or `committed_data`
- Run calculation → write results to `calculation_results` and `calculation_traces`
- Write batch to `calculation_batches` with lifecycle_state
- Remove all localStorage reads/writes from calculation flow

### 4C: Lifecycle / Cycle indicator

- CycleService reads from `calculation_batches.lifecycle_state` via Supabase
- Lifecycle transitions call calculation-service.ts `transitionBatchLifecycle()`
- Rule 30 enforcement: OFFICIAL+ cannot roll back (calculation-service.ts already has this)
- On transition, trigger `materializeEntityPeriodOutcomes()`

### 4D: Results page (`/operate/results`)

- Read from `calculation_results` joined with `entities` (for display_name)
- Read from `entity_period_outcomes` for aggregated view
- All data from Supabase, zero localStorage

### 4E: Reconciliation page (`/operate/reconcile`)

- Read from `reconciliation_sessions` and `calculation_results`
- Write reconciliation actions to Supabase

### 4F: Verify

Clear localStorage. Navigate through entire Operate flow: Import → Calculate → Results → Lifecycle transition. Everything must work with empty localStorage.

**Commit:** `OB-43A Phase 4: Operate workspace — full Supabase, zero localStorage`

---

## PHASE 5: PERFORM WORKSPACE — REP AND MANAGER VIEWS

### 5A: Perform landing / dashboard

- Read calculation results for the authenticated user's entity from `entity_period_outcomes`
- Scope-aware: only show data the user is allowed to see (per profile_scope)

### 5B: My Compensation (`/perform/compensation`)

- Read from `calculation_results` filtered by user's entity_id
- Show component breakdown from calculation traces

### 5C: Transactions (`/perform/transactions`)

- Read from `committed_data` filtered by user's entity_id
- Show transaction history from Supabase

### 5D: Team view (`/perform/team`)

- Read from `entity_period_outcomes` for all entities in user's scope
- Scope derived from `profile_scope.full_visibility_entity_ids`

### 5E: Disputes / Inquiries

- Read from / write to `disputes` table
- `submitted_by` = current user's profile id

### 5F: Verify

Clear localStorage. Sign in as Diego (team scope). Verify he sees only his team's data. Sign in as Sofia (admin). Verify she sees all tenant data.

**Commit:** `OB-43A Phase 5: Perform workspace — scoped data, zero localStorage`

---

## PHASE 6: CONFIGURE, INVESTIGATE, GOVERN, DESIGN WORKSPACES

### 6A: Configure workspace

- Personnel → reads from `entities` WHERE entity_type = 'individual'
- Teams → reads from `entity_relationships` WHERE relationship_type = 'member_of'
- Locations → reads from `entities` WHERE entity_type = 'location'
- Hierarchy → reads from `entity_relationships` WHERE relationship_type IN ('manages', 'reports_to')
- Periods → reads from `periods` table
- Terminology → reads from `tenants.settings` JSONB (hierarchy_labels, entity_type_labels)

### 6B: Investigate workspace

- Calculations → reads from `calculation_results` + `calculation_traces`
- Employees → reads from `entities` (renamed to "Entities" in UI)
- Transactions → reads from `committed_data`
- Audit → reads from `audit_logs`
- Disputes → reads from `disputes`

### 6C: Design workspace

- Plans → reads from `rule_sets` (renamed to "Rule Sets" in UI)
- Plan import → writes to `rule_sets` via rule-set-service.ts
- Goals → reads from `rule_set_assignments.entity_overrides`

### 6D: Govern workspace

- Audit Reports → reads from `audit_logs`
- Approvals → reads from `calculation_batches` WHERE lifecycle_state = 'PENDING_APPROVAL'
- Access → reads from `profiles` + `profile_scope`
- Reconciliation → reads from `reconciliation_sessions`

### 6E: Verify

Clear localStorage. Navigate through every workspace. Zero pages should show empty state due to missing localStorage data.

**Commit:** `OB-43A Phase 6: All workspaces — Configure, Investigate, Design, Govern on Supabase`

---

## PHASE 7: HOME DASHBOARD AND SIDEBAR

### 7A: Home page metrics

The home page shows YTD Compensation, Quota Attainment, Team Ranking, Pending Commissions. These must read from:
- `entity_period_outcomes` for the current user's entity
- `calculation_batches` for pending approvals count
- `committed_data` for data freshness

### 7B: Sidebar data

- The Cycle indicator: reads from `calculation_batches` lifecycle states
- Periods list: reads from `periods` table
- The Queue: reads from Supabase (pending actions for current user)
- The Pulse (Cycle Progress, Pending Approvals, Data Freshness, Employees): all from Supabase

### 7C: Capabilities-based rendering

Wire `useCapability` hook into navigation:
- Hide "Operate" from users without `manage_rule_sets` or `approve_outcomes`
- Hide "Design" from users without `manage_rule_sets`
- Hide "Govern" from users without `approve_outcomes`
- Show only "Perform" to users with only `view_outcomes`

### 7D: Verify

Clear localStorage. Home page loads with real data from Supabase. Sidebar shows live periods and lifecycle states. Sign in as Diego — should see only Perform workspace.

**Commit:** `OB-43A Phase 7: Home dashboard and sidebar — all Supabase, capabilities-based nav`

---

## PHASE 8: DELETE OLD SERVICE FILES AND LOCALSTORAGE REFERENCES

### 8A: Delete old services

```bash
# Delete these files (verify each is no longer imported anywhere first)
rm src/lib/compensation/plan-storage.ts
rm src/lib/data-architecture/data-layer-service.ts
rm src/lib/calculation/calculation-lifecycle-service.ts  # or wherever it lives
rm src/lib/calculation/results-storage.ts  # or wherever it lives
```

If any other localStorage-based service files exist, delete them too.

### 8B: Remove ALL remaining localStorage references

```bash
grep -rn "localStorage" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v supabase
```

Every result must be removed. No localStorage in application code.

### 8C: Final grep verification

```bash
echo "=== LOCALSTORAGE ==="
grep -rn "localStorage" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v supabase | wc -l

echo "=== DUAL MODE ==="
grep -rn "isSupabaseConfigured" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "=== OLD TYPE NAMES ==="
grep -rn "CompensationPlan\b" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

echo "=== OLD FIELD NAMES ==="
grep -rn "employeeId\b\|employee_id\b" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

echo "=== OLD SERVICE IMPORTS ==="
grep -rn "plan-storage\|data-layer-service\|calculation-lifecycle\|results-storage" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "=== KOREAN TEST ==="
grep -rn "'Employee'\|'Commission'\|'Compensation'\|'Manager'\|'Store'\|'Branch'" src/lib/ --include="*.ts" | wc -l
```

ALL counts must be 0.

**Commit:** `OB-43A Phase 8: Delete old services, remove all localStorage, final cleanup`

---

## PHASE 9: BUILD AND CLOSING

### 9A: Build

```bash
rm -rf .next
npm run build
```

Must succeed with zero TypeScript errors. Warnings are acceptable.

### 9B: Closing sequence

1. Kill dev server
2. `rm -rf .next`
3. `npm run build`
4. `npm run dev`
5. Open localhost:3000
6. Clear localStorage
7. Sign in as platform@vialuce.com
8. Navigate through all 6 workspaces
9. Sign out, sign in as diego@retailco.mx
10. Verify scoped visibility
11. Create completion report

**Commit:** `OB-43A Phase 9: Final build, verification, completion report`

---

## HARD GATES

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| HG-1 | Phase 0 kill list documented with file-by-file localStorage counts. | | |
| HG-2 | Zero `isSupabaseConfigured()` calls in codebase. Grep returns 0. | | |
| HG-3 | Zero type aliases (RuleSetConfig=, EntityMetrics=). Real types renamed. | | |
| HG-4 | Zero `CompensationPlan` references (grep returns 0). Type is `RuleSet`. | | |
| HG-5 | Zero `employeeId` / `employee_id` in TypeScript code (grep returns 0). Field is `entityId` / `entity_id`. | | |
| HG-6 | Zero `planId` / `plan_id` references (grep returns 0). Field is `ruleSetId` / `rule_set_id`. | | |
| HG-7 | Auth context uses Supabase Auth exclusively. No demo user switcher. No localStorage auth. | | |
| HG-8 | Demo user switcher removed from sidebar. | | |
| HG-9 | Profile scope loaded on auth. Capabilities available in context. | | |
| HG-10 | Operate/Import writes to Supabase import_batches + committed_data. Zero localStorage. | | |
| HG-11 | Operate/Calculate reads rule_sets from Supabase, writes results to Supabase. Zero localStorage. | | |
| HG-12 | Lifecycle transitions read/write calculation_batches in Supabase. Rule 30 enforced. | | |
| HG-13 | Perform workspace reads from entity_period_outcomes + calculation_results. Scoped by profile_scope. | | |
| HG-14 | Configure/Personnel reads from entities table. Shows Supabase entity data, not localStorage. | | |
| HG-15 | Home dashboard metrics read from Supabase. | | |
| HG-16 | Sidebar Cycle, Periods, Queue, Pulse all read from Supabase. | | |
| HG-17 | Capabilities-based nav: Diego sees only Perform. Platform admin sees all workspaces. | | |
| HG-18 | Old service files deleted: plan-storage.ts, data-layer-service.ts, results-storage.ts, calculation-lifecycle-service.ts. | | |
| HG-19 | Zero localStorage references in application code (excluding Supabase auth internals). Grep returns 0. | | |
| HG-20 | Korean Test: zero hardcoded English field names in service layer. Grep returns 0. | | |
| HG-21 | CLEAR LOCALSTORAGE TEST: Clear browser localStorage, refresh, sign in — app works fully. | | |
| HG-22 | `npm run build` succeeds with zero TypeScript errors. | | |
| HG-23 | localhost:3000 responds after final build. | | |

## SOFT GATES

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| SG-1 | Diego (team scope) sees fewer entities than Sofia (admin scope) on Personnel page. | | |
| SG-2 | Rule 30: attempting OFFICIAL→PREVIEW transition fails with error message. | | |
| SG-3 | Entity auto-creation on import: new entity_id creates proposed entity in entities table. | | |
| SG-4 | Audit log entries written for sign-in, lifecycle transition, data import. | | |
| SG-5 | Period entity state materialization runs after import, producing flat resolved attributes. | | |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-43A_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE.

---

## CRITICAL CC INSTRUCTION

**Do NOT create a new dual-mode pattern.** Do NOT create new fallback mechanisms. Do NOT create compatibility shims. If a page cannot read from Supabase because the service doesn't support that query yet, EXTEND the Supabase service to support it. Do NOT fall back to localStorage.

The only acceptable state for any page after this OB is:
1. It reads from Supabase and works, OR
2. It shows an empty state with a clear message ("No data available") because there's no seed data for that view

Option 3 — "it reads from localStorage because the Supabase path isn't done yet" — does NOT exist.

---

*ViaLuce.ai — The Way of Light*
*OB-43A: Supabase Cutover — Kill localStorage*
*"The dual-mode era is over. There is one source of truth and it lives in Postgres."*
