# OB-82: PLATFORM SYNC + BROWSER TRUTH + PRODUCTION FIX
## Merge the Metamorphosis to Production and Fix What Breaks

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `OB-81_COMPLETION_REPORT.md` — what was just wired
4. `ViaLuce_Build_Operations_Reference.docx` — deployment workflows

---

## WHAT THIS OB DOES

OB-78 through OB-81 built and wired the Agentic Metamorphosis on the dev branch. Multiple PRs may be outstanding. The production branch (main) may be significantly behind. This OB:

1. Diagnoses the current state of dev vs main
2. Merges all outstanding PRs to main (or creates a single PR if none exist)
3. Syncs dev after merge
4. Verifies the production build succeeds
5. Runs a comprehensive browser truth session on localhost:3000
6. Fixes every issue found — routing errors, rendering failures, console errors, broken pages

**After OB-82, the live platform at vialuce.ai reflects everything built in the metamorphosis.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev` (if new fixes were needed)
4. **Fix logic, not data.**
5. **Commit this prompt to git as first action.**
6. **Git from repo root (spm-platform), NOT web/.**

---

## PHASE 0: STATE DIAGNOSTIC

### 0A: Branch state

```bash
echo "=== CURRENT BRANCH ==="
git branch --show-current

echo ""
echo "=== DEV LOG (last 20 commits) ==="
git log --oneline -20 dev

echo ""
echo "=== MAIN LOG (last 10 commits) ==="
git log --oneline -10 main

echo ""
echo "=== COMMITS ON DEV NOT ON MAIN ==="
git log --oneline main..dev | head -30

echo ""
echo "=== OPEN PRs ==="
gh pr list --state open

echo ""
echo "=== RECENTLY MERGED PRs ==="
gh pr list --state merged --limit 5
```

### 0B: Build state

```bash
echo "=== CURRENT BUILD STATUS ==="
cd web && rm -rf .next && npm run build 2>&1 | tail -20
echo "Build exit code: $?"
```

### 0C: Production vs dev file diff

```bash
echo "=== FILES CHANGED (dev vs main) ==="
git diff --stat main..dev | tail -20

echo ""
echo "=== NEW FILES ON DEV ==="
git diff --name-only --diff-filter=A main..dev
```

### 0D: Supabase migration status

```bash
echo "=== MIGRATION FILES ==="
ls -la web/supabase/migrations/ 2>/dev/null || ls -la supabase/migrations/ 2>/dev/null

echo ""
echo "=== MIGRATIONS ON DEV NOT ON MAIN ==="
git diff --name-only main..dev | grep -i migration
```

**Commit:** `OB-82 Phase 0: State diagnostic — branch, build, diff, migrations`

---

## MISSION 1: MERGE TO PRODUCTION

### 1A: Determine merge strategy

Based on Phase 0 findings:

**If open PRs exist:** Merge them in order (oldest first). After each merge, sync dev:
```bash
git checkout dev && git pull origin main && git push origin dev
```

**If no open PRs but dev is ahead of main:** Create a single comprehensive PR:
```bash
gh pr create --base main --head dev \
  --title "OB-78 through OB-81: Agentic Metamorphosis — Complete Merge to Production" \
  --body "Merging all Agentic Metamorphosis work to production.

OB-78: Synaptic State Foundation (178 tests)
OB-79: Agent Autonomy (170 tests)  
OB-80: Negotiation Protocol + Flywheels (223 tests)
OB-81: Live Pipeline Wiring + CLT-80 (183 tests)

Total: 754 tests, 121 proof gates."
```

**If dev and main are already in sync:** Skip to Mission 2.

### 1B: Post-merge sync

After all PRs merged:
```bash
git checkout dev
git pull origin main
git push origin dev
echo "Dev and main are now in sync"
```

### 1C: Verify production build

```bash
cd web && rm -rf .next && npm run build
echo "Production build exit code: $?"
```

If build fails: diagnose and fix. This is the top priority — nothing else matters if production doesn't build.

**Proof gates:**
- PG-1: All outstanding PRs merged to main (or dev and main in sync)
- PG-2: `npm run build` exits 0 after merge
- PG-3: Dev branch synced with main

**Commit:** `OB-82 Mission 1: Production merge complete, build verified`

---

## MISSION 2: BROWSER TRUTH — FULL PAGE INVENTORY

Start the dev server and systematically verify every significant page.

```bash
cd web && npm run dev &
sleep 5
```

### 2A: Authentication and routing

```bash
echo "=== AUTH ROUTES ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/signup
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/

