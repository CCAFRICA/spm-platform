# CLT-113: SYSTEM-VERIFIED ACCEPTANCE TEST — PLATFORM TRUTH ASSESSMENT
## Date: February 28, 2026
## Scope: Full platform state verification across 3 tenants
## Purpose: Establish ground truth of what works, what's broken, and WHERE in the code each problem lives

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference

**Read both before doing anything else.**

---

## WHY THIS CLT IS DIFFERENT

Previous OBs reported 25/25 proof gates while the browser showed 51 failures. The gap: CC verified CODE STRUCTURE (grep, build, file diffs) instead of USER-VISIBLE OUTPUT.

**This CLT makes NO code changes.** It is a pure diagnostic. CC will:

1. Query the live database to establish data truth
2. Start the dev server and navigate to actual pages
3. Use `curl` and browser automation to capture what RENDERS
4. Compare rendered output to database truth
5. For every discrepancy, trace the value from the UI element backward through the code to find the EXACT line where truth becomes lie

**The output is a comprehensive truth report that tells Andrew exactly where the platform stands — no claims, no "PASS based on code review," just facts.**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Git from repo root (spm-platform), NOT web/.**
4. **Commit this prompt to git as first action.**
5. **This CLT makes ZERO code changes. Diagnostic only.**
6. **Every finding must include: what the UI shows, what the DB says, and the file:line where the discrepancy originates.**

---

## PHASE 0: ESTABLISH DATABASE TRUTH (30 min)

Before looking at ANY UI, query the database directly. This is the ground truth everything else is measured against.

### 0A: Tenant inventory

```sql
SELECT id, name, slug, features, locale, currency
FROM tenants
WHERE name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
ORDER BY name;
```

For each tenant, record:
- Tenant ID
- Features JSONB (what modules are enabled?)
- Locale and currency

### 0B: Entity counts per tenant

```sql
SELECT t.name as tenant, COUNT(DISTINCT e.id) as entity_count, COUNT(DISTINCT e.external_id) as unique_external_ids
FROM entities e
JOIN tenants t ON e.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name;
```

### 0C: Period counts per tenant

```sql
SELECT t.name as tenant, COUNT(*) as period_count, 
  array_agg(p.label ORDER BY p.start_date) as period_labels,
  array_agg(p.canonical_key ORDER BY p.start_date) as canonical_keys
FROM periods p
JOIN tenants t ON p.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name;
```

### 0D: Rule set counts and names per tenant

```sql
SELECT t.name as tenant, COUNT(*) as rule_set_count,
  array_agg(rs.name ORDER BY rs.name) as rule_set_names
FROM rule_sets rs
JOIN tenants t ON rs.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name;
```

### 0E: Rule set assignment counts per tenant

```sql
SELECT t.name as tenant, COUNT(*) as assignment_count,
  COUNT(DISTINCT rsa.entity_id) as assigned_entities,
  COUNT(DISTINCT rsa.rule_set_id) as assigned_rule_sets
FROM rule_set_assignments rsa
JOIN tenants t ON rsa.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name;
```

### 0F: Committed data counts per tenant

```sql
SELECT t.name as tenant, COUNT(*) as committed_rows,
  COUNT(DISTINCT cd.entity_id) as entities_with_data,
  COUNT(DISTINCT cd.period_id) as periods_with_data
FROM committed_data cd
JOIN tenants t ON cd.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name;
```

### 0G: Calculation results per tenant

```sql
SELECT t.name as tenant, COUNT(*) as result_count,
  COUNT(DISTINCT cr.entity_id) as calculated_entities,
  SUM(cr.total_payout) as total_payout_sum,
  COUNT(DISTINCT cr.period_id) as calculated_periods,
  COUNT(DISTINCT cr.rule_set_id) as calculated_rule_sets
FROM calculation_results cr
JOIN tenants t ON cr.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name;
```

### 0H: Calculation batches per tenant

```sql
SELECT t.name as tenant, cb.lifecycle_state, COUNT(*) as batch_count
FROM calculation_batches cb
JOIN tenants t ON cb.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name, cb.lifecycle_state
ORDER BY t.name, cb.lifecycle_state;
```

### 0I: Import batches per tenant

```sql
SELECT t.name as tenant, ib.status, COUNT(*) as batch_count,
  array_agg(DISTINCT ib.file_name) as file_names
FROM import_batches ib
JOIN tenants t ON ib.tenant_id = t.id
WHERE t.name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar')
GROUP BY t.name, ib.status
ORDER BY t.name;
```

