# OB-69: IMPORT-TO-CALCULATION PIPELINE E2E + PROFILES 406 FIX

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the COMPLETE file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with:
- Section A: Design Principles (9 principles — especially #1 AI-First, #2 Scale by Design, #3 Fix Logic Not Data, #7 Prove Don't Describe)
- Section B: Architecture Decision Gate (mandatory BEFORE any implementation code)
- Section C: Anti-Pattern Registry (17 anti-patterns — DO NOT REPEAT ANY)
- Section D: Operational Rules (23 rules)
- Section E: Scale Reference
- Section F: Quick Checklist (run before completion report)

**If you have not read that file, STOP and read it now.**

Also read: `SCHEMA_REFERENCE.md` — the authoritative column reference for every Supabase query. **Every column name you write in this OB MUST come from this file.**

---

## ⚠️ CC COMPLIANCE ENFORCEMENT — READ BEFORE ANY CODE

### THE THREE VIOLATIONS THAT KEEP RECURRING

**VIOLATION 1: Inventing schema instead of checking it.**
CC assumes column names from memory or TypeScript types instead of checking SCHEMA_REFERENCE.md or querying the live database. This has caused AP-4 (schema drift), AP-13 (assumed column names), and multiple hotfixes. HF-054 was ENTIRELY about this pattern.

**RULE: Before writing ANY Supabase query in this OB, verify every column name against SCHEMA_REFERENCE.md. If a column isn't listed there, it does not exist. Do not trust TypeScript types. Do not guess.**

**VIOLATION 2: Creating parallel implementations instead of wiring existing code.**
CC creates new files/functions when existing ones already serve the purpose. OB-68 diagnostic found FOUR separate approval systems. This is AP-17.

**RULE: Before creating ANY new file, search for existing implementations first. Run `grep -rn` for the function/service/route name. If something exists, EXTEND it — do not create a parallel version. Document what you found in the commit message.**

**VIOLATION 3: Claiming PASS via code review instead of proving with live tests.**
OB-68 had 31 proof gates specified, CC delivered 18, and several critical browser-verification gates (survives reload, round-trip) were claimed as PASS without actual browser testing. AP-9 and AP-10 prohibit this.

**RULE: Every proof gate marked "browser test" or "SQL query" must include PASTED OUTPUT — the actual curl response, SQL result, or console screenshot. "This was implemented" is NOT evidence. "The code calls the API route" is NOT evidence that the API route works.**

### COMPLIANCE CHECKPOINTS (Mandatory)

At the end of each Mission, BEFORE committing, CC must write a compliance block:

```
COMPLIANCE CHECK — Mission N
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — list tables referenced]
□ Searched for existing implementations before creating new files? [YES/NO — list grep commands]
□ Every state change persists to Supabase? [YES/NO — list each write and target table]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — list AP# relevant]
□ Architecture Decision Record committed before code? [YES/NO]
□ Scale test: would this work for 2M records? [YES/NO]
```

**If ANY checkbox is NO without justification, the mission is INCOMPLETE.**

---

## WHY THIS OB EXISTS

**Two problems, one root cause: the platform doesn't prove its data pipeline works end-to-end.**

### Problem 1: 406 on every page load (P0)

Every page in production fires a Supabase query:
```
GET /rest/v1/profiles?select=id&auth_user_id=eq.497b8d67-...&tenant_id=eq.9b2bb4e3-...
```
This returns **HTTP 406**. The 406 means either:
- `.single()` was called and zero rows matched (Supabase returns 406 for `.single()` with no results)
- The `Accept` header is wrong (unlikely — Supabase JS client sets it)
- The `auth_user_id` value doesn't match any row with that `tenant_id`

**Impact:** Every page shows this error in console. Any feature depending on the profile query gets no data. The Users table shows "0 users" because the profile query fails.

### Problem 2: Import → Calculation → Dashboard has never been proven E2E (P0)

The pipeline has been tested in pieces:
- Plan import: proven (rule_sets created)
- Data import: proven (119K committed_data rows, HF-047)
- Period creation: code exists (HF-048/053), never verified E2E
- Calculation: has run, produced results
- Dashboard reading real results: unverified
- Reconciliation against real results: unverified

**No single session has ever walked through: upload plan → upload data → periods created → calculation runs → dashboard shows real numbers → reconciliation matches.**

This OB proves the pipeline end-to-end AND fixes the systemic 406 error.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. **Supabase migrations: execute live AND verify with DB query. File existence ≠ applied.**
5. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
6. **Commit this prompt to git as first action.**
7. Domain-agnostic always. Nothing ICM-specific in table names, column names, or service names.
8. Security/scale/performance by design, not retrofitted.
9. **profiles.id ≠ auth.uid(). Use auth_user_id. entities.profile_id → profiles.id.**
10. **Check SCHEMA_REFERENCE.md before any Supabase query. profiles.entity_id does NOT exist.**
11. **RequireRole uses useAuth() not usePersona().** user_metadata.role is JWT source.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### ADDITIONAL RULE (29)
29. This prompt file committed to git as first action: `OB-69_PIPELINE_AND_PROFILES_FIX.md`

---

## SCHEMA TRUTH — TABLES INVOLVED IN THIS OB

From SCHEMA_REFERENCE.md (verified 2026-02-20, post OB-68):

**profiles**: id, tenant_id, **auth_user_id**, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at
- **NO entity_id. NO scope_level.**
- auth.uid() matches **auth_user_id**, NOT id

**periods**: id, tenant_id, label, period_type, status, start_date, end_date, **canonical_key**, metadata, created_at, updated_at
- **NO period_key column. Use canonical_key.**

**committed_data**: id, tenant_id, import_batch_id, entity_id, **period_id** (FK → periods.id), data_type, row_data, metadata, created_at
- **NO period_key. Uses period_id FK.**

**entities**: id, tenant_id, entity_type, status, external_id, display_name, **profile_id** (FK → profiles.id, nullable), temporal_attributes, metadata, created_at, updated_at

**calculation_batches**: id, tenant_id, period_id, rule_set_id, batch_type, **lifecycle_state**, superseded_by, supersedes, entity_count, summary, config, started_at, completed_at, created_by, created_at, updated_at

**calculation_results**: id, tenant_id, **batch_id** (NOT calculation_batch_id), entity_id, rule_set_id, period_id, **total_payout** (numeric, top-level), components, metrics, attainment, metadata, created_at

**rule_sets**: id, tenant_id, name, description, status, version, effective_from, effective_to, population_config, input_bindings, **components** (jsonb), cadence_config, outcome_config, metadata, created_by, approved_by, created_at, updated_at

**rule_set_assignments**: id, tenant_id, rule_set_id, entity_id, effective_from, effective_to, assignment_type, metadata, created_at, updated_at

**import_batches**: id, tenant_id, file_name, file_type, row_count, status, error_summary, uploaded_by, created_at, completed_at

**entity_period_outcomes**: id, tenant_id, entity_id, period_id, total_payout, rule_set_breakdown, component_breakdown, lowest_lifecycle_state, attainment_summary, metadata, materialized_at

**audit_logs**: id, tenant_id, **profile_id** (NOT actor_id), action, **resource_type** (NOT entity_type), **resource_id** (NOT entity_id), changes, metadata, ip_address, created_at

---

## PHASE 0: DIAGNOSTIC (MANDATORY — BEFORE ANY IMPLEMENTATION)

### 0A: Reproduce and diagnose the 406 error

```bash
echo "============================================"
echo "OB-69 PHASE 0A: PROFILES 406 DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Every query that hits the profiles table ==="
grep -rn "from('profiles')\|from(\"profiles\")" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | sort

echo ""
echo "=== Every .single() call on profiles ==="
grep -rn "profiles.*\.single()\|\.single().*profiles" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== Profile queries that filter by auth_user_id ==="
grep -rn "auth_user_id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "SCHEMA\|schema\|types\|\.d\.ts"

echo ""
echo "=== Profile queries that use .eq('id', user.id) — WRONG PATTERN ==="
grep -rn "profiles.*\.eq.*'id'.*user\|profiles.*\.eq.*\"id\".*user" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v auth_user

echo ""
echo "=== Where does the auth_user_id value come from? ==="
grep -rn "auth_user_id.*=\|setAuthUserId\|user\.id\|auth\.uid\|session\.user\.id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v types | head -20

echo ""
echo "=== Demo persona / hardcoded user IDs ==="
grep -rn "497b8d67\|demo.*user.*id\|hardcoded.*user\|fallback.*user" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10
```

### 0B: Check if the auth_user_id exists in profiles

```bash
echo ""
echo "=== Check if auth_user_id 497b8d67-7c81-40cd-b14a-41ca90497c0b exists in profiles ==="
# Run this query against Supabase:
# SELECT id, auth_user_id, tenant_id, email, role FROM profiles 
# WHERE auth_user_id = '497b8d67-7c81-40cd-b14a-41ca90497c0b';
#
# Also check:
# SELECT id, auth_user_id, tenant_id, email, role FROM profiles 
# WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
#
# And: SELECT id, email FROM auth.users WHERE id = '497b8d67-7c81-40cd-b14a-41ca90497c0b';
```

### 0C: Audit the import → calculation pipeline code path

```bash
echo "============================================"
echo "OB-69 PHASE 0C: PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== Import commit route ==="
find web/src/app/api -path "*import*commit*" -name "route.ts" | head -5
# For each found: grep for period creation, entity creation, committed_data insert

echo ""
echo "=== Period creation in commit route ==="
grep -rn "periods.*insert\|from('periods').*insert\|INSERT.*periods\|createPeriod\|resolvePeriod" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== Does committed_data get period_id set? ==="
grep -rn "period_id" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "SCHEMA\|types\|\.d\.ts" | head -15

echo ""
echo "=== Calculation trigger ==="
find web/src/app/api -path "*calculat*" -name "route.ts" | head -5

echo ""
echo "=== How does calculation read committed_data? ==="
grep -rn "from('committed_data')\|committed_data.*select" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== How does calculation write results? ==="
grep -rn "calculation_results.*insert\|from('calculation_results').*insert" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== Dashboard data source ==="
grep -rn "from('calculation_results')\|from('entity_period_outcomes')" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== What does the dashboard page read? ==="
find web/src/app -name "page.tsx" -path "*perform*" -o -name "page.tsx" -path "*operate*" | head -10
# For the main dashboard pages, check what data they fetch
```

### 0D: Current state — what data exists?

```sql
-- Run in Supabase SQL Editor, document results:

-- 1. How many profiles exist for the retail tenant?
SELECT COUNT(*), role FROM profiles 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' 
GROUP BY role;

-- 2. Auth users
SELECT id, email FROM auth.users ORDER BY email;

-- 3. Do profiles.auth_user_id values match auth.users.id?
SELECT p.id as profile_id, p.auth_user_id, p.email, p.role, 
       a.id as auth_id, a.email as auth_email
FROM profiles p 
LEFT JOIN auth.users a ON p.auth_user_id = a.id
WHERE p.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- 4. What data exists for pipeline?
SELECT 'rule_sets' as tbl, COUNT(*) FROM rule_sets WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'entities', COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'periods', COUNT(*) FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'committed_data', COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'calculation_batches', COUNT(*) FROM calculation_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'calculation_results', COUNT(*) FROM calculation_results WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'rule_set_assignments', COUNT(*) FROM rule_set_assignments WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'import_batches', COUNT(*) FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- 5. Do committed_data rows have period_id?
SELECT 
  COUNT(*) as total,
  COUNT(period_id) as with_period,
  COUNT(*) - COUNT(period_id) as without_period
FROM committed_data 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- 6. What periods exist?
SELECT id, label, canonical_key, period_type, status, start_date, end_date
FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- 7. Do calculation results exist?
SELECT cb.lifecycle_state, COUNT(cr.id) as result_count, SUM(cr.total_payout) as total_payout
FROM calculation_batches cb
LEFT JOIN calculation_results cr ON cr.batch_id = cb.id
WHERE cb.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
GROUP BY cb.lifecycle_state;
```

### 0E: Document findings

Create `OB-69_DIAGNOSTIC.md` at project root with:
1. **406 Root Cause:** Which profile query fails, why (missing row, wrong filter, .single() on zero results)
2. **Pipeline State:** What data exists, what's missing, what has period_id
3. **Code Path Audit:** Where each pipeline step lives (import → period → calc → dashboard)
4. **Broken Links:** Where the pipeline breaks (e.g., committed_data has no period_id, dashboard reads from wrong table)

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-0A | OB-69_DIAGNOSTIC.md exists | File check | All 4 sections with grep/SQL evidence |
| PG-0B | 406 root cause identified | Diagnostic section 1 | Specific file, line number, query that fails |
| PG-0C | Pipeline data state documented | SQL output pasted | Row counts for all 8 tables |

**Commit:** `OB-69 Phase 0: Diagnostic — profiles 406 root cause + pipeline state audit`

---

## ARCHITECTURE DECISION GATE (MANDATORY — BEFORE MISSION 1)

```
ARCHITECTURE DECISION RECORD — OB-69
=====================================

FINDING 1: 406 Root Cause
  Query: [exact query from diagnostic]
  Problem: [.single() on zero results / wrong filter / missing profile / etc.]
  Fix: [specific change — add .maybeSingle(), fix filter, ensure profile exists, etc.]

FINDING 2: Pipeline Data State  
  rule_sets: [N] rows
  entities: [N] rows
  periods: [N] rows (with canonical_key values: [...])
  committed_data: [N] total, [N] with period_id, [N] without
  calculation_results: [N] rows
  
  Pipeline gap: [where the chain breaks — no periods? no period_id? no calc results?]

---

DECISION 1: 406 Fix Approach

Problem: Profile query returns 406 on every page load.

Option A: Fix the query to use .maybeSingle() instead of .single()
  - Pro: Graceful handling of missing profiles.
  - Con: Masks the real issue if profile should exist.

Option B: Ensure demo persona auth_user_id has a matching profile row.
  - Pro: Fixes root cause — the data is wrong, not the code.
  - Con: Requires inserting/fixing profile data.

Option C: Fix both — .maybeSingle() for resilience + ensure profile data is correct.
  - Pro: Defense in depth.

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___

---

DECISION 2: Period Binding Strategy

Problem: committed_data rows may not have period_id. Calculation needs period_id to select data.

Option A: Fix import commit route to set period_id during import.
  - Already designed in HF-048. May be implemented but untested.

Option B: Post-import migration script that backfills period_id.
  - One-time fix for existing data. Doesn't fix the pipeline.

Option C: Fix import route (A) AND backfill existing data (B).
  - Ensures both existing and future data work.

CHOSEN: Option ___ because ___

---

DECISION 3: Dashboard Data Source

Problem: Dashboard must show real calculation results.

Option A: Dashboard reads from calculation_results directly.
  - Simple. Direct.
  
Option B: Dashboard reads from entity_period_outcomes (materialized view).
  - Pre-aggregated. Faster.
  - May not be populated.

CHOSEN: Option ___ based on [what diagnostic found about which tables have data]
```

### Proof gate

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-ADR | Architecture Decision committed | Git log | All 3 decisions with evidence |

**Commit:** `OB-69 Architecture Decision: 406 fix, period binding, dashboard source`

---

## MISSION 1: FIX THE 406 PROFILES ERROR (Max 5 proof gates)

### 1A: Based on Phase 0 findings, fix the root cause

The 406 error is systemic — it fires on every page. Fix it at the source.

**Common causes and fixes (reference — use diagnostic to determine which applies):**

**If `.single()` on zero results:**
```typescript
// WRONG — returns 406 when no row matches
const { data } = await supabase.from('profiles').select('*').eq('auth_user_id', uid).eq('tenant_id', tid).single();

// RIGHT — returns null when no row matches  
const { data } = await supabase.from('profiles').select('*').eq('auth_user_id', uid).eq('tenant_id', tid).maybeSingle();
```

**If wrong filter column:**
```typescript
// WRONG — profiles.id is NOT the same as auth.uid()
.eq('id', user.id)

// RIGHT — auth_user_id is the FK to auth.users
.eq('auth_user_id', user.id)
```

**If demo persona auth_user_id has no profile:**
The demo persona system provides a user ID that doesn't exist in the profiles table. Either:
- Create a profile row for that auth_user_id, OR
- Make the code handle missing profiles gracefully (show empty state, not error)

**IMPORTANT: Fix ALL instances of the pattern, not just one.** Use the grep from Phase 0 to find every broken query.

### 1B: Verify fix

After fixing, the verification MUST be done by making the actual HTTP request:

```bash
# Start dev server
cd web && rm -rf .next && npm run build && npm run dev

# In another terminal, curl localhost:3000 and check for 406 in response headers
# Or: open localhost:3000 in browser, open DevTools Network tab
# Filter by "profiles" — ZERO 406 responses
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1A | Root cause identified and documented | Diagnostic | Specific file, line, query |
| PG-1B | All profile .single() calls → .maybeSingle() or fixed filter | grep output | Zero remaining broken patterns |
| PG-1C | Zero 406 errors on localhost page load | Browser DevTools Network tab — PASTE screenshot or curl output | No 406 on profiles |
| PG-1D | /configure/users shows user count > 0 (if profiles exist) OR clean empty state (if no profiles) | Browser | Not a 406 error |
| PG-1E | Build clean | npm run build | Exit 0 |

```
COMPLIANCE CHECK — Mission 1
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — profiles table]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — N/A for query fix]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-13 (schema assumptions)]
□ Architecture Decision Record committed before code? [YES/NO]
□ Scale test: would this work for 2M records? [YES/NO — query is O(1)]
```

**Commit:** `OB-69 Mission 1: Fix 406 profiles error — [specific fix description]`

---

## MISSION 2: VERIFY PERIOD CREATION IN IMPORT PIPELINE (Max 5 proof gates)

### 2A: Trace the import commit code path

From Phase 0 diagnostic, find the import commit route and verify:

1. Does it create period records in the `periods` table?
2. Does it use SCHEMA_REFERENCE.md column names? (`canonical_key`, NOT `period_key`)
3. Does it set `period_id` on `committed_data` rows?
4. Does it use field mappings (AI-derived) to detect period, NOT hardcoded column names?

```bash
echo "=== Import commit route — full period logic ==="
COMMIT_ROUTE=$(find web/src/app/api -path "*import*commit*" -name "route.ts" | head -1)
echo "File: $COMMIT_ROUTE"
grep -n "period\|Period\|canonical_key" "$COMMIT_ROUTE" | head -30

