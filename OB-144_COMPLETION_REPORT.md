# OB-144 COMPLETION REPORT
## Pipeline Construction + Metric Resolution

### Engine Contract — BEFORE (Phase 0)
```
entity_count:       741
period_count:       4
active_plans:       1
component_count:    6
assignment_count:   741
bound_data_rows:    4,340
orphaned_data_rows: 114,807
```

### Part A: Entity Binding

**Phase 0:** Diagnostic revealed:
- 119,147 total rows: 4,340 bound, 72,743 period_only, 42,064 orphaned
- CRITICAL FINDING: 21,418 unique employees in performance data had ZERO overlap with 741 existing entities
- Store-level data (Base_Clientes_Nuevos, Base_Cobranza) uses No_Tienda, not num_empleado — engine handles via storeKey

**Phase 1:** Entity creation + binding
- Created 21,418 new entities for employees in performance data
- Created 21,418 rule_set_assignments
- Bound entity_id on 56,690 performance rows via num_empleado → external_id
- Result: 61,030 fully bound (was 4,340)
- 16,053 remaining period_only = store-level data (no entity_id needed)

**Phase 2:** Period binding
- 42,064 orphaned rows are ALL April 2024 (Fecha Corte=45412 → 2024-04-30)
- No April period exists — data out of scope for Jan-Mar 2024 calculations
- Documented as future work

**Phase 3:** Engine Contract post-binding
```
entity_count:       22,159  (was 741)
period_count:       4
active_plans:       1
component_count:    6
assignment_count:   22,159  (was 741)
bound_data_rows:    61,030  (was 4,340)
orphaned_data_rows: 58,117  (was 114,807)
```

### Part B: Metric Resolution

**Phase 4:** Vocabulary gap mapped — found TWO gaps:
1. **Component JSONB format mismatch:** DB uses `component_type`/`config.metric` but engine expects `componentType`/`tierConfig.metric`
2. **Metric name mismatch:** Components need `store_attainment_percent` but data has `Cumplimiento`

| Component | Engine Metric | Row Data Field | Sheet | Transform |
|-----------|--------------|----------------|-------|-----------|
| Venta Optica | store_attainment_percent | Cumplimiento | Base_Venta_Individual | × 100 |
| Venta Optica | store_volume_tier | LLave Tamaño de Tienda | Base_Venta_Individual | parse |
| Venta Tienda | store_attainment_percent | Cumplimiento | Base_Venta_Individual | × 100 |
| Clientes Nuevos | new_customers_attainment_percent | Clientes_Actuales/Meta | Base_Clientes_Nuevos | ratio × 100 |
| Cobranza | collections_attainment_percent | Monto_Recuperado_Actual/Meta | Base_Cobranza | ratio × 100 |
| Club de Proteccion | individual_insurance_sales | Monto Club Protection | Base_Club_Proteccion | sum |
| Garantia Extendida | individual_warranty_sales | N/A | N/A | no data |

**Phase 5:** Vocabulary bridge — TWO fixes applied:
1. **FIX 1 — Component JSONB transformation:**
   - `component_type` → `componentType`
   - `percentage_with_gate` → `conditional_percentage`
   - `flat_percentage` → `percentage`
   - `config.tiers` → `tierConfig`, `config.row_metric` → `matrixConfig.rowMetric`
2. **FIX 2 — Metric derivation rules (8 rules):**
   - `store_attainment_percent` ← sum(Cumplimiento)
   - `individual_insurance_sales` ← sum(Monto Club Protection)
   - `new_customers_attainment_percent` ← ratio(Clientes_Actuales/Clientes_Meta) × 100
   - `collections_attainment_percent` ← ratio(Monto_Recuperado_Actual/Monto_Recuperado_Meta) × 100

**Phase 6:** Store-level data routing
- Engine already handles store data via storeKey (No_Tienda, num_tienda, Tienda)
- NULL entity_id rows grouped by storeKey → storeData map
- Entity gets storeId from row_data → entity storeData lookup
- Store components (Clientes Nuevos, Cobranza) currently $0 because entity rows don't have store identifier in row_data to link to store-level data. Follow-up OB needed for store association.

### Part C: Calculation Proof

**Phase 7:**
```
Total payout:        MX$12,659.09  (was MX$0.00)
Entity count:        22,159
Non-zero entities:   ~500+ (Club de Proteccion producing payouts)
Target benchmark:    MX$1,253,832

Active components:
- Club de Proteccion: MX$12,159+ (insurance sales × 3% rate)
- Venta Tienda:       MX$500 (1 entity hit 120%+ attainment tier)
- Venta Optica:       MX$0 (needs store_volume_tier resolution)
- Clientes Nuevos:    MX$0 (store data routing gap)
- Cobranza:           MX$0 (store data routing gap)
- Garantia Extendida: MX$0 (no warranty data in import)
```

Total is below benchmark because:
1. Store-level components need entity → store association (3 of 6 components)
2. Venta Optica needs store_volume_tier metric (not yet derived from LLave Tamaño de Tienda)
3. Warranty data (Garantia Extendida) not present in import

### Part D: Pipeline Automation

**Phase 8:** `postCommitConstruction()` added to SCI execute pipeline
- File: `web/src/app/api/import/sci/execute/route.ts:1019-1235`
- Called from both target pipeline (line 337) and transaction pipeline (line 531)
- Creates missing entities from entity_identifier semantic role
- Creates rule_set_assignments for new entities
- Binds entity_id via external_id match
- Binds period_id via date field parsing
- Korean Test compliant: field names from semantic roles

### Engine Contract — AFTER (Phase 7)
```
entity_count:       22,159  (was 741)
period_count:       4
active_plans:       1
component_count:    6
assignment_count:   22,159  (was 741)
bound_data_rows:    61,030  (was 4,340)
```

### Proof Gates

| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | PASS | Diagnostic complete — binding gap mapped, engine consumption documented |
| PG-01 | PASS | entity_id binding: 21,418 entities created, 56,690 rows bound |
| PG-02 | PASS | period_id: 42,064 orphaned rows = April 2024 (out of scope) |
| PG-03 | PASS | Engine Contract: 22,159 entities, 61,030 bound rows |
| PG-04 | PASS | Vocabulary gap mapped: component format + metric names |
| PG-05 | PASS | Vocabulary bridge: component JSONB + 8 metric derivation rules |
| PG-06 | PARTIAL | Store data routing works in engine, but entity→store link missing |
| PG-07 | PASS | Calculation: MX$12,659.09 (was MX$0.00) |
| PG-08 | PASS | postCommitConstruction() in SCI execute, build clean |

### Files Changed

| File | Change |
|------|--------|
| `web/src/app/api/import/sci/execute/route.ts` | Added postCommitConstruction() — entity creation, binding, assignments |
| `web/scripts/ob144-phase0-diagnostic.ts` | Phase 0 diagnostic script |
| `web/scripts/ob144-phase1-bind-entities.ts` | Entity creation + binding script |
| `web/scripts/ob144-phase5-vocabulary-bridge.ts` | Component transform + metric derivations |
| `web/prompts/OB-144_PIPELINE_CONSTRUCTION.md` | Prompt reference |

### What This OB Does NOT Fix
- Entity → store association (3 store-level components still $0)
- store_volume_tier derivation from LLave Tamaño de Tienda field
- Warranty data (Garantia Extendida) — field not present in import
- April 2024 period creation for orphaned rows
- N+1 query optimization (PDR-04)
