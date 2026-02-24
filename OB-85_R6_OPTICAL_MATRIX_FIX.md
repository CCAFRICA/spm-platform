# OB-85 R6: OPTICAL MATRIX COLUMN METRIC + RECONCILIATION BENCHMARK CORRECTION
## One component. One bug. Known since February 11. Fix it, close the delta.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema

---

## CONTEXT — THE FULL PICTURE

### R5 Finding: All Six Pipes Are Connected
R5 Phase 0 proved all six component data pipes are working. No code was broken. The MX$525K was stale entity_period_outcomes. The actual engine produces **MX$1,878,415** across all 6 component types.

### Benchmark Was Overcounted
The benchmark file `RetailCo data results.xlsx` contains **3 months** (Jan, Feb, Mar 2024) — 2,157 rows = 719 employees × 3 months. Previous reconciliation compared against the 3-month sum (MX$3,665,282). The correct January-only benchmark is **MX$1,253,832**.

### Five Components Are Near-Perfect

| Component | VL Engine | Benchmark (Jan) | Delta |
|-----------|----------|----------------|-------|
| Store Sales (Tiered Bonus) | MX$115,250 | MX$116,250 | -0.9% |
| New Customers (Cond. %) | MX$38,500 | MX$39,100 | -1.5% |
| Collections (Tiered Bonus) | MX$279,800 | MX$283,000 | -1.1% |
| Warranty (% Commission) | MX$66,872 | MX$66,872 | 0.0% |
| Insurance (% Commission) | MX$42.54 | MX$10 | +MX$32 |
| **Subtotal (5 components)** | **MX$500,465** | **MX$505,232** | **-0.9%** |

### ONE Component Drives the Entire Delta

| Component | VL Engine | Benchmark (Jan) | Delta |
|-----------|----------|----------------|-------|
| **Optical Sales (Perf Matrix)** | **MX$1,377,950** | **MX$748,600** | **+84.1%** |

The MX$629,350 gap in Optical Sales = 100% of the platform delta. Fix this one component → engine matches benchmark.

---

## THE BUG — DIAGNOSED FEBRUARY 11, RECURRING

### What the Optical Component Does
The Optical Sales component uses a **2D matrix lookup**:
- **Row axis:** % attainment of optical sales goal (employee-level from Base_Venta_Individual)
- **Column axis:** $ total optical sales of the STORE (store-level band: <$60K, $60-100K, $100-120K, $120-180K, ≥$180K)

The payout at the intersection applies to each employee in that store.

