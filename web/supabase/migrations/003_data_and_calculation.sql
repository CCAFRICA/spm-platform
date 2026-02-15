-- ============================================================
-- OB-42 Migration 003: Data and Calculation Tables
-- Tables: import_batches, committed_data, calculation_batches,
--         calculation_results, calculation_traces, disputes,
--         reconciliation_sessions, classification_signals,
--         audit_logs, ingestion_configs, ingestion_events,
--         usage_metering
-- ============================================================

-- ──────────────────────────────────────────────
-- TABLE 9: import_batches
-- File import metadata
-- ──────────────────────────────────────────────
CREATE TABLE import_batches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  row_count     INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_summary JSONB NOT NULL DEFAULT '{}',
  uploaded_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_select_tenant" ON import_batches
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "import_batches_insert" ON import_batches
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["import_data"]'
    )
  );

CREATE INDEX idx_import_batches_tenant ON import_batches(tenant_id);
CREATE INDEX idx_import_batches_status ON import_batches(tenant_id, status);

-- ──────────────────────────────────────────────
-- TABLE 10: committed_data
-- Raw transaction data rows
-- ──────────────────────────────────────────────
CREATE TABLE committed_data (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
  data_type       TEXT NOT NULL,
  row_data        JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE committed_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "committed_data_select_tenant" ON committed_data
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "committed_data_insert" ON committed_data
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["import_data"]'
    )
  );

CREATE INDEX idx_committed_data_tenant ON committed_data(tenant_id);
CREATE INDEX idx_committed_data_entity ON committed_data(entity_id);
CREATE INDEX idx_committed_data_period ON committed_data(period_id);
CREATE INDEX idx_committed_data_type ON committed_data(tenant_id, data_type);
CREATE INDEX idx_committed_data_batch ON committed_data(import_batch_id);

-- ──────────────────────────────────────────────
-- TABLE 11: calculation_batches
-- Rule 30: Financial Assertion Immutability
-- superseded_by, supersedes, batch_type
-- ──────────────────────────────────────────────
CREATE TABLE calculation_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id       UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  rule_set_id     UUID REFERENCES rule_sets(id) ON DELETE SET NULL,
  batch_type      TEXT NOT NULL DEFAULT 'standard'
    CHECK (batch_type IN ('standard', 'superseding', 'adjustment', 'reversal')),
  lifecycle_state TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_state IN (
      'DRAFT', 'PREVIEW', 'RECONCILE', 'OFFICIAL',
      'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
      'POSTED', 'CLOSED', 'PAID', 'PUBLISHED'
    )),
  superseded_by   UUID REFERENCES calculation_batches(id),
  supersedes      UUID REFERENCES calculation_batches(id),
  entity_count    INTEGER NOT NULL DEFAULT 0,
  summary         JSONB NOT NULL DEFAULT '{}',
  config          JSONB NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calculation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calculation_batches_select_tenant" ON calculation_batches
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "calculation_batches_insert" ON calculation_batches
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE POLICY "calculation_batches_update" ON calculation_batches
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE INDEX idx_calc_batches_tenant ON calculation_batches(tenant_id);
CREATE INDEX idx_calc_batches_period ON calculation_batches(period_id);
CREATE INDEX idx_calc_batches_rule_set ON calculation_batches(rule_set_id);
CREATE INDEX idx_calc_batches_lifecycle ON calculation_batches(tenant_id, lifecycle_state);
CREATE INDEX idx_calc_batches_superseded ON calculation_batches(superseded_by);
CREATE INDEX idx_calc_batches_supersedes ON calculation_batches(supersedes);

-- ──────────────────────────────────────────────
-- TABLE 12: calculation_results
-- Per-entity calculation outcomes
-- ──────────────────────────────────────────────
CREATE TABLE calculation_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES calculation_batches(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  rule_set_id     UUID REFERENCES rule_sets(id) ON DELETE SET NULL,
  period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
  total_payout    NUMERIC(15,2) NOT NULL DEFAULT 0,
  components      JSONB NOT NULL DEFAULT '[]',
  metrics         JSONB NOT NULL DEFAULT '{}',
  attainment      JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calculation_results ENABLE ROW LEVEL SECURITY;

-- RLS: Users see results in their tenant
CREATE POLICY "calculation_results_select_tenant" ON calculation_results
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "calculation_results_insert" ON calculation_results
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE INDEX idx_calc_results_tenant ON calculation_results(tenant_id);
CREATE INDEX idx_calc_results_batch ON calculation_results(batch_id);
CREATE INDEX idx_calc_results_entity ON calculation_results(entity_id);
CREATE INDEX idx_calc_results_period ON calculation_results(period_id);
CREATE INDEX idx_calc_results_rule_set ON calculation_results(rule_set_id);

-- ──────────────────────────────────────────────
-- TABLE 13: calculation_traces
-- Formula-level debug traces
-- ──────────────────────────────────────────────
CREATE TABLE calculation_traces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  result_id       UUID NOT NULL REFERENCES calculation_results(id) ON DELETE CASCADE,
  component_name  TEXT NOT NULL,
  formula         TEXT,
  inputs          JSONB NOT NULL DEFAULT '{}',
  output          JSONB NOT NULL DEFAULT '{}',
  steps           JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calculation_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calculation_traces_select_tenant" ON calculation_traces
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "calculation_traces_insert" ON calculation_traces
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE INDEX idx_calc_traces_tenant ON calculation_traces(tenant_id);
CREATE INDEX idx_calc_traces_result ON calculation_traces(result_id);

-- ──────────────────────────────────────────────
-- TABLE 14: disputes
-- Entity dispute records
-- ──────────────────────────────────────────────
CREATE TABLE disputes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
  batch_id        UUID REFERENCES calculation_batches(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'rejected', 'escalated')),
  category        TEXT,
  description     TEXT NOT NULL,
  resolution      TEXT,
  amount_disputed NUMERIC(15,2),
  amount_resolved NUMERIC(15,2),
  filed_by        UUID REFERENCES profiles(id),
  resolved_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disputes_select_tenant" ON disputes
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "disputes_insert" ON disputes
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "disputes_update" ON disputes
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE INDEX idx_disputes_tenant ON disputes(tenant_id);
CREATE INDEX idx_disputes_entity ON disputes(entity_id);
CREATE INDEX idx_disputes_period ON disputes(period_id);
CREATE INDEX idx_disputes_status ON disputes(tenant_id, status);

