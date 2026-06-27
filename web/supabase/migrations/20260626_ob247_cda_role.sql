-- Migration: OB-247 DS-032 Slice A — allow the 'cda' (Customer Data Administrator) role.
--
-- profiles.role is TEXT but constrained by profiles_role_canon (migration
-- supabase/migrations/017_ob204_user_contract_enforcement.sql) to a fixed role set.
-- The CDA is a new canonical role (permissions.ts: Role union + CANONICAL_ROLES), so
-- the constraint must admit it before a CDA profile can be created (the seed surfaced
-- this — a 'cda' insert violated profiles_role_canon).
--
-- The new set is a SUPERSET: it preserves every role string the app legitimately writes
-- — the 5 canonical roles AND the aliases that resolveRole() accepts and writers store
-- (e.g. /api/auth/signup writes 'tenant_admin'; PLATFORM_ROLE_VALUES stores 'vl_admin')
-- — then adds 'cda'. This guarantees the ADD does not abort on existing rows and does
-- not break signup, while keeping the OB-204 anti-garbage intent (unknown roles rejected).
-- Idempotent: drop-if-exists then re-add.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_canon;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_canon
  CHECK (role IN (
    'platform', 'vl_admin',          -- platform (canonical + alias)
    'admin', 'tenant_admin',         -- tenant admin (canonical + alias; signup writes tenant_admin)
    'manager',
    'member', 'individual', 'sales_rep', -- member (canonical + aliases)
    'viewer',
    'cda'                            -- OB-247: Customer Data Administrator
  ));
