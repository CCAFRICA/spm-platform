# OB-146: STORE ASSOCIATION + VOLUME TIER + CALCULATION PROOF
## From MX$12,659 to MX$1,253,832 — Close the Gap

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (including Rules 27, 28, 29)
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `web/src/lib/calculation/run-calculation.ts` — THE calculation engine. Read COMPLETELY.
4. `OB-144_COMPLETION_REPORT.md` — what was fixed, what remains broken
5. `OB-75_COMPLETION_REPORT.md` — the PROOF that this engine can produce MX$1,262,865 (100.7% accuracy)

**Read all files before writing any code.**

---

## CONTEXT — WHY MX$12,659 INSTEAD OF MX$1,253,832

OB-75 proved the engine works: MX$1,262,865 total, all 6 components non-zero, 100.7% accuracy against benchmark. That was on a clean Pipeline Test Co tenant with correctly structured data.

OB-144 re-bound data on the Óptica Luminar tenant and got MX$12,659. The completion report explains why:

| Component | OB-75 Result | OB-144 Result | Gap Reason |
|-----------|-------------|---------------|------------|
| Venta Óptica | MX$762,400 | MX$0 | Needs store_volume_tier from LLave Tamaño de Tienda |
| Venta Tienda | MX$115,250 | MX$500 | Only 1 entity hit tier — most can't find store data |
| Clientes Nuevos | MX$38,500 | MX$0 | Store data routing: entity has no store link |
| Cobranza | MX$279,800 | MX$0 | Store data routing: entity has no store link |
| Club de Protección | MX$43 | MX$12,159 | WORKING (higher because 22K entities vs 719) |
| Garantía Extendida | MX$66,872 | MX$0 | No warranty data in import |

**Root cause: 3 problems, all related to the entity→store relationship:**

### Problem 1: Entity→Store Association Missing
The engine builds a `storeData` map from committed_data rows where `entity_id IS NULL` (store-level sheets like Base_Clientes_Nuevos, Base_Cobranza). It then looks up an entity's store via a storeKey in the entity's own row_data. BUT: the 21,418 newly-created entities (OB-144) have NO store metadata. The original 741 seed entities from Datos_Colaborador have `No_Tienda` in their row_data, but the new entities were created from performance data (Base_Venta_Individual) which uses `num_empleado` as the identifier.

**Fix:** Each entity needs a store identifier. The Datos_Colaborador sheet has BOTH `num_empleado` AND `No_Tienda`. Use this to populate entity metadata with store_id.

### Problem 2: store_volume_tier Not Derived
Venta Óptica is a matrix_lookup with TWO input metrics:
- Row metric: `store_attainment_percent` (Cumplimiento) — OB-144 derived this ✓
- Column metric: `store_volume_tier` (which column band: <$60K, $60-100K, etc.)

The column metric comes from `LLave Tamaño de Tienda` in Base_Venta_Individual or `Rango_Tienda` in Datos_Colaborador. OB-144 didn't create a derivation rule for this.

**Fix:** Add metric derivation rule for store_volume_tier from LLave Tamaño de Tienda or Rango_Tienda.

### Problem 3: 22,159 Entities vs 741 Expected
OB-144 created 21,418 new entities from every unique `num_empleado` in performance data. But the benchmark is 719 employees for January 2024 (from Datos_Colaborador roster). The extra entities are either: employees from other months (Feb/Mar/Apr), duplicates from different sheets, or non-roster IDs. The engine calculates all 22,159 but should only produce results for the ~719 in the roster for Enero 2024.

**This OB does NOT fix entity filtering** — that's a population scope issue. The numbers should still be close to benchmark for the 719 roster entities. CC-UAT-07 (Phase 8) traces specific entities to verify.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**
5. Fix logic not data. Korean Test applies everywhere.
6. **Standing Rule 26:** Zero component-level Supabase calls.
7. **Standing Rule 27:** Engine Contract verification at Phase 0 and Phase 7.
8. **Standing Rule 28:** No PR merge without browser or SQL verification.
9. **Standing Rule 29:** Bulk mutations (>1,000 rows) do not require confirmation. Execute via SQL or RPC.
10. **Supabase .in() batch limit:** ≤200 items per call.

---

## ENGINE CONTRACT VERIFICATION

Run at Phase 0 and Phase 7:

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entity_count,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = t.id) as period_count,
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = t.id AND status = 'active') as active_plans,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignment_count,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NOT NULL AND period_id IS NOT NULL) as bound_data_rows,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NULL AND period_id IS NOT NULL) as store_data_rows,
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as result_count,
  (SELECT COALESCE(SUM(total_payout), 0) FROM calculation_results WHERE tenant_id = t.id) as total_payout
FROM t;
```

---

# PHASE 0: DIAGNOSTIC — UNDERSTAND THE STORE DATA LANDSCAPE

Do NOT write fix code until Phase 0 is committed.

### 0A: Engine Contract (before)
Paste output.

### 0B: How does the engine currently resolve store data?

```bash
echo "=== ENGINE STORE DATA RESOLUTION ==="
echo "Read the FULL run-calculation.ts and document:"
echo "1. How is storeData map built? (which query, which key)"
echo "2. How does an entity look up its store? (which field in row_data)"
echo "3. What happens when the store lookup fails?"
echo ""

grep -n "storeData\|storeKey\|store_key\|No_Tienda\|num_tienda\|storeId" \
  web/src/lib/calculation/run-calculation.ts | head -30

echo ""
echo "=== STORE MAP CONSTRUCTION ==="
grep -A 20 "storeData" web/src/lib/calculation/run-calculation.ts | head -40

echo ""
echo "=== ENTITY STORE LOOKUP ==="
grep -B 5 -A 10 "store" web/src/lib/calculation/run-calculation.ts | grep -i "entity\|lookup\|find\|key" | head -20
```

### 0C: What store data exists in committed_data?

```sql
-- Store-level sheets (entity_id IS NULL)
SELECT 
  sheet_name,
  COUNT(*) as row_count,
  COUNT(DISTINCT raw_data->>'No_Tienda') as unique_stores,
  COUNT(DISTINCT raw_data->>'num_tienda') as unique_stores_alt
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND entity_id IS NULL
  AND period_id IS NOT NULL
GROUP BY sheet_name
ORDER BY sheet_name;
```

```sql
-- Employee→Store mapping in Datos_Colaborador
SELECT 
  COUNT(*) as total_rows,
  COUNT(DISTINCT raw_data->>'num_empleado') as unique_employees,
  COUNT(DISTINCT raw_data->>'No_Tienda') as unique_stores,
  COUNT(*) FILTER (WHERE raw_data->>'No_Tienda' IS NOT NULL) as rows_with_store
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND sheet_name = 'Datos_Colaborador'
  AND period_id IS NOT NULL;
```

```sql
-- Sample: what does a Datos_Colaborador row look like?
SELECT raw_data->>'num_empleado' as emp, 
       raw_data->>'No_Tienda' as store,
       raw_data->>'Rango_Tienda' as store_range,
       raw_data->>'LLave Tamaño de Tienda' as store_volume_key
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND sheet_name = 'Datos_Colaborador'
  AND raw_data->>'No_Tienda' IS NOT NULL
LIMIT 10;
```

```sql
-- What does Base_Venta_Individual have for store info?
SELECT raw_data->>'num_empleado' as emp,
       raw_data->>'No_Tienda' as store,
       raw_data->>'LLave Tamaño de Tienda' as volume_key,
       raw_data->>'Cumplimiento' as attainment
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND sheet_name = 'Base_Venta_Individual'
  AND period_id IS NOT NULL
LIMIT 10;
```

### 0D: What do entities currently have for store metadata?

```sql
-- Do entities have store info?
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE metadata->>'No_Tienda' IS NOT NULL) as has_store,
  COUNT(*) FILTER (WHERE metadata->>'store_id' IS NOT NULL) as has_store_id,
  COUNT(*) FILTER (WHERE metadata IS NULL OR metadata = '{}') as no_metadata
FROM entities
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

```sql
-- Sample entity metadata
SELECT external_id, display_name, metadata
FROM entities
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND metadata IS NOT NULL AND metadata != '{}'
LIMIT 5;
```

### 0E: How does OB-144's vocabulary bridge handle store_volume_tier?

```sql
-- Check current metric derivation rules
SELECT jsonb_pretty(components) as components
FROM rule_sets
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND status = 'active';
```

