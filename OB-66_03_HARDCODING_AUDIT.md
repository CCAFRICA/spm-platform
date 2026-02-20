# OB-66 Phase 3: Hardcoding Audit

## AP-5/AP-6 Violations — Hardcoded Field Names

### CRITICAL: Spanish field names in logic code

| File | Line(s) | Fields | Severity |
|------|---------|--------|----------|
| `web/src/app/data/import/enhanced/page.tsx` | 483-2789 | Field mapping dictionaries with Spanish patterns | HIGH |
| `web/src/lib/supabase/data-service.ts` | 592-622 | `'año'`, `'ano'`, `'mes'`, `'fecha'`, `'periodo'` in field arrays | CRITICAL |
| `web/src/lib/ingestion/validation-service.ts` | 269-341 | `'fecha'` in header detection, `'monto'` in amount detection | HIGH |
| `web/src/lib/financial/types.ts` | 210, 250 | `'fecha'` mapping | MEDIUM |
| `web/src/lib/financial/financial-constants.ts` | 75, 102 | `'fecha'` in constants | MEDIUM |
| `web/src/lib/financial/articulos-parser.ts` | 124 | `'fecha'` in switch case | MEDIUM |
| `web/src/lib/financial/cheque-parser.ts` | 183, 223 | `'fecha'` in parsing | MEDIUM |
| `web/src/lib/forensics/ai-forensics.ts` | 40 | `'empleado'` in field matching | HIGH |
| `web/src/lib/ai/file-classifier.ts` | 126 | `'empleado'` in header matching | HIGH |
| `web/src/lib/import-pipeline/smart-mapper.ts` | 57 | `'fecha'` in date field mapping | HIGH |
| `web/src/components/forensics/ComparisonUpload.tsx` | 299 | `'id_empleado'`, `'empleado'` in patterns | HIGH |
| `web/src/lib/reconciliation/comparison-depth-engine.ts` | 361 | `'tienda'` in row accessor | MEDIUM |

**Total AP-5/AP-6 violations:** 12 files, ~30+ individual hardcoded field names

### Hardcoded Field Arrays (post HF-053 cleanup)

| File | Line | Array | Status |
|------|------|-------|--------|
| `web/src/app/api/import/commit/route.ts` | 36 | `ENTITY_ID_TARGETS` | CLEAN — generic IDs only |
| `web/src/app/api/import/commit/route.ts` | 40 | `PERIOD_TARGETS` | CLEAN — generic IDs only |
| `web/src/app/api/import/commit/route.ts` | 41 | `YEAR_TARGETS` | CLEAN — generic IDs only |
| `web/src/app/api/import/commit/route.ts` | 42 | `MONTH_TARGETS` | CLEAN — generic IDs only |

**Note:** Commit route was cleaned in HF-053. But `data-service.ts:592-622` still has the old Spanish arrays.

## AP-7 Violations — Hardcoded Confidence Scores

| File | Line | Value | Context |
|------|------|-------|---------|
| `data/import/enhanced/page.tsx` | 708-710 | `0.80`, `0.85`, `0.90`, `0.95` | COMPOUND_PATTERNS regex confidence |
| `admin/launch/plan-import/page.tsx` | 413 | `50` | Fallback confidence when AI unavailable |
| `lib/import/period-detector.ts` | various | `0-100` | Calculated from data coverage (not hardcoded) |

**Total AP-7 violations:** 2 files with hardcoded confidence values

## ICM-Specific Language in Shared Components

| File | Line(s) | Term | Should Be |
|------|---------|------|-----------|
| `components/financial/transaction-table.tsx` | various | `'Sales Rep'`, `'Commission'` | entity, payout |
| `components/financial/manual-entry-form.tsx` | various | `'Sales Representative'`, `'Commission'` | entity, payout |
| `components/financial/summary-cards.tsx` | various | `'Avg Commission Rate'` | avg payout rate |
| `components/layout/user-menu.tsx` | various | `'Sales Rep'` | entity/participant |
| `components/acceleration/badge-display.tsx` | various | `'quota-crusher'` | target-achievement |
| `components/bulk/BulkSelectionBar.tsx` | various | `'payout'` | outcome |
| `components/disputes/GuidedDisputeFlow.tsx` | various | compensation, incentive, payout | outcome, result |
| `components/disputes/DisputeResolutionForm.tsx` | various | `compensation` | outcome |
| `components/navigation/command-palette/CommandPalette.tsx` | various | `"my compensation"` | my outcomes |
| `components/reconciliation/ReconciliationTracePanel.tsx` | various | `totalIncentive` | totalOutcome |

**Total ICM language violations:** 10 component files

## Domain-Specific Logic (should be AI-driven)

### Hardcoded Component Names

| File | Line | Names | Severity |
|------|------|-------|----------|
| `data/import/enhanced/page.tsx` | 618 | `'insurance_sales'` | HIGH |
| `components/compensation/ComponentBreakdownCard.tsx` | 30, 39 | `'collections'` in icon/color map | HIGH |
| `lib/calculation/results-formatter.ts` | 245 | `'comp-collections'`, `'Collections'`, `'Cobranza'` | CRITICAL |

### Role String Matching (CGMX-specific)

| File | Line(s) | Pattern | Severity |
|------|---------|---------|----------|
| `lib/reconciliation/employee-reconciliation-trace.ts` | 81-601 | `'CERTIFICADO'` string matching for `isCertified` | CRITICAL |
| `admin/reconciliation-test/page.tsx` | 36, 106 | `isCertified` display | MEDIUM |
| `components/reconciliation/ReconciliationTracePanel.tsx` | 121 | `isCertified` display | MEDIUM |
| `lib/test/ob-15-calculation-test-cases.ts` | 26-103 | `'optometrista'` role, `isCertified: true` | LOW (test) |

## Violation Summary

| Severity | Count | Category |
|----------|-------|----------|
| CRITICAL | 4 | Spanish field names in service layers, hardcoded business logic |
| HIGH | 10 | Spanish field names in parsers, ICM language in components |
| MEDIUM | 8 | Financial module parsers, role display strings |
| LOW | 1 | Test data |
| **TOTAL** | **23** | |

---
*OB-66 Phase 3 — February 19, 2026*
