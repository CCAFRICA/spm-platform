-- HF-092: Classification Signals Schema Correction
-- Run this in the Supabase SQL Editor BEFORE deploying the code changes.
-- Reason: Dev Plan v2 specification requires indexed, queryable columns.
-- OB-160E incorrectly stored data in signal_value JSONB blob.

-- Step 1: Add dedicated columns (IF NOT EXISTS prevents failure if partially applied)
ALTER TABLE classification_signals
  ADD COLUMN IF NOT EXISTS source_file_name TEXT,
  ADD COLUMN IF NOT EXISTS sheet_name TEXT,
  ADD COLUMN IF NOT EXISTS structural_fingerprint JSONB,
  ADD COLUMN IF NOT EXISTS classification TEXT,
  ADD COLUMN IF NOT EXISTS decision_source TEXT,
  ADD COLUMN IF NOT EXISTS classification_trace JSONB,
  ADD COLUMN IF NOT EXISTS header_comprehension JSONB,
  ADD COLUMN IF NOT EXISTS vocabulary_bindings JSONB,
  ADD COLUMN IF NOT EXISTS agent_scores JSONB,
  ADD COLUMN IF NOT EXISTS human_correction_from TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'tenant';

-- Step 2: Create indexes for scale
CREATE INDEX IF NOT EXISTS idx_cs_tenant_scope
  ON classification_signals(tenant_id, scope);

CREATE INDEX IF NOT EXISTS idx_cs_tenant_fingerprint
  ON classification_signals(tenant_id)
  WHERE scope = 'tenant';

CREATE INDEX IF NOT EXISTS idx_cs_vocab_bindings
  ON classification_signals(tenant_id, created_at DESC)
  WHERE vocabulary_bindings IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cs_foundational
  ON classification_signals(scope, structural_fingerprint)
  WHERE scope = 'foundational';

-- Step 3: Migrate any existing Phase E signals from signal_value JSONB to dedicated columns
UPDATE classification_signals
SET
  source_file_name = signal_value->>'source_file_name',
  sheet_name = signal_value->>'sheet_name',
  structural_fingerprint = (signal_value->'structural_fingerprint')::JSONB,
  classification = signal_value->>'classification',
  decision_source = signal_value->>'decision_source',
  classification_trace = (signal_value->'classification_trace')::JSONB,
  vocabulary_bindings = (signal_value->'vocabulary_bindings')::JSONB,
  agent_scores = (signal_value->'agent_scores')::JSONB,
  human_correction_from = signal_value->>'human_correction_from',
  scope = COALESCE(signal_value->>'scope', 'tenant')
WHERE signal_type = 'sci:classification_outcome_v2'
  AND classification IS NULL;

-- Step 4: Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'classification_signals'
ORDER BY ordinal_position;

SELECT indexname FROM pg_indexes
WHERE tablename = 'classification_signals';
