# OB-148: ATTAINMENT ACCURACY AUDIT
## Fix Venta Tienda (199.6%) + Venta Óptica (69.6%) — Close to 95%

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules (27, 28, 29)
2. `web/src/lib/calculation/run-calculation.ts` — THE calculation engine. COMPLETELY.
3. `web/src/app/api/calculation/run/route.ts` — server-side route. COMPLETELY.
4. `OB-147_COMPLETION_REPORT.md` — current state: MX$793,793 (63.3%)
5. `OB-75_COMPLETION_REPORT.md` — reference: MX$1,262,865 (100.7%)

**Read all files before writing any code.**

---

## CONTEXT — TWO COMPONENTS ARE OFF, SAME ROOT CAUSE

OB-147 achieved correct population scope (719 entities) and 4/6 components non-zero. But two components are significantly wrong:

| Component | Ground Truth | OB-147 | Accuracy | Problem |
|-----------|-------------|--------|----------|---------|
| Venta Tienda | MX$116,250 | MX$232,050 | 199.6% | 603 entities qualify (≥100%) vs benchmark's 362 |
| Venta Óptica | MX$748,600 | MX$521,350 | 69.6% | Entities landing in lower matrix cells than expected |

These are the two largest components (combined MX$864,850 = 69% of benchmark). Getting them right is the path to 95%+.

### Why Venta Tienda is 2x

The Venta Tienda tier lookup:
- <100% store attainment → $0
- 100%-104.99% → $150
- 105%-109.99% → $300
- ≥110% → $500

**Benchmark: 362 entities qualify.** That means 362 employees are in stores with ≥100% store sales attainment.
**OB-147: 603 entities qualify.** Almost everyone qualifies, which shouldn't happen.

This means **store_attainment_percent is systematically too high** for Venta Tienda. Possible causes:

1. **Wrong source field:** The engine is reading `Cumplimiento` from Base_Venta_Individual (employee-level optical attainment) instead of computing store attainment from Base_Venta_Tienda (Real_Venta_Tienda / Meta_Venta_Tienda)
2. **Normalization double-up:** The value is already a percentage (e.g., 105.2) but gets multiplied by 100 again → 10520%
3. **Derivation picks wrong sheet:** The `store_attainment_percent` derivation rule matches Base_Venta_Individual instead of Base_Venta_Tienda
4. **Sum vs single-row:** If multiple rows exist per store and the derivation SUMS attainment values, a store with 3 rows of 102%, 98%, 110% becomes 310% instead of using the correct single value

### Why Venta Óptica is low

Venta Óptica uses a matrix with:
- **Rows:** Attainment percentage (employee individual optical sales vs goal)
- **Columns:** Store optical sales volume band (<$60K, $60K-$100K, etc.)

Per-entity average MX$741 vs benchmark ~MX$1,207. Entities are landing in lower-payout cells. Possible causes:

1. **Column metric wrong:** store_volume_tier assigns entities to lower volume bands than benchmark expects. OB-146 derived tiers from `suma nivel tienda` — this may not map correctly to the 5 column boundaries
2. **Row metric wrong:** If Cumplimiento values are wrong (too low or too high), entities land in wrong rows
3. **Certified/Non-certified variant:** If the engine uses the wrong matrix variant (non-certified instead of certified), payouts are ~50% lower

### The Hypothesis: Metric Source Confusion

The most likely root cause for BOTH problems is that the engine is using the wrong source data for store-level attainment:

- **Venta Tienda** needs store attainment from `Base_Venta_Tienda` (Real_Venta_Tienda / Meta_Venta_Tienda)
- **Venta Óptica** row metric needs individual attainment from `Base_Venta_Individual` (Cumplimiento)
- **Venta Óptica** column metric needs store volume from `LLave Tamaño de Tienda` or `Rango_Tienda`

If the derivation rules are cross-wired — individual data feeding store components or vice versa — both errors are explained.

---

## STANDING RULES

1-10 same as OB-147.

---

## ENGINE CONTRACT

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as result_count,
  (SELECT COALESCE(SUM(total_payout), 0) FROM calculation_results WHERE tenant_id = t.id) as total_payout
