# CLT-160 Trace Diagnostic Report

## File: Meridian_Datos_Q1_2025.xlsx

| Sheet | Classification | Confidence | Expected | Correct? |
|-------|---------------|------------|----------|----------|
| Plantilla | entity | 85% | entity | YES |
| Datos_Rendimiento | transaction | 75% | transaction | YES |
| Datos_Flota_Hub | transaction | 75% | reference | NO |

---

## Plantilla

### Content Profile (Phase A)
| Property | Value |
|----------|-------|
| rowCount | 67 |
| columnCount | 6 |
| sparsity | 0.0% |
| headerQuality | clean |
| numericFieldRatio | 0.0% |
| categoricalFieldRatio | 50.0% |
| categoricalFieldCount | 3 |
| identifierRepeatRatio | 1.00 |
| hasEntityIdentifier | true |
| hasDateColumn | true |
| hasTemporalColumns | true |
| hasCurrencyColumns | 0 |
| hasPercentageValues | false |
| hasDescriptiveLabels | true |
| hasStructuralNameColumn | true |
| rowCountCategory | moderate |
| volumePattern | single |

### Field Profiles
| Field | DataType | Distinct | NullRate | Sample Values |
|-------|----------|----------|----------|---------------|
| No_Empleado | integer | 67 | 0% | 70001, 70010, 70019 |
| Nombre_Completo | text | 67 | 0% | Claudia Cruz Ramírez, Antonio López Hernández, Luz Gómez Con |
| Tipo_Coordinador | text | 2 | 0% | Coordinador, Coordinador Senior, Coordinador |
| Region | text | 4 | 0% | Norte, Norte, Norte |
| Hub_Asignado | text | 12 | 0% | Monterrey Hub, Monterrey Hub, Monterrey Hub |
| Fecha_Ingreso | date | 67 | 0% | 2023-02-22, 2018-04-08, 2021-04-15 |

### Name Signals per Field
| Field | containsId | containsName | containsTarget | containsDate | containsAmount | containsRate | looksLikePersonName |
|-------|-----------|-------------|---------------|-------------|---------------|-------------|--------------------|
| No_Empleado | true | false | false | false | false | false | false |
| Nombre_Completo | false | true | false | false | false | false | true |
| Tipo_Coordinador | false | false | false | false | false | false | false |
| Region | false | false | false | false | false | false | false |
| Hub_Asignado | false | false | false | false | false | false | false |
| Fecha_Ingreso | false | false | false | true | false | false | false |

### Observations
- **type_classification** (No_Empleado): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Nombre_Completo): text @ 70% — Winning type: text at 70%
- **type_classification** (Tipo_Coordinador): text @ 70% — Winning type: text at 70%
- **type_classification** (Region): text @ 70% — Winning type: text at 70%
- **type_classification** (Hub_Asignado): text @ 70% — Winning type: text at 70%
- **type_classification** (Fecha_Ingreso): date @ 95% — Winning type: date at 95%
- **temporal_detection** (sheet-level): true @ 80% — Temporal columns at indices: 5
- **name_detection** (Nombre_Completo): true @ 85% — nameCardinality: 1.00, multi-word text, non-numeric

### Signature Matches (Phase C Step 1)
- **entity**: `one_per_entity_with_attributes` @ 85%
  - identifierRepeatRatio: 1.0 (<=1.5)
  - categoricalFieldRatio: 50% (>25%)
  - hasEntityIdentifier: true
  - hasStructuralNameColumn: true
- **reference**: `lookup_table` @ 75%
  - rowCount: 67 (<100)
  - not person-level identifier
  - categoricalFieldCount: 3

