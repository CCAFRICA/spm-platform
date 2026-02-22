-- ============================================
-- 015: Synaptic Density Table
-- OB-78 Mission 2: Persistent pattern density
-- ============================================

-- Pattern density tracks per-tenant, per-pattern confidence
-- that drives adaptive execution modes (full_trace → light_trace → silent).
-- Loaded at run start, updated after consolidation.

CREATE TABLE IF NOT EXISTS synaptic_density (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signature TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.5,
  execution_mode TEXT NOT NULL DEFAULT 'full_trace',
  total_executions INTEGER NOT NULL DEFAULT 0,
  last_anomaly_rate NUMERIC(5, 4) NOT NULL DEFAULT 0,
  last_correction_count INTEGER NOT NULL DEFAULT 0,
  learned_behaviors JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, signature)
);

-- Index for fast load by tenant
CREATE INDEX IF NOT EXISTS idx_synaptic_density_tenant
  ON synaptic_density(tenant_id);

-- Index for fast lookup by signature across tenants (analytics)
CREATE INDEX IF NOT EXISTS idx_synaptic_density_signature
  ON synaptic_density(signature);

-- RLS: Tenant isolation
ALTER TABLE synaptic_density ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read/write their own tenant's density
CREATE POLICY "Tenant members can manage density"
  ON synaptic_density
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

-- Policy: Service role bypasses RLS (for API routes)
CREATE POLICY "Service role full access to density"
  ON synaptic_density
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