### 0J: Tenant features — what does the routing logic actually see?

```sql
SELECT name, 
  features->'financial' as financial_feature,
  features->'icm' as icm_feature,
  features->>'primary_module' as primary_module,
  features
FROM tenants
WHERE name IN ('Sabor Grupo Gastronomico', 'Mexican Bank Co', 'Óptica Luminar');
```

**This is critical for F-1 diagnosis.** The routing code in HF-076 checks `features` to determine landing page. If the JSONB shape doesn't match what the code expects, routing will always fail regardless of code correctness.

### Commit Phase 0

Write ALL query results to `CLT-113_DATABASE_TRUTH.md` at project root. This is the reference document for all subsequent phases.

```
CLT-113 DATABASE TRUTH REPORT
==============================
Generated: [timestamp]
Source: Live Supabase queries

TENANT: Sabor Grupo Gastronomico
  ID: [uuid]
  Features: [full JSONB]
  Entities: [count]
  Periods: [count] — [labels]
  Rule Sets: [count] — [names]
  Assignments: [count entities] assigned to [count rule sets]
  Committed Data: [rows] across [entities] entities and [periods] periods
  Calculation Results: [count] — Total payout: [sum]
  Calculation Batches: [state]: [count]
  Import Batches: [status]: [count] — Files: [names]

TENANT: Mexican Bank Co
  [same structure]

TENANT: Óptica Luminar
  [same structure]
```

**Commit:** `CLT-113 Phase 0: Database truth established`

---

## PHASE 1: ROUTING TRUTH — WHERE DOES EACH TENANT ACTUALLY LAND? (20 min)

### 1A: Find the routing code

Read the routing/redirect logic that determines where a user lands after login. This was implemented in HF-076. Find:

```bash
grep -rn "getModuleLanding\|primary_module\|financial.*pulse\|redirect\|router.push\|router.replace" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next
```

For each redirect/routing location found, document:
- File and line number
- What condition it checks
- What value it redirects to
- What the ACTUAL tenant features JSONB contains (from Phase 0J)

### 1B: Compare code expectations to data reality

The routing code expects tenant.features to have a certain shape. Phase 0J told us what the actual shape is.

Document:
```
ROUTING ANALYSIS
================
Code location: [file:line]
Code expects: features.primary_module === 'financial'
Sabor actually has: features = [paste actual JSONB]
Match: YES/NO
Expected behavior: redirect to /financial/pulse
Actual behavior (from CLT-112): lands on /data/import/enhanced

Root cause: [specific mismatch between code expectation and data shape]
```

### 1C: Do this for ALL THREE tenants

| Tenant | Expected Landing | Code Logic | Data Shape Match? | Actual Landing |
|--------|-----------------|------------|-------------------|----------------|
| Sabor | /financial/pulse | [code condition] | [yes/no — why] | /data/import/enhanced |
| MBC | /operate/calculate or /data/import/enhanced | [code condition] | [yes/no — why] | /admin/launch/calculate |
| Óptica | /operate/calculate | [code condition] | [yes/no — why] | [unknown — test] |

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Database truth document created with all query results | File exists with pasted query output |
| PG-02 | Routing code location identified with file:line | Specific lines documented |
| PG-03 | Mismatch between code expectation and data shape documented for each tenant | Root cause identified per tenant |

**Commit:** `CLT-113 Phase 1: Routing truth — code vs data comparison`

---

## PHASE 2: CONFIDENCE SCORE TRUTH — TRACE THE 50% (30 min)

The Sheet Analysis page shows "50% confidence" on every file card. This has persisted through 6 CLTs and 2 OBs that claimed to fix it. This phase traces the value from the rendered element backward to its origin.

### 2A: Find every confidence value in the import page

```bash
grep -n "confidence\|Confidence\|classificationConfidence\|analysisConfidence" web/src/app/data/import/enhanced/page.tsx
```

For EACH match, document:
- Line number
- Variable name
- Where that variable is SET (trace backward)
- What sets THAT variable (keep tracing)
- Until you reach either: an API response, a hardcoded value, or a calculation

### 2B: Find the AI classification API call

```bash
grep -rn "analyze-workbook\|classify\|classification\|sheet.*analysis" web/src/app/api/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next
```

Read the API route. Document:
- Does the Anthropic API call return a confidence score?
- If yes, where does that score go after the API returns?
- If no, where does the UI get its confidence from?

### 2C: Build the full trace