FROM t;
```

---

# PHASE 0: DIAGNOSTIC — TRACE THE ATTAINMENT VALUES

Do NOT write fix code until Phase 0 is committed.

### 0A: Engine Contract (before)
Paste output.

### 0B: How does the engine resolve metrics for Venta Tienda?

Trace the EXACT code path for a tier_lookup component. The engine receives committed_data rows, applies derivation rules, normalizes attainment, and passes to the tier lookup. Document each step:

```bash
echo "=== VENTA TIENDA CODE PATH ==="
echo ""
echo "--- What derivation rule resolves store_attainment_percent? ---"
grep -n "store_attainment\|Cumplimiento\|attainment_percent" \
  web/src/lib/calculation/run-calculation.ts \
  web/src/app/api/calculation/run/route.ts | head -20

echo ""
echo "--- What sheet does it read from? ---"
grep -B 5 -A 10 "store_attainment" web/src/lib/calculation/run-calculation.ts | head -40

echo ""
echo "--- Normalization: is there a ×100 step? ---"
grep -n "normalize\|\* 100\|< 10\|decimal\|percentage" \
  web/src/lib/calculation/run-calculation.ts | head -20

echo ""
echo "--- The tier lookup function ---"
grep -B 5 -A 30 "tier_lookup\|tierLookup\|findTier" \
  web/src/lib/calculation/run-calculation.ts | head -60
```

### 0C: Verify with actual data — pick 5 stores

```sql
-- 5 stores with known Venta Tienda outcomes from OB-147
-- Get the store, the raw data, and the calculation result

-- First: which stores exist in results?
WITH store_results AS (
  SELECT 
    e.metadata->>'store_id' as store_id,
    cr.total_payout,
    cr.component_results
  FROM calculation_results cr
  JOIN entities e ON e.id = cr.entity_id
  WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
    AND e.metadata->>'store_id' IS NOT NULL
  LIMIT 10
)
SELECT 
  store_id,
  (component_results->'venta_tienda'->>'amount')::numeric as tienda_payout,
  (component_results->'venta_tienda'->>'attainment')::numeric as tienda_attainment
FROM store_results
ORDER BY tienda_payout DESC
LIMIT 5;
```

```sql
-- Now check the ACTUAL store data for those stores
-- What are Real_Venta_Tienda and Meta_Venta_Tienda?
SELECT 
  raw_data->>'No_Tienda' as store,
  raw_data->>'Real_Venta_Tienda' as actual_sales,
  raw_data->>'Meta_Venta_Tienda' as goal_sales,
  raw_data->>'Cumplimiento' as cumplimiento,
  CASE 
    WHEN (raw_data->>'Meta_Venta_Tienda')::numeric > 0 
    THEN ROUND(((raw_data->>'Real_Venta_Tienda')::numeric / (raw_data->>'Meta_Venta_Tienda')::numeric) * 100, 2)
    ELSE NULL 
  END as computed_attainment
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND sheet_name = 'Base_Venta_Tienda'
  AND raw_data->>'No_Tienda' IN (
    -- Replace with actual store IDs from query above
    SELECT DISTINCT e.metadata->>'store_id'
    FROM calculation_results cr
    JOIN entities e ON e.id = cr.entity_id
    WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
      AND e.metadata->>'store_id' IS NOT NULL
    LIMIT 5
  )
  AND period_id = (SELECT id FROM periods WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1) AND canonical_key = '2024-01')
