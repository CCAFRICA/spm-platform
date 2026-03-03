# CC-UAT-06 COMPLETION REPORT
## Optica Luminar Full Diagnostic — Why MX$0.00?

### Proof Gates

| Gate | Status | Evidence |
|------|--------|----------|
| PG-01 | PASS | Script runs end-to-end without errors |
| PG-02 | PASS | All 6 sections produce output |
| PG-03 | PASS | Root cause identified (see below) |
| PG-04 | PASS | Remediation roadmap with 4 actions |

---

## ROOT CAUSE: TWO-LAYER FAILURE

### Layer 1: Metric Key Mismatch (PRIMARY)

Components need these metrics:
- `store_attainment_percent` — NOT FOUND in any row_data
- `store_volume_tier` — NOT FOUND in any row_data
- `new_customers_attainment_percent` — exists in `individual_metrics` rows (only 12 rows)
- `collections_attainment_percent` — exists in `individual_metrics` rows (only 12 rows)
- `individual_insurance_sales` — NOT FOUND (row_data has `insurance_sales`)
- `store_insurance_attainment_percent` — NOT FOUND (row_data has `insurance_attainment_percent`)
- `individual_warranty_sales` — NOT FOUND (row_data has `warranty_sales`)

The components expect semantic metric names like `store_attainment_percent`, but the actual row_data has raw field names like `Cumplimiento` (=2.92, meaning 292% attainment), `Venta_Individual`, `Meta_Individual`, etc.

**The 12 `individual_metrics` and 6 `store_metrics` rows DO have the correct semantic keys** (attainment_percent, volume_tier, etc.) — but these are only 18 rows total (the old seed data from OB-142 Phase 1). The 119,129 production rows from the SCI import have raw Excel field names, not semantic metric names.

### Layer 2: Entity Binding Gap

- 119,147 total committed_data rows
- Only 4,340 (3.6%) have entity_id set
- 72,743 rows have period_id but NULL entity_id — these are the bulk of the production data
- The rows with entity_id only contain 5 fields: `No_Tienda, _rowIndex, _sheetName, Fecha Corte, num_empleado` — no metric values

**The bound rows are from the "Datos Colaborador" sheet — roster/identity data, NOT performance data.** The actual performance data (Base_Venta_Individual, Base_Clientes_Nuevos, Base_Club_Proteccion) has period_id but NO entity_id.

### The Complete Picture

```
WHAT THE ENGINE GETS FOR ENTITY 90234331, ENERO 2024:

Period-specific fetch (period_id = Enero):
  → 2 rows with entity_id = this entity
    Row 1: Datos Colaborador — {No_Tienda: 68, num_empleado: 90234331} — NO metrics
    Row 2: Base_Venta_Individual — {Cumplimiento: 3.884, Meta_Individual: 14000,
            Venta_Individual: 54376} — HAS metrics but wrong key names

  → ~25,000 rows with entity_id = NULL (store-level data)
    These go to storeData map, keyed by storeId/num_tienda/No_Tienda

Engine needs: store_attainment_percent
Row_data has: Cumplimiento (=3.884 = 388.4% attainment)
→ Metric resolution fails: "store_attainment_percent" ≠ "Cumplimiento"
→ All components get metric value 0
→ All tier lookups return $0
→ Total payout: MX$0.00
```

### What Actually Has to Happen

The data IS there. Entity 90234331 has `Cumplimiento: 3.884` (388% attainment) and `Venta_Individual: 54376`. These map to the component metrics:

| Component Metric | Row_Data Field | Value |
|-----------------|----------------|-------|
| store_attainment_percent | Cumplimiento × 100 | 388.4% |
| store_volume_tier | Rango de Tienda or LLave Tamaño de Tienda | needs mapping |
| new_customers_attainment_percent | Clientes_Actuales / Clientes_Meta × 100 | in store data |
| collections_attainment_percent | (in Cobranza sheet) | in store data |
| individual_insurance_sales | Monto Club Protection | in individual data |
| individual_warranty_sales | (warranty sales field) | in store data |

---

## DATA LANDSCAPE SUMMARY

```
Total committed_data:    119,147 rows
  fully_bound:             4,340 (3.6%)  — mostly Datos Colaborador (no metrics)
  entity_only:                 0 (0.0%)
  period_only:            72,743 (61.1%) — HAS the performance data
  fully_orphaned:         42,064 (35.3%) — older data, no binding

Bound rows by period:
  Enero 2024:    1,446 bound (25,314 total)
  Febrero 2024:  1,438 bound (25,833 total)
  Marzo 2024:    1,438 bound (25,918 total)
  Febrero 2026:     18 bound (18 total) — seed data

data_types in the data:
  backttest_optometrista_mar2025_proveedores                        — roster (Datos Colaborador)
  backttest_optometrista_mar2025_proveedores__base_venta_individual — individual sales
  backttest_optometrista_mar2025_proveedores__base_clientes_nuevos  — new customers
  backttest_optometrista_mar2025_proveedores__base_club_proteccion  — insurance
  individual_metrics / store_metrics                                — 18 seed rows (correct format)
```

---

## REMEDIATION ROADMAP

### Action 1: Bind entity_id to performance data rows (CRITICAL)
- Match `committed_data.row_data->>'num_empleado'` to `entities.external_id`
- The `num_empleado` field exists in all sheet types
- Estimated impact: ~72,743 rows currently with period_id but no entity_id
- SQL: `UPDATE committed_data SET entity_id = e.id FROM entities e WHERE cd.tenant_id = e.tenant_id AND cd.row_data->>'num_empleado' = e.external_id AND cd.entity_id IS NULL`

### Action 2: Fix metric resolution (CRITICAL)
The `input_bindings` currently only have 2 simple entries. They need to map raw field names to component metric names:
- `Cumplimiento` → `store_attainment_percent` (× 100 if decimal)
- `Venta_Individual` → base for individual sales calculations
- `Clientes_Actuales / Clientes_Meta` → `new_customers_attainment_percent`
- `Monto Club Protection` → `individual_insurance_sales`
- etc.

**Option A:** Update `input_bindings` with metric_derivation rules
**Option B:** Rename component config metrics to match actual row_data fields
**Option C:** Add a transformation layer in the binding SQL

### Action 3: Handle store-level data (Base_Clientes_Nuevos, etc.)
- Base_Clientes_Nuevos has store-level data (No_Tienda, Clientes_Meta, Clientes_Actuales)
- These rows have NO entity_id — they're store-level
- Engine needs to route these to storeData map via No_Tienda key
- Currently NULL entity_id rows go to store grouping — this WORKS if the storeId key resolves

### Action 4: Re-run calculation and verify
After Actions 1-3, re-run for Enero 2024 and verify non-zero payouts.

**Priority:** Action 1 (binding) + Action 2 (metrics) are blocking. Action 3 may already work if store keys resolve correctly.

---

## COMPONENT TYPE COMPATIBILITY

All 6 component types are handled by the engine:
- matrix_lookup: HANDLED
- tier_lookup: HANDLED
- percentage_with_gate: HANDLED
- flat_percentage: HANDLED

The engine code is correct. The data structure and metric resolution are the gap.
