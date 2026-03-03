# OB-143: FIX "RULE SET HAS NO COMPONENTS" — THE ONLY BLOCKER
## Database Has 6 Components. UI Shows 0. Fix the Code.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `ENGINE_CONTRACT.md` — **THE critical document: 5-table boundary between pipeline and engine**
4. `ENGINE_CONTRACT_BINDING.sql` — the proven binding script that fulfilled the contract
5. `CLT-142_BROWSER_FINDINGS.md` — 10 findings, 5 P0. Finding F02 is the target of this OB.

**Read all five before writing any code.**

---

## CONTEXT: WHY THIS IS THE MOST IMPORTANT OB

142 OBs have been executed. The Engine Contract — the formal specification of 5 tables the calculation engine requires — was discovered, documented, and **fulfilled via SQL**:

| Requirement | Value |
|------------|-------|
| entity_count | 741 |
| period_count | 4 |
| active_plans | 1 |
| component_count | 6 |
| assignment_count | 741 |
| bound_data_rows | 114,807 |
| orphaned_data_rows | 4,340 |

The database is correct. The engine has everything it needs. **One code bug** prevents the calculation from running: the calculate page shows "Rule set has no components" despite the database having a valid 6-element JSONB array.

This OB fixes that one bug and proves the calculation produces a real number on screen.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Fix logic not data.
7. **No new pages.** Fix existing code paths.

---

## PHASE 0: ENGINE CONTRACT VERIFICATION (DIAGNOSTIC — NO CODE CHANGES)

Before touching any code, prove the database state is correct.

### 0A: Run the Engine Contract verification query

```bash
# Connect to Supabase and run the verification query
# Use whatever method is established (supabase CLI, psql, or API)
```

```sql
WITH t AS (
  SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1
)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entity_count,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = t.id) as period_count,
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = t.id AND status = 'active') as active_plans,
  (SELECT COALESCE(jsonb_array_length(components), 0) FROM rule_sets WHERE tenant_id = t.id AND status = 'active' LIMIT 1) as component_count,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignment_count,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NOT NULL AND period_id IS NOT NULL) as bound_data_rows,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND (entity_id IS NULL OR period_id IS NULL)) as orphaned_data_rows
FROM t;
```

**Expected result:** entity_count=741, period_count=4, active_plans=1, component_count=6, assignment_count=741, bound_data_rows≈114807, orphaned_data_rows≈4340.

**If component_count ≠ 6: STOP.** The database state has changed. Do not proceed. Report the actual values.

### 0B: Verify the components column directly

```sql
SELECT 
  id,
  name,
  status,
  jsonb_typeof(components) as components_type,
  jsonb_array_length(components) as components_length,
  components
FROM rule_sets 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND status = 'active';
```

**Expected:** `components_type = 'array'`, `components_length = 6`. Paste the FULL `components` JSON output into the completion report.

**Proof gate PG-00:** Engine Contract verification query returns expected values. Paste the full SQL output.

**No commit for Phase 0 — this is diagnostic only.**

---

## PHASE 1: FIND THE BUG

### 1A: Search for the error message

```bash
echo "=== FIND 'has no components' or 'no components' ==="
grep -rn "has no components\|no components\|No components" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== FIND where components are read from rule_sets ==="
grep -rn "\.components\b\|components\s*=\|components\s*:\|getComponents\|parseComponents" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== FIND the calculate API route ==="
find web/src -path "*api*calculat*" -name "route.ts" | head -10

echo ""
echo "=== FIND the calculate page component ==="
find web/src -path "*calculat*" -name "page.tsx" -o -path "*calculat*" -name "*.tsx" | head -10

echo ""
echo "=== FIND where rule_sets are fetched (Supabase select) ==="
grep -rn "from.*rule_sets\|\.from('rule_sets')\|supabase.*rule_sets" web/src/ --include="*.ts" --include="*.tsx" | head -20
```

### 1B: Read the calculate page and API route

For EACH file found above, read the relevant sections. Focus on:

1. **Where does the UI fetch the rule set?** — Is it calling an API route or reading Supabase directly?
2. **What columns does the select include?** — Does it select `components`? Or does it select specific columns and OMIT components?
3. **How does the code parse components?** — Does it expect `components` to be a property of the rule_set, or does it look somewhere else?
4. **Where does the "has no components" message originate?** — What condition triggers it?

### 1C: Identify the EXACT bug

The bug is one of these:

| # | Hypothesis | How to Confirm |
|---|-----------|----------------|
| A | Supabase `.select()` doesn't include `components` | Find the select query — check if it uses `.select('*')` or a column list missing `components` |
| B | Code reads `rule_set.components` but Supabase returns it as a string that needs JSON.parse | Check if the code does `JSON.parse(components)` or expects it to already be an object |
| C | Code checks `components.length === 0` but the value is `null` or `undefined` | Check the conditional that triggers the error message |
| D | The select uses a JOIN or view that flattens/loses the components field | Check for any transformations between fetch and render |
| E | Code reads from a different column name (e.g., `rule_set_components` or `component_list`) | Check the property name used in the code vs the actual column name |
| F | The API route returns the rule_set but strips components from the response | Check the API route's return statement |

**Document which hypothesis is correct and paste the EXACT code that causes the failure.** Include file path and line numbers.

**Proof gate PG-01:** Root cause identified with file:line evidence. Paste the buggy code.

**Commit:** `OB-143 Phase 1: Diagnostic — root cause identified for "Rule set has no components"`

---

## PHASE 2: FIX THE BUG

Apply the minimal fix. Do NOT refactor, do NOT add features, do NOT restructure. Change only what is necessary to make the existing code read the 6-element components array from the database.

**Rules:**
- If the fix is adding `components` to a `.select()` call, that's the entire fix.
- If the fix is adding `JSON.parse()`, that's the entire fix.
- If the fix is changing a null check, that's the entire fix.
- Do NOT add new API routes. Do NOT create new components. Do NOT restructure the calculate page.

### After the fix:

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

**Build must exit 0.** If it doesn't, fix the build error and retry.

**Proof gate PG-02:** Minimal fix applied. Build exits 0. Paste the EXACT diff (before/after) of every file changed.

**Commit:** `OB-143 Phase 2: Fix "Rule set has no components" — [describe the specific fix]`

---

## PHASE 3: VERIFY IN BROWSER

### 3A: Start dev server and verify

```bash
cd /path/to/spm-platform/web
rm -rf .next
npm run build
npm run dev &
sleep 8
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 3B: Browser verification instructions

Document these steps for Andrew to execute in browser:

1. Navigate to localhost:3000
2. Log in as VL Admin
3. Select Óptica Luminar tenant
4. Navigate to Operate → Calculate (or wherever the calculation trigger lives)
5. Select period: Enero 2024
6. Click Calculate / Run Calculation

**Expected outcomes:**
- "Rule set has no components" error DOES NOT appear
- The plan card shows 6 components
- Calculation runs and produces results (MX$ amounts visible)

### 3C: If the calculation page shows a DIFFERENT error after the fix

Document the new error exactly. It may be:
- Period not found → Check if the period selector shows Enero 2024
- No assignments → Check the assignment count query
- No data for period → Check bound_data_rows for Enero 2024 specifically

For any new error, trace it the same way: find the error message in code, find the condition, check the database, fix the condition.

**Proof gate PG-03:** localhost:3000 responds. Build is clean. Dev server running. Document the browser test instructions.

**Commit:** `OB-143 Phase 3: Browser verification prepared`

---

## PHASE 4: SECONDARY FIX — TENANT LANDING REDIRECT

This has been flagged in CLT-137, CLT-139, CLT-142, and multiple prior CLTs. When VL Admin selects a tenant, they land on `/operate/calculate` instead of `/operate/overview`.

### 4A: Find the redirect

```bash
echo "=== FIND tenant selection redirect ==="
grep -rn "operate/calculate\|/calculate\|redirect.*operat" web/src/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== FIND tenant selection handler ==="
grep -rn "selectTenant\|setTenant\|tenantSelect\|onTenantChange\|tenant.*select" web/src/ --include="*.ts" --include="*.tsx" | head -20
```

### 4B: Change the redirect

Change the post-tenant-selection redirect from `/operate/calculate` to `/operate/overview`.

If `/operate/overview` doesn't exist as a route, check what routes exist under `/operate/`:

```bash
find web/src/app -path "*operate*" -type d | head -10
ls web/src/app/operate/ 2>/dev/null || ls web/src/app/\(app\)/operate/ 2>/dev/null
```

Redirect to the appropriate landing page (overview, dashboard, or the first meaningful page in the operate workspace).

**Proof gate PG-04:** Tenant selection redirects to overview (not calculate). Paste the diff.

**Commit:** `OB-143 Phase 4: Tenant landing redirects to /operate/overview`

---

## PHASE 5: COMPLETION REPORT + PR

### 5A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
npm run dev &
sleep 8
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
kill %1 2>/dev/null
```

### 5B: Re-run Engine Contract verification query

Run the same query from Phase 0A. Paste the output. Confirm it still matches expected values (the fix should NOT have changed any database state — this OB is code-only).