LIMIT 10;
```

### 0D: Compare engine attainment vs computed attainment

For the 5 stores above:
- Engine says store attainment = X
- Raw data says Real/Meta = Y/Z → computed = Y/Z×100

If X ≠ computed, the derivation is wrong.

### 0E: Check Venta Óptica column metric (store_volume_tier)

```sql
-- What volume tier did the engine assign vs what the data says?
SELECT 
  e.external_id,
  e.metadata->>'store_id' as store,
  e.metadata->>'volume_tier' as entity_volume_tier,
  cr.component_results->'venta_optica'->>'columnBand' as engine_column,
  (cr.component_results->'venta_optica'->>'amount')::numeric as optica_payout
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND (cr.component_results->'venta_optica'->>'amount')::numeric > 0
ORDER BY optica_payout DESC
LIMIT 10;
```

```sql
-- What does Rango_Tienda say for the benchmark?
SELECT 
  raw_data->>'num_empleado' as emp,
  raw_data->>'Rango_Tienda' as rango_tienda,
  raw_data->>'LLave Tamaño de Tienda' as llave_tamano
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND sheet_name = 'Datos_Colaborador'
  AND raw_data->>'num_empleado' IN (
    SELECT e.external_id
    FROM calculation_results cr
    JOIN entities e ON e.id = cr.entity_id
    WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
      AND (cr.component_results->'venta_optica'->>'amount')::numeric > 0
    ORDER BY (cr.component_results->'venta_optica'->>'amount')::numeric DESC
    LIMIT 5
  )
LIMIT 5;
```

### 0F: Check the variant (certified vs non-certified)

```sql
-- Does the engine use the right matrix variant per entity?
-- Datos_Colaborador should have a certification flag
SELECT 
  raw_data->>'num_empleado' as emp,
  raw_data->>'Certificado' as certificado,
  raw_data->>'Es_Certificado' as es_certificado,
  raw_data->>'certificado' as certificado_lower
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND sheet_name = 'Datos_Colaborador'
  AND raw_data->>'num_empleado' IS NOT NULL
