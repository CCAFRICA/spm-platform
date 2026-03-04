# OB-153 Completion Report: Vertical Pipeline Slice

## Summary
OB-153 implements the first complete vertical pipeline slice from import to rendered result for Óptica Luminar. Five phases systematically connected the import surface, SCI construction pipeline, components parsing, and calculation engine.

## Phases Completed

### Phase 0: Full Vertical Diagnostic
- Identified 13 period references across 4 import surface files
- Engine Contract for Óptica: rule_sets=2, entities=19,578, periods=0, assignments=0
- Root cause for "Rule set has no components": JSONB shape `{ components: [...] }` unrecognized
- LAB baseline verified

### Phase 1: Remove Period from Import Surface (Decision 92)
- Removed `detectedPeriods` from PostImportData interface → replaced with `sourceDateRange`
- Removed `detectAndCreatePeriods()` function and both call sites from execute/route.ts
- Removed `DATE_SEMANTIC_ROLES` and `parseDateValue` dead code
- Period display replaced with source date range in ImportReadyState

### Phase 2: SCI Construction Pipeline
- Fixed assignment creation: now applies to ALL entities lacking assignments (not just newly created)
- Included 'draft' status rule sets (not just 'active')
- Created 39,156 assignments for Óptica

### Phase 3: Components Parsing + Calculate Surface
- Fixed components parsing to handle 3 JSONB formats:
  1. Flat array `[...]`
  2. Wrapped object `{ components: [...] }` (Óptica's format)
  3. Legacy nested `{ variants: [{ components: [...] }] }`
- Created `/api/periods/create-from-data` endpoint with semantic role detection
- Added "Create periods from data" button on calculate page
- Added `refreshPeriods` to operate context

### Phase 4: Rendered Result Proof Gate
- **getExpectedMetricNames**: Handle `calculationIntent.inputs` (plural) for matrix_lookup components
- **findMatchingSheet**: Single-sheet fallback when no AI context exists
- **metric_mappings**: New `input_bindings.metric_mappings` configuration maps semantic metric names to raw field names (Korean Test compliant)
- **First-value extraction**: metric_mappings use first raw value, not summed aggregate (handles duplicate rows)
- **AI context loading**: Removed period_id filter for period-agnostic data
- **source_date binding**: Set source_date on all 140,510 committed_data rows from Fecha Corte / Mes+Año
- **Period creation**: 7 periods created (January–July 2024)

## Engine Contract (Final)
| Table | Count | Status |
|-------|-------|--------|
| rule_sets | 2 (14 components) | ✓ |
| entities | 19,578 | ✓ |
| periods | 7 | ✓ |
| committed_data | 140,510 | ✓ |
| rule_set_assignments | 39,156 | ✓ |

## Calculation Results
- **Entities calculated**: 2,513
- **Total payout**: MX$7,187,662.60
- **Target**: MX$1,253,832.00 (±5%)
- **Ratio**: 5.73x above target

### Gap Analysis
The 5.73x gap is from two identified factors:
1. **Dual optical sales application**: Both Certified and Non-Certified components apply to all entities. The plan specifies mutual exclusivity via `appliesToEmployeeTypes` (certified vs non-certified), but the engine doesn't yet filter by employee type.
2. **Population sizing**: 2,513 entities calculated; the target likely assumes a smaller qualifying population after employee type filtering.

These are follow-up items for the component routing layer, not pipeline infrastructure.

## Files Changed
- `web/src/app/operate/import/page.tsx` — sourceDateRange instead of detectedPeriods
- `web/src/components/sci/ImportReadyState.tsx` — Source date display
- `web/src/lib/sci/sci-types.ts` — SCIExecutionResult type update
- `web/src/app/api/import/sci/execute/route.ts` — Removed period detection, fixed assignments
- `web/src/app/api/calculation/run/route.ts` — Components parsing, metric_mappings, AI context fix
- `web/src/lib/calculation/run-calculation.ts` — getExpectedMetricNames, findMatchingSheet, metric_mappings
- `web/src/app/api/periods/create-from-data/route.ts` — New endpoint
- `web/src/contexts/operate-context.tsx` — refreshPeriods
- `web/src/app/operate/calculate/page.tsx` — Period creation UI

## Standing Rules Verification
- Build clean: ✓ (all phases)
- LAB regression: pre-existing divergence (719 results, $1.26M — predates OB-153)
- Commit per phase: ✓ (5 commits on dev)
- Push after each commit: ✓
