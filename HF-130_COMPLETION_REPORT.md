# HF-130 Completion Report — Multi-Sheet Plan Interpretation

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `6ececf68` | Multi-sheet plan interpretation diagnostic |
| 1-2 | `5c20e76a` | Batch plan sheets + build verification |
| 3 | (this commit) | Completion report + PR |

## Files Changed

### Modified
- `web/src/app/api/import/sci/execute/route.ts` — Batched plan interpretation + XLSX text extraction (301 lines added)

## Hard Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-01 | Plan units from same file batched before interpretation | **PASS** | `executeBatchedPlanInterpretation` groups all plan units, downloads file once |
| PG-02 | ONE AI call for multi-sheet plan | **PASS** | Single `aiService.interpretPlan(documentContent, ...)` call with combined sheet text |
| PG-03 | ONE rule_set created per file | **PASS** | Single `supabase.from('rule_sets').upsert({...})` in batched function |
| PG-04 | Existing interpreter reused | **PASS** | `aiService.interpretPlan()` + `bridgeAIToEngineFormat()` — same functions as Meridian path |
| PG-05 | Build exits 0 | **PASS** | `npm run build` exit 0, Middleware 75.4 kB |

## Soft Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-S1 | Single-sheet plan files still work | **PASS** | Per-unit `executePlanPipeline` now has XLSX text extraction; batched path handles single unit too |
| PG-S2 | Non-plan units unaffected | **PASS** | Batching only filters `confirmedClassification === 'plan'`; `handledPlanUnitIds` skip set ensures no double-processing |

## Root Cause

`executePlanPipeline` was called independently per content unit. A 3-sheet XLSX plan
(Plan General + Tablas de Tasas + Metas Mensuales) resulted in 3 independent AI calls,
each with either empty or partial context, producing 3 empty rule_sets.

Additionally, XLSX text extraction was missing — the code only handled PDF, PPTX, and
DOCX formats.

## Fix

### Batched Interpretation (route.ts, before per-unit loop)
```typescript
const planUnits = sorted.filter(u => u.confirmedClassification === 'plan');
const handledPlanUnitIds = new Set<string>();

if (planUnits.length > 0 && storagePath) {
  const batchResults = await executeBatchedPlanInterpretation(
    supabase, tenantId, planUnits, profileId, storagePath
  );
  for (const r of batchResults) {
    results.push(r);
    handledPlanUnitIds.add(r.contentUnitId);
  }
}
```

### XLSX Text Extraction (executeBatchedPlanInterpretation)
```typescript
const XLSX = await import('xlsx');
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
const planSheetNames = new Set(planUnits.map(u => u.tabName).filter(Boolean));

for (const sheetName of workbook.SheetNames) {
  if (planSheetNames.size > 0 && !planSheetNames.has(sheetName)) continue;
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  sheetTexts.push(`=== Sheet: ${sheetName} ===`);
  // ... tab-separated row text
}
documentContent = sheetTexts.join('\n');
```

### Single AI Call
```typescript
const response = await aiService.interpretPlan(
  documentContent,      // Combined text from all plan sheets
  pdfBase64ForAI ? 'pdf' : 'text',
  { tenantId },
  pdfBase64ForAI,
  pdfMediaType
);
```

### Single Rule Set
```typescript
await supabase.from('rule_sets').upsert({
  id: ruleSetId,
  tenant_id: tenantId,
  name: planName,
  components: engineFormat.components,
  metadata: {
    contentUnitId: primaryContentUnitId,
    batchedSheets: planUnits.map(u => u.contentUnitId),
  },
  ...
});
```

## Expected Behavior After Fix

```
Execute receives 3 plan content units (Plan General, Tablas de Tasas, Metas Mensuales)
  → Detects all 3 are plan-classified
  → Downloads file ONCE from ingestion-raw
  → Extracts text from all 3 sheets: overview + rate tables + targets
  → ONE call to AI plan interpreter with combined 3-sheet document
  → ONE rule_set created with components (C1, C2, C3, C4)
  → Results: primary unit = plan-interpretation, others = plan-batch-included
```

## Compliance

- **AP-17 (Single code path):** Uses existing `aiService.interpretPlan` + `bridgeAIToEngineFormat`
- **FP-21 (No dual path):** No new interpretation function created
- **FP-69 (Fix ALL):** Works for ANY multi-sheet XLSX plan, not just BCL
- **FP-66 (No seeding):** Plan comes through AI interpretation, not hardcoded components
- **Korean Test:** XLSX text extraction is language-agnostic (tab-separated values)

## Build

```
npm run build — exit 0
No TypeScript errors
Middleware: 75.4 kB
1 file changed, 301 lines added
```