LIMIT 10;
```

```bash
echo "=== VARIANT RESOLUTION IN ENGINE ==="
grep -n "variant\|certified\|Certificado\|variantId\|variantName" \
  web/src/lib/calculation/run-calculation.ts | head -20
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — OB-148
//
// VENTA TIENDA (199.6% — too many qualifying):
// Derivation rule for store_attainment_percent: [rule details]
// Source sheet: [Base_Venta_Tienda or Base_Venta_Individual or other]
// Source field: [field name]
// Normalization: [what happens to the raw value]
//
// 5 STORE COMPARISON:
// Store [X]: Engine att=[X]%, Computed from data=[X]%, Match? [YES/NO]
// Store [Y]: Engine att=[Y]%, Computed from data=[Y]%, Match? [YES/NO]
// [etc.]
//
// ROOT CAUSE: [specific — which derivation, which field, which normalization step]
//
// VENTA ÓPTICA (69.6% — lower cells):
// store_volume_tier source: [field and derivation]
// 5 entities: engine tier=[X], Rango_Tienda=[X], Match? [YES/NO]
// Row metric (attainment): [correct/wrong, evidence]
// Variant (cert/non-cert): [correctly resolved? evidence]
//
// ROOT CAUSE: [specific]
//
// HYPOTHESIS CONFIRMED/REJECTED: [Is it metric source confusion?]
```

**Proof gate PG-00:** Phase 0 complete. Store-level comparison for 5 stores. Root causes identified with evidence.

**Commit:** `OB-148 Phase 0: Diagnostic — attainment trace for Tienda + Óptica`

---

# PHASE 1: FIX VENTA TIENDA ATTAINMENT SOURCE

Based on Phase 0 findings, apply the specific fix.

### If Root Cause = Wrong source sheet:

The derivation rule for `store_attainment_percent` is reading from the wrong sheet. It needs to read from `Base_Venta_Tienda` using `Real_Venta_Tienda / Meta_Venta_Tienda`, not from `Base_Venta_Individual` using `Cumplimiento`.

**Fix:** Modify the derivation rule to:
1. Identify the store-level sales sheet (Base_Venta_Tienda or equivalent)
2. For the entity's store_id, find the matching row
3. Compute attainment = Real_Venta_Tienda / Meta_Venta_Tienda × 100
4. Return this as the store_attainment_percent

### If Root Cause = Normalization double-up:

The value is already 105.2 (percentage) but gets multiplied by 100 → 10520. Or it's 1.052 (decimal) and gets correctly multiplied to 105.2 but THEN the post-derivation normalizer sees it as <10 and multiplies again.

**Fix:** Trace the exact normalization chain. Remove the double multiplication. Add a debug log showing value at each step.

### If Root Cause = Sum vs single row:

Multiple Base_Venta_Tienda rows per store-period (e.g., one row per month with the same store). The derivation SUMS the Cumplimiento values instead of using the period-specific single row.

**Fix:** Filter to the correct period's row only, or take MAX/FIRST instead of SUM.

### Verification after fix:

```sql
-- Recalculate and check: how many entities now qualify for Tienda (≥100%)?
-- Target: ~362 (matching benchmark)
SELECT 
  COUNT(*) FILTER (WHERE (comp_value->>'amount')::numeric > 0) as qualifying,
  COUNT(*) as total,
  SUM((comp_value->>'amount')::numeric) as total_payout
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND comp_key ILIKE '%tienda%';
```

**Proof gate PG-01:** Venta Tienda qualifying entities closer to 362 (within ±20%). Total payout closer to MX$116,250.

**Commit:** `OB-148 Phase 1: Venta Tienda attainment source fix`

---

# PHASE 2: FIX VENTA ÓPTICA CELL PLACEMENT

Based on Phase 0 findings, fix the matrix lookup inputs.

### 2A: Column metric (store volume tier)

If Phase 0E shows the engine's volume tier doesn't match `Rango_Tienda` from Datos_Colaborador:

The benchmark uses `Rango_Tienda` which is a pre-computed band like "$60K-$100K". OB-146 derived store_volume_tier from `suma nivel tienda` in Base_Venta_Individual. These may not agree.

**Preferred fix:** Use `Rango_Tienda` directly from Datos_Colaborador if available. It's the benchmark's own classification. Parse the band name to a column index:
- "<$60K" or "Menor a $60,000" → column 0
- "$60K-$100K" or "$60,000 a $100,000" → column 1
- "$100K-$120K" → column 2
- "$120K-$180K" → column 3
- "≥$180K" or "Mayor a $180,000" → column 4

**Korean Test:** The column boundary values come from the plan's matrix definition. The parser maps raw band text to index by comparing against plan boundaries, not by hardcoding Spanish text.

### 2B: Row metric (individual attainment)

If Phase 0 shows individual attainment (Cumplimiento) is correct → no fix needed.
If wrong → same normalization investigation as Phase 1.

### 2C: Variant resolution (certified vs non-certified)

If Phase 0F shows the engine doesn't correctly select the matrix variant:
- Check how the entity's certification status flows to the matrix lookup
- The certified matrix has higher payouts (~2x non-certified)
- If all entities use non-certified, total drops to ~50% (matching the 69.6% observation)

**Fix:** Ensure the variant selector reads the entity's `Certificado` attribute from roster data and selects the correct matrix.

### Verification:

```sql
-- After fix: average Óptica payout should be closer to ~$1,207
SELECT 
  COUNT(*) as entities,
  AVG((comp_value->>'amount')::numeric) FILTER (WHERE (comp_value->>'amount')::numeric > 0) as avg_payout,
  SUM((comp_value->>'amount')::numeric) as total
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND comp_key ILIKE '%optic%';
```

**Proof gate PG-02:** Venta Óptica average payout closer to MX$1,207. Total closer to MX$748,600.

**Commit:** `OB-148 Phase 2: Venta Óptica cell placement fix`

---

# PHASE 3: RECALCULATE

### 3A: Delete old results

```sql
DELETE FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

### 3B: Run calculation for Enero 2024

Capture log output showing population filter count (~719).

### 3C: Per-component totals

```sql
SELECT 
  comp_key,
  COUNT(*) as entities,
  COUNT(*) FILTER (WHERE (comp_value->>'amount')::numeric > 0) as non_zero,
  SUM((comp_value->>'amount')::numeric) as total,
  AVG((comp_value->>'amount')::numeric) FILTER (WHERE (comp_value->>'amount')::numeric > 0) as avg_nonzero
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
GROUP BY comp_key
ORDER BY total DESC;
```

**PASTE OUTPUT.**

**Proof gate PG-03:** Recalculation complete. Per-component totals pasted.

**Commit:** `OB-148 Phase 3: Recalculation with attainment fixes`

---

# PHASE 4: CC-UAT-09 — RECONCILIATION

### 4A: Reconciliation table

