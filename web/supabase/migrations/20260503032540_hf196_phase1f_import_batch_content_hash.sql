-- HF-196 Phase 1F (File 1 of 2): Import Batch Content Hash — column + index
-- Apply NOW (pre-Phase 5-RESET-5). File 2 (NOT NULL constraint) applies POST-wipe.
--
-- Architecture: Path Z.1-A (architect-dispositioned 2026-05-03)
-- Substrate-extending: import_batches becomes SHA-256 anchor
--   (OB-50 ingestion_events surface unwired per Phase 1F-0; HF-199 candidate restores
--    OB-50 properly. Documented as carry-forward.)
-- Phase 1E architecture preserved: supersession columns, audit-trail, engine
--   operative-only filter all unchanged.
-- Phase 1F changes ONLY the supersession trigger primitive:
--   structural_fingerprint (DS-017 classification-class identity, wrongly fires
--     for monthly transactions per 5C-2 finding)
--   →
--   file_hash_sha256 (dataset-content identity per OB-50 spec)
--
-- DS-017 fingerprint stays unchanged for analyze-time Tier 1 immunity.
-- OB-42 Phase 4 engine-side operative selection pattern preserved
--   (superseded_by IS NULL filter unchanged in 17 query sites).
--
-- Compliance: SOC 2 CC6.1/CC7.2; GDPR Article 30; LGPD Article 37; DS-014.
-- Apply via Supabase Dashboard SQL Editor (architect-only, per memory).

BEGIN;

-- 1. import_batches — file content hash column (initially nullable).
--    Existing 4 BCL batches predate this column and stay NULL until 5-RESET-5
--    wipe clears them. File 2 of this migration adds NOT NULL constraint
--    AFTER the wipe verifies clean state.
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS file_hash_sha256 TEXT;

-- 2. Index for supersession lookup: (tenant_id, file_hash_sha256) finds prior
--    operative batch via SHA-256 content match. Partial index on operative-only
--    rows for query efficiency.
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_content_hash
  ON import_batches (tenant_id, file_hash_sha256)
  WHERE superseded_by IS NULL;

COMMIT;
