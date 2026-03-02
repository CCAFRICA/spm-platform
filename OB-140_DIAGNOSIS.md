# OB-140 DIAGNOSIS — Alpha Benchmark Divergence

## Root Cause

**The PPTX plan import on Feb 23 created a new "Imported Plan" rule_set with a fundamentally different component structure, then marked the original 6-component plan as archived and made itself the active rule_set.** Every calculation since Feb 23 has used the wrong plan — a generic 4-component heuristic plan instead of the proven 6-component Óptica Luminar plan.

Evidence: Architecture trace 1D, Calculation trace 3B vs 3C.

---

## Contributing Factors

### Factor 1: Wrong Rule Set Active (PRIMARY)
The "Imported Plan" (`7657fc95`) became the active rule_set, replacing the proven "Plan de Comisiones Optica Luminar 2026" (`b1b2c3d4`).

| Aspect | Original (archived) | Imported (active) |
|--------|---------------------|-------------------|
| Components | 6 (Venta Optica, Venta Tienda, Clientes Nuevos, Cobranza, Club de Proteccion, Garantia Extendida) | 4 generic (Performance Matrix, Tiered Bonus, Percentage Commission, Conditional Percentage) |
| Component structure | Array of component objects | `{type, variants}` object — not an array |
| input_bindings | 2 bindings (individual_sales, store_attainment) | Empty `{}` |
| Metric names | Specific: `store_attainment_percent`, `collections_attainment_percent`, `individual_warranty_sales` | Generic: `attainment`, `volume`, `performance`, `sales` |
| Measurement levels | Mix of `individual` + `store` | All `individual` |
| Status | `archived` | `active` |

**Evidence:** Calc trace 3B shows the imported plan's components JSON is `{type: "additive_lookup", variants: [...]}` — a heuristic structure from PPTX AI interpretation, not the hand-crafted component array. The engine reads `components` field and gets two top-level keys (`type` and `variants`) instead of an array of 6 components.

### Factor 2: Malformed Components JSON
The imported rule_set's `components` field is an object `{type, variants}` rather than an array `[...]`. The calculation engine iterates it as if it were an array, producing components named by index (`0`, `1`, `2`, `3`) instead of by business name.

**Evidence:** Calc trace 3I shows component totals as `0: MX$524,500`, `1: MX$0`, `2: MX$0`, `3: MX$0`. The engine found 4 components inside `variants[0].components[]` but they are generic heuristic components, not the actual plan.

### Factor 3: Entity Explosion (22,237 vs 719)
The SCI entity pipeline created 22,215 new entities on Feb 23 in a single hour (`2026-02-23T13`). These are NOT duplicates — each has a unique `external_id`. The original dataset has ~1,400+ unique employee IDs across all sheets (Datos Colaborador, Base_Venta_Individual, Base_Club_Proteccion, Base_Garantia_Extendida, Base_Clientes_Nuevos, Base_Cobranza). Each import of each sheet created entities for every unique identifier in that sheet, producing the 22K+ entity explosion.

**Evidence:** Architecture trace 1B shows 22,237 entities, 22,237 unique external_ids (1.0x duplication factor). Architecture trace 1C shows 22,215 created in hour `2026-02-23T13`, 22 from seed on Feb 15.

### Factor 4: Assignment Cap at 1,000
Only 1,000 rule_set_assignments exist for the imported plan. This suggests the assignment creation hit a batch limit (Supabase `.in()` cap or loop limit). Of 22,227 total entities, only 1,000 (4.5%) are assigned.

**Evidence:** Architecture trace 1E shows 1,000 assignments to `7657fc95`. Calc trace 3L confirms 988 from Feb 23 + 12 from seed.

### Factor 5: Only 1 of 4 Components Produces Payout
In the imported plan, only "Performance Matrix" (component 0) produces any payout. The other 3 components all produce MX$0 because their generic metric names (`performance`, `sales`) don't match any committed_data fields.

**Evidence:** Calc trace 3E shows trace entity: `Performance Matrix = MX$1,000`, `Tiered Bonus = MX$0` (metric `performance` = 0), `Percentage Commission = MX$0` (metric `sales` = 0), `Conditional Percentage = MX$0` (metric `sales` = 0).

### Factor 6: Metric Aggregation Corruption
The calculation engine sums ALL metrics across all committed_data rows for the entity without period filtering. The trace entity's metrics show `Año=8096` (sum of 2024×4), `storeId=5020` (sum of 1255×4), `attainment=2.24` (sum of 4 period values). This corrupts all metric-dependent calculations.

**Evidence:** Calc trace 3E metrics: `"Año": 8096, "storeId": 5020, "attainment": 2.23545610387716`.

### Factor 7: Store-Level Data Missing for New Entities
The trace entity (store 1255) has zero store-level committed_data rows. Four of the original six components depend on store-level metrics (`store_attainment_percent`, `new_customers_attainment_percent`, `collections_attainment_percent`, `store_insurance_attainment_percent`).

**Evidence:** Calc trace 3H: "Store-level rows for store 1255: 0". Architecture trace 1G shows `Base_Cobranza`, `Base_Venta_Tienda`, `Base_Clientes_Nuevos` all have NULL `entity_id` (store-level), but the store matching fails because the store ID doesn't propagate to the new entity records.

### Factor 8: Data Contamination — Multiple Import Batches
420,297 committed_data rows exist across 36 import batches. Old pipeline data (batch `46837ff1` with 43,684 rows) coexists with SCI-imported data (batch `05c3de88` with 125,591 rows), doubling data for some entities/periods.

