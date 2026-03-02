# OB-121: CALCULATION HYGIENE + DEPOSIT GROWTH INFRASTRUCTURE
## Target: alpha.2.0
## Depends on: OB-120 (PR #132), HF-077

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. `OB-120_COMPLETION_REPORT.md` — current pipeline state
4. `OB-119_COMPLETION_REPORT.md` — Data Intelligence results
5. This prompt contains everything needed. Do not guess.

---

## CONTEXT

### Where We Are

| OB | Status | What It Built | Result |
|----|--------|---------------|--------|
| OB-117 | ✅ | Rate detection heuristic | Mortgage $0→$985K |
| OB-118 | ✅ | Metric derivation engine | Insurance Referral $0→$124K |
| OB-119 | ✅ PR #131 | Data Intelligence pipeline | $0→$1,046,891 |
| OB-120 | ✅ PR #132 | Convergence Layer | $1,046,891→$3,256,678 |
| HF-077 | ✅/🔄 | Domain leak cleanup | Korean Test enforcement |
| **OB-121** | **THIS** | **Calculation hygiene + Deposit Growth + Consumer Lending calibration** |

### The Three Problems (from CC-UAT Calculation Trace)

**Problem 1: STALE CALCULATION RESULTS — $7.75M ghost total**

The calculation trace for entity Luis (1005) shows DUPLICATE rows in calculation_results:
```
Consumer Lending | 2024-01 | $0.01    ← stale (pre-OB-120)
Consumer Lending | 2024-01 | $42,263  ← current (post-OB-120)
Consumer Lending | 2024-03 | $0.01    ← stale
Consumer Lending | 2024-03 | $19,655  ← current
Consumer Lending | 2024-03 | $19,655  ← DUPLICATE current
Consumer Lending | 2024-03 | $19,655  ← DUPLICATE current
```

OB-120 did not DELETE old results before recalculating. The reported $3,256,678 grand total AND the trace's $7,750,591 grand total are BOTH inflated by stale rows coexisting with fresh rows. We don't know the actual current total until stale results are purged.

**This is the highest priority.** Every number we've reported since OB-119 may be wrong due to result accumulation.

**Problem 2: CONSUMER LENDING — $2M vs $6.3M benchmark gap**

After cleaning stale results (Problem 1), we need to understand the actual Consumer Lending total. The calculation trace shows correct metric resolution ($3.5M SUM(LoanAmount) for Luis in January) and a plausible payout ($42,263 = ~1.2% effective rate on $3.5M). But the aggregate may differ from the $6.3M OB-116 benchmark because:
- OB-120's `isMarginal` auto-detection may apply marginal tiering when the benchmark assumed flat
- The `postProcessing` transform may handle boundary cases differently
- The benchmark itself was from manual SHEET_COMPONENT_PATTERNS wiring — different input path

We investigate after cleaning. If the actual total is reasonable (entities × periods × plausible rates), we accept it. If it's clearly wrong, we fix.

**Problem 3: DEPOSIT GROWTH — metric "UNKNOWN", no ratio computation**

The calculation trace is definitive:
```
Expected metric: "UNKNOWN"
Derivation: NONE for "UNKNOWN"
input: source("ratio")
boundaries: [0, 80, 100, 120]  ← attainment percentage thresholds
outputs: [0, 5000, 10000, 18000]  ← flat bonus amounts
```

Four failures stacked:
1. **Metric name is "UNKNOWN"** — plan interpretation didn't extract a metric name from the calculationIntent
2. **Intent expects `source("ratio")`** — the engine needs an attainment ratio (actual_growth / target), not a raw dollar amount
3. **No target/goal data** — the demo package's `CFG_Deposit_Growth_Incentive_Q1_2024.xlsx` has a Tab 2 with per-entity targets, but this was never imported
4. **Entity assignment gap** — Luis has product_licenses "Consumer Lending, Insurance" (no Deposits) but IS assigned to Deposit Growth plan. 48 deposit_balance rows exist across other entities.

The Deposit Growth plan requires a structural primitive not yet implemented: **ratio of two data sources** (actual balance delta ÷ target). This is different from all other plans which use a single data source with sum or count.

---

## CC FAILURE PATTERN WARNINGS

