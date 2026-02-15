-- ============================================================
-- OB-42 Migration 002: Rule Sets, Assignments, and Periods
-- Tables: rule_sets, rule_set_assignments, periods
-- ============================================================

-- ──────────────────────────────────────────────
-- TABLE 6: rule_sets
-- 5-layer JSONB decomposition (was compensation_plans)
-- Layers: population_config, input_bindings, components,
--         cadence_config, outcome_config
-- ──────────────────────────────────────────────
CREATE TABLE rule_sets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'active', 'archived')),
  version           INTEGER NOT NULL DEFAULT 1,
  effective_from    DATE,
  effective_to      DATE,
  population_config JSONB NOT NULL DEFAULT '{}',
  input_bindings    JSONB NOT NULL DEFAULT '{}',
  components        JSONB NOT NULL DEFAULT '[]',
  cadence_config    JSONB NOT NULL DEFAULT '{}',
  outcome_config    JSONB NOT NULL DEFAULT '{}',
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_by        UUID REFERENCES profiles(id),
  approved_by       UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rule_sets ENABLE ROW LEVEL SECURITY;

-- RLS: Users see rule sets in their tenant
CREATE POLICY "rule_sets_select_tenant" ON rule_sets
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- RLS: Users with manage_rule_sets can modify
CREATE POLICY "rule_sets_insert" ON rule_sets
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_rule_sets"]'
    )
  );

CREATE POLICY "rule_sets_update" ON rule_sets
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_rule_sets"]'
    )
  );

CREATE POLICY "rule_sets_delete" ON rule_sets
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_rule_sets"]'
    )
    AND status = 'draft'
  );

CREATE INDEX idx_rule_sets_tenant ON rule_sets(tenant_id);
CREATE INDEX idx_rule_sets_status ON rule_sets(tenant_id, status);
CREATE INDEX idx_rule_sets_effective ON rule_sets(effective_from, effective_to);

-- ──────────────────────────────────────────────
-- TABLE 7: rule_set_assignments
-- Entity-to-rule-set binding
-- ──────────────────────────────────────────────
CREATE TABLE rule_set_assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_set_id   UUID NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
  entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  effective_from DATE,
  effective_to   DATE,
  assignment_type TEXT NOT NULL DEFAULT 'direct',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, rule_set_id, entity_id, effective_from)
);

ALTER TABLE rule_set_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rule_set_assignments_select_tenant" ON rule_set_assignments
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "rule_set_assignments_insert" ON rule_set_assignments
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_assignments"]'
    )
  );

CREATE POLICY "rule_set_assignments_update" ON rule_set_assignments
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_assignments"]'
    )
  );

CREATE POLICY "rule_set_assignments_delete" ON rule_set_assignments
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_assignments"]'
    )
  );

CREATE INDEX idx_rsa_tenant ON rule_set_assignments(tenant_id);
CREATE INDEX idx_rsa_rule_set ON rule_set_assignments(rule_set_id);
CREATE INDEX idx_rsa_entity ON rule_set_assignments(entity_id);
CREATE INDEX idx_rsa_effective ON rule_set_assignments(effective_from, effective_to);

-- ──────────────────────────────────────────────
-- TABLE 8: periods
-- Temporal period management
-- ──────────────────────────────────────────────
CREATE TABLE periods (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (period_type IN ('monthly', 'quarterly', 'biweekly', 'weekly', 'annual')),
  status      TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'calculating', 'review', 'closed', 'paid')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  canonical_key TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, canonical_key),
  CHECK (end_date > start_date)
);

ALTER TABLE periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periods_select_tenant" ON periods
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "periods_insert" ON periods
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["import_data"]')
    )
  );

CREATE POLICY "periods_update" ON periods
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_rule_sets"]'
    )
  );

CREATE INDEX idx_periods_tenant ON periods(tenant_id);
CREATE INDEX idx_periods_canonical ON periods(tenant_id, canonical_key);
CREATE INDEX idx_periods_dates ON periods(start_date, end_date);
CREATE INDEX idx_periods_status ON periods(tenant_id, status);

-- ──────────────────────────────────────────────
-- Triggers: auto-update updated_at
-- ──────────────────────────────────────────────
CREATE TRIGGER trg_rule_sets_updated_at
  BEFORE UPDATE ON rule_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rule_set_assignments_updated_at
  BEFORE UPDATE ON rule_set_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_periods_updated_at
  BEFORE UPDATE ON periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
