# OB-144: PIPELINE CONSTRUCTION + METRIC RESOLUTION
## Two-Layer Fix: Bind the Data, Then Bridge the Vocabulary

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `ENGINE_CONTRACT.md` — 5-table boundary between pipeline and engine
4. `ENGINE_CONTRACT_BINDING.sql` — proven binding script (specification for Phase 1-3)
5. `CLT-142_BROWSER_FINDINGS.md` — findings F-04, F-05, F-11
6. `web/src/lib/calculation/run-calculation.ts` — THE calculation engine. Read it COMPLETELY.

**Read all six before writing any code.**

---

## CONTEXT: CC-UAT-06 FOUND TWO LAYERS OF FAILURE

OB-143 fixed the "Rule set has no components" bug. The engine now reads 6 components and runs. But it produces **MX$0.00 for all 741 entities.** CC-UAT-06 diagnosed why:

### Layer 1: Entity Binding Gap (DATA PLUMBING)
- 119,147 total committed_data rows
- Only 4,340 (3.6%) have entity_id — and these are from Datos Colaborador (roster data with NO performance metrics)
- 72,743 rows have period_id but NULL entity_id — these contain the actual performance data
- The performance data rows DO have `num_empleado` — they CAN be bound to entities

### Layer 2: Metric Key Mismatch (VOCABULARY BRIDGE)
- Components need metrics like `store_attainment_percent`, `store_volume_tier`
- The row_data from SCI import has raw Excel field names: `Cumplimiento`, `Venta_Individual`, `Meta_Individual`
- The engine looks up `store_attainment_percent` in row_data, gets `undefined`, defaults to 0
- All tier lookups return $0
- The 18 seed rows (individual_metrics/store_metrics data_type) DO have semantic keys — but those only cover the 12 seed entities

### What This OB Does
- **Part A (Phases 0-3):** Fix entity_id binding on the 72,743 performance rows
- **Part B (Phases 4-6):** Bridge the vocabulary gap so the engine can find metrics in raw field names
- **Phase 7:** Run calculation and verify non-zero payouts
- **Phase 8:** Wire binding into SCI pipeline for future imports

Both parts are required. Binding without metric resolution = bound data the engine can't read. Metric resolution without binding = readable data the engine can't find.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Fix logic not data.
7. **Korean Test:** Zero hardcoded field names in the ENGINE or PIPELINE code. Mapping rules in input_bindings are data (per-plan configuration), not code.
8. Import ALL columns to committed_data — Carry Everything, Express Contextually.

---

## ENGINE CONTRACT VERIFICATION QUERY

Run BEFORE Phase 1, AFTER Phase 3, and AFTER Phase 7:

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

---

# PART A: ENTITY BINDING (Phases 0-3)

---

## PHASE 0: DIAGNOSTIC — MAP THE BINDING GAP

### 0A: Run Engine Contract verification query
Paste full output. Record baseline values.

### 0B: Map the binding landscape

```sql
-- Binding status breakdown
SELECT 
  COUNT(*) FILTER (WHERE entity_id IS NOT NULL AND period_id IS NOT NULL) as fully_bound,
  COUNT(*) FILTER (WHERE entity_id IS NOT NULL AND period_id IS NULL) as entity_only,
  COUNT(*) FILTER (WHERE entity_id IS NULL AND period_id IS NOT NULL) as period_only,
  COUNT(*) FILTER (WHERE entity_id IS NULL AND period_id IS NULL) as fully_orphaned,
  COUNT(*) as total
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

**Expected:** ~4,340 fully_bound, ~72,743 period_only, ~42,064 fully_orphaned.

### 0C: Understand WHY entity_id binding failed before

The original ENGINE_CONTRACT_BINDING.sql Step 3 matches `row_data->>'num_empleado'` to `entities.external_id`. CC-UAT-06 showed this should work — the values ARE the same format. But only 4,340 rows bound.

Check: are the 72,743 period_only rows actually matchable?

```sql
-- How many period_only rows have num_empleado that matches an entity?
SELECT COUNT(*) as matchable
FROM committed_data cd
JOIN entities e ON e.external_id = (cd.row_data->>'num_empleado') AND e.tenant_id = cd.tenant_id
WHERE cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND cd.period_id IS NOT NULL
  AND cd.entity_id IS NULL
  AND cd.row_data->>'num_empleado' IS NOT NULL;