### Round 1 Scores (Phase C Step 2 — Additive + Signature Floors)
| Agent | Confidence | Top Signals |
|-------|------------|-------------|
| entity | 85% | signature:one_per_entity_with_attributes (+85%: identifierRepeatRatio: 1.0 (<=1.5); categoricalFieldRatio: 50% (>25%); hasEntityIdentifier: true; hasStructuralNameColumn: true)<br>has_entity_id (+25%: entity identifier column present)<br>has_structural_name (+20%: structural name column detected (identifier-relative cardinality))<br>single_per_entity (+15%: 1.0 rows/entity (single — roster pattern))<br>categorical_attributes (+10%: 3 categorical text fields) |
| reference | 75% | signature:lookup_table (+75%: rowCount: 67 (<100); not person-level identifier; categoricalFieldCount: 3)<br>high_key_uniqueness (+25%: 67/67 unique (100%))<br>descriptive_columns (+20%: descriptive text columns present)<br>has_date_column (-20%: date column present)<br>has_entity_identifier (-10%: entity identifier present) |
| transaction | 35% | has_date (+25%: date column present)<br>has_entity_id (+15%: entity identifier present)<br>single_per_entity (-10%: 1.0 rows/entity (single — not events))<br>clean_headers (+5%: clean headers) |
| target | 25% | has_entity_id (+20%: entity identifier column present)<br>single_or_few_per_entity (+15%: 1.0 rows/entity (single))<br>has_temporal (-15%: temporal dimension present — data varies over time)<br>clean_headers (+5%: clean headers) |
| plan | 0% | descriptive_labels (+15%: low-cardinality descriptive text columns)<br>has_date (-10%: date column present)<br>has_entity_id (-10%: entity identifier column present) |

### Tenant Context Adjustments (Phase D)
_No tenant context adjustments._

### Round 2 Adjustments (Phase C Step 4 — Spatial Negotiation)
_No Round 2 adjustments._

### Final Scores
| Rank | Agent | Confidence |
|------|-------|------------|
| 1 | entity | 85% |
| 2 | reference | 75% |
| 3 | transaction | 35% |
| 4 | target | 25% |
| 5 | plan | 0% |

### Structural Fingerprint
```json
{
  "columnCount": 6,
  "numericFieldRatioBucket": "0-25",
  "categoricalFieldRatioBucket": "50-75",
  "identifierRepeatBucket": "0-1",
  "hasTemporalColumns": true,
  "hasIdentifier": true,
  "hasStructuralName": true,
  "rowCountBucket": "medium"
}
```

---

## Datos_Rendimiento

### Content Profile (Phase A)
| Property | Value |
|----------|-------|
| rowCount | 201 |
| columnCount | 19 |
| sparsity | 0.0% |
| headerQuality | clean |
| numericFieldRatio | 77.8% |
| categoricalFieldRatio | 21.1% |
| categoricalFieldCount | 4 |
| identifierRepeatRatio | 1.00 |
| hasEntityIdentifier | true |
| hasDateColumn | true |
| hasTemporalColumns | true |
| hasCurrencyColumns | 1 |
| hasPercentageValues | true |
| hasDescriptiveLabels | true |
| hasStructuralNameColumn | false |
| rowCountCategory | moderate |
| volumePattern | single |

### Field Profiles
| Field | DataType | Distinct | NullRate | Sample Values |
|-------|----------|----------|----------|---------------|
| No_Empleado | integer | 67 | 0% | 70001, 70010, 70019 |
| Nombre | text | 67 | 0% | Claudia Cruz Ramírez, Antonio López Hernández, Luz Gómez Con |
| Tipo_Coordinador | text | 2 | 0% | Coordinador, Coordinador Senior, Coordinador |
| Region | text | 4 | 0% | Norte, Norte, Norte |
| Hub | text | 12 | 0% | Monterrey Hub, Monterrey Hub, Monterrey Hub |
| Mes | integer | 3 | 0% | 1, 1, 1 |
| Año | integer | 1 | 0% | 2025, 2025, 2025 |
| Ingreso_Meta | integer | 201 | 0% | 265625, 361978, 356580 |
| Ingreso_Real | integer | 200 | 0% | 269608, 440003, 393346 |
| Cumplimiento_Ingreso | decimal | 199 | 0% | 1.015, 1.2156, 1.1031 |
| Volumen_Rutas_Hub | integer | 34 | 0% | 1083, 1083, 1083 |
| Entregas_Totales | integer | 75 | 0% | 74, 99, 43 |
| Entregas_Tiempo | integer | 69 | 0% | 64, 97, 34 |
| Pct_Entregas_Tiempo | decimal | 165 | 0% | 0.8649, 0.9798, 0.7907 |
| Cuentas_Nuevas | integer | 9 | 0% | 0, 8, 6 |
| Incidentes_Seguridad | integer | 4 | 0% | 0, 0, 0 |
| Capacidad_Flota_Hub | integer | 36 | 0% | 1306, 1306, 1306 |
| Cargas_Flota_Hub | integer | 34 | 0% | 1083, 1083, 1083 |
| Tasa_Utilizacion_Hub | decimal | 36 | 0% | 0.8292, 0.8292, 0.8292 |

