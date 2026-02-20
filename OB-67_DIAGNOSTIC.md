# OB-67 Phase 0: Diagnostic — Current Auth State

## Current Auth Infrastructure

### PersonaContext (persona-context.tsx)
- Derives `persona`: admin | manager | rep (3 personas)
- Exposes: persona, tokens, scope, profileId, entityId
- Does NOT expose raw profile.role
- Admin detection: role === 'vl_admin' || role === 'admin'
- Scope: canSeeAll for admins, visible_entity_ids from profile_scope for others

### AuthContext (auth-context.tsx)
- Exposes: user (with .role), capabilities, isVLAdmin, hasPermission, hasCapability
- User roles: vl_admin, admin, manager, sales_rep (4 roles)
- Maps profile to User via mapProfileToUser()
- VL Admin: role === 'vl_admin' OR capabilities includes 'manage_tenants'
- Existing hasPermission() and hasCapability() methods

### Middleware (middleware.ts)
- Auth check only — redirects unauthenticated to /login
- Public paths: /login, /signup, /landing, /auth/callback, /api/auth, /api/health, /api/calculation/run, /api/platform/flags
- NO workspace-level role checking
- Already reads user via supabase.auth.getUser()
- Reads profile on /login redirect to determine VL Admin

### Access Control (access-control.ts)
- MODULE_ACCESS: maps roles → AppModule[] (4 roles: sales_rep, manager, admin, vl_admin)
- ROUTE_TO_MODULE: maps routes → modules (~15 routes)
- Sidebar uses accessControl.getAccessibleModules(user) for filtering
- canAccessModule(), canAccessRoute() helpers exist

### Sidebar (Sidebar.tsx)
- Uses accessControl.getAccessibleModules() for filtering
- vlAdminOnly flag on Admin children (launch, plan-import, calculate, reconciliation)
- Feature flags gate Financial module
- NO page status indicators

### Existing Role Guards (9 pages)
| Page | Guard |
|------|-------|
| /admin/launch/calculate | isVLAdmin(user) or role === 'admin' |
| /govern/calculation-approvals | isVLAdmin(user) or role === 'admin' |
| /transactions/[id] | isAdmin check for edit capability |
| /performance/approvals/plans | role-based response mapping |
| /performance/plans/[id] | canEdit/canApprove by role |
| /workforce/personnel | canAccessModule(user, 'personnel') |

### Existing Invite API
- `/api/platform/users/invite/route.ts` — already functional
- Uses service role client, inviteUserByEmail with fallback to createUser
- Creates profile with role + capabilities
- VL Admin only (checks caller role)
- Missing: atomic cleanup (doesn't delete auth user if profile fails)
- Missing: entity linking
- Missing: role in user_metadata for JWT

### Role Mapping Issue
- SCHEMA_TRUTH roles: vl_admin, admin, tenant_admin, manager, viewer
- TypeScript UserRole: vl_admin, admin, manager, sales_rep
- Gap: tenant_admin and viewer not in TS types
- Solution: Add to UserRole type OR map at auth boundary

## Gaps Identified
1. Middleware: zero role checking (any auth user can hit /admin/*)
2. Only 6 pages with any form of role guard
3. No RequireRole HOC — each page rolls its own check
4. No /unauthorized page
5. No page status indicators in sidebar
6. No user management table (only invite API)
7. Existing invite API lacks entity linking + atomic cleanup
8. Role not stored in user_metadata (can't read from JWT in middleware)