echo ""
echo "=== Does it hardcode field names? (VIOLATION) ==="
grep -n "'año'\|'mes'\|'year'\|'month'\|'Año'\|'Mes'\|'fecha'\|'periodo'" "$COMMIT_ROUTE"
# Expected: ZERO — field detection should use AI mappings

echo ""
echo "=== Does it use canonical_key (correct) or period_key (wrong)? ==="
grep -n "canonical_key\|period_key" "$COMMIT_ROUTE"
```

### 2B: Fix if broken

If the import commit route:
- Does NOT create periods → add period creation using AI-mapped field values
- Uses `period_key` instead of `canonical_key` → fix column name
- Hardcodes Spanish field names → replace with field mapping lookup
- Does NOT set `period_id` on committed_data → add the FK binding

**Use AI field mappings to identify period columns.** The field mapping step produces semantic targets like `year`, `month`, `period`. The commit route should read these mappings, not hardcode column names.

### 2C: Backfill existing data (if needed)

If committed_data already exists but has NULL period_id, the fix needs a backfill:

```sql
-- ONLY run if diagnostic shows committed_data without period_id
-- AND periods exist that could be matched

-- This is a REFERENCE. Adapt based on actual data.
-- The logic: match committed_data.row_data period fields to periods.canonical_key

-- Step 1: Check what we're working with
SELECT DISTINCT 
  row_data->>'year' as year_val, 
  row_data->>'month' as month_val
