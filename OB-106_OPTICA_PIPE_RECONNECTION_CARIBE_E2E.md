# OB-106: ÓPTICA DATA PIPE RECONNECTION + CARIBE END-TO-END
## Three dead components. One new tenant pipeline. Diagnosis before code.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — MANDATORY

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply (v2.0+)
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify in-scope items before completion report
3. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE

**Then read these additional context files:**

5. `OB-85_R3R4_COMBINED.md` — what R3/R4 fixed and what broke
6. `OB-85_R5_COMPONENT_RECONNECTION.md` — prior attempt at reconnecting pipes (read what was tried)
7. `OB-88_ENGINE_RECONCILIATION_ANALYSIS.md` — current accuracy state and ground truth analysis

**If you have not read all seven files, STOP and read them now.**

---

## WHY THIS OB EXISTS

### Problem A: Óptica Luminar — 3 Dead Components

Pipeline Test Co proves the calculation engine works: 6 components, 719 employees, MX$1,253,832 total, **100% exact match** against ground truth. The engine is not broken.

On Óptica Luminar (same data, production tenant), only **3 of 6 components** produce results:

| Component | Pipeline Test Co | Óptica Luminar | Status |
|-----------|-----------------|----------------|--------|
| Performance Matrix (Optical Sales) | MX$783,700 | ~MX$525,000 | ✅ Produces results |
| Fixed Base | ✓ | ✓ | ✅ Produces results |
| Fixed Bonus | ✓ | ✓ | ✅ Produces results |
| Percentage Commission (Insurance) | MX$10 | **$0** | ❌ DEAD |
| Conditional Percentage (Warranty) | MX$66,872 | **$0** | ❌ DEAD |
| Tiered Bonus (Store Sales + New Cust + Collections) | MX$283,000+ | **$0** | ❌ DEAD |

**Root Cause:** OB-85 R4 fixed formula inflation bugs (percentage-vs-decimal, rate table lookups) but overcorrected — disconnecting the data routing for 3 components that depend on store-level attribution, insurance data, and service data.

**The engine works.** The data just doesn't reach it for these 3 components.

### Problem B: Caribe Financial — New Tenant E2E

Caribe Financial Group (Mexican Bank Co) is the co-founder demo tenant for banking ICM. HF-068 fixed the field mapper import pipeline. Now Caribe needs a complete lifecycle run:

- 4 plans (Consumer Lending Commission, Mortgage Origination Bonus, Insurance Referral Program, Deposit Growth Incentive)
- 25 loan officers
- Multi-plan coordination (some officers licensed for all 4, some for 2)
- Import → entity resolution → calculation → results verification

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (auth-service.ts, session-context.tsx, auth-shell.tsx, middleware.ts).
6. **Supabase .in() ≤ 200 items per call.**

---

## CC FAILURE PATTERN WARNING — READ THIS

These specific failures occurred in OB-85 rounds R1–R5. **Do NOT repeat them.**

| # | Pattern | What Happened | Prevention |
|---|---------|---------------|------------|
| 1 | Theory-first diagnosis | R2 guessed "period selection" without tracing data. Wrong. Wasted a round. | Phase 0 SQL trace through every table BEFORE writing fix code. |
| 2 | Overcorrection | R4 fixed inflation but killed 3 components by touching working code paths. | Touch ONLY the broken pipe. Do NOT refactor code that works. |
| 3 | Hardcoded answer values | Earlier attempts inserted expected values instead of fixing logic. | Fix logic, never data. The engine derives results from committed_data + rule_set. |
| 4 | Reporting PASS before browser verification | R1 reported accuracy without actually comparing numbers. | Phase 0 must produce SQL output. Completion must have per-component numbers. |
| 5 | Broad refactoring disguised as fix | R1 restructured the data layer service when only one function was broken. | Identify the EXACT line that breaks the pipe. Change only that line (or minimal surrounding context). |
| 6 | Ignoring the control | Pipeline Test Co works. Óptica doesn't. The difference IS the bug. | Diff the data flow between Pipeline Test Co and Óptica for the same component. |

---

## SCOPE BOUNDARIES

