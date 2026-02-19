# HF-044: RLS POLICY FIX — IMPORT PIPELINE ACCESS

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS HOTFIX EXISTS

CLT-64 browser testing: GPV wizard data import fails with 403. The `import_batches` INSERT policy requires `capabilities @> '["import_data"]'` but VL Platform Admin's profile doesn't have that capability. The SELECT policy for VL Admin uses `role = 'vl_admin'` but the INSERT policy doesn't have a VL Admin path.

**Root cause:** RLS policies are inconsistent — SELECT allows VL Admin by role, INSERT requires specific capability that was never set on VL Admin profiles.

**Error:**
```
POST import_batches?select=* → 403
code: "42501"
message: 'new row violates row-level security policy for table "import_batches"'
```

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Final step: `gh pr create --base main --head dev`

---

## PHASE 0: AUDIT — PROFILES TABLE SCHEMA + RLS LANDSCAPE

```bash
echo "============================================"
echo "HF-044 PHASE 0: RLS + PROFILES AUDIT"
echo "============================================"

echo ""
echo "=== 0A: PROFILES TABLE — ACTUAL COLUMNS ==="
# We need to know the real column names since 'scope_level' and 'capabilities' may not exist
# Check the Supabase types or migration files
grep -rn "CREATE TABLE.*profiles\|ALTER TABLE.*profiles\|profiles.*column" web/src/ --include="*.sql" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0B: PROFILES TYPE DEFINITION ==="
grep -rn "interface Profile\|type Profile\|profiles.*{" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== 0C: SEED SCRIPTS — HOW PROFILES ARE CREATED ==="
grep -rn "profiles.*insert\|\.from('profiles')" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== 0D: ALL RLS POLICIES THAT REFERENCE CAPABILITIES ==="
# Find any SQL files or migrations that define RLS policies
find web/src -name "*.sql" | head -20
grep -rn "capabilities\|import_data\|scope_level" web/src/ --include="*.sql" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0E: SUPABASE MIGRATIONS ==="
find web/supabase -name "*.sql" 2>/dev/null | sort | head -20
find supabase -name "*.sql" 2>/dev/null | sort | head -20

echo ""
echo "=== 0F: ALL TABLES WITH RLS POLICIES REFERENCING PROFILES ==="
grep -rn "auth.uid()\|profiles.*auth_user_id" web/supabase/ supabase/ --include="*.sql" 2>/dev/null | head -30

echo ""
echo "=== 0G: IMPORT-RELATED TABLES — ALL RLS POLICIES ==="
# Find what tables the import pipeline touches
grep -rn "from('import_batches')\|from('committed_data')\|from('entities')\|from('periods')\|from('rule_sets')\|from('calculation_results')" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep "insert\|upsert\|update\|delete" | head -20

echo ""
echo "=== 0H: GPV WIZARD — HOW IT WRITES TO IMPORT_BATCHES ==="
grep -rn "import_batches" web/src/components/gpv/ --include="*.tsx" --include="*.ts" | head -10
cat web/src/components/gpv/GPVWizard.tsx 2>/dev/null | grep -B5 -A15 "import_batches\|commitImport\|handleImport\|importData" | head -60

echo ""
echo "=== 0I: ENHANCED IMPORT — HOW IT WRITES (COMPARISON) ==="
grep -rn "import_batches" web/src/app/operate/import/enhanced/ web/src/app/data/import/enhanced/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -10
grep -rn "import_batches" web/src/lib/supabase/data-service.ts web/src/lib/import/ --include="*.ts" 2>/dev/null | head -10
```

**Document ALL findings. Specifically:**
1. What are the actual column names in the profiles table?
2. Does `capabilities` column exist? If not, what's the equivalent?
3. Which import path uses browser client (needs RLS) vs service role (bypasses RLS)?
4. Which tables in the import pipeline are missing INSERT/UPDATE policies for VL Admin?

**Commit:** `HF-044 Phase 0: RLS and profiles audit`

---

## PHASE 1: FIX — TWO-TRACK APPROACH

Based on Phase 0 findings, apply BOTH fixes:

### Track A: Add VL Admin INSERT policy for import_batches

Create a SQL migration that adds a VL Admin INSERT policy matching the existing VL Admin SELECT policy pattern:

```sql
-- Add VL Admin INSERT access to import_batches
-- Mirrors the existing import_batches_select_vl_admin pattern
CREATE POLICY "import_batches_insert_vl_admin"
ON import_batches FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.auth_user_id = auth.uid() 
    AND profiles.role = 'vl_admin'
  )
);
```

### Track B: Audit ALL pipeline tables for same gap

Check every table the import/calculation pipeline touches and ensure VL Admin has INSERT/UPDATE access:

