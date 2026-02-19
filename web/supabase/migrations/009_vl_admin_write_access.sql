-- ============================================================
-- HF-044 Migration 009: VL Admin Write Access (INSERT/UPDATE/DELETE)
--
-- Migration 006 added VL Admin SELECT policies for all tables,
-- but ZERO INSERT/UPDATE/DELETE policies were added. This means
-- VL Admin (role='vl_admin', tenant_id=NULL) can read all data
-- but cannot write anything — causing 403 on import pipeline.
--
-- Root cause: All existing INSERT/UPDATE/DELETE policies use
--   tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid() AND capabilities @> ...)
-- which returns NULL for VL Admin → no rows writable.
--
-- Fix: Add VL Admin INSERT/UPDATE/DELETE policies for all tables
-- that have capability-based write policies, using the same
-- EXISTS pattern from migration 006 SELECT policies.
--
-- Pattern:
--   EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
--
-- POST-MERGE STEPS:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Paste this entire file
-- 3. Run
-- 4. Verify: SELECT policyname, tablename, cmd FROM pg_policies
--            WHERE policyname LIKE '%vl_admin%' AND cmd != 'SELECT';
-- ============================================================

-- ══════════════════════════════════════════════
-- SECTION 1: CORE ENTITY TABLES (from 001_core_tables.sql)
-- ══════════════════════════════════════════════

-- entities: INSERT + UPDATE (import creates/resolves entities)
CREATE POLICY "entities_insert_vl_admin" ON entities
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "entities_update_vl_admin" ON entities
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- entity_relationships: INSERT + UPDATE
CREATE POLICY "entity_relationships_insert_vl_admin" ON entity_relationships
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "entity_relationships_update_vl_admin" ON entity_relationships
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- reassignment_events: INSERT
CREATE POLICY "reassignment_events_insert_vl_admin" ON reassignment_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ══════════════════════════════════════════════
-- SECTION 2: RULE SETS AND PERIODS (from 002_rule_sets_and_periods.sql)
-- ══════════════════════════════════════════════

-- rule_sets: INSERT + UPDATE + DELETE (plan import)
CREATE POLICY "rule_sets_insert_vl_admin" ON rule_sets
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "rule_sets_update_vl_admin" ON rule_sets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "rule_sets_delete_vl_admin" ON rule_sets
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- rule_set_assignments: INSERT + UPDATE + DELETE (entity-to-plan mapping)
CREATE POLICY "rule_set_assignments_insert_vl_admin" ON rule_set_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "rule_set_assignments_update_vl_admin" ON rule_set_assignments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "rule_set_assignments_delete_vl_admin" ON rule_set_assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- periods: INSERT + UPDATE (auto-creation from Año/Mes)
CREATE POLICY "periods_insert_vl_admin" ON periods
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "periods_update_vl_admin" ON periods
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ══════════════════════════════════════════════
-- SECTION 3: DATA AND CALCULATION (from 003_data_and_calculation.sql)
-- ══════════════════════════════════════════════

-- import_batches: INSERT (the original 403 failure)
CREATE POLICY "import_batches_insert_vl_admin" ON import_batches
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- committed_data: INSERT (raw transaction data rows)
CREATE POLICY "committed_data_insert_vl_admin" ON committed_data
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- calculation_batches: INSERT + UPDATE (batch management + lifecycle transitions)
CREATE POLICY "calculation_batches_insert_vl_admin" ON calculation_batches
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "calculation_batches_update_vl_admin" ON calculation_batches
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- calculation_results: INSERT (per-entity calculation outcomes)
CREATE POLICY "calculation_results_insert_vl_admin" ON calculation_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- calculation_traces: INSERT (formula debug traces)
CREATE POLICY "calculation_traces_insert_vl_admin" ON calculation_traces
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- disputes: INSERT + UPDATE (VL Admin may file/resolve disputes)
CREATE POLICY "disputes_insert_vl_admin" ON disputes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "disputes_update_vl_admin" ON disputes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- reconciliation_sessions: INSERT (reconciliation runs)
CREATE POLICY "reconciliation_sessions_insert_vl_admin" ON reconciliation_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- audit_logs: INSERT (VL Admin actions should be auditable)
CREATE POLICY "audit_logs_insert_vl_admin" ON audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ingestion_configs: INSERT + UPDATE (data ingestion configuration)
CREATE POLICY "ingestion_configs_insert_vl_admin" ON ingestion_configs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "ingestion_configs_update_vl_admin" ON ingestion_configs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ingestion_events: INSERT (ingestion audit trail)
CREATE POLICY "ingestion_events_insert_vl_admin" ON ingestion_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- usage_metering: INSERT (platform usage tracking)
CREATE POLICY "usage_metering_insert_vl_admin" ON usage_metering
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- classification_signals: INSERT (AI classification feedback)
-- Note: UPDATE policy already added in 007_ingestion_facility.sql with vl_admin check
CREATE POLICY "classification_signals_insert_vl_admin" ON classification_signals
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ══════════════════════════════════════════════
-- SECTION 4: MATERIALIZATION TABLES (from 004_materializations.sql)
-- ══════════════════════════════════════════════

-- period_entity_state: INSERT + UPDATE + DELETE (temporal snapshot materialization)
CREATE POLICY "period_entity_state_insert_vl_admin" ON period_entity_state
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "period_entity_state_update_vl_admin" ON period_entity_state
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "period_entity_state_delete_vl_admin" ON period_entity_state
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- profile_scope: INSERT + UPDATE + DELETE (graph-derived visibility)
CREATE POLICY "profile_scope_insert_vl_admin" ON profile_scope
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "profile_scope_update_vl_admin" ON profile_scope
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "profile_scope_delete_vl_admin" ON profile_scope
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- entity_period_outcomes: INSERT + UPDATE + DELETE (aggregated outcomes)
CREATE POLICY "entity_period_outcomes_insert_vl_admin" ON entity_period_outcomes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "entity_period_outcomes_update_vl_admin" ON entity_period_outcomes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

CREATE POLICY "entity_period_outcomes_delete_vl_admin" ON entity_period_outcomes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
  );

-- ══════════════════════════════════════════════
-- SECTION 5: VL ADMIN PROFILE CAPABILITIES (Track C)
-- ══════════════════════════════════════════════
-- Ensure VL Admin profiles have the full capability set so they
-- also pass capability-based policies (defense in depth — the role
-- check above is the primary access path, but this ensures backward
-- compatibility with any code that checks capabilities directly).

UPDATE profiles
SET capabilities = '["full_access", "import_data", "manage_rule_sets", "manage_assignments", "approve_outcomes", "manage_profiles", "manage_tenants", "view_audit", "configure"]'::jsonb
WHERE role = 'vl_admin';
