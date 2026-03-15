# HF-134: MULTI-TENANT RLS AUDIT + FIX

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative table/column reference (34 tables)
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md` — 10-gate checklist

**If you have not read all three files, STOP and read them now.**

---

## WHY THIS HF EXISTS

CLT-166 found the Locations page showing Mexican data for an Ecuadorian tenant (BCL). This is a data isolation failure — the most serious class of bug in a multi-tenant platform. If one tenant can see another tenant's data, the platform is unshippable.

Multi-tenant data isolation has NEVER been systematically tested (documented in Open Items #10 since February 15, 2026). We have 4+ active tenants (BCL, Meridian, Pipeline Test Co, Caribe Financial) sharing one Supabase database. Every table with `tenant_id` must have RLS policies that enforce isolation.

This HF audits every table, verifies or creates RLS policies, and proves isolation with cross-tenant queries.

**Mission Control items addressed: MC#5 (P0), MC#42 (P0)**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **ZERO application code changes unless a specific leak is found.** This is primarily a database policy audit.

---

## CRITICAL CONTEXT

### Tenants in Production

| Tenant | ID | Key Data |
|--------|----|----------|
| BCL (Banco Cumbre del Litoral) | b1c2d3e4-aaaa-bbbb-cccc-111111111111 | 85 entities, Ecuador, USD |
| Meridian Logistics | (query to find) | 67 entities, Mexico, MXN |
| Pipeline Test Co | (query to find) | 719 entities, Mexico, MXN |
| Caribe Financial | a630404c-0777-4f6d-b760-b8a190ecd63c | 25 entities, USD |
| Óptica Luminar | a1b2c3d4-e5f6-7890-abcd-ef1234567890 | Cleaned (0 data) |

### VL Admin

- Email: platform@vialuce.com
- UUID: 9c179b53-c5ee-4af7-a36b-09f5db3e35f2
- Role: 'platform'
- tenant_id: NULL
- **VL Admin must see ALL tenants.** VL Admin must survive all policy changes.

### RLS Design Pattern (Decision 2 from MDS v2)

```sql
-- Standard tenant isolation policy
CREATE POLICY "tenant_isolation" ON {table_name}
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR
    (SELECT role FROM profiles WHERE auth_user_id = auth.uid()) = 'platform'
  );
```

**CRITICAL:** The profiles table uses `auth_user_id` NOT `id` for matching `auth.uid()`. This was a root cause in HF-085 (Rule 13). Every policy must use `auth_user_id = auth.uid()`, NOT `id = auth.uid()`.

### All 34 Tables (from SCHEMA_REFERENCE_LIVE.md)

Tables WITH tenant_id (need RLS):
```
agent_inbox, alias_registry, approval_requests, audit_logs,
calculation_batches, calculation_results, calculation_traces,
classification_signals, committed_data, disputes,
entities, entity_period_outcomes, entity_relationships,
import_batches, ingestion_configs, ingestion_events,
period_entity_state, periods, profile_scope, profiles,
reassignment_events, reconciliation_sessions, reference_data,
reference_items, rule_set_assignments, rule_sets,
synaptic_density, usage_metering, user_journey
```

Tables WITHOUT tenant_id (global/platform-level):
```
domain_patterns, foundational_patterns, platform_events,
platform_settings, tenants
```

The `tenants` table itself needs special handling — VL Admin sees all, tenant users see only their own.

---

## PHASE 0: AUDIT — WHAT RLS POLICIES EXIST TODAY (Zero Code Changes)

### 0A: Query All Existing RLS Policies

Run this in Supabase SQL Editor. Paste the COMPLETE output.

```sql
-- List all tables and their RLS status
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

```sql
-- List all RLS policies with their definitions
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual::text as using_clause,
  with_check::text as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### 0B: Classify Each Table

From the query results, classify every table into one of four categories:

| Category | Meaning | Action |
|----------|---------|--------|
| ✅ SECURED | RLS enabled + correct tenant isolation policy | No action |
| ⚠️ ENABLED BUT WRONG | RLS enabled but policy uses `id = auth.uid()` instead of `auth_user_id = auth.uid()` | Fix policy |
| ❌ ENABLED NO POLICY | RLS enabled but no policy exists (blocks ALL access) | Add policy |
| 🔴 NOT ENABLED | RLS not enabled (NO isolation) | Enable + add policy |

### 0C: Cross-Tenant Leak Test

As Patricia (BCL admin), run these queries through the application's Supabase client (NOT service role). The service role bypasses RLS. You need to test as an authenticated user.

```sql
-- These should return ONLY BCL data when authenticated as Patricia

