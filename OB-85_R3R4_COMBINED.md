# OB-85 R3/R4 COMBINED: CALCULATION ACCURACY + ENTITY DISPLAY + BUILD
## Pipeline works. Accuracy doesn't. Trace the formula, fix the math.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE.md`
3. `OB-85_R3_DIAGNOSIS.md` — your own diagnosis (entity UUID fragmentation, the fixes you applied)
4. The R3 completion report (your most recent diagnostic findings)

---

## NEW STANDING RULE — ADD IMMEDIATELY

Before doing ANYTHING else, add this to `CC_STANDING_ARCHITECTURE_RULES.md`:

```markdown
## SUPABASE BATCH SIZE LIMIT

All `.in('column', array)` calls MUST batch at ≤200 items.
Arrays >200 UUIDs produce URLs that exceed Supabase's URL limit and silently return 0 rows.

This has caused 3 production failures:
1. Entity data consolidation (route.ts) — 719 UUIDs → 0 rows
2. Entity display (page-loaders.ts) — 719 UUIDs → 0 rows  
3. Reconciliation matching (reconciliation route) — 719 UUIDs → 0 rows

Pattern: chunk the array, query each chunk, merge results.
Grep for `.in(` periodically and verify batch sizes.
```

**Commit:** `OB-85-R3R4: Standing rule — Supabase batch size ≤200`

---

## CONTEXT — WHAT HAPPENED

The pipeline WORKS:
- 719/719 entities matched (100% match rate in reconciliation)
- Import → Calculate → Reconcile runs end-to-end

The accuracy is WRONG:
- **VL Total: MX$4,191,451,847** vs **Benchmark: MX$3,665,282** 
- **Delta: 114,255%** — VL calculates ~1,143× too high
- Entity 93515855: VL = MX$24,688,044 vs Benchmark = MX$4,650 (5,309× too high)
- Tiered Bonus: MX$0 for all entities (should be non-zero for some)

---

## PHASE 0: SURGICAL ACCURACY TRACE — ONE ENTITY

Trace entity **93515855** through every calculation step. This entity has the clearest comparison: VL says MX$24.6M, benchmark says MX$4,650.

### 0A: What raw data exists for entity 93515855?

```sql
-- All committed_data for this employee in Jan 2024
SELECT cd.sheet_name, cd.raw_data, e.external_id, e.id as entity_uuid
FROM committed_data cd
JOIN entities e ON e.id = cd.entity_id
WHERE cd.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND cd.raw_data::text LIKE '%93515855%'
AND cd.period_id IN (
  SELECT id FROM periods 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  AND start_date >= '2024-01-01' AND start_date < '2024-02-01'
)
LIMIT 20;
```

**PASTE THE FULL raw_data JSON for each sheet.** We need: Venta_Individual, Meta_Individual, Cumplimiento, and any bonus/commission values.

### 0B: What did the calculation engine produce per component?

```sql
-- Component-level results for entity 93515855
SELECT cr.total_payout, 
       jsonb_pretty(cr.component_results) as components,
       jsonb_pretty(cr.metadata) as calc_metadata
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND (e.external_id = '93515855' OR e.external_id LIKE '%-93515855')
ORDER BY cr.created_at DESC
LIMIT 1;
```

**PASTE THE FULL component_results.** For each component, we need: input metrics, formula applied, intermediate values, final payout.

### 0C: What does the benchmark say for this entity?

The benchmark file (RetailCo data results.xlsx, uploaded for reconciliation) has a row for employee 93515855 with Pago_Total_Incentivo = MX$4,650.

```sql
-- Check if the reconciliation stored the benchmark data
SELECT * FROM reconciliation_benchmarks 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
LIMIT 5;
```

If no table exists, read the benchmark from the reconciliation upload logic — where does the uploaded file data go?

### 0D: What does the rule_set say for each component?

```sql
-- Full component definitions with formulas
SELECT jsonb_pretty(components) as components
FROM rule_sets
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND status = 'active'
LIMIT 1;
```

For EACH component, document:
- Component name and type (matrix_lookup, tier_lookup, percentage, conditional_percentage)
- Expected input metrics
- Rate table / tier boundaries / percentage value
- Expected output formula

### 0E: Trace the ACTUAL code path for one component

Pick the component with the largest dollar amount (likely Performance Matrix at MX$1.07B total or Percentage Commission at MX$2.1B). 

```bash
echo "=== CALCULATION ENGINE — COMPONENT EXECUTION ==="

# Find the main calculation function
grep -rn "function.*calculate\|function.*compute\|function.*resolve.*payout\|calculateComponent\|computePayout" \
  web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts" | head -20

echo ""
echo "=== For the specific component type (percentage, matrix_lookup, etc.) ==="
grep -rn "percentage\|matrix_lookup\|tier_lookup\|conditional_percentage" \
  web/src/lib/calculation/ --include="*.ts" | head -30

echo ""
echo "=== Show the actual formula application ==="
# For each calculation type, show where the math happens
for f in $(find web/src/lib/calculation -name "*.ts" | grep -v node_modules | grep -v .next); do
  echo ""
  echo "=== $f ==="
  grep -n "payout\|result.*=\|amount.*\*\|rate.*\*\|multiply\|percentage.*\*\|attainment.*\*" "$f" | head -15
done
```

### 0F: Manual calculation check

Using the raw data from 0A and the rule_set from 0D, manually calculate what entity 93515855's payout SHOULD be.

For example, if:
- Venta_Individual = 115,523 (sales amount)
- Meta_Individual = 74,410 (goal)
- Cumplimiento = 1.551 (attainment = 155.1%)
- Component type = percentage
- Rate = 5%

Then expected payout = 115,523 × 0.05 = MX$5,776

Compare this to:
- What VL calculated: MX$24,688,044
- What benchmark says: MX$4,650

The gap between manual calculation and VL output reveals the formula bug.

### PHASE 0 DELIVERABLE

Write `OB-85_R3R4_ACCURACY_DIAGNOSIS.md` at project root with:

1. **Raw data** for entity 93515855 (all sheets, key fields)
2. **VL component_results** for entity 93515855 (per-component payout)
3. **Rule_set component definitions** (formulas, rates, tiers)
4. **Manual calculation** (what the answer SHOULD be based on raw data + rules)
5. **The specific code path** where the formula is applied incorrectly
6. **The fix** — what needs to change

**Commit:** `OB-85-R3R4 Phase 0: Accuracy diagnosis — entity 93515855 trace`

**Do NOT write fix code until Phase 0 is committed.**

---

## MISSION 1: FIX CALCULATION ACCURACY

Based on Phase 0 diagnosis, fix the specific formula/rate/multiplier issue.

### Common failure patterns to check:

| Pattern | What it looks like | Fix |
|---------|-------------------|-----|
| Percentage vs decimal | Attainment 135.1 treated as 135.1× instead of 1.351× | Divide by 100 if value > 10 |
| Rate table returns raw tier value | Lookup returns "74,410" (the goal amount) instead of a rate | Use the rate/percentage from the tier, not the metric value |
| Compounding across components | Each component multiplies the previous total instead of adding | Ensure additive aggregation |
| Amount used as rate | Venta_Individual (100,560) used as a multiplier | Distinguish between amounts and rates |
| Double-counting | Same metric applied to multiple components | Verify each component uses unique metric paths |
| Store-level aggregation | Store totals (37 stores × MX$11.3M each) summed instead of individual | Verify entity-level vs store-level data separation |

### After fix, re-run calculation and verify:

```sql
-- Re-check entity 93515855
SELECT cr.total_payout, jsonb_pretty(cr.component_results)
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE (e.external_id = '93515855' OR e.external_id LIKE '%-93515855')
AND cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
)
LIMIT 1;

-- Check aggregate accuracy
SELECT 
  SUM(cr.total_payout) as vl_total,
  COUNT(*) as entity_count,
  AVG(cr.total_payout) as avg_payout,
  MIN(cr.total_payout) as min_payout,
  MAX(cr.total_payout) as max_payout
FROM calculation_results cr
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
);
```

### Accuracy targets:

The benchmark total is MX$3,665,282 across ~719 entities (avg ~MX$5,097 each).

- Entity 93515855 should be near MX$4,650 (benchmark value)
- Total should be in the range of MX$3-5M, not MX$4B
- The reconciliation delta should be <50% (ideally <10%)

### Proof Gates

- PG-1: Phase 0 diagnosis committed with all SQL output
- PG-2: Manual calculation documented (raw data + rules → expected result)
- PG-3: Specific formula bug identified (line numbers, files)
- PG-4: Fix applied
- PG-5: Entity 93515855 total_payout within 50% of MX$4,650
- PG-6: Aggregate total within same order of magnitude as MX$3,665,282 (i.e., millions not billions)
- PG-7: At least 500/719 entities have non-zero payout
- PG-8: Tiered Bonus component produces non-zero for at least some entities

**Commit:** `OB-85-R3R4 Mission 1: Calculation accuracy fix — [what was wrong and how it was fixed]`

**STOP HERE. Andrew will re-test in browser + re-run reconciliation before proceeding.**

---

## MISSION 2: ENTITY DISPLAY FIX

After Andrew confirms accuracy is improved:

### Requirements:
- Employee ID column: external_id (93515855), NOT UUID
- Name column: display_name or employee name from roster data, NOT UUID or repeated external_id
- Components column: per-component payout breakdown from component_results

### Implementation:
```bash
echo "=== WHERE IS THE ENTITY TABLE RENDERED? ==="
grep -rn "Top.*5\|top.*entities\|entity.*table\|employee.*list\|payout.*table" \
  web/src/app/operate/ web/src/components/operate/ --include="*.tsx" | head -15

echo ""
echo "=== WHERE DOES THE TABLE GET ITS DATA? ==="
grep -rn "external_id\|display_name\|entity_id\|employee.*name" \
  web/src/app/operate/ web/src/components/operate/ --include="*.tsx" --include="*.ts" | head -15
```

Fix the data source so the table uses:
- `entities.external_id` for the ID column
- `entities.display_name` OR roster data `raw_data.nombre` for the Name column  
- `calculation_results.component_results` parsed per-component for the Components column

### Proof Gates

- PG-9: Employee ID column shows "93515855" not UUID
- PG-10: Name column shows employee name (or external_id if name unavailable)
- PG-11: Components column shows per-component breakdown with non-zero values

**Commit:** `OB-85-R3R4 Mission 2: Entity display — external IDs and component breakdown`

---

## MISSION 3: PERIOD RIBBON READABILITY

The period ribbon (Jan 2026, Jun 2024, May 2024, Apr 2024, Mar 2024, Feb 2024, Jan 2024, Dec 2023) has:
- Tiny text, low contrast
- No visual weight on selected period
- Difficult to read which period is active

### Fix:
- Increase font size on period labels
- Add clear visual indicator for selected period (bold text, background color, border)
- Show entity count and lifecycle state under each period label
- Currently selected period should be unmistakable

### Proof Gates

- PG-12: Selected period has clear visual distinction (background, border, or bold)
- PG-13: Period labels are readable without squinting

**Commit:** `OB-85-R3R4 Mission 3: Period ribbon readability`

---

## MISSION 4: ZERO-PAYOUT WARNING

If a calculation produces 100% zero payouts, the UI should:
- Show a prominent warning banner (not just the AI assessment)
- Block lifecycle advancement (no "Start Reconciliation" when everything is $0)
- Suggest diagnostic actions

If >90% but <100% are zero, show a warning but allow advancement.

### Proof Gates

- PG-14: Zero-payout batch shows warning banner
- PG-15: Lifecycle button disabled or shows confirmation warning

**Commit:** `OB-85-R3R4 Mission 4: Zero-payout defensive warning`

---

## MISSION 5: BUILD + PR + COMPLETION REPORT

### Build

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
npm run dev &
sleep 5
curl -s http://localhost:3000 | head -5
```

### Completion Report

Save as `OB-85_R3R4_COMPLETION_REPORT.md` at project root:

1. **Standing Rule Added** — Supabase batch size ≤200
2. **Accuracy Diagnosis** — what the formula bug was (with SQL evidence)
3. **Accuracy Fix** — files changed, math corrected, before/after comparison
4. **Entity 93515855** — VL payout before fix, after fix, benchmark value
5. **Aggregate** — total payout before fix, after fix, benchmark total, delta %
6. **Entity Display** — external IDs, names, component breakdown
7. **Period Ribbon** — readability improvements
8. **Zero-Payout Warning** — defensive UI
9. **All 17 proof gates** — PASS/FAIL with evidence

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-85 R3/R4: Calculation Accuracy + Entity Display + UX Polish" \
  --body "## What This Fixes

### Calculation Accuracy
- Before: MX\$4,191,451,847 (114,255% delta from benchmark)
- After: MX\$[NEW_TOTAL] ([NEW_DELTA]% delta from benchmark)
- Root cause: [WHAT WAS WRONG]

### Entity Display
- Employee IDs instead of UUIDs
- Component breakdown per entity

### UX
- Period ribbon readability
- Zero-payout defensive warning
- Supabase batch size standing rule

## Proof Gates: 17 — see OB-85_R3R4_COMPLETION_REPORT.md"
```

### Proof Gates

- PG-16: `npm run build` exits 0
- PG-17: localhost:3000 responds

**Commit:** `OB-85-R3R4 Final: Completion report + PR`

---

## CRITICAL CONSTRAINTS

1. **DIAGNOSIS BEFORE CODE.** Phase 0 complete with SQL output before any fix code. This worked in R3 — it's now proven methodology.

2. **MANUAL CALCULATION.** For entity 93515855, compute by hand what the payout should be. Compare to VL output. The difference IS the bug.

3. **STOP AFTER MISSION 1.** Andrew re-tests accuracy in browser + re-runs reconciliation before Missions 2-5.

4. **NO NEW CALCULATION ENGINES.** Fix the existing code. Don't create parallel paths.

5. **SUPABASE BATCH RULE.** Before touching any code, add the standing rule. Then grep the entire codebase for `.in(` and fix any batch sizes >200.

---

*OB-85 R3/R4 Combined — February 23, 2026*
*"The pipeline works. The accuracy doesn't. Trace the formula, fix the math."*
