# HF-021: Reconciliation Smart Upload -- AI-Powered File Comparison

Prompt persisted per Rule 29. See git history for full prompt content.

## Completion Report

### Phase Summary

| Phase | Commit | Description |
|-------|--------|-------------|
| P1 | `37ea6b9` | Smart file parser (CSV, TSV, XLSX, XLS, JSON) with preview table |
| P2 | `93ec595` | AI column mapping via AIService.classifySheet() with training signals |
| P3 | `9de0af1` | User confirmation dialog with override dropdowns and confidence badges |
| P4 | `ff13a25` | Comparison engine with three-population delta classification |
| P5 | `f2fcece` | CSV export with per-component columns and summary statistics |
| P6 | `084aaa3` | Human-readable batch selector labels |

### Files Created

| File | Purpose |
|------|---------|
| `src/lib/reconciliation/smart-file-parser.ts` | Multi-format file parser using SheetJS |
| `src/lib/reconciliation/ai-column-mapper.ts` | AI-powered column classification with training signals |
| `src/lib/reconciliation/comparison-engine.ts` | Per-employee, per-component delta comparison |

### Files Modified

| File | Change |
|------|--------|
| `src/app/admin/launch/reconciliation/page.tsx` | Complete rewrite -- smart upload flow with AI mapping, confirmation, comparison results, CSV export |

### Hard Gate Evidence

| Gate | Rule | Evidence |
|------|------|----------|
| HG-01 | `import * as XLSX from 'xlsx'` | smart-file-parser.ts:15 |
| HG-02 | Preview shows ALL columns | Preview table renders `parsedFile.headers.map()` -- no hardcoded column names |
| HG-03 | AI column mapping through AIService | ai-column-mapper.ts:76 uses `aiService.classifySheet()` |
| HG-04 | Training signals captured | ai-column-mapper.ts:121 uses `signalService.recordUserAction()` |
| HG-05 | User can override AI mappings | page.tsx Phase 3 confirmation card with per-column Select dropdowns |
| HG-06 | Three populations: matched, file-only, vl-only | comparison-engine.ts:143-197 |
| HG-07 | Delta classification: exact, tolerance, amber, red | comparison-engine.ts:213-219 thresholds 0/5%/15% |
| HG-08 | Per-component breakdown | comparison-engine.ts:224-258 `compareComponents()` |
| HG-09 | CSV export includes all data | page.tsx `handleExportCSV()` with headers, components, summary |
| HG-10 | Bilingual labels (en-US / es-MX) | page.tsx labels object with both locales |
| HG-11 | No hardcoded column names (Korean Test) | All column references from `parsedFile.headers` or AI mappings |
| HG-12 | Graceful AI degradation | ai-column-mapper.ts:100-108 try/catch with fallback to heuristic |
| HG-13 | VL Admin access control | page.tsx:283 `isVLAdmin(user)` check |
| HG-14 | Build passes cleanly | `npm run build` succeeds with no errors |

### Architecture

```
Upload File --> Smart Parser --> AI Column Mapper --> User Confirmation
                  |                   |                     |
                  v                   v                     v
            ParsedFile          ColumnMapping[]       mappingConfirmed
                  \                   |                     /
                   +------ Run Comparison ----------------+
                                  |
                                  v
                          ComparisonResult
                         /        |        \
                   Summary   Employees[]   Export CSV
                   Cards     Table+Dialog  Download
```

### Delta Classification Thresholds

| Flag | Range | Color |
|------|-------|-------|
| exact | 0% | Emerald |
| tolerance | <= 5% | Emerald |
| amber | 5-15% | Amber |
| red | > 15% | Red |

### Three Populations

| Population | Description | Badge Color |
|------------|-------------|-------------|
| matched | Employee in both file and VL | Flag-dependent |
| file_only | In file but not in VL | Orange |
| vl_only | In VL but not in file | Purple |
