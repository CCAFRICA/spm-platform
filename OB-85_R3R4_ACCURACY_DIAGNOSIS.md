# OB-85 R3/R4 Phase 0: Accuracy Diagnosis — Entity 93515855

## Entity 93515855: VL = MX$8,996,204 vs Benchmark = MX$4,650

---

## 0A: Raw Data

**Entity UUID**: `01af13e6-384d-4ef5-b3b1-c55171bfe846` (external_id: 93515855)
**Store**: 388
**Role**: OPTOMETRISTA NO CERTIFICADO

### Sheet: Datos Colaborador (entity-level)
```json
{
  "role": "OPTOMETRISTA  NO CERTIFICADO",
  "Puesto": "OPTOMETRISTA  NO CERTIFICADO",
  "storeId": 388,
  "entityId": 93515855,
  "No_Tienda": 388,
  "num_empleado": 93515855
}
```

### Sheet: Base_Venta_Individual (entity-level, via UUID ec3153e0 consolidated)
```json
{
  "goal": 140000,
  "amount": 163136,
  "attainment": 1.16525714285714,
  "Cumplimiento": 1.16525714285714,
  "Meta_Individual": 140000,
  "Venta_Individual": 163136,
  "num_tienda": 388,
  "entityId": 93515855
}
```

### Insurance data (Base_Club_Proteccion): **0 rows** — entity has NO insurance data
### Warranty data (Base_Garantia_Extendida): **0 rows** — entity has NO warranty data

### Store-level data (entity_id=NULL) for store 388:

| Sheet | Key Fields |
|-------|-----------|
| Base_Venta_Tienda | amount=44,765,378, goal=44,079,293, attainment≈101.6% |
| Base_Clientes_Nuevos | Clientes_Actuales=543, Clientes_Meta=358, attainment≈151.7% |
| Base_Cobranza | Monto_Recuperado_Actual=55,150,225, Monto_Recuperado_Meta=30,636,527, attainment≈180.0% |

---

## 0B: VL Calculation Results (per component)

| Component | Type | Payout | Key Metric | Value Used |
|-----------|------|--------|-----------|------------|
| Optical Sales - Certified | matrix_lookup | MX$2,500 | optical_attainment=116.5%, store_optical_sales=**99,915,603** | **WRONG variant + WRONG store value** |
| Store Sales | tier_lookup | MX$500 | store_sales_attainment=133.7% | **WRONG** (should be 101.6% from Base_Venta_Tienda) |
| New Customers | tier_lookup | MX$400 | new_customers_attainment=151.7% | Correct (from Base_Clientes_Nuevos) |
| Collections | tier_lookup | MX$400 | collections_attainment=180.0% | Correct (from Base_Cobranza) |
| Insurance Sales | conditional_percentage | **MX$4,995,780** | insurance_sales=**99,915,603** × 0.05 | **BUG: uses aggregated store total** |
| Service Sales | percentage | **MX$3,996,624** | warranty_sales=**99,915,603** × 0.04 | **BUG: uses aggregated store total** |
| **TOTAL** | | **MX$8,996,204** | | |

---

## 0C: Benchmark Value

Entity 93515855: **MX$4,650** (from reconciliation benchmark file)

---

## 0D: Rule Set Components

Rule set: RetailCorp Optometrist Incentive Plan (`04edaaf0`)
Type: additive_lookup, **2 variants** (certified / non_certified), 6 components each.

| Component | Type | Expected Metrics | Formula |
|-----------|------|-----------------|---------|
| Optical Sales | matrix_lookup | optical_attainment, store_optical_sales | Matrix[attainment_band][store_sales_band] → fixed payout |
| Store Sales | tier_lookup | store_sales_attainment | Tier → {<100%: $0, 100-105%: $150, 105-110%: $300, ≥110%: $500} |
| New Customers | tier_lookup | new_customers_attainment | Tier → {<100%: $0, ... ≥125%: $400} |
| Collections | tier_lookup | collections_attainment | Tier → {<100%: $0, ... ≥125%: $400} |
| Insurance Sales | conditional_percentage | insurance_sales, store_goal_attainment | insurance_sales × rate (3% if <100%, 5% if ≥100%) |
| Service Sales | percentage | warranty_sales | warranty_sales × 0.04 |

**Variant differences (Certified vs Non-Certified matrix):**
| Band | Certified [row3][col4] | Non-Certified [row3][col4] |
|------|----------------------|---------------------------|
| 100-150% attainment, ≥$180K store | MX$2,500 | MX$1,250 |

---

## 0E: Manual Calculation

**Using Non-Certified variant** (entity role = "OPTOMETRISTA NO CERTIFICADO"):