### Name Signals per Field
| Field | containsId | containsName | containsTarget | containsDate | containsAmount | containsRate | looksLikePersonName |
|-------|-----------|-------------|---------------|-------------|---------------|-------------|--------------------|
| No_Empleado | true | false | false | false | false | false | false |
| Nombre | false | true | false | false | false | false | false |
| Tipo_Coordinador | false | false | false | false | false | false | false |
| Region | false | false | false | false | false | false | false |
| Hub | false | false | false | false | false | false | false |
| Mes | false | false | false | false | false | false | false |
| Año | false | false | false | false | false | false | false |
| Ingreso_Meta | false | false | true | false | false | false | false |
| Ingreso_Real | false | false | false | false | false | false | false |
| Cumplimiento_Ingreso | false | false | false | false | false | false | false |
| Volumen_Rutas_Hub | false | false | false | false | false | false | false |
| Entregas_Totales | false | false | false | false | true | false | false |
| Entregas_Tiempo | false | false | false | false | false | false | false |
| Pct_Entregas_Tiempo | false | false | false | false | false | false | false |
| Cuentas_Nuevas | false | false | false | false | false | false | false |
| Incidentes_Seguridad | false | false | false | false | false | false | false |
| Capacidad_Flota_Hub | false | false | false | false | false | false | false |
| Cargas_Flota_Hub | false | false | false | false | false | false | false |
| Tasa_Utilizacion_Hub | false | false | false | false | false | true | false |

### Observations
- **type_classification** (No_Empleado): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Nombre): text @ 70% — Winning type: text at 70%
- **type_classification** (Tipo_Coordinador): text @ 70% — Winning type: text at 70%
- **type_classification** (Region): text @ 70% — Winning type: text at 70%
- **type_classification** (Hub): text @ 70% — Winning type: text at 70%
- **type_classification** (Mes): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Año): integer @ 80% — Winning type: integer at 80%
- **type_classification** (Ingreso_Meta): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Ingreso_Real): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Cumplimiento_Ingreso): decimal @ 85% — Winning type: decimal at 85%
- **type_classification** (Volumen_Rutas_Hub): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Entregas_Totales): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Entregas_Tiempo): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Pct_Entregas_Tiempo): decimal @ 85% — Winning type: decimal at 85%
- **type_classification** (Cuentas_Nuevas): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Incidentes_Seguridad): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Capacidad_Flota_Hub): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Cargas_Flota_Hub): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Tasa_Utilizacion_Hub): decimal @ 85% — Winning type: decimal at 85%
- **temporal_detection** (sheet-level): true @ 80% — Temporal columns at indices: 5, 6

### Signature Matches (Phase C Step 1)
_No signatures matched._

### Round 1 Scores (Phase C Step 2 — Additive + Signature Floors)
| Agent | Confidence | Top Signals |
|-------|------------|-------------|
| transaction | 65% | has_date (+25%: date column present)<br>has_entity_id (+15%: entity identifier present)<br>has_currency (+15%: 1 currency columns)<br>high_numeric_ratio (+15%: 78% numeric fields (>50%))<br>single_per_entity (-10%: 1.0 rows/entity (single — not events)) |
| target | 50% | has_entity_id (+20%: entity identifier column present)<br>has_numeric_fields (+15%: 78% numeric fields (>30%))<br>single_or_few_per_entity (+15%: 1.0 rows/entity (single))<br>has_temporal (-15%: temporal dimension present — data varies over time)<br>has_currency (+10%: 1 currency columns (1-3)) |
| entity | 40% | has_entity_id (+25%: entity identifier column present)<br>single_per_entity (+15%: 1.0 rows/entity (single — roster pattern))<br>categorical_attributes (+10%: 4 categorical text fields)<br>high_numeric_ratio (-10%: 78% numeric fields (>50%)) |
| reference | 20% | high_key_uniqueness (+25%: 201/201 unique (100%))<br>descriptive_columns (+20%: descriptive text columns present)<br>has_date_column (-20%: date column present)<br>has_entity_identifier (-10%: entity identifier present)<br>clean_headers (+5%: clean headers) |
| plan | 7% | percentage_values (+15%: percentage values detected)<br>descriptive_labels (+15%: low-cardinality descriptive text columns)<br>has_date (-10%: date column present)<br>has_entity_id (-10%: entity identifier column present)<br>has_currency (-3%: 1 currency columns) |