-- How many period_only rows DON'T have num_empleado?
SELECT COUNT(*) as no_num_empleado
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND period_id IS NOT NULL
  AND entity_id IS NULL
  AND row_data->>'num_empleado' IS NULL;

-- For rows WITHOUT num_empleado, what entity identifier DO they have?
SELECT DISTINCT jsonb_object_keys(row_data) as field
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND period_id IS NOT NULL
  AND entity_id IS NULL
  AND row_data->>'num_empleado' IS NULL
LIMIT 30;
```

**Document the results.** We need to know:
1. How many of the 72,743 rows CAN be bound via num_empleado → external_id match
2. How many DON'T have num_empleado (these are store-level data using No_Tienda)
3. Whether the store-level data needs entity binding or is consumed differently by the engine

### 0D: Read how the engine consumes data

```bash
echo "=== HOW DOES THE ENGINE FETCH DATA FOR AN ENTITY? ==="
grep -n "committed_data\|entityData\|storeData\|individualData\|raw_data\|row_data" \
  web/src/lib/calculation/run-calculation.ts | head -40

echo ""
echo "=== HOW DOES THE ENGINE BUILD METRIC VALUES? ==="
grep -n "resolveSource\|resolveMetric\|buildMetrics\|metric.*=\|metricValue\|getValue\|getMetric" \
  web/src/lib/calculation/run-calculation.ts | head -30

echo ""
echo "=== WHAT DOES THE ENGINE DO WITH storeData? ==="
grep -n "storeData\|store_data\|storeMetrics\|No_Tienda\|num_tienda\|storeId" \
  web/src/lib/calculation/run-calculation.ts | head -20

echo ""
echo "=== HOW ARE INDIVIDUAL vs STORE METRICS DISTINGUISHED? ==="
grep -n "individual\|store\|scope\|level\|entity_type\|metric_scope" \
  web/src/lib/calculation/run-calculation.ts | head -20
```

**Paste ALL output.** This tells us:
- Does the engine expect entity_id-filtered data, or does it also read period-level data?
- How does it distinguish individual metrics from store metrics?
- Does it use data_type, row_data fields, or something else to group metrics?

**Proof gate PG-00:** Diagnostic complete. Binding gap mapped. Engine data consumption pattern documented.

**Commit:** `OB-144 Phase 0: Diagnostic — binding gap + engine data consumption mapped`

---

## PHASE 1: BIND entity_id ON PERFORMANCE DATA ROWS

Based on Phase 0 results, bind entity_id where possible.

### 1A: Bind via num_empleado → external_id

This is the same logic as ENGINE_CONTRACT_BINDING.sql Step 3, but this time targeting the period_only rows:

```sql
UPDATE committed_data cd
SET entity_id = e.id
FROM entities e
WHERE e.external_id = (cd.row_data->>'num_empleado')
  AND e.tenant_id = cd.tenant_id
  AND cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND cd.entity_id IS NULL
  AND cd.row_data->>'num_empleado' IS NOT NULL;
```

**Run this in Supabase SQL Editor. Paste the result (how many rows updated).**

### 1B: Verify the binding

```sql
-- After binding: new breakdown
SELECT 
  COUNT(*) FILTER (WHERE entity_id IS NOT NULL AND period_id IS NOT NULL) as fully_bound,
  COUNT(*) FILTER (WHERE entity_id IS NOT NULL AND period_id IS NULL) as entity_only,
  COUNT(*) FILTER (WHERE entity_id IS NULL AND period_id IS NOT NULL) as period_only,
  COUNT(*) FILTER (WHERE entity_id IS NULL AND period_id IS NULL) as fully_orphaned,
  COUNT(*) as total
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

### 1C: Handle store-level rows (No_Tienda)

If Phase 0C showed that the remaining unbound rows use No_Tienda (store identifier) instead of num_empleado:
- These are STORE-LEVEL performance data (Base_Clientes_Nuevos, etc.)
- The engine likely consumes these differently — via store grouping, not entity binding
- **Do NOT create entities for stores** unless the engine requires entity_id on these rows
- Instead, document how the engine reads store data and whether it needs entity_id

**Proof gate PG-01:** entity_id binding executed. Before/after counts pasted. Store-level data handling documented.

**Commit:** `OB-144 Phase 1: Entity_id binding on performance data rows`

---