| Component | Input | Calculation | Expected Payout |
|-----------|-------|-------------|----------------|
| Optical Sales (Non-Cert) | attainment=116.5% (row 3), store_sales=44,765,378 (col 4: ≥$180K) | matrix[3][4] = 1250 | **MX$1,250** |
| Store Sales | store_attainment=101.6% (44.7M/44.1M) | Tier: 100-105% → $150 | **MX$150** |
| New Customers | attainment=151.7% (543/358) | Tier: ≥125% → $400 | **MX$400** |
| Collections | attainment=180.0% (55.15M/30.64M) | Tier: ≥125% → $400 | **MX$400** |
| Insurance Sales | Entity has NO insurance data → base=0 | 0 × 0.05 = 0 | **MX$0** |
| Service Sales | Entity has NO warranty data → base=0 | 0 × 0.04 = 0 | **MX$0** |
| **TOTAL** | | | **MX$2,200** |

Benchmark says MX$4,650. The MX$2,450 gap likely comes from:
- Entity 93515855 may have insurance/warranty data in the benchmark's source system that wasn't imported
- Or the benchmark uses a different variant/formula not captured here
- Or the benchmark includes other pay elements beyond these 6 components

The critical fix is getting VL from MX$8,996,204 → order of magnitude MX$2,200-4,650 (not MX$9M).

---

## 0F: ROOT CAUSE ANALYSIS

### BUG 1 (CRITICAL — 1000× payout inflation): Aggregated Store Context

**Code**: `run-calculation.ts:389-401` (storeContext), `run-calculation.ts:447-454` (fallback)

The `storeContext` aggregates ALL store sheets (Base_Venta_Tienda + Base_Clientes_Nuevos + Base_Cobranza) into ONE metrics bag by summing all numeric fields:

```
storeContext["amount"] = 44,765,378 (tienda) + 0 (clientes) + 55,150,225 (cobranza) = 99,915,603
```

When `insurance_sales` and `warranty_sales` can't be found by exact name, semantic resolution falls back to `storeContext["amount"]` = 99,915,603.

**Result**: insurance_sales = 99,915,603 × 0.05 = MX$4,995,780 (should be $0 or entity's insurance amount)
**Result**: warranty_sales = 99,915,603 × 0.04 = MX$3,996,624 (should be $0 or entity's warranty amount)

**Fix**: Remove aggregated storeContext. For non-store metrics, only use entity data. For store metrics, use per-sheet resolution.

### BUG 2 (SIGNIFICANT — wrong variant): No Variant Selection

**Code**: `run-calculation.ts:502-503`

```typescript
const defaultVariant = variants[0]; // ALWAYS uses certified
```

172 of 719 entities are "OPTOMETRISTA NO CERTIFICADO" but ALL use the certified variant matrix. This gives $2,500 instead of $1,250 for the Optical Sales component (2× overcount).

**Fix**: Match entity's role against variant names. Use the matched variant's components.

### BUG 3 (MODERATE — cross-metric contamination): store_sales_attainment uses wrong sheet

The `store_sales_attainment` metric (133.7%) comes from the aggregated storeContext. The actual store sales attainment from Base_Venta_Tienda alone is 101.6% (44.7M/44.1M). The inflated 133.7% pushes entities into the ≥110% tier ($500) when they should be in the 100-105% tier ($150).

**Fix**: Same as Bug 1 — use per-sheet store resolution instead of aggregated storeContext.

---

## 0G: Batch Statistics

| Metric | Current (BROKEN) | Expected (FIXED) |
|--------|-----------------|-------------------|
| Total payout | MX$1,567,090,811 | ~MX$3-5M |
| Avg per entity | MX$2,179,542 | ~MX$4,000-7,000 |
| Max payout | MX$8,996,204 | ~MX$10,000 |
| Min payout (non-zero) | MX$2,877 | ~MX$150 |
| Entity 93515855 | MX$8,996,204 | ~MX$2,200-4,650 |

---

## FIX PLAN

### Fix 1: Per-Sheet Store Resolution (replaces aggregated storeContext)

Replace the single aggregated `storeContext` with per-sheet store metrics. For each metric:
- Non-store metrics: only entity + component-matched store sheet (no aggregated fallback)
- Store metrics: match metric name against SHEET_COMPONENT_PATTERNS to find specific store sheet

### Fix 2: Variant Selection

Match entity role against variant names:
- Entity "OPTOMETRISTA CERTIFICADO" → variant "Optometrista Certificado"
- Entity "OPTOMETRISTA NO CERTIFICADO" → variant "Optometrista No Certificado"
- Default to first variant if no match

### Expected Impact

| Change | Before | After |
|--------|--------|-------|
| Insurance/warranty base | 99,915,603 (aggregated) | Entity's actual insurance/warranty or 0 |
| store_optical_sales | 99,915,603 (aggregated) | 44,765,378 (Base_Venta_Tienda only) |
| store_sales_attainment | 133.7% (aggregated) | 101.6% (Base_Venta_Tienda only) |
| Non-certified matrix payout | $2,500 (certified) | $1,250 (non-certified) |
| Total payout | MX$1.57B | ~MX$3-5M |
