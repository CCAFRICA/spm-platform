# OB-42: ENTITY MODEL AND SUPABASE MIGRATION

NEVER ask yes/no. NEVER say "shall I". Just act.

---

## CONTEXT

This is the paradigm shift batch. ViaLuce is migrating from localStorage to Supabase AND simultaneously implementing the Entity Model architecture from TMR Addendum 8. The current codebase uses localStorage for all data, references `compensation_plans`, `employee_id`, `plan_id`, and ICM-specific terminology throughout. After this batch, ViaLuce operates on Supabase with a relationship graph, three materialization layers, and domain-agnostic naming.

**Source Documents (read these BEFORE any code):**
- `ViaLuce_Migration_Design_Specification_v2.md` — MDS v2 with 17-table schema, rename map, async patterns
- `ViaLuce_Entity_Model_Design.docx` — TMR Addendum 8 with 8 locked design decisions (D1-D8), 6 new tables, 3 materializations
- `BACKLOG_UPDATE_20260214.md` — Rule 30 (Financial Assertion Immutability), HF-023 lifecycle immutability
- `CLEARCOMP_STANDING_PRINCIPLES.md` — All standing principles
- `COMPLETION_REPORT_ENFORCEMENT.md` — Report rules 25-28

**What exists today:**
- Next.js app at `web/` using localStorage for ALL data persistence
- Services: PlanService (plan-storage.ts), DataLayerService, CalculationOrchestrator, LifecycleService, AuthContext, TenantService, QueueService, CycleService, DisputeService, AuditService
- Names: `compensation_plans`, `employee_id`, `employee_name`, `plan_id`, `employee_count` throughout
- Demo auth via localStorage (no real auth)
- ICM-specific labels hardcoded in many components

**What must exist after:**
- Supabase Postgres with 23 tables (17 MDS v2 + 6 entity model)
- 3 materialization tables (period_entity_state, profile_scope, entity_period_outcomes)
- All services async, reading/writing Supabase
- All references renamed: employee → entity, compensation_plans → rule_sets, plan_id → rule_set_id
- Supabase Auth replacing demo auth
- RLS on every table with defense-in-depth
- Entity relationship graph supporting CPI
- Domain-agnostic capabilities (view_outcomes, approve_outcomes, etc.)
- Korean Test compliant — zero hardcoded field names or English-specific patterns

---

## FIRST PRINCIPLES (override everything else)

1. **SECURITY BY DESIGN** — RLS on every table. Defense-in-depth: database + service layer + verification. Tenant isolation is non-negotiable.
2. **AI-FIRST, NEVER HARDCODED** — No hardcoded field names, sheet names, or language-specific patterns. Engines consume AI mapping decisions.
3. **KOREAN TEST** — Would this work in Hangul? Zero English-specific string matching in logic.
4. **DOMAIN AGNOSTIC** — No ICM-specific concepts in infrastructure code. "compensation", "commission", "employee" are domain labels, not architectural concepts.
5. **SCALE** — 150K entities per tenant, billions of transactions, 50+ tenants. If it breaks at scale, it's not done.
6. **RULE 30: FINANCIAL ASSERTION IMMUTABILITY** — OFFICIAL+ calculation batches are immutable. They can be superseded, never overwritten.
7. **PROVE, DON'T DESCRIBE** — Paste evidence, not claims.

---

## STANDING RULES

1. Always commit + push after changes.
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`.
3. VL Admin selects preferred language — no forced English override.
4. Git commit messages: ASCII only, no smart quotes or unicode.
5. Never provide CC with answer values — fix logic not data.
6. Completion reports and proof gates saved to PROJECT ROOT.
7. Single-paste prompts with full requirements.
8. OB closing: final build + confirm localhost:3000 + completion report.
9. NEVER ask yes/no. NEVER say "shall I". Just act.
10. FIRST PRINCIPLES OVERRIDE EVERYTHING.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: RECONNAISSANCE

Before writing any code, read and document:

```bash
echo "=== CURRENT SUPABASE CONFIG ==="
find web/ -name "supabase*" -o -name ".env*" | head -20
cat web/.env.local 2>/dev/null || echo "No .env.local"

