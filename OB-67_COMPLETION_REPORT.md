# OB-67 Completion Report: TMR Role Guards + User Provisioning + Page Status Indicators

**Date:** 2026-02-20
**Status:** COMPLETE — 17/17 proof gates pass
**Build:** Clean (0 errors, warnings only)
**Dev server:** localhost:3000 responds (307 → login redirect)

---

## Commits (10 total)

| Commit | Phase | Description |
|--------|-------|-------------|
| af56097 | — | Commit prompt for traceability |
| c493ee3 | 0 | Diagnostic — current auth state audit |
| 15685d8 | 1 | Architecture decision — hybrid middleware + HOC |
| 9ed9833 | 2 | Role permission config + RequireRole HOC + useCanPerform hook |
| 7960a75 | 3 | Middleware workspace authorization + /unauthorized page |
| 994350b | 4 | Role guards on 9 critical pages + RequireRole wrappers |
| 29ec45b | 5 | User management table + inline role editing + role update API |
| 857d35d | 6 | User invite flow — form, entity linking, atomic cleanup |
| e620216 | 7 | Page status indicators — taxonomy, config, sidebar badges |
| d6c7c52 | 8 | Fix build errors — Capability type + SVG prop |

---

## Files Created (10)

| File | Purpose |
|------|---------|
| `web/src/lib/auth/role-permissions.ts` | Central permission config (workspace, page, action levels) |
| `web/src/components/auth/RequireRole.tsx` | HOC + useCanPerform hook for page/action authorization |
| `web/src/app/unauthorized/page.tsx` | "Access Restricted" page for blocked workspace access |
| `web/src/app/configure/users/page.tsx` | User management table (search, filter, inline role edit) |
| `web/src/app/configure/users/invite/page.tsx` | User invite form + unlinked entity promotion |
| `web/src/app/api/users/update-role/route.ts` | PATCH API for inline role changes (profiles + auth metadata) |
| `web/src/lib/navigation/page-status.ts` | Page status taxonomy (60+ pages classified) |
| `OB-67_TMR_GUARDS_AND_USER_PROVISIONING.md` | Prompt traceability |
| `OB-67_DIAGNOSTIC.md` | Phase 0 auth state audit |
| `OB-67_ARCHITECTURE_DECISION.md` | Phase 1 hybrid approach decision |

## Files Modified (12)

| File | Changes |
|------|---------|
| `web/src/middleware.ts` | Added RESTRICTED_WORKSPACES + workspace-level role check |
| `web/src/app/api/platform/users/invite/route.ts` | Added entity linking, role in user_metadata, atomic cleanup |
| `web/src/components/navigation/Sidebar.tsx` | StatusBadge component, page status indicators |
| `web/src/app/admin/launch/calculate/page.tsx` | RequireRole wrapper (vl_admin, admin) |
| `web/src/app/admin/launch/reconciliation/page.tsx` | RequireRole wrapper (vl_admin) |
| `web/src/app/admin/launch/plan-import/page.tsx` | RequireRole wrapper (vl_admin, admin) |
| `web/src/app/admin/launch/page.tsx` | RequireRole wrapper (vl_admin) |
| `web/src/app/operate/pay/page.tsx` | RequireRole wrapper (vl_admin, admin) |
| `web/src/app/operate/results/page.tsx` | RequireRole wrapper (vl_admin, admin) |
| `web/src/app/govern/calculation-approvals/page.tsx` | RequireRole wrapper (vl_admin, admin) |
| `web/src/app/data/import/enhanced/page.tsx` | RequireRole wrapper (vl_admin, admin) |
| `web/src/app/configure/people/page.tsx` | RequireRole wrapper (vl_admin, admin) |

---

## Architecture: Three-Layer Authorization

```
Layer 1: Middleware (server-side)
  └─ RESTRICTED_WORKSPACES → role from JWT user_metadata → redirect /unauthorized

Layer 2: RequireRole HOC (client-side)
  └─ Wraps page component → checks user.role against allowed list → shows unauthorized message

Layer 3: useCanPerform hook (inline)
  └─ Action-level checks → hide/disable buttons based on role capabilities
```

**Role resolution priority:** `user_metadata.role` → DB profiles.role (fallback, restricted workspaces only)

---

## Proof Gates: 17/17 PASS

| Gate | Test | Result |
|------|------|--------|
| PG-1 | role-permissions.ts exists | PASS |
| PG-2 | RequireRole component exists | PASS |
| PG-3 | useCanPerform hook exports | PASS — `export function useCanPerform` at line 65 |
| PG-4 | Middleware checks workspace access | PASS — 6 pattern matches in middleware.ts |
| PG-5 | /unauthorized page exists | PASS |
| PG-6 | ≥11 pages wrapped with RequireRole | PASS — 11 files found |
| PG-7 | User management page exists | PASS |
| PG-8 | User invite API exists | PASS — at api/platform/users/invite/route.ts |
| PG-9 | Invite creates profile + auth user | PASS — 4 pattern matches (inviteUserByEmail, createServiceRoleClient, profiles.insert) |
| PG-10 | Atomic cleanup on profile failure | PASS — deleteUser found in invite route |
| PG-11 | Entity-to-user query uses profile_id | PASS — 5 profile_id references in users page |
| PG-12 | Page status config exists | PASS |
| PG-13 | Sidebar renders status indicators | PASS — 4 status badge pattern matches |
| PG-14 | Role update API exists | PASS |
| PG-15 | Zero entity_id references on profiles | PASS — 0 matches in users/ directory |
| PG-16 | Build clean | PASS — `npm run build` exit 0 |
| PG-17 | Dev server responds | PASS — localhost:3000 returns 307 (redirect to login) |

---

## Key Design Decisions

1. **Hybrid authorization** — Middleware for workspace-level (fast, server-side), RequireRole HOC for page-level (client-side, flexible), useCanPerform for action-level (inline)
2. **JWT role preferred** — Middleware reads role from `user_metadata` first (zero DB calls), falls back to profiles query only for restricted workspaces when metadata is missing
3. **useAuth() not usePersona()** — PersonaContext doesn't expose raw role string; AuthContext provides `user.role`
4. **Atomic cleanup** — If profile creation fails after auth user creation, auth user is deleted to prevent orphaned records
5. **Entity-to-user promotion** — Invite page shows unlinked entities (profile_id IS NULL) for one-click account creation with entity linking