```bash
echo "=== OB-144 VOCABULARY BRIDGE ==="
cat web/scripts/ob144-phase5-vocabulary-bridge.ts 2>/dev/null | head -80 || echo "NOT FOUND"

echo ""
echo "=== METRIC DERIVATION IN ENGINE ==="
grep -n "deriv\|resolve.*metric\|metric.*rule\|vocabulary\|bridge" \
  web/src/lib/calculation/run-calculation.ts | head -20
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — OB-146
//
// ENGINE STORE RESOLUTION:
// storeData map built from: [query description]
// storeKey field on entity rows: [field name(s)]
// When store lookup fails: [behavior]
//
// STORE DATA IN committed_data:
// Datos_Colaborador: [X] rows, [X] unique employees, [X] unique stores
// Base_Venta_Individual: has No_Tienda? YES/NO, has LLave Tamaño? YES/NO
// Base_Clientes_Nuevos: [X] rows, keyed by [field]
// Base_Cobranza: [X] rows, keyed by [field]
//
// ENTITY STORE METADATA:
// [X] of 22,159 entities have store info
// Store info field name in metadata: [field name] or NONE
//
// VOLUME TIER:
// LLave Tamaño de Tienda exists in: [which sheets]
// Rango_Tienda exists in: [which sheets]
// Current derivation rule for store_volume_tier: EXISTS/MISSING
//
// ROOT CAUSES CONFIRMED:
// 1. Entity→store: [specific gap]
// 2. Volume tier: [specific gap]
// 3. Engine storeData lookup: [specific gap or working]
```

**Proof gate PG-00:** Phase 0 complete. All 5 queries run. Root causes confirmed with evidence.

**Commit:** `OB-146 Phase 0: Diagnostic — store data landscape mapped`

---

# PHASE 1: ENTITY→STORE ASSOCIATION

Populate entity metadata with store identifier from Datos_Colaborador.

### 1A: Build the employee→store mapping

```sql
-- Create temporary mapping from Datos_Colaborador
-- Each num_empleado → No_Tienda
-- If employee appears in multiple rows, take the most recent (or most common)

WITH store_map AS (
  SELECT DISTINCT ON (raw_data->>'num_empleado')
    raw_data->>'num_empleado' as emp_id,
    raw_data->>'No_Tienda' as store_id,
    raw_data->>'Rango_Tienda' as store_range,
    raw_data->>'LLave Tamaño de Tienda' as volume_key
  FROM committed_data
  WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
    AND sheet_name = 'Datos_Colaborador'
    AND raw_data->>'num_empleado' IS NOT NULL
    AND raw_data->>'No_Tienda' IS NOT NULL
  ORDER BY raw_data->>'num_empleado', created_at DESC
)
SELECT COUNT(*) as mapped_employees, 
       COUNT(DISTINCT store_id) as unique_stores
FROM store_map;
```

### 1B: Update entity metadata with store_id

**IMPORTANT: Do NOT replace existing metadata. MERGE the store info into existing metadata JSONB.**

```sql
-- Update entities with store association
UPDATE entities e
SET metadata = COALESCE(e.metadata, '{}'::jsonb) || jsonb_build_object(
  'store_id', sm.store_id,
  'store_range', sm.store_range,
  'volume_key', sm.volume_key
)
FROM (
  SELECT DISTINCT ON (raw_data->>'num_empleado')
    raw_data->>'num_empleado' as emp_id,
    raw_data->>'No_Tienda' as store_id,
    raw_data->>'Rango_Tienda' as store_range,
    raw_data->>'LLave Tamaño de Tienda' as volume_key
  FROM committed_data
  WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
    AND sheet_name = 'Datos_Colaborador'
    AND raw_data->>'num_empleado' IS NOT NULL
    AND raw_data->>'No_Tienda' IS NOT NULL
  ORDER BY raw_data->>'num_empleado', created_at DESC
) sm
WHERE e.external_id = sm.emp_id
  AND e.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

### 1C: Also ensure entity-level committed_data rows have store info

If the engine reads store info from `committed_data.raw_data` rather than `entity.metadata`, update committed_data too:

```sql
-- Check: does the engine read store from entity.metadata or from committed_data.raw_data?
-- Phase 0B answer determines this.
-- If from raw_data: update the employee performance rows to include No_Tienda
-- If from entity.metadata: the Phase 1B update is sufficient
```

**Only run this if Phase 0B shows the engine reads from raw_data, not metadata.**

### 1D: Verify

```sql
-- Count entities with store association
SELECT 
  COUNT(*) as total_entities,
  COUNT(*) FILTER (WHERE metadata->>'store_id' IS NOT NULL) as has_store,
  COUNT(DISTINCT metadata->>'store_id') as unique_stores
