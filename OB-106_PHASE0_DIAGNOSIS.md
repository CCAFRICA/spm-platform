# OB-106 Phase 0: Óptica Surgical Diagnosis

## Critical Discovery: Current State Better Than Prompt Assumes

The prompt states Óptica has ~MX$525K with 3 dead components. The SQL data shows:

| Metric | Prompt Claim | Actual (SQL) |
|--------|-------------|--------------|
| Total payout | ~MX$525,000 | **MX$1,280,465** |
| Working components | 3 of 6 | **4 of 6** |
| Dead components | 3 (Insurance, Warranty, Tiered Bonus) | **2 (Insurance, Service/Warranty)** |
| Entity 93515855 | ~MX$2,200 | **MX$2,200** (confirmed) |

**R5/R6 already reconnected Store Sales, New Customers, and Collections.** The remaining gap is Insurance and Service/Warranty only.

---

## Tenant Identification

| Tenant | UUID | Latest Batch Total | Entities |
|--------|------|-------------------|----------|
| Retail Conglomerate Mexico ("Óptica") | `9b2bb4e3-6828-4451-b3fb-dc384509494f` | MX$1,280,465 | 719 |
| Pipeline Proof Co | `dfc1041e-7c39-4657-81e5-40b1cea5680c` | MX$1,253,832 | 719 |
| Pipeline Test Co | `f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd` | MX$1,262,865 | 719 |

All three have identical committed_data: 119,129 rows, 7 data_types.

---

## Entity 93515855 — Per-Component Results

| Component | RCM (Óptica) | Pipeline Proof Co | Status |
|-----------|-------------|-------------------|--------|
| Optical Sales (Non-Certified) | $1,250 | $550 | WORKING (different column metric) |
| Store Sales | $150 | $150 | WORKING |
| New Customers | $400 | $400 | WORKING |
| Collections | $400 | $400 | WORKING |
| Insurance Sales | **$0** | **$0** | DEAD (both tenants for this entity) |
| Service Sales | **$0** | **$0** | DEAD (both tenants for this entity) |
| **TOTAL** | **$2,200** | **$1,500** | |

Entity 93515855 has $0 for Insurance/Warranty in BOTH tenants because this specific entity has no data in Base_Club_Proteccion or Base_Garantia_Extendida.

---

## Entity 93515855 — committed_data by Tenant

### Retail Conglomerate Mexico
```
Datos Colaborador: 3 rows (Jan/Feb/Mar 2024)
Base_Venta_Individual: 0 rows  ← MISSING
Base_Club_Proteccion: 0 rows
Base_Garantia_Extendida: 0 rows
```

### Pipeline Proof Co
```
Datos Colaborador: 3 rows
Base_Venta_Individual: 3 rows  ← PRESENT (has optical_sales_amount, optical_achievement_percentage)
Base_Club_Proteccion: 0 rows
Base_Garantia_Extendida: 0 rows
```

Entity 93515855 gets optical data through STORE-LEVEL resolution in RCM (store 388), vs INDIVIDUAL data in PPC. This explains the $700 per-entity difference ($1,250 vs $550 for optical sales).

---

## Rule Set Comparison — The Two Dead Components

### Insurance Sales (conditional_percentage)

| Field | RCM | Pipeline Proof Co |
|-------|-----|-------------------|
| **appliedTo** | `"insurance_sales"` | `"reactivacion_club_proteccion_sales"` |
| **conditions[].metric** | `"store_goal_attainment"` | `"club_protection_achievement"` |

### Service/Warranty Sales (percentage)

| Field | RCM | Pipeline Proof Co |
|-------|-----|-------------------|
| **appliedTo** | `"warranty_sales"` | `"garantia_extendida_sales"` |
| **rate** | 0.04 | 0.04 |

---

## Root Cause: Metric Name Mismatch in Semantic Fallback

### The Data Flow (for entities WITH Insurance/Warranty data)

1. `findMatchingSheet("insurance_sales", entitySheets)` → matches `Base_Club_Proteccion` via SHEET_COMPONENT_PATTERNS (`/insurance/i`) ✅
2. `entityRows` = rows from Base_Club_Proteccion for this entity ✅
3. `entityMetrics = aggregateMetrics(entityRows)` → `{quantity: X, goal: Y, reactivacion_club_proteccion_sales: Z}` ✅
4. Expected metric: `"insurance_sales"` (appliedTo)
5. **Direct key match**: `entityMetrics["insurance_sales"]` → undefined ❌
6. **Semantic type**: `inferSemanticType("insurance_sales")` → "amount" (matches `/sales/i`)
7. **Literal semantic key**: `entityMetrics["amount"]` → undefined ❌ (no key literally called "amount")
8. **Result**: resolvedMetrics["insurance_sales"] = 0 → base amount = 0 → payout = $0

### Why Pipeline Proof Co Works

PPC uses `appliedTo: "reactivacion_club_proteccion_sales"` which EXACTLY matches the key in the data:
1. **Direct key match**: `entityMetrics["reactivacion_club_proteccion_sales"]` → Z ✅
2. No semantic fallback needed → base amount = Z → payout calculated

### The Code Path (run-calculation.ts lines 484-490)

```typescript
// Non-store metrics: entity + storeMatch ONLY (no aggregated store fallback)
resolvedMetrics[metricName] =
  entityMetrics[semanticType] ??     // looks for literal key "amount" — FAILS
  storeMatchMetrics[semanticType] ?? // looks for literal key "amount" — FAILS
  0;                                  // falls to 0
```

The semantic fallback only checks for a literal key matching the semantic TYPE NAME (e.g., `metrics["amount"]`). It does NOT search all keys for ones whose inferred semantic type matches. The data has `reactivacion_club_proteccion_sales` which would infer to "amount" via `/sales/i`, but the code never looks for it.

### Same Issue for Warranty

- `appliedTo: "warranty_sales"` → semantic: "amount" → `entityMetrics["amount"]` → undefined
- Data key: `garantia_extendida_sales` → would infer "amount" but is never checked

---

## Disconnection Points

### Component "Insurance Sales" (conditional_percentage):
- Data exists in committed_data: YES (56,237 rows of Base_Club_Proteccion)
- Data reaches entity sheet matching: YES (findMatchingSheet works via `/insurance/i`)
- Data reaches metric aggregation: YES (aggregateMetrics produces correct keys)
- Engine finds expected metric: **NO** ← BREAK POINT
- **File**: `web/src/lib/calculation/run-calculation.ts`
- **Function**: `buildMetricsForComponent()`
- **Lines**: 484-490 (non-store semantic fallback)
- **Bug**: Semantic fallback checks `entityMetrics["amount"]` but the key is `reactivacion_club_proteccion_sales`

### Component "Service Sales" (percentage):
- Data exists in committed_data: YES (34,952 rows of Base_Garantia_Extendida)
- Data reaches entity sheet matching: YES (findMatchingSheet works via `/service/i` → `/garantia.*extendida/i`)
- Data reaches metric aggregation: YES (aggregateMetrics produces correct keys)
- Engine finds expected metric: **NO** ← BREAK POINT
- **Same file, function, lines as Insurance**
- **Bug**: Semantic fallback checks `entityMetrics["amount"]` but the key is `garantia_extendida_sales`

---

## Impact Assessment

### What the fix will change at aggregate level:
- Insurance: $0 → ~$10 (population mismatch: only 8/18,369 entities overlap with optometrist roster — known limitation from OB-88)
- Warranty: $0 → ~$67,000 (population mismatch: only 8/11,695 Vendedor IDs match — known limitation from OB-88)
- Total: MX$1,280,465 → ~MX$1,347,000

### What will NOT change:
- Optical Sales: unchanged (uses store-prefixed metric path, not affected)
- Store Sales: unchanged (uses store-prefixed metric path)
- New Customers: unchanged (uses store-prefixed metric path)
- Collections: unchanged (uses store-prefixed metric path)
- Pipeline Test Co: unchanged (already uses correct metric names)

### Performance Matrix Safety:
- Performance Matrix uses `store_optical_sales` (store-prefixed) and `optical_attainment` (attainment type)
- Neither goes through the non-store semantic fallback path being fixed
- **ZERO risk to Performance Matrix**

---

## Accuracy Forecast

| | Before Fix | After Fix | Benchmark |
|--|-----------|----------|-----------|
| Total | MX$1,280,465 | ~MX$1,347,000 | MX$1,253,832 |
| Delta | +2.1% | ~+7.4% | 0% |

Note: The delta INCREASES slightly because the Insurance/Warranty population mismatches add non-zero amounts that are LESS than the benchmark values. The Optical Sales column metric difference (store aggregate vs individual) also contributes. These are rule_set configuration differences, not code bugs.

---

## Population Mismatch (Known Limitation — OB-88)

Even after this fix, Insurance and Warranty will produce much less than the benchmark because:
- **Insurance**: Base_Club_Proteccion has 18,369 unique employees (mostly non-optometrist store staff). Only 8 match the 719-entity optometrist roster. No store column exists for aggregation.
- **Warranty**: Base_Garantia_Extendida uses `Vendedor` IDs (sales associates) not `num_empleado` (optometrists). Only 8 of 11,695 match.

This is a **data architecture limitation**, not a code bug. Fixing it would require either:
1. Store-level aggregation for Insurance/Warranty (but data lacks store column)
2. Cross-reference tables mapping Vendedor → num_empleado (not available)