echo ""
echo "=== PROTECTED ROUTES (should redirect to login without auth) ==="
for route in "/dashboard" "/admin" "/perform" "/calculate" "/import" "/observatory"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$route")
  echo "  $route: $code"
done
```

### 2B: App shell and navigation

```bash
echo "=== APP LAYOUT FILES ==="
find web/src/app -name "layout.tsx" | head -20

echo ""
echo "=== ROUTE FILES ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "=== API ROUTES ==="
find web/src/app/api -name "route.ts" | sort
```

### 2C: Page rendering check

For every page found in 2B, verify it compiles without server errors:

```bash
echo "=== PAGE RENDERING AUDIT ==="
for page in $(find web/src/app -name "page.tsx" -not -path "*/api/*" | sort); do
  route=$(echo "$page" | sed 's|web/src/app||' | sed 's|/page.tsx||' | sed 's|^\(.*\)$|\1|')
  if [ -z "$route" ]; then route="/"; fi
  echo "  Checking: $route"
done
```

### 2D: Console error audit

Check for TypeScript compilation errors and runtime issues:

```bash
echo "=== TYPESCRIPT STRICT CHECK ==="
cd web && npx tsc --noEmit 2>&1 | tail -30
echo "TSC exit code: $?"
```

### 2E: Document findings

Create a structured findings document:

```
Page: [route]
Status: RENDERS / BROKEN / REDIRECT / 404
Console errors: [list]
Visual issues: [description]
Fix needed: [yes/no + description]
```

**Proof gates:**
- PG-4: Login page renders
- PG-5: Protected routes redirect to login without auth
- PG-6: App shell (layout, sidebar, header) renders
- PG-7: No build-breaking TypeScript errors

**Commit:** `OB-82 Mission 2: Browser truth — page inventory and rendering audit`

---

## MISSION 3: FIX RENDERING AND ROUTING ISSUES

Based on Mission 2 findings, fix every broken page, routing error, and rendering issue.

### Fix categories (address in this order):

**Category A: Build failures** — anything that prevents `npm run build` from succeeding
**Category B: Route 500 errors** — server-side rendering crashes
**Category C: Missing imports** — new files from OB-78-81 not properly imported
**Category D: Type mismatches** — new interfaces not aligned with existing code
**Category E: Console warnings** — non-blocking but noisy

### For each fix:
1. Diagnose root cause
2. Apply minimal fix
3. Verify `npm run build` still passes
4. Verify the specific page renders

**Critical principle: Do not refactor.** This mission fixes rendering. It does not redesign pages, move files, or change architecture. Minimal patches to make everything render.

**Proof gates:**
- PG-8: All previously broken pages now render
- PG-9: Zero server-side 500 errors on any page
- PG-10: `npm run build` still exits 0 after all fixes
- PG-11: Console error count reduced (document before/after)

**Commit:** `OB-82 Mission 3: Fix rendering and routing — [N] pages fixed`

---

## MISSION 4: API ROUTE VERIFICATION

Verify all API routes respond correctly (especially the newly wired ones from OB-81).

### 4A: Calculation route

```bash
echo "=== CALCULATION API ==="
# Verify the route file exists and compiles
cat web/src/app/api/calculation/run/route.ts | head -10

# Check for import errors
grep -n "import.*from" web/src/app/api/calculation/run/route.ts
```

### 4B: Reconciliation route

```bash
echo "=== RECONCILIATION API ==="
cat web/src/app/api/reconciliation/run/route.ts | head -10
grep -n "import.*from" web/src/app/api/reconciliation/run/route.ts
```

### 4C: Disputes/Resolution route

```bash
echo "=== RESOLUTION API ==="
cat web/src/app/api/disputes/investigate/route.ts | head -10
grep -n "import.*from" web/src/app/api/disputes/investigate/route.ts
```

### 4D: Insights route

```bash
echo "=== INSIGHTS API ==="
find web/src/app/api -path "*insight*" -name "route.ts"
```

### 4E: Verify all API routes compile

```bash
echo "=== ALL API ROUTES — IMPORT CHECK ==="
for route in $(find web/src/app/api -name "route.ts" | sort); do
  errors=$(grep -c "Cannot find module\|Module not found" "$route" 2>/dev/null || echo "0")
  echo "  $route: $errors import issues"
