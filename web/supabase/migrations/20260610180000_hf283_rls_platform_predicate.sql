-- HF-283: RLS role-vocabulary canonicalization (tenant entry).
-- ARCHITECT-APPLIED (SR-44): paste into Supabase Dashboard SQL Editor and run.
-- CC never executes DDL in this repo. Post-apply: EPG-1 + verify-hf283-rls.ts (Phase 7).
--
-- Canonical path web/supabase/migrations/ (HF-259). Authored against EPG-1-PRE
-- (live pg_policies, 2026-06-10) per Addendum-1 A1.3 — live text is authoritative.
-- 72 live policies reference the legacy literal 'vl_admin'; this migration re-keys
-- every one to public.is_platform(), preserving all non-role clauses byte-for-byte
-- (DD-7). Retirement set = the legacy 'vl_admin' STRING only; 'admin' and raw
-- 'platform' preserved (A1.2.1).
--
-- NOTE (byte-preservation caveat, recorded in the report): EPG-1-PRE captured
-- tablename/policyname/cmd/qual/with_check but NOT the TO (roles) clause. These
-- CREATE POLICY statements default to PUBLIC; the access decision is unchanged
-- because every predicate (public.is_platform() and the tenant/folder clauses)
-- denies anon (auth.uid() IS NULL). Verified behaviorally by the Phase 7 harness.

BEGIN;

-- ── (a) The predicate: exactly one role-vocabulary surface DB-side ──
-- Mirrors PLATFORM_ROLE_VALUES (web/src/lib/auth/resolve-identity.ts) — the paired
-- app-side declaration. 'vl_admin' is the legacy alias of canonical 'platform'.
-- Remove the alias from BOTH surfaces together when the legacy literal is purged
-- data-side (Platform-Created-Users OB). Do not edit this set without editing
-- PLATFORM_ROLE_VALUES in the same change.
CREATE OR REPLACE FUNCTION public.is_platform()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND role IN ('platform','vl_admin')
  )
$$;
REVOKE ALL ON FUNCTION public.is_platform() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform() TO anon, authenticated;