FROM committed_data 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' 
AND period_id IS NULL
LIMIT 20;
```

**Do NOT run a blind UPDATE.** Understand the data first, then write a targeted fix.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-2A | Import commit route creates periods | Code review with line numbers | INSERT into periods with canonical_key |
| PG-2B | committed_data.period_id is set during import | Code review with line numbers | period_id assigned before INSERT |
| PG-2C | Zero hardcoded field names in period detection | grep output | No 'año', 'mes', 'year', 'month' literals |
| PG-2D | Existing committed_data has period_id (after backfill if needed) | SQL query output pasted | >80% of rows have non-null period_id |
| PG-2E | Periods table has correct rows | SQL query output pasted | COUNT > 0, canonical_key values shown |

```
COMPLIANCE CHECK — Mission 2
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — periods, committed_data]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — periods INSERT, committed_data UPDATE]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-5 (no hardcoded fields), AP-6 (no language-specific)]
□ Architecture Decision Record committed before code? [YES/NO]
□ Scale test: would this work for 2M records? [YES/NO — bulk operations, not per-row]
```

**Commit:** `OB-69 Mission 2: Period creation and binding verified in import pipeline`

---

## MISSION 3: VERIFY CALCULATION PRODUCES RESULTS (Max 5 proof gates)

### 3A: Verify calculation prerequisites exist

Before triggering a calculation, verify all inputs are available:

```sql
-- All must return > 0 for the test tenant
SELECT 'active_rule_sets' as check, COUNT(*) FROM rule_sets 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' AND status = 'active';

