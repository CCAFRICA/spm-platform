-- HF-213: Content Unit Hash SHA-256 — Supersession Identity Primitive
-- Supersedes: HF-196 Phase 1F (tenant_id, file_hash_sha256) supersession scope
-- New supersession scope: (tenant_id, content_unit_hash_sha256)
-- file_hash_sha256 retained for file-level audit (HF-196 Phase 1F audit intent preserved)

ALTER TABLE import_batches
  ADD COLUMN content_unit_hash_sha256 text;

UPDATE import_batches
SET content_unit_hash_sha256 = '<legacy_uncomputable>'
WHERE content_unit_hash_sha256 IS NULL;

ALTER TABLE import_batches
  ALTER COLUMN content_unit_hash_sha256 SET NOT NULL;

CREATE INDEX idx_import_batches_content_unit_hash
  ON import_batches(tenant_id, content_unit_hash_sha256);

COMMENT ON COLUMN import_batches.content_unit_hash_sha256 IS
  'HF-213: SHA-256 of normalized canonical CSV serialization of content unit. Supersession identity primitive (supersedes HF-196 Phase 1F file-level scope). Computed via web/src/lib/sci/content-unit-hash.ts. Sentinel <legacy_uncomputable> for pre-HF-213 rows.';

COMMENT ON COLUMN import_batches.file_hash_sha256 IS
  'HF-196 Phase 1F: SHA-256 of raw file bytes. Preserved post-HF-213 for file-level audit. NO LONGER load-bearing for supersession (HF-213 supersedes Phase 1F supersession scope).';
