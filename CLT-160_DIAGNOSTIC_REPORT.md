# CLT-160 Diagnostic Report: Meridian Pipeline State After Plan Import

## 1. Tenant State

### 1.1 Tenant Record
```
id:       5035b1e8-0754-4527-b7ec-9f93f85e4c79
name:     Meridian Logistics Group
slug:     meridian-logistics-group
locale:   es-MX
currency: MXN
industry: Manufacturing
domain:   null
created:  2026-03-05T04:40:50.646Z
```

### 1.2 Engine Contract
| Table | Count |
|-------|-------|
| rule_sets | 2 |
| entities | 0 |
| committed_data | 0 |
| periods | 0 |
| rule_set_assignments | 0 |
| reference_data | 0 |
| reference_items | 0 |
| calculation_results | 0 |
| import_batches | 0 |

**Assessment:** Plan imported (2 rule_sets). No data imported yet. No entities, periods, or assignments. This is the expected state after plan-only import.

---

## 2. Rule Sets

### 2.1 All Rule Sets
| # | ID | Name | Status | Bindings | Components Size | Created |
|---|-----|------|--------|----------|-----------------|---------|
| 1 | 465ecdad | Meridian Logistics Group Incentive Plan 2025 | draft | {} (empty) | 9,839 chars | 2026-03-05T14:44 |
| 2 | 022b0e46 | Meridian Logistics Group Incentive Plan 2025 | draft | {} (empty) | 9,805 chars | 2026-03-07T02:56 |

**ISSUE: DUPLICATE RULE SET.** Same name, both draft. The second was created during CLT-160 browser testing. The first is from an earlier test. Both have similar component sizes (~9.8KB). The idempotency guard checks `metadata->>contentUnitId` — if the user re-imported from a different browser session or page refresh, the contentUnitId would be different, bypassing the guard.

### 2.2 Variant Structure (Latest Rule Set: 022b0e46)
```
variant_count: 2

Variant 0: "Senior Logistics Coordinator"
  description: "Coordinador de Logistica Senior"
  components: 5

Variant 1: "Standard Logistics Coordinator"
  description: "Coordinador de Logistica"
  components: 5
```

**Correct.** Two employee types with 5 components each matches the Meridian plan structure.

### 2.3 Component Inventory — Variant 0 (Senior)
| # | Name | Intent Operation | Config |
|---|------|-----------------|--------|
| 0 | Revenue Performance - Senior | bounded_lookup_2d | matrixConfig (5x4) |
| 1 | On-Time Delivery - Senior | bounded_lookup_1d | tierConfig |
| 2 | New Accounts - Senior | scalar_multiply | — |
| 3 | Safety Record - Senior | conditional_gate | — |
| 4 | Fleet Utilization - Senior | scalar_multiply | — |

### 2.4 Component Inventory — Variant 1 (Standard)
| # | Name | Intent Operation | Config |
|---|------|-----------------|--------|
| 0 | Revenue Performance - Standard | bounded_lookup_2d | matrixConfig (5x4) |
| 1 | On-Time Delivery - Standard | bounded_lookup_1d | tierConfig |
| 2 | New Accounts - Standard | scalar_multiply | — |
| 3 | Safety Record - Standard | conditional_gate | — |
| 4 | Fleet Utilization - Standard | scalar_multiply | — |

**Correct.** Both variants have identical component types with variant-specific names. All 5 components have calculationIntent with proper operations.

### 2.5 Input Bindings
```
bindings: {} (empty object)
```

**Expected for plan import.** Input bindings are populated during data import convergence, not plan import.

### 2.6 First Component Sample (Revenue Performance - Senior)
```json
{
  "componentType": "matrix_lookup",
  "measurementLevel": "store",
  "calculationIntent": {
    "operation": "bounded_lookup_2d",
    "inputs": {
      "row": { "source": "metric", "sourceSpec": { "field": "revenue_attainment" } },
      "column": { "source": "metric", "sourceSpec": { "field": "hub_route_volume" } }
    },
    "rowBoundaries": [<80%, 80-89%, 90-99%, 100-129%, 130%+],
    "columnBoundaries": [<500, 500-999, 1000-1999, 2000+],
    "outputGrid": 5x4 matrix (MXN values: 0 to 3000)
  },
  "matrixConfig": {
    "currency": "MXN",
    "rowMetric": "revenue_attainment",
    "columnMetric": "hub_route_volume",
    "rowMetricLabel": "% Cumplimiento de meta de ingreso",
    "columnMetricLabel": "Volumen de rutas del Hub (cargas/mes)"
  }
}
```

**Correct.** Dual-metric matrix lookup with 5 row bands (attainment %) x 4 column bands (volume). MXN currency. Spanish labels preserved. Both calculationIntent and matrixConfig are populated — engine can use either path.

---

## 3. Classification Signals

### 3.1 Signal Summary
Total signals: 20 (across 3 import attempts)

