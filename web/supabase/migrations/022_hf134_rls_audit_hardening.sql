-- ============================================================
-- HF-134 Migration 022: RLS Audit Hardening
--
-- Systematic audit found:
-- 1. Base tenant isolation + VL Admin policies in place (001-009)
-- 2. All tables with data have RLS enabled and blocking anonymous access
-- 3. Cross-tenant isolation verified: BCL admin sees ONLY BCL data
-- 4. Tables added after initial migrations may lack explicit policies
--
-- This migration ensures ALL tables have explicit RLS policies,
-- including tables that may have been created via dashboard SQL
-- rather than migration files (agent_inbox, user_journey, platform_events).
--
-- Standing Rule 13: auth_user_id = auth.uid(), NOT id = auth.uid()
-- ============================================================

-- ══════════════════════════════════════════════
-- SECTION 1: Ensure RLS enabled on ALL tables
-- (Idempotent — safe to re-run)
-- ══════════════════════════════════════════════

ALTER TABLE IF EXISTS agent_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_journey ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS platform_events ENABLE ROW LEVEL SECURITY;

-- Tables already enabled in earlier migrations (re-affirm for safety)
ALTER TABLE IF EXISTS alias_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reference_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reference_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS synaptic_density ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS domain_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS foundational_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reconciliation_sessions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════
-- SECTION 2: Add missing tenant isolation policies
-- Pattern: tenant_id match + platform role bypass
-- Only create if policy doesn't already exist (use DROP IF EXISTS)
-- ══════════════════════════════════════════════

-- agent_inbox (tenant_id column, needs isolation)
DROP POLICY IF EXISTS "tenant_isolation_agent_inbox" ON agent_inbox;
CREATE POLICY "tenant_isolation_agent_inbox" ON agent_inbox
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role IN ('platform', 'vl_admin'))
  );

-- user_journey (tenant_id column, needs isolation)
DROP POLICY IF EXISTS "tenant_isolation_user_journey" ON user_journey;
CREATE POLICY "tenant_isolation_user_journey" ON user_journey
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role IN ('platform', 'vl_admin'))
  );

-- platform_events (tenant_id column, needs isolation)
DROP POLICY IF EXISTS "tenant_isolation_platform_events" ON platform_events;
CREATE POLICY "tenant_isolation_platform_events" ON platform_events
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role IN ('platform', 'vl_admin'))
  );

-- reference_items (tenant_id column — migration 018 may have incomplete policies)
DROP POLICY IF EXISTS "tenant_isolation_reference_items" ON reference_items;
CREATE POLICY "tenant_isolation_reference_items" ON reference_items
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role IN ('platform', 'vl_admin'))
  );

-- alias_registry (tenant_id column — migration 018 may have incomplete policies)
DROP POLICY IF EXISTS "tenant_isolation_alias_registry" ON alias_registry;
CREATE POLICY "tenant_isolation_alias_registry" ON alias_registry
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role IN ('platform', 'vl_admin'))
  );

-- ══════════════════════════════════════════════
-- SECTION 3: Verify VL Admin can write to newer tables
-- (agent_inbox, user_journey may need INSERT/UPDATE)
-- ══════════════════════════════════════════════

-- The FOR ALL policies above cover INSERT/UPDATE/DELETE too,
-- so no separate write policies needed.

-- ══════════════════════════════════════════════
-- POST-MERGE VERIFICATION:
--
-- Run in SQL Editor after applying:
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' ORDER BY tablename;
-- (Expect: rowsecurity = true for ALL rows)
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename;
-- (Expect: every table has at least one policy)
-- ══════════════════════════════════════════════