### Tenant Context Adjustments (Phase D)
- **transaction**: +10% — plan_exists_numeric_content: Tenant has 1 plan. Sheet has 78% numeric fields

### Round 2 Adjustments (Phase C Step 4 — Spatial Negotiation)
- **entity**: -8% — 78% numeric fields — entity rosters are attribute-heavy

### Final Scores
| Rank | Agent | Confidence |
|------|-------|------------|
| 1 | transaction | 75% |
| 2 | target | 58% |
| 3 | entity | 32% |
| 4 | reference | 20% |
| 5 | plan | 7% |

### Structural Fingerprint
```json
{
  "columnCount": 19,
  "numericFieldRatioBucket": "75-100",
  "categoricalFieldRatioBucket": "0-25",
  "identifierRepeatBucket": "0-1",
  "hasTemporalColumns": true,
  "hasIdentifier": true,
  "hasStructuralName": false,
  "rowCountBucket": "medium"
}
```

---

## Datos_Flota_Hub

### Content Profile (Phase A)
| Property | Value |
|----------|-------|
| rowCount | 36 |
| columnCount | 7 |
| sparsity | 0.0% |
| headerQuality | clean |
| numericFieldRatio | 66.7% |
| categoricalFieldRatio | 28.6% |
| categoricalFieldCount | 2 |
| identifierRepeatRatio | 1.00 |
| hasEntityIdentifier | true |
| hasDateColumn | true |
| hasTemporalColumns | true |
| hasCurrencyColumns | 2 |
| hasPercentageValues | true |
| hasDescriptiveLabels | true |
| hasStructuralNameColumn | false |
| rowCountCategory | reference |
| volumePattern | single |

### Field Profiles
| Field | DataType | Distinct | NullRate | Sample Values |
|-------|----------|----------|----------|---------------|
| Region | text | 4 | 0% | Norte, Norte, Norte |
| Hub | text | 12 | 0% | Monterrey Hub, Chihuahua Hub, Tijuana Hub |
| Mes | integer | 3 | 0% | 1, 1, 1 |
| Año | integer | 1 | 0% | 2025, 2025, 2025 |
| Capacidad_Total | integer | 36 | 0% | 1306, 951, 805 |
| Cargas_Totales | integer | 34 | 0% | 1083, 898, 846 |
| Tasa_Utilizacion | decimal | 36 | 0% | 0.8292, 0.9443, 1.0509 |

### Name Signals per Field
| Field | containsId | containsName | containsTarget | containsDate | containsAmount | containsRate | looksLikePersonName |
|-------|-----------|-------------|---------------|-------------|---------------|-------------|--------------------|
| Region | false | false | false | false | false | false | false |
| Hub | false | false | false | false | false | false | false |
| Mes | false | false | false | false | false | false | false |
| Año | false | false | false | false | false | false | false |
| Capacidad_Total | false | false | false | false | true | false | false |
| Cargas_Totales | false | false | false | false | true | false | false |
| Tasa_Utilizacion | false | false | false | false | false | true | false |

### Observations
- **type_classification** (Region): text @ 70% — Winning type: text at 70%
- **type_classification** (Hub): text @ 70% — Winning type: text at 70%
- **type_classification** (Mes): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Año): integer @ 80% — Winning type: integer at 80%
- **type_classification** (Capacidad_Total): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Cargas_Totales): integer @ 95% — Winning type: integer at 95%
- **type_classification** (Tasa_Utilizacion): decimal @ 85% — Winning type: decimal at 85%
- **temporal_detection** (sheet-level): true @ 80% — Temporal columns at indices: 2, 3