### What's Wrong
The engine resolves the **column metric** from the wrong data source:
- **Should use:** Store-level optical sales total from `Base_Venta_Tienda` (the store's aggregate) → determines which column band
- **Actually uses:** Individual employee's optical sales amount from `Base_Venta_Individual` → maps to a higher band → higher payout

### Concrete Example (from CLT-14B / OB-33 forensics)
Employee 92686541, Store 298:
- Row metric: optical_attainment = 233.6% → Row 5 (≥150%) ✓ CORRECT
- Column metric: VL used individual $217,265 → Col 4 (≥$180K) ✗ WRONG
- Column metric: benchmark uses store total $48,500 → Col 0 (<$60K) ✓ CORRECT
- VL payout: $1,500 | Benchmark: $600 | Delta: +$900

### Why This Matters More Now
In earlier rounds (Feb 11-13), the optical delta was +$42K-$45K because only ~50 employees at multi-employee stores were affected. Now the delta is +$629K, suggesting the column metric resolution is wrong for MORE employees — possibly all of them, not just multi-employee stores.

### Entity 93515855 Trace
- Optical VL: MX$1,250 | Benchmark: MX$550 | Delta: +MX$700
- Store 388 — the benchmark places this in a lower column band
- All other components for this entity match exactly (Store ✓, New Customers ✓, Collections ✓)

---

## THE BENCHMARK PERFORMANCE MATRIX (Ground Truth)

### Certified (OPTOMETRISTA CERTIFICADO)

| % Attainment | <$60K | $60-100K | $100-120K | $120-180K | ≥$180K |
|-------------|-------|----------|-----------|-----------|--------|
| <80% | $0 | $0 | $0 | $500 | $800 |
| 80-89% | $200 | $300 | $500 | $800 | $1,100 |
| 90-99% | $300 | $500 | $800 | $1,100 | $1,500 |
| 100-149% | $800 | $1,100 | $1,500 | $1,800 | $2,500 |
| ≥150% | $1,000 | $1,300 | $1,800 | $2,200 | $3,000 |

### Non-Certified (OPTOMETRISTA NO CERTIFICADO)

| % Attainment | <$60K | $60-100K | $100-120K | $120-180K | ≥$180K |
|-------------|-------|----------|-----------|-----------|--------|
| <80% | $0 | $0 | $0 | $250 | $400 |
| 80-89% | $100 | $150 | $250 | $400 | $550 |
| 90-99% | $150 | $250 | $400 | $550 | $750 |
| 100-149% | $400 | $550 | $750 | $600 | $1,250 |
| ≥150% | $500 | $650 | $900 | $1,100 | $1,500 |

Note: Non-Certified row 4 ($120-180K) shows $600 — likely a typo in the original plan (lower than adjacent $750). The AI interpreter should flag but preserve this value.

### Column Band Definition (Rango_Tienda — Store Optical Sales Volume)
- `Menos de $60k` → <$60,000
- `$60k a menos de $100K` → $60,000-$99,999
- `$100k a menos de $120K` → $100,000-$119,999
- `$120k a menos de $180K` → $120,000-$179,999
- `$180K o más` → ≥$180,000

**The column band is determined by the STORE's total optical sales, NOT the individual employee's sales.**

---

## CC FAILURE PATTERN WARNING

| Pattern | What Happened | What To Do Instead |
|---------|---------------|-------------------|
| Theory-first diagnosis | R2 guessed without tracing data. Wrong. | Phase 0 SQL trace before ANY code. |
| Overcorrection | R4 killed 3 components while fixing inflation. | Touch ONLY the matrix column resolution. |
| Creating parallel paths | Previous rounds created new functions instead of fixing existing. | Fix the existing metric resolution path. |
| Hardcoding | Previous rounds hardcoded sheet names. | Korean Test: zero hardcoded names. |

---

## PHASE 0: TRACE THE COLUMN METRIC RESOLUTION PATH

### 0A: Find how the matrix lookup resolves its column value

```bash
echo "=== CALCULATION ENGINE: Matrix lookup implementation ==="
grep -n -B 3 -A 20 "matrix\|Matrix\|column\|Column\|colBand\|col_band\|columnMetric" \
  src/lib/calculation/calculation-engine.ts 2>/dev/null | head -80

echo ""
echo "=== ORCHESTRATOR: How it builds metrics for matrix components ==="
grep -n -B 3 -A 20 "matrix\|buildMetric\|buildComponent\|columnMetric\|store.*amount\|amount.*store" \
  src/lib/orchestration/calculation-orchestrator.ts 2>/dev/null | head -80

echo ""
echo "=== METRIC RESOLVER: How it resolves store vs individual metrics ==="
grep -n -B 3 -A 20 "store\|topology\|store_component\|employee_component\|resolveMetric\|getMetric" \
  src/lib/orchestration/metric-resolver.ts 2>/dev/null | head -60
```

### 0B: Find what value the engine currently uses for the optical column

```sql
-- Get a sample entity's calculation trace for the Optical component
SELECT 
  e.external_id,
  cr.total_payout,
  cr.component_results->'Optical Sales - Certified' as optical_cert,
  cr.component_results->'Optical Sales - Non-Certified' as optical_noncert
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
)
AND e.external_id IN ('93515855', '92686541', '97678074')
LIMIT 5;
```

**PASTE the full component_results for the Optical component.** We need to see what column value/band was selected.

### 0C: Find what store-level data exists for these entities' stores

```sql
-- What does Base_Venta_Tienda contain for the stores these employees belong to?
-- First find the store IDs
SELECT DISTINCT 
  e.external_id as employee,
  cd.raw_data->>'No_Tienda' as store_id
FROM committed_data cd
JOIN entities e ON e.id = cd.entity_id
WHERE cd.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND cd.sheet_name = 'Datos_Colaborador'
AND e.external_id IN ('93515855', '92686541', '97678074')
LIMIT 5;

-- Then check Base_Venta_Tienda for those stores
-- (replace STORE_IDS with actual values from above)
SELECT 
  cd.raw_data->>'No_Tienda' as store,
  cd.raw_data->>'Venta_Tienda' as store_sales,
  cd.raw_data->>'Meta_Venta_Tienda' as store_goal,
  cd.raw_data
FROM committed_data cd
WHERE cd.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND cd.sheet_name = 'Base_Venta_Tienda'
AND cd.raw_data->>'No_Tienda' IN ('388', '298', '143')
LIMIT 10;
```

**Key question:** Does Base_Venta_Tienda have a field that represents total optical sales per store? Or does the store's optical sales need to be derived from Base_Venta_Individual by summing employee amounts per store?

### 0D: Read the plan's rule_set for the Optical component

```sql
SELECT jsonb_pretty(
  rule_set->'components'->0  -- or whichever index is Optical
) as optical_component
FROM plans
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND status = 'active'
LIMIT 1;
```

**Key question:** Does the plan's Optical component definition specify where the column metric comes from? Is there a `columnMetricSource`, `columnMetric`, `measurementLevel`, or similar field that distinguishes store vs individual?

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — OB-85 R6
//
// MATRIX COLUMN METRIC RESOLUTION:
// Current code path: [file:function:line] → reads [what] from [where]
// Expected: reads store-level optical sales from Base_Venta_Tienda (or aggregated)
// Actual: reads [what it actually reads] from [where]
//
// BASE_VENTA_TIENDA DATA:
// Store 388 (entity 93515855): [fields available]
// Store 298 (entity 92686541): [fields available]
// Does it contain a store optical sales total? YES/NO
// If NO, must aggregate from Base_Venta_Individual
//
// PLAN RULE_SET FOR OPTICAL:
// Column metric source specified? YES/NO
// If YES: [what it says]
// If NO: engine must infer from topology
//
// ROOT CAUSE:
// [ONE specific statement about what's wrong and where]
```

**Commit:** `OB-85-R6 Phase 0: Optical matrix column metric trace`

**Do NOT write fix code until Phase 0 is committed.**

---

## MISSION 1: FIX THE OPTICAL MATRIX COLUMN METRIC RESOLUTION

Based on Phase 0 diagnosis, fix the column metric to use store-level data.

### The Fix Pattern (from OB-34 architecture decision)

The preferred approach is `columnMetricSource` in the matrix config:
- The plan component definition should specify that the column metric comes from store-level data
- The orchestrator/metric resolver reads the column metric from the specified store-level sheet
- Fallback: if no `columnMetricSource` specified, use existing behavior (backward compatible)

### Critical Constraints

1. **TOUCH ONLY THE COLUMN METRIC RESOLUTION.** The row metric (attainment) is correct. The five other components are within ±1.5%. Do not modify any code that affects them.

2. **KOREAN TEST.** Zero hardcoded sheet names (`Base_Venta_Tienda`), column names (`Venta_Tienda`, `No_Tienda`), or language-specific patterns. The fix must work by topology classification (`store_component`) and semantic type (`amount`), not by name matching.

3. **NO NEW CALCULATION ENGINES.** Fix the existing metric resolution path. Do not create a parallel matrix handler.

4. **PRESERVE _rawFields.** The Carry Everything principle: the store data should arrive via the same `_rawFields` mechanism that already works for other store-level components.

5. **SUPABASE BATCH ≤200.** Any new `.in()` calls must batch at 200 max.

### What the Fix Must Achieve

For every entity in a matrix_lookup component:
- **Row metric:** resolved from employee-level data (attainment) → ALREADY WORKS, don't touch
- **Column metric:** resolved from STORE-level data (the store's optical sales total or band) → THIS IS THE FIX

The store's optical sales total determines which column band the entity falls into. The band boundaries from the plan are: <$60K, $60-100K, $100-120K, $120-180K, ≥$180K.

### Possible Data Sources for Store Optical Sales

1. **Direct field in Base_Venta_Tienda** — if the store sheet has a field like `Venta_Optica` or similar that represents the store's total optical sales
2. **Aggregation from Base_Venta_Individual** — sum all `Venta_Individual` amounts for employees at the same store to get the store total
3. **The Rango_Tienda field from roster** — the Datos_Colaborador sheet has `Rango_Tienda` which is literally the pre-computed store volume band ($60k-$100K, etc.)

**Option 3 is the most reliable** if it exists — it's the benchmark's own classification of the store's volume band. Check Phase 0D to determine which option applies.

### After Fix — Verify With SQL

```sql
-- Re-trigger calculation, then check Optical component for key entities

-- Entity 93515855 (Store 388, Non-Certified)
-- Benchmark: MX$550 optical
SELECT e.external_id, cr.total_payout,
  cr.component_results
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id  
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
)
AND e.external_id = '93515855';