| # | Pattern | Risk in This OB | Mitigation |
|---|---------|-----------------|------------|
| F (Stale State) | Not clearing old results before recalculation | Phase 1 is exclusively about cleanup and establishing correct baseline | Verify row counts before AND after |
| 1 | Hardcoded dictionaries | Hardcoding target values for Deposit Growth | Target values come from imported data, not code |
| 14 | Report pass before verification | Claiming correct totals without stale cleanup | Phase 1 must complete before ANY financial numbers are reported |
| 10 | Auth file modifications | Touching middleware, auth, or RLS | Do NOT modify any auth files |

---

## PHASE 0: DIAGNOSTIC — TRUE STATE

### 0A: Quantify stale results

```bash
cd /Users/AndrewAfrica/spm-platform

echo "=== TOTAL CALCULATION RESULTS ==="
echo "SELECT COUNT(*) as total_rows FROM calculation_results 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');"

echo ""
echo "=== DUPLICATE CHECK — same entity+period+plan ==="
echo "SELECT entity_id, period_id, rule_set_id, COUNT(*) as row_count
FROM calculation_results 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY entity_id, period_id, rule_set_id
HAVING COUNT(*) > 1
LIMIT 20;"

echo ""
echo "=== RESULTS BY PLAN — shows if stale and fresh coexist ==="
echo "SELECT rs.name, COUNT(*) as rows, 
  COUNT(DISTINCT entity_id) as entities,
  COUNT(DISTINCT period_id) as periods,
  SUM(total_payout) as total,
  MIN(cr.created_at) as earliest,
  MAX(cr.created_at) as latest
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY rs.name ORDER BY rs.name;"

echo ""
echo "=== EXPECTED ROW COUNT ==="
echo "SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')) as entities,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')) as periods,
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc') AND status = 'active') as plans;"
```

We need to see:
- How many duplicate rows exist (same entity+period+plan with different totals)
- The time range of results (earliest = stale from OB-116/117, latest = OB-120)
- Expected count = entities × periods × plans = 25 × 4 × 4 = 400

### 0B: Deposit Growth plan structure

```bash
echo "=== DEPOSIT GROWTH calculationIntent ==="
echo "SELECT name, 
  jsonb_pretty(components::jsonb) as components,
  jsonb_pretty(input_bindings::jsonb) as bindings
FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND name LIKE '%Deposit%';"

echo ""
echo "=== DEPOSIT BALANCE DATA SAMPLE ==="
echo "SELECT entity_id, period_id, data_type, 
  raw_data->>'TotalDepositBalance' as balance,
  raw_data->>'OfficerID' as officer
FROM committed_data 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND data_type = 'deposit_balances'
ORDER BY entity_id, period_id
LIMIT 20;"

echo ""
echo "=== DEPOSIT ENTITIES — who has deposit data? ==="
echo "SELECT e.display_name, e.external_id, COUNT(cd.id) as deposit_rows
FROM committed_data cd
JOIN entities e ON cd.entity_id = e.id
WHERE cd.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND cd.data_type = 'deposit_balances'
GROUP BY e.display_name, e.external_id
ORDER BY e.display_name;"

echo ""
echo "=== DEPOSIT GROWTH PLAN ASSIGNMENTS ==="
echo "SELECT e.display_name, e.external_id, e.metadata->>'product_licenses' as licenses
FROM rule_set_assignments rsa
JOIN entities e ON rsa.entity_id = e.id
JOIN rule_sets rs ON rsa.rule_set_id = rs.id
WHERE rsa.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND rs.name LIKE '%Deposit%'
ORDER BY e.display_name;"
```

We need to see:
- The calculationIntent structure (what operation, what metric name, what boundaries)
- Whether deposit_balances rows have per-entity per-period data
- Whether the entities assigned to Deposit Growth actually have deposit data
- Whether target/goal data exists (Tab 2 of the original XLSX)

### 0C: Consumer Lending intent structure (check isMarginal)

```bash
echo "=== CONSUMER LENDING FULL INTENT ==="
echo "SELECT name,
  jsonb_pretty(components::jsonb->0->'calculationIntent') as intent,
  components::jsonb->0->>'postProcessing' as post_processing
FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND name LIKE '%Consumer%';"

echo ""
echo "=== HOW postProcessing TRANSFORM WORKS ==="
grep -n "postProcessing\|rateFromLookup\|isMarginal\|marginal" \
  web/src/lib/calculation/run-calculation.ts | head -20
```

