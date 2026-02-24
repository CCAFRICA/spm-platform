# OB-93 Phase 0: N+1 Query Diagnostic

## Key Findings

### 0A: Total Supabase Query Sites
**582** total `.from()` call sites across the codebase.

### 0B: Queries by Table (most queried = most duplicated)
| Table | Query Sites |
|-------|-------------|
| profiles | 46 |
| calculation_batches | 41 |
| entities | 40 |
| tenants | 38 |
| periods | 27 |
| rule_sets | 26 |
| entity_period_outcomes | 23 |
| calculation_results | 18 |
| committed_data | 16 |
| usage_metering | 15 |
| classification_signals | 14 |
| import_batches | 11 |
| rule_set_assignments | 11 |
| disputes | 10 |
| audit_logs | 5 |
| approval_requests | 3 |
| platform_settings | 3 |
| calculation_traces | 2 |

Top duplicated: `profiles` (46), `calculation_batches` (41), `entities` (40), `tenants` (38)

### 0C: Component-Level Supabase Calls
**0 components create their own Supabase client.**

All component-level DB access goes through contexts, hooks, or imported service modules.
This is BETTER than expected — the N+1 pattern is NOT from components independently querying.

### 0D: Context Providers That Fetch
| Context | Queries |
|---------|---------|
| locale-context.tsx | 2 |
| persona-context.tsx | 3 |
| tenant-context.tsx | 2 |
| auth-context.tsx | 1 |
| operate-context.tsx | 3 |

5 of 8 contexts contain direct Supabase queries (11 total).

### 0E: Pages with Direct Supabase Calls
| Page Route | Direct Queries |
|------------|---------------|
| /performance/adjustments | **17** |
| /configure/users | 4 |
| /configure/people | 3 |
| /configure/users/invite | 3 |
| /operations/audits/logins | 3 |
| /operations/audits | 3 |
| /data/import/enhanced | 3 |
| /login | 3 |
| /signup | 2 |
| /financial/staff | 2 |
| /operate/results | 2 |
| /transactions/orders | 2 |
| /performance/approvals | 2 |
| /insights/disputes | 1 |
| /insights/performance | 1 |
| /financial/performance | 1 |
| /financial/timeline | 1 |
| /admin/launch/calculate | 1 |
| /admin/launch/plan-import | 1 |
| /admin/audit | 1 |
| /data/transactions | 1 |

**21 pages** with direct queries. `/performance/adjustments` is the worst with 17.

### 0F: Existing Contexts
8 context files: auth, config, locale, navigation, operate, period, persona, tenant.

### 0G: Service Files
49 service/loader/query files across `web/src/lib/`.
1 page-loader file (`web/src/lib/data/page-loaders.ts`) already exists.

## Root Cause Analysis

The N+1 pattern manifests differently than initially assumed:
1. **Components are clean** — zero create their own Supabase client
2. **Multiple contexts fire independently** — 5 contexts make 11 queries on mount
3. **Pages bypass service layer** — 21 pages query Supabase directly
4. **Service file sprawl** — 49 service files, many querying the same tables
5. **No consolidated session data** — tenant/profile/counts fetched independently across contexts
6. **Duplicate fetches across contexts** — tenant-context and auth-context both query `tenants`/`profiles`

## Fix Strategy
1. SessionContext consolidates: tenant, profile, counts (fetched ONCE at auth)
2. Existing page-loaders.ts enhanced with loaders for pages that lack them
3. 21 pages refactored to use loaders instead of direct queries
4. Context deduplication — reduce overlap between auth/tenant/persona/locale
