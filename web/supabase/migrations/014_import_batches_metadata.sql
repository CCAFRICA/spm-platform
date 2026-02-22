-- OB-75 Mission 1: Persist AI Import Context
-- Adds metadata JSONB column to import_batches so the AI's sheet
-- classifications and field mappings survive beyond the import page.
-- The calculation engine reads this instead of hardcoded SHEET_COMPONENT_PATTERNS.

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN import_batches.metadata IS
  'AI import context: sheet classifications, field mappings, roster info. Written at commit time, read by calculation engine.';