### Signature Matches (Phase C Step 1)
- **reference**: `lookup_table` @ 75%
  - rowCount: 36 (<100)
  - not person-level identifier
  - categoricalFieldCount: 2

### Round 1 Scores (Phase C Step 2 — Additive + Signature Floors)
| Agent | Confidence | Top Signals |
|-------|------------|-------------|
| reference | 75% | signature:lookup_table (+75%: rowCount: 36 (<100); not person-level identifier; categoricalFieldCount: 2)<br>high_key_uniqueness (+25%: 36/36 unique (100%))<br>descriptive_columns (+20%: descriptive text columns present)<br>has_date_column (-20%: date column present)<br>low_row_count (+15%: 36 rows (reference)) |
| transaction | 65% | has_date (+25%: date column present)<br>has_entity_id (+15%: entity identifier present)<br>has_currency (+15%: 2 currency columns)<br>high_numeric_ratio (+15%: 67% numeric fields (>50%))<br>single_per_entity (-10%: 1.0 rows/entity (single — not events)) |
| target | 50% | has_entity_id (+20%: entity identifier column present)<br>has_numeric_fields (+15%: 67% numeric fields (>30%))<br>single_or_few_per_entity (+15%: 1.0 rows/entity (single))<br>has_temporal (-15%: temporal dimension present — data varies over time)<br>has_currency (+10%: 2 currency columns (1-3)) |
| entity | 40% | has_entity_id (+25%: entity identifier column present)<br>single_per_entity (+15%: 1.0 rows/entity (single — roster pattern))<br>categorical_attributes (+10%: 2 categorical text fields)<br>high_numeric_ratio (-10%: 67% numeric fields (>50%)) |
| plan | 17% | percentage_values (+15%: percentage values detected)<br>descriptive_labels (+15%: low-cardinality descriptive text columns)<br>low_row_count (+10%: 36 rows (reference))<br>has_date (-10%: date column present)<br>has_entity_id (-10%: entity identifier column present) |

### Tenant Context Adjustments (Phase D)
- **transaction**: +10% — plan_exists_numeric_content: Tenant has 1 plan. Sheet has 67% numeric fields

### Round 2 Adjustments (Phase C Step 4 — Spatial Negotiation)
- **entity**: -8% — 67% numeric fields — entity rosters are attribute-heavy

### Final Scores
| Rank | Agent | Confidence |
|------|-------|------------|
| 1 | transaction | 75% |
| 2 | reference | 75% |
| 3 | target | 58% |
| 4 | entity | 32% |
| 5 | plan | 17% |

### Structural Fingerprint
```json
{
  "columnCount": 7,
  "numericFieldRatioBucket": "50-75",
  "categoricalFieldRatioBucket": "25-50",
  "identifierRepeatBucket": "0-1",
  "hasTemporalColumns": true,
  "hasIdentifier": true,
  "hasStructuralName": false,
  "rowCountBucket": "small"
}
```

---

## Root Cause Analysis

### Datos_Flota_Hub Misclassification

**Result**: transaction at 75%
**Expected**: reference

#### Transaction Signature Condition Check
- identifierRepeatRatio > 1.5: 1.00 → FAIL
- hasTemporalColumns: true → PASS
- hasDateColumn: true → PASS
- numericFieldRatio > 0.40: 66.7% → PASS

#### Reference Signature Condition Check
- rowCount < 100: 36 → PASS
- notPersonLevel (!hasId || repeatRatio <= 1.0): hasId=true, ratio=1.00 → PASS
- categoricalFieldCount >= 1: 2 → PASS
- !isSparseOrAutoHeaders: sparsity=0.0%, quality=clean → PASS

#### Temporal Detection Details
- temporal_detection: Temporal columns at indices: 2, 3

#### Fields That May Trigger Temporal Detection
- **Mes**: type=integer, min=1, max=3, distinct=3 → TRIGGERS month detection | Samples: 1, 1, 1
- **Año**: type=integer, min=2025, max=2025, distinct=1 → TRIGGERS year detection | Samples: 2025, 2025, 2025

