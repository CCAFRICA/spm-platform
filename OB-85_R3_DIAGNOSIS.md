# OB-85 R3 Phase 0: Surgical Diagnosis — Why Attainment=212% Produces Payout=$0

## Traced Entity: 96568046 (Tenant: 9b2bb4e3)

---

## 0B: Entity Record

Entity 96568046 exists in 4 tenants with **different UUIDs per tenant**:
| Tenant | Entity UUID | External ID |
|--------|------------|-------------|
| 9b2bb4e3 | `1ee5d8f3-02b5-426e-a7d8-c1758003305c` | 96568046 |
| a1b2c3d4 | `f93fdc94-466d-473e-8e44-da1db7453a93` | 96568046 |
| c11ca8de | `665abc69-4feb-4ff2-befe-12136e4a9645` | 96568046 |
| f0f0f0f0 | `6e7ea1a7-c6ff-43d9-b83e-dae68486cbd1` | 96568046 |

## 0A: Committed Data for Entity 96568046 (Jan 2024)

Entity UUID `1ee5d8f3` has **3 rows** in committed_data for Jan 2024:

| Sheet | Key Fields | import_batch_id |
|-------|-----------|-----------------|
| Datos Colaborador | role=OPTOMETRISTA CERTIFICADO, storeId=1, entityId=96568046 | e0d3f09b |
| Base_Club_Proteccion | goal=5, amount=84, quantity=4 | e0d3f09b |
| Base_Garantia_Extendida | amount=600.93 | e0d3f09b |

**CRITICAL: Base_Venta_Individual is MISSING from this entity UUID.**

Sample Base_Venta_Individual row (entity UUID `30918fb4`):
```json
{
  "entityId": 96568046,
  "attainment": 1.351,
  "goal": 74410,
  "amount": 100560,
  "Cumplimiento": 1.351,
  "Venta_Individual": 100560,
  "Meta_Individual": 74410
}
```

**Same employee number (96568046), DIFFERENT entity UUID (`30918fb4`).** The import created a separate entity record for Base_Venta_Individual.

## 0C: Calculation Results

**EMPTY** — no calculation_results exist for entity `1ee5d8f3`.

## 0D: Rule Set Components

Rule set: "RetailCorp Optometrist Incentive Plan" (ID: `04edaaf0`)
Type: additive_lookup, 2 variants (certified / non_certified), 6 components each.

**Certified variant components and expected metrics:**
| Component | Type | Expected Metrics |
|-----------|------|-----------------|
| Optical Sales Incentive - Certified | matrix_lookup | optical_attainment, store_optical_sales |
| Store Sales Incentive | tier_lookup | store_sales_attainment |
| New Customers Incentive | tier_lookup | new_customers_attainment |
| Collections Incentive | tier_lookup | collections_attainment |
| Insurance Sales Incentive | conditional_percentage | insurance_sales, store_goal_attainment |
| Service Sales Incentive | percentage | warranty_sales |

## 0E: Import Batch Metadata

Import batch `e0d3f09b`:
- File: BacktTest_Optometrista_mar2025_Proveedores.xlsx
- Rows: 119,129
- Status: completed
- **Metadata: EMPTY** — no `ai_context.sheets` mapping

## 0F: All Sheets in Jan 2024

| Sheet | Rows | Level |
|-------|------|-------|
| Datos Colaborador | 719 | entity |
| Base_Venta_Tienda | 37 | store (NULL entity_id) |
| Base_Venta_Individual | 244 | entity |

Only **244 of 719** entities have Base_Venta_Individual data (the main attainment/sales sheet).

## 0G: Working Calculation Comparison

Working batch `7d4b3919` (tenant c11ca8de, 5 entities, $58,250 total):
```
Entity f81e2a6e: metrics={"units":45,"amount":150000,"attainment":1.15} → payout=$12,500
  - Sales Commission: $7,500 (percentage: 150000 * 0.05)
  - Attainment Bonus: $5,000 (tier: attainment=1.15 → "At Target")
```

**Key difference**: Working data has ONE entity UUID per employee with ALL data in flat metrics. No sheet matching needed — all metrics in one place.

---

## ROOT CAUSE ANALYSIS