### 0D: Check if run-calculation clears old results

```bash
echo "=== DOES THE ENGINE CLEAR BEFORE INSERTING? ==="
grep -n "delete\|DELETE\|upsert\|UPSERT\|ON CONFLICT\|calculation_results" \
  web/src/lib/calculation/run-calculation.ts \
  web/src/app/api/calculation/run*/route.ts 2>/dev/null | head -20
```

This tells us whether the engine is inserting WITHOUT deleting (causing accumulation) or upserting (which would prevent duplicates).

**Commit:** `OB-121 Phase 0: Diagnostic — stale result quantification + Deposit Growth structure + engine deletion behavior`

---

## PHASE 1: PURGE STALE RESULTS + ESTABLISH BASELINE

### 1A: Clean calculation_results for MBC

```bash
echo "=== DELETE ALL MBC CALCULATION RESULTS ==="
echo "DELETE FROM calculation_results 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');

DELETE FROM calculation_batches 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');

DELETE FROM entity_period_outcomes 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');"

echo ""
echo "=== VERIFY CLEAN ==="
echo "SELECT COUNT(*) as remaining FROM calculation_results 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');"
```

### 1B: Re-run calculation from clean state

Trigger calculation for all 4 plans across all 4 periods. Use the existing calculation API or script.

```bash
echo "=== TRIGGER FRESH CALCULATION ==="
# Use the calculation API endpoint
# POST /api/calculation/run with tenantId + all plans + all periods
```

### 1C: Record TRUE baseline

```sql
-- The REAL numbers after stale cleanup
SELECT rs.name as plan, 
  COUNT(DISTINCT cr.entity_id) as entities,
  COUNT(DISTINCT cr.period_id) as periods,
  COUNT(*) as result_rows,
  SUM(cr.total_payout) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY rs.name ORDER BY rs.name;

-- Grand total
SELECT SUM(total_payout) as grand_total,
  COUNT(*) as total_rows,
  COUNT(DISTINCT entity_id) as entities
FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc');

-- Duplicate check — MUST be zero
SELECT entity_id, period_id, rule_set_id, COUNT(*) as dupes
FROM calculation_results 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY entity_id, period_id, rule_set_id
HAVING COUNT(*) > 1;
```

### 1D: Fix the engine to prevent future accumulation

Based on Phase 0D diagnostic:

**If engine INSERTS without DELETE:** Add a DELETE before INSERT:
```typescript
// Before inserting new results, clear old ones for this entity+period+plan
await supabase
  .from('calculation_results')
  .delete()
  .eq('tenant_id', tenantId)
  .eq('rule_set_id', ruleSetId)
  .eq('period_id', periodId);
```

**If engine already has upsert:** Check why duplicates exist anyway (different created_at? different batch_id?).

**The structural fix is:** calculation_results should have a UNIQUE constraint on (tenant_id, entity_id, period_id, rule_set_id). Duplicates should be impossible at the database level.

```sql
-- Add unique constraint to prevent future accumulation
ALTER TABLE calculation_results 
ADD CONSTRAINT calculation_results_unique_entity_period_plan 
UNIQUE (tenant_id, entity_id, period_id, rule_set_id);
```

**If this constraint fails because duplicates exist:** clean them first (1A), then add the constraint.

### Proof Gate Phase 1
```
- Zero duplicate rows (same entity+period+plan)
- Row count = entities × periods × plans assigned (approximately — not all entities assigned to all plans)
- Grand total is a SINGLE clean number
- Unique constraint added to prevent future accumulation
```

**Commit:** `OB-121 Phase 1: Purge stale results + unique constraint + engine cleanup`

---

## PHASE 2: CONSUMER LENDING CALIBRATION

### What to Investigate

After Phase 1 produces a clean total, compare to the $6.3M benchmark:

```sql
-- Consumer Lending clean total
SELECT SUM(total_payout) as cl_total,
  COUNT(DISTINCT entity_id) as entities,
  COUNT(DISTINCT period_id) as periods
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND rs.name LIKE '%Consumer%';

-- Per-entity per-period breakdown
SELECT e.display_name, p.canonical_key, cr.total_payout
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
JOIN entities e ON cr.entity_id = e.id
JOIN periods p ON cr.period_id = p.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND rs.name LIKE '%Consumer%'
AND cr.total_payout > 0
ORDER BY e.display_name, p.canonical_key;
```

