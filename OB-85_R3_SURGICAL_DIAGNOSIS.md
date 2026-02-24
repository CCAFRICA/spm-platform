# OB-85 ROUND 3: WHY DOES ATTAINMENT=212% PRODUCE PAYOUT=$0?
## Surgical Trace — One Entity, One Component, Every Step

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE.md`
3. `OB-85_COMPLETION_REPORT.md`
4. `OB-85_CONTINUATION_COMPLETION_REPORT.md`

---

## CONTEXT — WHAT HAPPENED

Andrew imported 119,129 records (7 sheets) and ran calculation for January 2024. Result:
- **719 entities found** ✅
- **Attainment data present** ✅ (Mean: 178.6%, Median: 212.7%)
- **Every payout is MX$0.00** ❌
- **All 4 components (Performance Matrix, Tiered Bonus, Percentage Commission, Conditional Percentage) = MX$0.00** ❌

**The attainment distribution proves data IS reaching the engine.** But the engine cannot convert attainment into payout. This is NOT a period selection issue. This is NOT an entity resolution issue. This is a **calculation resolution issue** — the engine has the inputs but cannot execute the formulas.

**Your previous diagnosis was WRONG.** You said "the calculation engine was NEVER broken" and the issue was period selection. That was incorrect. Andrew switched to January 2024, ran Preview, and got $0 again. The engine IS broken for fresh imported data.

---

## PHASE 0: TRACE ONE ENTITY THROUGH THE ENTIRE PIPELINE

Pick entity with external_id = '96568046' (a known employee from the Óptica Luminar dataset).

### 0A: What does committed_data contain for this entity?

```sql
-- Find all committed_data rows for employee 96568046 in January 2024
SELECT sheet_name, raw_data, period_id, created_at
FROM committed_data 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND raw_data::text LIKE '%96568046%'
AND period_id IN (
  SELECT id FROM periods 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  AND canonical_key LIKE '%2024-01%' OR canonical_key LIKE '%jan%' OR start_date LIKE '%2024-01%'
)
LIMIT 10;
```

**PASTE THE FULL OUTPUT.** We need to see: which sheets have data for this employee, what the raw_data JSON contains, and specifically the values for Cumplimiento (attainment), Meta_Individual (goal), Venta_Individual (amount).

### 0B: What does the entity record look like?

```sql
SELECT id, external_id, display_name, entity_type, metadata
FROM entities 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND external_id = '96568046';
```

### 0C: What does the calculation result look like for this entity?

```sql
-- Get the latest batch for Jan 2024
SELECT cr.entity_id, cr.total_payout, cr.component_results, cr.metadata,
       e.external_id
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND e.external_id = '96568046'
ORDER BY cr.created_at DESC
LIMIT 3;
```

**PASTE THE FULL component_results JSON.** We need to see what the engine wrote per component — did it write nulls? Zeros? Empty objects?

### 0D: What does the rule_set (plan) look like?

```sql
SELECT id, name, status, 
       jsonb_pretty(components) as components_pretty
FROM rule_sets
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND status = 'active'
LIMIT 1;
```

**PASTE THE FULL components JSON.** We need to see: what components exist, what their calculation rules are, what fields they expect as inputs.

### 0E: What does the import_batch field mapping look like?

```sql
-- Find the import batch from the fresh import
SELECT id, status, metadata, created_at,
       jsonb_pretty(metadata->'fieldMappings') as field_mappings_pretty,
       jsonb_pretty(metadata->'sheetClassifications') as sheet_classifications_pretty
FROM import_batches
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC
LIMIT 3;
```

If metadata doesn't have fieldMappings, try:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'import_batches';
```

And then:
```sql
SELECT * FROM import_batches
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC
LIMIT 1;
```

### 0F: THE CRITICAL QUESTION — Trace the calculation code path

```bash
echo "=== WHERE DOES THE ENGINE GET COMPONENT INPUTS? ==="

echo ""
echo "--- Calculation orchestrator / engine entry ---"
find web/src -path "*calculat*" -name "*.ts" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "--- For EACH file in the calculation path, show how it gets metric values ---"
for f in $(find web/src/lib/calculation web/src/lib/orchestration -name "*.ts" 2>/dev/null | grep -v node_modules); do
  echo ""
  echo "=== $f ==="
  echo "--- Lines mentioning attainment, goal, amount, metric, component, payout ---"
  grep -n "attainment\|goal\|amount\|metric\|component.*value\|component.*result\|payout\|total_payout\|raw_data\|committed_data\|field_map" "$f" | head -20
done

echo ""
echo "--- API route for calculation ---"
for f in $(find web/src/app/api -path "*calculat*run*" -name "route.ts" 2>/dev/null); do
  echo ""
  echo "=== $f (FULL FILE) ==="
  cat "$f"
done
```

### 0G: How does the WORKING calculation work?

The Óptica Luminar seed data (Jan 2026 / Feb 2026, 12 entities, $20,662 total) DOES calculate correctly. Find out how:

```bash
echo "=== HOW DOES THE SEED DATA CALCULATION WORK? ==="
echo "--- Is there a different code path for seed vs imported data? ---"

grep -rn "seed\|demo\|optica\|luminar\|sample" web/src/lib/calculation/ web/src/lib/orchestration/ --include="*.ts" | head -20

echo ""
echo "--- Does the seed data bypass the normal import pipeline? ---"
grep -rn "seed\|demo\|hardcod" web/src/app/api/calculation/ --include="*.ts" | head -20
```

