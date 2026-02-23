# HF-054: SCHEMA ALIGNMENT AND BLOCKING ISSUE RESOLUTION

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**MANDATORY:** Read CC_STANDING_ARCHITECTURE_RULES.md FIRST. Evaluate every change against anti-pattern registry.

**CRITICAL RULE: Build EXACTLY what this prompt specifies. Do NOT substitute simpler alternatives. Do NOT skip deliverables. (Standing Rule 15)**

**AP-13 IS THE THEME OF THIS ENTIRE HF: "Assume column names match database schema." Query information_schema FIRST. Never guess column names.**

---

## THE PROBLEMS — ALL BLOCKING PRODUCTION

### Problem 1: `profiles.entity_id` Does Not Exist (P0)
The codebase queries `profiles?select=id,entity_id` which returns HTTP 400 because `entity_id` is not a column on the profiles table. This query fires **13 times per page load** on the Enhanced Import page, creating an error loop that disrupts page state.

**Actual profiles columns:** id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at

### Problem 2: Observatory Settings API Returns 403 (P0)
The `/api/platform/settings` route queries profiles using `.eq('id', user.id)` but should use `.eq('auth_user_id', user.id)`. The `profiles.id` is NOT the same as `auth.uid()` — `auth_user_id` is the FK to auth.users.

Also may still reference `scope_level` instead of `role`, or check for `'platform'` instead of `'vl_admin'`.

### Problem 3: `calculation_batches.lifecycle_state` Returns 406 (P1)
The query `calculation_batches?select=lifecycle_state` returns HTTP 406. Either `lifecycle_state` doesn't exist on that table, or the column is named differently.

### Problem 4: Period Detection Not Working (P1)
HF-053 added period detection but it's not taking effect on the Enhanced Import page. Possible causes:
- CC edited the wrong file (e.g., `web/src/app/data/import/enhanced/page.tsx` instead of `web/src/app/operate/import/enhanced/page.tsx`)
- The `year` and `month` target fields aren't appearing in the field mapping dropdown
- The AI isn't auto-mapping Año/Mes to the new targets
- The period-detector.ts utility isn't being called

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-20)
6. **Supabase migrations MUST be executed live AND verified with DB query**
7. **Build EXACTLY what the prompt specifies (Standing Rule 15)**
8. **NEVER assume column names. Query information_schema.columns FIRST. (AP-13)**

---

## PHASE 0: FULL SCHEMA AUDIT

**This phase does NOT change any code. It maps the actual database schema.**

### 0A: Dump the real schema for every table the codebase queries

```bash
echo "=== FIND ALL TABLES REFERENCED IN CODEBASE ==="
grep -rn "from('" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | sed "s/.*from('//;s/').*//" | sort -u

echo ""
echo "=== QUERY ACTUAL SCHEMA FOR EACH TABLE ==="
echo "Run each of these in Supabase SQL Editor and paste results:"
echo ""
echo "SELECT table_name, column_name, data_type FROM information_schema.columns"
echo "WHERE table_schema = 'public' AND table_name IN ("
echo "  'profiles', 'tenants', 'periods', 'entities', 'committed_data',"
echo "  'calculation_results', 'calculation_batches', 'import_batches',"
echo "  'plan_rules', 'plan_components', 'platform_settings'"
echo ") ORDER BY table_name, ordinal_position;"
```

### 0B: Find every column reference that doesn't exist

```bash
echo "=== PROFILES TABLE — FIND INVALID COLUMN REFERENCES ==="
echo "Known valid columns: id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at"
echo ""
echo "--- entity_id references (INVALID) ---"
grep -rn "entity_id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -i "profile"

echo ""
echo "--- scope_level references (INVALID) ---"
grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== CALCULATION_BATCHES — FIND lifecycle_state ==="
grep -rn "lifecycle_state" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== ALL .select() CALLS — CHECK COLUMN NAMES ==="
grep -rn "\.select(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -50
```

### 0C: Find which file serves /operate/import/enhanced

