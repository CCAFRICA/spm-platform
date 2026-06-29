-- ============================================================
-- HF-356 (RC1, I1/I2/I4): bulk_commit_from_storage — the database loads committed_data directly from a
-- CSV in Storage via the S3 FDW. The serverless function writes ONE CSV and calls this ONCE; the data
-- never leaves the database server (DS-005 "closet in the right warehouse"). Replaces the per-batch
-- HTTP insert that exhausted the connection pool and took production down twice.
--
-- ARCHITECT (SR-44) — this function depends on the S3 FDW infrastructure you enabled + proved tonight
-- (`wrappers` ext, `s3_wrapper`, server `s3_storage` → ingestion-raw, user mappings). CC cannot
-- introspect that config (no SQL access from the service-role client), so VERIFY/ADJUST two things to
-- match what returned rows tonight, then apply:
--   1. The server name in `SERVER s3_storage` — change if you named it differently.
--   2. `v_uri` — the URI the foreign table uses. This assumes `s3://ingestion-raw/<key>`. If your proven
--      foreign table used a different scheme (e.g. the server already binds the bucket and the option is
--      just the key, or `s3://<configured-bucket>/<key>`), edit the v_uri expression below to match.
-- The CSV columns + order are writer-controlled (committed-row-csv.ts): tenant_id, import_batch_id,
-- source_date, data_type, row_data, metadata — all read as text, cast on insert.
--
-- FP-49: committed_data columns verified live (id, tenant_id, import_batch_id, entity_id, period_id,
-- data_type, row_data jsonb, metadata jsonb, created_at, source_date). Korean Test: no domain literals.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bulk_commit_from_storage(
  p_tenant_id      uuid,
  p_csv_path       text,   -- key within the ingestion-raw bucket, e.g. '<tenant_id>/committed/<batch_id>.csv'
  p_import_batch_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ft    text := '_hf356_load_' || replace(p_import_batch_id::text, '-', '');
  v_uri   text := 's3://ingestion-raw/' || p_csv_path;   -- ARCHITECT: adjust scheme to your s3_storage config
  v_count bigint;
BEGIN
  -- A transient foreign table over the CSV (all columns text; cast on insert). Unique per batch; dropped
  -- in this same transaction. Drop any stale same-name table first (idempotent on retry).
  EXECUTE format('DROP FOREIGN TABLE IF EXISTS %I', v_ft);
  EXECUTE format(
    'CREATE FOREIGN TABLE %I (tenant_id text, import_batch_id text, source_date text, data_type text, row_data text, metadata text) '
    'SERVER s3_storage OPTIONS (uri %L, format %L, has_header %L)',
    v_ft, v_uri, 'csv', 'true'
  );

  -- I4 — TENANT ISOLATION BY CONSTRUCTION: the inserted tenant_id is the FUNCTION PARAMETER, never the
  -- CSV's value. A bug in the CSV (or a forged tenant_id column) cannot write to the wrong tenant.
  EXECUTE format(
    'INSERT INTO committed_data (tenant_id, import_batch_id, entity_id, period_id, source_date, data_type, row_data, metadata) '
    'SELECT %L::uuid, %L::uuid, NULL, NULL, NULLIF(source_date, '''')::date, data_type, row_data::jsonb, metadata::jsonb '
    'FROM %I',
    p_tenant_id, p_import_batch_id, v_ft
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  EXECUTE format('DROP FOREIGN TABLE %I', v_ft);
  RETURN v_count;  -- the worker compares this to the rows it wrote (HALT-DATA-LOSS).
END;
$$;

-- The worker calls this under the service-role client; tenant members never call it directly.
GRANT EXECUTE ON FUNCTION public.bulk_commit_from_storage(uuid, text, uuid) TO service_role;

-- ============================================================
-- POST-CONDITION (architect verifies): SELECT bulk_commit_from_storage('<tenant>'::uuid,
--   '<tenant>/committed/<batch>.csv', '<batch>'::uuid) returns the row count and the rows appear in
--   committed_data under that batch_id with the correct tenant_id.
-- ============================================================
