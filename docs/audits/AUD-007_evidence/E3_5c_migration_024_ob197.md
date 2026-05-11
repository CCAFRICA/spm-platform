# E3.5c — Migration 024 OB-197 Signal Surface Rebuild (verbatim with line numbers)

**File:** `web/supabase/migrations/024_ob197_signal_surface_rebuild.sql`
**Total lines:** 51
**Note:** this is the most recent migration matching grep `HF-092` in supabase/migrations/. It is the operative migration shaping the current `classification_signals` schema.

```sql
     1	-- OB-197 Phase 1: Signal Surface Rebuild
     2	-- Closes G7 (single canonical signal surface) and prepares G11 read-path.
     3	-- Per IRA Cluster A option_b RECOMMENDED scope.
     4	
     5	-- 1.1 Formalize HF-092 out-of-band columns (no-op against live; makes schema-of-record match schema-of-fact)
     6	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS source_file_name TEXT;
     7	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS sheet_name TEXT;
     8	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS structural_fingerprint JSONB;
     9	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification TEXT;
    10	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS decision_source TEXT;
    11	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS classification_trace JSONB;
    12	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS header_comprehension JSONB;
    13	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS vocabulary_bindings JSONB;
    14	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS agent_scores JSONB;
    15	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS human_correction_from TEXT;
    16	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS scope TEXT;
    17	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS rule_set_id UUID;
    18	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS metric_name TEXT;
    19	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS component_index INT;
    20	
    21	-- 1.2 Add run scoping
    22	ALTER TABLE classification_signals ADD COLUMN IF NOT EXISTS calculation_run_id UUID NULL;
    23	
    24	-- 1.3 Indexes for read-path performance (Phase 3)
    25	CREATE INDEX IF NOT EXISTS idx_cs_run_id
    26	  ON classification_signals (calculation_run_id)
    27	  WHERE calculation_run_id IS NOT NULL;
    28	CREATE INDEX IF NOT EXISTS idx_cs_tenant_run_type
    29	  ON classification_signals (tenant_id, calculation_run_id, signal_type)
    30	  WHERE calculation_run_id IS NOT NULL;
    31	CREATE INDEX IF NOT EXISTS idx_cs_tenant_type_created
    32	  ON classification_signals (tenant_id, signal_type, created_at DESC);
    33	
    34	-- 1.4 Migrate vocabulary BEFORE constraint
    35	UPDATE classification_signals SET signal_type = 'classification:outcome'
    36	  WHERE signal_type = 'sci:classification_outcome_v2';
    37	UPDATE classification_signals SET signal_type = 'comprehension:plan_interpretation'
    38	  WHERE signal_type = 'training:plan_interpretation';
    39	UPDATE classification_signals SET signal_type = 'cost:event'
    40	  WHERE signal_type = 'sci:cost_event';
    41	
    42	-- 1.5 Enforce three-level vocabulary
    43	ALTER TABLE classification_signals
    44	  ADD CONSTRAINT classification_signals_signal_type_vocabulary_chk
    45	  CHECK (
    46	    signal_type LIKE 'classification:%' OR
    47	    signal_type LIKE 'comprehension:%'  OR
    48	    signal_type LIKE 'convergence:%'    OR
    49	    signal_type LIKE 'cost:%'           OR
    50	    signal_type LIKE 'lifecycle:%'
    51	  );
```