```
CONFIDENCE TRACE
================
UI displays: "50% confidence" on each file card
  ↑ Rendered at: [file:line] — variable: [name]
  ↑ Set by: [file:line] — expression: [code]
  ↑ Comes from: [file:line] — [API response field / state variable / hardcoded]
  ↑ Originally set by: [file:line] — [the actual source]

ROOT CAUSE: [e.g., "API response has confidence field but it's never extracted" 
             or "Default value of 0.5 assigned when classification hasn't run"
             or "Sheet classification uses a different API than field mapping — 
                 field mapping returns confidence, sheet classification doesn't"]

FIX LOCATION: [exact file:line where the correct value exists but isn't being passed through]
```

### 2D: Check if OB-113's changes actually execute

OB-113 claimed to fix confidence. Read the OB-113 changes:

```bash
git log --oneline --all | head -20
# Find OB-113 commits
git diff [OB-113 first commit]..[OB-113 last commit] -- web/src/app/data/import/enhanced/page.tsx
```

Document what OB-113 actually changed regarding confidence, and whether those changes affect the "50% confidence" displayed on Sheet Analysis cards.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-04 | Full trace from UI "50%" to source with file:line at every step | Complete chain documented |
| PG-05 | Root cause identified — not "hardcoded" but WHERE and WHY | Specific mechanism documented |
| PG-06 | OB-113 confidence changes assessed — did they touch the right variable? | Yes/No with evidence |

**Commit:** `CLT-113 Phase 2: Confidence trace — 50% source identified`

---

## PHASE 3: PLAN CONTEXT TRUTH — WHY WRONG PLAN EVERYWHERE (20 min)

The UI shows "CFG Insurance Referral Program 2024" across all pages for MBC, even on deposit data. This phase traces why.

### 3A: Find plan selection/context logic

```bash
grep -rn "activePlan\|selectedPlan\|currentPlan\|rule_set\|planId\|plan_id" web/src/app/data/import/enhanced/page.tsx | head -40
```

### 3B: Trace the active plan from page load to display

Document:
- When the import page loads, how is the "active plan" determined?
- Is it the first plan alphabetically? The most recently created? User-selected?
- Where does the plan selector component get its options?
- When a plan is selected, does it filter to show only relevant files/fields?

### 3C: Why does MBC show 5 plans instead of 4?

Query:
```sql
SELECT rs.id, rs.name, rs.status, rs.created_at
FROM rule_sets rs
JOIN tenants t ON rs.tenant_id = t.id
WHERE t.name = 'Mexican Bank Co'
ORDER BY rs.name;
```

Compare to what the UI shows. Is there a duplicate? A test plan? A plan from a different tenant bleeding through?

### 3D: Document the chain

```
PLAN CONTEXT TRACE
==================
UI shows: "CFG Insurance Referral Program 2024" on deposit import
  ↑ Plan displayed at: [file:line]
  ↑ Plan selected by: [file:line] — logic: [first in array / alphabetical / etc.]
  ↑ Plan list loaded from: [API call / Supabase query]
  ↑ Plans in DB: [list all 4 or 5 with IDs]

WHY WRONG PLAN: [e.g., "alphabetical sort puts CFG Insurance first" or "plan ID cached from previous session"]
WHY 5 NOT 4: [e.g., "duplicate rule_set row" or "test plan not cleaned up"]
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-07 | Plan selection logic documented with file:line | How active plan is chosen |
| PG-08 | 5-vs-4 plan discrepancy explained | DB query vs UI comparison |
| PG-09 | Wrong-plan-on-deposit-data root cause identified | Specific logic traced |

**Commit:** `CLT-113 Phase 3: Plan context trace — wrong plan source identified`

---

## PHASE 4: VALIDATE/APPROVE PAGE TRUTH — WHAT'S FAKE, WHAT'S REAL (20 min)

### 4A: Trace every metric on the Validate page

For each displayed metric, trace to source:

| Displayed Metric | File:Line | Source Expression | Real or Fake? | If Fake, What's the Real Value? |
|---|---|---|---|---|
| "Quality: X%" | | | | |
| "Completeness: X%" | | | | |
| "Consistency: X%" | | | | |
| "X/Y required fields mapped" | | | | |
| "X% match" (cross-sheet) | | | | |
| Record count per sheet | | | | |
| Period detection results | | | | |
| Calculation Preview values | | | | |

### 4B: Trace every metric on the Approve page

| Displayed Metric | File:Line | Source Expression | Real or Fake? |
|---|---|---|---|
| Per-file confidence % | | | |
| "X Sheets" | | | |
| "X Records" | | | |
| "X Mapped Fields" | | | |
| "X% AI Confidence" | | | |
| Plan components listed | | | |

### 4C: Identify what OB-113 actually changed

```bash
# Show the exact diff
git show [OB-113 commit hash] -- web/src/app/data/import/enhanced/page.tsx | head -200
```

Document which of the above metrics OB-113 touched and which it didn't.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-10 | Every Validate page metric traced to source with Real/Fake assessment | Complete table |
| PG-11 | Every Approve page metric traced to source with Real/Fake assessment | Complete table |
| PG-12 | OB-113 changes mapped to specific metrics — which were touched, which weren't | Gap analysis |

**Commit:** `CLT-113 Phase 4: Validate/Approve metric truth`

---

## PHASE 5: CALCULATION PIPELINE TRUTH — WHY $0.00 (30 min)

This is the most important phase. The calculation engine is proven at 100% accuracy for Óptica. But MBC/Caribe produces $0.00. Why?

### 5A: Check if calculation has ever been run for MBC

```sql
SELECT cb.id, cb.lifecycle_state, cb.entity_count, cb.started_at, cb.completed_at,
  rs.name as rule_set_name, p.label as period_label
