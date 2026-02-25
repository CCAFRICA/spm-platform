# OB-99 Phase 0: Financial Module Performance Diagnostic

## Root Cause Confirmed

**`financial-data-service.ts` (1,176 lines)** fetches ALL ~46,700 cheque rows from `committed_data` via paginated client-side queries (1,000 rows per page = ~47 requests just for data), then aggregates entirely in JavaScript.

Every page function calls `fetchRawData()` which does:
```
while (true) {
  supabase.from('committed_data').select('entity_id, row_data')
    .eq('tenant_id', tenantId).eq('data_type', 'pos_cheque')
    .range(offset, offset + 999)
}
```

This produces 431 requests on Network Pulse and 1,409 on Product Mix.

## RPC Functions: DO NOT EXIST

- Zero migration files with `financial` function names
- Zero `.rpc()` calls in any financial page or service
- OB-96 designed the concept but never created the actual SQL functions

**Decision: Must create RPC functions from scratch.**

## Financial Pages Inventory (10 pages)

| Page | Route | Data Source | Direct DB? |
|------|-------|-------------|------------|
| Network Pulse | `/financial` | `loadNetworkPulseData()` | No (via service) |
| Location Detail | `/financial/location/[id]` | Direct Supabase queries | YES |
| Performance | `/financial/performance` | `loadPerformanceData()` | No (via service) |
| Staff | `/financial/staff` | `loadStaffData()` | No (via service) |
| Server Detail | `/financial/server/[id]` | Direct Supabase queries | YES |
| Timeline | `/financial/timeline` | `loadTimelineData()` | No (via service) |
| Patterns | `/financial/patterns` | `loadPatternsData()` | No (via service) |
| Summary | `/financial/summary` | `loadSummaryData()` | No (via service) |
| Leakage | `/financial/leakage` | `loadLeakageData()` | No (via service) |
| Product Mix | `/financial/products` | Direct Supabase queries | YES |

## CLT-98 Findings Mapped

| Finding | Status | Root Cause |
|---------|--------|------------|
| F-1: 431 requests | Confirmed | fetchRawData() paginated client-side |
| F-10: 1,409 requests | Confirmed | products/page.tsx direct queries |
| F-2: Brand/location disconnect | Confirmed | Flat grid, no grouping |
| F-3: Cents on large amounts | Confirmed | format() includes decimals |
| F-4: Blue border vs amber legend | Confirmed | border-left uses brand color (blue for Costa Azul), legend says amber |
| F-5: Legend too small | Confirmed | Tiny text at bottom of card |
| F-6: Cards not clickable | Confirmed | No onClick on Network Pulse location cards |
| F-7: Operate ICM-flavored | TBD | Need to check operate landing |
| F-8: No persona filtering | Confirmed | Zero usePersona in any financial page |
| F-9: Rep sees admin view | Confirmed | No persona-based routing |

## Color Logic Analysis

`getLocationBg()` in Network Pulse correctly uses green/amber/red backgrounds:
- `above` -> `bg-green-50 dark:bg-green-900/20`
- `within` -> `bg-amber-50 dark:bg-amber-900/20`
- `below` -> `bg-red-50 dark:bg-red-900/20`

BUT: `border-l-4` uses `borderLeftColor: location.brandColor` which is blue (#3b82f6) for Costa Azul brand. The prominent left border color conflicts with the legend's green/amber/red messaging.

**Fix:** Change border-left color to match the performance indicator (green/amber/red), move brand indicator to a small dot or badge.