-- Aggregate check
SELECT SUM(cr.total_payout) as vl_total, COUNT(*) as entities
FROM calculation_results cr
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
);
```

### Accuracy Targets

- Entity 93515855 optical: close to MX$550 (currently MX$1,250)
- Aggregate optical total: close to MX$748,600 (currently MX$1,377,950)
- Aggregate grand total: close to MX$1,253,832 (currently MX$1,878,415)
- Five other components: UNCHANGED (±1.5%)
- Target total delta: <5% from MX$1,253,832

**Commit:** `OB-85-R6 Mission 1: Fix optical matrix column metric — resolve from store-level data`

**STOP HERE. Report findings. Andrew will re-run reconciliation against CORRECTED January-only benchmark.**

---

## MISSION 2: FIX THE RECONCILIATION BENCHMARK (Andrew-led after Mission 1)

The reconciliation page currently compares against MX$3,665,282 (3-month sum). It needs to compare against January only (MX$1,253,832).

This is either:
1. A benchmark file issue (upload January-only extract)
2. A reconciliation page filter issue (filter by Mes=1)
3. A reconciliation page that just takes whatever file you give it

Andrew will determine which approach after Mission 1 is verified.

---

## MISSION 3: BUILD + PR

Only after Missions 1-2 confirm improvement:

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### Completion Report

Save as `OB-85_R6_COMPLETION_REPORT.md` in PROJECT ROOT.

Include:
1. **Phase 0 diagnosis** — exact column metric resolution path, before/after
2. **Root cause** — what the engine used vs what it should use
3. **Fix description** — files changed, lines changed, approach taken
4. **Entity 93515855** — optical before R6, after R6, benchmark
5. **Aggregate** — optical total before (MX$1,377,950), after, benchmark (MX$748,600)
6. **Grand total** — before (MX$1,878,415), after, benchmark (MX$1,253,832)
7. **Five other components** — unchanged confirmation
8. **All proof gates** — PASS/FAIL with evidence

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-85 R6: Fix Optical Matrix Column Metric — Store-Level Resolution" \
  --body "## The Last Calculation Accuracy Fix

### The Bug
Optical Sales matrix column metric resolved from individual employee data instead of store-level data.
Every employee mapped to a higher column band → systematically inflated optical payouts.

### The Fix
[Column metric now resolves from store-level data — describe approach]

### Results
- Optical: MX\$1,377,950 → MX\$[NEW] (benchmark: MX\$748,600)
- Total: MX\$1,878,415 → MX\$[NEW] (benchmark: MX\$1,253,832)
- 5 other components: UNCHANGED (±1.5%)

### Benchmark Correction
Reconciliation now compares against January-only (MX\$1,253,832), not 3-month sum (MX\$3,665,282).

## Proof Gates: see OB-85_R6_COMPLETION_REPORT.md"
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 committed | Column metric trace with SQL evidence |
| PG-2 | Root cause identified | Specific file, function, line where column metric resolves incorrectly |
| PG-3 | Column metric uses store data | After fix, Optical column reads from store-level source |
| PG-4 | Entity 93515855 optical improved | Closer to MX$550 than MX$1,250 |
| PG-5 | Aggregate optical improved | Closer to MX$748,600 than MX$1,377,950 |
| PG-6 | Grand total improved | Closer to MX$1,253,832 than MX$1,878,415 |
| PG-7 | Store Sales UNCHANGED | Still MX$115,250 (±2%) |
| PG-8 | Collections UNCHANGED | Still MX$279,800 (±2%) |
| PG-9 | New Customers UNCHANGED | Still MX$38,500 (±2%) |
| PG-10 | Warranty UNCHANGED | Still MX$66,872 (±2%) |
| PG-11 | No hardcoded field names | Korean Test — zero language-specific patterns |
| PG-12 | Supabase batch ≤200 | Any new `.in()` calls verified |
| PG-13 | `npm run build` exits 0 | Clean build |
| PG-14 | localhost:3000 responds | HTTP 200 |

**Commit:** `OB-85-R6 Final: Completion report + PR`

---

## WHY THIS IS THE LAST CALCULATION FIX

After R6, the expected state is:
- 6/6 components producing payouts ✓ (proven by R5)
- 5/6 components within ±1.5% of benchmark ✓ (proven by analysis)
- Optical component column metric fixed → should bring optical within ±5%
- Grand total within ±5% of corrected benchmark (MX$1,253,832)

At that point, the calculation engine is **production-viable**. Remaining sub-percent variances are refinements, not bugs.

---

*OB-85 R6 — February 24, 2026*
*"One component. One bug. Known since February 11. Five components already prove the engine works."*
*"The column reads the store, not the employee. That's the fix."*