echo ""
echo "=== CURRENT SERVICE FILES ==="
find web/src/lib -name "*.ts" -o -name "*.tsx" | sort

echo ""
echo "=== EMPLOYEE_ID REFERENCES ==="
grep -rn "employee_id\|employee_name\|employee_count\|employeeId\|employeeName" web/src/ --include="*.ts" --include="*.tsx" | wc -l
grep -rn "employee_id\|employee_name\|employee_count\|employeeId\|employeeName" web/src/ --include="*.ts" --include="*.tsx" | head -30

echo ""
echo "=== COMPENSATION_PLANS REFERENCES ==="
grep -rn "compensation_plans\|compensation_plan\|CompensationPlan" web/src/ --include="*.ts" --include="*.tsx" | wc -l

echo ""
echo "=== PLAN_ID REFERENCES ==="
grep -rn "plan_id\|planId\|plan\.id" web/src/ --include="*.ts" --include="*.tsx" | wc -l

echo ""
echo "=== LOCALSTORAGE USAGE ==="
grep -rn "localStorage" web/src/ --include="*.ts" --include="*.tsx" | wc -l
grep -rn "localStorage" web/src/ --include="*.ts" --include="*.tsx" | head -30

echo ""
echo "=== HARDCODED ENGLISH STRINGS IN LOGIC ==="
grep -rn "'Manager'\|'Employee'\|'Commission'\|'Bonus'\|'Zone'\|'Store'\|'Branch'" web/src/lib/ --include="*.ts" | head -20

echo ""
echo "=== PACKAGE.JSON DEPS ==="
cat web/package.json | grep -A 5 '"dependencies"' | head -20

echo ""
echo "=== CURRENT AUTH PATTERN ==="
cat web/src/contexts/auth-context.tsx | head -50
```

Document ALL findings in Phase 0 section of completion report. This determines the exact scope of rename and refactor work.

**Commit:** `OB-42 Phase 0: Reconnaissance — document current state for migration`

---

## PHASE 1: SUPABASE PROJECT SETUP

### 1A: Install and configure Supabase

```bash
cd web
npm install @supabase/supabase-js @supabase/ssr
```

Create `web/src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `web/src/lib/supabase/server.ts` for server-side usage:
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

### 1B: Environment variables

Create `web/.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 1C: Database types

Create `web/src/lib/supabase/database.types.ts` with TypeScript interfaces for ALL 23 tables matching the MDS v3 schema (MDS v2 17 tables + 6 entity model tables). Use the EXACT column names from the schema specifications. Domain-agnostic names throughout: `rule_sets` NOT `compensation_plans`, `entity_id` NOT `employee_id`.

**Commit:** `OB-42 Phase 1: Supabase project setup with client, server, and types`

---

## PHASE 2: CORE SCHEMA — TENANTS, PROFILES, ENTITIES

### 2A: Create SQL migration file

Create `web/supabase/migrations/001_core_tables.sql` with:

**Table 1: tenants** — Per MDS v2, add `hierarchy_labels JSONB` and `entity_type_labels JSONB` to settings for canvas rendering.

**Table 2: profiles** — Per MDS v2 + D6 modifications:
- `entity_id UUID REFERENCES entities(id)` — nullable, links operational users to their entity
- `scope_override TEXT` — nullable, for admin users without graph-derived scope
- `capabilities TEXT[]` — domain-agnostic: view_outcomes, approve_outcomes, export_results, manage_rule_sets, manage_assignments, design_scenarios
- NO `manager_id` (moved to relationship graph)
- NO `division_id` (moved to relationship graph)
- `scope_level TEXT` retained ONLY for admin override users

**Table 3: entities** — Per TMR Addendum 8:
```sql
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- 'individual', 'location', 'team', 'organization'
  display_name TEXT,
  attributes JSONB DEFAULT '{}',  -- Temporal attribute history with dated arrays
  profile_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'active',  -- 'proposed', 'active', 'suspended', 'terminated'
  effective_start DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, external_id, entity_type)
);
```

**Table 4: entity_relationships** — The relationship graph:
```sql
CREATE TABLE entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,  -- 'contains', 'manages', 'works_at', 'assigned_to', 'member_of', 'participates_in', 'oversees', 'assists'
  confidence DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  evidence JSONB DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'human_created',  -- 'ai_inferred', 'human_confirmed', 'human_created', 'imported_explicit'
  context JSONB DEFAULT '{}',  -- { lob, domain, hierarchy_name }
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Table 5: reassignment_events** — Per D4 specification.