## PHASE 2: BIND period_id ON REMAINING ORPHANED ROWS

If Phase 0B showed rows with entity_id but no period_id, or rows with neither:

### 2A: Bind via Mes + Año → canonical_key

```sql
-- Same logic as ENGINE_CONTRACT_BINDING.sql Step 4
UPDATE committed_data cd
SET period_id = p.id
FROM periods p
WHERE p.tenant_id = cd.tenant_id
  AND p.canonical_key = CONCAT(
    (cd.row_data->>'Año')::text, 
    '-', 
    LPAD((cd.row_data->>'Mes')::text, 2, '0')
  )
  AND cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND cd.period_id IS NULL
  AND cd.row_data->>'Mes' IS NOT NULL
  AND cd.row_data->>'Año' IS NOT NULL;
```

### 2B: Bind via Fecha Corte (Excel serial date)

```sql
UPDATE committed_data cd
SET period_id = p.id
FROM periods p
WHERE p.tenant_id = cd.tenant_id
  AND ('1899-12-30'::date + ((cd.row_data->>'Fecha Corte')::int)) 
      BETWEEN p.start_date AND p.end_date
  AND cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND cd.period_id IS NULL
  AND cd.row_data->>'Fecha Corte' IS NOT NULL
  AND cd.row_data->>'Mes' IS NULL;
```

### 2C: Also bind via FechaCorte (no space variant)

```sql
-- The field might be stored as 'FechaCorte' (no space) — CC-UAT-06 showed both variants
UPDATE committed_data cd
SET period_id = p.id
FROM periods p
WHERE p.tenant_id = cd.tenant_id
  AND ('1899-12-30'::date + ((cd.row_data->>'FechaCorte')::int)) 
      BETWEEN p.start_date AND p.end_date
  AND cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND cd.period_id IS NULL
  AND cd.row_data->>'FechaCorte' IS NOT NULL
  AND cd.row_data->>'Mes' IS NULL;
```

### 2D: Verify

Run the binding breakdown query again. Paste results.

**Proof gate PG-02:** Period_id binding complete. Before/after counts pasted.

**Commit:** `OB-144 Phase 2: Period_id binding on orphaned rows`

---

## PHASE 3: VERIFY ENGINE CONTRACT + ASSIGNMENT COVERAGE

### 3A: Run Engine Contract verification query

Paste full output. Compare to Phase 0 baseline.

### 3B: Verify assignments cover all entities

```sql
-- Any entities without assignments?
SELECT COUNT(*) as entities_without_assignments
FROM entities e
WHERE e.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM rule_set_assignments rsa WHERE rsa.entity_id = e.id
  );
```

If > 0, create assignments using ENGINE_CONTRACT_BINDING.sql Step 5 logic.

### 3C: Per-period bound data summary

```sql
SELECT p.canonical_key, p.label, 
  COUNT(cd.id) as bound_rows, 
  COUNT(DISTINCT cd.entity_id) as unique_entities,
  COUNT(DISTINCT cd.row_data->>'_sheetName') as unique_sheets
FROM committed_data cd
JOIN periods p ON cd.period_id = p.id
WHERE cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND cd.entity_id IS NOT NULL AND cd.period_id IS NOT NULL
GROUP BY p.canonical_key, p.label ORDER BY p.canonical_key;
```

**Proof gate PG-03:** Engine Contract verification post-binding. Bound rows significantly increased. Paste all SQL outputs.

**Commit:** `OB-144 Phase 3: Engine Contract verification post-binding`

---

# PART B: METRIC RESOLUTION (Phases 4-6)

---

## PHASE 4: MAP THE VOCABULARY GAP

Even with full binding, the engine will still return $0 because it looks for semantic metric names that don't match the raw row_data field names.

### 4A: Document the exact gap

Read the component definitions and map each metric to its row_data equivalent:

```bash
echo "=== COMPONENT DEFINITIONS ==="
# Read the full components array from the database
# Use the existing engine-contract verification script or query directly
```

```sql
-- Component metric requirements
SELECT jsonb_pretty(components) FROM rule_sets
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND status = 'active';
```

For EACH component, extract:
- What metric name does it look for? (from `tierConfig.metric` or `calculationIntent.input`)
- What is the expected value type? (percentage, currency amount, count)

Then map to row_data:

