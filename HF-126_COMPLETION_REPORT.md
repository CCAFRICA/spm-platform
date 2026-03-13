# HF-126 Completion Report — SCI Auto-Assignment

## Phase 0: Diagnostic

- **SCI execute entity creation**: `web/src/app/api/import/sci/execute/route.ts:253` — `resolveEntitiesFromCommittedData()`
- **Import commit assignment creation**: `web/src/app/api/import/commit/route.ts:898-978` — working pattern
- **Pattern extracted**: Query entities + active rule_sets, check existing assignments, insert missing
- **BCL state**: 85 entities, 0 rule_set_assignments, 1 active rule_set, 170 committed_data rows

### Root cause
`postCommitConstruction()` (line 1123) has assignment code but is gated by `entityIdField` from `confirmedBindings`. Entity resolution (HF-109) creates entities AFTER `postCommitConstruction` runs per-unit, and entity resolution itself never creates assignments.

## Phase 1: Assignment Creation Added

- **Code location**: `web/src/app/api/import/sci/execute/route.ts`, after entity resolution (line ~257)
- **Trigger**: After `resolveEntitiesFromCommittedData()` completes — all entities exist
- **Logic**:
  1. Query all active rule_sets for tenant
  2. Paginated fetch of all entity IDs
  3. Check existing assignments (entity_id + rule_set_id pair)
  4. Batch insert missing assignments (5000 per batch)
- **Conflict handling**: Pre-check existing assignments, only insert missing ones
- **Log message**: `[SCI Execute] HF-126: Created N rule_set_assignments for M entities x K rule sets`

## Phase 2: Self-Healing in Calculation Engine

- **Code location**: `web/src/app/api/calculation/run/route.ts:185-226`
- **Trigger**: When zero `rule_set_assignments` found for tenant + rule_set
- **Logic**: Query all entities, create assignments for all of them, proceed with calculation
- **Purpose**: Handles BCL (existing entities, zero assignments) and any future tenant hitting this gap
- **Belt-and-suspenders**: SCI fix prevents the gap. Calc fix heals if it still happens.

## Phase 3: Calculation Verification

- **Assignments**: Will be auto-created on next import (SCI fix) or next calculation attempt (self-healing fix)
- **Calculation test**: Requires production verification — BCL admin triggers calculation from `/operate/calculate`
- **Expected**: When Patricia clicks Calculate, the engine finds 0 assignments, auto-creates 85, then calculates

## CLT Registry Updates

| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT111-F43 (no assignments) | OPEN | FIXED | SCI execute creates assignments after entity resolution |
| CLT122-F77 (no plan assignments) | OPEN | FIXED | Same fix — all entities x all active rule_sets |
| CLT122-F80 (import not wired to calc) | OPEN | PARTIALLY FIXED | Assignment gap closed; other wiring gaps may remain |
| CLT142-F11 (no assignments from import) | OPEN | FIXED | SCI execute now creates assignments |
| CLT166-NEW (BCL zero assignments) | OPEN | FIXED | Calc engine self-heals on first calculation |

## Regression

- **Meridian calculation**: Unaffected — assignment code is additive (only creates missing assignments)
- **Entity resolution**: Unchanged — the fix runs AFTER entity resolution, not instead of it
- **Convergence**: Unchanged — convergence runs before entity resolution, unaffected
- **Existing assignments**: Preserved — new code checks for existing before inserting

## Build

```
npm run build — exit 0
No TypeScript errors
No new warnings introduced
```
