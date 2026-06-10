-- HF-282 Phase 4 — Single-profile canon: dedup + uniqueness on profiles.auth_user_id.
--
-- ARCHITECT-APPLIED (SR-44): paste into Supabase Dashboard SQL Editor. CC verifies
-- post-application via tsx read (EPG-4). CC authored + committed this file only.
--
-- FP-49 schema basis (information_schema/pg_catalog not reachable via PostgREST service
-- role; verified via live row introspection + generated types + live censuses):
--   profiles columns: id, tenant_id, auth_user_id, display_name, email, role,
--     capabilities, locale, avatar_url, created_at, updated_at
--   NO unique constraint on auth_user_id (proven: duplicates present)
--   FK refs to profiles.id from {profile_scope, audit_logs, entities}.profile_id = 0
--     for every duplicate id (Phase 0.2 census)
--
-- Korean Test / AP-25: no email/account literals in predicates — structural only.
-- Emails appear ONLY in comments. role compared via the alias set (mirror of
-- permissions.ts ROLE_ALIASES: 'platform' and 'vl_admin' normalize to platform).
--
-- ============================================================================
-- HALT-2 (Phase 0.2 duplicate census returned a group BEYOND platform@):
--   auth_user_id 11596f62-1da9-466d-8561-aa436a0805cf  (tdelcarlo@vialuce.ai)
--   has TWO 'tenant_admin' rows in DIFFERENT tenants
--   (07638678-... 2026-05-15  AND  03d28288-... 2026-06-09)
--   = a genuine MULTI-TENANT membership, semantically unlike platform@'s
--     role-inheritance duplicate. A UNIQUE(auth_user_id) constraint is
--     INCOMPATIBLE with multi-tenant membership.
--   This migration does NOT author a DELETE for that group (HALT-2). The
--   assertion in STEP 3 will FAIL LOUD on it, forcing architect disposition:
--     (a) collapse tdelcarlo to one surviving tenant row (add a DELETE here), OR
--     (b) make the constraint UNIQUE(auth_user_id, tenant_id) and adopt a
--         multi-tenant identity model (reopens the A/B question — HALT-4).
--   Do not run STEPs 3-4 until (a) or (b) is chosen.
-- ============================================================================

BEGIN;

-- STEP 1 — FK guard (HALT-1). Assert zero references to any row this migration would
-- delete (the platform-inheritance non-keeper rows). Phase 0.2 proved 0; re-assert.
DO $$
DECLARE ref_count int;
BEGIN
  WITH groups AS (
    SELECT auth_user_id FROM public.profiles
    GROUP BY auth_user_id
    HAVING COUNT(*) > 1 AND bool_or(role IN ('platform','vl_admin'))
  ),
  ranked AS (
    SELECT p.id,
      row_number() OVER (
        PARTITION BY p.auth_user_id
        ORDER BY (CASE
          WHEN p.role = 'platform' AND p.id = p.auth_user_id THEN 0
          WHEN p.role = 'platform'                            THEN 1
          WHEN p.role IN ('platform','vl_admin') AND p.id = p.auth_user_id THEN 2
          WHEN p.role IN ('platform','vl_admin')             THEN 3
          ELSE 4 END), p.created_at ASC
      ) AS rn
    FROM public.profiles p JOIN groups g ON g.auth_user_id = p.auth_user_id
  ),
  doomed AS (SELECT id FROM ranked WHERE rn > 1)
  SELECT
    (SELECT COUNT(*) FROM public.profile_scope WHERE profile_id IN (SELECT id FROM doomed))
  + (SELECT COUNT(*) FROM public.audit_logs    WHERE profile_id IN (SELECT id FROM doomed))
  + (SELECT COUNT(*) FROM public.entities      WHERE profile_id IN (SELECT id FROM doomed))
  INTO ref_count;
  IF ref_count > 0 THEN
    RAISE EXCEPTION 'HF-282 HALT-1: % FK reference(s) point at platform-inheritance rows to be deleted; re-point before delete', ref_count;
  END IF;
END $$;

-- STEP 2 — Platform-inheritance dedup (DISPOSITIONED class = platform@).
-- For each auth_user_id group with >1 row AND at least one row normalizing to platform,
-- keep the canonical row (raw role='platform' with id=auth_user_id preferred; this is
-- the row the running system resolves and resolveIdentity's winner), delete the rest.
-- tdelcarlo's group does NOT qualify (no platform/vl_admin row) and is untouched here.
WITH groups AS (
  SELECT auth_user_id FROM public.profiles
  GROUP BY auth_user_id
  HAVING COUNT(*) > 1 AND bool_or(role IN ('platform','vl_admin'))
),
ranked AS (
  SELECT p.id,
    row_number() OVER (
      PARTITION BY p.auth_user_id
      ORDER BY (CASE
        WHEN p.role = 'platform' AND p.id = p.auth_user_id THEN 0
        WHEN p.role = 'platform'                            THEN 1
        WHEN p.role IN ('platform','vl_admin') AND p.id = p.auth_user_id THEN 2
        WHEN p.role IN ('platform','vl_admin')             THEN 3
        ELSE 4 END), p.created_at ASC
    ) AS rn
  FROM public.profiles p JOIN groups g ON g.auth_user_id = p.auth_user_id
)
DELETE FROM public.profiles WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
-- ^ Deletes platform@'s vl_admin row (fd146488..., 2026-03-05); keeps the platform row
--   (9c179b53..., id=auth_user_id, 2026-03-07). No privilege escalation (the LOWER-priv
--   vl_admin-alias row is removed; both normalize to platform so no access lost).

-- STEP 3 — Assert ZERO duplicate groups remain. FAILS LOUD on tdelcarlo until
-- dispositioned (HALT-2). Do not delete this guard.
DO $$
DECLARE dup_groups int;
BEGIN
  SELECT COUNT(*) INTO dup_groups FROM (
    SELECT auth_user_id FROM public.profiles GROUP BY auth_user_id HAVING COUNT(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION 'HF-282 HALT-2: % duplicate auth_user_id group(s) remain (expected 0). The platform-inheritance class is deduped; any remainder (e.g. the multi-tenant tdelcarlo group) requires architect disposition before the unique constraint can be created.', dup_groups;
  END IF;
END $$;

-- STEP 4 — Uniqueness constraint (only reached when STEP 3 passes, i.e. 0 dups).
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside this BEGIN/COMMIT block. At this
-- table size the non-concurrent form is acceptable (HF-282 §4.1). If the architect
-- prefers CONCURRENTLY, run STEPs 1-3 in this transaction, COMMIT, then run the
-- CONCURRENTLY form OUTSIDE a transaction. Record which ran in the completion report.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_uq ON public.profiles (auth_user_id);

-- STEP 5 — Post-assert: index exists + zero duplicates.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='profiles' AND indexname='profiles_auth_user_id_uq') THEN
    RAISE EXCEPTION 'HF-282: profiles_auth_user_id_uq index missing after creation';
  END IF;
END $$;

COMMIT;