```bash
echo "=== ROUTE: /operate/import/enhanced ==="
find web/src/app -path "*operate*import*enhanced*" -name "page.tsx"

echo ""
echo "=== ROUTE: /data/import/enhanced ==="
find web/src/app -path "*data*import*enhanced*" -name "page.tsx"

echo ""
echo "=== WHICH ONE DID HF-053 MODIFY? ==="
git log --oneline --name-only -5 | grep "enhanced"
```

### 0D: Verify period detection code is in the correct file

```bash
echo "=== DOES THE SERVED FILE HAVE PERIOD DETECTION? ==="
SERVE_FILE=$(find web/src/app -path "*operate*import*enhanced*" -name "page.tsx")
echo "Served file: $SERVE_FILE"

echo ""
echo "--- period-detector import? ---"
grep -n "period-detector\|detectPeriods\|PeriodDetectionResult" "$SERVE_FILE" 2>/dev/null || echo "NOT FOUND — HF-053 edited the wrong file"

echo ""
echo "--- year/month target fields? ---"
grep -n "'year'\|'month'\|period_year\|period_month" "$SERVE_FILE" 2>/dev/null || echo "NOT FOUND"

echo ""
echo "--- fullSheetData state? ---"
grep -n "fullSheetData" "$SERVE_FILE" 2>/dev/null || echo "NOT FOUND"
```

### 0E: Check the /api/platform/settings route

```bash
echo "=== SETTINGS API ROUTE — PROFILE CHECK ==="
cat web/src/app/api/platform/settings/route.ts

echo ""
echo "=== FLAGS API ROUTE ==="
cat web/src/app/api/platform/flags/route.ts
```

### 0F: Document ALL schema mismatches

Create `HF-054_DIAGNOSTIC.md` at project root with:
1. Every table and its actual columns (from information_schema)
2. Every invalid column reference found in the codebase
3. Which file serves /operate/import/enhanced
4. Whether HF-053's changes are in the correct file
5. The exact profile query pattern that's causing the 400 errors

**Commit:** `HF-054 Phase 0: Schema alignment audit — every table, every column, every mismatch`

---

## PHASE 1: CREATE SCHEMA_TRUTH.md

Based on Phase 0 findings, create a file at project root that CC must reference for all future work:

Create `SCHEMA_TRUTH.md`:

```markdown
# SCHEMA TRUTH — Actual Database Column Names
# Generated from information_schema.columns on [date]
# MANDATORY REFERENCE — CC must check this before writing any Supabase query

## profiles
| Column | Type |
|--------|------|
| id | uuid |
| tenant_id | uuid |
| auth_user_id | uuid |
| display_name | text |
| email | text |
| role | text |
| capabilities | jsonb |
| locale | text |
| avatar_url | text |
| created_at | timestamptz |
| updated_at | timestamptz |

NOTE: auth.uid() matches auth_user_id, NOT id
NOTE: role values are: vl_admin, admin, manager, viewer
NOTE: NO entity_id column exists
NOTE: NO scope_level column exists

## [repeat for every table from Phase 0A]
```

**Commit:** `HF-054 Phase 1: SCHEMA_TRUTH.md — authoritative column reference`

---

## PHASE 2: FIX ALL SCHEMA MISMATCHES

### 2A: Fix profiles.entity_id references

Every query that selects or filters on `profiles.entity_id` must be fixed. The profile does not have an entity_id — if the code needs to link a profile to an entity, it should query the `entities` table using the profile's email or auth_user_id.

```bash
grep -rn "entity_id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -i "profile"
```

For each occurrence:
- If selecting entity_id from profiles: remove it from the select
- If filtering by entity_id on profiles: change to the correct table/column
- If the feature genuinely needs profile→entity linkage: query entities table separately

### 2B: Fix profiles.scope_level references