-- ──────────────────────────────────────────────
-- TABLE 15: reconciliation_sessions
-- ADR reconciliation sessions
-- ──────────────────────────────────────────────
CREATE TABLE reconciliation_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
  batch_id        UUID REFERENCES calculation_batches(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  config          JSONB NOT NULL DEFAULT '{}',
  results         JSONB NOT NULL DEFAULT '{}',
  summary         JSONB NOT NULL DEFAULT '{}',
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

ALTER TABLE reconciliation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reconciliation_sessions_select_tenant" ON reconciliation_sessions
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "reconciliation_sessions_insert" ON reconciliation_sessions
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE INDEX idx_recon_sessions_tenant ON reconciliation_sessions(tenant_id);
CREATE INDEX idx_recon_sessions_period ON reconciliation_sessions(period_id);

-- ──────────────────────────────────────────────
-- TABLE 16: classification_signals
-- AI classification feedback
-- ──────────────────────────────────────────────
CREATE TABLE classification_signals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  signal_type     TEXT NOT NULL,
  signal_value    JSONB NOT NULL DEFAULT '{}',
  confidence      NUMERIC(5,4),
  source          TEXT,
  context         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE classification_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classification_signals_select_tenant" ON classification_signals
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "classification_signals_insert" ON classification_signals
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE INDEX idx_class_signals_tenant ON classification_signals(tenant_id);
CREATE INDEX idx_class_signals_entity ON classification_signals(entity_id);
CREATE INDEX idx_class_signals_type ON classification_signals(tenant_id, signal_type);

-- ──────────────────────────────────────────────
-- TABLE 17: audit_logs
-- Immutable audit trail
-- ──────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  changes     JSONB NOT NULL DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only users with view_audit can read audit logs
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["view_audit"]'
    )
  );

-- Insert: any authenticated user in the tenant can create audit entries
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(tenant_id, action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ──────────────────────────────────────────────
-- TABLE 18: ingestion_configs
-- Data ingestion configuration
-- ──────────────────────────────────────────────
CREATE TABLE ingestion_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  source_type TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  mapping     JSONB NOT NULL DEFAULT '{}',
  schedule    JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ingestion_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_configs_select_tenant" ON ingestion_configs
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "ingestion_configs_insert" ON ingestion_configs
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["import_data"]'
    )
  );

CREATE POLICY "ingestion_configs_update" ON ingestion_configs
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["import_data"]'
    )
  );

CREATE INDEX idx_ingestion_configs_tenant ON ingestion_configs(tenant_id);

-- ──────────────────────────────────────────────
-- TABLE 19: ingestion_events
-- Ingestion audit trail
-- ──────────────────────────────────────────────
CREATE TABLE ingestion_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  config_id       UUID REFERENCES ingestion_configs(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_failed    INTEGER NOT NULL DEFAULT 0,
  error_log       JSONB NOT NULL DEFAULT '[]',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ingestion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_events_select_tenant" ON ingestion_events
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "ingestion_events_insert" ON ingestion_events
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["import_data"]'
    )
  );

CREATE INDEX idx_ingestion_events_tenant ON ingestion_events(tenant_id);
CREATE INDEX idx_ingestion_events_config ON ingestion_events(config_id);

-- ──────────────────────────────────────────────
-- TABLE 20: usage_metering
-- Platform usage tracking
-- ──────────────────────────────────────────────
CREATE TABLE usage_metering (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(15,4) NOT NULL DEFAULT 0,
  period_key  TEXT NOT NULL,
  dimensions  JSONB NOT NULL DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usage_metering ENABLE ROW LEVEL SECURITY;

-- Only platform admins can see usage metering
CREATE POLICY "usage_metering_select" ON usage_metering
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_tenants"]'
    )
  );

CREATE POLICY "usage_metering_insert" ON usage_metering
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE INDEX idx_usage_metering_tenant ON usage_metering(tenant_id);
CREATE INDEX idx_usage_metering_metric ON usage_metering(tenant_id, metric_name, period_key);

-- ──────────────────────────────────────────────
-- Triggers: auto-update updated_at
-- ──────────────────────────────────────────────
CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ingestion_configs_updated_at
  BEFORE UPDATE ON ingestion_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_calculation_batches_updated_at
  BEFORE UPDATE ON calculation_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