```
CC-UAT-09 RECONCILIATION TABLE — OB-148

| Component | Ground Truth | OB-148 Engine | Delta | Accuracy | vs OB-147 |
|-----------|-------------|---------------|-------|----------|-----------|
| Venta Óptica | MX$748,600 | MX$[X] | [X] | [X]% | was 69.6% |
| Venta Tienda | MX$116,250 | MX$[X] | [X] | [X]% | was 199.6% |
| Clientes Nuevos | MX$39,100 | MX$[X] | [X] | [X]% | was 103.2% |
| Cobranza | MX$283,000 | MX$0 | -MX$283,000 | 0.0% | NO DATA |
| Club de Protección | MX$10 | MX$[X] | [X] | [X]% | was PASS |
| Garantía Extendida | MX$66,872 | MX$0 | -MX$66,872 | 0.0% | NO DATA |
| **TOTAL** | **MX$1,253,832** | **MX$[X]** | **[X]** | **[X]%** | was 63.3% |

Adjusted (excl. Cobranza + Garantía): [X]% of MX$903,960
```

### 4B: Entity traces — same 3 employees

**Entity 93515855:**
```sql
SELECT cr.total_payout, jsonb_pretty(cr.component_results)
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND e.external_id = '93515855';
```
Benchmark: ~MX$1,527 (adjusted, excl. Cobranza/Garantía)

**Entity 96568046:**
Benchmark: ~MX$1,527 (adjusted)

**Entity 90319253:**
Benchmark: ~MX$900 (adjusted)

### 4C: Qualifying entity count check

```sql
-- Venta Tienda: how many qualify now?
SELECT 
  COUNT(*) FILTER (WHERE (comp_value->>'amount')::numeric > 0) as qualifying,
  COUNT(*) FILTER (WHERE (comp_value->>'amount')::numeric = 0) as below_threshold
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND comp_key ILIKE '%tienda%';
```
**Target: ~362 qualifying (benchmark has 362)**

### 4D: Accuracy progression

```
| OB | Total | Accuracy | Tienda | Óptica | Notes |
|----|-------|----------|--------|--------|-------|
| OB-144 | MX$12,659 | 1.0% | MX$500 | MX$0 | No store association |
| OB-146 | MX$977,609 | 78.0% | MX$268,650 | MX$610,825 | 22K entities inflated |
| OB-147 | MX$793,793 | 63.3% | MX$232,050 | MX$521,350 | 719 entities, wrong attainment |
| OB-148 | MX$[X] | [X]% | MX$[X] | MX$[X] | Attainment fixed |
| OB-75 ref | MX$1,262,865 | 100.7% | MX$115,250 | MX$762,400 | Clean tenant proof |
| Benchmark | MX$1,253,832 | 100.0% | MX$116,250 | MX$748,600 | Ground truth |
```

### 4E: Gap analysis

For each component still >10% off from ground truth:

```
COMPONENT: [name]
OB-148 RESULT: MX$[X]
GROUND TRUTH: MX$[X]
ROOT CAUSE: [specific]
FIXABLE: [YES — description / NO — data gap]
```

**Proof gate PG-04:** CC-UAT-09 table complete. 3 entity traces. Tienda qualifying count. Accuracy progression.

**Commit:** `OB-148 Phase 4: CC-UAT-09 reconciliation`

---

# PHASE 5: ENGINE CONTRACT + DS-007

### 5A: Engine Contract

Paste output.

### 5B: DS-007 verification

- Hero total updated
- Component bars: Óptica should be largest, Tienda should be smaller than before
- Store heatmap: populated with correct store data
- Expand entity: Narrative reflects updated component payouts

**Proof gate PG-05:** DS-007 renders with OB-148 data.

**Commit:** `OB-148 Phase 5: Engine Contract + DS-007`

---

# PHASE 6: COMPLETION REPORT + PR

### 6A: Build

```bash
cd web && rm -rf .next && npm run build
```

### 6B: Completion report

Save as `OB-148_COMPLETION_REPORT.md` in **PROJECT ROOT**.

