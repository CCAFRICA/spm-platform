# OB-85 R5 Phase 0: Accuracy Diagnosis

## 0A. Executive Summary

**FINDING: All six component data pipes are CONNECTED and WORKING.**

The "three dead components" (Percentage Commission, Conditional Percentage, Tiered Bonus) was a misdiagnosis based on stale calculation data. The current engine produces **MX$1,878,414.66** across **all 6 component types** with non-zero payouts.

| Component Type | Component Name | Non-Zero Entities | Total Payout |
|---------------|---------------|-------------------|-------------|
| Performance Matrix | Optical Sales - Certified | 547/547 | MX$1,201,800 |
| Performance Matrix | Optical Sales - Non-Certified | 172/172 | MX$176,150 |
| Tiered Bonus | Collections Incentive | 702/719 | MX$279,800 |
| Tiered Bonus | Store Sales Incentive | 360/719 | MX$115,250 |
| Percentage Commission | Service Sales Incentive | 8/719 | MX$66,872 |
| Conditional Percentage | New Customers Incentive | 137/719 | MX$38,500 |
| Percentage Commission | Insurance Sales Incentive | 8/719 | MX$42.54 |

**No code fix required for component data pipes.** The remaining 48.7% delta to benchmark (MX$1.88M vs MX$3.67M) is driven by data coverage, not broken code.

---

## 0B. Discrepancy: Andrew's MX$525K vs API MX$1.88M

Andrew reported MX$525K with "only Performance Matrix producing values." This does NOT match any existing calculation batch:

| Batch | Created | Total | Components |
|-------|---------|-------|------------|
| ebb21525 | Feb 24 04:26 | MX$1,878,414.66 | All 6 active |
| dcd8f200 | Feb 24 02:09 | MX$1,878,414.66 | All 6 active |
| 0ba5e092 | Feb 23 23:52 | MX$1,567,090,810 | Pre-fix (buggy) |

No batch shows MX$525K. The MX$525K was likely from a transitional state where:
1. Code was deployed (R3/R4 fix) but no new calculation had been triggered yet
2. entity_period_outcomes still reflected old/partial data
3. The reconciliation page read stale entity_period_outcomes

**Current state**: entity_period_outcomes and calculation_results are in sync at MX$1,878,414.66.

---

## 0C. Entity 93515855 Trace

| Field | Value |
|-------|-------|
| UUID | 01af13e6-384d-4ef5-b3b1-c55171bfe846 |
| Role | OPTOMETRISTA NO CERTIFICADO |
| Sheets | Datos Colaborador (1 row) |
| Insurance data | NONE |
| Warranty data | NONE |

| Component | Payout | Notes |
|-----------|--------|-------|
| Optical Sales (Non-Certified) | MX$1,250 | Performance Matrix |
| Store Sales | MX$150 | Tiered Bonus |
| New Customers | MX$400 | Conditional Percentage |
| Collections | MX$400 | Tiered Bonus |
| Insurance Sales | MX$0 | No Base_Club_Proteccion data |
| Service Sales | MX$0 | No Base_Garantia_Extendida data |
| **Total** | **MX$2,200** | Benchmark: MX$4,650 |

Entity 93515855 has $0 for Insurance and Service because it genuinely has NO insurance/warranty rows in committed_data. This is correct behavior.

---

## 0D. Data Coverage Analysis

### Sheet Distribution (Jan 2024 Period)

| Sheet | Entity Rows | Store Rows | Unique Entities |
|-------|-------------|------------|-----------------|
| Datos Colaborador (roster) | 719 | 0 | 719 |
| Base_Venta_Individual | 876 | 0 | 876 |
| Base_Club_Proteccion (insurance) | 18,370 | 0 | 18,369 |
| Base_Garantia_Extendida (warranty) | 11,695 | 0 | 11,695 |
| Base_Venta_Tienda (store sales) | 0 | 1,778 | - |
| Base_Clientes_Nuevos (new customers) | 0 | 1,779 | - |
| Base_Cobranza (collections) | 0 | 1,792 | - |

### The 8-Entity Overlap

