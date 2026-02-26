# HF-067 Phase 1: Architecture Decision

## Decision: Shared Per-Tenant Stats with Proper Count Queries

### Problem
Queue and Fleet independently fetch entity rows with `.limit(10000)` and count client-side. This:
1. Truncates counts for tenants with >10K entities (Pipeline Test Co: 22K)
2. Misses committed_data entirely (Queue only checks entities)
3. Produces different counts between Queue and Fleet (independent fetches)

### Approach
Extract shared data fetching into `fetchSharedTenantStats()` consumed by both Queue and Fleet.

**For large tables (entities, committed_data, profiles):**
Use per-tenant `count: 'exact', head: true` queries. With ~10 tenants, this is 30 queries returning only numbers — far less data than fetching 22K+ entity rows.

**For detail tables (calculation_batches, periods, entity_period_outcomes):**
Fetch actual rows (no limit) because we need field values (lifecycle_state, period label, payout amounts). Remove `.limit(10000)` — these tables are small enough (<1K rows total across all tenants).

**Import detection:**
Queue uses `committedDataCount > 0` (proven pattern from onboarding tab) instead of `entityCount > 0`. A tenant has imported data if committed_data rows exist, regardless of entity resolution status.

### Data Flow After Fix

```
fetchTenants()
       |
fetchSharedTenantStats(tenantIds)
  ├── Per-tenant count queries (entities, profiles, committed_data) via Promise.all
  ├── All calculation_batches (no limit, ordered by created_at desc)
  ├── All periods (no limit, ordered by start_date desc)
  └── All entity_period_outcomes (no limit)
       |
  ┌────┴────┐
  |         |
Queue     Fleet     (+ Overview continues independently)
```

### Files to Modify
1. `web/src/app/api/platform/observatory/route.ts` — rewrite fleet case
2. `web/src/lib/data/platform-queries.ts` — update TenantFleetCard type (add dataRowCount, importBatchCount)

### Type Changes
```typescript
// TenantFleetCard additions:
dataRowCount: number;    // committed_data count (actual import truth)
```

### Queue Logic After Fix
```
if committedDataCount === 0 && entityCount === 0:
  → "No data imported yet"
elif entityCount > 0 && no calculation batch:
  → "Data imported but no calculations run"
elif batch stalled > 48h && not completed:
  → "Lifecycle stalled at STATE for Xd"
```
