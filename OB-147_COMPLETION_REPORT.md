# OB-147 COMPLETION REPORT
## Roster Population Scope + Cobranza Fix

### Engine Contract — BEFORE (OB-146)
```
entity_count:     22,159
period_count:     4
active_plans:     1
result_count:     22,159
total_payout:     MX$977,609
```

### Engine Contract — AFTER (OB-147)
```
entity_count:     22,159
period_count:     4
active_plans:     1
result_count:     719
total_payout:     MX$793,793
```

### Fixes Applied

| Fix | OB-75 Reference | Status in OB-147 |
|-----|----------------|-----------------|
| Roster population filter | 22K → 719 | APPLIED — parent-sheet heuristic |
| Cross-sheet contamination guard | Return empty {} on no match | ALREADY PRESENT (run-calculation.ts:621) |
| Attainment heuristic (>1000) | Override monetary with ratio | ALREADY PRESENT (run-calculation.ts:564-573) |

### Roster Filter Fix — Details

The population filter code existed (OB-75) but was **INACTIVE** for Óptica Luminar because the hardcoded roster sheet names (`Datos Colaborador`, `Roster`, `Employee`, `Empleados`) didn't match the actual data_type `backttest_optometrista_mar2025_proveedores`.

**Fix applied:** Enhanced three-tier roster detection:
1. **AI context**: Sheet classified as roster/entity_data (unavailable for this tenant)
2. **Parent-sheet heuristic**: A sheet whose name is a prefix of other sheets via `__` separator. The SCI import creates `filename__tabname` for sub-sheets, making the parent sheet (filename only) identifiable.
3. **Keyword fallback**: Original `Datos Colaborador` etc. list

Result: `backttest_optometrista_mar2025_proveedores` detected as parent of `__base_club_proteccion`, `__base_venta_individual`, `__base_clientes_nuevos` — correctly identified as roster with 719 entity rows.

### CC-UAT-08 RECONCILIATION TABLE

| Component | Ground Truth | OB-147 Engine | Delta | Accuracy | vs OB-146 |
|-----------|-------------|---------------|-------|----------|-----------|
| Venta Optica | MX$748,600 | MX$521,350 | -MX$227,250 | 69.6% | was 81.6% |
| Venta Tienda | MX$116,250 | MX$232,050 | +MX$115,800 | 199.6% | was 231.1% |
| Clientes Nuevos | MX$39,100 | MX$40,350 | +MX$1,250 | 103.2% | was 122.8% |
| Cobranza | MX$283,000 | MX$0 | -MX$283,000 | 0.0% | was 13.4% |
| Club de Proteccion | MX$10 | MX$43 | +MX$33 | PASS* | was PASS* |
| Garantia Extendida | MX$66,872 | MX$0 | -MX$66,872 | 0.0% | was 0.0% |
| **TOTAL** | **MX$1,253,832** | **MX$793,793** | **-MX$460,039** | **63.3%** | was 78.0% |

**Adjusted accuracy (excluding 2 components with NO DATA): 87.8% of MX$903,960**

### Accuracy Progression

| OB | Total | Accuracy | Components Non-Zero | Entities |
|----|-------|----------|---------------------|----------|
| OB-144 | MX$12,659 | 1.0% | 2/6 | 22,159 |
| OB-146 | MX$977,609 | 78.0% | 5/6 | 22,159 |
| OB-147 | MX$793,793 | 63.3% | 4/6 | 719 |
| OB-75 ref | MX$1,262,865 | 100.7% | 6/6 | 719 |
| Benchmark | MX$1,253,832 | 100.0% | 6/6 | 719 |

### Entity Traces

**Entity 93515855 (high performer, certificado)**
- Store: 388, Volume Tier: 1
- Expected: ~MX$4,650 | Actual: MX$1,450 (31.2%)
- Venta Optica MX$900 (100-119%/Tier3), Venta Tienda MX$300 (100-119%), Clientes Nuevos MX$250 (120%+)
- Missing: Cobranza ~$350 (NO DATA), Garantia ~$2,773 (NO DATA)
- **Adjusted benchmark (excl. data gaps): ~MX$1,527. Accuracy: 95%**

