-- ============================================================
-- OB-251: Async Ingestion Architecture (DS-016 Implementation)
-- RECONCILE migration over the inert OB-174 scaffolding (migration 023).
--
-- WHY a reconcile, not a create: FP-49 live verification (scripts/_ob251_fp49_schema.ts)
-- found processing_jobs (empty) and structural_fingerprints (151 rows) ALREADY EXIST from
-- migration 023, but:
--   (1) their RLS policies reference a FABRICATED platform_users table (auth_id) that is
--       ABSENT in the live DB — the canonical predicate is profiles.auth_user_id; and
--   (2) processing_jobs lacks batch_id/chunk_id (needed for DS-016 §C chunk-jobs) and the
--       'finalized' terminal status.
--
-- This migration is IDEMPOTENT: CREATE IF NOT EXISTS (fresh DBs get the corrected schema),
-- ADD COLUMN IF NOT EXISTS + DROP/CREATE POLICY (existing DBs get reconciled). It alters
-- ONLY processing_jobs and structural_fingerprints. committed_data is UNCHANGED (§2):
-- chunk identity rides processing_jobs.batch_id, never committed_data.
--
-- Korean Test: every column/status token is a structural processing state — zero domain,
-- tenant, or role literal. No registry.
-- ============================================================

-- ────────────────────────────────────────────
-- 0. Fresh-DB safety: corrected tables (no-op if 023 already applied)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  file_storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  structural_fingerprint TEXT,
  classification_result JSONB,
  recognition_tier INTEGER CHECK (recognition_tier IN (1, 2, 3)),
  proposal JSONB,
  chunk_progress JSONB DEFAULT '{}',
  batch_id UUID,
  chunk_id INTEGER,
  total_chunks INTEGER,
  error_detail TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID,
  session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

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

-- ────────────────────────────────────────────
-- 1. processing_jobs — add DS-016 §C chunk-job columns (existing-DB path)
-- ────────────────────────────────────────────
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS batch_id UUID;        -- groups chunk-jobs of one file
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS chunk_id INTEGER;     -- 0-based ordinal within the file
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS total_chunks INTEGER; -- count of chunk-jobs for the file

-- ────────────────────────────────────────────
-- 2. processing_jobs — widen the status CHECK to add the 'finalized' terminal stage
--    (lifecycle: pending → classifying → classified → confirming → committing →
--     committing → committed → finalized ; failed reachable from any state)
-- ────────────────────────────────────────────
ALTER TABLE processing_jobs DROP CONSTRAINT IF EXISTS processing_jobs_status_check;
ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_status_check
  CHECK (status IN ('pending','classifying','classified','confirming','committing','committed','finalized','failed'));

-- ────────────────────────────────────────────
-- 3. processing_jobs — RLS: replace the fabricated platform_users predicate with the
--    canonical profiles.auth_user_id predicate (matches committed_data RLS,
--    003_data_and_calculation.sql:65-77). Service-role policy is unchanged (no ghost table).
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant members can manage processing jobs" ON processing_jobs;
DROP POLICY IF EXISTS "VL Admin read processing jobs" ON processing_jobs;

CREATE POLICY "Tenant members can manage processing jobs"
  ON processing_jobs FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "VL Admin read processing jobs"
  ON processing_jobs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND tenant_id IS NULL));

-- Service-role full access (idempotent re-assert; references no ghost table).
DROP POLICY IF EXISTS "Service role full access to processing jobs" ON processing_jobs;
CREATE POLICY "Service role full access to processing jobs"
  ON processing_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────
-- 4. structural_fingerprints — same RLS correction (Tier-2 foundational rows, tenant_id IS
--    NULL, remain readable by all tenants for cross-tenant recognition).
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant members can manage own fingerprints" ON structural_fingerprints;
DROP POLICY IF EXISTS "VL Admin read structural fingerprints" ON structural_fingerprints;

CREATE POLICY "Tenant members can manage own fingerprints"
  ON structural_fingerprints FOR ALL
  USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR tenant_id IS NULL  -- Tier-2 foundational patterns readable by all
  )
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "VL Admin read structural fingerprints"
  ON structural_fingerprints FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND tenant_id IS NULL));

DROP POLICY IF EXISTS "Service role full access to fingerprints" ON structural_fingerprints;
CREATE POLICY "Service role full access to fingerprints"
  ON structural_fingerprints FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────
-- 5. Indexes (idempotent). 023 created tenant/status/session/fingerprint indexes;
--    add the chunk-group lookup index.
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_processing_jobs_batch
  ON processing_jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status
  ON processing_jobs(status) WHERE status IN ('pending','classifying','confirming','committing');
CREATE INDEX IF NOT EXISTS idx_processing_jobs_tenant ON processing_jobs(tenant_id);

-- ────────────────────────────────────────────
-- 6. promoted_patterns — DS-016 Layer E consume target (flywheel-aggregation.ts).
--    The promotion/consume step (identifyPromotionCandidates) had ZERO callers — its output had
--    nowhere to land. This is that durable ledger: cross-tenant (no tenant_id — promotion REQUIRES
--    multiple tenants, privacy by design), idempotent on pattern_signature. HALT-CALC neutral: the
--    classify path reads foundational_patterns via loadPromotedPatterns, NEVER this ledger
--    (checkPromotedPatterns, the only reader, has zero callers), so writing here cannot move any
--    sealed-tenant classification. Korean Test: structural columns only.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promoted_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_signature TEXT NOT NULL UNIQUE,
  promoted_classification TEXT,
  confidence_floor NUMERIC(5, 4) NOT NULL DEFAULT 0.8000,
  evidence JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promoted_patterns_active ON promoted_patterns(active) WHERE active;

ALTER TABLE promoted_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access to promoted patterns" ON promoted_patterns;
CREATE POLICY "Service role full access to promoted patterns"
  ON promoted_patterns FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Authenticated read promoted patterns" ON promoted_patterns;
CREATE POLICY "Authenticated read promoted patterns"
  ON promoted_patterns FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- POST-CONDITION (architect verifies via scripts/_ob251_verify_migration.ts):
--   • processing_jobs has batch_id/chunk_id/total_chunks; status CHECK includes 'finalized'
--   • zero policies on processing_jobs/structural_fingerprints reference platform_users
--   • RLS predicate = profiles.auth_user_id
-- ============================================================