FROM entities
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

**Proof gate PG-01:** Majority of entities have store_id in metadata. Paste count.

**Commit:** `OB-146 Phase 1: Entity→store association from Datos_Colaborador`

---

# PHASE 2: STORE_VOLUME_TIER DERIVATION

Add the metric derivation rule for the Venta Óptica matrix column metric.

### 2A: Determine the source

Phase 0C tells us where `LLave Tamaño de Tienda` and `Rango_Tienda` exist. The value should be something like `"$60K-$100K"` or a numeric band identifier.

### 2B: Add derivation rule

The vocabulary bridge (OB-144 Phase 5) already has 8 metric derivation rules. Add the 9th:

**Rule 9:** `store_volume_tier` ← from `LLave Tamaño de Tienda` (parse to band index) OR from `Rango_Tienda` (parse to band name → index)

The engine's matrix_lookup needs a numeric column index or a band value it can match against the plan's column boundaries. Check what format OB-75's working engine used.

### 2C: Verify the plan's matrix column definitions

```sql
-- What are the Venta Óptica column boundaries?
SELECT jsonb_pretty(comp)
FROM rule_sets,
     jsonb_array_elements(components) comp
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND status = 'active'
  AND (comp->>'name' ILIKE '%optic%' OR comp->>'name' ILIKE '%venta%óptic%' OR comp->>'name' ILIKE '%optical%');
```

### 2D: Implement the derivation

Add to the vocabulary bridge script or directly to the engine's metric resolution function. Follow the pattern established by OB-144 Phase 5 for the other 8 rules.

**Korean Test:** The derivation rule maps a semantic metric name (`store_volume_tier`) to a raw field name found in the data. No hardcoded band names like "$60K-$100K" in the engine code. The plan's matrix definition contains the band boundaries.

**Proof gate PG-02:** store_volume_tier derivation rule exists. Paste the rule definition.

**Commit:** `OB-146 Phase 2: store_volume_tier derivation from LLave Tamaño de Tienda`

---

# PHASE 3: ENGINE STORE LOOKUP FIX

If Phase 0B reveals the engine cannot find store data for entities even WITH the store_id association, fix the lookup.

### 3A: Trace the store lookup for one entity

Pick entity with external_id matching a known employee (e.g., 93515855 from CLT-14B):

```sql
-- This entity's store_id
SELECT external_id, metadata->>'store_id' as store
FROM entities
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND external_id = '93515855';

-- Store-level data for that store
SELECT sheet_name, COUNT(*), 
  jsonb_object_keys(raw_data) as fields
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND entity_id IS NULL
  AND raw_data->>'No_Tienda' = (
    SELECT metadata->>'store_id' 
    FROM entities 
    WHERE external_id = '93515855' 
      AND tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  )
GROUP BY sheet_name;
```

### 3B: Fix the storeKey resolution

The engine builds `storeData[storeKey]` from store-level rows. When computing a store component for an entity, it needs to find that entity's storeKey. This requires:

1. Entity's row_data has `No_Tienda` (from Base_Venta_Individual) — OR —
2. Entity's metadata has `store_id` (from Phase 1B) — OR —
3. Entity's committed_data from Datos_Colaborador has `No_Tienda`

The engine must be able to resolve the storeKey from AT LEAST ONE of these paths. If it currently only checks raw_data and the performance rows don't have No_Tienda, it will fail.

**Fix pattern:** In the engine's entity store resolution, check:
1. First: entity's own row_data `No_Tienda` or `num_tienda`
2. Fallback: entity's metadata `store_id`
3. Fallback: query Datos_Colaborador committed_data for this entity's store

**Korean Test:** The field names to check come from a discovery list, not hardcoded. But pragmatically, the storeKey fields (`No_Tienda`, `num_tienda`, `Tienda`) are already referenced in the engine — extend the lookup chain, don't hardcode new names.