FROM calculation_batches cb
JOIN tenants t ON cb.tenant_id = t.id
LEFT JOIN rule_sets rs ON cb.rule_set_id = rs.id
LEFT JOIN periods p ON cb.period_id = p.id
WHERE t.name = 'Mexican Bank Co'
ORDER BY cb.created_at DESC;
```

### 5B: Check calculation results for MBC

```sql
SELECT cr.entity_id, cr.total_payout, cr.components, e.display_name, e.external_id
FROM calculation_results cr
JOIN tenants t ON cr.tenant_id = t.id
LEFT JOIN entities e ON cr.entity_id = e.id
WHERE t.name = 'Mexican Bank Co'
LIMIT 20;
```

### 5C: Check rule_set input_bindings — what does the engine expect?

```sql
SELECT rs.name, rs.input_bindings, rs.components
FROM rule_sets rs
JOIN tenants t ON rs.tenant_id = t.id
WHERE t.name = 'Mexican Bank Co'
ORDER BY rs.name;
```

Document for EACH rule set:
- What input_bindings does it expect? (These define what data fields feed into the calculation)
- What components does it have? (These define what gets calculated)
- Does the committed_data have fields that match the input_bindings?

### 5D: Check committed_data structure for MBC

```sql
SELECT cd.row_data, cd.data_type, cd.metadata
FROM committed_data cd
JOIN tenants t ON cd.tenant_id = t.id
WHERE t.name = 'Mexican Bank Co'
LIMIT 5;
```

Look at `row_data` JSONB keys. These are the field names available to the engine.
Compare to input_bindings from 5C.

### 5E: Trace the binding gap

```
CALCULATION BINDING TRACE
=========================
Rule Set: "Deposit Growth Incentive — Q1 2024"
  Engine expects (input_bindings): [paste bindings]
  
Committed Data has (row_data keys): [paste keys from one sample row]

MATCH ANALYSIS:
  Engine expects "attainment_metric" → committed_data has: [nothing / "TotalDepositBalance" / ???]
  Engine expects "entity_identifier" → committed_data has: [nothing / "OfficerID" / ???]
  Engine expects "period_reference" → committed_data has: [nothing / "SnapshotPeriod" / ???]
  
BINDING GAP: [specific fields the engine needs but can't find in committed_data because
              the field mapping step produces TYPE labels (Amount, Date, Entity ID) 
              but the engine needs SEMANTIC bindings (which Amount is the attainment metric?)]
