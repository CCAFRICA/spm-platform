# OB-168 Phase 0: Permission Infrastructure Diagnostic

## 0A: Permission-Related Files (52 files)

Key files:
- `web/src/middleware.ts` — RESTRICTED_WORKSPACES role arrays (server-side)
- `web/src/components/auth/RequireRole.tsx` — Page-level role HOC (client-side)
- `web/src/lib/auth/role-permissions.ts` — WORKSPACE_ACCESS, PAGE_ACCESS, ACTION_PERMISSIONS
- `web/src/hooks/useCapability.ts` — Existing capability hooks (reads capabilities from profile)
- `web/src/contexts/auth-context.tsx` — AuthProvider, maps profile to User, has hasCapability
- `web/src/lib/access-control.ts` — Additional permission utilities
- 11 page files use RequireRole, 12+ API routes check role directly

## 0B: Middleware RESTRICTED_WORKSPACES

```typescript
const RESTRICTED_WORKSPACES: Record<string, string[]> = {
  '/admin':         ['platform'],
  '/operate':       ['platform', 'admin', 'tenant_admin'],
  '/configure':     ['platform', 'admin', 'tenant_admin'],
  '/configuration': ['platform', 'admin', 'tenant_admin'],
  '/govern':        ['platform', 'admin', 'tenant_admin'],
  '/data':          ['platform', 'admin', 'tenant_admin'],
  '/financial':     ['platform', 'admin', 'tenant_admin', 'manager'],
};
```

**Problem:** `vl_admin` role NOT in any list except implicitly via the profile that has `role='platform'`. But VL Admin has TWO profiles — one `vl_admin`, one `platform`. Which one loads depends on query ordering.

## 0C: RequireRole Usages (11 pages)

| Page | Roles |
|------|-------|
| `data/import/enhanced/page.tsx` | `['platform', 'admin']` |
| `configure/people/page.tsx` | `['platform', 'admin']` |
| `configure/users/page.tsx` | `['platform', 'admin']` |
| `configure/users/invite/page.tsx` | `['platform', 'admin']` |
| `govern/calculation-approvals/page.tsx` | `['platform', 'admin']` |
| `operate/import/page.tsx` | `['platform', 'admin']` |
| `operate/calculate/page.tsx` | `['platform', 'admin']` |
| `operate/results/page.tsx` | `['platform', 'admin']` |
| `operate/pay/page.tsx` | `['platform', 'admin']` |
| `admin/launch/calculate/page.tsx` | `['platform', 'admin']` |

## 0D: Storage Bucket Policies

Cannot query `pg_policies` via Supabase RPC (no `exec_sql` function).

From migration `010_import_storage_bucket.sql`:
- **`imports` bucket** — 3 policies:
  - "Tenant upload access" (INSERT, scoped to tenant_id folder)
  - "Tenant read access" (SELECT, scoped to tenant_id folder)
  - "VL Admin full storage access" (ALL, checks `role = 'vl_admin'`)
- **`ingestion-raw` bucket** — **ZERO policies in any migration**. Created via `/api/ingest/setup` route, which only creates the bucket — no RLS policies applied.

**ROOT CAUSE of CLT167-F05:** `ingestion-raw` bucket is private, has no INSERT policy → admin upload fails silently. The `imports` bucket VL Admin policy references `role = 'vl_admin'` which won't match if VL Admin has `role = 'platform'`.

## 0E: Role Counts (Production)

```json
{ "vl_admin": 1, "platform": 1, "admin": 1, "manager": 1, "viewer": 1 }
```

VL Admin (platform@vialuce.com) has **2 profiles**, same auth_user_id:
- Profile 1: role=`vl_admin`, tenant_id=NULL
- Profile 2: role=`platform`, tenant_id=NULL

Middleware uses `maybeSingle()` which returns ONE — behavior undefined when two match.

## 0F: BCL Tenant State

```
rule_sets: 0, entities: 85, committed_data: 170, calculation_results: 0, rule_set_assignments: 0
```

Plan import required to create rule_sets. Plan import blocked by storage RLS.

## 0G: Import Path Fragmentation

34 files reference import-related routes. Multiple paths exist:
- `/admin/launch/plan-import` — redirect to `/operate/import` (blocked by middleware)
- `/operate/import/enhanced` — redirect to `/operate/import`
- `/operate/import` — main SCI import page (CORRECT path)
- `/data/import/enhanced` — 4355-line page with RequireRole (STALE)
- `/data/import` — another import page (STALE)

## Additional Findings

1. **tenant-config API** (line 33): `profile.role !== 'platform'` — VL admin with `vl_admin` role gets 403 (CLT165-F06)
2. **ingest/setup API** (line 41): `profile.role !== 'platform'` — same issue
3. **Patricia's capabilities**: `['manage_rule_sets', 'import_data', 'manage_assignments', 'view_outcomes']` — already has `import_data` in profile, but nothing reads it for access control
4. **Role-permissions.ts**: Duplicates middleware logic, references stale roles (`tenant_admin`, `sales_rep`)
