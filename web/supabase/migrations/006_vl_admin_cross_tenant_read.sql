-- ============================================================
-- HF-035 Migration 006: VL Admin Cross-Tenant Read Access
--
-- The platform admin (vl_admin, tenant_id=NULL) cannot read
-- data tables because every SELECT policy checks:
--   tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
-- which returns NULL for vl_admin → no rows visible.
--
-- Migration 005 added vl_admin policies for tenants + profiles.
-- This migration extends that pattern to all remaining data tables.
-- ============================================================

-- Helper: same pattern as 005
-- EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')

-- ── Core entity tables ──

CREATE POLICY "entities_select_vl_admin" ON entities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "entity_relationships_select_vl_admin" ON entity_relationships
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "reassignment_events_select_vl_admin" ON reassignment_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ── Rule sets and periods ──

CREATE POLICY "rule_sets_select_vl_admin" ON rule_sets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "rule_set_assignments_select_vl_admin" ON rule_set_assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "periods_select_vl_admin" ON periods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ── Data and calculation tables ──

CREATE POLICY "import_batches_select_vl_admin" ON import_batches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "committed_data_select_vl_admin" ON committed_data
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "calculation_batches_select_vl_admin" ON calculation_batches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "calculation_results_select_vl_admin" ON calculation_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "calculation_traces_select_vl_admin" ON calculation_traces
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "disputes_select_vl_admin" ON disputes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "reconciliation_sessions_select_vl_admin" ON reconciliation_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "classification_signals_select_vl_admin" ON classification_signals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "audit_logs_select_vl_admin" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "ingestion_configs_select_vl_admin" ON ingestion_configs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "ingestion_events_select_vl_admin" ON ingestion_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "usage_metering_select_vl_admin" ON usage_metering
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ── Materialization tables ──

CREATE POLICY "period_entity_state_select_vl_admin" ON period_entity_state
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "profile_scope_select_vl_admin" ON profile_scope
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "entity_period_outcomes_select_vl_admin" ON entity_period_outcomes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );
