# OB-168 Completion Report — DS-014 Phase 1: Permission Infrastructure

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `473971de` | Permission diagnostic + ADR |
| 1 | `ccab1801` | permissions.ts — single source of truth |
| 2 | `3f283643` | RequireCapability + useHasCapability |
| 3 | `4f063abb` | Storage RLS migration (requires SQL Editor execution) |
| 4 | `4c1f2dcb` | Capability-based middleware + import consolidation |
| 5 | `8d170747` | All pages migrated to RequireCapability |
| 6 | `0cbc5451` | Sidebar navigation derived from capabilities |
| 7 | (this commit) | Build verification + completion report |

## Files Changed

### New Files
- `web/src/lib/auth/permissions.ts` — DS-014 capability matrix (308 lines)
- `web/src/components/auth/RequireCapability.tsx` — Page-level capability guard
- `web/src/hooks/useHasCapability.ts` — Inline capability check hook
- `web/supabase/migrations/021_ingestion_raw_storage_policies.sql` — Storage RLS
- `OB-168_DIAGNOSTIC.md` — Phase 0 diagnostic
- `OB-168_ADR.md` — Architecture Decision Record

### Modified Files (18)
- `web/src/middleware.ts` — RESTRICTED_WORKSPACES → canAccessWorkspace()
- `web/src/types/navigation.ts` — Added requiredCapability to WorkspaceRoute
- `web/src/lib/navigation/workspace-config.ts` — Capabilities on all routes
- `web/src/lib/auth/role-permissions.ts` — Stale path cleanup
- `web/src/lib/navigation/queue-service.ts` — Import path consolidation
- `web/src/lib/navigation/command-registry.ts` — Import path consolidation
- `web/src/lib/navigation/acceleration-hints.ts` — Import path consolidation
- `web/src/lib/navigation/page-status.ts` — Stale path cleanup
- `web/src/components/navigation/Sidebar.tsx` — Import path consolidation
- `web/src/app/api/platform/tenant-config/route.ts` — hasCapability check
- `web/src/app/api/ingest/setup/route.ts` — hasCapability check
- 10 page files — RequireRole → RequireCapability

## Hard Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-01 | permissions.ts exports hasCapability, getCapabilities, CANONICAL_ROLES | **PASS** | `grep -n "export" permissions.ts` → lines 18, 20, 62, 84, 224, 252, 287, 301 |
| PG-02 | RequireCapability component exists and compiles | **PASS** | `grep -rn "RequireCapability" web/src/components/` → RequireCapability.tsx exists |
| PG-03 | useHasCapability hook exists and compiles | **PASS** | `grep -rn "useHasCapability" web/src/hooks/` → useHasCapability.ts exists |
| PG-04 | Storage RLS policy allows admin INSERT on ingestion-raw | **REQUIRES MANUAL SQL** | Migration 021 written. Cannot execute — no Supabase access token or DB password. |
| PG-05 | Zero RESTRICTED_WORKSPACES references | **PASS** | `grep -rn "RESTRICTED_WORKSPACES" web/src/` → exit code 1 (zero matches) |
| PG-06 | Zero RequireRole usage in app pages | **PASS** | `grep -rn "RequireRole" web/src/app/` → exit code 1 (zero matches) |
| PG-07 | Middleware uses hasCapability from permissions.ts | **PASS** | Lines 22, 229: `import { canAccessWorkspace, resolveRole, WORKSPACE_CAPABILITIES }` |
| PG-08 | Build exits 0 with zero errors | **PASS** | `npm run build` → exit 0, Middleware 75.4 kB |
| PG-09 | localhost responds | **DEFERRED** | Build succeeded; dev server start deferred to Andrew |
| PG-10 | Role aliases handled | **PASS** | `ROLE_ALIASES: vl_admin→platform, tenant_admin→admin, individual→member, sales_rep→member` |
| PG-11 | VL Admin profile survives | **PASS** | Queried: platform@vialuce.com, auth_user_id=9c179b53, role=platform, tenant_id=NULL |
| PG-12 | tenant-config API uses hasCapability | **PASS** | Line 34: `hasCapability(profile.role, 'platform.view_all_tenants')` |

## Soft Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-S1 | Sidebar items have requiredCapability | **PASS** | All routes in workspace-config.ts have requiredCapability field |
| PG-S2 | All import paths converge to /operate/import | **PASS** | Only comments reference stale paths (data/import/page.tsx, OB-12 test) |

## CLT Findings Addressed

| Finding | Status | How |
|---------|--------|-----|
| CLT118-F1 | FIXED | RequireCapability('data.calculate') replaces role array |
| CLT165-F06 | FIXED | tenant-config API uses hasCapability, not role === 'platform' |
| CLT166-F05 | FIXED | Same as CLT118-F1 |
| CLT167-F01 | FIXED | Sidebar Plan Import → /operate/import |
| CLT167-F02 | FIXED | ALL 34 import references audited and consolidated |
| CLT167-F03 | FIXED | /operate/import/enhanced → redirect → /operate/import (single path) |
| CLT167-F04 | FIXED | 3 import paths consolidated to 1 (/operate/import) |
| CLT167-F05 | REQUIRES SQL | Migration 021 written, needs SQL Editor execution |
| CLT167-F06 | REQUIRES SQL | Depends on F05 (storage upload must succeed first) |

## Issues

1. **Storage RLS migration not executed** — `021_ingestion_raw_storage_policies.sql` written but cannot be applied. No `exec_sql` RPC function, no Supabase access token, no database password available in the environment. **Action required:** Execute the SQL in Supabase SQL Editor.

2. **VL Admin duplicate profiles** — platform@vialuce.com has TWO profiles (role='vl_admin' and role='platform'). The `maybeSingle()` query may return either. The `resolveRole` function handles both values, but the duplicate should be cleaned up.

## Compliance

- **G1 (SOC2/RBAC):** Single authorization matrix is auditable
- **G2 (Architecture):** Four enforcement layers read from one source
- **G3 (Traceability):** role → capability → access is explicit in permissions.ts
- **G4 (RBAC literature):** Sandhu et al. 1996 — role-permission matrix
- **Anti-patterns:** Zero violations (FP-69, FP-72, FP-71, FP-21 all prevented)

## Build

```
npm run build — exit 0
No TypeScript errors
Middleware: 75.4 kB
18 files changed
```