```

### 5F: Verify Óptica still works (regression baseline)

```sql
SELECT COUNT(*) as result_count, SUM(total_payout) as total_payout
FROM calculation_results cr
JOIN tenants t ON cr.tenant_id = t.id
WHERE t.name LIKE '%ptica%';
```

Expected: 719 results, total ≈ MX$1,253,832.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-13 | MBC calculation batch state documented | Has calculation been attempted? |
| PG-14 | MBC calculation results documented | $0.00 confirmed or actual values found |
| PG-15 | Input_bindings vs committed_data comparison completed | Binding gap mapped |
| PG-16 | Specific missing binding identified | The exact field the engine can't find |
| PG-17 | Óptica regression confirmed | 719 results, ~$1,253,832 |

**Commit:** `CLT-113 Phase 5: Calculation binding truth — $0.00 root cause`

---

## PHASE 6: REQUEST COUNT TRUTH — N+1 DIAGNOSIS (15 min)

Pages load 174-458 requests. This phase identifies why.

### 6A: Find context providers and data fetching hooks

```bash
grep -rn "useEffect.*fetch\|useSWR\|useQuery\|supabase.*from\|\.select(" web/src/app/data/import/enhanced/page.tsx | wc -l
echo "---"
grep -rn "useEffect.*fetch\|useSWR\|useQuery\|supabase.*from\|\.select(" web/src/app/data/import/enhanced/page.tsx | head -30
```

```bash
# Check layout files for repeated queries
grep -rn "supabase.*from\|\.select(" web/src/app/layout.tsx web/src/app/operate/layout.tsx web/src/app/data/layout.tsx 2>/dev/null | head -20
```

### 6B: Count distinct Supabase queries in the import page

```bash
grep -c "\.from(" web/src/app/data/import/enhanced/page.tsx
```

### 6C: Identify the top repeated queries

From the CLT-112 screenshots, the Network panel shows repeated calls to:
- `rule_sets?select=...`
- `profiles?select=...`
- `calculation_batches?select=...`
- `periods?select=...`
- `entities?select=...`
- `committed_data?select=...`

Find where each of these is called and whether it's in a useEffect, a re-render loop, or a context provider that re-fetches on every state change.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-18 | Number of distinct Supabase queries in import page documented | Count |
| PG-19 | Top 3 most-repeated queries identified with trigger source | Why they repeat |

**Commit:** `CLT-113 Phase 6: N+1 request diagnosis`

---

## PHASE 7: COMPREHENSIVE TRUTH REPORT (20 min)

Synthesize all findings into a single document.

### 7A: Write CLT-113_TRUTH_REPORT.md

Structure:

```markdown
# CLT-113: PLATFORM TRUTH REPORT
## February 28, 2026
## System-Verified Acceptance Test Results

---

## EXECUTIVE SUMMARY

