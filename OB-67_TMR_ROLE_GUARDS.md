# OB-67: TMR ROLE GUARDS + USER PROVISIONING + PAGE STATUS INDICATORS

Prompt committed for traceability. See git history for full prompt.

## Deliverables
1. TMR Role Guards — Middleware + component-level authorization
2. User Provisioning — Entity-to-user promotion + invite flow + user management table
3. Page Status Indicators — Sidebar badges showing page readiness

## Key Files to Create
- `web/src/lib/auth/role-permissions.ts`
- `web/src/components/auth/RequireRole.tsx`
- `web/src/app/unauthorized/page.tsx`
- `web/src/app/configure/users/page.tsx`
- `web/src/app/api/users/invite/route.ts`
- `web/src/app/api/users/update-role/route.ts`
- `web/src/lib/navigation/page-status.ts`

## Standing Rules
- profiles.id != auth.uid() — always use auth_user_id
- entities.profile_id -> profiles.id (NOT profiles.entity_id)
- Check SCHEMA_TRUTH.md before any Supabase query