-- ── (b) Category A — pure EXISTS(role='vl_admin') → public.is_platform() ──
DROP POLICY IF EXISTS "vl_admin_full_access_approval_requests" ON public.approval_requests;
CREATE POLICY "vl_admin_full_access_approval_requests" ON public.approval_requests FOR ALL USING (public.is_platform());
DROP POLICY IF EXISTS "audit_logs_insert_vl_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_vl_admin" ON public.audit_logs FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "audit_logs_select_vl_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_vl_admin" ON public.audit_logs FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "calculation_batches_insert_vl_admin" ON public.calculation_batches;
CREATE POLICY "calculation_batches_insert_vl_admin" ON public.calculation_batches FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "calculation_batches_select_vl_admin" ON public.calculation_batches;
CREATE POLICY "calculation_batches_select_vl_admin" ON public.calculation_batches FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "calculation_batches_update_vl_admin" ON public.calculation_batches;
CREATE POLICY "calculation_batches_update_vl_admin" ON public.calculation_batches FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "calculation_results_insert_vl_admin" ON public.calculation_results;
CREATE POLICY "calculation_results_insert_vl_admin" ON public.calculation_results FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "calculation_results_select_vl_admin" ON public.calculation_results;
CREATE POLICY "calculation_results_select_vl_admin" ON public.calculation_results FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "calculation_traces_insert_vl_admin" ON public.calculation_traces;
CREATE POLICY "calculation_traces_insert_vl_admin" ON public.calculation_traces FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "calculation_traces_select_vl_admin" ON public.calculation_traces;
CREATE POLICY "calculation_traces_select_vl_admin" ON public.calculation_traces FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "classification_signals_insert_vl_admin" ON public.classification_signals;
CREATE POLICY "classification_signals_insert_vl_admin" ON public.classification_signals FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "classification_signals_select_vl_admin" ON public.classification_signals;
CREATE POLICY "classification_signals_select_vl_admin" ON public.classification_signals FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "committed_data_insert_vl_admin" ON public.committed_data;
CREATE POLICY "committed_data_insert_vl_admin" ON public.committed_data FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "committed_data_select_vl_admin" ON public.committed_data;
CREATE POLICY "committed_data_select_vl_admin" ON public.committed_data FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "entities_insert_vl_admin" ON public.entities;
CREATE POLICY "entities_insert_vl_admin" ON public.entities FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "entities_select_vl_admin" ON public.entities;
CREATE POLICY "entities_select_vl_admin" ON public.entities FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "entities_update_vl_admin" ON public.entities;
CREATE POLICY "entities_update_vl_admin" ON public.entities FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "entity_period_outcomes_delete_vl_admin" ON public.entity_period_outcomes;
CREATE POLICY "entity_period_outcomes_delete_vl_admin" ON public.entity_period_outcomes FOR DELETE USING (public.is_platform());
DROP POLICY IF EXISTS "entity_period_outcomes_insert_vl_admin" ON public.entity_period_outcomes;
CREATE POLICY "entity_period_outcomes_insert_vl_admin" ON public.entity_period_outcomes FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "entity_period_outcomes_select_vl_admin" ON public.entity_period_outcomes;
CREATE POLICY "entity_period_outcomes_select_vl_admin" ON public.entity_period_outcomes FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "entity_period_outcomes_update_vl_admin" ON public.entity_period_outcomes;
CREATE POLICY "entity_period_outcomes_update_vl_admin" ON public.entity_period_outcomes FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "entity_relationships_insert_vl_admin" ON public.entity_relationships;
CREATE POLICY "entity_relationships_insert_vl_admin" ON public.entity_relationships FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "entity_relationships_select_vl_admin" ON public.entity_relationships;
CREATE POLICY "entity_relationships_select_vl_admin" ON public.entity_relationships FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "entity_relationships_update_vl_admin" ON public.entity_relationships;
CREATE POLICY "entity_relationships_update_vl_admin" ON public.entity_relationships FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "import_batches_insert_vl_admin" ON public.import_batches;
CREATE POLICY "import_batches_insert_vl_admin" ON public.import_batches FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "import_batches_select_vl_admin" ON public.import_batches;
CREATE POLICY "import_batches_select_vl_admin" ON public.import_batches FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "ingestion_configs_insert_vl_admin" ON public.ingestion_configs;
CREATE POLICY "ingestion_configs_insert_vl_admin" ON public.ingestion_configs FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "ingestion_configs_select_vl_admin" ON public.ingestion_configs;
CREATE POLICY "ingestion_configs_select_vl_admin" ON public.ingestion_configs FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "ingestion_configs_update_vl_admin" ON public.ingestion_configs;
CREATE POLICY "ingestion_configs_update_vl_admin" ON public.ingestion_configs FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "ingestion_events_insert_vl_admin" ON public.ingestion_events;
CREATE POLICY "ingestion_events_insert_vl_admin" ON public.ingestion_events FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "ingestion_events_select_vl_admin" ON public.ingestion_events;
CREATE POLICY "ingestion_events_select_vl_admin" ON public.ingestion_events FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "period_entity_state_delete_vl_admin" ON public.period_entity_state;
CREATE POLICY "period_entity_state_delete_vl_admin" ON public.period_entity_state FOR DELETE USING (public.is_platform());
DROP POLICY IF EXISTS "period_entity_state_insert_vl_admin" ON public.period_entity_state;
CREATE POLICY "period_entity_state_insert_vl_admin" ON public.period_entity_state FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "period_entity_state_select_vl_admin" ON public.period_entity_state;
CREATE POLICY "period_entity_state_select_vl_admin" ON public.period_entity_state FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "period_entity_state_update_vl_admin" ON public.period_entity_state;
CREATE POLICY "period_entity_state_update_vl_admin" ON public.period_entity_state FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "periods_insert_vl_admin" ON public.periods;
CREATE POLICY "periods_insert_vl_admin" ON public.periods FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "periods_select_vl_admin" ON public.periods;
CREATE POLICY "periods_select_vl_admin" ON public.periods FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "periods_update_vl_admin" ON public.periods;
CREATE POLICY "periods_update_vl_admin" ON public.periods FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "profile_scope_delete_vl_admin" ON public.profile_scope;
CREATE POLICY "profile_scope_delete_vl_admin" ON public.profile_scope FOR DELETE USING (public.is_platform());
DROP POLICY IF EXISTS "profile_scope_insert_vl_admin" ON public.profile_scope;
CREATE POLICY "profile_scope_insert_vl_admin" ON public.profile_scope FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "profile_scope_select_vl_admin" ON public.profile_scope;
CREATE POLICY "profile_scope_select_vl_admin" ON public.profile_scope FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "profile_scope_update_vl_admin" ON public.profile_scope;
CREATE POLICY "profile_scope_update_vl_admin" ON public.profile_scope FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "reassignment_events_insert_vl_admin" ON public.reassignment_events;
CREATE POLICY "reassignment_events_insert_vl_admin" ON public.reassignment_events FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "reassignment_events_select_vl_admin" ON public.reassignment_events;
CREATE POLICY "reassignment_events_select_vl_admin" ON public.reassignment_events FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "reconciliation_sessions_insert_vl_admin" ON public.reconciliation_sessions;
CREATE POLICY "reconciliation_sessions_insert_vl_admin" ON public.reconciliation_sessions FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "reconciliation_sessions_select_vl_admin" ON public.reconciliation_sessions;
CREATE POLICY "reconciliation_sessions_select_vl_admin" ON public.reconciliation_sessions FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "rule_set_assignments_delete_vl_admin" ON public.rule_set_assignments;
CREATE POLICY "rule_set_assignments_delete_vl_admin" ON public.rule_set_assignments FOR DELETE USING (public.is_platform());
DROP POLICY IF EXISTS "rule_set_assignments_insert_vl_admin" ON public.rule_set_assignments;
CREATE POLICY "rule_set_assignments_insert_vl_admin" ON public.rule_set_assignments FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "rule_set_assignments_select_vl_admin" ON public.rule_set_assignments;
CREATE POLICY "rule_set_assignments_select_vl_admin" ON public.rule_set_assignments FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "rule_set_assignments_update_vl_admin" ON public.rule_set_assignments;
CREATE POLICY "rule_set_assignments_update_vl_admin" ON public.rule_set_assignments FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "rule_sets_delete_vl_admin" ON public.rule_sets;
CREATE POLICY "rule_sets_delete_vl_admin" ON public.rule_sets FOR DELETE USING (public.is_platform());
DROP POLICY IF EXISTS "rule_sets_insert_vl_admin" ON public.rule_sets;
CREATE POLICY "rule_sets_insert_vl_admin" ON public.rule_sets FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "rule_sets_select_vl_admin" ON public.rule_sets;
CREATE POLICY "rule_sets_select_vl_admin" ON public.rule_sets FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "rule_sets_update_vl_admin" ON public.rule_sets;
CREATE POLICY "rule_sets_update_vl_admin" ON public.rule_sets FOR UPDATE USING (public.is_platform());
DROP POLICY IF EXISTS "tenants_select_vl_admin" ON public.tenants;
CREATE POLICY "tenants_select_vl_admin" ON public.tenants FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "usage_metering_insert_vl_admin" ON public.usage_metering;
CREATE POLICY "usage_metering_insert_vl_admin" ON public.usage_metering FOR INSERT WITH CHECK (public.is_platform());
DROP POLICY IF EXISTS "usage_metering_select_vl_admin" ON public.usage_metering;
CREATE POLICY "usage_metering_select_vl_admin" ON public.usage_metering FOR SELECT USING (public.is_platform());

