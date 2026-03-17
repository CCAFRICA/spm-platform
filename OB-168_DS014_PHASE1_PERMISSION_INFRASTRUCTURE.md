# OB-168: DS-014 Phase 1 — Permission Infrastructure + BCL Plan Import Unblock
# Classification: OB (Operational Build)
# Implements: Decision 126 (DS-014 Access Control Architecture), Phase 1
# Date: March 13, 2026
# PR Target: dev → main

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I." NEVER pause for confirmation. Execute every phase sequentially. If a phase fails after 3 attempts, document the failure, skip to the next phase, and note it in the completion report.

---

## CC_STANDING_ARCHITECTURE_RULES.md

**READ THE FILE `CC_STANDING_ARCHITECTURE_RULES.md` IN THE PROJECT ROOT BEFORE EXECUTING ANY PHASE.** All rules in that file apply to this OB. Key rules reinforced for this OB:

### Git & Build
1. Commit + push after EVERY phase.
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds.
3. Final step: `gh pr create --base main --head dev`
4. Git from repo root (`spm-platform`), NOT from `web/`.

### Supabase
6. Migrations MUST execute live AND verify with DB query. File existence ≠ applied.
9. Every table the pipeline writes to must have VL Admin INSERT/UPDATE policies.

### Proof Gates
15. RENDERED output, not file existence.
16. LIVE database state, not migration file committed.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### Completion Report (Rules 25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output.
28. One commit per phase.

---

## SCHEMA REFERENCE (AUTHORITATIVE — from SCHEMA_REFERENCE_LIVE.md)

### profiles table (LIVE)
```
id              uuid    NOT NULL  DEFAULT uuid_generate_v4()
tenant_id       uuid    YES       (NULL for platform role)
auth_user_id    uuid    NOT NULL
display_name    text    NOT NULL
email           text    NOT NULL
role            text    NOT NULL  DEFAULT 'viewer'
capabilities    jsonb   NOT NULL
locale          text    YES
avatar_url      text    YES
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```

**CRITICAL:** `profiles.role` is unconstrained TEXT. Current production values: 'platform', 'admin', 'viewer', 'manager', 'individual'. There is NO enum, NO check constraint. The `capabilities` field is JSONB but unused in production.

**CRITICAL:** `profiles.id ≠ auth.uid()`. Use `auth_user_id` to link profiles to auth users. Standing Rule 13.

### VL Admin
- Email: platform@vialuce.com
- UUID: 9c179b53-c5ee-4af7-a36b-09f5db3e35f2
- Role: 'platform'
- tenant_id: NULL
- **Must survive ALL destructive operations.**

### BCL Tenant
- Tenant ID: b1c2d3e4-aaaa-bbbb-cccc-111111111111
- Admin: Patricia Zambrano (profiles.role = 'admin')
- Current state: NO rule_sets (deleted). 85 entities. 170 committed_data rows. 85 stale calculation_results.
- Plan import BLOCKED by storage RLS on `ingestion-raw` bucket.

---

## WHAT THIS OB DOES

Implements DS-014 Phase 1: creates the unified permission infrastructure, fixes the storage RLS that blocks Patricia's plan import, replaces RequireRole with RequireCapability, and consolidates middleware to capability-based routing.

**This is a vertical slice:** permission infrastructure + storage fix + middleware fix + page-level fix + navigation fix + browser verification. One PR.

---

## CLT FINDINGS THIS OB MUST ADDRESS

