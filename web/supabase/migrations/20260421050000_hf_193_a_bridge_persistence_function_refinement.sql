-- HF-193-A Phase 2.2a REFINEMENT: fn_bridge_persistence function body refinement (Option X)
--
-- CONTEXT: The original Phase 2.2a function used:
--     INSERT INTO rule_sets
--     SELECT * FROM jsonb_populate_record(NULL::rule_sets, p_rule_set);
--
--   Verification (commit 378ff092) surfaced that jsonb_populate_record(NULL::rule_sets, ...)
--   does NOT invoke column DEFAULTs — fields absent from p_rule_set become NULL in the
--   resulting record, and the INSERT then overrides the DEFAULT with NULL, failing NOT NULL
--   constraints on created_at/updated_at (DEFAULT now()). CC worked around this inline by
--   populating timestamps explicitly in the verification test payload — PASS achieved —
--   but the workaround pushed an implicit caller contract (must-populate-timestamps)
--   that did not exist in the existing .upsert() caller at execute/route.ts:1278,:1514.
--
-- REFINEMENT: Replace function body with explicit column list INSERT. Columns with
--   callable DB DEFAULTs that callers never populate (created_at, updated_at) are OMITTED
--   from the explicit column list — DB defaults fire automatically. Business-semantic
--   NOT NULL-with-default columns (status, version, population_config, etc.) use COALESCE
--   fallbacks as safety nets.
--
-- CONTRACT CHANGE: Caller contract is SIMPLER, not more complex:
--   - Caller MUST populate: id (pre-generated UUID), tenant_id, name
--   - Caller TYPICALLY populates (per existing .upsert() shape): description, status,
--     version, population_config, input_bindings, components, cadence_config,
--     outcome_config, metadata, created_by
--   - Caller MAY populate: effective_from, effective_to, approved_by (nullable)
--   - Caller does NOT populate: created_at, updated_at (DB defaults fire)
--
-- SECURITY: SECURITY INVOKER preserved (T1-E925). Signature unchanged. Interface contract
--   for Phase 2.2b callers unchanged in all business-semantic dimensions.

BEGIN;

CREATE OR REPLACE FUNCTION fn_bridge_persistence(
  p_rule_set jsonb,
  p_signals  jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_rule_set_id uuid;
  v_tenant_id   uuid;
BEGIN
  -- Extract pre-generated rule_set_id and tenant_id
  v_rule_set_id := (p_rule_set->>'id')::uuid;
  v_tenant_id   := (p_rule_set->>'tenant_id')::uuid;

  -- Defensive checks: both must be present in the input
  IF v_rule_set_id IS NULL THEN
    RAISE EXCEPTION 'fn_bridge_persistence: p_rule_set.id is required (caller must pre-generate UUID)';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'fn_bridge_persistence: p_rule_set.tenant_id is required';
  END IF;

  -- INSERT rule_set with explicit column list.
  --
  -- created_at / updated_at OMITTED — DB defaults (DEFAULT now()) fire automatically.
  -- id (has DEFAULT uuid_generate_v4()) IS explicitly set because caller pre-generates.
  --
  -- NOT NULL-with-default business columns (status, version, *config, *_bindings, etc.)
  -- use COALESCE to the DB default value — safety net if caller omits; in practice,
  -- existing caller at execute/route.ts:1278,:1514 populates all of these explicitly.
  --
  -- Nullable columns (description, effective_from, effective_to, created_by, approved_by)
  -- pass through as NULL if caller omits; no COALESCE needed.
  INSERT INTO rule_sets (
    id,
    tenant_id,
    name,
    description,
    status,
    version,
    effective_from,
    effective_to,
    population_config,
    input_bindings,
    components,
    cadence_config,
    outcome_config,
    metadata,
    created_by,
    approved_by
  )
  VALUES (
    v_rule_set_id,
    v_tenant_id,
    p_rule_set->>'name',
    p_rule_set->>'description',
    COALESCE(p_rule_set->>'status', 'draft'),
    COALESCE((p_rule_set->>'version')::integer, 1),
    (p_rule_set->>'effective_from')::date,
    (p_rule_set->>'effective_to')::date,
    COALESCE(p_rule_set->'population_config', '{}'::jsonb),
    COALESCE(p_rule_set->'input_bindings', '{}'::jsonb),
    COALESCE(p_rule_set->'components', '[]'::jsonb),
    COALESCE(p_rule_set->'cadence_config', '{}'::jsonb),
    COALESCE(p_rule_set->'outcome_config', '{}'::jsonb),
    COALESCE(p_rule_set->'metadata', '{}'::jsonb),
    (p_rule_set->>'created_by')::uuid,
    (p_rule_set->>'approved_by')::uuid
  );

  -- INSERT classification_signals for each signal spec in p_signals array.
  -- Unchanged from original Phase 2.2a. Defaults on id, context, created_at, scope
  -- fire automatically via column omission.
  INSERT INTO classification_signals (
    tenant_id,
    signal_type,
    signal_value,
    rule_set_id,
    metric_name,
    component_index
  )
  SELECT
    v_tenant_id,
    'metric_comprehension',
    (sig->>'signal_value')::jsonb,
    v_rule_set_id,
    sig->>'metric_name',
    (sig->>'component_index')::integer
  FROM jsonb_array_elements(p_signals) AS sig;

  RETURN v_rule_set_id;
END;
$$;

COMMIT;

-- Post-apply verification:
--   SELECT routine_name, security_type, data_type FROM information_schema.routines
--     WHERE routine_name = 'fn_bridge_persistence';
--   Expected: one row; security_type='INVOKER'; data_type='uuid'.