```bash
grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

Replace ALL with `role`. Replace `= 'platform'` with `= 'vl_admin'`.

### 2C: Fix profiles query using .eq('id', user.id)

Every API route that queries profiles to check role/permissions must use `auth_user_id`:

```bash
grep -rn "\.eq('id'.*user\|\.eq(\"id\".*user" web/src/app/api/ --include="*.ts" | grep -v node_modules
grep -rn "profiles.*\.eq.*id.*user\|from.*profiles.*user\.id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
```

For each: `.eq('id', user.id)` → `.eq('auth_user_id', user.id)`

### 2D: Fix calculation_batches.lifecycle_state

```bash
grep -rn "lifecycle_state" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```

Check the actual column name from Phase 0A schema dump. Replace with correct column.

### 2E: Fix any other mismatches found in Phase 0

For every invalid column reference found in the diagnostic, fix it to match the actual schema.

**Commit:** `HF-054 Phase 2: Fix all schema mismatches — entity_id, scope_level, lifecycle_state, auth_user_id`

---

## PHASE 3: FIX PERIOD DETECTION (CORRECT FILE)

### 3A: Determine which file is correct

From Phase 0C, identify which page.tsx file serves `/operate/import/enhanced`.

### 3B: If HF-053 edited the wrong file

If the period detection code (period-detector import, year/month target fields, fullSheetData, detectPeriods call) is in `web/src/app/data/import/enhanced/page.tsx` but the route is served by `web/src/app/operate/import/enhanced/page.tsx`:

1. Copy ALL HF-053 changes from the wrong file to the correct file
2. Verify the correct file has:
   - `import { detectPeriods } from '@/lib/import/period-detector'`
   - `year` and `month` in the target fields list
   - `fullSheetData` state variable populated during parsing
   - `detectPeriods()` called at the Validate step
   - Period cards rendered in the UI
   - `detectedPeriods` in the commit payload

### 3C: If HF-053 edited the correct file but detection still fails

Debug the detection flow:
1. Add console.log at each step: field mapping state, which fields are mapped to year/month, parsed sheet data availability, detectPeriods input and output
2. Check if the AI auto-maps Año→year and Mes→month, or if the user needs to manually map them
3. Check if `fullSheetData` is populated (it should contain all rows from all sheets)

### 3D: Verify period detection works on localhost

1. Start dev server
2. Navigate to /operate/import/enhanced
3. Upload RetailCGMX Excel file
4. At Field Mapping step: verify `year` and `month` appear in target field dropdowns
5. Verify Año maps to `year` and Mes maps to `month` (auto or manual)
6. Advance to Validate & Preview
7. **MUST see period cards: January 2024, February 2024, March 2024**
8. Entity count **MUST show ~2,157** not 5

**Commit:** `HF-054 Phase 3: Period detection in correct file + verified on localhost`

---

## PHASE 4: FIX OBSERVATORY SETTINGS 403

### 4A: Fix the settings API route

In `web/src/app/api/platform/settings/route.ts`:

```typescript
// WRONG:
const { data: profile } = await serviceClient
  .from('profiles')
  .select('scope_level')       // ← column doesn't exist
  .eq('id', user.id)           // ← should be auth_user_id
  .single();

if (profile?.scope_level !== 'platform') { ... }

// CORRECT:
const { data: profile } = await serviceClient
  .from('profiles')
  .select('role')              // ← actual column name
  .eq('auth_user_id', user.id) // ← correct FK
  .single();

if (profile?.role !== 'vl_admin') { ... }
```

Apply this fix to both GET and PATCH handlers.

### 4B: Verify on localhost

```bash
curl -s http://localhost:3000/api/platform/settings
# Should return 401 (no auth) not 403
# With auth: should return the 3 settings
```

### 4C: Verify Observatory Settings tab renders toggles

On localhost, navigate to Observatory → Settings tab. Must show three toggle switches.

**Commit:** `HF-054 Phase 4: Fix Observatory Settings API — role + auth_user_id`

---

## PHASE 5: STOP THE ERROR LOOP

### 5A: Find what's causing 13 identical failed requests

```bash
echo "=== WHAT COMPONENT QUERIES profiles.entity_id? ==="
grep -rn "entity_id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "entities\." | head -20