Tables to audit:
- `import_batches` — INSERT (this is the known failure)
- `committed_data` — INSERT (data rows)
- `entities` — INSERT + UPDATE (entity creation/resolution)
- `periods` — INSERT (auto-creation from Año/Mes)
- `rule_sets` — INSERT (plan import confirm)
- `rule_set_assignments` — INSERT (entity-to-plan mapping)
- `calculation_results` — INSERT (calculation output)
- `calculation_batches` — INSERT + UPDATE (batch management)

For each table:
```bash
# Template — run for each table name
echo "=== POLICIES FOR [table] ==="
# Check existing policies in migration files
grep -rn "[table].*POLICY\|POLICY.*[table]" web/supabase/ supabase/ --include="*.sql" 2>/dev/null
```

For any table missing VL Admin INSERT/UPDATE, add the policy following the same pattern.

### Track C: Fix VL Admin profile capabilities (if column exists)

If the `capabilities` column exists on profiles, ensure VL Admin has the full set:

```sql
UPDATE profiles 
SET capabilities = '["full_access", "import_data", "admin", "approve", "calculate", "configure"]'::jsonb
WHERE role = 'vl_admin';
```

### Create migration file

Create a single migration file with ALL policy fixes:

```
web/supabase/migrations/YYYYMMDD_fix_rls_import_pipeline.sql
```

Or if migrations aren't used, create the SQL as a script that can be run in Supabase SQL Editor:

```
web/scripts/fix-rls-import-pipeline.sql
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | import_batches has VL Admin INSERT policy | Query pg_policies | Policy exists |
| PG-2 | committed_data has VL Admin INSERT policy | Query pg_policies | Policy exists |
| PG-3 | entities has VL Admin INSERT policy | Query pg_policies | Policy exists |
| PG-4 | periods has VL Admin INSERT policy | Query pg_policies | Policy exists |
| PG-5 | All pipeline tables audited | Completion report lists all tables + their policies | All documented |
| PG-6 | Migration/script file created and committed | File exists in repo | git shows file |

**Commit:** `HF-044 Phase 1: RLS policy fixes for import pipeline — VL Admin access`

---

## PHASE 2: VERIFY GPV WIZARD IMPORT PATH

After applying the RLS fixes (either via migration or SQL Editor), verify:

1. The GPV wizard can write to import_batches without 403
2. The Enhanced Import path still works
3. No existing tenant-level policies are broken

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-7 | GPV wizard import: no 403 on import_batches | Browser test or curl | 200/201 response |
| PG-8 | Enhanced Import commit: still works | Browser test | No regression |
| PG-9 | Tenant-scoped user can still insert (if testable) | Code review of policies | Existing policies unchanged |

**Commit:** `HF-044 Phase 2: Verify import pipeline RLS fixes`

---

## PHASE 3: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-10 | TypeScript: zero errors | `npx tsc --noEmit` exit code 0 | |
| PG-11 | Build: clean | `npm run build` exit code 0 | |

### Completion report

Create `HF-044_COMPLETION_REPORT.md` at PROJECT ROOT with:
- Profiles table actual schema (column names)
- All RLS policies found per pipeline table (BEFORE and AFTER)
- Migration/script file contents
- All 11 proof gates with evidence

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-044: RLS Policy Fix — Import Pipeline VL Admin Access" \
  --body "## Root Cause
import_batches INSERT policy requires capabilities @> '[\"import_data\"]' but VL Admin profile
doesn't have this capability. SELECT policy allows VL Admin by role but INSERT doesn't.

## Fix
- Added VL Admin INSERT policies for all import pipeline tables
- Audited committed_data, entities, periods, rule_sets, calculation_results, calculation_batches
- Created migration/script for reproducibility
- VL Admin profile capabilities updated (if column exists)

## Proof Gates: 11 — see HF-044_COMPLETION_REPORT.md"
```

**Commit:** `HF-044 Phase 3: Build verification, completion report, PR`

---

## SQL TO RUN IN SUPABASE AFTER MERGE

**IMPORTANT:** The migration file contains the SQL but it must also be run directly in Supabase SQL Editor since Supabase migrations don't auto-apply from git. Include clear instructions in the completion report:

```
POST-MERGE STEPS:
1. Open Supabase Dashboard → SQL Editor
2. Paste contents of [migration file path]
3. Run
4. Verify: SELECT * FROM pg_policies WHERE tablename IN ('import_batches', 'committed_data', 'entities', 'periods', 'rule_sets', 'calculation_results', 'calculation_batches');
```

---

*HF-044 — February 19, 2026*
*"RLS policies must be consistent across operations. If you can SELECT, you should be able to INSERT where appropriate."*