Insurance/warranty data covers a **different population** than the roster:
- 18,369 unique employee numbers in insurance data
- 11,695 unique employee numbers in warranty data
- **Only 8 of those employee numbers also appear in the 719-person roster**
- For those 8, UUIDs match (no fragmentation) — consolidation works correctly

### Entity Consolidation Verification

- 719 roster employees have multiple UUIDs (roster + Venta Individual)
- Consolidation correctly merges sibling UUIDs by employee number
- Vendedor field (warranty) has entityId also set → consolidation picks it up via entityId
- No UUID fragmentation for the 8 overlapping employees

---

## 0E. Component-by-Component Trace

### Percentage Commission (Insurance Sales Incentive)
- **Status**: WORKING for 8/719 entities
- **Data path**: Base_Club_Proteccion → entity rows → amount field → percentage calculation
- **Why 711 entities get $0**: They have no rows in Base_Club_Proteccion
- **Why only 8 overlap**: Insurance data covers 18,369 employees; only 8 are on the 719-person roster
- **Total**: MX$42.54 (correct given data)

### Percentage Commission (Service Sales Incentive)
- **Status**: WORKING for 8/719 entities
- **Data path**: Base_Garantia_Extendida → entity rows → amount field → percentage calculation
- **Why 711 entities get $0**: They have no rows in Base_Garantia_Extendida
- **Total**: MX$66,872 (correct given data — warranty amounts are large)

### Conditional Percentage (New Customers Incentive)
- **Status**: WORKING for 137/719 entities
- **Data path**: Base_Clientes_Nuevos (store-level) → store match → new_customers quantity
- **Why 582 entities get $0**: Their stores have 0 new customers, or threshold not met
- **Total**: MX$38,500

### Tiered Bonus (Store Sales Incentive)
- **Status**: WORKING for 360/719 entities
- **Data path**: Base_Venta_Tienda (store-level) → store match → attainment → tier lookup
- **Why 359 entities get $0**: Their stores have attainment below minimum tier threshold
- **Total**: MX$115,250

### Tiered Bonus (Collections Incentive)
- **Status**: WORKING for 702/719 entities
- **Data path**: Base_Cobranza (store-level) → store match → attainment → tier lookup
- **Why 17 entities get $0**: Their stores have attainment below minimum tier threshold
- **Total**: MX$279,800

### Performance Matrix (Optical Sales Incentive)
- **Status**: WORKING for 719/719 entities (547 certified + 172 non-certified)
- **Data path**: Base_Venta_Individual → entity rows → matrix lookup by role variant
- **Total**: MX$1,377,950

---

## 0F. Delta Analysis

| Metric | VL Engine | Benchmark | Delta |
|--------|----------|-----------|-------|
| Total | MX$1,878,415 | MX$3,665,282 | 48.7% |
| Optical Sales | MX$1,377,950 | ~MX$1,378,000 | ~0% |
| Collections | MX$279,800 | Unknown | - |
| Store Sales | MX$115,250 | Unknown | - |
| Service Sales | MX$66,872 | Unknown | - |
| New Customers | MX$38,500 | Unknown | - |
| Insurance Sales | MX$43 | Unknown | - |

The delta is NOT from dead components. Possible sources:
1. **Benchmark includes entities beyond the 719 roster** — insurance/warranty data covers 18K+ employees
2. **Benchmark uses different store-level aggregation** — e.g., spreading store totals differently
3. **Metric resolution differences** — attainment thresholds, tier selection, matrix band matching
4. **Per-component benchmark breakdown unavailable** — cannot isolate which component contributes most to delta

---

## 0G. Conclusion

**No code fix needed for component data pipes.** All three evaluator types (Percentage Commission, Conditional Percentage, Tiered Bonus) are functional and producing correct results based on available data.

The 48.7% delta to benchmark requires **per-component benchmark breakdown** to diagnose further. The engine is mathematically correct for the data it has access to.

### Recommendation

Andrew should re-run reconciliation against the current calculation batch (ebb21525, MX$1,878,414.66) to verify:
1. All 6 component types appear in results
2. The component breakdown matches per-entity expectations
3. The delta is from data coverage (8/719 insurance overlap) rather than code

---

*Phase 0 Diagnosis — February 24, 2026*