### 2B: Add circular FK between profiles and entities

After both tables exist:
```sql
ALTER TABLE profiles ADD COLUMN entity_id UUID REFERENCES entities(id);
ALTER TABLE entities ADD COLUMN profile_id UUID REFERENCES profiles(id);
```

### 2C: RLS on all three tables

Standard tenant isolation policy on each table. Plus:
- profiles: users can read their own profile, admins can read all tenant profiles
- entities: scoped by tenant_id, further scoped by profile_scope materialization
- entity_relationships: scoped by tenant_id

### 2D: Indexes

```sql
CREATE INDEX idx_entities_tenant ON entities(tenant_id);
CREATE INDEX idx_entities_external ON entities(tenant_id, external_id);
CREATE INDEX idx_entities_type ON entities(tenant_id, entity_type);
CREATE INDEX idx_entity_rel_source ON entity_relationships(tenant_id, source_entity_id);
CREATE INDEX idx_entity_rel_target ON entity_relationships(tenant_id, target_entity_id);
CREATE INDEX idx_entity_rel_type ON entity_relationships(tenant_id, relationship_type);
CREATE INDEX idx_entity_rel_active ON entity_relationships(tenant_id, relationship_type) WHERE effective_end IS NULL;
```

**Commit:** `OB-42 Phase 2: Core schema — tenants, profiles, entities, relationship graph`

---

## PHASE 3: RULE SETS, ASSIGNMENTS, PERIODS

### 3A: SQL migration

Create `web/supabase/migrations/002_rule_sets_and_periods.sql` with:

**Table 6: rule_sets** — Per MDS v2 5-layer decomposition:
- `domain TEXT NOT NULL DEFAULT 'compensation'` — drives UI labels
- `population_config JSONB` — Layer 1: who does this apply to
- `input_bindings JSONB` — Layer 2: what data feeds calculation
- `components JSONB` — Layer 3: 13 primitives + 33 modifiers
- `cadence_config JSONB` — Layer 4: when run, when pay
- `outcome_config JSONB` — Layer 5: what output represents
- `parent_version_id UUID REFERENCES rule_sets(id)` — version chain
- `interpretation_confidence DECIMAL(3,2)` — AI confidence 0.00-1.00

**Table 7: rule_set_assignments** — Entity-to-rule-set binding:
- `entity_id UUID NOT NULL REFERENCES entities(id)` — UUID FK, not TEXT
- `entity_type TEXT NOT NULL`
- `rule_set_id UUID NOT NULL REFERENCES rule_sets(id)`
- `variant_key TEXT`
- `entity_overrides JSONB` — per-entity rates, targets, classifications
- `effective_start DATE NOT NULL`
- `effective_end DATE`

**Table 8: periods** — Per MDS v2:
- `period_key TEXT NOT NULL` — '2024-01', '2024-Q1', '2024-W03'
- `period_type TEXT NOT NULL` — 'monthly', 'quarterly', 'biweekly', 'weekly', 'annual'
- `parent_period_id UUID REFERENCES periods(id)` — biweekly → parent monthly
- `payment_date DATE`
- `status TEXT NOT NULL DEFAULT 'open'`

RLS + indexes on all three tables.

**Commit:** `OB-42 Phase 3: Rule sets, assignments, and periods schema`

---

## PHASE 4: DATA AND CALCULATION TABLES

### 4A: SQL migration

Create `web/supabase/migrations/003_data_and_calculation.sql` with:

**Table 9: import_batches** — Per MDS v2.

**Table 10: committed_data** — Per MDS v2 + entity model:
- `entity_id UUID NOT NULL REFERENCES entities(id)` — UUID FK, not TEXT
- `entity_type TEXT NOT NULL`

**Table 11: calculation_batches** — Per MDS v2 + Rule 30:
- `rule_set_id UUID NOT NULL REFERENCES rule_sets(id)` — renamed from plan_id
- `superseded_by UUID REFERENCES calculation_batches(id)` — immutability chain
- `supersedes UUID REFERENCES calculation_batches(id)` — immutability chain
- `batch_type TEXT NOT NULL DEFAULT 'standard'` — 'standard', 'superseding', 'adjustment', 'reversal'
- `entity_count INTEGER` — renamed from employee_count

**Table 12: calculation_results** — Per MDS v2 + entity model:
- `entity_id UUID NOT NULL REFERENCES entities(id)` — UUID FK, not TEXT
- `entity_type TEXT`
- `assignment_id UUID REFERENCES rule_set_assignments(id)`
- `variant_key TEXT`

**Table 13: calculation_traces** — `entity_id UUID NOT NULL REFERENCES entities(id)`

**Tables 14-17:** disputes, reconciliation_sessions, classification_signals, audit_logs — all with entity_id as UUID FK where applicable.

**Tables 18-19:** ingestion_configs, ingestion_events — Per MDS v2.

**Table 20:** usage_metering — Per MDS v2.

RLS + indexes on ALL tables.

**Commit:** `OB-42 Phase 4: Data, calculation, and supporting tables schema`

---

## PHASE 5: MATERIALIZATION TABLES

### 5A: SQL migration

Create `web/supabase/migrations/004_materializations.sql` with:

**Table 21: period_entity_state** — Per D5:
```sql
CREATE TABLE period_entity_state (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  resolved_attributes JSONB NOT NULL DEFAULT '{}',
  relationships JSONB NOT NULL DEFAULT '{}',
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_key, entity_id)
);
```

**Table 22: profile_scope** — Per D6/D7 multi-dimensional visibility:
```sql
CREATE TABLE profile_scope (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_visibility_entity_ids UUID[] NOT NULL DEFAULT '{}',
  rule_set_visibility JSONB NOT NULL DEFAULT '{}',
  aggregate_visibility JSONB NOT NULL DEFAULT '{}',
  scope_type TEXT NOT NULL DEFAULT 'graph_derived',
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id)
);
```

**Table 23: entity_period_outcomes** — Per D7:
```sql
CREATE TABLE entity_period_outcomes (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  rule_set_outcomes JSONB NOT NULL DEFAULT '{}',
  total_payout DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_by_currency JSONB DEFAULT '{}',
  rule_set_count INTEGER NOT NULL DEFAULT 0,
  lowest_lifecycle_state TEXT,
  all_official BOOLEAN DEFAULT FALSE,
  all_approved BOOLEAN DEFAULT FALSE,
  post_aggregation JSONB DEFAULT '{}',
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_key, entity_id)
);
```

RLS + indexes on all three. The profile_scope RLS is critical — it enables graph-derived scope on every data query.

**Commit:** `OB-42 Phase 5: Three materialization tables — period_entity_state, profile_scope, entity_period_outcomes`

---

## PHASE 6: AUTH SERVICE MIGRATION

### 6A: Supabase Auth integration

Replace the demo auth context with Supabase Auth. Create:

- `web/src/lib/auth/auth-service.ts` — Supabase auth operations (sign in, sign out, get session)
- `web/src/contexts/auth-context.tsx` — Rewrite to use Supabase auth. The hook interface (`useAuth()`) stays the same. The implementation changes from localStorage to Supabase session.

### 6B: Middleware

Create `web/src/middleware.ts` — Supabase auth middleware that protects routes and refreshes sessions.

### 6C: Profile loading

On auth, load the user's profile including `entity_id`, `capabilities`, `scope_override`. If the user has an `entity_id`, also load their `profile_scope` materialization for data visibility.

### 6D: Tenant context

Migrate TenantService from localStorage to Supabase. The tenant selection flow reads from `tenants` table. User's `tenant_id` comes from their profile.

**CRITICAL:** The auth migration must maintain backward compatibility for the demo flow. Create a demo seed that populates Supabase with the demo tenant, demo profiles (VL Admin + Sofia + Diego personas), and demo entities. The demo must work immediately after migration without manual database setup.

