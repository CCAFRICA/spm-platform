-- ============================================
-- 023: Processing Jobs + Structural Fingerprints
-- OB-174 Phase 1: DS-016 async job queue + DS-017 fingerprint storage
-- ============================================

-- ────────────────────────────────────────────
-- 1. processing_jobs — Async ingestion job queue (DS-016 §4)
-- ────────────────────────────────────────────
-- Each uploaded file becomes a processing job. Workers process jobs
-- independently and in parallel. Status transitions:
-- pending → classifying → classified → confirming → committing → committed
-- Any state can → failed (with error_detail + retry_count)

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'classifying', 'classified', 'confirming', 'committing', 'committed', 'failed')),
  file_storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  structural_fingerprint TEXT,
  classification_result JSONB,
  recognition_tier INTEGER CHECK (recognition_tier IN (1, 2, 3)),
  proposal JSONB,
  chunk_progress JSONB DEFAULT '{}',
  error_detail TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID,
  session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for worker polling and tenant queries
CREATE INDEX IF NOT EXISTS idx_processing_jobs_tenant
  ON processing_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status
  ON processing_jobs(status) WHERE status IN ('pending', 'classifying', 'committing');
CREATE INDEX IF NOT EXISTS idx_processing_jobs_session
  ON processing_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_fingerprint
  ON processing_jobs(structural_fingerprint) WHERE structural_fingerprint IS NOT NULL;

-- RLS: Tenant isolation
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can manage processing jobs"
  ON processing_jobs
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM platform_users WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM platform_users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to processing jobs"
  ON processing_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- VL Admin read access
CREATE POLICY "VL Admin read processing jobs"
  ON processing_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_users
      WHERE auth_id = auth.uid() AND tenant_id IS NULL
    )
  );

-- ────────────────────────────────────────────
-- 2. structural_fingerprints — DS-017 flywheel storage
-- ────────────────────────────────────────────
-- Stores fingerprint → classification mapping for instant recognition.
-- Tier 1: tenant-specific (tenant_id NOT NULL, exact fingerprint match)
-- Tier 2: foundational/cross-tenant (tenant_id IS NULL, structural similarity)
-- Confidence increases with each successful match (Bayesian update).

CREATE TABLE IF NOT EXISTS structural_fingerprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  classification_result JSONB NOT NULL DEFAULT '{}',
  column_roles JSONB NOT NULL DEFAULT '{}',
  match_count INTEGER NOT NULL DEFAULT 1,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.7000,
  source_file_sample TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, fingerprint_hash)
);

-- Indexes for flywheel lookup
CREATE INDEX IF NOT EXISTS idx_structural_fingerprints_tenant
  ON structural_fingerprints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_structural_fingerprints_hash
  ON structural_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_structural_fingerprints_lookup
  ON structural_fingerprints(tenant_id, fingerprint_hash);

-- RLS: Tenant isolation + cross-tenant read for Tier 2
ALTER TABLE structural_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can manage own fingerprints"
  ON structural_fingerprints
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM platform_users WHERE auth_id = auth.uid()
    )
    OR tenant_id IS NULL  -- Tier 2 foundational patterns readable by all
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM platform_users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to fingerprints"
  ON structural_fingerprints
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- VL Admin read access
CREATE POLICY "VL Admin read structural fingerprints"
  ON structural_fingerprints
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_users
      WHERE auth_id = auth.uid() AND tenant_id IS NULL
    )
  );
