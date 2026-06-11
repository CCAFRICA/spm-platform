-- 20260611120000_ob203_phase2_atom_fingerprint_extension.sql
-- OB-203 Phase 2 (DS-027 R1 / DI-8 / DI-9 / DI-10) — atom-granularity extension of the
-- fingerprint store. HALT-7 bound: this migration extends `structural_fingerprints` to
-- atom (per-column) granularity and carries the construction-algorithm version with a
-- bridge. NO new tables; NO signal-table changes (the one canonical signal surface,
-- classification_signals, is untouched — G7).
--
-- ── (a) SQL VERIFICATION GATE (live read, 2026-06-11; service-role tsx) ──
-- structural_fingerprints columns (sampled types), 22 rows:
--   id text(uuid), tenant_id text(uuid), fingerprint text, fingerprint_hash text,
--   classification_result jsonb, column_roles jsonb, match_count int, confidence numeric,
--   source_file_sample text, created_at timestamptz, updated_at timestamptz, import_batch_id null
-- Confirmed ABSENT pre-migration: granularity, scope, algorithm_version, atom_features.
-- (information_schema is not PostgREST-exposed in VP; the service-role column read is the gate.)
--
-- ── (b) SCOPE: atom extension + algorithm_version, with bridge ONLY ──
--   granularity      — 'sheet' (existing composite rows) | 'atom' (per-column rows)
--   algorithm_version— DI-9 construction-algorithm version; the DEFAULT 1 + granularity
--                      default 'sheet' BRIDGE the 22 existing rows (sheet-level, algo v1) so
--                      accumulated recognition stays reachable — never stranded by future algo change.
--   atom_features    — bucketed structural features of ONE column (the atom): type, cardinality
--                      bucket, repeat-ratio bucket, pattern flags. DI-10-safe by construction
--                      (buckets/booleans only; never raw values). This is the atom row's data home.
--   scope            — required to express the DI-10 guard (d): 'tenant' | 'foundational' | 'vertical'.

ALTER TABLE public.structural_fingerprints
  ADD COLUMN granularity       text     NOT NULL DEFAULT 'sheet',
  ADD COLUMN algorithm_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN scope             text     NOT NULL DEFAULT 'tenant',
  ADD COLUMN atom_features     jsonb;

-- domain guards
ALTER TABLE public.structural_fingerprints
  ADD CONSTRAINT structural_fingerprints_granularity_chk CHECK (granularity IN ('sheet','atom')),
  ADD CONSTRAINT structural_fingerprints_scope_chk       CHECK (scope IN ('tenant','foundational','vertical'));

-- ── (d) DI-10 STRUCTURAL GUARD ──
-- Foundational/vertical (cross-tenant) rows may NOT hold any raw or tenant-identifying value.
-- Every raw-capable column (source_file_sample = file name; classification_result, column_roles
-- = header-keyed) MUST be NULL for non-tenant scope. A foundational/vertical fingerprint is
-- therefore structural by construction (atom_features buckets/flags only) — anonymization is a
-- property of the row's shape, not a post-hoc scrub. Existing rows are scope='tenant' → unaffected.
ALTER TABLE public.structural_fingerprints
  ADD CONSTRAINT structural_fingerprints_di10_chk
  CHECK (
    scope = 'tenant'
    OR (source_file_sample IS NULL AND classification_result IS NULL AND column_roles IS NULL)
  );

-- ── (c) TENANT SCOPING / atom lookup support ──
-- Atom rows are tenant-scoped (tenant_id NOT NULL, unchanged). Atom reads/writes filter
-- granularity + algorithm_version; this composite index serves the per-(tenant, atom-hash,
-- version) lookup. Sheet rows are read with granularity='sheet' in code (no collision: atom
-- hashes are single-column, sheet hashes composite).
CREATE INDEX IF NOT EXISTS structural_fingerprints_atom_idx
  ON public.structural_fingerprints (tenant_id, fingerprint_hash, granularity, algorithm_version);

-- ── (e) ROLLBACK ──
-- BEGIN;
--   DROP INDEX IF EXISTS public.structural_fingerprints_atom_idx;
--   ALTER TABLE public.structural_fingerprints
--     DROP CONSTRAINT IF EXISTS structural_fingerprints_di10_chk,
--     DROP CONSTRAINT IF EXISTS structural_fingerprints_scope_chk,
--     DROP CONSTRAINT IF EXISTS structural_fingerprints_granularity_chk,
--     DROP COLUMN IF EXISTS atom_features,
--     DROP COLUMN IF EXISTS scope,
--     DROP COLUMN IF EXISTS algorithm_version,
--     DROP COLUMN IF EXISTS granularity;
-- COMMIT;