**Commit:** `OB-42 Phase 6: Auth service — Supabase Auth, middleware, profile loading, tenant context`

---

## PHASE 7: ENTITY SERVICE AND RELATIONSHIP GRAPH

### 7A: Entity service

Create `web/src/lib/entities/entity-service.ts`:
- `getEntities(tenantId)` — list entities for tenant
- `getEntity(entityId)` — single entity with relationships
- `createEntity(entity)` — create from import or manual
- `updateEntityAttributes(entityId, attributes, effectiveDate)` — temporal attribute update
- `resolveEntityState(entityId, asOfDate)` — resolve attributes as-of a date from temporal history

### 7B: Relationship service

Create `web/src/lib/entities/relationship-service.ts`:
- `getRelationships(entityId)` — all relationships for an entity
- `getRelationshipsByType(tenantId, type)` — all relationships of a type
- `createRelationship(relationship)` — with confidence and evidence
- `endRelationship(relationshipId, endDate)` — temporal end, not delete
- `traverseGraph(entityId, relationshipTypes, maxDepth)` — graph traversal for scope resolution

### 7C: Reassignment service

Create `web/src/lib/entities/reassignment-service.ts`:
- `createReassignment(event)` — creates reassignment_event + updates relationship graph
- `previewReassignmentImpact(entity, from, to)` — Thermostat impact preview (stub for now, will connect to calculation engine)

### 7D: Scope materialization service

Create `web/src/lib/entities/scope-service.ts`:
- `materializeScope(profileId)` — traverse graph from entity, resolve visibility tiers, write to profile_scope
- `materializeAllScopes(tenantId)` — bulk materialization for all profiles in tenant
- `getScope(profileId)` — read materialized scope

**Commit:** `OB-42 Phase 7: Entity service, relationship graph, reassignment, and scope materialization`

---

## PHASE 8: RULE SET SERVICE MIGRATION

### 8A: Rename and migrate PlanService → RuleSetService

Create `web/src/lib/rule-sets/rule-set-service.ts` replacing `plan-storage.ts`:
- All functions async, reading from Supabase `rule_sets` table
- `getActiveRuleSets(tenantId)` replaces `getActivePlan(tenantId)`
- `getRuleSet(ruleSetId)` with full 5-layer decomposition
- `getRuleSetAssignments(ruleSetId)` — entity bindings
- `createRuleSet(ruleSet)` — from AI interpretation or manual build
- `updateRuleSetComponents(ruleSetId, components)` — version chain via parent_version_id

### 8B: Period service

Create `web/src/lib/periods/period-service.ts`:
- `getPeriods(tenantId)` — list periods
- `getCurrentPeriod(tenantId)` — active period
- `createPeriod(period)` — with parent linking for mixed cadence
- `updatePeriodStatus(periodId, status)` — open → calculating → review → closed → paid

### 8C: Update ALL consumers

Every component that called PlanService must now call RuleSetService. This is a bulk find-and-replace PLUS async refactor. Every call becomes `await` with loading/error states.

**Commit:** `OB-42 Phase 8: RuleSetService replaces PlanService — async Supabase, domain-agnostic naming`

---

## PHASE 9: DATA LAYER MIGRATION

### 9A: Import service

Migrate ImportService and DataLayerService to Supabase:
- File upload writes to `import_batches` + `committed_data`
- `committed_data.entity_id` is now UUID FK → entities table
- On import, entities are auto-created or matched against existing registry (CPI seeding)
- Classification signals write to `classification_signals` table

### 9B: Entity auto-creation from import

When data is imported and an entity_id (external_id) is not found in the entities table:
1. Create new entity record with `status = 'proposed'`
2. Infer entity_type from data context
3. Infer relationships from shared attribute proximity (CPI dimension 1)
4. Flag for human confirmation

When entity_id IS found:
1. Match committed_data to existing entity
2. Check for attribute changes (salary, role, etc.) — flag if changed
3. Reinforce relationship confidence

### 9C: Period entity state materialization

After data import + entity resolution, materialize `period_entity_state` for the current period:
- Resolve each entity's attributes as-of period end date
- Pre-resolve relationships from graph
- Write flat JSONB to period_entity_state

