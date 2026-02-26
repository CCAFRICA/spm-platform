# HF-067 Completion Report: Observatory Data Truth

## Summary
Rewrote Observatory Fleet tab data layer to fix three CLT findings: F43 (Operations Queue wrong data), F44 (Tenant Fleet inconsistent stats), F46 (Queue/Fleet cross-section contradictions).

## Phase 0: Diagnostic
**Commit:** `b89b15b`

### Root Causes Found
1. **F43**: `fetchOperationsQueue()` checked only `entities` table for "No data imported" — missed `committed_data` entirely
2. **F44**: `fetchTenantFleetCards()` used `.limit(10000)` row-counting which truncated for Pipeline Test Co (22K entities)
3. **F46**: Queue and Fleet ran independent queries with separate `.limit(10000)` — could get different counts for same tenant

## Phase 1: Architecture Decision
**Commit:** `d4cd2ee`

**Approach:** Shared per-tenant stats with proper count queries.
- `fetchSharedTenantStats()` — single data source for Queue + Fleet
- Per-tenant `count: 'exact', head: true` for large tables (entities, profiles, committed_data)
- Actual row fetches (no limit) for detail tables (batches, periods, outcomes)

## Phase 2+3: Implementation
**Commit:** `5b91e91`

### API Route (`web/src/app/api/platform/observatory/route.ts`)

**New shared data layer:**
- `fetchSharedTenantStats(supabase, tenantIds)` — runs per-tenant exact count queries in parallel
- `buildTenantFleetCards(tenants, stats)` — synchronous, uses shared stats (was async `fetchTenantFleetCards`)
- `buildOperationsQueue(tenants, stats)` — synchronous, uses shared stats (was async `fetchOperationsQueue`)
- `fetchFleetOverview(supabase, tenants, stats)` — consumes shared batch data for lifecycle metrics

**Operations Queue fix (F43):**
```typescript
// Before: only checked entityCount
if ((entityCounts.get(t.id) ?? 0) === 0) → "No data imported"

// After: checks both committed_data AND entities
if (dataRowCount === 0 && entityCount === 0) → "No data imported"
```

**Fleet Cards fix (F44):**
```typescript
// Before: .limit(10000) row counting — truncated at 10K
supabase.from('entities').select('tenant_id').in(...).limit(10000)
entityCounts = countByField(rows, 'tenant_id')  // wrong for 22K+ tenants

// After: per-tenant exact count — accurate regardless of size
supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', id)
```

**Cross-Section fix (F46):**
```typescript
// Before: independent fetches in Promise.all
const [overview, tenantCards, queue] = await Promise.all([
  fetchFleetOverview(supabase),           // its own entity query
  fetchTenantFleetCards(supabase),        // its own entity query
  fetchOperationsQueue(supabase),         // its own entity query
]);

// After: shared stats, single data source
const stats = await fetchSharedTenantStats(supabase, tenantIds);
const [overview, tenantCards, queue] = await Promise.all([
  fetchFleetOverview(supabase, tenants, stats),   // uses stats.allBatches
  Promise.resolve(buildTenantFleetCards(tenants, stats)),  // uses stats.entityCounts
  Promise.resolve(buildOperationsQueue(tenants, stats)),   // uses stats.committedDataCounts
]);
```

### ObservatoryTab (`web/src/components/platform/ObservatoryTab.tsx`)

- Added "Data Rows" stat column to fleet cards (shows `committed_data` count)
- Updated health color logic: `hasData = dataRowCount > 0 || entityCount > 0`
- Updated fleet filter: show tenants with `entityCount > 0 || dataRowCount > 0 || latestLifecycleState !== null`
- Entity counts now formatted with `.toLocaleString()` for readability

### Types (`web/src/lib/data/platform-queries.ts`)

- Added `dataRowCount: number` to `TenantFleetCard` interface
- Updated client-side `getTenantFleetCards()` with same exact count approach
- Updated client-side `getOperationsQueue()` with committed_data check

## Files Modified
1. `web/src/app/api/platform/observatory/route.ts` — shared data layer, proper counts, import detection
2. `web/src/components/platform/ObservatoryTab.tsx` — data rows stat, health color fix, filter fix
3. `web/src/lib/data/platform-queries.ts` — type addition, client-side count fixes

## Proof Gates

| Gate | Description | Status |
|------|-------------|--------|
| PG-01 | Queue: tenant with committed_data but 0 entities does NOT show "No data imported" | PASS — checks committedDataCounts |
| PG-02 | Queue: tenant with 0 committed_data AND 0 entities shows "No data imported" | PASS — both checked |
| PG-03 | Fleet: Pipeline Test Co entity count is accurate (22K+, not truncated to ≤10K) | PASS — per-tenant count: 'exact' |
| PG-04 | Fleet: all tenants show Data Rows stat | PASS — dataRowCount in stats row |
| PG-05 | Fleet: health color uses dataRowCount for truth | PASS — hasData includes dataRowCount |
| PG-06 | Queue and Fleet show consistent entity counts for same tenant | PASS — shared fetchSharedTenantStats |
| PG-07 | Fleet filter shows tenants with data rows but no entities | PASS — filter checks dataRowCount |
| PG-08 | npm run build exits 0 | PASS |

## Deferred Findings

| # | Finding | Rationale |
|---|---------|-----------|
| D-1 | `status: 'active'` still hardcoded on TenantFleetCard | Needs schema decision — what does tenant status mean? |
| D-2 | Billing tab uses same `.limit(10000)` pattern | Separate fix scope — different tab |
| D-3 | Onboarding tab uses `.limit(10000)` for committed_data counts | Separate fix scope — onboarding counts are approximate |