-- Test 1: entities
SELECT COUNT(*), tenant_id FROM entities GROUP BY tenant_id;
-- EXPECTED: Only b1c2d3e4-aaaa-bbbb-cccc-111111111111 with count 85

-- Test 2: calculation_results
SELECT COUNT(*), tenant_id FROM calculation_results GROUP BY tenant_id;
-- EXPECTED: Only BCL tenant_id

-- Test 3: committed_data
SELECT COUNT(*), tenant_id FROM committed_data GROUP BY tenant_id;
-- EXPECTED: Only BCL tenant_id

-- Test 4: rule_sets
SELECT COUNT(*), tenant_id FROM rule_sets GROUP BY tenant_id;
-- EXPECTED: Only BCL tenant_id

-- Test 5: periods
SELECT COUNT(*), tenant_id FROM periods GROUP BY tenant_id;
-- EXPECTED: Only BCL tenant_id
```

**If ANY query returns rows from multiple tenants, that table has a leak.**

### 0D: Identify the Locations Page Data Source

The CLT-166 finding was specifically about the Locations page showing Mexican data for BCL. Find:

```bash
# Find the Locations page
find web/src/app -path "*location*" -name "page.tsx" -o -path "*location*" -name "*.tsx" | sort

# Find what table it queries
grep -rn "supabase\|from(" web/src/app/*location*/*.tsx 2>/dev/null | head -20
grep -rn "supabase\|from(" web/src/components/*location*/*.tsx 2>/dev/null | head -20
```

The Locations page likely queries a table that either:
- Has no RLS policy (data from all tenants returned)
- Uses the wrong RLS policy (id instead of auth_user_id)
- Queries without tenant_id filter in the application code

Document which case applies.

**Commit:** `git add -A && git commit -m "HF-134 Phase 0: RLS audit — all tables classified" && git push origin dev`

---

## PHASE 1: FIX — APPLY CORRECT RLS POLICIES

### 1A: Standard Policy Template

For every table with `tenant_id` that is missing or has an incorrect policy, apply:

```sql
-- Enable RLS if not already enabled
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- Drop any existing incorrect policies
DROP POLICY IF EXISTS "tenant_isolation" ON {table_name};
DROP POLICY IF EXISTS "tenant_access" ON {table_name};
DROP POLICY IF EXISTS "{any_other_policy_name}" ON {table_name};

-- Create correct policy
-- NOTE: auth_user_id, NOT id. This is Standing Rule 13.
CREATE POLICY "tenant_isolation" ON {table_name}
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'platform'
    )
  );
```

**Why `IN` instead of `=`:** A user may have profiles in multiple tenants (unlikely now, but architecturally correct). The `IN` handles this. The `OR EXISTS` clause ensures VL Admin (role='platform', tenant_id NULL) can access all data.

**Why `auth_user_id = auth.uid()`:** profiles.id is the profile UUID. auth.uid() returns the Supabase Auth UUID. They are DIFFERENT columns. This was the HF-085 root cause. Standing Rule 13.

### 1B: Special Cases

**profiles table:**
```sql
-- Users see their own profile + profiles in their tenant + platform sees all
CREATE POLICY "profile_access" ON profiles
  FOR ALL USING (
    auth_user_id = auth.uid()
    OR tenant_id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'platform'
    )
  );
```

**tenants table:**
```sql
-- Users see their own tenant + platform sees all
CREATE POLICY "tenant_access" ON tenants
  FOR ALL USING (
    id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'platform'
    )
  );
```

**Tables without tenant_id (domain_patterns, foundational_patterns, platform_events, platform_settings):**
```sql
-- Platform-only tables: only platform role can access
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_only" ON {table_name}
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'platform'
    )
  );
```

**Exception: domain_patterns and foundational_patterns** may need read access for all authenticated users (they feed the flywheel). If so:
```sql
CREATE POLICY "read_all_write_platform" ON {table_name}
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Separate INSERT/UPDATE policy for platform only
CREATE POLICY "write_platform" ON {table_name}
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'platform')
  );