### Decision Tree

**If clean total is ~$6.3M (within 10%):** Stale results were the only issue. No further action. Record as confirmed.

**If clean total is ~$2M (same as OB-120 reported):** The gap is real. Investigate:

1. **Check isMarginal behavior:**
   ```sql
   -- Look at a high-volume entity's payout
   -- If Luis has $3.5M volume and gets $42K → effective rate = 1.2% → top tier flat rate
   -- If marginal: first $500K × 0.008 + next $500K × 0.01 + remaining $2.5M × 0.012 → $35K
   -- If flat: $3.5M × 0.012 → $42K
   -- $42K on $3.5M = 1.2% → matches flat top tier → NOT marginal
   ```

2. **Check how many entities × periods produce non-zero:**
   - 25 entities × 3 periods with data (Dec 2023 has 0 rows for most) = ~75 potential results
   - If only ~50 produce non-zero, the aggregate may be correct at a lower total

3. **Check period assignment — Dec 2023 gap:**
   - The trace showed 0 rows for Dec 2023 for Luis. If many entities have no Dec data, that's 25% fewer results.

**If clean total is < $1M:** Something broke. Run the calculation trace again for a single entity to find the regression.

### Proof Gate Phase 2
```
- Consumer Lending clean total recorded with explanation
- If gap exists vs benchmark: root cause documented (marginal vs flat, entity coverage, period coverage)
- No code changes if the clean total is reasonable and explainable
```

**Commit:** `OB-121 Phase 2: Consumer Lending calibration — clean baseline analysis`

---

## PHASE 3: DEPOSIT GROWTH — FIX METRIC NAME "UNKNOWN"

### What's Broken

The plan interpretation produced a calculationIntent with no extractable metric name. The trace shows `Expected metric: "UNKNOWN"`. The convergence service couldn't match this to any data because the metric name was never set.

### Root Cause

Look at the Deposit Growth plan's calculationIntent:

```bash
echo "=== DEPOSIT GROWTH INTENT STRUCTURE ==="
echo "SELECT jsonb_pretty(components::jsonb->0->'calculationIntent') as intent
FROM rule_sets WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
AND name LIKE '%Deposit%';"
```

The intent has `input: { source: "ratio" }` — the metric name extraction function in convergence-service.ts or run-calculation.ts doesn't handle the `ratio` source type. It expects `source: "metric"` with a `sourceSpec.field` property.

### Fix

In the metric name extraction code (find it):
```bash
grep -rn "extractMetricName\|metricName\|source.*metric\|UNKNOWN" \
  web/src/lib/calculation/run-calculation.ts \
  web/src/lib/intelligence/convergence-service.ts | head -20
```

Handle the `ratio` source type. When `input.source === "ratio"`, the metric name should be extracted from the ratio's numerator and denominator:

```typescript
// Current: only handles source === "metric"
// Fix: also handle source === "ratio"
function extractMetricName(intent: any): string {
  if (intent.input?.source === 'metric') {
    return intent.input.sourceSpec?.field || 'unknown';
  }
  if (intent.input?.source === 'ratio') {
    // Ratio needs two metrics: numerator and denominator
    const numMetric = intent.input.numerator?.sourceSpec?.field || 'numerator';
    const denMetric = intent.input.denominator?.sourceSpec?.field || 'denominator';
    return `ratio_${numMetric}_over_${denMetric}`;
  }
  // Walk nested structures
  if (intent.input?.operation) return extractMetricName(intent.input);
  if (intent.rate?.operation) return extractMetricName(intent.rate);
  return 'unknown';
}
```

### Proof Gate Phase 3
```
- Deposit Growth metric name is no longer "UNKNOWN"
- Metric name is extracted from the ratio structure (e.g., "ratio_actual_deposit_over_target_deposit" or similar)
- Convergence can now attempt to match this metric name to data
```

**Commit:** `OB-121 Phase 3: Fix metric name extraction for ratio-based intents`

---

## PHASE 4: DEPOSIT GROWTH — RATIO COMPUTATION INFRASTRUCTURE

### The Structural Problem

Deposit Growth requires a computation no other plan needs: **ratio of two values from different sources.**