SELECT 'entities_with_assignments' as check, COUNT(*) FROM rule_set_assignments rsa 
JOIN entities e ON rsa.entity_id = e.id 
WHERE rsa.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

SELECT 'committed_data_with_period' as check, COUNT(*) FROM committed_data 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' AND period_id IS NOT NULL;

SELECT 'periods' as check, COUNT(*) FROM periods 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

### 3B: Trace the calculation code path

```bash
echo "=== Calculation trigger route ==="
CALC_ROUTE=$(find web/src/app/api -path "*calculat*run*" -name "route.ts" -o -path "*calculat*trigger*" -name "route.ts" | head -1)
echo "File: $CALC_ROUTE"

echo ""
echo "=== How it reads committed_data ==="
grep -n "committed_data\|from('committed_data')" "$CALC_ROUTE" 2>/dev/null || echo "Not in route — check orchestrator"

echo ""
echo "=== Orchestrator / calculation engine ==="
grep -rn "calculateBatch\|runCalculation\|orchestrat" web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== How it writes calculation_results ==="
grep -rn "calculation_results.*insert\|from('calculation_results').*insert" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== Does it create calculation_batches? ==="
grep -rn "calculation_batches.*insert\|from('calculation_batches').*insert" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10
```

### 3C: Fix any broken links in the chain