```sql
-- How was the seed data structured differently?
-- Look at the WORKING batch (the 12-entity one)
SELECT cr.entity_id, cr.total_payout, 
       jsonb_pretty(cr.component_results) as components,
       e.external_id
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  AND entity_count = 12
  LIMIT 1
)
AND cr.total_payout > 0
LIMIT 2;
```

**PASTE THE component_results FROM THE WORKING BATCH.** Compare its structure to the $0 batch. The difference reveals the bug.

### PHASE 0 DELIVERABLE

Before writing ANY code, write a document called `OB-85_R3_DIAGNOSIS.md` in the project root with:

1. **Committed data for entity 96568046** — what raw fields exist
2. **Calculation result for entity 96568046** — what component_results contains (the $0 version)
3. **Working calculation result** — what component_results contains (the $20K version for seed data)
4. **The structural difference** — what's different between the two
5. **The specific code path** — line numbers where the engine tries to read metrics, and where it fails for imported data
6. **The fix plan** — exactly what code needs to change, in which files, to make imported data calculate like seed data

**Do NOT write any fix code until this document is complete and committed.**

**Commit:** `OB-85-R3 Phase 0: Surgical diagnosis — trace entity 96568046 through pipeline`

---

## MISSION 1: FIX THE SPECIFIC FAILURE

Based on Phase 0's diagnosis, fix the SPECIFIC code path that fails for imported data.

### Requirements:
1. Entity 96568046 must produce a non-zero payout
2. The fix must work for ALL 719 entities, not just one
3. No hardcoded field names (Korean Test)
4. No changes to the working seed data path — it stays working
5. The fix must use the field mappings from the import (semanticType, not column name)

### After the fix, re-run calculation:

```bash
echo "=== Re-run calculation for January 2024 ==="
# Trigger via API or browser — whichever path the UI uses
```

Then verify:
```sql
-- Check the NEW batch
SELECT cb.id, cb.lifecycle_state, cb.entity_count,
       SUM(cr.total_payout) as total_payout,
       COUNT(CASE WHEN cr.total_payout > 0 THEN 1 END) as non_zero_count,
       COUNT(CASE WHEN cr.total_payout = 0 THEN 1 END) as zero_count
FROM calculation_batches cb
JOIN calculation_results cr ON cr.batch_id = cb.id
WHERE cb.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND cb.id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
)
GROUP BY cb.id, cb.lifecycle_state, cb.entity_count;

-- Check entity 96568046 specifically
SELECT cr.total_payout, jsonb_pretty(cr.component_results) as components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE e.external_id = '96568046'
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
);
```

### Proof Gates

- PG-1: Phase 0 diagnosis document committed with all SQL output pasted
- PG-2: Structural difference between working and broken calculation identified
- PG-3: Specific code path and line numbers documented
- PG-4: Fix applied to specific files (list them)
- PG-5: Entity 96568046 has non-zero total_payout
- PG-6: Entity 96568046 has non-zero component_results for at least 1 component
- PG-7: Total non-zero entities > 600 out of 719
- PG-8: Total payout > MX$0 (paste the actual number)
- PG-9: No hardcoded field names in the fix (grep output proving this)

**Commit:** `OB-85-R3 Mission 1: Calculation fix — [description of what was broken and how it was fixed]`

---

## MISSION 2: ENTITY DISPLAY FIX

Same as previous continuation — but this time verify it ACTUALLY works:

- Employee ID column: external_id (96568046), NOT UUID
- Name column: display_name from entities or roster, NOT UUID
- Components column: per-component payout breakdown from component_results

### Proof Gates

- PG-10: Screenshot or curl showing external_id in Employee ID column
- PG-11: Components column shows non-zero per-component values

**Commit:** `OB-85-R3 Mission 2: Entity display verified`

---

## MISSION 3: BUILD + PR

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

### Completion Report

Save as `OB-85_R3_COMPLETION_REPORT.md` at project root. Must include:

1. **The diagnosis** — exactly what was broken (with SQL evidence)
2. **The structural difference** — working batch vs broken batch component_results comparison
3. **The fix** — files changed, what was changed, why
4. **The number** — total payout for Jan 2024 (paste SQL result)
5. **Entity sample** — entity 96568046's full component_results (paste)
6. **Proof gates** — all 13, PASS/FAIL with evidence

```bash
gh pr create --base main --head dev \
  --title "OB-85-R3: Calculation Fix — Imported Data Now Produces Non-Zero Payouts" \
  --body "## Root Cause
[Paste from diagnosis]

## The Fix
[What was changed and why]

## The Numbers
- Total Payout: MX$[X]
- Non-zero entities: [Y]/719
- Entity 96568046: MX$[Z]

## Proof Gates: 13 — see OB-85_R3_COMPLETION_REPORT.md"
```

### Proof Gates

- PG-12: `npm run build` exits 0
- PG-13: localhost:3000 responds

**Commit:** `OB-85-R3 Final: Completion report + PR`

---

## CRITICAL CONSTRAINTS

1. **DIAGNOSIS BEFORE CODE.** Phase 0 must be complete — with all SQL results pasted — before any fix code is written. The previous round failed because CC guessed the root cause instead of tracing it.

2. **COMPARE WORKING vs BROKEN.** The seed data calculates correctly. The imported data doesn't. The difference between their component_results structures IS the bug. Find it.

3. **NO PARALLEL PIPELINES.** Do not create a new calculation engine, a new import flow, or a new API route. Fix the existing code path.

4. **STOP AFTER MISSION 1 FOR ANDREW TO TEST.** Andrew will verify in the browser before proceeding to Mission 2.

---

*OB-85 Round 3 — February 23, 2026*
*"The attainment data is there. The payout is $0. Trace the gap."*