```

### 1C: Execute All Policies

Execute the policies in Supabase SQL Editor. For each table, paste the executed SQL and verify with:

```sql
-- After each policy creation, verify it exists
SELECT policyname, cmd, qual::text
FROM pg_policies
WHERE tablename = '{table_name}' AND schemaname = 'public';
```

### 1D: Storage Bucket Policies

Check RLS on Supabase Storage (the ingestion-raw bucket):

```sql
-- List storage policies
SELECT * FROM storage.policies WHERE bucket_id = 'ingestion-raw';
```

Verify that storage policies also enforce tenant isolation. Files uploaded by BCL admin should not be readable by Meridian admin.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | All 34 tables classified | Phase 0 output shows category for each |
| PG-2 | All tables with tenant_id have RLS enabled | `rowsecurity = true` for all |
| PG-3 | All policies use `auth_user_id = auth.uid()` | Zero policies using `id = auth.uid()` |
| PG-4 | VL Admin policy clause present on every table | `role = 'platform'` in policy for each |
| PG-5 | Policies executed and verified | pg_policies query confirms each |
| PG-6 | `npm run build` exits 0 | No app code changes should be needed, but verify |

**Commit:** `git add -A && git commit -m "HF-134 Phase 1: RLS policies applied to all 34 tables" && git push origin dev`

---

## PHASE 2: VERIFY — CROSS-TENANT ISOLATION PROOF

### 2A: Authenticated User Test (BCL Admin)

Login as Patricia (BCL admin) in the browser. Open browser DevTools → Console. Run these queries through the Supabase client:

```javascript
// In browser console, get the supabase client
// This uses Patricia's auth token, so RLS applies

// Test entities
const { data: entities, error: e1 } = await supabase.from('entities').select('tenant_id').limit(5);
console.log('Entities:', entities?.map(e => e.tenant_id), e1);
// EXPECTED: All tenant_ids = BCL UUID

// Test calculation_results
const { data: results, error: e2 } = await supabase.from('calculation_results').select('tenant_id').limit(5);
console.log('Results:', results?.map(r => r.tenant_id), e2);
// EXPECTED: All tenant_ids = BCL UUID

// Test periods
const { data: periods, error: e3 } = await supabase.from('periods').select('tenant_id').limit(10);
console.log('Periods:', periods?.map(p => p.tenant_id), e3);
// EXPECTED: All tenant_ids = BCL UUID

// Test rule_sets
const { data: rules, error: e4 } = await supabase.from('rule_sets').select('tenant_id').limit(5);
console.log('Rules:', rules?.map(r => r.tenant_id), e4);
// EXPECTED: All tenant_ids = BCL UUID
```

**If any query returns data from a different tenant, the fix failed.**

### 2B: Authenticated User Test (Meridian Admin)

Switch to Meridian admin. Run the same queries. Verify all results are Meridian tenant_id only.

### 2C: VL Admin Test

Login as VL Admin (platform@vialuce.com). Run:

```javascript
// VL Admin should see ALL tenants
const { data: entities, error } = await supabase.from('entities').select('tenant_id');
const tenantIds = [...new Set(entities?.map(e => e.tenant_id))];
console.log('Distinct tenant_ids visible to VL Admin:', tenantIds.length, tenantIds);
// EXPECTED: Multiple tenant_ids (BCL, Meridian, Pipeline Test, etc.)
```

### 2D: Locations Page Verification

Navigate to the Locations page as BCL admin. Verify it shows ONLY BCL/Ecuadorian data, NOT Mexican data.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-7 | BCL admin sees only BCL data | All 4 queries return single tenant_id |
| PG-8 | Meridian admin sees only Meridian data | All 4 queries return single tenant_id |
| PG-9 | VL Admin sees all tenants | Multiple tenant_ids in results |
| PG-10 | Locations page shows correct tenant data | BCL admin sees Ecuador, not Mexico |
| PG-11 | No new console errors | Browser console clean |

**Commit:** `git add -A && git commit -m "HF-134 Phase 2: Cross-tenant isolation verified" && git push origin dev`

---

## PHASE 3: APPLICATION CODE CHECK

### 3A: Find Queries Without tenant_id Filter

Even with RLS as the safety net, application code should also filter by tenant_id (defense in depth). Find any queries that DON'T include tenant_id:

```bash
# Find all Supabase .from() calls that don't include .eq('tenant_id'
grep -rn "\.from(" web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v "node_modules" | \
  grep -v ".eq('tenant_id'" | \
  grep -v "// " | \
  grep -v "profiles" | \
  grep -v "tenants" | \
  head -40