-- ── (b) Category B — tenant-isolation OR-disjunct (auth_user_id join): tenant clause preserved, role disjunct → is_platform() ──
DROP POLICY IF EXISTS "tenant_isolation_agent_inbox" ON public.agent_inbox;
CREATE POLICY "tenant_isolation_agent_inbox" ON public.agent_inbox FOR ALL USING (
  (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE auth_user_id = auth.uid())) OR public.is_platform());
DROP POLICY IF EXISTS "tenant_isolation_alias_registry" ON public.alias_registry;
CREATE POLICY "tenant_isolation_alias_registry" ON public.alias_registry FOR ALL USING (
  (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE auth_user_id = auth.uid())) OR public.is_platform());
DROP POLICY IF EXISTS "tenant_isolation_platform_events" ON public.platform_events;
CREATE POLICY "tenant_isolation_platform_events" ON public.platform_events FOR ALL USING (
  (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE auth_user_id = auth.uid())) OR public.is_platform());
DROP POLICY IF EXISTS "tenant_isolation_reference_items" ON public.reference_items;
CREATE POLICY "tenant_isolation_reference_items" ON public.reference_items FOR ALL USING (
  (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE auth_user_id = auth.uid())) OR public.is_platform());
DROP POLICY IF EXISTS "tenant_isolation_user_journey" ON public.user_journey;
CREATE POLICY "tenant_isolation_user_journey" ON public.user_journey FOR ALL USING (
  (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE auth_user_id = auth.uid())) OR public.is_platform());