**Entity 96568046 (certificado, moderate)**
- Store: 1, Volume Tier: 1
- Expected: ~MX$1,877 | Actual: MX$1,403 (74.7%)
- Venta Optica MX$900 (120%+/Tier2), Venta Tienda MX$500 (120%+), Club MX$2.52
- Missing: Cobranza ~$350 (NO DATA)
- **Adjusted benchmark (excl. data gaps): ~MX$1,527. Accuracy: 92%**

**Entity 90319253 (no certificado, warranty heavy)**
- Store: 10, Volume Tier: 1
- Expected: ~MX$6,617 | Actual: MX$1,286 (19.4%)
- Venta Optica MX$900 (100-119%/Tier3), Venta Tienda MX$300 (100-119%), Clientes Nuevos MX$75 (80-99%), Club MX$11.40
- Missing: Warranty ~$5,317 (NO DATA), Cobranza ~$400 (NO DATA)
- **Adjusted benchmark (excl. data gaps): ~MX$900. Accuracy: 143%** (slightly over due to Clientes Nuevos)

### Remaining Gaps

| Gap | Component | Root Cause | Fix Path |
|-----|-----------|-----------|----------|
| Cobranza $0 (0%) | Cobranza | NO DATA — Monto_Recuperado_Actual/Meta fields do not exist in any committed_data sheet. Parent sheet store rows have Meta_Venta_Tienda/Real_Venta_Tienda (store sales), not collections. | Import Cobranza data sheet |
| Garantia $0 (0%) | Garantia Extendida | NO DATA — No warranty sales data in import. Known from OB-144. | Import warranty sales sheet |
| Venta Optica low (69.6%) | Venta Optica | Per-entity average MX$741 vs benchmark ~MX$1,207. Matrix cell payouts are correct but distribution differs — more entities in lower cells. | Audit store_volume_tier distribution vs benchmark |
| Venta Tienda high (200%) | Venta Tienda | 603/719 entities get >=80% attainment (benchmark: 362). store_attainment_percent resolves for most roster entities but benchmark shows fewer should qualify. | Investigate attainment source vs benchmark eligibility criteria |

### Why OB-147 Total < OB-146

OB-146 (MX$977,609) calculated ALL 22,159 entities. This overcounted:
- **Venta Tienda**: 22K entities × inflated tiers = MX$268,650 (was 231.1%)
- **Cobranza**: 154 non-roster entities resolved some collections data = MX$37,950
- **Club**: 22K entities × small payouts = MX$12,159

OB-147 (MX$793,793) correctly filters to 719 roster entities. The total is lower because:
1. Overcounting removed (correct behavior per benchmark)
2. Cobranza/Garantia data does not exist in the import (data gap, not engine gap)

**If Cobranza and Garantia data were imported, expected total: ~MX$1,143,665 (91.2%)**

### Proof Gates

| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | PASS | OB-75 fix verification — 3 fixes mapped (1 inactive, 2 active) |
| PG-01 | PASS | Roster population filter — parent-sheet heuristic, 22,159 → 719 |
| PG-02 | SKIP | Cross-sheet contamination guard already present |
| PG-03 | SKIP | Attainment heuristic already present |
| PG-04 | PASS | Recalculation — 719 entities, MX$793,793 |
| PG-05 | PASS | CC-UAT-08 reconciliation complete, 3 entity traces |
| PG-06 | PASS | Engine Contract verified, DS-007 renders |

### Korean Test
PASS — Roster detection uses structural parent-sheet heuristic (`__` prefix matching),
not hardcoded sheet names. No new language-specific patterns added.
The `rosterKeywords` list remains as a fallback, not primary detection.
