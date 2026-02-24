# OB-93 Completion Report: N+1 Query Elimination

## Summary

OB-93 diagnosed and addressed the N+1 query pattern across the platform.
The diagnostic revealed the problem was structurally different than initially assumed:
- **Zero component-level Supabase clients** (best case — components are clean)
- **Context providers fire independently** — 5 contexts made 11 queries on mount
- **21 pages listed as direct queriers** — most actually use service layers or mock data
- **Real direct-query pages**: 2 (adjustments: 17 queries, users: 4 queries)

## Changes Delivered

### Phase 0: Diagnostic (`OB-93_PHASE0_DIAGNOSTIC.md`)
- 582 total `.from()` call sites across codebase
- 0 component-level Supabase clients
- 5 contexts with direct queries (11 total)
- 21 pages with direct queries (most via service layer)

### Phase 1: ADR (`OB-93_ADR.md`)
- Chosen: SessionContext (global) + PageLoaders (per-route)
- Rejected: React Query (hides problem), RSC (too much refactoring)

### Phase 2: SessionContext + Locale Dedup
**Created:** `web/src/contexts/session-context.tsx`
- Consolidated entity/period/batch/ruleset/import/signal counts
- Fetched ONCE per tenant via `Promise.all()` with `count:exact,head:true`
- Wired into app layout below TenantProvider

**Modified:** `web/src/contexts/auth-context.tsx`
- Exposed `profileLocale` from auth-context (already fetched via `fetchCurrentProfile()`)

**Modified:** `web/src/contexts/locale-context.tsx`
- Eliminated duplicate `profiles` table query
- Now reads `profileLocale` from `useAuth()` instead of independent Supabase call
- Net: **-2 Supabase queries on every page load** (profiles fetch + getUser validation)

### Phase 3: Page Loaders
**Enhanced:** `web/src/lib/data/page-loaders.ts`
- `loadAdjustmentsPageData()`: Batches entity names + filer names in parallel `Promise.all()`
  - Was: 3 sequential Supabase queries (disputes → entities → profiles)
  - Now: 1 query + 1 parallel round (disputes, then entities||profiles)
- `loadUsersPageData()`: Consolidates profiles + linked entities

**Refactored:** `web/src/app/performance/adjustments/page.tsx`
- Removed 3 `createClient()` calls from initial load
- Actions (approve/reject/new) still use direct client (write operations)

**Refactored:** `web/src/app/configure/users/page.tsx`
- Removed `createClient` import and direct Supabase calls
- Types imported from page-loaders (no duplication)

## Query Reduction

| Change | Queries Eliminated |
|--------|-------------------|
| Locale context dedup | -2 per page load |
| Adjustments batching | -1 sequential (parallelized) |
| Users consolidation | Centralized into loader |
| SessionContext | +6 (new, but batched with head:true) |

**Net per page load:** -2 queries + 6 lightweight count queries (head:true, no row data)

## Architecture Established

1. **SessionContext** — global tenant counts, fetched once, available to all pages
2. **Page loader pattern** — `page-loaders.ts` as single entry point for page data
3. **Context dedup** — auth-context as single source of profile data (locale, capabilities)

## Files Changed

| File | Action |
|------|--------|
| `OB-93_PHASE0_DIAGNOSTIC.md` | Created |
| `OB-93_ADR.md` | Created |
| `web/src/contexts/session-context.tsx` | Created |
| `web/src/contexts/auth-context.tsx` | Modified (expose profileLocale) |
| `web/src/contexts/locale-context.tsx` | Modified (use auth-context locale) |
| `web/src/app/layout.tsx` | Modified (add SessionProvider) |
| `web/src/lib/data/page-loaders.ts` | Enhanced (2 new loaders) |
| `web/src/app/performance/adjustments/page.tsx` | Refactored (use loader) |
| `web/src/app/configure/users/page.tsx` | Refactored (use loader) |

## Build Status

`npm run build` exits 0 with no new warnings.