```
attainment_ratio = (current_period_balance - prior_period_balance) / target_balance
```

This feeds into `bounded_lookup_1d`:
- < 80% → $0
- 80-99% → $5,000
- 100-119% → $10,000
- ≥ 120% → $18,000

### What Data Exists

From the trace, `deposit_balances` has 48 rows (likely 12 entities × 4 periods, or similar). Each row has `TotalDepositBalance` — a point-in-time balance snapshot.

### What Data is Missing

**Target/goal values.** The original demo package (`CFG_Deposit_Growth_Incentive_Q1_2024.xlsx`) has a Tab 2 with per-entity targets. This data was never imported because:
- The import pipeline processes one sheet at a time
- Tab 2 has a different schema than Tab 1 (which is the plan)
- There's no mechanism to import "reference data" that isn't a plan or transaction data

### Two Options

**Option A: Synthetic targets for demo**
Generate reasonable target values from the deposit balance data. If an entity's average balance is $200K, set their target growth at 10% = $20K. This unblocks the demo without new data import.

⚠️ **REJECTED** — Violates "Fix Logic Not Data." We don't fabricate data.

**Option B: Import target data as a new data_type**
The target values need to be imported as committed_data with `data_type = 'deposit_targets'` or similar. This requires uploading Tab 2 of the Deposit Growth XLSX.

**CHOSEN: Option B** — but the target data file needs to be provided. This OB's scope is:
1. Ensure the engine CAN compute ratios if both actual and target data exist
2. Surface the gap clearly: "Deposit Growth requires target data that hasn't been imported"
3. Document what file/tab needs to be uploaded

### What This OB Builds

A new MetricDerivationRule operation: `delta_ratio`:

```typescript
interface MetricDerivationRule {
  // Existing
  metric: string;
  operation: 'count' | 'sum' | 'delta_ratio';  // ADD delta_ratio
  source_pattern: string;
  source_field?: string;
  filters?: { field: string; operator: string; value: string }[];
  
  // NEW for delta_ratio
  numerator?: {
    operation: 'delta' | 'sum';  // delta = current - prior period
    source_pattern: string;
    source_field: string;
  };
  denominator?: {
    source_pattern: string;      // 'deposit_targets' or similar
    source_field: string;
  };
}
```

The engine applies this rule:
1. Get current period balance: SUM(TotalDepositBalance) for entity in current period
2. Get prior period balance: SUM(TotalDepositBalance) for entity in prior period
3. Delta = current - prior
4. Get target: value from target data source for entity in current period
5. Ratio = delta / target (as percentage: × 100)
6. Feed ratio into bounded_lookup_1d

### Implementation

In `run-calculation.ts` (or wherever MetricDerivationRule is applied):

```typescript
if (rule.operation === 'delta_ratio') {
  // Get current period data
  const currentRows = entityPeriodData.filter(r => 
    r.data_type.includes(rule.numerator!.source_pattern)
  );
  const currentValue = currentRows.reduce((sum, r) => 
    sum + (Number(r.raw_data[rule.numerator!.source_field]) || 0), 0
  );
  
  // Get prior period data
  const priorPeriodId = getPriorPeriod(periodId, allPeriods);
  const priorRows = priorPeriodId ? 
    allEntityData.filter(r => 
      r.period_id === priorPeriodId && 
      r.data_type.includes(rule.numerator!.source_pattern)
    ) : [];
  const priorValue = priorRows.reduce((sum, r) => 
    sum + (Number(r.raw_data[rule.numerator!.source_field]) || 0), 0
  );
  
  const delta = currentValue - priorValue;
  
  // Get target
  const targetRows = entityPeriodData.filter(r =>
    r.data_type.includes(rule.denominator!.source_pattern)
  );
  const target = targetRows.reduce((sum, r) =>
    sum + (Number(r.raw_data[rule.denominator!.source_field]) || 0), 0
  );
  
  if (target === 0) {
    console.log(`Deposit Growth: target=0 for entity, ratio undefined. Payout=$0.`);
    return 0;
  }
  
  const ratio = (delta / target) * 100; // as percentage
  return ratio;
}
```

### Important: Cross-Period Data Access