-- ── (b) Category C — id-join OR-disjunct: tenant clause (profiles.id = auth.uid()) preserved verbatim, role disjunct → is_platform() ──
DROP POLICY IF EXISTS "tenant_iso_alias" ON public.alias_registry;
CREATE POLICY "tenant_iso_alias" ON public.alias_registry FOR ALL USING (
  (tenant_id IS NULL) OR (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())) OR public.is_platform());
DROP POLICY IF EXISTS "tenant_iso_ref_data" ON public.reference_data;
CREATE POLICY "tenant_iso_ref_data" ON public.reference_data FOR ALL USING (
  (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())) OR public.is_platform());
DROP POLICY IF EXISTS "tenant_iso_ref_items" ON public.reference_items;
CREATE POLICY "tenant_iso_ref_items" ON public.reference_items FOR ALL USING (
  (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())) OR public.is_platform());

-- ── (b) Category D — platform_settings scalar subselect = 'vl_admin' → is_platform() ──
DROP POLICY IF EXISTS "platform_read_settings" ON public.platform_settings;
CREATE POLICY "platform_read_settings" ON public.platform_settings FOR SELECT USING (public.is_platform());
DROP POLICY IF EXISTS "platform_update_settings" ON public.platform_settings;
CREATE POLICY "platform_update_settings" ON public.platform_settings FOR UPDATE USING (public.is_platform());

-- ── (b) Category E/F/G — storage.objects (schema-qualified; live auto-names quoted) ──
-- E: imports bucket (qual + with_check)
DROP POLICY IF EXISTS "VL Admin full storage access" ON storage.objects;
CREATE POLICY "VL Admin full storage access" ON storage.objects FOR ALL
  USING ((bucket_id = 'imports') AND public.is_platform())
  WITH CHECK ((bucket_id = 'imports') AND public.is_platform());
-- F: ingestion-raw delete/select (role=ANY(platform,vl_admin)). TO authenticated
-- preserved from EPG-1-PRE R2 (these 4 ingestion_raw policies are {authenticated}, NOT {public}).
DROP POLICY IF EXISTS "ingestion_raw_delete 13cn3lr_0" ON storage.objects;
CREATE POLICY "ingestion_raw_delete 13cn3lr_0" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'ingestion-raw') AND public.is_platform());
DROP POLICY IF EXISTS "ingestion_raw_delete 13cn3lr_1" ON storage.objects;
CREATE POLICY "ingestion_raw_delete 13cn3lr_1" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'ingestion-raw') AND public.is_platform());
-- G: ingestion-raw insert/select (021 entangled; A1.2 disjunction; admin branch byte-preserved). TO authenticated preserved.
DROP POLICY IF EXISTS "ingestion_raw_insert 13cn3lr_0" ON storage.objects;
CREATE POLICY "ingestion_raw_insert 13cn3lr_0" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'ingestion-raw')
    AND (public.is_platform() OR EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin'))
    AND (public.is_platform() OR ((storage.foldername(name))[1] IN (
          SELECT tenant_id::text FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin')))
  );
DROP POLICY IF EXISTS "ingestion_raw_select 13cn3lr_0" ON storage.objects;
CREATE POLICY "ingestion_raw_select 13cn3lr_0" ON storage.objects FOR SELECT TO authenticated
  USING (
    (bucket_id = 'ingestion-raw')
    AND (public.is_platform() OR EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin'))
    AND (public.is_platform() OR ((storage.foldername(name))[1] IN (
          SELECT tenant_id::text FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin')))
  );

-- ── (c) Assertion block (transaction-bound; rollback on failure) ──
DO $$
DECLARE remaining int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'is_platform') THEN
    RAISE EXCEPTION 'HF-283 assertion: public.is_platform() missing';
  END IF;
  -- Class-closure net: zero 'vl_admin' anywhere in any policy (catches uninventoried live drift → HALT-5).
  SELECT count(*) INTO remaining FROM pg_policies
   WHERE qual ILIKE '%vl_admin%' OR with_check ILIKE '%vl_admin%';
  IF remaining > 0 THEN
    RAISE EXCEPTION 'HF-283 assertion: % policies still reference vl_admin', remaining;
  END IF;
  -- Spot-checks: the tenant-entry fix + a representative re-keyed policy exist on is_platform().
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'tenants_select_vl_admin'
                 AND qual ILIKE '%is_platform%') THEN
    RAISE EXCEPTION 'HF-283 assertion: tenants_select_vl_admin missing or not on is_platform() post-rekey';
  END IF;
END $$;

COMMIT;