### 5C: Completion report

Save as `OB-143_COMPLETION_REPORT.md` in **PROJECT ROOT**.

Structure:

```markdown
# OB-143 COMPLETION REPORT
## Fix "Rule set has no components" + Tenant Landing Redirect

### Phase 0: Engine Contract Verification (Pre-Fix)
[Paste SQL output]

### Phase 1: Root Cause
- Bug location: [file:line]
- Root cause: [which hypothesis from the list]
- Buggy code: [paste the exact code]

### Phase 2: Fix Applied
- Files changed: [list with line numbers]
- Diff: [paste before/after for each file]
- Build: exits 0

### Phase 3: Browser Verification
- localhost:3000: [status code]
- Browser test instructions documented: YES
- **Andrew must verify in browser:**
  - [ ] Navigate to Óptica Luminar → Calculate
  - [ ] "Rule set has no components" error is GONE
  - [ ] 6 components visible on plan card
  - [ ] Select Enero 2024 → Run Calculation
  - [ ] MX$ amount appears (target: MX$1,253,832 or component-level trace)

### Phase 4: Tenant Landing
- Redirect changed from: [old path]
- Redirect changed to: [new path]
- Diff: [paste]

### Phase 5: Engine Contract Verification (Post-Fix)
[Paste SQL output — must match Phase 0]

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | ✅/❌ | Engine Contract query returns expected values |
| PG-01 | ✅/❌ | Root cause identified with file:line |
| PG-02 | ✅/❌ | Fix applied, build exits 0, diff pasted |
| PG-03 | ✅/❌ | localhost responds, browser test documented |
| PG-04 | ✅/❌ | Tenant landing redirect fixed |

### Files Changed
[List every file touched with the nature of the change]

### What This OB Does NOT Fix
- Pipeline construction layer (SCI doesn't create entities/periods/assignments) → OB-144
- 4,340 orphaned rows (No_Tienda store-level data) → Future OB
- SCI proposal UX refinements → Future OB
- N+1 query optimization → Future OB
```

### 5D: Create PR

```bash
gh pr create --base main --head dev --title "OB-143: Fix 'Rule set has no components' + tenant landing redirect" --body "## What
- Fixed the calculate page bug where UI showed 'Rule set has no components' despite database having 6 valid components
- Fixed tenant selection landing to redirect to /operate/overview instead of /operate/calculate

## Root Cause
[one-line description of the bug]

## Engine Contract
Database state verified before and after — no data changes. Code-only fix.

## Proof Gates
PG-00 through PG-04 documented in OB-143_COMPLETION_REPORT.md

## Browser Verification Required
Andrew must verify in browser before merge."
```

**Proof gate PG-05:** PR created with descriptive title and body. Completion report committed to project root.

**Commit:** `OB-143 Phase 5: Completion report + PR`

---

## WHAT THIS OB IS NOT

- **NOT a pipeline fix.** The SCI pipeline still doesn't construct entities/periods/assignments. That's OB-144.
- **NOT a data fix.** The database is correct. The Engine Contract is fulfilled. This is a CODE fix.
- **NOT a refactor.** Minimal changes only. If the fix is one line, the OB is one line.
- **NOT a new feature.** The calculation engine works. The UI just can't read the data that's already there.

## WHAT SUCCESS LOOKS LIKE

After this OB, Andrew opens a browser, navigates to Óptica Luminar's calculate page, selects Enero 2024, clicks Calculate, and sees a MX$ number on screen. The "Rule set has no components" error is gone. The plan card shows 6 components. The tenant landing goes to overview, not calculate.

That's it. One bug fix. One redirect fix. One number on screen.

---

## CC ANTI-PATTERNS — SPECIFIC TO THIS OB

| Anti-Pattern | What CC Has Done Before | What To Do Instead |
|---|---|---|
| Refactor the calculate page | "While fixing the bug I also restructured..." | Fix the ONE bug. Nothing else. |
| Add a new API route | "Created /api/v2/calculate with improved..." | Fix the EXISTING route. No new routes. |
| Change the database | "Added a components_parsed column..." | The database is CORRECT. Change the CODE. |
| Report "PASS" without browser proof | "Build exits 0 so PG-03 PASS" | PG-03 requires localhost responding + browser instructions documented |
| Hardcode components | "Added fallback components array..." | The data is in the DB. Make the code READ it. |
| Skip Phase 0 | "The database state was verified last session..." | Run the query NOW. State may have changed. Paste the output. |

---

*"The engine never broke. The pipeline never filled the contract. And now the contract IS filled — the code just needs to read it."*
