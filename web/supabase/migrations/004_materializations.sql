-- ============================================================
-- OB-42 Migration 004: Materialization Tables
-- Tables: period_entity_state, profile_scope, entity_period_outcomes
-- ============================================================

-- ──────────────────────────────────────────────
-- TABLE 21: period_entity_state
-- Materialization: temporal snapshot of resolved attributes
-- Flattens temporal_attributes JSONB for a specific period
-- ──────────────────────────────────────────────
CREATE TABLE period_entity_state (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_id       UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  resolved_attributes JSONB NOT NULL DEFAULT '{}',
  resolved_relationships JSONB NOT NULL DEFAULT '[]',
  entity_type     TEXT NOT NULL,
  status          TEXT NOT NULL,
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_id, period_id)
);

ALTER TABLE period_entity_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "period_entity_state_select_tenant" ON period_entity_state
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "period_entity_state_insert" ON period_entity_state
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["import_data"]')
    )
  );

CREATE POLICY "period_entity_state_update" ON period_entity_state
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["import_data"]')
    )
  );

-- Allow upsert (delete + reinsert for rematerialization)
CREATE POLICY "period_entity_state_delete" ON period_entity_state
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["import_data"]')
    )
  );

CREATE INDEX idx_pes_tenant ON period_entity_state(tenant_id);
CREATE INDEX idx_pes_entity ON period_entity_state(entity_id);
CREATE INDEX idx_pes_period ON period_entity_state(period_id);
CREATE INDEX idx_pes_entity_period ON period_entity_state(tenant_id, entity_id, period_id);

-- ──────────────────────────────────────────────
-- TABLE 22: profile_scope
-- Materialization: graph-derived visibility
-- populated from entity relationship graph traversal
-- ──────────────────────────────────────────────
CREATE TABLE profile_scope (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scope_type      TEXT NOT NULL DEFAULT 'graph_derived'
    CHECK (scope_type IN ('graph_derived', 'admin_override', 'platform')),
  visible_entity_ids   UUID[] NOT NULL DEFAULT '{}',
  visible_rule_set_ids UUID[] NOT NULL DEFAULT '{}',
  visible_period_ids   UUID[] NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, profile_id)
);

ALTER TABLE profile_scope ENABLE ROW LEVEL SECURITY;

-- Users can see their own scope
CREATE POLICY "profile_scope_select_own" ON profile_scope
  FOR SELECT USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Admins can see all scopes in their tenant
CREATE POLICY "profile_scope_select_admin" ON profile_scope
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND capabilities @> '["manage_profiles"]'
    )
  );

CREATE POLICY "profile_scope_insert" ON profile_scope
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_profiles"]' OR capabilities @> '["manage_assignments"]')
    )
  );

CREATE POLICY "profile_scope_update" ON profile_scope
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_profiles"]' OR capabilities @> '["manage_assignments"]')
    )
  );

CREATE POLICY "profile_scope_delete" ON profile_scope
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_profiles"]' OR capabilities @> '["manage_assignments"]')
    )
  );

CREATE INDEX idx_profile_scope_tenant ON profile_scope(tenant_id);
CREATE INDEX idx_profile_scope_profile ON profile_scope(profile_id);

-- ──────────────────────────────────────────────
-- TABLE 23: entity_period_outcomes
-- Materialization: aggregated outcomes per entity per period
-- Materialized on lifecycle transition with per-rule-set breakdown
-- ──────────────────────────────────────────────
CREATE TABLE entity_period_outcomes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id             UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_id             UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  total_payout          NUMERIC(15,2) NOT NULL DEFAULT 0,
  rule_set_breakdown    JSONB NOT NULL DEFAULT '[]',
  component_breakdown   JSONB NOT NULL DEFAULT '[]',
  lowest_lifecycle_state TEXT NOT NULL DEFAULT 'DRAFT',
  attainment_summary    JSONB NOT NULL DEFAULT '{}',
  metadata              JSONB NOT NULL DEFAULT '{}',
  materialized_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_id, period_id)
);

ALTER TABLE entity_period_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_period_outcomes_select_tenant" ON entity_period_outcomes
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "entity_period_outcomes_insert" ON entity_period_outcomes
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE POLICY "entity_period_outcomes_update" ON entity_period_outcomes
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE POLICY "entity_period_outcomes_delete" ON entity_period_outcomes
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE auth_user_id = auth.uid()
        AND (capabilities @> '["manage_rule_sets"]' OR capabilities @> '["approve_outcomes"]')
    )
  );

CREATE INDEX idx_epo_tenant ON entity_period_outcomes(tenant_id);
CREATE INDEX idx_epo_entity ON entity_period_outcomes(entity_id);
CREATE INDEX idx_epo_period ON entity_period_outcomes(period_id);
CREATE INDEX idx_epo_entity_period ON entity_period_outcomes(tenant_id, entity_id, period_id);
CREATE INDEX idx_epo_lifecycle ON entity_period_outcomes(lowest_lifecycle_state);
