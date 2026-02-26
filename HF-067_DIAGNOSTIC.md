# HF-067 Phase 0: Observatory Diagnostic — Ground Truth vs Displayed Truth

## Scope
Three findings from CLT review: F43 (Operations Queue wrong data), F44 (Tenant Fleet inconsistent stats), F46 (Queue/Fleet cross-section contradictions).

## Files Analyzed
1. `web/src/app/api/platform/observatory/route.ts` — Server-side data fetching (3 fleet functions)
2. `web/src/components/platform/ObservatoryTab.tsx` — Client rendering + filtering
3. `web/src/lib/data/platform-queries.ts` — Type definitions (FleetOverview, TenantFleetCard, OperationsQueueItem)

## Root Cause: F43 — Operations Queue Shows "No Data Imported" for Tenants WITH Data

### Ground Truth
`fetchOperationsQueue()` (line 258-335) determines "No data imported" by checking:
```typescript
if ((entityCounts.get(t.id) ?? 0) === 0) {
  items.push({ message: `No data imported yet (created ${daysSinceCreation}d ago)`, ... });
}
```

### Bug
`entityCounts` comes from `countByField()` on entities rows fetched with `.limit(10000)`. It queries ONLY the `entities` table — NOT `import_batches` or `committed_data`. A tenant like Pipeline Test Co has 119K committed_data rows but the queue only checks entity count.

If a tenant has:
- committed_data rows (data WAS imported) but
- entity count is 0 (entities not yet resolved, or entities beyond the 10K limit)

...the queue incorrectly shows "No data imported yet."

### Fix Required
Query `import_batches` and/or `committed_data` counts per tenant. A tenant has imported data if `import_batches.count > 0` OR `committed_data.count > 0`, regardless of entity count.

## Root Cause: F44 — Tenant Fleet Shows Contradictory Stats

### Ground Truth
`fetchTenantFleetCards()` (line 179-256) builds fleet cards with:
- `entityCount`: from `countByField()` on entities fetched with `.limit(10000)`
- `status`: HARDCODED to `'active'` (line 244)
- `latestLifecycleState`: from most recent `calculation_batches` row

### Bug 1: `.limit(10000)` Truncates Entity Counts
All 5 bulk queries use `.limit(10000)`:
```typescript
supabase.from('entities').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
supabase.from('profiles').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
...
```
If tenants collectively have >10K entities, the counts are wrong. Pipeline Test Co alone has 22K entities — its count gets truncated, and smaller tenants after it in the result set may show 0.

### Bug 2: Status is Always "active"
Line 244: `status: 'active'` — this is hardcoded, never derived from data. The `TenantFleetCard` type has a `status` field but it's meaningless.

### Bug 3: Missing Data Sources
Fleet cards don't query:
- `import_batches` — whether data was imported
- `committed_data` — how much data exists
- `rule_sets` — whether plans exist

This means the card can show RECONCILE lifecycle state (from a calculation batch) but 0 entities (from truncated query), which is contradictory.

### Fix Required
1. Replace `.limit(10000)` entity/profile counts with proper `count: 'exact'` aggregation queries
2. Add `import_batches` and `committed_data` count queries per tenant
3. Derive `status` from actual data (has entities? has batches? has recent activity?)

## Root Cause: F46 — Queue/Fleet Cross-Section Contradictions

### Ground Truth
`fetchOperationsQueue()` and `fetchTenantFleetCards()` fetch data INDEPENDENTLY:
- Queue: queries `entities` + `calculation_batches` with its own `.limit(10000)` calls
- Fleet: queries `entities` + `profiles` + `periods` + `calculation_batches` + `entity_period_outcomes` with its own `.limit(10000)` calls
- Overview: queries `entities` (count:exact) + `calculation_batches` + `committed_data` (count:exact) + etc.

### Bug
Because Queue and Fleet run separate queries, they can get different entity counts for the same tenant (different rows returned within the 10K limit). Queue says "No data imported" while Fleet shows entities > 0 for the same tenant.

### Fix Required
Factor out a shared data fetch that both Queue and Fleet consume. Use proper `count: 'exact'` queries instead of fetching rows and counting client-side.

## Architecture Decision

**Approach: Shared per-tenant stats + proper count queries**

1. Create `fetchPerTenantStats()` that runs once and returns per-tenant: entityCount (exact), profileCount (exact), importBatchCount (exact), committedDataCount (exact), latestBatch, latestPeriod
2. Both `fetchOperationsQueue()` and `fetchTenantFleetCards()` consume these shared stats
3. Replace `countByField()` on fetched rows with proper Supabase `count: 'exact', head: true` per-tenant queries
4. For counts: use individual count queries per tenant (Supabase `.in()` doesn't support `count: 'exact'` with grouping) — batch with Promise.all, respecting the ≤200 `.in()` limit

## Deferred
- D-1: `status` field on TenantFleetCard — needs schema decision (what does "active" mean?)
- D-2: Billing tab also uses `.limit(10000)` — same truncation bug, separate fix