### 3C: If no fix needed
If Phase 0B shows the engine already handles the lookup correctly and the only issue was missing entity metadata (fixed in Phase 1), skip this phase and document why.

**Proof gate PG-03:** Store lookup resolves for test entity 93515855. Paste the store data found.

**Commit:** `OB-146 Phase 3: Engine store lookup fix (or SKIP if Phase 1 sufficient)`

---

# PHASE 4: RECALCULATE

### 4A: Delete old results

```sql
DELETE FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

### 4B: Run calculation

Trigger calculation for Enero 2024 period via the calculate API or the UI button. Capture the total payout.

### 4C: Quick check

```sql
-- Total payout
SELECT 
  COUNT(*) as result_count,
  SUM(total_payout) as total_payout,
  COUNT(*) FILTER (WHERE total_payout > 0) as non_zero,
  AVG(total_payout) as avg_payout
FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

```sql
-- Per-component totals
SELECT 
  comp_key,
  COUNT(*) as entity_count,
  SUM((comp_value->>'amount')::numeric) as total
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
GROUP BY comp_key
ORDER BY total DESC;
```

**PASTE BOTH RESULTS.** The per-component totals are the critical evidence.

**Proof gate PG-04:** Total payout significantly higher than MX$12,659. At least 3 components non-zero.

**Commit:** `OB-146 Phase 4: Recalculation complete`

---

# PHASE 5: SCI PIPELINE AUTOMATION

Wire the store association into the SCI execute pipeline so future imports automatically populate entity store metadata.

### 5A: Add store metadata population to postCommitConstruction()

In `web/src/app/api/import/sci/execute/route.ts`, after OB-144's entity creation step:

1. After entities are created, look up Datos_Colaborador rows in the same import batch
2. For each entity, find their No_Tienda from the roster data
3. Update entity metadata with store_id, store_range, volume_key

### 5B: Add store_volume_tier to metric derivation in the pipeline

If Phase 2's derivation was added as a script, make sure the same rule exists in the SCI pipeline's metric resolution step.

**Proof gate PG-05:** postCommitConstruction() includes store metadata population. Build clean.

**Commit:** `OB-146 Phase 5: SCI pipeline — auto store association on import`

---

# PHASE 6: ENGINE CONTRACT + DS-007 REFRESH

### 6A: Engine Contract verification

Run the Engine Contract SQL. Paste output. Compare to Phase 0.

### 6B: Verify DS-007 results page

```
1. Open localhost:3000
2. Log in as Óptica Luminar admin
3. Navigate to Operate → Calculate
4. Verify results page shows updated numbers
5. Check: Hero total higher than before
6. Check: Component breakdown shows non-zero for store components
7. Check: Store heatmap populates (if entities now have store_id)
8. Expand one entity: Narrative mentions store components, Spine shows attainment tracks
```

**Proof gate PG-06:** DS-007 renders with new calculation data. Multiple components in hero breakdown. Store heatmap shows data (or documents why not yet).

**Commit:** `OB-146 Phase 6: Engine Contract + DS-007 verification`

---

# PHASE 7: CC-UAT-07 — PER-COMPONENT ACCURACY VERIFICATION

This is the proof gate. No shortcuts. No "looks right." Numbers traced to benchmark.

### 7A: Benchmark reference

From OB-75 and CLT-14B, the ground truth for Enero 2024 (719 roster employees):

| Component | Ground Truth | OB-75 Engine | OB-75 Accuracy |
|-----------|-------------|-------------|----------------|
| Venta Óptica (Optical) | MX$748,600 | MX$762,400 | 101.8% |
| Venta Tienda (Store Sales) | MX$116,250 | MX$115,250 | 99.1% |
| Clientes Nuevos (New Customers) | MX$39,100 | MX$38,500 | 98.5% |
| Cobranza (Collections) | MX$283,000 | MX$279,800 | 98.9% |
| Club de Protección (Insurance) | MX$10 | MX$43 | ~425%* |
| Garantía Extendida (Warranty) | MX$66,872 | MX$66,872 | 100.0% |
| **TOTAL** | **MX$1,253,832** | **MX$1,262,865** | **100.7%** |

*Insurance is MX$10 ground truth — tiny. Engine overcount is negligible in absolute terms.

### 7B: Current tenant per-component totals