[2-3 sentences: what works, what's broken, what the root causes are]

---

## DATABASE TRUTH (Phase 0)

[Paste complete database state for all 3 tenants]

---

## FINDING REGISTRY

### CATEGORY 1: ROUTING
| # | Finding | Root Cause (file:line) | Fix Complexity |
|---|---------|----------------------|----------------|
| T-01 | [finding] | [exact code location and data mismatch] | [trivial/moderate/architectural] |

### CATEGORY 2: CONFIDENCE SCORES
| # | Finding | Root Cause (file:line) | Fix Complexity |
|---|---------|----------------------|----------------|
| T-02 | [finding] | [exact trace from UI to source] | [trivial/moderate/architectural] |

### CATEGORY 3: PLAN CONTEXT
[same format]

### CATEGORY 4: VALIDATE/APPROVE METRICS
[same format, with Real/Fake assessment per metric]

### CATEGORY 5: CALCULATION BINDING
[same format, with the specific binding gap]

### CATEGORY 6: PERFORMANCE (N+1)
[same format]

---

## ROOT CAUSE SUMMARY

| Root Cause | Findings Affected | Category | Fix Type |
|-----------|-------------------|----------|----------|
| [e.g., tenant.features JSONB shape doesn't match HF-076 code] | T-01 | Routing | Data fix (1 SQL statement) |
| [e.g., classificationConfidence set to 0.5 default at line X, never overwritten] | T-02, T-03 | Confidence | Code fix (specific file:line) |
| [e.g., activePlan selected as first alphabetical from rule_sets query] | T-04, T-05, T-06 | Plan Context | Code fix (selection logic) |
| [e.g., input_bindings reference semantic field names that don't exist in row_data] | T-10 | Calculation | Architectural (semantic binding layer) |

---

## RECOMMENDED FIX SEQUENCE

Priority-ordered list of fixes, each with:
1. Exact file:line to change
2. What to change it to
3. Expected outcome
4. How to verify (browser-observable, not code-observable)

---

## METRICS

| Metric | Value |
|--------|-------|
| Total findings | [N] |
| Root causes identified | [N] |
| Trivial fixes (data or 1-line code) | [N] |
| Moderate fixes (multi-line, single file) | [N] |
| Architectural (design session required) | [N] |
```

### 7B: Create the fix map

For EVERY finding that has a trivial or moderate fix, write the EXACT code change:

```markdown
## FIX MAP

### Fix 1: Routing — Sabor tenant features
SQL: UPDATE tenants SET features = jsonb_set(features, '{primary_module}', '"financial"') WHERE name = 'Sabor Grupo Gastronomico';
Verify: Login as Sabor → lands on /financial/pulse

### Fix 2: Confidence — [specific fix]
File: web/src/app/data/import/enhanced/page.tsx
Line: [N]
Change: [old code] → [new code]
Verify: Upload 7 CSVs → confidence values differ per file

[etc.]
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-20 | Truth Report created at project root | File exists |
| PG-21 | Every finding has file:line root cause | No "unknown" causes |
| PG-22 | Fix map with exact changes for all non-architectural findings | Actionable fixes |
| PG-23 | Calculation binding gap documented with specific field names | Engine expectations vs data reality |
| PG-24 | `npm run build` exits 0 (no changes, just confirming clean state) | Build clean |

**Commit:** `CLT-113 Phase 7: Comprehensive truth report`

---

## PHASE 8: PR AND HANDOFF (5 min)

### 8A: Create PR with diagnostic results only

```bash
gh pr create --base main --head dev --title "CLT-113: System-Verified Acceptance Test — Platform Truth Report" --body "Zero code changes. Comprehensive diagnostic across 3 tenants. Database truth, routing analysis, confidence trace, plan context trace, calculation binding gap, N+1 diagnosis. Every finding has file:line root cause and fix recommendation."
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-25 | PR created | gh pr output |

**Commit:** `CLT-113 Phase 8: PR created`

---

## PROOF GATE SUMMARY

| # | Gate | Phase | Criterion |
|---|------|-------|-----------|
| PG-01 | Database truth document | 0 | All queries executed, results pasted |
| PG-02 | Routing code location | 1 | File:line documented |
| PG-03 | Routing data mismatch | 1 | Per-tenant root cause |
| PG-04 | Confidence full trace | 2 | UI → source chain with file:line at every step |
| PG-05 | Confidence root cause | 2 | Specific mechanism, not just "hardcoded" |
| PG-06 | OB-113 confidence assessment | 2 | Did it touch the right variable? |
| PG-07 | Plan selection logic | 3 | How active plan is chosen |
| PG-08 | 5-vs-4 plan count | 3 | DB vs UI comparison |
| PG-09 | Wrong-plan root cause | 3 | Specific logic traced |
| PG-10 | Validate metrics traced | 4 | Every metric: Real/Fake |
| PG-11 | Approve metrics traced | 4 | Every metric: Real/Fake |
| PG-12 | OB-113 gap analysis | 4 | What was touched vs what wasn't |
| PG-13 | MBC calculation state | 5 | Batch existence and state |
| PG-14 | MBC calculation results | 5 | $0.00 or actual values |
| PG-15 | Binding comparison | 5 | input_bindings vs row_data |
| PG-16 | Missing binding identified | 5 | Exact field gap |
| PG-17 | Óptica regression | 5 | 719 results, ~$1,253,832 |
| PG-18 | Query count in import page | 6 | Number documented |
| PG-19 | Top repeated queries | 6 | Trigger source identified |
| PG-20 | Truth Report created | 7 | File exists |
| PG-21 | All findings have file:line | 7 | No unknowns |
| PG-22 | Fix map created | 7 | Actionable changes |
| PG-23 | Binding gap documented | 7 | Specific field names |
| PG-24 | Build clean | 7 | npm run build exits 0 |
| PG-25 | PR created | 8 | gh pr output |

**Total: 8 phases, 25 proof gates. ZERO code changes. Pure diagnostic.**

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `CLT-113_TRUTH_REPORT.md` in PROJECT ROOT (this IS the completion report — the truth report itself)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE

---

## WHAT SUCCESS LOOKS LIKE

After this CLT, Andrew will have:

1. **A single document** listing every platform deficiency with its exact code location
2. **A fix map** showing exactly what to change for each non-architectural issue
3. **The semantic binding gap** documented with specific field names the engine expects vs what exists
4. **The confidence trace** showing exactly where 50% comes from and what needs to change
5. **The routing mismatch** showing exactly why Sabor doesn't land on /financial
6. **The N+1 sources** showing which queries repeat and why

This replaces guessing with knowing. The next OB will have exact file:line targets, not descriptions of symptoms.

---

*"Don't fix what you don't understand. Understand first, then fix."*
*Vialuce.ai — Intelligence. Acceleration. Performance.*