**Evidence:** Architecture trace 1G lists 36 batches. Calc trace 3G shows the trace entity has 18 committed_data rows — 6 from batch `46837ff1` (old pipeline), 6 from batch `05c3de88` (SCI), 6 from batch `100beff7` and `763c7ca1`. Same data duplicated across batches.

---

## Diagnosis Answers

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Entity count / unique external_ids / duplication factor | 22,237 / 22,237 / 1.0x (no duplicates by external_id) | Arch 1B |
| 2 | When were extra entities created? | 22,215 on Feb 23 at 13:xx UTC, single batch (SCI import) | Arch 1C |
| 3 | What differs between duplicates? | N/A — no duplicates. 22,237 unique IDs from all sheets. | Arch 1B |
| 4 | Duplication cause | Not duplication — entity explosion from creating entities per unique ID per sheet. ~719 real employees, but IDs appear in 6+ sheets. | Arch 1B, 1C |
| 5 | Rule set count / which is used? | 2 rule_sets. "Imported Plan" (active) used for all calculations since Feb 23. | Arch 1D, Calc 3A |
| 6 | PPTX rule_set different? | Yes — completely different. 4 generic heuristic components vs 6 specific components. | Calc 3B vs 3C |
| 7 | Same components? | No. Original: 6 domain-specific. Imported: 4 generic from PPTX AI. | Calc 3B, 3C |
| 8 | input_bindings populated? | Original: yes (2 bindings). Imported: empty `{}`. | Calc 3B, 3C |
| 9 | committed_data rows / import batches | 420,297 rows / 36 batches | Arch 1G |
| 10 | Old + new data coexist? | Yes — data contamination across multiple imports. | Arch 1G, Calc 3G |
| 11 | semantic_roles on SCI data? | Not observed — sample rows show no semantic_roles field. | Arch 1G samples |
| 12 | Correct entity_id linkages? | Partially — individual-level data has entity_id, but store-level data has NULL entity_id. | Arch 1G samples, Calc 3H |
| 13 | Period count / duplicates | 8 periods, no duplicates. 7 monthly (Jan-Jul 2024) + 1 seed (Feb 2026). | Arch 1F |
| 14 | Period overlap? | No overlap. Clean canonical_keys. | Arch 1F |
| 15 | Benchmark batch exists? | Only 1 batch with original rule_set: seed batch with 12 entities, MX$42,850. The Alpha benchmark batches all used the IMPORTED rule set. | Calc 3A |
| 16 | Latest vs benchmark delta (component level) | Cannot compare directly — original and imported use completely different components. | Calc 3I |
| 17 | Which components diverge? | ALL. The imported plan's single producing component (Performance Matrix: MX$524,500) has no equivalent in the original plan. | Calc 3I |
| 18 | Trace entity metric resolution | Only `attainment` resolves (from `Cumplimiento` field sum). `performance`, `sales`, `volume` = 0. Metrics are summed across all periods. | Calc 3E |
| 19 | Deficit cause | (a) Wrong rule set, (b) Only 1 of 4 imported components produces output, (c) Missing store-level metrics, (d) Metric aggregation corruption. | All traces |
| 20 | Root cause | PPTX import created "Imported Plan" with generic heuristic components, marked original as archived, became active. ALL calculations since use wrong plan. | Calc 3A, 3B, 3C |
| 21 | Restoration requirements | 1. Reactivate original rule_set. 2. Clean duplicate committed_data. 3. Fix entity explosion. 4. Fix assignment cap. | See below |
| 22 | Fix type | (a) Data cleanup + (b) Code fix + (c) Partial re-import. | See below |

---

## Restoration Path

### Step 1: Reactivate Original Rule Set (Data Fix — Immediate)
- Set `b1b2c3d4` (Plan de Comisiones Optica Luminar 2026) status back to `active`
- Set `7657fc95` (Imported Plan) status to `archived`
- This alone should restore correct calculation for the 719 entities that have data

### Step 2: Clean Entity Table (Data Fix)
- The SCI entity pipeline created 22,215 entities but only ~719-1,438 are real employees
- Options: (a) Delete entities with no committed_data, (b) Delete entities not in the original 719, (c) Leave and fix going forward
- Recommended: Leave existing entities, fix the pipeline to deduplicate on import

### Step 3: Fix Rule Set Assignment Cap (Code Fix)
- The assignment creation loop caps at 1,000 (Supabase batch limit)
- Need to chunk assignment creation to handle >1,000 entities

### Step 4: Clean Duplicate Committed Data (Data Fix)
- 420,297 rows from 36 batches — the original dataset (~119K rows) appears to have been imported 3-4 times
- Recommend: Delete older import batches, keep the batch with period_id linkages (batch `46837ff1`)

### Step 5: Fix PPTX Import Plan Creation (Code Fix)
- The PPTX import should NOT automatically archive the existing plan and replace it
- Options: (a) Don't create a rule_set from PPTX at all, (b) Create as draft, don't auto-activate, (c) Merge PPTX interpretation into existing plan
- Recommended: Create as draft, require explicit activation

### Step 6: Fix Metric Aggregation (Code Fix — if not already correct)
- The engine appears to sum metrics across all periods for an entity
- Should only use committed_data for the specific period being calculated
- Verify: is the calculation engine filtering by period_id?

### Expected Result After Steps 1-4
- 719 entities with correct rule_set_assignments
- 6-component plan produces correct per-component payouts
- MX$1,253,832 total across 3 periods (matching Alpha benchmark)