### IN SCOPE
- **Part A:** Óptica Luminar — diagnose and reconnect 3 dead component data pipes
- **Part A:** Óptica Luminar — re-run calculation, verify delta closes
- **Part B:** Caribe Financial — complete data import (if not already done via HF-068)
- **Part B:** Caribe Financial — run calculation across 4 plans
- **Part B:** Caribe Financial — verify results in Results Dashboard

### OUT OF SCOPE — DO NOT TOUCH
- **Auth files** — NEVER
- Observatory (HF-067 — merged)
- Field mapper code (HF-068 — merged)
- PDR items (HF-069 — merged)
- Landing pages (/operate, /perform content)
- Financial module pages (/financial/*)
- Sidebar / navigation
- New features, new UI components

---

# ═══════════════════════════════════════════════════
# PART A: ÓPTICA DATA PIPE RECONNECTION (Phases 0–5)
# ═══════════════════════════════════════════════════

## PHASE 0: ÓPTICA SURGICAL DIAGNOSIS — SQL-FIRST

**This is the most important phase. It worked in R3. It was skipped in R1 and R2, both of which failed. Do NOT skip it.**

### The Method: One Entity, Every Table

Entity **93515855** is the test entity. Trace it through EVERY table in the pipeline. Find where data exists and where it disappears.

### 0A: What sheets exist in committed_data for entity 93515855?

```bash
echo "============================================"
echo "OB-106 PHASE 0: ÓPTICA SURGICAL DIAGNOSIS"
echo "============================================"

echo ""
echo "=== 0A: COMMITTED DATA — WHAT SHEETS EXIST FOR ENTITY 93515855? ==="
echo "Óptica Luminar tenant: 9b2bb4e3-6828-4451-b3fb-dc384509494f"
echo ""
echo "--- Find the entity UUID for external_id 93515855 ---"
echo "Run this query against Supabase:"
echo ""
cat <<'SQL'
SELECT id, external_id, display_name, entity_type, status
FROM entities
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND external_id LIKE '%93515855%'
LIMIT 5;
SQL

echo ""
echo "--- What committed_data exists for this entity? ---"
cat <<'SQL'
SELECT 
  cd.data_type,
  COUNT(*) as row_count,
  substring(cd.row_data::text, 1, 200) as sample
FROM committed_data cd
JOIN entities e ON e.id = cd.entity_id
WHERE cd.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND e.external_id LIKE '%93515855%'
GROUP BY cd.data_type, cd.row_data
LIMIT 20;
SQL

echo ""
echo "--- What data_types exist across ALL entities for Óptica? ---"
cat <<'SQL'
SELECT data_type, COUNT(*) as row_count
FROM committed_data
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
GROUP BY data_type
ORDER BY row_count DESC;
SQL
```

**Key question:** Do records from ALL 7 original sheets appear? Or only some sheets?

### 0B: What does Pipeline Test Co show for the SAME entity?

Pipeline Test Co works 100%. Compare data availability:

```bash
echo ""
echo "=== 0B: PIPELINE TEST CO — SAME ENTITY FOR COMPARISON ==="
echo "Pipeline Test Co tenant: f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd"
echo "(Adjust tenant ID if different — check tenants table)"
echo ""
cat <<'SQL'
-- Pipeline Test Co data types
SELECT data_type, COUNT(*) as row_count
FROM committed_data
WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd'
GROUP BY data_type
ORDER BY row_count DESC;
SQL

echo ""
echo "--- Compare: Óptica vs Pipeline Test Co data types ---"
echo "If Óptica has FEWER data_types, those missing types are the dead pipes."
```

### 0C: What do the calculation results show per component?

```bash
echo ""
echo "=== 0C: CALCULATION RESULTS — PER-COMPONENT FOR ENTITY 93515855 ==="
cat <<'SQL'
SELECT 
  cr.total_payout,
  cr.components,
  cr.metrics,
  cr.attainment
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND e.external_id LIKE '%93515855%'
ORDER BY cr.created_at DESC
LIMIT 1;
SQL

echo ""
echo "--- Aggregate: component-level totals across ALL entities ---"
cat <<'SQL'
SELECT 
  jsonb_object_keys(cr.components) as component_name,
  COUNT(*) as entity_count,
  SUM((cr.components->>jsonb_object_keys(cr.components))::numeric) as total_payout
FROM calculation_results cr
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
GROUP BY jsonb_object_keys(cr.components);
SQL

echo ""
echo "NOTE: The above query may need adjustment depending on how components JSONB is structured."
echo "If components is an array of objects rather than a key-value map, adjust accordingly."
echo "Check the actual JSONB structure first:"
cat <<'SQL'
SELECT components
FROM calculation_results
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
LIMIT 1;
SQL
```

### 0D: What does the rule_set define for each component?

```bash
echo ""
echo "=== 0D: RULE SET — COMPONENT DEFINITIONS ==="
cat <<'SQL'
SELECT 
  rs.id,
  rs.name,
  rs.status,
  rs.components
FROM rule_sets rs
WHERE rs.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND rs.status = 'active'
LIMIT 2;
SQL

echo ""
echo "For EACH component in the rule_set, document:"
echo "  - Component name"
echo "  - Component type (matrix_lookup, tier_lookup, percentage, conditional_percentage)"
echo "  - Expected input metric names"
echo "  - Rate/tier structure"
```

### 0E: Trace the Code Path — Data Layer Assembly

```bash
echo ""
echo "=== 0E: CODE TRACE — HOW ENTITY DATA IS ASSEMBLED ==="
echo "--- Find calculation orchestration entry point ---"
find web/src -name "*.ts" -path "*calc*" -o -name "*.ts" -path "*orchestrat*" -o -name "*.ts" -path "*engine*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "--- Find data layer service ---"
find web/src -name "*.ts" -path "*data-layer*" -o -name "*.ts" -path "*aggregat*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "--- How does the data layer build per-entity component metrics? ---"
for f in $(find web/src -name "*data-layer*" -o -name "*aggregat*" -o -name "*metric*resolv*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -5); do
  echo "=== $f ==="
  grep -n "componentMetrics\|buildEntity\|assembleEntity\|storeAttribution\|store_component\|employee_component\|classifySheet\|sheetType\|joinType" "$f" | head -30
  echo ""
done

echo ""
echo "--- How does the calculation engine read component data? ---"
for f in $(find web/src -name "*calculation*engine*" -o -name "*calc*orchestrat*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -5); do
  echo "=== $f ==="
  grep -n "component\|metric\|attainment\|amount\|goal\|payout\|formula\|type.*percentage\|type.*tier\|type.*matrix\|type.*conditional" "$f" | head -30
  echo ""
done
```

### 0F: Trace the Calculation API Route

```bash
echo ""
echo "=== 0F: CALCULATION API ROUTE ==="
echo "--- Find the API route that triggers calculation ---"
find web/src/app/api -name "*.ts" -path "*calc*" 2>/dev/null | head -10
echo ""
echo "--- How does it invoke the engine? ---"
for f in $(find web/src/app/api -name "*.ts" -path "*calc*" 2>/dev/null | head -3); do
  echo "=== $f ==="
  head -80 "$f"
  echo ""
done
```

### 0G: Diff Óptica vs Pipeline Test Co — The Control Experiment

This is the KEY diagnostic. Pipeline Test Co works. Óptica doesn't. Same data. The difference IS the bug.

```bash
echo ""
echo "=== 0G: CONTROL EXPERIMENT — DIFF ÓPTICA vs PIPELINE TEST CO ==="
echo ""
echo "--- Do they use the same rule_set? ---"
cat <<'SQL'
SELECT tenant_id, id, name, status, 
  jsonb_array_length(components) as component_count
FROM rule_sets 
WHERE tenant_id IN (
  '9b2bb4e3-6828-4451-b3fb-dc384509494f',  -- Óptica
  'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd'   -- Pipeline Test Co (adjust if different)
)
AND status = 'active';
SQL

echo ""
echo "--- Do they have the same data_types in committed_data? ---"
cat <<'SQL'
SELECT tenant_id, data_type, COUNT(*) as rows
FROM committed_data
WHERE tenant_id IN (
  '9b2bb4e3-6828-4451-b3fb-dc384509494f',
  'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd'
)
GROUP BY tenant_id, data_type
ORDER BY tenant_id, data_type;
SQL

echo ""
echo "If Óptica has FEWER data_types or FEWER rows for certain types,"
echo "that's the data pipe — data never reached committed_data for those components."
echo ""
echo "If data_types MATCH but calculations differ,"
echo "the pipe breaks during data layer assembly or metric resolution."
```

### 0H: Check for R4 Changes

```bash
echo ""
echo "=== 0H: WHAT DID OB-85 R4 CHANGE? ==="
cd /Users/AndrewAfrica/spm-platform
echo "--- Find OB-85 related commits ---"
git log --oneline -30 | grep -i "ob-85\|R3\|R4\|R5\|accuracy\|component\|pipe\|reconnect"
echo ""
echo "--- Diff the data layer service from before R4 to current ---"
echo "NOTE: Find the commit hash for R3 completion and R4 completion"
echo "Then: git diff <R3-hash>..<R4-hash> -- web/src/lib/"
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — OB-106 ÓPTICA
//
// ENTITY 93515855:
// - Committed data types: [list]
// - Calculation results: total_payout = MX$[amount]
// - Per-component: [list each component → payout or $0]
//
// PIPELINE TEST CO COMPARISON:
// - Same data types: [yes/no — list differences]
// - Same rule_set structure: [yes/no — list differences]
//
// RULE SET COMPONENTS (6):
// 1. [name] — [type] — [data source] — [WORKING/DEAD]
// 2. [name] — [type] — [data source] — [WORKING/DEAD]
// ... (all 6)
//
// DISCONNECTION POINTS:
// Component "[name]": data exists in committed_data [yes/no]
//   → data reaches data layer assembly [yes/no]  
//   → data reaches engine input [yes/no]
//   → engine produces result [yes/no]
//   → BREAK POINT: [exact file, exact function, exact line]
//
// Component "[name]": [same trace]
// Component "[name]": [same trace]
//
// ROOT CAUSE:
// [ONE SPECIFIC thing that breaks the pipe for all 3 dead components]
// [Or if different causes: one per component]
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 0: Óptica surgical diagnosis — entity 93515855 through every table" && git push origin dev`

**Do NOT write fix code until Phase 0 is committed.**

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD — OB-106
============================
Problem: 3 of 6 calculation components produce $0 for Óptica Luminar.
Pipeline Test Co (same data, clean tenant) produces correct results for all 6.

Root Cause: [from Phase 0]

Option A: [fix approach 1]
  - Touches: [files/functions]
  - Risk to Performance Matrix: [none/low/high]
  - Scale test: Works at 10x? ___

Option B: [fix approach 2]
  - Touches: [files/functions]
  - Risk to Performance Matrix: [none/low/high]
  - Scale test: Works at 10x? ___

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___

CRITICAL CONSTRAINT: Performance Matrix currently produces ~MX$525K.
After this fix, Performance Matrix MUST still produce ~MX$525K (±5%).
If the fix changes the Performance Matrix result, STOP and reassess.
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 1: Architecture decision — Óptica pipe reconnection" && git push origin dev`

---

## PHASE 2: RECONNECT DEAD COMPONENT PIPES

Based on Phase 0 root cause, fix the specific disconnection points.

### Critical Constraints

1. **Touch ONLY the broken pipe.** Performance Matrix works. Do NOT change any code path it uses.
2. **Fix logic, not data.** Do NOT insert expected values. The engine derives results from committed_data + rule_set.
3. **No hardcoded field names.** Korean Test applies. No Spanish column names, no sheet names in code.
4. **Minimal change.** Identify the exact line that breaks. Change only that line and minimal surrounding context.

### 2A: For Each Dead Component

For each of the 3 dead components, apply the fix from Phase 0's diagnosis:

```
Component: [name]
Break point: [file:line — from Phase 0]
Fix: [exact change]
Verification: entity 93515855 now gets non-zero result for this component
```

### 2B: Per-Component Verification (Local)

After fixing each component, verify locally:

```bash
echo "=== COMPONENT VERIFICATION ==="
echo "After reconnecting each pipe, trigger calculation for Óptica"
echo "Then query:"
cat <<'SQL'
SELECT 
  cr.total_payout,
  cr.components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND e.external_id LIKE '%93515855%'
ORDER BY cr.created_at DESC
LIMIT 1;
SQL
echo ""
echo "Check: previously-$0 components now show non-zero values"
echo "Check: Performance Matrix value UNCHANGED (~MX$525K ±5%)"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 2: Reconnect dead component data pipes" && git push origin dev`

---

## PHASE 3: ÓPTICA RECALCULATION + ACCURACY

### 3A: Trigger Full Recalculation

Re-run the full calculation for Óptica Luminar. This should now include all 6 components.

### 3B: Accuracy Assessment

```bash
echo "=== ÓPTICA RECALCULATION RESULTS ==="
cat <<'SQL'
-- Per-component aggregate totals
SELECT 
  'Óptica' as tenant,
  COUNT(DISTINCT cr.entity_id) as entity_count,
  SUM(cr.total_payout) as grand_total
FROM calculation_results cr
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
);
SQL

echo ""
echo "--- Entity 93515855 detail ---"
cat <<'SQL'
SELECT cr.total_payout, cr.components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND e.external_id LIKE '%93515855%'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
);
SQL
```

### 3C: Accuracy Table — MANDATORY

Complete this table with actual numbers from SQL:

```
ÓPTICA ACCURACY — Post OB-106
=================================
                          Before OB-106    After OB-106    Benchmark (CLT-14B)
Performance Matrix:       ~MX$525,000      MX$_______      MX$748,600
Percentage Commission:    MX$0             MX$_______      MX$10
Conditional Percentage:   MX$0             MX$_______      MX$66,872
Tiered Bonus:            MX$0             MX$_______      MX$283,000 + MX$39,100 + MX$116,250
Fixed components:        MX$_______        MX$_______      (included in total)
TOTAL:                   ~MX$525,000      MX$_______      MX$1,253,832
DELTA:                   48.73%           _______%         0%

Entity 93515855:         ~MX$2,200        MX$_______      MX$4,650
```

**Target:** Delta <15% from MX$1,253,832. Stretch goal: <10%.

**If delta is still >15%:** Document which components are still off, by how much, and why. Do NOT fabricate numbers. Report the truth.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 3: Óptica recalculation — accuracy assessment" && git push origin dev`

---

## PHASE 4: VERIFY ÓPTICA IN BROWSER

### 4A: Results Dashboard

```bash
echo "=== ÓPTICA BROWSER VERIFICATION ==="
echo "1. Login as VL Admin"
echo "2. Switch to Óptica Luminar tenant"
echo "3. Navigate to Operate → View Results (Results Dashboard)"
echo "4. Verify:"
echo "   - Total payout shown matches SQL total from Phase 3"
echo "   - Component breakdown shows 4+ components (not just Performance Matrix)"
echo "   - Entity drill-down for any entity shows non-zero for multiple components"
echo "   - Currency displays properly (MX$ format, no cents for ≥MX$10K per PDR-01)"
echo ""
echo "5. Navigate to Observatory"
echo "   - Óptica should show accurate entity count and calc status"
echo "   - (Verified in HF-067 but confirm no regression)"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 4: Óptica browser verification" && git push origin dev`

---

## PHASE 5: PERFORMANCE MATRIX REGRESSION CHECK

**This phase is NON-NEGOTIABLE.** The Performance Matrix is the one component that works. Verify it survived.

```bash
echo "=== PERFORMANCE MATRIX REGRESSION CHECK ==="
cat <<'SQL'
-- Compare Performance Matrix total before and after OB-106
-- The value should be ~MX$525,000 (±5%)
-- If it changed significantly, the fix regressed working code.
SELECT 
  'latest_batch' as batch,
  SUM(cr.total_payout) as total
FROM calculation_results cr
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
);
SQL

echo ""
echo "Also check Pipeline Test Co hasn't been affected:"
cat <<'SQL'
SELECT SUM(cr.total_payout) as pipeline_testco_total
FROM calculation_results cr
WHERE cr.tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd'
  ORDER BY created_at DESC LIMIT 1
);
SQL
echo ""
echo "Pipeline Test Co total MUST be MX$1,253,832 (±0%). Zero tolerance."
```

**If Pipeline Test Co total has changed from MX$1,253,832: STOP. Revert. The fix is wrong.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 5: Performance Matrix + Pipeline Test Co regression check" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PART B: CARIBE FINANCIAL END-TO-END (Phases 6–8)
# ═══════════════════════════════════════════════════

## PHASE 6: CARIBE DATA VERIFICATION

HF-068 fixed the import pipeline. Verify Caribe Financial has data ready for calculation.

```bash
echo "=== CARIBE FINANCIAL — DATA READINESS ==="
echo "--- Find Caribe tenant ---"
cat <<'SQL'
SELECT id, name, slug, features, currency
FROM tenants
WHERE name ILIKE '%caribe%' OR name ILIKE '%mexican bank%' OR slug ILIKE '%caribe%';
SQL

echo ""
echo "--- Entities ---"
cat <<'SQL'
SELECT COUNT(*) as entity_count, 
  entity_type, 
  COUNT(*) as per_type
FROM entities 
WHERE tenant_id = '[CARIBE_TENANT_ID]'
GROUP BY entity_type;
SQL

echo ""
echo "--- Committed data ---"
cat <<'SQL'
SELECT data_type, COUNT(*) as row_count
FROM committed_data
WHERE tenant_id = '[CARIBE_TENANT_ID]'
GROUP BY data_type
ORDER BY row_count DESC;
SQL

echo ""
echo "--- Rule sets (plans) ---"
cat <<'SQL'
SELECT id, name, status, jsonb_array_length(components) as component_count
FROM rule_sets
WHERE tenant_id = '[CARIBE_TENANT_ID]'
ORDER BY name;
SQL

echo ""
echo "--- Rule set assignments ---"
cat <<'SQL'
SELECT rs.name as plan_name, COUNT(rsa.id) as assigned_entities
FROM rule_set_assignments rsa
JOIN rule_sets rs ON rs.id = rsa.rule_set_id
WHERE rsa.tenant_id = '[CARIBE_TENANT_ID]'
GROUP BY rs.name;
SQL

echo ""
echo "--- Periods ---"
cat <<'SQL'
SELECT id, label, period_type, status, start_date, end_date
FROM periods
WHERE tenant_id = '[CARIBE_TENANT_ID]'
ORDER BY start_date;
SQL
```

### 6A: Assess Data Readiness

Based on the SQL output, determine:
1. Does Caribe have entities? How many? (Target: 25)
2. Does Caribe have committed_data? What types? How many rows?
3. Does Caribe have active rule_sets? How many? (Target: 4)
4. Are entities assigned to rule_sets?
5. Are periods created?

**If any of these are missing, document what's missing and attempt to proceed with what exists.** A partial pipeline run still proves the E2E flow.

**If Caribe has NO committed_data:**
- The import pipeline needs to be run first
- Navigate to Caribe → Import Data → upload test files
- Use any CSV/XLSX that represents banking transaction data
- HF-068 should have fixed the field mapper — verify it works for Caribe

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 6: Caribe Financial data readiness assessment" && git push origin dev`

---

## PHASE 7: CARIBE CALCULATION RUN

### 7A: Trigger Calculation

Navigate to Caribe Financial → Calculate. Run calculation for all available plans.

```bash
echo "=== CARIBE CALCULATION ==="
echo "1. Login as VL Admin or Caribe admin"
echo "2. Switch to Caribe Financial tenant"
echo "3. Navigate to Operate → Calculate"
echo "4. Select the active period"
echo "5. Run calculation across all plans"
echo "6. Wait for completion"
echo ""
echo "If calculation UI is not available, check if there's an API trigger:"
find web/src/app/api -name "*.ts" -path "*calc*" 2>/dev/null | head -5
```

### 7B: Verify Results

```bash
echo "=== CARIBE RESULTS ==="
cat <<'SQL'
SELECT 
  COUNT(DISTINCT cr.entity_id) as entities_calculated,
  COUNT(*) as result_rows,
  SUM(cr.total_payout) as grand_total
FROM calculation_results cr
WHERE cr.tenant_id = '[CARIBE_TENANT_ID]'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '[CARIBE_TENANT_ID]'
  ORDER BY created_at DESC LIMIT 1
);
SQL

echo ""
echo "--- Per-entity sample ---"
cat <<'SQL'
SELECT e.external_id, e.display_name, cr.total_payout, cr.components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '[CARIBE_TENANT_ID]'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '[CARIBE_TENANT_ID]'
  ORDER BY created_at DESC LIMIT 1
)
ORDER BY cr.total_payout DESC
LIMIT 5;
SQL
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 7: Caribe Financial calculation run + results" && git push origin dev`

---

## PHASE 8: CARIBE BROWSER VERIFICATION

```bash
echo "=== CARIBE BROWSER VERIFICATION ==="
echo "1. Navigate to Caribe Financial → Operate → View Results"
echo "2. Verify:"
echo "   - Results Dashboard shows calculated entities"
echo "   - Total payout matches SQL from Phase 7"
echo "   - Per-entity drill-down works"
echo "   - Multiple plans contribute to results"
echo "   - Currency displays in MXN without cents ≥ MX$10K"
echo ""
echo "3. Navigate to Observatory"
echo "   - Caribe shows accurate entity count"
echo "   - Caribe shows calculation completed status"
echo ""
echo "4. Browser console: zero errors on Results Dashboard"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Phase 8: Caribe browser verification" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# COMPLETION (Phase 9)
# ═══════════════════════════════════════════════════

## PHASE 9: BUILD + COMPLETION REPORT + PR

### 9A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 9B: PDR Verification

| PDR # | PDR Definition | In Scope | Status | Evidence |
|-------|---------------|----------|--------|----------|
| PDR-01 | Currency ≥ MX$10K no cents | VERIFY | PASS/FAIL | [Óptica + Caribe results display] |
| PDR-02 | Module-aware landing | NO | — | Not in scope |
| PDR-03 | Bloodwork Financial landing | NO | — | Not in scope |
| PDR-04 | N+1 overhead | NOTE | PASS/FAIL | [Request count on Results Dashboard] |
| PDR-05 | effectivePersona | NO | — | Not in scope |
| PDR-06 | Brand cards | NO | — | Not in scope |
| PDR-07 | Amber threshold | NO | — | Not in scope |

### 9C: Completion Report

Create `OB-106_COMPLETION_REPORT.md` at PROJECT ROOT:

1. **Phase 0 diagnosis** — root cause of each dead component
2. **Phase 1 architecture decision** — chosen fix approach
3. **Phase 2 pipe reconnection** — files changed, before/after per component
4. **Phase 3 accuracy table** — all 6 components with before/after/benchmark
5. **Phase 4 browser verification** — Óptica Results Dashboard
6. **Phase 5 regression check** — Performance Matrix value, Pipeline Test Co value
7. **Phase 6 Caribe data readiness** — entities, data, plans, assignments
8. **Phase 7 Caribe calculation** — results summary
9. **Phase 8 Caribe browser** — Results Dashboard, Observatory
10. **All proof gates** PASS/FAIL with evidence
11. **Deferred findings** — anything that needs follow-up

### 9D: Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Phase 0 committed | Diagnosis with SQL output before fix code |
| PG-02 | Entity 93515855 data | Identified in committed_data with data from multiple sheets |
| PG-03 | Performance Matrix unchanged | Still ~MX$525K (±5%) after fix |
| PG-04 | Percentage Commission non-zero | Produces payout for some entities |
| PG-05 | Conditional Percentage non-zero | Produces payout for some entities |
| PG-06 | Tiered Bonus non-zero | Produces payout for some entities |
| PG-07 | Óptica delta improved | Better than 48.73% (target <15%) |
| PG-08 | Entity 93515855 improved | Closer to MX$4,650 than MX$2,200 |
| PG-09 | Pipeline Test Co intact | MX$1,253,832 exactly (zero tolerance) |
| PG-10 | Caribe has committed_data | Rows exist with correct tenant_id |
| PG-11 | Caribe calculation runs | No error, results produced |
| PG-12 | Caribe results visible | Results Dashboard shows calculated entities |
| PG-13 | No hardcoded field names | Korean Test — zero language-specific patterns |
| PG-14 | Supabase .in() ≤ 200 | All batch queries verified |
| PG-15 | `npm run build` exits 0 | Clean build |
| PG-16 | localhost:3000 responds | HTTP 200 |

### 9E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-106: Óptica Data Pipe Reconnection + Caribe Financial E2E" \
  --body "## Part A: Óptica Luminar — 3 Dead Component Pipes

### Root Cause
[From Phase 0 — specific disconnection points]

### Fix
[From Phase 2 — files changed, what was reconnected]

### Accuracy
| Component | Before | After | Benchmark |
|-----------|--------|-------|-----------|
| Performance Matrix | ~MX\$525K | MX\$_____ | MX\$748,600 |
| Percentage Commission | MX\$0 | MX\$_____ | MX\$10 |
| Conditional Percentage | MX\$0 | MX\$_____ | MX\$66,872 |
| Tiered Bonus | MX\$0 | MX\$_____ | MX\$438,350 |
| **TOTAL** | **~MX\$525K** | **MX\$_____** | **MX\$1,253,832** |
| **Delta** | **48.73%** | **_____%** | **0%** |

### Regression Check
- Pipeline Test Co: MX\$1,253,832 — [UNCHANGED/CHANGED]
- Performance Matrix: [value] — [±5% of prior/CHANGED]

## Part B: Caribe Financial E2E

### Pipeline
- Entities: [count]
- Plans: [count]
- Calculation: [ran/blocked]
- Results: [visible/not visible]

## Proof Gates: 16 — see OB-106_COMPLETION_REPORT.md"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-106 Complete: Óptica pipe reconnection + Caribe E2E" && git push origin dev`

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Theory-first diagnosis | Phase 0 SQL trace with actual data BEFORE any code |
| AP-2 | Overcorrection | Touch ONLY the broken pipe. Performance Matrix is sacred. |
| AP-3 | Hardcoded answer values | Fix logic, not data. Engine derives from committed_data + rule_set. |
| AP-4 | PASS without evidence | SQL output in completion report. Per-component numbers mandatory. |
| AP-5 | Broad refactoring | Exact line, exact fix. Minimal surrounding context. |
| AP-6 | Ignoring the control | Pipeline Test Co is the control. Same data, different result = bug in Óptica path. |
| AP-7 | Modify auth files | DO NOT TOUCH. |
| AP-8 | Touch Observatory (HF-067) | Already fixed and merged. |
| AP-9 | Touch import pipeline (HF-068) | Already fixed and merged. |
| AP-10 | Touch PDR items (HF-069) | Already fixed and merged. |
| AP-11 | Fabricate accuracy numbers | Report actual SQL output. If delta is >15%, say so. |
| AP-12 | Skip Pipeline Test Co regression check | Phase 5 is NON-NEGOTIABLE. MX$1,253,832 or revert. |

---

## EXECUTION ORDER — NON-NEGOTIABLE

```
Phase 0: Óptica diagnosis (SQL trace)         → commit
Phase 1: Architecture decision                 → commit
Phase 2: Reconnect dead pipes                  → commit
Phase 3: Óptica recalculation + accuracy       → commit
Phase 4: Óptica browser verification           → commit
Phase 5: Regression check (Performance Matrix + Pipeline Test Co)  → commit
                                                 ↓
           IF Pipeline Test Co changed: STOP. REVERT.
                                                 ↓
Phase 6: Caribe data readiness                 → commit
Phase 7: Caribe calculation run                → commit
Phase 8: Caribe browser verification           → commit
Phase 9: Completion + PR                       → commit
```

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-106: "The engine is proven. Now prove it runs for every tenant, every component, every time."*
*"Diagnosis before code. Touch only the broken pipe. Trust the control experiment."*