### Root Cause 1: Entity UUID Fragmentation (PRIMARY)

The import creates **separate entity UUIDs per sheet** for the same employee.
- UUID `1ee5d8f3` → Datos Colaborador + Base_Club_Proteccion + Base_Garantia_Extendida
- UUID `30918fb4` → Base_Venta_Individual

The `rule_set_assignments` table only references `1ee5d8f3`. When the calculation engine fetches data for this entity, it **never sees Base_Venta_Individual** (which contains attainment, amount, goal — the critical sales metrics).

**Code path** (`route.ts:195-229`): Groups committed_data by `entity_id`. Each UUID gets its own data silo. No cross-UUID merge.

### Root Cause 2: Missing AI Import Context (SECONDARY)

Import batch `e0d3f09b` has **empty metadata** — no `ai_context.sheets` mapping.

**Code path** (`route.ts:261-298`): Loads AI context from `import_batches.metadata`. Gets `[]`. Falls through to fallback.

### Root Cause 3: Sheet-to-Component Matching Failure (TERTIARY)

Without AI context, `findMatchingSheet()` falls back to **direct substring matching**:
- `"optical_sales_incentive_certified"` vs `"datos_colaborador"` → NO MATCH
- `"optical_sales_incentive_certified"` vs `"base_club_proteccion"` → NO MATCH
- etc.

The `SHEET_COMPONENT_PATTERNS` table (metric-resolver.ts:248-282) has Spanish↔English patterns that WOULD match:
- `/optical.*sales/i` → `/venta.*individual/i` → "Base_Venta_Individual"
- `/store.*sales/i` → `/venta.*tienda/i` → "Base_Venta_Tienda"
- `/insurance/i` → `/club.*proteccion/i` → "Base_Club_Proteccion"
- `/service/i` → `/garantia.*extendida/i` → "Base_Garantia_Extendida"

**BUT these patterns are only checked inside `findSheetForComponent()` which iterates over `aiContextSheets` (empty!), NOT over `availableSheets`.**

**Code path** (`run-calculation.ts:281-310`):
1. `findSheetForComponent()` with empty AI context → null
2. Direct name match: "optical_sales_incentive_certified" ⊄ "datos_colaborador" → null
3. Return null → `relevantRows = []` → `return {}` → **metrics = {}** → **payout = $0**

### Root Cause 4: Single-Source Metric Resolution (TERTIARY)

Even if sheet matching worked, `buildMetricsForComponent()` uses ONE sheet per component. The matrix_lookup component needs BOTH:
- Individual attainment from Base_Venta_Individual (entity-level)
- Store sales from Base_Venta_Tienda (store-level, entity_id=NULL)

The current code tries entity sheets first, then falls back to store — but never merges both.

---

## FIX PLAN

### Fix 1: Entity Data Consolidation (`route.ts`)
After grouping committed_data by entity_id, merge data from sibling entity UUIDs that share the same `external_id`. This gives each assigned entity access to ALL their data sheets.

### Fix 2: Pattern-Based Sheet Matching (`run-calculation.ts:findMatchingSheet`)
When AI context is empty and direct name matching fails, use `SHEET_COMPONENT_PATTERNS` directly against `availableSheets` (not through `findSheetForComponent` which requires AI context).

### Fix 3: Source-Aware Metric Resolution (`run-calculation.ts:buildMetricsForComponent`)
- Match entity sheet AND build store context independently
- During semantic resolution, prefer store data for "store_"-prefixed metrics
- Compute attainment per source independently to prevent cross-source contamination

### Expected Result After Fix
For entity 96568046 (store 1):
| Component | Source | Metrics | Payout |
|-----------|--------|---------|--------|
| Optical Sales | Individual + Store context | attainment=135.1%, store_sales=11.3M | ~MX$2,500 |
| Store Sales | Store | attainment=62.2% (<100%) | MX$0 |
| New Customers | No data | — | MX$0 |
| Collections | No data | — | MX$0 |
| Insurance | Individual + Store context | base=84, store_attainment=62.2% | ~MX$2.52 |
| Service | Individual | warranty_amount=600.93 | ~MX$24.04 |
| **TOTAL** | | | **~MX$2,527** |
