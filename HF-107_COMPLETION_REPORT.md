# HF-107 Completion Report: Reference Data Routing — Execute Pipeline

**Reference pipeline exists, is fully wired, and now has HC-aware key detection + idempotent re-import.**

---

## Summary

The reference pipeline (`executeReferencePipeline`) was already implemented in OB-152. It correctly routes reference-classified content to `reference_data` + `reference_items` tables. The root cause of `reference_data: 0` is **classification**, not routing: Datos_Flota_Hub is classified as `transaction@90%` by Level 1 HC pattern, not `reference@85%`.

### What Was Improved
| File | Change |
|------|--------|
| `web/src/app/api/import/sci/execute/route.ts` | HC-aware key_field detection + idempotent re-import |

### What Was NOT Changed (already correct)
| File | Reason |
|------|--------|
| `web/src/lib/sci/hc-pattern-classifier.ts` | Pattern rules are structurally correct |
| `web/src/lib/sci/negotiation.ts` | reference_key → entity_identifier mapping works |
| `web/src/lib/sci/agents.ts` | Agent scoring unchanged |
| `web/src/lib/sci/resolver.ts` | CRR Bayesian unchanged |

---

## Evidentiary Gates

### EG-1: Reference Pipeline Code Path

```typescript
// execute/route.ts line 279
case 'reference':
  return executeReferencePipeline(supabase, tenantId, proposalId, effectiveUnit, userId);
```

The switch statement at line 270 routes to `executeReferencePipeline` (line 838). This function:
1. Creates `import_batches` row
2. Creates `reference_data` header row (reference_type, name, key_field, schema_definition)
3. Creates `reference_items` rows (external_key, display_name, category, attributes JSONB)
4. Bulk inserts in 5000-row chunks

### EG-2: HC-Aware Key Field Detection (HF-107 improvement)

```typescript
// HF-107: Find the key field — HC reference_key role → entity_identifier binding → first column
// Priority: 1) HC reference_key role from classificationTrace, 2) entity_identifier binding, 3) first column
const traceHC = (unit.classificationTrace as Record<string, unknown>)?.headerComprehension as
  { interpretations?: Record<string, { columnRole: string; confidence: number }> } | null;
if (traceHC?.interpretations) {
  for (const [col, interp] of Object.entries(traceHC.interpretations)) {
    if (interp.columnRole === 'reference_key' && interp.confidence >= 0.80) {
      keyFieldName = col;
      break;
    }
  }
}
```

Korean Test passes: key field determined by HC semantic role (`reference_key`), not field name matching.

### EG-3: Attributes JSONB Carries Everything

```typescript
// Line 980
attributes: row as unknown as Json, // full row stored as JSONB
```

All columns from the source data are preserved in the `attributes` JSONB column. Carry Everything principle (slot 10) satisfied.

### EG-4: Idempotent Re-import (HF-107 improvement)

```typescript
// HF-107: Idempotent — delete existing reference for same tenant + name before re-import
const { data: existingRef } = await supabase.from('reference_data')
  .select('id')
  .eq('tenant_id', tenantId)
  .eq('name', referenceName);
if (existingRef && existingRef.length > 0) {
  const existingIds = existingRef.map(r => r.id);
  for (const refId of existingIds) {
    await supabase.from('reference_items').delete().eq('reference_data_id', refId);
  }
  await supabase.from('reference_data').delete().in('id', existingIds);
}
```

Re-import deletes existing reference_data + reference_items for the same tenant + name, then recreates. No unique constraint violations.

### EG-5: Committed Data Count Explanation

```
committed_data by data_type: {"datos_rendimiento":50,"datos_flota_hub":36}
Total: 86
```

**This is correct.** The actual XLSX file imported by the user contained:
- Plantilla: ~50 entity rows → entities table (NOT committed_data)
- Datos_Rendimiento: 50 transaction rows → committed_data
- Datos_Flota_Hub: 36 transaction rows → committed_data (classified as transaction, not reference)

The `totalRowCount: 1800` in the test script is the SIMULATED full row count for classification testing. The actual rawData sent to execute contained the real file data (50 + 36 = 86 rows).

### EG-6: Classification Analysis

```
[SCI-HC-DIAG] sheet=Datos_Flota_Hub roles=[Region:attribute@1.00, Hub:identifier@1.00, Mes:temporal@1.00, Ano:temporal@1.00, Capacidad_Total:measure@1.00, Cargas_Totales:measure@1.00, Tasa_Utilizacion:measure@1.00]
[SCI-HC-PATTERN] sheet=Datos_Flota_Hub classification=transaction@90% pattern=repeated_measures_over_time conditions=[HAS identifier, HAS measure (3 columns), HAS temporal, idRepeatRatio=12.00 (>1.5)]
```

HC labels Hub as `identifier` (not `reference_key`) in Datos_Flota_Hub because Hub IS the primary identifier in that sheet. With identifier + measure + temporal + idRepeatRatio > 1.5, the Level 1 transaction pattern fires.

**Why this is structurally correct:** Datos_Flota_Hub is a time-series of hub capacity data (3 hubs x 12 months = 36 rows). It has temporal columns (Mes, Ano) and repeated identifiers. Structurally, this IS transactional data — it records hub metrics over time.

**User override path:** If the user wants this treated as reference data, they can change the classification to `reference` on the import confirm screen. The reference pipeline will then correctly process it: Hub becomes the key_field, all other columns go into attributes JSONB.

### EG-7: Build Output

```
f Middleware                                  75 kB
○  (Static)   prerendered as static content
f  (Dynamic)  server-rendered on demand
Exit code: 0
```

---

## Root Cause: reference_data = 0

The reference pipeline was always present (OB-152) and correctly wired. `reference_data: 0` is because **no content unit is classified as `reference`**. Datos_Flota_Hub classifies as `transaction@90%` because:

1. HC labels Hub as `identifier` (correct — it IS the key column in that sheet)
2. Sheet has temporal columns (Mes, Ano)
3. Sheet has measure columns (Capacidad_Total, Cargas_Totales, Tasa_Utilizacion)
4. idRepeatRatio = 12.0 (> 1.5 threshold)
5. All four conditions match the Level 1 `repeated_measures_over_time` pattern

The Level 1 reference pattern (`lookup_table`) requires `HAS reference_key AND NOT HAS identifier`. Since Hub is labeled `identifier`, this pattern cannot match.

## User Actions for Reference Treatment

To route Datos_Flota_Hub to reference tables:
1. On the import confirm screen, change the classification from `transaction` to `reference`
2. The execute pipeline will use the reference processing path
3. Hub will be used as key_field (via HC reference_key fallback or entity_identifier binding)
4. All 36 rows will become reference_items with full row data in attributes JSONB