```markdown
# OB-148 COMPLETION REPORT
## Attainment Accuracy Audit

### Root Causes Found (Phase 0)
- Venta Tienda: [specific root cause with file:line]
- Venta Óptica: [specific root cause with file:line]

### Fixes Applied
| Fix | Component | What Changed |
|-----|-----------|-------------|
| [description] | Venta Tienda | [file:line — what was wrong → what it is now] |
| [description] | Venta Óptica | [file:line — what was wrong → what it is now] |

### CC-UAT-09 RECONCILIATION TABLE
[Paste full table]

### Accuracy Progression
[Paste full table]

### Entity Traces
[Paste 3 traces]

### Venta Tienda Qualifying Count
- Before: 603 / 719 (83.9%)
- After: [X] / 719 ([X]%)
- Benchmark: 362 / 719 (50.3%)

### Remaining Gaps
[Document each component >10% off]

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | | Diagnostic — 5 store comparison |
| PG-01 | | Venta Tienda fix |
| PG-02 | | Venta Óptica fix |
| PG-03 | | Recalculation |
| PG-04 | | CC-UAT-09 reconciliation |
| PG-05 | | DS-007 + Engine Contract |
```

### 6C: PR

```bash
gh pr create --base main --head dev \
  --title "OB-148: Attainment Accuracy — [X]% (was 63.3%)" \
  --body "## Venta Tienda + Venta Óptica Accuracy Fix

### Root Causes
- Tienda: [one-line description]
- Óptica: [one-line description]

### Results
- Before: MX$793,793 (63.3%)
- After: MX$[X] ([X]%)
- Adjusted (excl. no-data): [X]% of MX$903,960

### Tienda qualifying: 603 → [X] (benchmark: 362)

### CC-UAT-09
[Paste table]

### Progression: 1% → 78% → 63% → [X]%"
```

**Proof gate PG-06:** PR created. Build clean.

**Commit:** `OB-148 Phase 6: Completion report + PR`

---

## CC ANTI-PATTERNS — SPECIFIC TO THIS OB

| Anti-Pattern | What CC Might Do | What To Do Instead |
|---|---|---|
| Skip the 5-store comparison | "I can see the derivation rule is wrong" | SHOW THE NUMBERS. Engine att vs computed att for 5 specific stores. |
| Fix by adding new derivation rules | Create new metric names | Fix the EXISTING derivation rule. Don't add complexity. |
| Break Clientes Nuevos (103.2%) | Refactor shared attainment code | Clientes Nuevos is PASSING. Do not touch its code path unless you verify it still works after changes. |
| Ignore variant resolution | "Certified/non-certified doesn't matter" | If all entities use the wrong matrix, Óptica drops to 50%. This is a 2x factor. Verify. |
| Hardcode Rango_Tienda parsing | `if (rango === "$60K-$100K") return 1` | Parse by comparing against plan matrix column boundaries. Korean Test. |
| Over-engineer the fix | Rewrite metric resolution | Surgical. Find the one wrong line. Fix it. Verify. Move on. |
| Report "improvement" without numbers | "Attainment values look more reasonable" | PASTE: Tienda qualifying count, per-component totals, 3 entity traces. |

---

## WHAT SUCCESS LOOKS LIKE

After this OB:

1. **Venta Tienda: ~MX$116,250** (within ±10%) with ~362 qualifying entities
2. **Venta Óptica: ~MX$748,600** (within ±10%) with correct cell placement
3. **Total: MX$850,000+** (67%+ raw, 95%+ adjusted for no-data components)
4. **Adjusted accuracy ≥ 95%** (MX$903,960 benchmark excl. Cobranza + Garantía)
5. **Accuracy progression: 1% → 78% → 63% → 95%+** across four OBs
6. **The two fixable gaps are closed.** Only data availability (Cobranza, Garantía) remains.

After this OB, the engine accuracy story is:
- **4 components within ±10% of ground truth** — engine proven
- **2 components at MX$0 due to data not in import** — data gap, not engine gap
- **Adjusted accuracy matching OB-75's 100.7%** — repeatable proof

The remaining path to 100%: import Cobranza and Garantía data sheets. That's a data operation, not an engine fix.

---

*"The engine isn't wrong. The data just isn't all here yet. But the engine must prove itself on what IS here."*
