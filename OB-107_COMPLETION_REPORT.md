# OB-107 Completion Report: Import Pipeline Architecture Fix

## Summary

Fixed three systemic root causes in the import pipeline discovered by CLT-102 testing of the Caribe Financial walkthrough. All changes are backward-compatible — no existing tenant data was modified.

## Root Causes Resolved

### Root Cause 1: Classification Doesn't Propagate to Period Detection
**Problem**: AI correctly classifies roster sheets, but period detection still scans them, creating erroneous periods from HireDate columns.

**Fix** (Phase 2):
- `period-detector.ts`: Added `classification` field to `SheetInput`, skip `roster`/`unrelated` sheets
- `import/commit/route.ts`: Server-side period detection now reads sheet classification from `aiContext` and skips roster sheets
- `enhanced/page.tsx`: Passes classification from AI analysis to `detectPeriods()`

### Root Cause 2: Single-Plan Context Model
**Problem**: Import pipeline locks to one active plan for all files in a batch, even when tenant has multiple plans.

**Fix** (Phase 4):
- `enhanced/page.tsx`: Loads ALL active plans via `getRuleSets()`, shows plan selector dropdown when multiple plans exist
- User can switch plans per-file during the mapping step

### Root Cause 3: Field Mapper as Gate (Cosmetic)
**Problem**: Unmapped columns shown as "Unresolved" with red badge, implying data loss.

**Discovery**: The data layer already preserves ALL original columns in `committed_data.row_data` (line 543 of commit route). No data is lost.

**Fix** (Phase 2):
- Changed "Unresolved" badge to "Will be preserved" with blue styling
- Guarded `null` `matchedComponentConfidence` that was rendering as literal "% confidence"

### Signal Loop Closure (Phase 3)
**Problem**: `classification_signals` table was written to after every import, but never read back during subsequent imports. The learning loop was broken.

**Fix**:
- `enhanced/page.tsx`: Fetches prior signals via `GET /api/signals` before AI analysis
- `analyze-workbook/route.ts`: Accepts `priorMappings` parameter and appends to AI prompt as "PRIOR CONFIRMED FIELD MAPPINGS FOR THIS CUSTOMER"

## Caribe Financial Data Cleanup (Phase 5)

| Action | Count | Details |
|--------|-------|---------|
| Pre-2024 periods deleted | 1 | 2023-12 (created from roster HireDate) |
| Plans reactivated | 4 | Deposit Growth, CFG Insurance, Consumer Lending, Insurance Referral |
| Remaining periods | 3 | Jan-Mar 2024 |
| Active plans | 5 | All 5 Caribe plans now active |

## Integration Verification (Phase 6)

| Tenant | Periods | Plans | Data Rows | Entities | Status |
|--------|---------|-------|-----------|----------|--------|
| Óptica Luminar | 7 | 1 | 119,129 | 24,833 | Unchanged |
| Pipeline Proof Co | 7 | 1 | 119,129 | 22,215 | Unchanged |
| Caribe Financial | 3 | 5 | 98 | 25 | Cleaned |

## Files Modified

| File | Change |
|------|--------|
| `web/src/lib/import/period-detector.ts` | Skip roster/unrelated sheets |
| `web/src/app/api/import/commit/route.ts` | Server-side roster sheet skip |
| `web/src/app/data/import/enhanced/page.tsx` | Classification propagation, confidence fix, signal reading, multi-plan selector |
| `web/src/app/api/analyze-workbook/route.ts` | Prior mappings in AI prompt |

## Files Created

| File | Purpose |
|------|---------|
| `web/scripts/ob107-caribe-cleanup.ts` | Caribe period deletion + plan reactivation |
| `web/scripts/ob107-verify-tenants.ts` | Integration verification script |
| `OB-107_PHASE0_DIAGNOSTIC.md` | Pipeline diagnostic report |
| `OB-107_PHASE1_ARCHITECTURE_DECISION.md` | Architecture decision record |

## Commits

| SHA | Description |
|-----|-------------|
| `44922fa` | OB-107 prompt |
| `1218e95` | Phase 0: Diagnostic |
| `b8a0bad` | Phase 1: Architecture decision |
| `5cd6c66` | Phase 2: Classification propagation + confidence fix + UI |
| `1583a0e` | Phase 3: Signal loop closure |
| `9d15688` | Phase 4: Multi-plan routing |
| `df1870f` | Phase 5: Caribe data cleanup |

## Build Status

Final build: **PASS** — zero errors, zero warnings.