```sql
-- Available fields in bound performance data
SELECT DISTINCT jsonb_object_keys(row_data) as field
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND entity_id IS NOT NULL
  AND period_id IS NOT NULL
  AND row_data->>'_sheetName' != 'Datos Colaborador'
LIMIT 50;
```

### 4B: Build the mapping table

Document the complete vocabulary mapping:

| Component | Metric Name in Component | Row Data Field | Scope | Transform |
|-----------|-------------------------|----------------|-------|-----------|
| Venta Óptica | store_attainment_percent | Cumplimiento | individual row | × 100 if decimal |
| Venta Óptica | store_volume_tier | Rango de Tienda OR Real_Venta_Tienda | store-level | none or lookup |
| Venta Tienda | store_sales_attainment | Cumplimiento (store sheet) | store-level | × 100 if decimal |
| Clientes Nuevos | new_customers_attainment_percent | Clientes_Actuales / Clientes_Meta | store-level | compute ratio |
| Cobranza | collections_attainment_percent | Monto_Recuperado_Actual / Monto_Recuperado_Meta | store-level | compute ratio |
| Club de Protección | individual_insurance_sales | Monto Club Protection | individual | none |
| Garantía Extendida | individual_warranty_sales | (find field) | individual | none |

**This table is the specification for Phase 5.** Get it right.

### 4C: Understand how the engine resolves metrics

Read `run-calculation.ts` to understand EXACTLY how it resolves a metric name to a value. Specifically:

1. Does it use `input_bindings` to find the source field? If so, what format does input_bindings need to be in?
2. Does it use `metric_derivations` to compute derived metrics? If so, what format?
3. Does it read row_data fields directly by name? If so, which names does it try?
4. Does it read from `data_type`-specific data maps? How are these grouped?
5. Is there a fallback resolution chain? (e.g., input_bindings → metric_derivations → direct field name → 0)

```bash
# Read the COMPLETE metric resolution path
cat web/src/lib/calculation/run-calculation.ts | head -200

# Find the metric resolution function specifically
grep -n -A 30 "function.*resolveMetric\|function.*getMetricValue\|function.*resolveSource\|function.*buildEntityMetrics" \
  web/src/lib/calculation/run-calculation.ts
```

**Document the resolution chain with file:line references.** This determines whether we fix this via input_bindings, metric_derivations, or code changes.

**Proof gate PG-04:** Complete vocabulary mapping table. Engine metric resolution chain documented with file:line references.

**Commit:** `OB-144 Phase 4: Vocabulary gap mapped — component metrics → row_data fields`

---

## PHASE 5: BRIDGE THE VOCABULARY

Based on Phase 4's findings, implement the vocabulary bridge. There are three possible approaches — use the one that matches how the engine actually resolves metrics:

### Approach A: Update input_bindings on the rule_set

If the engine uses `input_bindings` to map semantic metric names to row_data field names:

```sql
-- Update input_bindings with the vocabulary mapping
UPDATE rule_sets
SET input_bindings = '{
  "bindings": [
    {
      "component_metric": "store_attainment_percent",
      "source_field": "Cumplimiento",
      "source_type": "committed_data",
      "transform": "multiply_100_if_decimal"
    },
    ... (one entry per component metric)
  ],
  "metric_derivations": [
    {
      "metric_name": "new_customers_attainment_percent",
      "operation": "ratio",
      "numerator_field": "Clientes_Actuales",
      "denominator_field": "Clientes_Meta",
      "multiply": 100,
      "source_data_type": "store_metrics_sheet"
    },
    ... (for computed metrics)
  ]
}'::jsonb
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND status = 'active';
```

**BUT: only use this approach if the engine code actually reads input_bindings in this format.** Phase 4C tells you.

### Approach B: Update component definitions to use raw field names

If the engine reads metric names directly from tierConfig.metric and looks them up in row_data:

```sql
-- Update each component's metric references to use actual field names
-- Example: change "store_attainment_percent" to "Cumplimiento"
```

**WARNING:** This violates the Korean Test — the components would contain Spanish field names. Only use this if there's no input_bindings resolution layer and adding one is too complex for this OB.

### Approach C: Add/fix the metric resolution function in the engine

If the engine has a metric resolution function that's supposed to read input_bindings but isn't working:

```typescript
// Fix the resolution function to:
// 1. Look up the metric name in input_bindings
// 2. Find the mapped source_field
// 3. Read that field from row_data
// 4. Apply any transform (multiply by 100, compute ratio, etc.)
```