```

### 3B: Assess Risk

For each query found without tenant_id filter:
- Is RLS protecting it? (Yes if table has correct policy)
- Should application code also filter? (Yes for defense in depth)
- Is this a server-side query using service role? (Service role bypasses RLS — MUST have tenant_id filter)

**CRITICAL:** Any query using `SUPABASE_SERVICE_ROLE_KEY` (server-side) BYPASSES RLS entirely. These MUST have explicit `.eq('tenant_id', tenantId)` filters. Find them:

```bash
# Find service role client usage
grep -rn "SERVICE_ROLE\|service.role\|createClient.*service" web/src/ --include="*.ts" --include="*.tsx" | head -20

# Find API routes that might use service role
grep -rn "service" web/src/app/api/ --include="*.ts" -l
```

Document all service-role queries and whether they filter by tenant_id.

### 3C: Fix Application Code (If Needed)

If any service-role queries are missing tenant_id filters, add them. This is the ONLY phase that may produce application code changes.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-12 | Service-role queries identified | List with tenant_id filter status |
| PG-13 | All service-role queries filter by tenant_id | Zero unfiltered service-role queries |
| PG-14 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-134 Phase 3: Application code defense-in-depth check" && git push origin dev`

---

## PHASE 4: COMPLETION REPORT + PR

### 4A: Completion Report

Create `HF-134_COMPLETION_REPORT.md` at project root:

```markdown
# HF-134: Multi-Tenant RLS Audit + Fix — Completion Report

## Status: [COMPLETE / PARTIAL / FAILED]

## Phase 0: Audit
- Tables with RLS enabled: [N/34]
- Tables with correct policies: [N]
- Tables with wrong policies (id vs auth_user_id): [N] — [list]
- Tables with no policies: [N] — [list]
- Tables with RLS not enabled: [N] — [list]
- Locations page data source: [table, query method]
- Locations page root cause: [description]

## Phase 1: Fix
- Policies created/updated: [N]
- Tables affected: [list]
- VL Admin clause verified on all: [YES/NO]
- Storage bucket policies verified: [YES/NO]

## Phase 2: Cross-Tenant Verification
- BCL admin sees only BCL: [YES/NO]
- Meridian admin sees only Meridian: [YES/NO]
- VL Admin sees all tenants: [YES/NO] — [N] distinct tenant_ids
- Locations page fixed: [YES/NO]

## Phase 3: Application Code
- Service-role queries found: [N]
- Service-role queries without tenant_id filter: [N] — [list]
- Fixes applied: [N]

## Proof Gates Summary
[PG-1 through PG-14: PASS/FAIL for each]
```

### 4B: Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-134: Multi-Tenant RLS Audit — Tenant Data Isolation Verified" \
  --body "## What This Fixes

### Data Isolation (P0)
- Audited all 34 tables for RLS policies
- Fixed [N] tables with missing or incorrect policies
- All policies use auth_user_id = auth.uid() (Standing Rule 13)
- VL Admin (role=platform) access preserved on all tables
- Cross-tenant isolation verified: BCL sees only BCL, Meridian sees only Meridian
- Locations page fixed (CLT-166)

### Defense in Depth
- Service-role queries audited for tenant_id filtering
- [N] queries fixed

## Proof Gates: see HF-134_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "HF-134 Phase 4: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge)

After merging PR and Vercel deploys:

### Step 1: BCL Isolation
1. Login as Patricia (BCL admin) at vialuce.ai
2. Navigate to Locations page — confirm Ecuador data only, no Mexican data
3. Navigate to /stream — confirm $44,590 (BCL data only)
4. Navigate to /operate/calculate — confirm only BCL periods visible

### Step 2: Meridian Isolation
1. Switch to Meridian tenant
2. Navigate to /stream — confirm MX$185,063 (Meridian data only)
3. No BCL data visible anywhere

### Step 3: VL Admin Cross-Tenant
1. Login as VL Admin (platform@vialuce.com)
2. Confirm ability to switch between tenants
3. Confirm data changes per tenant selection

### Step 4: Read-Only Verification
```sql
-- Verify RLS is enabled on all public tables (READ ONLY)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- EXPECTED: rowsecurity = true for ALL rows
```

**ZERO data-modifying SQL in these steps.** RLS policies were applied in Phase 1; production verification is read-only.

---

*HF-134 — March 14, 2026*
*"If one tenant can see another tenant's data, nothing else matters."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
