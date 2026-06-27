-- Migration: OB-247 DS-032 Slice A — allow the 'cda' (Customer Data Administrator) role.
--
-- profiles.role is TEXT but constrained by profiles_role_canon (migration 017,
-- OB-204 user-contract enforcement) to the canonical operator roles. The CDA is a
-- new canonical role (permissions.ts: Role union + CANONICAL_ROLES), so the
-- constraint must admit it before a CDA profile can be created. This is the ONLY
-- DB change OB-247 needs (the CDA reuses the OB-245 file_objects/storage objects).
--
-- Idempotent: drop-if-exists then re-add with 'cda' appended.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_canon;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_canon
  CHECK (role IN ('platform', 'admin', 'manager', 'member', 'viewer', 'cda'));
