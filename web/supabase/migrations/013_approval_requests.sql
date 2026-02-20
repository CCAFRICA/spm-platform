-- ============================================================
-- OB-68 Migration 013: Approval Requests Table
--
-- Creates the approval_requests table for persisting calculation
-- approval decisions. Previously, approvals were in-memory only
-- (OB-66 P0 finding).
--
-- POST-MERGE STEPS:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Paste this entire file
-- 3. Run
-- 4. Verify: SELECT table_name FROM information_schema.tables
--            WHERE table_name = 'approval_requests';
-- ============================================================

-- ──────────────────────────────────────────────
-- TABLE: approval_requests
-- Persists calculation batch approval decisions
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id         UUID NOT NULL REFERENCES calculation_batches(id) ON DELETE CASCADE,
  period_id        UUID NOT NULL REFERENCES periods(id),
  request_type     TEXT NOT NULL DEFAULT 'calculation_approval',
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'recalled')),
  requested_by     UUID REFERENCES profiles(id),
  decided_by       UUID REFERENCES profiles(id),
  decision_notes   TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_approval_requests_tenant ON approval_requests(tenant_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(tenant_id, status);
CREATE INDEX idx_approval_requests_batch ON approval_requests(batch_id);

-- RLS
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY "approval_requests_select_tenant" ON approval_requests
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "approval_requests_insert" ON approval_requests
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "approval_requests_update" ON approval_requests
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

-- VL Admin full access
CREATE POLICY "vl_admin_full_access_approval_requests" ON approval_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
      AND role = 'vl_admin'
    )
  );
