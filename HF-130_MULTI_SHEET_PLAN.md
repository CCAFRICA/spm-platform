# HF-130: Multi-Sheet Plan Interpretation — Diagnostic

## Phase 0: Code Trace

### 0A: Execute loop iterates per-unit (route.ts:143-157)
```
for (const unit of sorted) {
  const result = await executeContentUnit(supabase, tenantId, proposalId, unit, profileId, storagePath);
  results.push(result);
}
```
Each plan-classified sheet (Plan General, Tablas de Tasas, Metas Mensuales) hits
`executePlanPipeline` independently. Three separate AI calls, three separate rule_sets.

### 0B: Working plan interpreter entry point
`aiService.interpretPlan(content, format, signalContext, pdfBase64, pdfMediaType)` in
`web/src/lib/ai/ai-service.ts:243`. This is the same function used for Meridian PPTX.
It sends content to the `plan_interpretation` prompt which expects the FULL document.

### 0C: Text extraction gap for XLSX
`executePlanPipeline` handles PDF (vision), PPTX (XML text), DOCX (XML text).
For XLSX, `mimeType` is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
This doesn't match PDF or PPTX checks, falls into the DOCX branch which looks for
`word/document.xml` — doesn't exist in XLSX. Result: `documentContent = ''` → AI gets nothing.

### 0D: bridgeAIToEngineFormat (ai-plan-interpreter.ts:665)
Called after AI interpretation. Takes raw result, normalizes via `validateAndNormalizePublic`,
converts via `interpretationToPlanConfig`. Creates `{ name, description, components: { variants } }`.
Reusable — works with any AI response. No per-sheet assumption.

### 0E: AI prompt expects full document
The `plan_interpretation` prompt (anthropic-adapter.ts:134) says:
"Extract the COMPLETE structure of a compensation plan from the provided document content"
It expects ALL tables, ALL components in one pass. When given a single sheet with overview text
but no rate tables, it can't extract components — those are on different sheets.

### Root Cause Summary
1. Per-unit loop → 3 independent calls instead of 1 combined call
2. No XLSX text extraction → AI gets empty content for each call
3. No cross-sheet context → even if text extraction worked, each sheet alone is insufficient

### Fix Design
1. Before per-unit loop: identify all plan-classified units from the same file
2. Download file ONCE from storage
3. Extract text from ALL plan-classified sheets using xlsx library (already available in execute-bulk)
4. Combine sheet texts into single document with sheet headers
5. ONE call to `aiService.interpretPlan()` with combined content
6. ONE rule_set via `bridgeAIToEngineFormat()`
7. Return results for all plan units (primary gets full result, others get "included in batch")
8. Skip plan units in per-unit loop (already handled)