| Finding | Description | How This OB Fixes It |
|---------|-------------|---------------------|
| CLT118-F1 | Calculate Access Restricted for admin | Capability-based middleware replaces role array |
| CLT165-F06 | tenant-config 403 persists | API route checks hasCapability, not hardcoded role |
| CLT166-F05 | Calculate Access Restricted for admin (post-wipe) | Same as CLT118-F1 |
| CLT167-F01 | Plan import Access Restricted via sidebar | data.import capability replaces role array |
| CLT167-F02 | Pipeline Readiness Import Plan button → blocked route | ALL navigation paths audited, not just sidebar |
| CLT167-F03 | /operate/import/enhanced crashes (React #318) | Route consolidation — one import path |
| CLT167-F04 | Multiple import paths violate Decision 77 | Consolidate to single /operate/import path |
| CLT167-F05 | Storage RLS blocks tenant admin file upload | Storage bucket policy updated for admin role |
| CLT167-F06 | SCI classifies plan but cannot execute (no file) | Consequence of F05 — fixed by storage fix |

---

## CC FAILURE PATTERNS TO PREVENT (from documented history)

| # | Pattern | How to Prevent in This OB |
|---|---------|--------------------------|
| FP-49 | SQL Schema Fabrication — SQL referencing nonexistent columns | VERIFY every column name against SCHEMA REFERENCE above before writing ANY SQL |
| FP-69 | Fix one access block, leave others | Phase 1 creates the COMPLETE capability matrix FIRST. Phase 2-5 enforce it EVERYWHERE. Do not fix individual routes. |
| FP-70 | Phase deferral as completion | ALL phases are mandatory. If a phase is deferred, this OB is INCOMPLETE. |
| FP-71 | Button gate blocks API self-healing | RequireCapability and API both use the same permissions.ts. If the button shows, the API must accept. |
| FP-72 | Sidebar fix ≠ in-page button fix | Phase 4 audits ALL code paths to import (sidebar, Pipeline Readiness button, direct URL). Every path must work. |
| FP-21 | Dual code path | Single permissions.ts. No duplicate permission logic anywhere. |
| FP-22 | RLS silent swallow | After storage policy update, verify with actual upload test, not just SQL execution success. |
| FP-66 | Seeding instead of importing | Do NOT seed BCL plan data. The plan must be imported through the browser by Patricia. |

---

## PHASE 0: DIAGNOSTIC — ZERO CODE CHANGES

**Goal:** Map the current state. Understand what exists before changing anything.

### 0A: List all permission-related files
```bash
grep -rn "RequireRole\|useCanPerform\|RESTRICTED_WORKSPACES\|role.*===\|role.*!==\|allowedRoles\|requiredRoles" web/src/ --include="*.ts" --include="*.tsx" -l
```
Paste the full output.

### 0B: List current middleware role checks
```bash
grep -A5 "RESTRICTED_WORKSPACES" web/src/middleware.ts
```
Paste the full output.

### 0C: List all RequireRole usages
```bash
grep -rn "RequireRole" web/src/ --include="*.tsx" --include="*.ts"
```
Paste the full output.

### 0D: List storage bucket policies
```bash
# Run in Supabase SQL Editor:
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
ORDER BY tablename, policyname;
```
Paste the full output. **This is the root cause of CLT167-F05.**

### 0E: List current role values in production
```bash
SELECT role, COUNT(*) FROM profiles GROUP BY role ORDER BY role;
```
Paste the full output.

### 0F: Verify BCL tenant state
```bash
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%banco%' OR slug LIKE '%bcl%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id) as committed_data,
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as calc_results,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignments
FROM t;
```
Paste the full output.

### 0G: Map ALL import-related routes and buttons
```bash
grep -rn "plan-import\|import/enhanced\|/operate/import\|/data/import\|Pipeline.*Readiness\|Import.*Plan" web/src/ --include="*.ts" --include="*.tsx" -l
```
Paste the full output. This maps the fragmented import paths (CLT167-F04).

**Commit:** `git add -A && git commit -m "OB-168 Phase 0: Permission diagnostic — zero code changes" && git push origin dev`

---

## PHASE 1: CREATE permissions.ts — THE SINGLE SOURCE OF TRUTH

**Goal:** Create `web/src/lib/auth/permissions.ts` with the complete capability matrix from DS-014 Decision 126.

### Requirements:
1. Define `Role` type: `'platform' | 'admin' | 'manager' | 'member' | 'viewer'`
2. Define `Capability` type as a string union of ALL capabilities from DS-014 Section 4.2
3. Define `ROLE_CAPABILITIES` as `Record<Role, Set<Capability>>` — explicit mapping, NO inheritance
4. Export `hasCapability(role: string, capability: Capability, tenantOverrides?: TenantPermissionOverrides): boolean`
5. Export `getCapabilities(role: string, tenantOverrides?: TenantPermissionOverrides): Set<Capability>`
6. Export `CANONICAL_ROLES: readonly Role[]` for validation
7. Handle unknown role strings gracefully — return false/empty set, never throw
8. Handle `'vl_admin'` and `'tenant_admin'` as aliases: map to `'platform'` and `'admin'` respectively
9. Handle `'individual'` and `'sales_rep'` as aliases: map to `'member'`

### Capability list (from DS-014):
```
Platform: platform.provision_tenant, platform.view_all_tenants, platform.access_observatory, platform.system_config
Tenant: tenant.manage_users, tenant.configure_periods, tenant.configure_entities, tenant.view_settings, tenant.edit_settings
Data: data.import, data.upload_storage, data.calculate, data.advance_lifecycle, data.reconcile, data.approve_results, data.export
View: view.all_results, view.team_results, view.own_results, view.intelligence_stream, view.all_entities, view.team_entities, view.audit_trail
Dispute: dispute.submit, dispute.resolve
Statement: statement.view
ICM: icm.configure_plans, icm.view_plan_details, icm.simulate
```

### CRITICAL — ROLE ALIAS MAPPING:
```typescript
function resolveRole(role: string): Role | null {
  const ROLE_ALIASES: Record<string, Role> = {
    'platform': 'platform',
    'vl_admin': 'platform',    // RETIRED alias
    'admin': 'admin',
    'tenant_admin': 'admin',   // RETIRED alias
    'manager': 'manager',
    'member': 'member',
    'individual': 'member',    // Korean Test rename
    'sales_rep': 'member',     // Korean Test rename
    'viewer': 'viewer',
  };
  return ROLE_ALIASES[role] ?? null;
}
```

**Commit:** `git add -A && git commit -m "OB-168 Phase 1: permissions.ts — single source of truth for DS-014" && git push origin dev`

---

## PHASE 2: CREATE RequireCapability COMPONENT

**Goal:** Replace RequireRole with RequireCapability. Do NOT delete RequireRole yet — create RequireCapability alongside it.

### File: `web/src/components/auth/RequireCapability.tsx`

```typescript
// Uses hasCapability from permissions.ts
// Reads role from AuthContext (useAuth hook)
// If hasCapability returns false, renders Unauthorized component
// If hasCapability returns true, renders children
// Handles loading state (role not yet resolved)
```

### ALSO create `useHasCapability` hook:
```typescript
// File: web/src/hooks/useHasCapability.ts
export function useHasCapability(capability: Capability): boolean {
  const { user } = useAuth();
  const role = user?.user_metadata?.role ?? user?.role ?? 'viewer';
  return hasCapability(role, capability);
}
```

### VERIFY: Both components compile. Import RequireCapability in one test page to confirm no build errors.

**Commit:** `git add -A && git commit -m "OB-168 Phase 2: RequireCapability component + useHasCapability hook" && git push origin dev`

---

## PHASE 3: FIX STORAGE BUCKET RLS — ROOT CAUSE OF PLAN IMPORT FAILURE

**Goal:** Update the `ingestion-raw` storage bucket INSERT policy to allow `admin` role, not just `platform`.

### 3A: Run the diagnostic SQL from Phase 0D to see current policies.

### 3B: Update the INSERT policy.

**CRITICAL:** The exact SQL depends on what Phase 0D reveals. The policy MUST:
1. Allow role IN ('platform', 'admin') to INSERT
2. Scope uploads to the user's tenant_id folder: `(storage.foldername(name))[1] = profiles.tenant_id::text`
3. NOT break existing platform-level uploads
4. NOT allow member/viewer/manager to upload

Expected pattern:
```sql
-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Allow platform uploads" ON storage.objects;

-- Create new policy allowing platform + admin
CREATE POLICY "Allow authorized uploads" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'ingestion-raw'
  AND (SELECT role FROM profiles WHERE auth_user_id = auth.uid()) IN ('platform', 'admin')
  AND (
    (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()) IS NULL  -- platform (no tenant)
    OR (storage.foldername(name))[1] = (SELECT tenant_id::text FROM profiles WHERE auth_user_id = auth.uid())
  )
);
```

**ADJUST THIS SQL based on what Phase 0D actually reveals.** Do NOT blindly execute the above if the existing policy structure is different.

### 3C: VERIFY the policy was applied:
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
```
Paste the full output.

### 3D: Also check for SELECT policies — admin must be able to READ files they uploaded:
Verify that a SELECT policy exists that allows admin to read from ingestion-raw with the same tenant scoping.

**Commit:** `git add -A && git commit -m "OB-168 Phase 3: Storage RLS fix — admin can upload to ingestion-raw" && git push origin dev`

---

## PHASE 4: UPDATE MIDDLEWARE — CAPABILITY-BASED ROUTING

**Goal:** Replace RESTRICTED_WORKSPACES role arrays with capability-based checks.

### 4A: In `web/src/middleware.ts`, replace:
```typescript
// OLD: static role arrays
const RESTRICTED_WORKSPACES: Record<string, string[]> = {
  '/admin': ['platform'],
  '/operate': ['platform', 'admin', 'tenant_admin'],
  // etc.
};
```

With:
```typescript
// NEW: workspace → required capability
import { hasCapability } from '@/lib/auth/permissions';

const WORKSPACE_CAPABILITIES: Record<string, string> = {
  '/admin': 'platform.system_config',
  '/operate': 'data.import',
  '/configure': 'tenant.edit_settings',
  '/perform': 'view.own_results',
  '/stream': 'view.intelligence_stream',
};
```

### 4B: Update the middleware check logic to use `hasCapability(role, requiredCapability)` instead of `allowedRoles.includes(role)`.

### 4C: Handle role aliases in middleware — the JWT `user_metadata.role` might contain 'vl_admin' or 'tenant_admin'. The `resolveRole` function in permissions.ts handles this.

### 4D: AUDIT ALL IMPORT PATHS (addresses CLT167-F02, CLT167-F04):
```bash
# Find every place that references a plan import route
grep -rn "plan-import\|import/enhanced\|ImportPlan\|Pipeline.*import\|launchPlanImport" web/src/ --include="*.ts" --include="*.tsx"
```
Every path that routes to import MUST use `/operate/import`. If any path routes to `/admin/launch/plan-import` or other deprecated paths, redirect them.

### 4E: VERIFY on localhost:
- Login as VL Admin (platform@vialuce.com) — can access /admin, /operate, /configure
- Login as BCL admin (Patricia) — can access /operate, /configure, CANNOT access /admin
- Sidebar shows only accessible routes for each role

**Commit:** `git add -A && git commit -m "OB-168 Phase 4: Capability-based middleware + import path consolidation" && git push origin dev`

---

## PHASE 5: REPLACE RequireRole ON ALL PAGES

**Goal:** Replace every RequireRole usage with RequireCapability.

### 5A: Using the grep from Phase 0C, replace each RequireRole instance:

| Current | New |
|---------|-----|
| `RequireRole roles={['vl_admin', 'admin']}` on calculate page | `RequireCapability capability="data.calculate"` |
| `RequireRole roles={['vl_admin', 'admin']}` on plan-import page | `RequireCapability capability="data.import"` |
| `RequireRole roles={['vl_admin', 'admin']}` on reconciliation page | `RequireCapability capability="data.reconcile"` |
| `RequireRole roles={['vl_admin']}` on admin pages | `RequireCapability capability="platform.system_config"` |
| `RequireRole roles={['vl_admin', 'admin']}` on results page | `RequireCapability capability="view.all_results"` |
| `RequireRole roles={['vl_admin', 'admin']}` on people page | `RequireCapability capability="view.all_entities"` |

### 5B: Update the `/api/platform/tenant-config` route to use `hasCapability` instead of hardcoded role check. This fixes CLT165-F06 (tenant-config 403).

### 5C: VERIFY no remaining RequireRole references:
```bash
grep -rn "RequireRole" web/src/ --include="*.tsx" --include="*.ts"
```
Should return ZERO results (or only the RequireRole component file itself, which we keep but deprecate).

**Commit:** `git add -A && git commit -m "OB-168 Phase 5: All pages migrated to RequireCapability" && git push origin dev`

---

## PHASE 6: NAVIGATION DERIVATION FROM CAPABILITIES

**Goal:** Sidebar shows only routes the user can access. No dead ends.

### 6A: Find the sidebar configuration:
```bash
grep -rn "sidebarItems\|navItems\|menuItems\|SidebarItem" web/src/ --include="*.ts" --include="*.tsx" -l
```

### 6B: Add a `requiredCapability` field to each sidebar item. Filter items using `hasCapability`.

### 6C: VERIFY: Login as admin — should NOT see `/admin/*` items. Login as platform — should see everything.

**Commit:** `git add -A && git commit -m "OB-168 Phase 6: Sidebar navigation derived from capabilities" && git push origin dev`

---

## PHASE 7: BUILD + LOCALHOST VERIFICATION

### 7A: Full clean build
```bash
cd /path/to/spm-platform
kill $(lsof -t -i:3000) 2>/dev/null || true
cd web && rm -rf .next && npm run build
```
Build MUST exit 0 with zero errors. Paste the build output.

### 7B: Start dev server
```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Must return 200 or 307. Paste the output.

### 7C: Verify permissions.ts exports
```bash
grep -n "export " web/src/lib/auth/permissions.ts
```
Paste the output.

### 7D: Verify zero RequireRole usage (except the component definition itself)
```bash
grep -rn "RequireRole" web/src/app/ --include="*.tsx" --include="*.ts"
```
Should return ZERO results.

### 7E: Verify zero RESTRICTED_WORKSPACES usage
```bash
grep -rn "RESTRICTED_WORKSPACES" web/src/ --include="*.ts"
```
Should return ZERO results.

**Commit:** `git add -A && git commit -m "OB-168 Phase 7: Build verification clean" && git push origin dev`

---

## PHASE 8: CREATE PR

```bash
cd /path/to/spm-platform
gh pr create --base main --head dev \
  --title "OB-168: DS-014 Phase 1 — Permission Infrastructure + Storage RLS Fix" \
  --body "## Decision 126: DS-014 Access Control Architecture Phase 1

### What this does:
- Creates permissions.ts — single source of truth for all access control
- Creates RequireCapability component (replaces RequireRole)
- Creates useHasCapability hook (replaces useCanPerform)
- Fixes ingestion-raw storage bucket RLS — admin can upload files
- Replaces middleware RESTRICTED_WORKSPACES with capability-based routing
- Migrates all pages from RequireRole to RequireCapability
- Derives sidebar navigation from capabilities

### CLT findings addressed:
CLT118-F1, CLT165-F06, CLT166-F05, CLT167-F01/F02/F03/F04/F05/F06

### CC Failure Patterns prevented:
FP-69 (fix one route leave others), FP-72 (sidebar ≠ button), FP-71 (button blocks API)

### What this unblocks:
Patricia (BCL admin) can upload plan file to Supabase Storage → SCI interprets plan → Calculate → Verify against GT $44,590"
```

---

## PROOF GATES — HARD (ALL MUST PASS)

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | `permissions.ts` exists and exports `hasCapability`, `getCapabilities`, `CANONICAL_ROLES` | `grep -n "export" web/src/lib/auth/permissions.ts` |
| PG-02 | `RequireCapability` component exists and compiles | `grep -rn "RequireCapability" web/src/components/` |
| PG-03 | `useHasCapability` hook exists and compiles | `grep -rn "useHasCapability" web/src/hooks/` |
| PG-04 | Storage RLS policy allows admin INSERT on ingestion-raw | SQL query from Phase 3C showing policy with 'admin' in check |
| PG-05 | Zero `RESTRICTED_WORKSPACES` references in codebase | `grep -rn "RESTRICTED_WORKSPACES" web/src/` returns 0 |
| PG-06 | Zero `RequireRole` usage in app pages | `grep -rn "RequireRole" web/src/app/` returns 0 |
| PG-07 | Middleware uses `hasCapability` from permissions.ts | `grep -n "hasCapability\|permissions" web/src/middleware.ts` |
| PG-08 | Build exits 0 with zero errors | Paste build output |
| PG-09 | `npm run dev` → localhost:3000 responds | Paste curl output |
| PG-10 | Role aliases handled (vl_admin→platform, tenant_admin→admin, individual→member) | Paste test or grep showing alias map |
| PG-11 | VL Admin (platform@vialuce.com) profile survives — tenant_id NULL, role platform | SQL query confirming profile exists |
| PG-12 | tenant-config API uses hasCapability (not hardcoded role) | `grep -n "hasCapability\|role.*===\|allowedRoles" web/src/app/api/platform/tenant-config/` |

## PROOF GATES — SOFT (Should pass, investigate if not)

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | Sidebar items have requiredCapability field | `grep -n "requiredCapability\|capability" web/src/components/navigation/` |
| PG-S2 | All import paths converge to /operate/import | `grep -rn "plan-import\|import/enhanced" web/src/` shows only redirects or zero results |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-168_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## PRODUCTION VERIFICATION (FOR ANDREW — AFTER PR MERGE)

After merging PR to main and Vercel deploys to production:

1. **Login as VL Admin** (platform@vialuce.com) on vialuce.ai
   - Navigate to /admin → should render (not Access Restricted)
   - Navigate to /operate → should render
   - Navigate to /configure → should render

2. **Login as BCL admin** (Patricia Zambrano) on vialuce.ai
   - Navigate to /operate → should render
   - Navigate to /operate/import → should render
   - Upload BCL_Plan_Comisiones_2025.xlsx
   - File should upload to Supabase Storage (no RLS error)
   - SCI should classify as plan (70-82% confidence)
   - SCI should interpret plan → rule_set created
   - Navigate to /admin → should show Access Restricted or redirect

3. **After plan import succeeds:**
   - Navigate to /operate/calculate
   - Calculate October 2025
   - Verify result against GT: $44,590

4. **Verify no regression on Meridian:**
   - Login as Meridian admin
   - Meridian calculation results should still show MX$185,063

---

*"One role set. One capability matrix. One check function. Four enforcement layers reading from the same source. No more whack-a-mole."*

*vialuce.ai — Intelligence. Acceleration. Performance.*