The current engine may only pass `entityPeriodData` (current period's rows) to the metric derivation function. Computing a delta requires PRIOR period data. Check:

```bash
grep -n "entityPeriodData\|periodData\|allEntityData\|allData" \
  web/src/lib/calculation/run-calculation.ts | head -20
```

If the engine only passes current-period data, it needs to be extended to provide access to adjacent periods for delta computations. This is a structural engine enhancement — domain-agnostic (any plan could need period-over-period comparison).

### Proof Gate Phase 4
```
- delta_ratio operation added to MetricDerivationRule type
- Engine can compute delta (current - prior) for balance data
- If target data exists: ratio computed and fed to bounded_lookup_1d
- If target data missing: clear log message "target data not imported" and $0 payout
- No hardcoded target values — all from data
- Korean Test: delta_ratio is structural (works for any domain)
```

**Commit:** `OB-121 Phase 4: delta_ratio operation — cross-period computation for attainment-based plans`

---

## PHASE 5: CONVERGENCE UPDATE — DEPOSIT GROWTH GAP REPORT

### What to Build

Update the convergence service to properly report the Deposit Growth gap:

```
CONVERGENCE REPORT — Deposit Growth:
  TYPE: GAP (partial data)
  ACTUAL DATA: deposit_balances (48 rows, TotalDepositBalance field)
  COMPUTABLE: period-over-period balance delta
  MISSING: target/goal values per entity per period
  ACTION: Import Tab 2 of CFG_Deposit_Growth_Incentive_Q1_2024.xlsx as transaction data
  IMPACT: $0 payout until target data provided
```

The convergence service should generate this gap report automatically when it detects:
- A plan requiring `ratio` input
- Actual data exists for one side of the ratio
- No data exists for the other side (target/goal)

### Proof Gate Phase 5
```
- Convergence API returns gap report for Deposit Growth
- Gap includes: what data exists, what's missing, what action to take
- Gap report is structural (would work for any ratio-based plan, not just deposits)
```

**Commit:** `OB-121 Phase 5: Convergence gap report for ratio-based plans with missing data`

---

## PHASE 6: INTEGRATED TEST + ARCHITECTURE TRACE

### 6A: Run calculation for all plans (clean)

```sql
-- After all fixes, verify clean results
SELECT rs.name, 
  COUNT(DISTINCT cr.entity_id) as entities,
  COUNT(DISTINCT cr.period_id) as periods,
  COUNT(*) as rows,
  SUM(cr.total_payout) as total
FROM calculation_results cr
JOIN rule_sets rs ON cr.rule_set_id = rs.id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
GROUP BY rs.name ORDER BY rs.name;

-- Zero duplicates
SELECT COUNT(*) as duplicate_sets FROM (
  SELECT entity_id, period_id, rule_set_id
  FROM calculation_results 
  WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'mbc')
  GROUP BY entity_id, period_id, rule_set_id
  HAVING COUNT(*) > 1
) dupes;
```

### 6B: Run architecture trace

```bash
npx tsx web/scripts/architecture-trace.ts 2>&1 | tee architecture-trace-post-ob121.txt
```

Target improvements from HF-077 + OB-121:
- DOMAIN_LEAK: 0 (HF-077 cleaned)
- Korean Test: ≥13/16
- Payout Distribution Health: STRUCTURAL (after stale cleanup, no more suspicious distributions)

### 6C: Run calculation trace

```bash
npx tsx web/scripts/calculation-trace.ts 2>&1 | tee calculation-trace-post-ob121.txt
```

Verify:
- Zero duplicate rows for any entity
- Consumer Lending shows correct rate × volume
- Deposit Growth shows "target data missing" not "UNKNOWN metric"
- Insurance Referral maintained

### Expected Results

| Plan | OB-120 Reported | OB-121 Clean | Notes |
|------|----------------|-------------|-------|
| Consumer Lending | $2,084,387 | TBD after cleanup | May be same or different — stale rows were inflating |
| Mortgage | $1,046,890 | ~$1,046,890 | Should be stable |
| Insurance Referral | $125,400 | ~$125,400 | Should be stable |
| Deposit Growth | $0 | $0 | Expected — no target data |
| **Grand Total** | **$3,256,678** | **TBD** | Clean number, zero duplicates |

### Proof Gate Phase 6
```
- Zero duplicate calculation_results rows
- Unique constraint on (tenant_id, entity_id, period_id, rule_set_id)
- Architecture trace re-run results recorded
- Calculation trace shows clean single entity path
- All numbers are from fresh calculation with no stale accumulation
```

**Commit:** `OB-121 Phase 6: Integrated test — clean baseline with dual trace verification`

---

## PHASE 7: BUILD + COMPLETION REPORT + PR

### Build
```bash
cd /Users/AndrewAfrica/spm-platform
pkill -f "next dev" 2>/dev/null || true
cd web && rm -rf .next && npm run build 2>&1 | tail -30
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### Completion Report

Save as `OB-121_COMPLETION_REPORT.md` at project root. Include:

1. **Phase 0** — Stale result quantification (how many duplicates, how inflated)
2. **Phase 1** — Purge results + unique constraint + engine fix
3. **Phase 2** — Consumer Lending TRUE baseline with explanation
4. **Phase 3** — Metric name extraction fix for ratio intents
5. **Phase 4** — delta_ratio engine capability (available even if target data missing)
6. **Phase 5** — Convergence gap report for Deposit Growth
7. **Phase 6** — Both traces clean, no duplicates, architecture improved
8. **Financial Table** — TRUE numbers for all 4 plans (clean, no stale rows)
9. **Remaining Gap** — Deposit Growth needs target data import (provide file path + tab)

### PR Creation
```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-121: Calculation hygiene + Deposit Growth infrastructure + clean baseline" \
  --body "Purged stale calculation results. Added unique constraint preventing future accumulation. Fixed metric name extraction for ratio-based intents. Added delta_ratio operation for cross-period computations. Clean baseline: Consumer Lending \$X, Mortgage \$X, Insurance Referral \$X, Deposit Growth \$0 (target data needed)."
```

---

## PROOF GATE SUMMARY

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | npm run build exits 0 | Clean build |
| PG-02 | Zero duplicate calculation_results | SQL: HAVING COUNT(*) > 1 returns 0 rows |
| PG-03 | Unique constraint on calculation_results | \d calculation_results shows constraint |
| PG-04 | Engine deletes before inserting | Code review of run-calculation or route |
| PG-05 | Consumer Lending clean total recorded | SQL with explanation |
| PG-06 | Mortgage maintained ~$1M | No regression |
| PG-07 | Insurance Referral maintained ~$125K | No regression |
| PG-08 | Deposit Growth metric name ≠ "UNKNOWN" | Calculation trace shows extracted name |
| PG-09 | delta_ratio operation exists in engine | Code review |
| PG-10 | Deposit Growth $0 with clear gap message | Log shows "target data not imported" |
| PG-11 | Convergence gap report for Deposit Growth | API output |
| PG-12 | Architecture trace post-cleanup | Saved to file |
| PG-13 | Calculation trace post-cleanup — zero dupes | Saved to file |
| PG-14 | No auth files modified | git diff |
| PG-15 | Completion report with TRUE financial table | File at project root |

---

## NEW STANDING RULE PROPOSAL

**Rule 25: Every calculation run MUST delete existing results for the same entity+period+plan before inserting new results.** A unique constraint on (tenant_id, entity_id, period_id, rule_set_id) enforces this at the database level. Stale result accumulation is a silent corruption that makes every reported number unreliable.

**Rule 26: Every OB touching calculation must include both CC-UAT traces (architecture + calculation) in its completion report.** The architecture trace proves structural integrity. The calculation trace proves execution correctness. Together they prove the platform works for the right reasons.

---

## SCOPE BOUNDARIES

### IN SCOPE
- Stale calculation_results purge and prevention
- Consumer Lending calibration investigation (no code change if numbers are explainable)
- Deposit Growth metric name fix ("UNKNOWN" → extracted name)
- delta_ratio MetricDerivationRule operation
- Cross-period data access in engine (if needed for delta computation)
- Convergence gap report for ratio-based plans

### OUT OF SCOPE — DO NOT TOUCH
- Auth files
- Deposit Growth target data creation/fabrication (data must be imported, not generated)
- SHEET_COMPONENT_PATTERNS removal (OB-122)
- Óptica Luminar re-import (separate backlog item)
- UI changes
- New API endpoints (except convergence gap enhancement)

---

*OB-121 — "You can't trust a number you built on top of a number you didn't clean."*
*"Stale State Is Load-Bearing Until You Prove Otherwise."*