echo ""
echo "=== IS THERE A RETRY LOOP? ==="
grep -rn "retry\|Retry\|refetch\|setInterval\|polling\|useEffect.*profile" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep entity_id | head -10
```

The 13 failed requests suggest either:
- A useEffect with a dependency that changes on every render (infinite re-render loop)
- A retry mechanism that keeps trying the failed query
- Multiple components each making the same broken query

Fix the root cause — remove the entity_id query entirely, or replace it with a correct query. If the feature needs profile→entity linkage, implement it correctly using the entities table.

**Commit:** `HF-054 Phase 5: Eliminate error loop — fix or remove entity_id query`

---

## PHASE 6: BUILD + VERIFY + PR

### 6A: Build

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### 6B: Zero schema errors on page load

Navigate to /operate/import/enhanced on localhost. Open DevTools Console.

**MUST see ZERO 400 errors. ZERO 406 errors. ZERO profile query failures.**

### 6C: Proof gates

| # | Gate | Pass Criteria | Method |
|---|------|--------------|--------|
| PG-1 | SCHEMA_TRUTH.md exists | File at project root | File check |
| PG-2 | Zero `entity_id` references on profiles | grep returns 0 | grep |
| PG-3 | Zero `scope_level` references anywhere | grep returns 0 | grep |
| PG-4 | All profile auth queries use `auth_user_id` | grep audit | grep |
| PG-5 | calculation_batches column name correct | Matches schema | grep |
| PG-6 | /api/platform/settings returns 200 for vl_admin | curl with auth | curl |
| PG-7 | Observatory Settings shows 3 toggles | Visual check | Browser |
| PG-8 | Enhanced Import page: zero console errors on load | DevTools | Browser |
| PG-9 | Period detection code in correct file | grep in served file | grep |
| PG-10 | Year/month target fields in mapping dropdown | Visual check | Browser |
| PG-11 | Period cards show Jan/Feb/Mar 2024 after import | Visual check | Browser |
| PG-12 | Entity count shows ~2,157 not 5 | Visual check | Browser |
| PG-13 | Build clean | npm run build exit 0 | Terminal |
| PG-14 | Zero 400/406 errors on any page load | DevTools | Browser |

### 6D: Completion report

Create `HF-054_COMPLETION_REPORT.md` at PROJECT ROOT.

### 6E: PR

```bash
git add -A && git commit -m "HF-054 Phase 6: Build + completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-054: Schema alignment — fix all column mismatches + period detection + Observatory Settings" \
  --body "## Root Cause
Codebase references columns that don't exist in the database:
- profiles.entity_id (doesn't exist) — 13 failed queries per page load
- profiles.scope_level (doesn't exist) — should be role
- profiles.id used where auth_user_id needed — different UUIDs
- calculation_batches.lifecycle_state — wrong column name
- Period detection code in wrong file

## Fixes
1. SCHEMA_TRUTH.md — authoritative column reference for all tables
2. All schema mismatches fixed across codebase
3. Observatory Settings API: role + auth_user_id
4. Period detection moved to correct file (/operate/import/enhanced)
5. Error loop eliminated (13 failed profile queries per page)

## Proof Gates: 14 — see HF-054_COMPLETION_REPORT.md"
```

---

## ANTI-PATTERNS TO AVOID

| # | Don't | Do Instead |
|---|-------|-----------|
| 1 | Assume a column exists because another file references it | Query information_schema.columns FIRST |
| 2 | Use profiles.id to match auth.uid() | Use profiles.auth_user_id — they're different UUIDs |
| 3 | Reference scope_level anywhere | The column is role. Values: vl_admin, admin, manager, viewer |
| 4 | Edit a file without confirming it serves the target route | Check the app directory structure to find the actual served file |
| 5 | Leave failed queries retrying in a loop | Fix or remove broken queries — don't let them spam 400s |
| 6 | Build on top of schema mismatches | Fix the schema alignment FIRST, then build features |

## PROPOSED STANDING RULE

Add to CC_STANDING_ARCHITECTURE_RULES.md Section D:

```
### Schema
24. Before writing ANY Supabase query, verify column names against SCHEMA_TRUTH.md or information_schema.columns. Never assume. (AP-13)
25. profiles.id ≠ auth.uid(). Always use auth_user_id for auth matching.
```

---

*HF-054 — February 19, 2026*
*"You can't build a house on a foundation you've never measured. Query the schema first."*