**Commit:** `OB-42 Phase 9: Data layer migration — import to Supabase, entity auto-creation, period materialization`

---

## PHASE 10: CALCULATION ENGINE MIGRATION

### 10A: Orchestrator migration

Migrate CalculationOrchestrator to read from Supabase:
- Read rule sets from `rule_sets` table (not localStorage compensation_plans)
- Read entity data from `period_entity_state` materialization (not committed_data directly)
- Read assignments from `rule_set_assignments`
- Write results to `calculation_results` with entity_id as UUID FK
- Write traces to `calculation_traces`
- Write batch to `calculation_batches` with `rule_set_id` (not plan_id)

### 10B: Lifecycle service migration

Migrate LifecycleService to Supabase:
- Read/write lifecycle state from `calculation_batches.lifecycle_state`
- Implement Rule 30: OFFICIAL+ states cannot be overwritten
- Implement supersession: re-running OFFICIAL period creates new batch, old → superseded
- On lifecycle transition, trigger `entity_period_outcomes` materialization

### 10C: Entity period outcomes materialization

After each lifecycle transition:
1. Read all calculation_results for affected entities in this batch
2. For each entity, check all rule_set_assignments — are there results from other rule sets?
3. Aggregate: per-rule-set breakdown, total_payout, lowest_lifecycle_state
4. Write/update entity_period_outcomes

### 10D: Calculation engine — entity_id rename

The calculation engine itself references `employee_id` internally. Rename ALL internal references:
- `employee_id` → `entity_id`
- `employee_name` → `entity_name` (or `display_name`)
- `employee_count` → `entity_count`
- `employeeId` → `entityId` (camelCase in TypeScript)
- Any ICM-specific metric names in engine code must become configurable, not hardcoded

**Commit:** `OB-42 Phase 10: Calculation engine migration — Supabase, lifecycle immutability, outcomes materialization`

---

## PHASE 11: UI COMPONENT MIGRATION — GLOBAL RENAME

### 11A: Bulk rename in ALL UI components

This is the largest phase. Every component that displays or references employees, plans, commissions must be updated:

```bash
# Find all files that need updating
grep -rn "employee\|Employee\|compensation_plan\|CompensationPlan\|plan_id\|planId" \
  web/src/app/ web/src/components/ --include="*.tsx" --include="*.ts" | wc -l
```

Rename strategy:
- `employee` → `entity` in data/service layers
- Display labels remain configurable — if the domain is 'compensation', the UI CAN show "Employee" as a label, but the code variable must be `entity`
- `CompensationPlan` type → `RuleSet` type
- `plan_id` → `rule_set_id` in all queries and props
- `commission` / `payout` in code → `outcome` (display labels are domain-driven)

### 11B: All components use async data loading

Every page that previously read from localStorage must now:
1. Use Supabase client
2. Show loading state while fetching
3. Handle errors with error boundaries
4. Respect scope from profile_scope (only show data the user is allowed to see)

### 11C: Capabilities-based UI rendering

Components check `capabilities` from the user's profile:
- `view_outcomes` — can see calculation results
- `approve_outcomes` — can approve batches
- `export_results` — can export data
- `manage_rule_sets` — can edit rule sets
- `manage_assignments` — can reassign entities
- `design_scenarios` — can use sandbox

Buttons/actions hidden if the user lacks the capability.

**Commit:** `OB-42 Phase 11: UI component migration — global rename, async loading, capabilities-based rendering`

---

## PHASE 12: DEMO SEED AND VERIFICATION

### 12A: Demo seed script

Create `web/supabase/seed.sql` that populates:
- 1 demo tenant with hierarchy_labels and entity_type_labels
- 3 demo profiles: VL Admin (platform scope), Sofia Chen (tenant admin), Diego Moctezuma (team scope with entity link)
- Demo entities: at least 10 individuals + 2 locations + 1 organization
- Demo entity_relationships: reporting chain, works_at, member_of
- 1 demo rule_set with 5-layer structure from RetailCGMX interpretation
- Demo rule_set_assignments linking entities to rule set
- Demo periods (2024-01 through 2024-03)
- Demo committed_data for at least 10 entities
- Materialized period_entity_state, profile_scope, entity_period_outcomes for demo data