```sql
-- Per-component totals for comparison
-- NOTE: component keys may differ from OB-75. Map them to the benchmark names.
SELECT 
  comp_key,
  COUNT(*) as entities,
  SUM((comp_value->>'amount')::numeric) as total,
  AVG((comp_value->>'amount')::numeric) as avg_per_entity,
  MAX((comp_value->>'amount')::numeric) as max_payout
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
GROUP BY comp_key
ORDER BY total DESC;
```

### 7C: Fill the reconciliation table

```
CC-UAT-07 RECONCILIATION TABLE — OB-146

| Component | Ground Truth | OB-146 Engine | Delta | Accuracy | Status |
|-----------|-------------|---------------|-------|----------|--------|
| Venta Óptica | MX$748,600 | MX$[X] | [X] | [X]% | [PASS/FAIL/PARTIAL] |
| Venta Tienda | MX$116,250 | MX$[X] | [X] | [X]% | [PASS/FAIL/PARTIAL] |
| Clientes Nuevos | MX$39,100 | MX$[X] | [X] | [X]% | [PASS/FAIL/PARTIAL] |
| Cobranza | MX$283,000 | MX$[X] | [X] | [X]% | [PASS/FAIL/PARTIAL] |
| Club de Protección | MX$10 | MX$[X] | [X] | [X]% | [PASS/FAIL/PARTIAL] |
| Garantía Extendida | MX$66,872 | MX$[X] | [X] | [X]% | [PASS/FAIL/PARTIAL] |
| **TOTAL** | **MX$1,253,832** | **MX$[X]** | **[X]** | **[X]%** | |

PASS threshold: Component within ±10% of ground truth
TARGET: Total within ±5% of MX$1,253,832 (i.e., MX$1,191,140 — MX$1,316,524)
STRETCH: Total within ±2% (matches OB-75 performance)
```

### 7D: Trace 3 specific entities

Pick 3 employees from the CLT-14B benchmark file:

**Entity 1: 93515855 (high performer, certificado)**
```sql
SELECT cr.total_payout, jsonb_pretty(cr.component_results)
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND e.external_id = '93515855';
```
Expected total from CLT-14B: ~MX$4,650

**Entity 2: 96568046 (certificado, moderate)**
Expected total from CLT-14B: ~MX$1,877

**Entity 3: 90319253 (no certificado, warranty heavy)**
Expected total from CLT-14B: ~MX$6,617

For each: paste component_results, compare to benchmark, note delta.

### 7E: Diagnosis of remaining gaps

For each component still at MX$0 or significantly off:

```
COMPONENT: [name]
OB-146 RESULT: MX$[X]
EXPECTED: MX$[X]
ROOT CAUSE: [specific — which data field, which engine code path, which derivation rule]
FIXABLE IN: [next OB number / description]
```

**Proof gate PG-07:** CC-UAT-07 reconciliation table complete with all 6 components. At least 3 components non-zero. Entity traces for 3 employees pasted with component breakdowns.

**Commit:** `OB-146 Phase 7: CC-UAT-07 per-component reconciliation`

---

# PHASE 8: COMPLETION REPORT + PR

### 8A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
```

### 8B: Completion report

Save as `OB-146_COMPLETION_REPORT.md` in **PROJECT ROOT**.

```markdown
# OB-146 COMPLETION REPORT
## Store Association + Volume Tier + Calculation Proof

### Engine Contract — BEFORE (Phase 0)
[Paste]

### Engine Contract — AFTER (Phase 6)
[Paste]

### Store Association
- Entities with store_id before: [X]
- Entities with store_id after: [X]
- Unique stores: [X]
- Source: Datos_Colaborador (num_empleado → No_Tienda)

### Volume Tier
- Derivation rule: store_volume_tier ← [field] from [sheet]
- Format: [describe]

### CC-UAT-07 RECONCILIATION TABLE

| Component | Ground Truth | OB-146 Engine | Delta | Accuracy |
|-----------|-------------|---------------|-------|----------|
| Venta Óptica | MX$748,600 | MX$[X] | [X] | [X]% |
| Venta Tienda | MX$116,250 | MX$[X] | [X] | [X]% |
| Clientes Nuevos | MX$39,100 | MX$[X] | [X] | [X]% |
| Cobranza | MX$283,000 | MX$[X] | [X] | [X]% |
| Club de Protección | MX$10 | MX$[X] | [X] | [X]% |
| Garantía Extendida | MX$66,872 | MX$[X] | [X] | [X]% |
| **TOTAL** | **MX$1,253,832** | **MX$[X]** | **[X]** | **[X]%** |

