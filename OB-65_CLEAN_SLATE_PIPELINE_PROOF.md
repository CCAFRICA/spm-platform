# OB-65: CLEAN SLATE PIPELINE PROOF — IMPORT TO RECONCILIATION

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Before reading further, open and read the complete file `CC_STANDING_ARCHITECTURE_RULES.md` at the project root. Every decision in this OB must comply with:
- Section A: Design Principles (9 principles)
- Section B: Architecture Decision Gate (mandatory per mission)
- Section C: Anti-Pattern Registry (17 anti-patterns — DO NOT REPEAT)
- Section D: Operational Rules (23 rules)
- Section E: Scale Reference
- Section F: Quick Checklist (run before every completion report)

**If you have not read that file, STOP and read it now.**

---

## WHY THIS OB EXISTS

CLT-64 proved the import pipeline works (119,129 records committed via file-based pipeline). But:
- Periods were not created (0 rows — fixed by HF-048 code, untested end-to-end)
- Calculation has never been run on this data
- Dashboard has never shown real calculation results
- Reconciliation has never compared results against a benchmark
- Schema drift exists (code assumes columns that don't exist)
- Hardcoded field dictionaries violate AI-first principle
- ClearComp references persist throughout the codebase
- AI/ML training signals are captured but never persisted — Observatory cannot measure what doesn't exist

**This OB starts from a clean slate.** All RetailCDMX data is deleted. The plan is re-imported. The data is re-imported through the fixed pipeline. Calculation runs. Dashboard displays. Reconciliation compares. Then we audit what's real and what's theater.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. **Supabase migrations: execute live AND verify with DB query. File existence ≠ applied.**
5. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
6. **Commit this prompt to git as first action.**
7. Domain-agnostic always. The engine doesn't know it's ICM.
8. Brand palette: Deep Indigo (#2D2F8F) + Gold (#E8A838). Inter font family.
9. Security/scale/performance by design, not retrofitted.

### COMPLETION REPORT RULES
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: SCHEMA AUDIT (MANDATORY — BEFORE ANY CODE)

Before writing a single line of code, query the actual database schema for every table in the pipeline. Do NOT assume column names. Do NOT trust TypeScript type files. Query `information_schema.columns`.

```bash
echo "============================================"
echo "OB-65 PHASE 0: LIVE SCHEMA AUDIT"
echo "============================================"

# This MUST query the actual database, not read type files
# Use the Supabase REST API or a script that runs against live DB

for TABLE in profiles tenants periods entities committed_data rule_sets rule_set_assignments calculation_batches calculation_results import_batches usage_metering classification_signals; do
  echo ""
  echo "=== TABLE: $TABLE ==="
  echo "Query: SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '$TABLE' ORDER BY ordinal_position;"
  # Execute this query and record the results
done
```

Create a file `SCHEMA_REFERENCE.md` at project root with the actual column names for every table. This file is the source of truth for all subsequent missions.

**Every Supabase query in this OB must use column names from SCHEMA_REFERENCE.md, not from memory or type files.**

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-0A | SCHEMA_REFERENCE.md exists | File check | All pipeline tables documented |
| PG-0B | Column names verified against live DB | DB query output in file | Not copied from .types.ts |

**Commit:** `OB-65 Phase 0: Live schema audit — SCHEMA_REFERENCE.md`

---

## PHASE 1: CLEAN SLATE — DELETE ALL RETAILCDMX DATA

Delete ALL data for the RetailCDMX tenant. Everything. Plan, data, entities, periods, batches, assignments, calculations, storage files. Start from absolute zero.

**Tenant ID:** `9b2bb4e3-6828-4451-b3fb-dc384509494f`

```sql
-- Delete in dependency order (children before parents)
DELETE FROM calculation_results WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM calculation_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM rule_set_assignments WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM rule_sets WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- Also clean storage
DELETE FROM storage.objects WHERE bucket_id = 'imports' AND name LIKE '9b2bb4e3-%';
```

### Verify empty state

```sql
SELECT 'rule_sets' as tbl, COUNT(*) FROM rule_sets WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'entities', COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'periods', COUNT(*) FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'committed_data', COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'calculation_results', COUNT(*) FROM calculation_results WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL SELECT 'import_batches', COUNT(*) FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- ALL must be 0
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1A | All tables show 0 for RetailCDMX | SQL query output | Every count = 0 |
| PG-1B | Storage objects cleaned | SQL query | 0 files for this tenant |

**Commit:** `OB-65 Phase 1: Clean slate — all RetailCDMX data deleted`

---

## MISSION 1: PERIOD CREATION + IMPORT PIPELINE VERIFICATION

### ARCHITECTURE DECISION (MANDATORY)

Document how the import pipeline creates periods. Commit before coding.

```
ARCHITECTURE DECISION RECORD — MISSION 1
=========================================
Problem: Import pipeline must create period records and link committed_data.

Option A: Extract periods from field-mapped data during server-side commit.
  Use field mappings to identify which columns contain year/month data.
  Create period records with correct schema (from SCHEMA_REFERENCE.md).
  Set period_id on committed_data rows during INSERT.
  - Scale: O(unique periods) not O(rows). Works at 10x.
  - AI-first: Uses field mappings, not hardcoded "Mes"/"Año".
  - Transport: Already file-based (HF-047). N/A.
  - Atomicity: Periods created before data insert. Batch marked failed on error.

Option B: Post-import background job scans committed_data.
  - Scale: Scans all rows twice. Wasteful.
  - AI-first: Same requirement.
  - Atomicity: Worse — data exists without periods until job runs.

CHOSEN: Option A
REJECTED: Option B — unnecessary second scan, weaker atomicity.
```

### Phase 1.1: Verify HF-048 Period Fix

HF-048 aligned `period_key` → `canonical_key` across 14 files and added period creation to the import commit route. Verify this is correct:

```bash
echo "=== Verify period creation in commit route ==="
grep -n "canonical_key\|period.*INSERT\|period.*create\|resolvePeriod" web/src/app/api/import/commit/route.ts | head -20

echo ""
echo "=== Verify NO period_key references remain ==="
grep -rn "period_key" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "\.types\." | head -10
# Expected: 0 matches (only types file may have it as a comment or deprecated field)

echo ""
echo "=== Verify period schema usage matches SCHEMA_REFERENCE.md ==="
grep -n "from('periods')" web/src/ -r --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20
```

### Phase 1.2: Fix any remaining issues

If any `period_key` references remain or the commit route doesn't create periods correctly using SCHEMA_REFERENCE.md column names, fix them.

**CRITICAL CHECK:** The period creation code must NOT contain hardcoded field names like "Mes", "Año", "month", "year". It must read from the field mappings that the AI generated during Sheet Analysis. Verify:

```bash
grep -n "'Mes'\|'Año'\|'mes'\|'año'\|'month'\|'year'\|'ano'\|'anio'" web/src/app/api/import/commit/route.ts
# Expected: 0 matches. Period columns identified via field mapping targetField values, not string matching.
```

If hardcoded field names exist, refactor to use the field mapping's `targetField` designation instead.

### Phase 1.3: Test on localhost

Andrew will import the plan and data through the browser. The pipeline must:
1. Upload file to Supabase Storage ✓ (HF-047)
2. Server downloads and parses ✓ (HF-047)
3. Create period records from the data ← THIS IS THE NEW TEST
4. Set period_id on committed_data rows
5. Create entity records
6. Create rule_set_assignments

After import, run verification queries:

```sql
SELECT COUNT(*) FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: 1-5 (deduplicated months)

SELECT COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' AND period_id IS NOT NULL;
-- Expected: majority of rows (some without period fields will have NULL — that's OK)

SELECT COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' AND period_id IS NULL;
-- Expected: only rows from sheets without period columns (e.g., entity roster)

SELECT COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: > 0
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1C | Zero `period_key` references in codebase (excluding types) | grep | 0 matches |
| PG-1D | Period creation uses field mappings, not hardcoded names | grep for string literals | 0 hardcoded field names |
| PG-1E | Periods created after import | Supabase query | COUNT > 0 |
| PG-1F | period_id populated on committed_data | Supabase query | Majority non-null |
| PG-1G | Entities created | Supabase query | COUNT > 0 |

**Commit:** `OB-65 Mission 1: Period creation verified — import pipeline complete`

---

## MISSION 2: CALCULATION ENGINE — RUN + VERIFY

### ARCHITECTURE DECISION (MANDATORY)

```
ARCHITECTURE DECISION RECORD — MISSION 2
=========================================
Problem: Run calculation on imported RetailCDMX data, produce non-zero payouts.

Questions to answer BEFORE coding:
1. What table/columns does the calculation engine read from?
   (Verify against SCHEMA_REFERENCE.md)
2. How does it find entities for a given period?
   (committed_data WHERE period_id = X, or entities table, or both?)
3. How does it match entities to rule_set components?
   (rule_set_assignments? Or rule_sets directly?)
4. Where does it write results?
   (calculation_results schema — verify column names)
5. What's the data contract: what MUST exist for calculation to run?
   (periods + committed_data with period_id + rule_sets + rule_set_assignments)

DOCUMENT the data flow: committed_data → calculation engine → calculation_results
with actual table names and column names from SCHEMA_REFERENCE.md.
```

### Phase 2.1: Diagnostic — Can calculation run?

```bash
echo "=== Calculation entry point ==="
grep -rn "runCalculation\|triggerCalculation\|startCalculation\|calculateBatch" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== What does the calculation engine read? ==="
grep -n "from('committed_data')\|from('entities')\|from('rule_sets')\|from('periods')\|from('rule_set_assignments')" web/src/lib/calculation/ -r --include="*.ts" | head -20

echo ""
echo "=== What columns does it SELECT? ==="
grep -n "\.select(" web/src/lib/calculation/ -r --include="*.ts" | head -20

echo ""
echo "=== Verify all selected columns exist in SCHEMA_REFERENCE.md ==="
# Cross-reference every column name against the schema audit
```

### Phase 2.2: Fix any schema mismatches

If the calculation engine selects columns that don't exist in the actual database, fix them. Use SCHEMA_REFERENCE.md as the source of truth.

### Phase 2.3: Navigate to Calculate page on localhost

1. Login as VL Admin → select RetailCDMX
2. Navigate to Calculate section
3. Select period (should show the periods created in Mission 1)
4. Select rule set (should show the RetailCDMX plan)
5. Run Calculation

### Phase 2.4: Verify results

```sql
SELECT COUNT(*) FROM calculation_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: >= 1

SELECT COUNT(*) FROM calculation_results WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: > 0

-- Check for non-zero payouts
SELECT
  COUNT(*) as total_results,
  COUNT(*) FILTER (WHERE (result_data->>'total_payout')::numeric > 0) as nonzero_payouts,
  SUM((result_data->>'total_payout')::numeric) as total_payout_sum
FROM calculation_results
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: nonzero_payouts > 0, total_payout_sum > 0
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-2A | Calculation batch created | Supabase query | COUNT >= 1 |
| PG-2B | Calculation results exist | Supabase query | COUNT > 0 |
| PG-2C | Non-zero payouts | Supabase query | At least 1 entity with total_payout > 0 |
| PG-2D | Multiple components in results | Supabase query | More than 1 distinct component |
| PG-2E | All calculation queries use correct column names | grep vs SCHEMA_REFERENCE.md | Zero mismatches |

**Commit:** `OB-65 Mission 2: Calculation engine verified — non-zero payouts confirmed`

---

## ════════════════════════════════════════════════
## HARD CHECKPOINT — DO NOT PROCEED WITHOUT PASSING
## ════════════════════════════════════════════════

After Mission 2, STOP. Run these verification queries:

```sql
-- GATE 1: Periods exist
SELECT COUNT(*) FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- MUST be > 0

-- GATE 2: Calculation results exist
SELECT COUNT(*) FROM calculation_results WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- MUST be > 0

-- GATE 3: Non-zero payouts
SELECT SUM((result_data->>'total_payout')::numeric) FROM calculation_results WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- MUST be > 0
```

**IF ANY GATE FAILS:**
1. DO NOT proceed to Mission 3
2. Write a diagnostic report explaining what failed
3. Commit the diagnostic report
4. Create PR with what's completed so far
5. STOP

**IF ALL GATES PASS:** Proceed to Mission 3.

---

## MISSION 3: DASHBOARD WIRING — REAL DATA DISPLAY

### ARCHITECTURE DECISION (MANDATORY)

```
ARCHITECTURE DECISION RECORD — MISSION 3
=========================================
Problem: Wire dashboards to show real calculation results.

Questions:
1. What dashboard widgets exist today? (Inventory them)
2. Which are showing hardcoded/placeholder data?
3. What calculation_results fields map to which widgets?
4. What's the query pattern for each persona (admin/manager/rep)?

Document the wiring plan before implementing.
```

### Phase 3.1: Dashboard inventory

```bash
echo "=== Dashboard components ==="
find web/src -name "*dashboard*" -o -name "*Dashboard*" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== Hero cards / KPI widgets ==="
grep -rn "total.*payout\|totalPayout\|entity.*count\|entityCount\|hero.*card\|HeroCard\|KPI" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== Hardcoded/placeholder data in dashboards ==="
grep -rn "placeholder\|mock\|dummy\|hardcode\|TODO\|FIXME\|sample.*data" web/src/app/operate/ web/src/app/perform/ web/src/app/admin/ --include="*.tsx" | grep -v node_modules | head -20
```

### Phase 3.2: Wire Admin dashboard

Admin sees: total payouts across all entities, entity count, period summary, component breakdown, calculation batch history.

All data from `calculation_results`, `calculation_batches`, `entities`, `periods` — using column names from SCHEMA_REFERENCE.md.

### Phase 3.3: Wire Manager dashboard

Manager sees: team performance ranked, individual payouts, top/bottom performers, payout distribution by component.

### Phase 3.4: Wire Rep dashboard (Perform workspace)

Rep sees: my total compensation, component-by-component breakdown, period comparison, transaction detail.

### Phase 3.5: Verify on localhost

Navigate through all three persona dashboards. Each must show real data from the calculation in Mission 2.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-3A | Admin dashboard shows total payout > $0 | localhost | Real number displayed |
| PG-3B | Admin dashboard shows entity count matching DB | localhost vs query | Numbers match |
| PG-3C | Manager view shows ranked team members | localhost | At least 5 entities visible |
| PG-3D | Rep view shows component breakdown | localhost | Multiple components listed |
| PG-3E | Period selector shows real periods | localhost | Jan/Feb/Mar 2024 (or whatever data has) |

**Commit:** `OB-65 Mission 3: Dashboard wired to real calculation results`

---

## MISSION 4: RECONCILIATION — COMPARE AGAINST BENCHMARK

### ARCHITECTURE DECISION (MANDATORY)

```
ARCHITECTURE DECISION RECORD — MISSION 4
=========================================
Problem: Compare Vialuce calculation results against a benchmark Excel file.

Questions:
1. How does reconciliation read calculation_results? (query pattern)
2. How does it parse the uploaded benchmark file?
3. How does AI match benchmark columns to calculation output?
4. What's the comparison logic? (entity matching, amount comparison)
5. Where are results stored?

Document the reconciliation data flow.
```

### Phase 4.1: Reconciliation page diagnostic

```bash
echo "=== Reconciliation components ==="
find web/src -path "*reconcil*" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== Reconciliation data queries ==="
grep -rn "calculation_results\|calculation_batches\|reconcil" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== How benchmark file is parsed ==="
grep -rn "upload.*file\|parse.*excel\|XLSX\|benchmark\|fileReader" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -15
```

### Phase 4.2: Wire reconciliation to calculation_results

Reconciliation must:
1. Let user select a calculation batch (from calculation_batches)
2. Load results for that batch (from calculation_results)
3. Upload benchmark Excel file
4. AI identifies matching dimensions (employee ID field, amount fields)
5. Compare per-entity: Vialuce result vs benchmark value
6. Display variance analysis: match count, mismatch count, total variance

### Phase 4.3: Test on localhost

1. Navigate to Reconcile workspace
2. Select the calculation batch from Mission 2
3. Upload benchmark Excel (this will be done by Andrew — ensure the upload UI works)
4. View comparison results

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4A | Reconciliation page loads with calculation batches | localhost | Dropdown shows batch(es) |
| PG-4B | Benchmark file upload works | localhost | File parsed, columns detected |
| PG-4C | AI identifies entity matching field | localhost | Suggests employee ID column |
| PG-4D | Comparison results show per-entity variances | localhost | Table with entity rows |
| PG-4E | Summary statistics displayed | localhost | Match %, total variance |

**Commit:** `OB-65 Mission 4: Reconciliation wired and verified`

---

## MISSION 5: HARDCODE AUDIT + CLEARCOMP CLEANUP + AI/ML TRUTH

This mission has three sub-missions. All are code review + cleanup — no new features.

### ARCHITECTURE DECISION (MANDATORY)

```
ARCHITECTURE DECISION RECORD — MISSION 5
=========================================
Problem: Audit codebase for principle violations, remove ClearComp references,
         verify AI/ML claims match reality.

This is a truth mission. No new features. Only honest assessment and cleanup.
```

### Phase 5.1: ClearComp purge

```bash
echo "=== ClearComp references in source code ==="
grep -rn "clearcomp\|ClearComp\|CLEARCOMP\|clear.comp\|clear_comp" web/src/ --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== ClearComp in config files ==="
grep -rn "clearcomp\|ClearComp\|CLEARCOMP" web/package.json web/next.config.mjs web/vercel.json web/.env* 2>/dev/null
```

Replace ALL ClearComp references with Vialuce. Delete:
- `CLEARCOMP_STANDING_PRINCIPLES.md`
- `CLEARCOMP_PRODUCTION_ARCHITECTURE.md`
- `CLEARCOMP_BACKLOG.md`

(These are at the project root — `git rm` them.)

### Phase 5.2: Hardcoded field dictionary audit

```bash
echo "=== FIELD_ID_MAPPINGS or similar static dictionaries ==="
grep -rn "FIELD_ID_MAPPINGS\|fieldIdMap\|FIELD_MAP\|columnMap\|COLUMN_MAPPING" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== Hardcoded field name strings ==="
grep -rn "'num_empleado'\|'No_Tienda'\|'Puesto'\|'Mes'\|'Año'\|'Fecha Corte'\|'Cumplimiento'\|'Meta'\|'Venta'" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "test" | grep -v "spec"
```

For every hardcoded dictionary or field name found:
1. Document it in the completion report
2. Explain what it does
3. Mark whether it can be removed now or requires AI pipeline changes first
4. If it can be removed now, remove it

### Phase 5.3: AI/ML reality audit

This is the critical truth check. For EACH item below, verify if it ACTUALLY works (not just if the code exists):

```bash
echo "=== AI/ML TRUTH AUDIT ==="

echo ""
echo "--- 1. Training signal capture (claimed: 5/5 AI call sites) ---"
grep -rn "captureTrainingSignal\|trainingSignal\|training_signal\|signalCapture" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- 2. Training signal PERSISTENCE (claimed: NOT DONE) ---"
grep -rn "training.*supabase\|signal.*insert\|persist.*signal\|classification_signals" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- 3. Closed-loop learning (claimed: NOT DONE) ---"
grep -rn "learning.*loop\|feedback.*loop\|normalizer.*update\|learn.*from" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- 4. Usage metering (claimed: table exists) ---"
echo "Query: SELECT COUNT(*) FROM usage_metering;"

echo ""
echo "--- 5. Observatory AI Intelligence tab (claimed: wired to real data) ---"
grep -rn "AI_METRICS\|aiMetrics\|mock.*ai\|hardcode.*confidence\|autonomousRate" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- 6. AI anomaly detection (claimed: method exists, no callers) ---"
grep -rn "detectAnomalies\|anomaly.*detect\|anomalyDetection" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- 7. AI recommendations (claimed: method exists, uses hardcoded array) ---"
grep -rn "generateRecommendation\|recommendation.*hardcode\|recommendations.*\[" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- 8. Silent heuristic fallback masquerading as AI ---"
grep -rn "fallback.*heuristic\|heuristic.*confidence\|silent.*fallback\|mock.*confidence" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- 9. Plan interpreter bypassing AIService ---"
grep -rn "import.*anthropic\|from.*anthropic\|AnthropicClient\|new Anthropic" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "adapter" | head -10
```

For each finding, produce a truth table:

```
AI/ML REALITY REPORT
====================
| Capability | Code Exists? | Actually Works? | Evidence |
|------------|-------------|-----------------|----------|
| Training signal capture | ? | ? | ? |
| Training signal persistence to DB | ? | ? | ? |
| Closed-loop learning (signals consumed) | ? | ? | ? |
| Usage metering | ? | ? | ? |
| Observatory AI tab — real data | ? | ? | ? |
| AI anomaly detection | ? | ? | ? |
| AI recommendations | ? | ? | ? |
| Heuristic masquerading as AI | ? | ? | ? |
| Plan interpreter via AIService | ? | ? | ? |
| FIELD_ID_MAPPINGS (hardcoded) | ? | ? | ? |
```

**BE HONEST.** If something doesn't work, say so. If code exists but is never called, say "code exists, never called." If the Observatory shows mock data, say "shows mock data." Andrew needs the truth, not reassurance.

### Phase 5.4: Schema drift cleanup

Using SCHEMA_REFERENCE.md, find ALL Supabase queries that reference columns that don't exist:

```bash
# Extract all column names referenced in Supabase queries
grep -rn "\.select(\|\.eq(\|\.order(" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" > /tmp/all_queries.txt
# Cross-reference against SCHEMA_REFERENCE.md
```

Fix any remaining mismatches.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-5A | Zero ClearComp references in web/src/ | grep | 0 matches |
| PG-5B | 3 ClearComp files deleted from repo | git rm | Files removed |
| PG-5C | FIELD_ID_MAPPINGS documented with assessment | Completion report | Every entry listed |
| PG-5D | AI/ML reality report complete and honest | Completion report | All 10 rows filled with evidence |
| PG-5E | Zero schema drift errors | grep cross-reference | All queries use real column names |
| PG-5F | Build clean after all changes | npm run build | Exit 0 |

**Commit:** `OB-65 Mission 5: Hardcode audit, ClearComp purge, AI/ML truth report`

---

## PHASE FINAL: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
# Confirm localhost:3000 responds
```

### Completion report

Create `OB-65_COMPLETION_REPORT.md` at PROJECT ROOT with:

1. **Schema Reference** — link to SCHEMA_REFERENCE.md
2. **Clean Slate Verification** — all-zero query output
3. **Mission 1: Import Pipeline** — period creation evidence, entity counts
4. **Mission 2: Calculation** — batch count, result count, payout sum, component breakdown
5. **HARD CHECKPOINT RESULTS** — periods > 0, results > 0, payouts > 0
6. **Mission 3: Dashboard** — what each persona sees, real data displayed
7. **Mission 4: Reconciliation** — benchmark comparison summary
8. **Mission 5: Truth Report**
   - ClearComp grep before/after
   - FIELD_ID_MAPPINGS full inventory
   - **AI/ML REALITY TABLE** — the most important deliverable of this OB
   - Schema drift fixes
9. **All proof gates** — evidence for every gate (25 total)

### Section F Quick Checklist

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation? (5 ADRs — one per mission)
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

### Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-65: Clean Slate Pipeline Proof — Import to Reconciliation" \
  --body "## What This OB Proves

### Mission 1: Import Pipeline Complete
- Periods auto-created from field-mapped data
- period_id linked on committed_data
- Entities and assignments created

### Mission 2: Calculation Engine Verified
- Non-zero payouts for RetailCDMX
- Multi-component results
- Calculation traces for audit

### Mission 3: Dashboards Wired
- Admin, Manager, Rep views show real calculation data
- Period selector works
- No placeholder/hardcoded values

### Mission 4: Reconciliation Functional
- Benchmark upload and parsing
- AI entity matching
- Per-entity variance analysis

### Mission 5: Truth Report
- ClearComp purged from codebase
- FIELD_ID_MAPPINGS inventoried
- AI/ML reality table: honest assessment of every claimed capability
- Schema drift eliminated

## Proof Gates: 25+ — see OB-65_COMPLETION_REPORT.md
## AI/ML Reality Table — see Section 8 of completion report"
```

**Commit:** `OB-65 Final: Build verification, completion report, PR`

---

## CONTEXT: WHAT EXISTS TODAY

### Proven working (CLT-64 + HF-044-048):
- Auth + Login (cookie-based, HF-043)
- Plan Import via GPV (AI interpretation, 7 components, 90-95% confidence)
- Data Import via Enhanced Import (file-based pipeline, 119K records, HF-047)
- Entity creation (24,833 entities from RetailCDMX)
- RLS policies (37 VL Admin write policies, HF-044)
- Period schema alignment (canonical_key across 14 files, HF-048)

### Not yet tested:
- Period creation during import (code fixed by HF-048, never run end-to-end)
- Calculation from UI
- Dashboard with real data
- Reconciliation against benchmark

### Known principle violations:
- FIELD_ID_MAPPINGS hardcoded dictionary
- Hardcoded 50% confidence placeholder (partially fixed by HF-046)
- Training signals captured but never persisted to DB
- Observatory AI tab may show mock data
- Silent heuristic fallback with false confidence scores

### The test data:
- **Plan:** RetailCorp Optometrist Incentive Plan (PPTX) — 6 components
- **Data:** RetailCDMX Excel — 7 sheets, 119,129 records, 3 periods (Jan/Feb/Mar 2024)
- **Benchmark:** Andrew's Excel file with known-correct payouts

---

*OB-65 — February 19, 2026*
*"Start clean. Prove everything. Lie about nothing."*