**The choice between A, B, and C depends entirely on Phase 4C.** Read the code first. Then pick the approach.

### Validation

After implementing the vocabulary bridge, verify it would produce correct values:

```sql
-- For entity 96568046 (known test entity), Enero 2024:
-- What does the engine now see for each metric?
SELECT 
  cd.row_data->>'Cumplimiento' as cumplimiento,
  cd.row_data->>'Venta_Individual' as venta_individual,
  cd.row_data->>'Meta_Individual' as meta_individual,
  cd.row_data->>'_sheetName' as sheet
FROM committed_data cd
JOIN entities e ON e.id = cd.entity_id
WHERE cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND e.external_id = '96568046'
  AND cd.period_id = (SELECT id FROM periods WHERE tenant_id = cd.tenant_id AND canonical_key = '2024-01')
ORDER BY cd.row_data->>'_sheetName';
```

**Proof gate PG-05:** Vocabulary bridge implemented. Method documented (A, B, or C). Validation query shows metric values will reach the engine.

**Commit:** `OB-144 Phase 5: Vocabulary bridge — [describe which approach was used]`

---

## PHASE 6: STORE-LEVEL DATA ROUTING

CC-UAT-06 showed that some components (Venta Óptica, Venta Tienda, Clientes Nuevos, Cobranza) use STORE-LEVEL metrics — the same value applies to all optometrists in that store.

### 6A: Understand how the engine handles store data

From Phase 0D, document:
- Does the engine have a `storeData` map? How is it keyed? (No_Tienda? num_tienda?)
- Does the engine join store-level data to entities via store membership?
- Does the engine expect store data to have entity_id = NULL and use a different lookup path?

### 6B: Ensure store data is accessible

If the engine uses a storeData map:
- The store-level rows (Base_Clientes_Nuevos, etc.) may NOT need entity_id binding
- They may need period_id binding (Phase 2 should have handled this)
- They may need a store identifier field that matches the entity's store membership

If the engine requires entity_id on store data:
- Each entity needs a `store_id` or `No_Tienda` attribute in their metadata
- The store data needs entity_id set to... what? Each individual entity? Or a store-level entity?

### 6C: Document the gap

The store-level data routing may require additional work beyond this OB. If so, document:
- What the engine needs
- What the data has
- What's missing
- Whether individual-level components can still calculate without store data

**Proof gate PG-06:** Store-level data routing documented. If it works: show evidence. If it doesn't: document what's needed for a follow-up OB.

**Commit:** `OB-144 Phase 6: Store-level data routing — [status]`

---

# PART C: CALCULATION PROOF (Phases 7-8)

---

## PHASE 7: RUN CALCULATION AND VERIFY

### 7A: Run Engine Contract verification query

Paste output. All 7 values should be non-zero. Bound rows should be significantly higher than the 4,340 baseline.

### 7B: Delete stale calculation results

```sql
-- Clear previous MX$0.00 results so we get fresh ones
DELETE FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);

-- Also clear any calculation_batches
DELETE FROM calculation_batches
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

### 7C: Trigger calculation

Either:
- Through the browser: navigate to Calculate, select Enero 2024, click Calculate
- Through the API: `POST /api/calculation/run` with tenant_id, period_id, rule_set_id

### 7D: Check results

```sql
-- What did the engine produce?
SELECT 
  COUNT(*) as result_count,
  SUM(total_payout) as total_payout,
  COUNT(*) FILTER (WHERE total_payout > 0) as non_zero_count,
  COUNT(*) FILTER (WHERE total_payout = 0) as zero_count,
  AVG(total_payout) as avg_payout,
  MAX(total_payout) as max_payout,
  MIN(total_payout) FILTER (WHERE total_payout > 0) as min_nonzero_payout
FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

### 7E: Trace one entity

```sql
-- Full result for entity 96568046
SELECT cr.total_payout, 
  jsonb_pretty(cr.components) as component_breakdown,
  jsonb_pretty(cr.metrics) as metrics_used,
  p.canonical_key as period
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
JOIN periods p ON p.id = cr.period_id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND e.external_id = '96568046';
```

### 7F: Compare to benchmark

Target: MX$1,253,832 total for Enero 2024 (from Pipeline Test Co equivalence).