### Entity Traces
- 93515855: MX$[X] (expected ~MX$4,650) — [PASS/DELTA/FAIL]
- 96568046: MX$[X] (expected ~MX$1,877) — [PASS/DELTA/FAIL]
- 90319253: MX$[X] (expected ~MX$6,617) — [PASS/DELTA/FAIL]

### Remaining Gaps
[For each component still at MX$0 or >10% off, document root cause and fix path]

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | | Diagnostic |
| PG-01 | | Entity→store association |
| PG-02 | | store_volume_tier derivation |
| PG-03 | | Engine store lookup |
| PG-04 | | Recalculation |
| PG-05 | | SCI pipeline automation |
| PG-06 | | DS-007 verification |
| PG-07 | | CC-UAT-07 reconciliation |
```

### 8C: PR

```bash
gh pr create --base main --head dev \
  --title "OB-146: Store Association + Volume Tier — [X]% of MX$1,253,832 benchmark" \
  --body "## Store Data Pipeline Fix

### What was broken
- Entities had no store association → 3 store-level components produced MX$0
- store_volume_tier not derived → Venta Óptica matrix column lookup failed
- Total: MX$12,659 (1.0% of benchmark)

### What this fixes
- Entity metadata populated with store_id from Datos_Colaborador
- store_volume_tier derived from LLave Tamaño de Tienda
- Engine store lookup [fixed/already working]
- SCI pipeline wired for auto store association

### Result
- Before: MX$12,659 (1.0%)
- After: MX$[X] ([X]%)
- Target: MX$1,253,832 (100%)

### CC-UAT-07 Reconciliation
[Paste table]

### Standing Rules Enforced: 26, 27, 28, 29
### Korean Test: [PASS/FAIL]"
```

**Proof gate PG-08:** PR created. Completion report committed. Build exits 0.

**Commit:** `OB-146 Phase 8: Completion report + PR`

---

## CC ANTI-PATTERNS — SPECIFIC TO THIS OB

| Anti-Pattern | What CC Might Do | What To Do Instead |
|---|---|---|
| Skip Phase 0 | Jump to writing SQL updates | Phase 0 determines WHICH fix is needed. Without it you're guessing. |
| Replace entity metadata | `SET metadata = jsonb_build_object(...)` | MERGE: `SET metadata = COALESCE(metadata, '{}') \|\| jsonb_build_object(...)` |
| Hardcode store field names | `if (field === 'No_Tienda')` in engine | Engine already has storeKey resolution — extend it, don't hardcode. |
| Skip recalculation | "Store data is linked, should work now" | DELETE old results, RUN calculation, PASTE new totals. |
| Report CC-UAT-07 without numbers | "Components show improvement" | PASTE the SQL output. Fill the reconciliation table. Trace the 3 entities. |
| Ignore Garantía Extendida | "No warranty data, skip" | Document it as MX$0 with root cause "no data in import." That's honest. |
| Modify run-calculation.ts unnecessarily | Rewrite store resolution logic | Read Phase 0B first. The engine may already handle this correctly. |
| Create 22K calculation results | Run for all entities, all periods | Calculate ONLY Enero 2024 period. The benchmark is January only. |

---

## WHAT SUCCESS LOOKS LIKE

After this OB:

1. **CC-UAT-07 table is filled** with real numbers for all 6 components
2. **At least 4 components are non-zero** (Venta Óptica, Venta Tienda, Clientes Nuevos, Cobranza + Club de Protección)
3. **Total payout > MX$500,000** (significant improvement from MX$12,659)
4. **Target: > MX$1,000,000** (within striking distance of benchmark)
5. **Stretch: > MX$1,200,000** (matching OB-75 performance)
6. **3 entity traces show non-zero per-component breakdowns**
7. **DS-007 results page shows the new numbers** with heatmap populated
8. **Remaining gaps are documented** with specific root causes and fix paths

This is the OB that proves the Óptica Luminar tenant works end-to-end, not just Pipeline Test Co.

---

*"OB-75 proved the engine works. OB-146 proves the pipeline works. The difference is everything."*