### 12B: Verification

Run the full pipeline:
1. Load demo seed
2. Log in as VL Admin — verify tenant-level visibility
3. Log in as Sofia — verify admin capabilities
4. Log in as Diego — verify scoped visibility (only sees his team)
5. Run calculation on demo data — verify results write to Supabase
6. Verify lifecycle transitions work with immutability (OFFICIAL cannot roll back)
7. Verify entity_period_outcomes materializes after lifecycle transition

### 12C: Korean Test

```bash
# Zero hardcoded field names in service layer
grep -rn "'employee'\|'Employee'\|'commission'\|'Commission'\|'compensation'\|'Compensation'" \
  web/src/lib/ --include="*.ts" | grep -v "// domain label\|domain.*compensation\|entity_type_labels"

# Zero hardcoded hierarchy labels
grep -rn "'Manager'\|'Zone'\|'Store'\|'Branch'\|'Region'" \
  web/src/lib/ --include="*.ts" | grep -v "// configurable\|labels\|type.*labels"
```

Both greps must return zero results (excluding labeled domain configuration).

**Commit:** `OB-42 Phase 12: Demo seed, verification, Korean Test`

---

## PHASE 13: CLEANUP AND CLOSING

### 13A: Remove ALL localStorage usage

```bash
# Verify zero localStorage references remain (except Supabase's own auth storage)
grep -rn "localStorage" web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|supabase"
```

Must return zero results.

### 13B: Remove old service files

Delete:
- `web/src/lib/compensation/plan-storage.ts` (replaced by rule-set-service.ts)
- Any other localStorage-based services that have been fully migrated
- Old type definitions that reference `CompensationPlan`, `employee_id`

### 13C: Build verification

```bash
cd web
rm -rf .next
npm run build
```

Must complete with zero TypeScript errors.

### 13D: Closing sequence

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must succeed
4. `npm run dev`
5. Verify localhost:3000 responds
6. Create completion report

**Commit:** `OB-42 Phase 13: Cleanup — remove localStorage, delete old services, final build`

---

## HARD GATES

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| HG-1 | Phase 0 reconnaissance documented with grep counts for employee_id, compensation_plans, plan_id, localStorage references. | | |
| HG-2 | Supabase client and server utilities created. Database types file covers all 23 tables. | | |
| HG-3 | SQL migrations create all 23 tables with RLS enabled on every table. | | |
| HG-4 | `entities` table exists with temporal attributes JSONB, entity_type, external_id, profile_id FK. | | |
| HG-5 | `entity_relationships` table exists with confidence, evidence, source, context, effective dates. | | |
| HG-6 | `reassignment_events` table exists with credit_model, transition_window, impact_preview. | | |
| HG-7 | Three materialization tables exist: period_entity_state, profile_scope, entity_period_outcomes. | | |
| HG-8 | `rule_sets` table has 5-layer JSONB decomposition (population_config, input_bindings, components, cadence_config, outcome_config). | | |
| HG-9 | `calculation_batches` has superseded_by, supersedes, batch_type for Rule 30 compliance. | | |
| HG-10 | Auth uses Supabase Auth — not demo localStorage auth. Session persists across page refresh. | | |
| HG-11 | EntityService exists with CRUD, temporal attribute resolution, and graph traversal. | | |
| HG-12 | RuleSetService replaces PlanService. All async. Zero references to PlanService remain. | | |
| HG-13 | DataLayerService reads/writes Supabase. Entity auto-creation on import. | | |
| HG-14 | CalculationOrchestrator reads from period_entity_state, writes to calculation_results with entity_id UUID FK. | | |
| HG-15 | LifecycleService enforces Rule 30: OFFICIAL→PREVIEW transition blocked. Supersession creates new batch. | | |
| HG-16 | entity_period_outcomes materializes on lifecycle transition with per-rule-set breakdown and lowest_lifecycle_state. | | |
| HG-17 | Zero references to `employee_id` in TypeScript code (grep returns 0). | | |
| HG-18 | Zero references to `compensation_plans` or `CompensationPlan` in TypeScript code. | | |
| HG-19 | Zero references to `plan_id` or `planId` in TypeScript code (except as historical comments). | | |
| HG-20 | Zero localStorage usage in application code (excluding Supabase auth internals). | | |
| HG-21 | Korean Test: zero hardcoded English field names or hierarchy labels in service/lib code. | | |
| HG-22 | Demo seed populates all tables. Application loads and displays data from Supabase. | | |
| HG-23 | `npm run build` succeeds with zero TypeScript errors. | | |
| HG-24 | localhost:3000 responds after final build. | | |

