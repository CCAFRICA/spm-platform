-- HF-196 Phase 1E: Import Batch Supersession Schema (Path B-prime)
-- Architecture:
--   Rule 30 (LOCKED 2026-02-14) — Lifecycle Immutability for OFFICIAL+ batches
--   OB-42 Phase 4 (LOCKED 2026-02-16, HG-9) — supersession columns precedent on calculation_batches
--   DS-017 (LOCKED 2026-03-18) — Adaptive Immunity / Tier 1 Exact Match within-tenant
--   D154/D155 (LOCKED 2026-04-27) — single canonical declaration of structural primitives
--   Memory Entry 30 (LOCKED 2026-05-02) — Progressive Performance constitutional commitment
-- Compliance:
--   SOC 2 CC6.1 (logical access controls + audit log integrity)
--   SOC 2 CC7.2 (records cannot be modified or destroyed)
--   GDPR Article 30 + LGPD Article 37 (records of processing activities preserved)
--   DS-014 (access control architecture; existing RLS unchanged)
-- Match identifier: (tenant_id, fingerprint_hash) per DS-017
-- Lookup path B-prime: structural_fingerprints JOIN import_batches WHERE superseded_by IS NULL
--   (fingerprint identity stays on the fingerprint table — single canonical surface preserved)
-- Audit trail extension: superseded_at + supersession_reason added beyond OB-42 Phase 4 precedent
--   (which lacks these audit columns — substrate-vs-state divergence flagged for HF-198 candidate work
--    item; not addressed in HF-196 scope)
-- Apply via Supabase Dashboard SQL Editor (architect-only, per memory).

BEGIN;

-- 1. import_batches — Rule 30 supersession columns (4 new)
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES import_batches(id),
  ADD COLUMN IF NOT EXISTS supersedes UUID REFERENCES import_batches(id),
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supersession_reason TEXT;

-- 2. structural_fingerprints — link to creator import_batch (D154/D155 single canonical surface)
--    Fingerprint identity stays on this table; supersession lookup JOINs through here.
ALTER TABLE structural_fingerprints
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES import_batches(id);

-- 3. Indexes
-- 3a. Operative-batch lookup per tenant (engine queries filter on this)
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_operative
  ON import_batches (tenant_id)
  WHERE superseded_by IS NULL;

-- 3b. Supersession-chain traversal (find prior batches that have been superseded)
CREATE INDEX IF NOT EXISTS idx_import_batches_superseded_by
  ON import_batches (superseded_by)
  WHERE superseded_by IS NOT NULL;

-- 3c. Supersession lookup join — fingerprint → batches
--     Existing idx_structural_fingerprints_tenant_hash (or equivalent) likely covers
--     the (tenant_id, fingerprint_hash) lookup. This index covers the join column.
CREATE INDEX IF NOT EXISTS idx_structural_fingerprints_import_batch
  ON structural_fingerprints (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- 4. CHECK constraint — supersession integrity per Rule 30 + SOC 2 CC7.2 audit trail
--    Prevents partial supersession state (must have both superseded_by + superseded_at, or neither).
ALTER TABLE import_batches
  DROP CONSTRAINT IF EXISTS import_batches_supersession_consistency;
ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_supersession_consistency
  CHECK (
    (superseded_by IS NULL AND superseded_at IS NULL AND supersession_reason IS NULL)
    OR
    (superseded_by IS NOT NULL AND superseded_at IS NOT NULL)
  );

COMMIT;
