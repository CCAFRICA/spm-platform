-- OB-197 Phase 1: Signal Surface Rebuild
-- Closes G7 (single canonical signal surface) and prepares G11 read-path.
-- Per IRA Cluster A option_b RECOMMENDED scope.

-- 1.1 Formalize HF-092 out-of-band columns (no-op against live; makes schema-of-record match schema-of-fact)
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS source_file_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS sheet_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS structural_fingerprint JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS decision_source TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification_trace JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS header_comprehension JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS vocabulary_bindings JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS agent_scores JSONB;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS human_correction_from TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS rule_set_id UUID;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS metric_name TEXT;
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS component_index INT;

-- 1.2 Add run scoping
ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS calculation_run_id UUID NULL;

-- 1.3 Indexes for read-path performance (Phase 3)
CREATE INDEX IF NOT EXISTS idx_cs_run_id
  ON classification_signals (calculation_run_id)
  WHERE calculation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_tenant_run_type
  ON classification_signals (tenant_id, calculation_run_id, signal_type)
  WHERE calculation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_tenant_type_created
  ON classification_signals (tenant_id, signal_type, created_at DESC);

-- 1.4 Migrate vocabulary BEFORE constraint
UPDATE classification_signals SET signal_type = 'classification:outcome'
  WHERE signal_type = 'sci:classification_outcome_v2';
UPDATE classification_signals SET signal_type = 'comprehension:plan_interpretation'
  WHERE signal_type = 'training:plan_interpretation';
UPDATE classification_signals SET signal_type = 'cost:event'
  WHERE signal_type = 'sci:cost_event';

-- 1.5 Enforce three-level vocabulary
ALTER TABLE classification_signals
  ADD CONSTRAINT classification_signals_signal_type_vocabulary_chk
  CHECK (
    signal_type LIKE 'classification:%' OR
    signal_type LIKE 'comprehension:%'  OR
    signal_type LIKE 'convergence:%'    OR
    signal_type LIKE 'cost:%'           OR
    signal_type LIKE 'lifecycle:%'
  );
