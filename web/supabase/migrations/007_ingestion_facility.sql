-- ============================================================
-- OB-50 Migration 007: Data Ingestion Facility
--
-- Enhances existing ingestion_events and classification_signals
-- tables to support DS-005 Phases 1-3:
--   - File storage metadata (SHA-256 hash, storage path)
--   - Immutable audit chain (supersedes_event_id)
--   - Classification signal enrichment
--   - Import batch labeling
-- ============================================================

-- ── Enhance ingestion_events with DS-005 columns ──

ALTER TABLE ingestion_events
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES import_batches(id),
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS uploaded_by_email TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by_role TEXT DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS file_hash_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS classification_result JSONB,
  ADD COLUMN IF NOT EXISTS validation_result JSONB,
  ADD COLUMN IF NOT EXISTS record_count INTEGER,
  ADD COLUMN IF NOT EXISTS sheet_count INTEGER,
  ADD COLUMN IF NOT EXISTS supersedes_event_id UUID REFERENCES ingestion_events(id);

-- Drop old status constraint and add DS-005 compliant statuses
-- (existing rows keep their old values; new inserts use new constraint)
ALTER TABLE ingestion_events DROP CONSTRAINT IF EXISTS ingestion_events_status_check;
ALTER TABLE ingestion_events ADD CONSTRAINT ingestion_events_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed',
                    'received', 'classified', 'mapped', 'validated',
                    'committed', 'quarantined', 'rejected'));

-- Additional indexes for DS-005 queries
CREATE INDEX IF NOT EXISTS idx_ingestion_events_status ON ingestion_events(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_batch ON ingestion_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_uploaded_at ON ingestion_events(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_events_hash ON ingestion_events(file_hash_sha256);

-- Remove UPDATE policy if it exists (immutable audit trail)
DROP POLICY IF EXISTS "ingestion_events_update" ON ingestion_events;

-- ── Enhance classification_signals with DS-005 columns ──

ALTER TABLE classification_signals
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES ingestion_events(id),
  ADD COLUMN IF NOT EXISTS ai_prediction TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS user_decision TEXT,
  ADD COLUMN IF NOT EXISTS was_corrected BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_signals_event ON classification_signals(event_id);

-- Allow UPDATE on classification_signals (admin confirms/overrides)
CREATE POLICY "classification_signals_update" ON classification_signals
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ── Enhance import_batches with batch labeling ──

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS ingestion_batch_label TEXT;
