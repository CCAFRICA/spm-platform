# OB-157: Classification Accuracy Diagnostic

## Problem Summary

Three SCI classification problems produce wrong results:
1. **Entity inflation**: 12,646 entities instead of 719 — store IDs misclassified as entity_identifier
2. **Source date wrong**: Scattered 2000-2024 dates — hire dates used instead of Mes/Año
3. **$0 payout**: AI component names don't match data_type patterns → no metrics resolved

---

## 1. Entity Identifier Classification — Why Store IDs Become Entities

### Current Flow

```
Header "No_Tienda" → content-profile.ts containsId signal → agents.ts assignXxxRole()
→ entity_identifier role → postCommitConstruction() creates entity per unique value
```

### Root Cause

**`postCommitConstruction()` creates entities from ANY content unit that has an `entity_identifier` binding — regardless of classification type.**

In `execute/route.ts:1120`:
```typescript
if (entityIdField) {
  // Creates entities — no check for unit.classification === 'entity'
  const allIdentifiers = new Set<string>();
  for (const row of unit.rawData) { ... }
}
```

All three role-assignment functions (`assignEntityRole`, `assignTargetRole`, `assignTransactionRole`) in `agents.ts` assign `entity_identifier` to ANY field with `containsId=true`:

```typescript
// Line 224 (entity agent)
if (field.nameSignals.containsId) return { role: 'entity_identifier', ... };
// Line 239 (target agent)
if (field.nameSignals.containsId) return { role: 'entity_identifier', ... };
// Line 253 (transaction agent)
if (field.nameSignals.containsId) return { role: 'entity_identifier', ... };
```

The `containsId` signal fires for header names containing "id", "num", "código", "clave", etc. (`content-profile.ts`). `No_Tienda` matches because it contains store-number patterns.

**Result**: A target sheet with 5,000 rows containing `No_Tienda` (50 unique stores) creates 50 store entities. When combined with the entity sheet's 500 employees, total inflates to 550+ unique external_ids → 12,646 at full Óptica scale.

### Fix Direction

Only entity-classified content units should create entities. Target/transaction units should BIND to existing entities via entity_identifier, not CREATE new ones. This preserves the Korean Test — the fix is structural (classification-based), not string-matching.

---

## 2. Source Date Extraction — Why Hire Dates Are Selected

### Current Flow (`source-date-extraction.ts`)

```
Strategy 1: Content Profile date column hint → parse value
Strategy 2: Semantic role tagged temporal → parse value
Strategy 3: Structural scan → first plausible date (2000-2030) from ANY column
```

### Root Cause

**Strategy 3 scans ALL columns and picks the first plausible date value in the 2000-2030 range — with no content-unit classification awareness.**

For entity sheets (roster data), `fecha_ingreso` (hire date, e.g., 2023-01-15) is a valid date in the 2000-2030 range. Strategy 3 picks it up because:
- Strategy 1: No Content Profile hint set for entity sheets
- Strategy 2: Entity agent doesn't assign temporal semantic roles (no `transaction_date` role)
- Strategy 3: Scans all values, finds `fecha_ingreso` first → returns hire date

For target sheets, numeric columns like `Mes` (1-12) and `Año` (2024) should compose the source_date, but:
- They're integers, not date types — `parseAnyDateValue()` doesn't compose year+month
- If there's a date column on the target sheet, it would be used; otherwise Strategy 3 grabs whatever it finds first

### Fix Direction

Source date extraction needs classification-aware strategies:
- **Entity sheets**: Skip source_date entirely (roster data doesn't have transaction dates)
- **Target/transaction sheets**: Look for period markers (Mes/Año, Month/Year patterns) via structural detection, compose them into dates
- Strategy 3 fallback should prefer temporal-role columns over random date columns

---

## 3. Component-to-Data Matching — The Name Gap

### Current Flow (`run-calculation.ts:488-521`)

```
findMatchingSheet(componentName, availableSheets, aiContextSheets)
  → Tier 1: AI context match (findSheetForComponent)
  → Tier 2: Name substring (normComponent ↔ normSheet)
  → Tier 3: Single sheet fallback
```

### Root Cause

**AI-generated component names don't substring-match the data_type values stored in committed_data.**

Example:
- Component name: `"Optical Sales Incentive"` (from plan AI interpretation)
- Data type: `"base_venta_individual"` (from data import AI classification)
- Normalized: `"optical_sales_incentive"` vs `"base_venta_individual"` — no substring match

Tier 1 (AI context) relies on `import_batches.metadata.ai_context_sheets`, which maps component names to sheet names. But the AI analysis phase produces content unit IDs like `file::sheet_name`, and the component-to-sheet mapping requires the AI to have seen both the plan and data in the same context — which it hasn't.

Tier 3 (single sheet fallback) only works when there's exactly one data sheet. With Óptica's multi-sheet workbook (Datos_Colaborador, Base_Venta_Individual, Base_Tienda, etc.), multiple sheets exist → no fallback.

**Result**: `findMatchingSheet()` returns `null` → no data for component → `buildMetricsForComponent()` gets empty rows → all metrics = 0 → $0 payout.

### Fix Direction

The matching needs a semantic bridge between AI component names and data_type values:
- Use `input_bindings` / `metric_mappings` from the plan to identify which metrics each component needs
- Match components to sheets by finding which sheets CONTAIN the required metrics (via `inferSemanticType()`)
- This is structural (what data types does this sheet have?) rather than nominal (do the names match?)

---

## File References

| File | Lines | Relevance |
|------|-------|-----------|
| `web/src/app/api/import/sci/execute/route.ts` | 1110-1160 | `postCommitConstruction()` — entity creation without classification check |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | — | Bulk version of same logic |
| `web/src/lib/sci/agents.ts` | 223-266 | `assignEntityRole/TargetRole/TransactionRole` — all assign entity_identifier |
| `web/src/lib/sci/content-profile.ts` | 124-235 | `containsId` signal detection |
| `web/src/lib/sci/source-date-extraction.ts` | 1-49 | Three-strategy date extraction |
| `web/src/lib/calculation/run-calculation.ts` | 488-521 | `findMatchingSheet()` — name substring matching |
| `web/src/lib/calculation/run-calculation.ts` | 620-813 | `buildMetricsForComponent()` — metric resolution |
| `web/src/lib/orchestration/metric-resolver.ts` | — | `inferSemanticType()` regex patterns |
