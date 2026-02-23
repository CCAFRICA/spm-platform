# OB-85-cont Completion Report: Pipeline Proof — Zero to Payout

## Diagnostic Findings

### Root Cause: Period Selection, NOT Calculation Engine

The calculation engine was NEVER broken. The existing batch for period 2024-01 shows:
- **719 entities calculated**
- **Total payout: MX$1,262,864.65**
- **718/719 entities with non-zero payouts**
- **6 components per entity with real values**

The dashboard showed "$0" because:
1. `loadOperatePageData()` auto-selected **2024-07** (latest open period)
2. 2024-07 has **NO calculation batch** → empty outcomes
3. User saw "No calculation results for this period" → interpreted as $0

### Data Distribution by Period
| Period | committed_data rows | Sheet types | Notes |
|--------|-------------------|-------------|-------|
| 2024-01 | 37,009 | Datos Colaborador (719), Base_Venta_Individual (246), Base_Venta_Tienda (35) | Has calculations |
| 2024-02 | 37,431 | Same structure | No batch |
| 2024-03 | 37,577 | Same structure | No batch |
| 2024-04 | 1,778 | Base_Venta_Tienda only | Store-level zeros |
| 2024-05 | 1,778 | Base_Venta_Tienda only | Store-level zeros |
| 2024-06 | 1,778 | Base_Venta_Tienda only | Store-level zeros |
| 2024-07 | 1,778 | Base_Venta_Tienda only | Store-level zeros |

### Entity Table
- 22,215 entities exist with employee numbers as display_name and external_id
- Rule set has 2 variants: "certified" (6 components) and "non_certified" (6 components)

## Fixes Applied

### Mission 1: Smart Period Selection (page-loaders.ts)
- `loadOperatePageData(tenantId, periodKey?)` now accepts optional period
- Auto-selection priority: **explicit periodKey → period with latest batch → first open → most recent**
- This immediately shows 2024-01 results instead of empty 2024-07

### Mission 2: Period-Aware Reloading (operate/page.tsx)
- `handlePeriodSelect()` — clicking a period in the ribbon reloads batch/outcomes data
- `applyData()` helper centralizes state updates (DRY)
- Dashboard uses loader's smart selection for initial active key

### Mission 3: Entity Name Resolution (page-loaders.ts)
- Batch-specific entity query (only IDs in calculation results, paginated)
- Avoids Supabase 1000-row limit by querying only needed IDs
- Avoids redundant "12345 (12345)" when display_name == external_id
- Fallback to calculation_results.metadata for any missing entities

### Entity Table Population (scripts/ob85-fix-entities.ts)
- Confirmed entities table already has 22,215 records
- Display names are employee numbers (e.g., "96568046")
- External IDs populated from committed_data roster sheet

## Verification

### Build: PASS
```
npm run build → ✓ 0 errors
```

### Diagnostic Scripts
- `web/scripts/ob85-diagnose.ts` — Full pipeline trace
- `web/scripts/ob85-diagnose2.ts` — Targeted follow-up
- `web/scripts/ob85-fix-entities.ts` — Entity population

## What Andrew Should See Now

1. **Operate page**: Auto-selects **January 2024** (period with latest batch)
2. **Total Payout**: ~MX$1,262,864.65
3. **Entity Count**: 719
4. **Top 5 Entities**: Employee numbers (e.g., "96568046") with MX$ values
5. **Component Breakdown**: 6 components with aggregated payouts
6. **Period Ribbon**: Jan 2024 highlighted, shows "719 emp" and "PREVIEW" state
7. **Clicking other periods**: Reloads data for that period
8. **Reconcile button**: Links to reconciliation with batch ID

## Commit
- `8f03b8f` — OB-85-cont Mission 1-2: Fix data bridge — smart period selection + entity names