done
```

Fix any broken imports or missing modules.

**Proof gates:**
- PG-12: Calculation API route compiles with all OB-81 wiring
- PG-13: Reconciliation API route compiles
- PG-14: Resolution API route compiles
- PG-15: All API routes pass import check

**Commit:** `OB-82 Mission 4: API route verification — all routes compile`

---

## MISSION 5: SUPABASE MIGRATION VERIFICATION

### 5A: Check migration file integrity

```bash
echo "=== MIGRATION FILES ==="
for f in web/supabase/migrations/*.sql supabase/migrations/*.sql; do
  if [ -f "$f" ]; then
    lines=$(wc -l < "$f")
    echo "  $(basename $f): $lines lines"
  fi
done 2>/dev/null
```

### 5B: Verify migration files are syntactically valid SQL

```bash
echo "=== MIGRATION SQL VALIDATION ==="
for f in web/supabase/migrations/*.sql supabase/migrations/*.sql; do
  if [ -f "$f" ]; then
    # Check for common SQL issues
    tables=$(grep -ci "CREATE TABLE" "$f")
    policies=$(grep -ci "CREATE POLICY" "$f")
    echo "  $(basename $f): $tables tables, $policies policies"
  fi
done 2>/dev/null
```

### 5C: Document migration execution plan

Create a summary of which migrations need to be run against the live Supabase instance:

```
Migration: 015_synaptic_density.sql
Tables: synaptic_density
Status: [EXISTS / NEEDS_EXECUTION]
RLS: Enabled, service_role write policy

Migration: 016_flywheel_tables.sql
Tables: foundational_patterns, domain_patterns
Status: [EXISTS / NEEDS_EXECUTION]
RLS: Enabled, authenticated read, service_role write
```

**Proof gates:**
- PG-16: All migration files syntactically valid
- PG-17: Migration execution plan documented

**Commit:** `OB-82 Mission 5: Migration verification — execution plan documented`

---

## MISSION 6: COMPLETION REPORT + PR

### 6A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
npm run dev &
sleep 5
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
kill %1 2>/dev/null
```

### 6B: Completion report

Save as `OB-82_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:
1. **Merge status** — PRs merged, commits synced, dev/main alignment
2. **Build status** — npm run build result
3. **Browser truth findings** — every page checked, status, fixes applied
4. **API route status** — all routes verified
5. **Migration status** — execution plan
6. **Fixes applied** — every fix with before/after
7. **Remaining issues** — anything that couldn't be fixed in this OB
8. **Proof gates** — 17 gates, each PASS/FAIL

### 6C: PR (if fixes were applied)

```bash
gh pr create --base main --head dev \
  --title "OB-82: Platform Sync + Browser Truth — Production Verification" \
  --body "## Merge Metamorphosis to Production

### Mission 1: Production Merge
- All outstanding PRs merged
- Dev synced with main
- Production build verified

### Mission 2: Browser Truth
- Full page inventory audited
- Every route checked for rendering
- Console errors documented

### Mission 3: Rendering Fixes
- [N] pages fixed
- Zero server-side 500 errors
- Build still clean

### Mission 4: API Routes
- All OB-81 wired routes verified
- Import chains validated
- Calculation, reconciliation, resolution, insights all compile

### Mission 5: Migrations
- Migration files validated
- Execution plan documented

### Proof Gates: 17 — see OB-82_COMPLETION_REPORT.md"
```

**Commit:** `OB-82 Final: Completion report + PR`

---

## MAXIMUM SCOPE

6 missions, 17 proof gates. After OB-82, the production platform at vialuce.ai reflects the complete Agentic Metamorphosis and every page renders.

---

*OB-82 — February 22, 2026*
