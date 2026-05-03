-- HF-196 Phase 1F (File 2 of 2): Import Batch Content Hash — NOT NULL constraint
-- Apply AFTER Phase 5-RESET-5 wipe AND first import (architect signal "1F NOT NULL apply ready").
--
-- Precondition: zero rows in import_batches with file_hash_sha256 IS NULL for any tenant.
-- (Verified via tsx-script probe before running this migration.)
--
-- File 1 of this pair (20260503032540_hf196_phase1f_import_batch_content_hash.sql)
-- added the column as nullable. Phase 5-RESET-5 wipe + Phase 1F-wired-import populates
-- the SHA on every new batch. Once that's verified clean, this migration enforces
-- NOT NULL going forward — making file_hash_sha256 a REQUIRED audit primitive.
--
-- If this migration fails with "column 'file_hash_sha256' contains null values"
-- it means a row exists without SHA — do NOT force; investigate and surface.
--
-- Apply via Supabase Dashboard SQL Editor (architect-only).

BEGIN;

ALTER TABLE import_batches
  ALTER COLUMN file_hash_sha256 SET NOT NULL;

COMMIT;
