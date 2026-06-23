-- OB-229 — Summary Engine: domain-agnostic import-time aggregation.
-- SR-44: authored by CC, APPLIED BY THE ARCHITECT in the Supabase SQL Editor. Not run by CC.
--
-- Aggregates committed_data.row_data into summary_artifacts at import time so visualization surfaces
-- read O(1) instead of fetching+aggregating raw rows on every page load (the 97s / 164MB defect).
--
-- KOREAN TEST: zero hardcoded field names. Fields are discovered from the data via jsonb_each +
-- jsonb_typeof='number'. A Korean tenant with Hangul field names summarizes with no code change.
-- T1-E902: SUMs ALL numeric fields (no curated subset). Decision 158: deterministic, no LLM.
-- Constraint 6 (idempotent): replaces the tenant's artifacts on each run.
-- HALT-2 / Residual 4: rows with NULL entity_id (FK NOT NULL on summary_artifacts) or NULL
-- source_date are skipped (returned as a separate skipped-count for observability).

CREATE OR REPLACE FUNCTION compute_summary_artifacts(p_tenant_id uuid)
RETURNS TABLE (artifacts_written integer, rows_skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_written integer := 0;
  v_skipped integer := 0;
BEGIN
  -- skipped = rows that cannot be summarized per-entity/day (NULL entity_id or source_date)
  SELECT count(*) INTO v_skipped
  FROM committed_data
  WHERE tenant_id = p_tenant_id
    AND (entity_id IS NULL OR source_date IS NULL);

  -- idempotent replace (Constraint 6)
  DELETE FROM summary_artifacts WHERE tenant_id = p_tenant_id;

  WITH fields AS (
    -- one row per (entity, day, data_type, numeric field) → SUM of that field
    SELECT cd.entity_id, cd.source_date, cd.data_type, kv.key AS k,
           sum((kv.value)::numeric) AS v_sum
    FROM committed_data cd
    CROSS JOIN LATERAL jsonb_each(cd.row_data) kv
    WHERE cd.tenant_id = p_tenant_id
      AND cd.entity_id IS NOT NULL
      AND cd.source_date IS NOT NULL
      AND jsonb_typeof(kv.value) = 'number'
    GROUP BY cd.entity_id, cd.source_date, cd.data_type, kv.key
  ),
  counts AS (
    SELECT entity_id, source_date, data_type, count(*) AS rc
    FROM committed_data
    WHERE tenant_id = p_tenant_id
      AND entity_id IS NOT NULL
      AND source_date IS NOT NULL
    GROUP BY entity_id, source_date, data_type
  ),
  ins AS (
    INSERT INTO summary_artifacts
      (tenant_id, entity_id, summary_date, period_id, data_type, metrics, row_count, computed_at, created_at)
    SELECT
      p_tenant_id, f.entity_id, f.source_date, NULL::uuid, f.data_type,
      jsonb_object_agg(f.k, f.v_sum), c.rc, now(), now()
    FROM fields f
    JOIN counts c
      ON c.entity_id = f.entity_id AND c.source_date = f.source_date
     AND (c.data_type IS NOT DISTINCT FROM f.data_type)
    GROUP BY f.entity_id, f.source_date, f.data_type, c.rc
    RETURNING 1
  )
  SELECT count(*) INTO v_written FROM ins;

  RETURN QUERY SELECT v_written, v_skipped;
END;
$$;

-- service_role executes via the application; grant explicitly for clarity.
GRANT EXECUTE ON FUNCTION compute_summary_artifacts(uuid) TO service_role;

-- Read-path index: visualization surfaces filter by tenant + (entity|date) + data_type.
CREATE INDEX IF NOT EXISTS idx_summary_artifacts_tenant_date
  ON summary_artifacts (tenant_id, data_type, summary_date);
CREATE INDEX IF NOT EXISTS idx_summary_artifacts_tenant_entity
  ON summary_artifacts (tenant_id, entity_id, data_type);