If the total is:
- Close to MX$1,253,832: SUCCESS — the pipeline works
- Non-zero but far off: PARTIAL — investigate which components are wrong
- Still MX$0.00: FAILURE — the metric resolution didn't work. Trace one entity (7E) to see why.

**Proof gate PG-07:** Calculation produces non-zero results. Total payout documented. Entity-level trace pasted. Comparison to benchmark noted.

**Commit:** `OB-144 Phase 7: Calculation proof — [result]`

---

## PHASE 8: WIRE BINDING INTO SCI PIPELINE (AUTOMATION)

Now that binding is proven via SQL, wire the same logic into the SCI execute pipeline so future imports bind automatically.

### 8A: Create a post-import construction function

Create a function that runs after SCI commits data to committed_data. It must:

1. **Extract entity identifiers from the import** — find the field classified as `entity_identifier` (via field_mappings or semantic_roles), extract unique values
2. **Create missing entities** — check existing entities, create new ones for unmatched identifiers. Supabase batch limit: 200. Entity creation uses external_id, not hardcoded field names.
3. **Bind entity_id on committed_data** — UPDATE committed_data SET entity_id = matching entity. Prefer RPC function for performance (100K+ rows).
4. **Detect periods** — find month/year or date fields, extract unique period boundaries, create missing periods with canonical_key YYYY-MM
5. **Bind period_id on committed_data** — match via canonical_key or date range
6. **Create assignments** — link new entities to the active rule_set

### 8B: Create Supabase RPC functions for performance

For binding operations on 100K+ rows, individual API calls will timeout. Create PostgreSQL functions:

```sql
-- RPC function for entity_id binding
CREATE OR REPLACE FUNCTION bind_entity_ids_for_import(
  p_tenant_id UUID,
  p_entity_field TEXT
) RETURNS TABLE(bound BIGINT, unbound BIGINT) AS $$
BEGIN
  UPDATE committed_data cd
  SET entity_id = e.id
  FROM entities e
  WHERE e.external_id = (cd.row_data->>p_entity_field)
    AND e.tenant_id = cd.tenant_id
    AND cd.tenant_id = p_tenant_id
    AND cd.entity_id IS NULL
    AND cd.row_data->>p_entity_field IS NOT NULL;

  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE entity_id IS NOT NULL),
    COUNT(*) FILTER (WHERE entity_id IS NULL)
  FROM committed_data WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for period_id binding (month + year fields)
CREATE OR REPLACE FUNCTION bind_period_ids_for_import(
  p_tenant_id UUID,
  p_month_field TEXT,
  p_year_field TEXT
) RETURNS TABLE(bound BIGINT, unbound BIGINT) AS $$
BEGIN
  UPDATE committed_data cd
  SET period_id = p.id
  FROM periods p
  WHERE p.tenant_id = cd.tenant_id
    AND p.canonical_key = CONCAT(
      (cd.row_data->>p_year_field)::text, 
      '-', 
      LPAD((cd.row_data->>p_month_field)::text, 2, '0')
    )
    AND cd.tenant_id = p_tenant_id
    AND cd.period_id IS NULL
    AND cd.row_data->>p_month_field IS NOT NULL
    AND cd.row_data->>p_year_field IS NOT NULL;

  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE period_id IS NOT NULL),
    COUNT(*) FILTER (WHERE period_id IS NULL)
  FROM committed_data WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Execute these in Supabase SQL Editor. Verify with a query that shows the functions exist.**

### 8C: Wire into SCI execute

Find the SCI execute route/function and add post-commit construction calls:

```bash
find web/src -path "*sci*execute*" -name "route.ts" -o -path "*sci*execute*" -name "*.ts" | head -5
```

Add the construction sequence after committed_data INSERT. The entity and period field names come from:
- The SCI proposal's semantic role assignments
- Or the import's field_mappings
- NOT from hardcoded strings

### 8D: Run Engine Contract verification after wiring

```sql
-- Should still show the same values as Phase 7
-- This confirms the wiring didn't break anything
```

**Proof gate PG-08:** Post-import construction function exists. RPC functions created and verified. Wired into SCI execute. Engine Contract verification passes.

**Commit:** `OB-144 Phase 8: Pipeline construction wired into SCI execute`

---

## PHASE 9: COMPLETION REPORT + PR

### 9A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
```

### 9B: Completion report

Save as `OB-144_COMPLETION_REPORT.md` in **PROJECT ROOT**.

