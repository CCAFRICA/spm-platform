# HF-068 Phase 1: Architecture Decision

## Problem
CSV/TSV files bypass the field mapping pipeline entirely. The `handleFileSelect` function routes CSV through `classifyFile()` (file type only) instead of `analyzeWorkbook()` (file type + column mappings). This leaves `fieldMappings` empty and the map step renders nothing.

## Option A: Route ALL files through analyzeWorkbook()
- **Scale test:** Works at 10x? YES — same pipeline regardless of file count/size
- **AI-first:** Any hardcoding? NO — AI analyzes columns for ALL formats
- **Transport:** Data through HTTP bodies? YES but only headers + 5 sample rows (tiny payload ~2KB), not full data. Acceptable per existing pattern.
- **Atomicity:** Clean state on failure? YES — error caught, state unchanged
- **Implementation:** Replace the CSV-specific `classifyFile()` path with `analyzeWorkbook()`. SheetJS `XLSX.read()` already parses CSV, so `parseAllSheets()` works for CSV. The AI endpoint already handles single-sheet analysis.

## Option B: Add field mapping creation AFTER classifyFile()
- **Scale test:** Works at 10x? YES
- **AI-first:** Any hardcoding? NO — but creates mappings without AI column suggestions
- **Transport:** Same
- **Atomicity:** Same
- **Problem:** Creates empty mappings with all fields as Tier 3 (unresolved). User must manually map every column. No AI assistance. Defeats the purpose of AI-first field mapping.

## Option C: Keep classifyFile() + call analyzeWorkbook() after
- **Scale test:** Works at 10x? YES
- **AI-first:** Any hardcoding? NO
- **Transport:** Same
- **Atomicity:** Same
- **Problem:** Two AI calls where one suffices. The `analyzeWorkbook()` endpoint already classifies sheets AND maps columns in a single call. Running `classifyFile()` first is redundant.

## CHOSEN: Option A
Route ALL file types through `analyzeWorkbook()`. The `parseAllSheets()` function already uses SheetJS which handles CSV/TSV/XLSX uniformly. The AI endpoint already handles single-sheet workbooks. The classification result from `analyzeWorkbook()` is strictly superior to `classifyFile()` because it includes both file type AND column-to-field mappings.

## REJECTED: Option B
Creates mappings without AI suggestions — user must manually map everything. Violates AI-first principle.

## REJECTED: Option C
Redundant AI calls. `analyzeWorkbook()` already classifies file type. Two calls for the same file wastes latency and tokens.

## Implementation Plan
1. Modify `handleFileSelect()`: CSV/TSV path calls `analyzeWorkbook(file)` (same as Excel)
2. Keep `classifyFile()` as fallback only if `analyzeWorkbook()` fails
3. Preserve the `aiClassification` state for UI display (classification badge)
4. Ensure `parseAllSheets()` handles CSV correctly (SheetJS already does this)
5. File input: verify `multiple` attribute present for multi-file support
6. Classification signal capture: log accept/override actions on field mapping confirm
