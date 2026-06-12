-- 20260612200000_ob203_phase6b_phase_d_import_session_telemetry.sql
-- OB-203 Phase 6B / Phase D (D.1-D.2): the durable per-session import telemetry record.
-- ARCHITECT-APPLIED (SR-44): paste into Supabase Dashboard SQL Editor and run.
-- CC never executes DDL in this repo. Post-apply: web/scripts/verify-ob203-phase-d-telemetry.ts.
--
-- ADR: docs/completion-reports/OB-203_PHASE-6B_PHASE-D_ADR.md (committed 63c79c91).
-- One row per (tenant_id, import_session_id). Truth is accumulated at write time
-- (Amendment 2 Section 1); display reads are O(1) single-row fetches; the heavy
-- derive runs once per session at settle, as the audit.
--
-- Exactness contract (Decision 95): additive columns carry only append-only
-- quantities (signals written); unit-scoped truth lives in unit_states as
-- per-unit latest-state snapshots (assignment-merged), idempotent under the
-- write path's documented re-emission (execute-bulk:426 + :527), retry-unit
-- second batches, and D16 unit-atomic rollback.

BEGIN;

-- == (a) The record ==
CREATE TABLE IF NOT EXISTS public.import_session_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  -- Comprehension-session identity (= analyze proposalId). Distinct from the
  -- execute-side import_batch_id (HF-213 lineage).
  import_session_id UUID NOT NULL,
  -- DS-020 SynapticSurface.stats vocabulary (SCI expression):
  -- totalSynapsesWritten / synapsesPerType. Open signal_type vocabulary (AP-26);
  -- per-key additive merge, counters only.
  total_signals_written BIGINT NOT NULL DEFAULT 0,
  signals_per_type JSONB NOT NULL DEFAULT '{}',
  -- {unitId: {sheetName, state, tier, knownCount, novelCount, failureClass,
  --  classification, confidence, injectedBindings, expectedRows, rowsCommitted,
  --  pulsesTotal, pulsesLanded, updatedAt}} -- assignment-merged, latest wins
  -- per unit key; every panel number projects from this row.
  unit_states JSONB NOT NULL DEFAULT '{}',
  -- Settle-time, write-once (first write wins; enforced in the increment fn):
  conclusion JSONB,
  audit JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_session_telemetry_session_unique UNIQUE (tenant_id, import_session_id)
);

COMMENT ON TABLE public.import_session_telemetry IS
  'OB-203 Phase D: one durable telemetry row per import session, incrementally accumulated by the work itself. Every import display number projects from this row; the settle audit (deriveImportTelemetry, demoted) verifies it once per session.';

-- == (b) Additive per-key jsonb counter merge (counters only; values must be integral) ==
CREATE OR REPLACE FUNCTION public.jsonb_add_counters(a jsonb, b jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_object_agg(key, to_jsonb(total)), '{}'::jsonb)
  FROM (
    SELECT key,
           COALESCE(x.a_val, 0) + COALESCE(y.b_val, 0) AS total
    FROM (SELECT key, value::bigint AS a_val FROM jsonb_each_text(COALESCE(a, '{}'::jsonb))) x
    FULL OUTER JOIN
         (SELECT key, value::bigint AS b_val FROM jsonb_each_text(COALESCE(b, '{}'::jsonb))) y
    USING (key)
  ) merged
$$;

