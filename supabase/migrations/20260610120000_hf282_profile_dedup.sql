-- HF-282 Phase 4 (amended) — Profile dedup. One auth user -> one profiles row, by
-- DEDUP only. The UNIQUE(auth_user_id) constraint is REMOVED from this migration
-- (architect HALT-2 disposition, 2026-06-10): it is incompatible with the current
-- tenant-create creator-profile insert path, and the Platform-Created-Users model
-- that would make it safe is unestablished — the constraint moves to that OB.
-- Until then, uniqueness is READER-enforced (resolveIdentity), not data-enforced.
--
-- ARCHITECT-APPLIED (SR-44): paste into Supabase Dashboard SQL Editor. CC verifies
-- post-application via tsx read (EPG-4). CC authored + committed this file only.
--
-- FP-49 schema basis (information_schema/pg_catalog not reachable via PostgREST service
-- role; verified via live row introspection + generated types + live censuses):
--   profiles columns: id, tenant_id, auth_user_id, display_name, email, role,
--     capabilities, locale, avatar_url, created_at, updated_at
--   FK refs to profiles.id from {profile_scope, audit_logs, entities}.profile_id = 0
--     for every duplicate id (Phase 0.2 census; re-asserted in STEP 1 below)
--
-- Korean Test / AP-25: no email/account literals in DELETE predicates — structural
-- only. The specific ids/emails appear ONLY in comments (this is the one-time
-- data-reconciliation migration; resolution logic stays literal-free).
--
-- ============================================================================
-- HALT-2 disposition (architect, 2026-06-10):
--   Group A — auth_user_id 9c179b53-... (platform@vialuce.com): role-inheritance
--     duplicate. Keep the canonical 'platform' row (id=auth_user_id, 2026-03-07);
--     delete the 'vl_admin' row (id=fd146488-..., 2026-03-05). [STEP 2a]
--   Group B — auth_user_id 11596f62-... (tdelcarlo@vialuce.ai): TWO 'tenant_admin'
--     rows in different tenants (ids 407ef5eb-... 2026-05-15 and 315ab173-...
--     2026-06-09) = SANDBOX ARTIFACTS. Delete BOTH rows. [STEP 2b]
--     NOTE: auth user 11596f62-... becomes a zero-profile orphan post-delete —
--     added to the HF-282 orphan disposition list.
-- ============================================================================

BEGIN;

-- STEP 1 — FK guard (HALT-1). Assert zero references to ANY row this migration deletes:
--   (i) platform-inheritance non-keepers (Group A), and
--   (ii) all rows of any non-platform duplicate group (Group B).
-- Phase 0.2 proved 0 for every duplicate id; re-assert before deleting.
DO $$
DECLARE ref_count int;
BEGIN
  WITH plat_groups AS (
    SELECT auth_user_id FROM public.profiles
    GROUP BY auth_user_id
    HAVING COUNT(*) > 1 AND bool_or(role IN ('platform','vl_admin'))
  ),
  plat_ranked AS (
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
    FROM public.profiles p JOIN plat_groups g ON g.auth_user_id = p.auth_user_id
  ),
  nonplat_groups AS (
    SELECT auth_user_id FROM public.profiles
    GROUP BY auth_user_id
    HAVING COUNT(*) > 1 AND NOT bool_or(role IN ('platform','vl_admin'))
  ),
  doomed AS (
    SELECT id FROM plat_ranked WHERE rn > 1
    UNION
    SELECT p.id FROM public.profiles p JOIN nonplat_groups g ON g.auth_user_id = p.auth_user_id
  )
  SELECT
    (SELECT COUNT(*) FROM public.profile_scope WHERE profile_id IN (SELECT id FROM doomed))
  + (SELECT COUNT(*) FROM public.audit_logs    WHERE profile_id IN (SELECT id FROM doomed))
  + (SELECT COUNT(*) FROM public.entities      WHERE profile_id IN (SELECT id FROM doomed))
  INTO ref_count;
  IF ref_count > 0 THEN
    RAISE EXCEPTION 'HF-282 HALT-1: % FK reference(s) point at rows to be deleted; re-point before delete', ref_count;
  END IF;
END $$;

-- STEP 2a — Platform-inheritance dedup (Group A = platform@).
-- Keep the canonical 'platform' row (id=auth_user_id preferred); delete the rest.
WITH plat_groups AS (
  SELECT auth_user_id FROM public.profiles
  GROUP BY auth_user_id
  HAVING COUNT(*) > 1 AND bool_or(role IN ('platform','vl_admin'))
),
plat_ranked AS (
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
  FROM public.profiles p JOIN plat_groups g ON g.auth_user_id = p.auth_user_id
)
DELETE FROM public.profiles WHERE id IN (SELECT id FROM plat_ranked WHERE rn > 1);
-- ^ Deletes platform@'s vl_admin row (fd146488..., 2026-03-05); keeps the platform row
--   (9c179b53..., id=auth_user_id, 2026-03-07). No privilege escalation (lower-priv alias
--   row removed; both normalize to platform, no access lost).

-- STEP 2b — Sandbox-artifact removal (Group B = tdelcarlo, HALT-2 disposition).
-- Delete BOTH rows of any duplicate auth_user_id group with NO platform-normalized row.
-- Structural predicate (no email/id literal in logic); the only such group is
-- auth_user_id 11596f62-... (tdelcarlo@vialuce.ai, ids 407ef5eb-... and 315ab173-...).
DELETE FROM public.profiles
WHERE auth_user_id IN (
  SELECT auth_user_id FROM public.profiles
  GROUP BY auth_user_id
  HAVING COUNT(*) > 1 AND NOT bool_or(role IN ('platform','vl_admin'))
);

-- STEP 3 — Assert ZERO duplicate groups remain (now passes: A deduped, B removed).
DO $$
DECLARE dup_groups int;
BEGIN
  SELECT COUNT(*) INTO dup_groups FROM (
    SELECT auth_user_id FROM public.profiles GROUP BY auth_user_id HAVING COUNT(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION 'HF-282: % duplicate auth_user_id group(s) remain after dedup (expected 0)', dup_groups;
  END IF;
END $$;

-- STEP 4/5 (UNIQUE INDEX + post-assert) — REMOVED (architect HALT-2 disposition).
-- The UNIQUE(auth_user_id) constraint is incompatible with the current tenant-create
-- creator-profile insert path; it moves to the Platform-Created-Users OB. Uniqueness
-- remains READER-enforced (resolveIdentity) until that OB establishes the model.

COMMIT;