| Type | Count | Confidence Range |
|------|-------|-----------------|
| sci:content_classification | 9 | 0.45 — 0.90 |
| sci:field_binding | 8 | 0.54 — 0.74 |
| sci:content_classification_outcome | 1 | 0.95 |
| sci:cost_event | 1 | 1.00 |
| training:plan_interpretation | 1 | 0.95 |

**NOTE:** All signals have `source_file_name = null`, `sheet_name = null`, `classification = null`, `structural_fingerprint = null`. The dedicated columns (HF-092) are not being populated. The signal capture service writes to the `context` JSONB column (legacy path) instead of the dedicated columns.

### 3.2 Convergence Signals
**None found.** No convergence signals exist for this tenant.

---

## 4. Import Batches
**None found.** The plan import via SCI does not create import_batches records. This is by design — import_batches track data imports (entity/target/transaction), not plan imports.

---

## 5. Stale Data

### 5.1 Duplicate Rule Sets
**DUPLICATE:** "Meridian Logistics Group Incentive Plan 2025" x2
- 465ecdad (2026-03-05T14:44) — first import
- 022b0e46 (2026-03-07T02:56) — second import (CLT-160 browser test)

### 5.2 Orphaned Data
No orphans. entities=0, assignments=0, committed_data=0.

---

## 6. Flywheel State

### 6.1 Foundational Patterns (SCI)
**No SCI foundational patterns** (pattern_signature LIKE 'sci:%' = 0 rows).
Total foundational_patterns rows: 12 (all from calculation pipeline, not SCI).

### 6.2 Domain Patterns
Domain patterns exist from the calculation pipeline (domain_id='icm', 70K-82K executions each). These are from Pipeline Test Co's calculation runs, not from SCI.

**Assessment:** The SCI flywheel has not accumulated any patterns yet. This is expected — the plan import path goes through `executePlanPipeline` which calls `aiService.interpretPlan()` + `bridgeAIToEngineFormat()` + saves to `rule_sets`. It does not write classification signals via the HF-092 dedicated column path (it uses the legacy signal capture service).

---

## 7. Plan Pipeline Code

### 7.1 Execute Route Plan Pipeline Flow
```
executePlanPipeline(supabase, tenantId, unit, userId)
  1. Idempotency check: query rule_sets WHERE metadata->>contentUnitId = unit.contentUnitId
  2. If exists: return existing (skip re-import)
  3. If no documentMetadata.fileBase64: return deferred
  4. Extract document text (PDF native / PPTX/DOCX via JSZip)
  5. aiService.interpretPlan(content, format, {tenantId})
  6. bridgeAIToEngineFormat(interpretation, tenantId, userId)
  7. supabase.upsert(rule_sets) with components = { variants: [...] }
  8. Return success with component count
```

### 7.2 bridgeAIToEngineFormat
Located in `web/src/lib/compensation/ai-plan-interpreter.ts:665`
```
bridgeAIToEngineFormat(rawResult, tenantId, userId)
  1. Normalize raw AI output via AIPlainInterpreter.validateAndNormalizePublic()
  2. Convert to engine format via interpretationToPlanConfig()
  3. Return { name, description, components: { variants: [...] }, inputBindings: {} }
```

---

## 8. Assessment

### Correct
1. Tenant record: es-MX, MXN, Manufacturing industry — correct
2. Plan structure: 2 variants x 5 components — correct
3. Component types: matrix_lookup, tier_lookup, scalar, conditional_gate — correct
4. calculationIntent: All 5 components have proper operation + inputs + boundaries
5. matrixConfig/tierConfig: Populated for lookup components
6. Currency: MXN throughout
7. Spanish labels preserved in descriptions
8. No orphaned data

### Issues
1. **DUPLICATE RULE SET** — Two identical plans (465ecdad, 022b0e46). Must delete one before data import.
2. **EMPTY INPUT BINDINGS** — `{}` on both rule sets. Expected at plan stage, must be populated during convergence after data import.
3. **CLASSIFICATION SIGNALS: DEDICATED COLUMNS NOT POPULATED** — All 20 signals have null in source_file_name, sheet_name, classification, structural_fingerprint. Signal capture writes to context JSONB, not the HF-092 dedicated columns.
4. **NO SCI FOUNDATIONAL PATTERNS** — Plan pipeline doesn't write to foundational/domain flywheel (by design — only data classification writes flywheel signals).
5. **NO IMPORT BATCHES** — Plan import doesn't create import_batch records. Not blocking, but means no audit trail for plan imports.

---

## 9. Recommended Actions Before Data Import

| Priority | Action | Why |
|----------|--------|-----|
| P0 | Delete duplicate rule set (465ecdad) | Prevents confusion during assignment. Keep 022b0e46 (latest). |
| P1 | Proceed with data import | Plan is correct. Entity, target, and transaction data needed next. |
| P2 | Verify convergence populates input_bindings | After data import, convergence should bind data fields to plan components. |
| P3 | Investigate signal capture — dedicated columns | HF-092 columns exist but signal capture still writes to JSONB. Not blocking but reduces flywheel accuracy. |