-- == (c) The atomic increment: ONE statement, serializes on the row lock ==
-- Concurrent callers cannot lose counts (additive expressions) or clobber other
-- units' snapshots (|| merge is key-scoped; each unit has one writer at a time).
-- conclusion/audit are write-once: FIRST write wins, so a racing duplicate
-- settle-audit call is a no-op (the endpoint additionally guards on audit IS NULL).
CREATE OR REPLACE FUNCTION public.increment_import_session_telemetry(
  p_tenant_id uuid,
  p_import_session_id uuid,
  p_signals_delta bigint DEFAULT 0,
  p_signals_per_type jsonb DEFAULT '{}'::jsonb,
  p_unit_states jsonb DEFAULT '{}'::jsonb,
  p_conclusion jsonb DEFAULT NULL,
  p_audit jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.import_session_telemetry AS t
    (tenant_id, import_session_id, total_signals_written, signals_per_type, unit_states, conclusion, audit)
  VALUES
    (p_tenant_id, p_import_session_id,
     COALESCE(p_signals_delta, 0),
     public.jsonb_add_counters('{}'::jsonb, COALESCE(p_signals_per_type, '{}'::jsonb)),
     COALESCE(p_unit_states, '{}'::jsonb),
     p_conclusion, p_audit)
  ON CONFLICT (tenant_id, import_session_id) DO UPDATE SET
    total_signals_written = t.total_signals_written + COALESCE(p_signals_delta, 0),
    signals_per_type      = public.jsonb_add_counters(t.signals_per_type, COALESCE(p_signals_per_type, '{}'::jsonb)),
    unit_states           = t.unit_states || COALESCE(p_unit_states, '{}'::jsonb),
    conclusion            = COALESCE(t.conclusion, p_conclusion),
    audit                 = COALESCE(t.audit, p_audit),
    updated_at            = NOW()
$$;

-- Service-role only: runtime writes go through this function exclusively.
REVOKE ALL ON FUNCTION public.jsonb_add_counters(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_import_session_telemetry(uuid, uuid, bigint, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsonb_add_counters(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_import_session_telemetry(uuid, uuid, bigint, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- == (d) RLS (HF-283 conventions: public.is_platform(), never the raw literal) ==
ALTER TABLE public.import_session_telemetry ENABLE ROW LEVEL SECURITY;

-- Tenant members read their own sessions; platform reads all.
CREATE POLICY "import_session_telemetry_select_tenant"
  ON public.import_session_telemetry FOR SELECT
  USING (
    (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE auth_user_id = auth.uid()))
    OR public.is_platform()
  );

-- Standing rule 9: pipeline tables carry platform INSERT/UPDATE policies.
-- Runtime writes use the service role (bypasses RLS) via the increment function.
CREATE POLICY "import_session_telemetry_insert_vl_admin"
  ON public.import_session_telemetry FOR INSERT WITH CHECK (public.is_platform());
CREATE POLICY "import_session_telemetry_update_vl_admin"
  ON public.import_session_telemetry FOR UPDATE USING (public.is_platform());

-- == (e) Assertions: abort the transaction if any piece is missing or wrong ==
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'import_session_telemetry' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'import_session_telemetry missing or RLS not enabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_import_session_telemetry'
  ) THEN
    RAISE EXCEPTION 'increment_import_session_telemetry missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'jsonb_add_counters'
  ) THEN
    RAISE EXCEPTION 'jsonb_add_counters missing';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'import_session_telemetry') < 3 THEN
    RAISE EXCEPTION 'import_session_telemetry expected >= 3 policies';
  END IF;

  -- Functional smoke inside the transaction: additive + assignment semantics.
  PERFORM public.increment_import_session_telemetry(
    '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
    2, '{"comprehension:unit_state": 2}'::jsonb, '{"u1": {"state": "persisted"}}'::jsonb);
  PERFORM public.increment_import_session_telemetry(
    '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
    3, '{"comprehension:unit_state": 1, "comprehension:tier_resolution": 4}'::jsonb,
    '{"u1": {"state": "profiled"}, "u2": {"state": "persisted"}}'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM public.import_session_telemetry
    WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND import_session_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND total_signals_written = 5
      AND signals_per_type = '{"comprehension:unit_state": 3, "comprehension:tier_resolution": 4}'::jsonb
      AND unit_states->'u1'->>'state' = 'profiled'
      AND unit_states->'u2'->>'state' = 'persisted'
  ) THEN
    RAISE EXCEPTION 'increment smoke failed: additive/assignment semantics wrong';
  END IF;
  DELETE FROM public.import_session_telemetry
  WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
END $$;

COMMIT;