### ROOT CAUSE: Temporal False Positive + Additive Weight Cascade

**The Reference signature DID fire** at 75%. All 4 conditions passed. The problem is that Transaction's additive weights + tenant context boost ALSO reach 75%, and Transaction sorts first in the tie.

#### Signal-Level Breakdown (Datos_Flota_Hub: Transaction 75% vs Reference 75%)

**Transaction reaches 75% via 3 compounding errors:**

1. **Temporal False Positive (+25%)** — `Mes` (integer 1-3) and `Año` (integer 2025) trigger `detectTemporalColumns()` → `hasTemporalColumns = true` → `hasDateColumn = true`. The `has_date` signal gives Transaction +25%. But these are **dimensional keys** in a reference table (hub capacity per month), not event timestamps. The temporal detection is too aggressive — any integer column with values 1-12 triggers month detection, and any value in 2000-2040 triggers year detection. This is the **primary root cause**.

2. **Currency False Positive (+15%)** — `Capacidad_Total` and `Cargas_Totales` headers contain "Total" which matches `AMOUNT_SIGNALS = ['amount', 'total', ...]` → `containsAmount = true` → `scoreCurrencyPlausibility()` returns 0.85. But these are fleet capacity counts, not currency amounts. Two columns typed as currency → `hasCurrencyColumns = 2` → Transaction gets +15%. This is a **secondary amplifier**.

3. **Tenant Context Boost (+10%)** — Plan exists + numericFieldRatio > 0.30 → `plan_exists_numeric_content` signal adds +10% to Transaction. This is **correct behavior** but compounds the false positive from (1) and (2).

**Reference capped at 75% because:**

- Reference signature fires at 75% floor (all conditions pass)
- But additive weights only reach: `high_key_uniqueness (+25%) + descriptive_columns (+20%) + low_row_count (+15%) + no_date_column (-20%) + has_entity_identifier (-10%) + clean_headers (+5%)` = 35%
- The `-20% has_date_column` penalty kills Reference's additive score because `hasDateColumn = true` (from the same temporal false positive)
- Signature floor saves it at 75%, but can't go higher

**The tie breaks in Transaction's favor** because scores are sorted by confidence descending, and when equal, array order determines winner. Transaction is scored before Reference in the agents array.

#### DEEPER ROOT CAUSE: Wrong Identifier Field Selection

The `detectStructuralIdentifier()` function picks the first field with uniqueness > 0.70 that passes type checks. It finds `Capacidad_Total` (36 distinct in 36 rows → 1.0 uniqueness ratio) as the "identifier" — but this is a **measure field** (fleet capacity), not an identifier. The real identifier is `Hub` (12 distinct in 36 rows), but it fails the 0.70 threshold because 12/36 = 0.33.

This means `identifierRepeatRatio = 36/36 = 1.0` when it should be `36/12 = 3.0`.

**If identifierRepeatRatio were 3.0:**
- Transaction signature would fire (3.0 > 1.5 ✓ + hasTemporalColumns ✓ + numericFieldRatio > 0.40 ✓) → 80% floor
- But Reference signature's `notPersonLevel` condition (`!hasId || repeatRatio <= 1.0`) would FAIL (hasId=true, ratio=3.0 > 1.0)
- So the identifier selection bug actually HELPS Transaction (by setting the floor) but HURTS Reference (by blocking its signature)

**The same bug affects Datos_Rendimiento**: `detectStructuralIdentifier` picks `Ingreso_Meta` (201 distinct) instead of `No_Empleado` (67 distinct, but 67/201=0.33 < 0.70). With the correct identifier, ratio would be 201/67 = 3.0, and the Transaction signature would fire at 80%.

#### Proposed Fixes (4 Issues)