Based on diagnostic findings, fix whatever prevents calculation from producing results. Common issues:
- Calculation reads from wrong columns (use SCHEMA_REFERENCE.md)
- Calculation doesn't filter by period_id
- Results INSERT uses wrong column names (`calculation_batch_id` instead of `batch_id`)
- Orchestrator still reads from localStorage instead of Supabase

### 3D: Verify results exist after calculation

After any fixes, trigger a calculation (or verify one has already produced results):

```sql
-- After calculation runs
SELECT cb.id, cb.lifecycle_state, cb.entity_count, cb.started_at, cb.completed_at
FROM calculation_batches cb
WHERE cb.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY cb.created_at DESC LIMIT 5;

SELECT COUNT(*) as result_count, SUM(total_payout) as total, 
       AVG(total_payout) as avg_payout, MIN(total_payout) as min, MAX(total_payout) as max
FROM calculation_results 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-3A | Calculation prerequisites verified | SQL output pasted | All 4 checks return > 0 |
| PG-3B | Calculation code uses SCHEMA_REFERENCE.md column names | grep | batch_id (not calculation_batch_id), total_payout (top-level) |
| PG-3C | calculation_batches has rows | SQL output pasted | At least 1 batch for test tenant |
| PG-3D | calculation_results has rows with non-zero payouts | SQL output pasted | COUNT > 0, SUM > 0 |
| PG-3E | Results linked to correct period | SQL output pasted | period_id matches periods table |

```
COMPLIANCE CHECK — Mission 3
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — calculation_batches, calculation_results]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — calculation_results INSERT]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-1 (no JSON in HTTP), AP-2 (bulk operations)]
□ Architecture Decision Record committed before code? [YES/NO]
□ Scale test: would this work for 2M records? [YES/NO — bulk INSERT, chunked if needed]
```

**Commit:** `OB-69 Mission 3: Calculation engine verified — results in Supabase`

---

## MISSION 4: DASHBOARD READS REAL DATA (Max 5 proof gates)

### 4A: Find what the dashboard pages read

```bash
echo "=== Admin/Operate dashboard ==="
grep -rn "from('calculation_results')\|from('entity_period_outcomes')\|from('calculation_batches')" web/src/app/operate/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== Perform dashboard ==="
grep -rn "from('calculation_results')\|from('entity_period_outcomes')" web/src/app/perform/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== Dashboard service / data-fetching hooks ==="
grep -rn "getCalculationResults\|getDashboardData\|getPayoutSummary\|fetchResults" web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10
```

### 4B: Wire dashboard to read from Supabase

If dashboards show hardcoded/demo data instead of reading from calculation_results or entity_period_outcomes, fix them.

**The dashboard must:**
1. Query calculation_results (or entity_period_outcomes) for the selected period
2. Aggregate: total payout, entity count, average payout, top/bottom performers
3. Display real numbers, not placeholders
4. Handle empty state gracefully (no calc results yet → "Run a calculation first")

### 4C: Verify on localhost

Open the browser, navigate to the admin dashboard. **Real numbers must appear.**

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4A | Dashboard queries Supabase for calculation data | grep output | Reads from calculation_results or entity_period_outcomes |
| PG-4B | Dashboard shows non-zero payout numbers | Browser — PASTE what you see | Real numbers, not "$0" or "—" or placeholders |
| PG-4C | Period selector filters dashboard data | Browser test | Changing period changes numbers |
| PG-4D | Empty state handled | Browser test on period with no data | Shows message, not broken layout |
| PG-4E | Zero console errors on dashboard pages | DevTools Console | Clean |

```
COMPLIANCE CHECK — Mission 4
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO]
□ Searched for existing implementations before creating new files? [YES/NO]
□ Every state change persists to Supabase? [YES/NO — reads only, no writes]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-11 (no shell pages), AP-18 (real data)]
□ Architecture Decision Record committed before code? [YES/NO]
□ Scale test: would this work for 2M records? [YES/NO — pagination or aggregation]
```

**Commit:** `OB-69 Mission 4: Dashboard reads real calculation data from Supabase`

---

## MISSION 5: INTEGRATION CLT + BUILD (Max 5 proof gates)

### 5A: End-to-end pipeline trace

Document the complete chain with evidence. For each step, paste the SQL query AND its result:

```
E2E PIPELINE TRACE — OB-69
============================
1. Plan exists:     rule_sets row ID: [paste id], name: [paste], status: [paste]
2. Data imported:   committed_data COUNT: [paste], entities COUNT: [paste]
3. Periods created: [paste period rows with canonical_key]
4. Period binding:  committed_data with period_id: [paste count], without: [paste count]
5. Calculation ran:  batch ID: [paste], lifecycle: [paste], result count: [paste]
6. Results correct:  total payout: [paste $amount], entity count: [paste]
7. Dashboard live:   [paste what the browser shows — numbers, period, entity count]
8. 406 eliminated:   [paste Network tab showing zero 406 on page load]
```

### 5B: Build clean

```bash
cd web
rm -rf .next
npx tsc --noEmit
npm run build
npm run dev
# Confirm localhost:3000 responds
```

### 5C: Browser verification

Navigate through these pages on localhost, verify zero console errors:
1. Admin dashboard (Operate workspace)
2. Rep dashboard (Perform workspace)
3. /configure/users
4. /govern/calculation-approvals

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5A | E2E pipeline trace complete | Completion report section | All 8 steps documented with SQL evidence |
| PG-5B | Zero 406 errors on any page | Browser DevTools Network tab | No 406 responses |
| PG-5C | Build clean | npm run build | Exit 0, zero errors |
| PG-5D | Zero console errors on 4 key pages | Browser DevTools Console | Clean on all 4 |
| PG-5E | Dev server responds | curl localhost:3000 | 200 or 307 |

```
COMPLIANCE CHECK — Mission 5
=============================
□ Every column name verified against SCHEMA_REFERENCE.md? [YES/NO — all queries in this OB]
□ Searched for existing implementations before creating new files? [YES/NO — N/A integration]
□ Every state change persists to Supabase? [YES/NO — all data from DB]
□ Proof gates proven with pasted output, not described? [YES/NO]
□ Anti-Pattern Registry checked? [YES/NO — AP-9, AP-10 (no self-attestation)]
□ Architecture Decision Record committed before code? [YES/NO]
□ Scale test: would this work for 2M records? [YES/NO]
```

**Commit:** `OB-69 Mission 5: Integration verification — E2E pipeline trace + build clean`

---

## PHASE FINAL: COMPLETION REPORT + PR

### Completion report

Create `OB-69_COMPLETION_REPORT.md` at PROJECT ROOT **BEFORE final build** with:

1. **Diagnostic Summary** — 406 root cause, pipeline state, data counts
2. **Architecture Decisions** — 3 decisions with evidence
3. **Mission 1: 406 Fix** — what was broken, what was changed, zero-406 proof
4. **Mission 2: Period Binding** — period creation verified, committed_data period_id proof
5. **Mission 3: Calculation** — prerequisites check, result counts, payout totals
6. **Mission 4: Dashboard** — what the browser shows (paste actual numbers)
7. **Mission 5: Integration** — E2E pipeline trace, build clean, browser clean
8. **COMPLIANCE CHECKS** — All 5 mission compliance blocks (pasted, not summarized)
9. **ALL PROOF GATES** — 28 total, evidence for every gate
10. **STANDING RULE COMPLIANCE**
11. **KNOWN ISSUES**

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

### COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-69_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

### Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-69: Import-to-Calculation Pipeline E2E + Profiles 406 Fix" \
  --body "## What This OB Delivers

### Mission 1: 406 Profiles Fix
- Root cause: [description]
- Fix: [description]  
- Zero 406 errors on any page load

### Mission 2: Period Binding
- Import commit route creates periods with correct schema
- committed_data.period_id populated
- Zero hardcoded field names in period detection

### Mission 3: Calculation Verified
- Prerequisites: rule_sets, entities, assignments, periods all present
- Calculation produces results with non-zero payouts
- Results linked to correct periods

### Mission 4: Dashboard Wired
- Dashboard reads from Supabase (not demo/placeholder data)
- Real numbers displayed for payouts, entities, attainment

### Mission 5: Integration
- E2E pipeline trace: plan → data → periods → calc → dashboard
- Zero console errors on key pages
- Build clean

## Proof Gates: 29 — see OB-69_COMPLETION_REPORT.md
## Compliance Checks: 5 mission-level blocks in report"
```