```markdown
# OB-144 COMPLETION REPORT
## Pipeline Construction + Metric Resolution

### Engine Contract — BEFORE (Phase 0)
[Paste SQL output]

### Part A: Entity Binding
- Phase 1: entity_id binding — [X rows bound via num_empleado]
- Phase 2: period_id binding — [X rows bound via Mes+Año, X via Fecha Corte]
- Phase 3: Engine Contract post-binding — [paste output]

### Part B: Metric Resolution
- Phase 4: Vocabulary mapping — [table of component → field mappings]
- Phase 5: Bridge approach — [A/B/C, with rationale]
- Phase 6: Store data routing — [status + findings]

### Part C: Calculation Proof
- Phase 7: Total payout = MX$[amount]
- Target benchmark: MX$1,253,832
- Non-zero entities: [count]/741
- Entity trace (96568046): [per-component breakdown]

### Part D: Pipeline Automation
- Phase 8: RPC functions — [created/verified]
- SCI wiring — [file:line where construction runs]

### Engine Contract — AFTER (Phase 7)
[Paste SQL output]

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | | Diagnostic complete |
| PG-01 | | entity_id binding |
| PG-02 | | period_id binding |
| PG-03 | | Engine Contract post-binding |
| PG-04 | | Vocabulary gap mapped |
| PG-05 | | Vocabulary bridge implemented |
| PG-06 | | Store data routing |
| PG-07 | | Calculation produces non-zero |
| PG-08 | | Pipeline automation wired |

### What This OB Does NOT Fix
- N+1 query optimization (PDR-04)
- SCI proposal UX refinements (P2)
- Multi-plan assignment UI
- Complete store-level entity binding (4,340 orphan rows)
```

### 9C: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-144: Pipeline Construction + Metric Resolution — MX$0.00 → MX$[amount]" \
  --body "## Two-Layer Fix
Layer 1: Bound entity_id on ~72K performance data rows
Layer 2: Bridged vocabulary gap (Cumplimiento → store_attainment_percent)
Result: Calculation produces MX$[amount] (target: MX$1,253,832)

## Engine Contract
Before: 4,340 bound rows → MX$0.00
After: [X] bound rows → MX$[amount]

## Korean Test: [PASS/FAIL]
## Proof Gates: PG-00 through PG-08"
```

**Proof gate PG-09:** PR created. Completion report committed. Build exits 0.

**Commit:** `OB-144 Phase 9: Completion report + PR`

---

## CC ANTI-PATTERNS — SPECIFIC TO THIS OB

| Anti-Pattern | What CC Has Done Before | What To Do Instead |
|---|---|---|
| Hardcode field names in engine | `if (field === 'Cumplimiento')` | Field mapping lives in input_bindings or component config, not in engine code |
| Skip Phase 4 (reading the engine code) | "I'll update input_bindings and it should work" | Read the ACTUAL metric resolution function. Understand HOW it resolves. Then pick the approach that matches. |
| Create a new calculation engine | "Rewrote the calculation pipeline..." | The engine works. Fix the DATA LAYER that feeds it. |
| Report PASS without running calculation | "Binding complete, metrics mapped, should produce correct results" | Phase 7 exists. Run the calculation. Paste the number. |
| Skip store data analysis | "Store data is out of scope" | 3 of 6 components use store-level data. If the engine needs it, document how. |
| Forget Supabase 200-item batch limit | `.in('external_id', allIds)` with 741 items | Batch in groups of 200 |
| Bind data but don't update input_bindings | "entity_id bound on 72K rows!" | Binding without metric resolution still produces $0. Both layers are required. |

---

## WHAT SUCCESS LOOKS LIKE

After this OB:
1. **Bound data rows** jump from 4,340 to 50K+ (ideally 70K+)
2. **Calculation produces a non-zero MX$ total** for Enero 2024
3. **At least some entities show per-component breakdowns** (not all $0)
4. **The SCI pipeline automatically binds entity_id and period_id** on future imports
5. **The vocabulary gap is documented and bridged** — the engine can find metrics in raw field names

The exact benchmark (MX$1,253,832) may require store-level data routing to fully match. That's acceptable — a non-zero total with component breakdowns proves the two-layer fix works. Precision comes from refining the store data routing in a follow-up OB.

---

*"The engine never broke. The pipeline never filled the contract. The vocabulary was never bridged. Now both are fixed."*