| Priority | Fix | Impact |
|----------|-----|--------|
| **P0** | **Identifier selection**: Prefer fields with `containsId` nameSignal over structurally-unique fields. Currently `detectStructuralIdentifier` runs first (structural), then `nameSignals.containsId` is only fallback. In the `idField` selection at line 464, the `containsId` field should be checked FIRST, then fall back to structural uniqueness. | Fixes identifierRepeatRatio for both sheets. Datos_Rendimiento gets ratio=3.0, Datos_Flota_Hub gets... still wrong because Hub has no `containsId` signal. |
| **P0** | **Temporal detection gating**: When `identifierRepeatRatio <= 1.0` AND row count < 100, temporal columns should be treated as **dimensional keys** (reference table structure), not event timestamps. Add a guard: `hasTemporalColumns = hasDateTypedColumn \|\| (hasYearValues && hasSmallRangeIntegers && (identifierRepeatRatio > 1.0 \|\| rowCount >= 100))`. | Eliminates temporal false positive for small reference tables. Datos_Flota_Hub loses has_date (+25% Transaction, -20% Reference). |
| **P1** | **Currency false positive**: `AMOUNT_SIGNALS` includes "total" which matches `Capacidad_Total`, `Cargas_Totales`. These are COUNT fields, not currency. Consider: (a) removing "total" from AMOUNT_SIGNALS, or (b) requiring `scoreCurrencyPlausibility` to find decimal values (these are all integers). | Eliminates hasCurrencyColumns for Datos_Flota_Hub. Transaction loses +15%. |
| **P2** | **Tie-breaking**: When two agents score identically, prefer the one with a matching signature. Currently array order breaks ties. | Safety net for edge cases. |

#### Expected Outcome After P0 + P1 Fixes

**Datos_Flota_Hub with fixes:**
- identifierRepeatRatio: still 1.0 (Hub has no containsId signal — deeper identifier fix needed)
- hasTemporalColumns: false (gating blocks temporal for small non-repeating tables)
- hasDateColumn: false
- hasCurrencyColumns: 0 (integer columns not typed as currency)
- Transaction additive: has_entity_id (+15%) + high_numeric_ratio (+15%) + single_per_entity (-10%) + no_date (-25%) = -5% → **0%**
- Reference additive: high_key_uniqueness (+25%) + descriptive_columns (+20%) + low_row_count (+15%) + no_date_column (+10%) + clean_headers (+5%) + no_entity_identifier (+10%) = **85%** (but signature floor is 75%)
- **Reference wins at 85%** ✅

---

### Plantilla Low Confidence

**Result**: entity at 85% ✅
**Expected**: entity at higher confidence

**Assessment**: Plantilla correctly classifies as entity at 85%. This is actually the signature floor from `one_per_entity_with_attributes`. The additive score alone would be 75% (has_entity_id +25%, has_structural_name +20%, single_per_entity +15%, categorical_attributes +10%, no_date -0%, high_currency -0% = 70%, but boosted to 85% by the signature).

The 85% is the correct confidence for this sheet. The user's initial report of 50% was from the browser with Header Comprehension active (LLM call). Without HC, the structural-only score is 85%. The discrepancy between 50% (browser) and 85% (structural-only) suggests that header comprehension may be applying negative adjustments. This should be investigated separately — it's not a structural scoring bug.

#### Entity Signature Condition Check
- identifierRepeatRatio > 0 && <= 1.5: 1.00 → PASS
- categoricalFieldRatio > 0.25: 50.0% → PASS
- hasEntityIdentifier: true → PASS
- hasStructuralNameColumn: true → PASS

---

### Datos_Rendimiento Classification

**Result**: transaction at 75% ✅
**Expected**: transaction

**Assessment**: Correct classification but NO signature matched. The Transaction signature requires `identifierRepeatRatio > 1.5`, but this sheet has ratio=1.0 due to the **wrong identifier field** bug.

`detectStructuralIdentifier()` picks `Ingreso_Meta` (201 distinct / 201 rows = 1.0 uniqueness) as the identifier because it passes the 0.70 threshold. The real identifier `No_Empleado` (67 distinct / 201 rows = 0.33 uniqueness) fails the threshold. With `No_Empleado` as identifier, ratio = 201/67 = 3.0, and the Transaction signature would fire at 80%+.

This doesn't affect the final classification (Transaction still wins via additive weights + tenant context) but it means:
1. Transaction confidence is 75% instead of potential 90% (signature floor 80% + HC boosts)
2. The round 2 negotiation that penalizes target/entity for high repeat ratio never fires
3. The "volumePattern" is "single" instead of "many"