**Commit:** `OB-69 Final: Build verification, completion report, PR`

---

## CONTEXT: WHAT EXISTS TODAY

### From OB-68 (just completed):
- Disputes persist to Supabase (API routes live)
- Approvals persist to Supabase (API routes live, approval_requests table created)
- Lifecycle immutability enforced (VALID_TRANSITIONS)
- Centralized audit logger (audit-logger.ts)

### From OB-67:
- Three-layer authorization: middleware → RequireRole → useCanPerform
- /configure/users page (shows 0 users due to 406)
- /unauthorized page renders

### Known data (RetailCDMX tenant):
- Tenant ID: `9b2bb4e3-6828-4451-b3fb-dc384509494f`
- Has entities, committed_data, rule_sets from prior imports
- Period binding status unknown (diagnostic will determine)
- Calculation has run at least once (APPROVED/CLOSED batches exist per OB-68 diagnostic)

### Anti-patterns to watch:
- **AP-5/AP-6**: No hardcoded field names or language-specific strings in period detection
- **AP-8**: Migrations must be EXECUTED, not just filed
- **AP-9/AP-10**: Proof gates verify LIVE state with pasted output
- **AP-13**: EVERY column name from SCHEMA_REFERENCE.md, no exceptions
- **AP-14**: Atomic operations — period creation + committed_data binding in same transaction

---

## MAXIMUM SCOPE

This OB has **5 missions + Phase 0 + Architecture Decision + Phase Final = 7 phases total.**
This produces **29 proof gates** (within the 25-35 limit).

**DO NOT add scope.** Do not build reconciliation. Do not build the AI assessment panels. Do not refactor the calculation engine. Do not add new dashboard features. The scope is:

1. 406 fixed ✓
2. Periods created during import ✓
3. committed_data has period_id ✓
4. Calculation produces results ✓
5. Dashboard shows real numbers ✓
6. All proven with evidence ✓

That's it. Nothing more. OB-70 handles hardcoding cleanup and polish. Stay focused.

---

*OB-69 — February 20, 2026*
*"The pipeline either works end-to-end or it doesn't. There is no 'partially works.'"*