## SOFT GATES

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| SG-1 | profile_scope materialization runs and populates visibility arrays for demo profiles. | | |
| SG-2 | Capabilities-based UI rendering: buttons hidden when user lacks capability. | | |
| SG-3 | Entity relationship graph traversal returns correct scope for Diego (team-scoped user). | | |
| SG-4 | Tenant isolation verified: query with wrong tenant_id returns zero rows. | | |
| SG-5 | Period entity state materialization produces flat resolved attributes from temporal history. | | |
| SG-6 | Rule set 5-layer JSONB populated from demo data with at least components and cadence_config. | | |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-42_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria (copy the EXACT wording from the HARD GATES table above) with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## KEY FILES REFERENCE

| Purpose | Current File | New File |
|---------|-------------|----------|
| Plan/Rule Set Service | `web/src/lib/compensation/plan-storage.ts` | `web/src/lib/rule-sets/rule-set-service.ts` |
| Calculation Engine | `web/src/lib/compensation/calculation-engine.ts` | `web/src/lib/calculation/calculation-engine.ts` |
| Calculation Orchestrator | `web/src/lib/orchestration/calculation-orchestrator.ts` | Same path, migrated to Supabase |
| Data Layer | `web/src/lib/data-architecture/data-layer-service.ts` | Same path, migrated to Supabase |
| Auth Context | `web/src/contexts/auth-context.tsx` | Same path, rewritten for Supabase Auth |
| Entity Service | (new) | `web/src/lib/entities/entity-service.ts` |
| Relationship Service | (new) | `web/src/lib/entities/relationship-service.ts` |
| Scope Service | (new) | `web/src/lib/entities/scope-service.ts` |
| Period Service | (new) | `web/src/lib/periods/period-service.ts` |
| Supabase Client | (new) | `web/src/lib/supabase/client.ts` |
| Supabase Server | (new) | `web/src/lib/supabase/server.ts` |
| Database Types | (new) | `web/src/lib/supabase/database.types.ts` |
| SQL Migrations | (new) | `web/supabase/migrations/001-004_*.sql` |
| Demo Seed | (new) | `web/supabase/seed.sql` |

---

## ESTIMATED EFFORT

This is the largest single OB in ViaLuce history. 13 phases, estimated 30-40 hours of CC execution time.

| Phase | Estimated Hours |
|-------|----------------|
| 0: Reconnaissance | 0.5 |
| 1: Supabase setup | 1 |
| 2: Core schema | 2 |
| 3: Rule sets + periods | 1.5 |
| 4: Data + calculation tables | 2 |
| 5: Materialization tables | 1 |
| 6: Auth migration | 3 |
| 7: Entity + relationship services | 4 |
| 8: Rule set service | 3 |
| 9: Data layer migration | 4 |
| 10: Calculation engine migration | 4 |
| 11: UI global rename | 6 |
| 12: Demo seed + verification | 3 |
| 13: Cleanup + closing | 2 |
| **Total** | **37 hours** |

If this is too large for a single CC session, it can be split into two batches:
- **OB-42A:** Phases 0-5 (Schema foundation — tables, types, migrations)
- **OB-42B:** Phases 6-13 (Service migration, UI rename, verification)

The split point is after Phase 5 because the schema must exist before any service can be migrated.

---

*ViaLuce.ai — The Way of Light*
*OB-42: Entity Model and Supabase Migration*
*February 2026*
*"The paradigm shift. From localStorage to a relationship graph. From employees to entities. From compensation plans to rule sets. From flat files to an organizational nervous system."*
