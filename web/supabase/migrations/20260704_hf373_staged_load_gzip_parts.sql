-- ============================================================
-- HF-373 Phase E (D6) — staged FDW load: gzip parts + per-part manifest status (parallel-ready).
--
-- The 2026-07-02 86,607×87 staging failure was a LIMIT-DISCOVERY defect (the budget derived from the
-- bucket's raised 100MiB file_size_limit while the project-GLOBAL per-object cap (~50MiB, not
-- API-readable) governed — the ~84MB part was rejected). The code-side fix (pulse-budget.ts) derives
-- the budget from min(bucket, global) — raising limits is never the fix. THIS migration adds the two
-- database-side capabilities the fix ships with:
--
--   1. gzip parts: bulk_commit_from_storage reads `compress 'gzip'` for '*.gz' objects. Staged CSV
--      lines repeat the unit-constant metadata blob (~89% of every 40KB row — live-measured), so a
--      ~33MB part compresses to a few MB: ~20× less upload volume + storage, and parts sit far below
--      any cap. Staging only writes .csv.gz AFTER probing staged_load_capabilities() (created here),
--      so DEPLOY ORDER IS SAFE: until this migration is applied, staging writes plain CSV unchanged.
--   2. per-part status: the worker stamps each manifest entry status='loaded'/'failed' (+loadedAt) as
--      it drains — parts are independently claimable by construction (parallel-ready) even though
--      today's drain stays sequential. Cursor/rows_loaded semantics preserved (resume-compatible).
--
-- ARCHITECT (SR-44), BEFORE relying on gzip staging:
--   a. Apply this migration.
--   b. LIVE-VERIFY the installed Wrappers S3 FDW accepts the compress option (upload any small
--      gzipped CSV to ingestion-raw as '<tenant>/committed/_gzip_probe.csv.gz', then:
--        SELECT public.bulk_commit_from_storage('<tenant>'::uuid, '<tenant>/committed/_gzip_probe.csv.gz', '<a throwaway batch uuid>'::uuid);
--      and clean up). If the wrappers version rejects `compress`, DROP FUNCTION public.staged_load_capabilities()
--      — staging then stays on plain CSV automatically (the capability probe returns absent).
--   c. Confirm the pg_cron schedule for process_pulse_load_jobs() is unchanged and running.
-- ============================================================

-- ── 1. capability marker: code probes this to decide gzip staging (never an env flag) ───────────────
create or replace function public.staged_load_capabilities()
returns jsonb
language sql
stable
as $$ select jsonb_build_object('gzip', true, 'per_part_status', true) $$;
grant execute on function public.staged_load_capabilities() to service_role;

-- ── 2. bulk_commit_from_storage: gzip-aware (path-suffix keyed — a structural fact of the object) ───
CREATE OR REPLACE FUNCTION public.bulk_commit_from_storage(
  p_tenant_id      uuid,
  p_csv_path       text,   -- key within ingestion-raw, e.g. '<tenant>/committed/<batch>.csv[.gz]'
  p_import_batch_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ft    text := '_hf356_load_' || replace(p_import_batch_id::text, '-', '');
  v_uri   text := 's3://ingestion-raw/' || p_csv_path;
  v_count bigint;
  v_gzip  boolean := p_csv_path like '%.gz';
BEGIN
  EXECUTE format('DROP FOREIGN TABLE IF EXISTS %I', v_ft);
  IF v_gzip THEN
    EXECUTE format(
      'CREATE FOREIGN TABLE %I (tenant_id text, import_batch_id text, source_date text, data_type text, row_data text, metadata text) '
      'SERVER s3_storage OPTIONS (uri %L, format %L, has_header %L, compress %L)',
      v_ft, v_uri, 'csv', 'true', 'gzip'
    );
  ELSE
    EXECUTE format(
      'CREATE FOREIGN TABLE %I (tenant_id text, import_batch_id text, source_date text, data_type text, row_data text, metadata text) '
      'SERVER s3_storage OPTIONS (uri %L, format %L, has_header %L)',
      v_ft, v_uri, 'csv', 'true'
    );
  END IF;

  -- I4 — TENANT ISOLATION BY CONSTRUCTION: inserted tenant_id is the FUNCTION PARAMETER, never the CSV's.
  EXECUTE format(
    'INSERT INTO committed_data (tenant_id, import_batch_id, entity_id, period_id, source_date, data_type, row_data, metadata) '
    'SELECT %L::uuid, %L::uuid, NULL, NULL, NULLIF(source_date, '''')::date, data_type, row_data::jsonb, metadata::jsonb '
    'FROM %I',
    p_tenant_id, p_import_batch_id, v_ft
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  EXECUTE format('DROP FOREIGN TABLE %I', v_ft);
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bulk_commit_from_storage(uuid, text, uuid) TO service_role;

-- ── 3. worker: per-part manifest status (parallel-ready), all HF-360 guarantees preserved ───────────
--   • FOR UPDATE SKIP LOCKED claim + per-iteration re-lock (concurrency guard) — unchanged
--   • per-pulse COMMIT durability + cursor resume — unchanged
--   • delete-before-insert idempotent re-load — unchanged
--   • HALT-DATA-LOSS exact-count check — unchanged
--   • NEW: manifest[i].status = 'loaded' | 'failed' (+ loadedAt / error) stamped as each part lands.
create or replace procedure public.process_pulse_load_jobs()
language plpgsql
as $$
declare
  v_id        uuid;
  v_tenant    uuid;
  v_cursor    integer;
  v_total     integer;
  v_manifest  jsonb;
  v_pulse     jsonb;
  v_batch     uuid;
  v_path      text;
  v_expected  integer;
  v_count     bigint;
  v_err       text;
  v_status    text;
begin
  select id, tenant_id, cursor, total_pulses, manifest
    into v_id, v_tenant, v_cursor, v_total, v_manifest
  from public.pulse_load_jobs
  where status = 'enqueued' or (status = 'loading' and updated_at < now() - interval '2 minutes')
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  update public.pulse_load_jobs
     set status = 'loading', updated_at = now(),
         audit = audit || jsonb_build_object('at', now(), 'from', status, 'to', 'loading', 'detail', 'claimed at cursor '||v_cursor)
   where id = v_id;
  commit;

  loop
    -- CRITICAL concurrency guard (HF-360): re-acquire the row lock per pulse; the authoritative
    -- cursor + status come from the row. See 20260701_hf360 for the full rationale.
    select cursor, status, manifest into v_cursor, v_status, v_manifest from public.pulse_load_jobs where id = v_id for update;
    if v_status is distinct from 'loading' then
      return;
    end if;
    exit when v_cursor >= v_total;

    v_pulse    := v_manifest -> v_cursor;
    v_batch    := (v_pulse ->> 'batchId')::uuid;
    v_path     := v_pulse ->> 'csvPath';
    v_expected := (v_pulse ->> 'expectedRows')::integer;

    v_err := null;
    begin
      delete from public.committed_data where import_batch_id = v_batch and tenant_id = v_tenant;
      v_count := public.bulk_commit_from_storage(v_tenant, v_path, v_batch);
    exception when others then
      v_err := sqlerrm;
    end;

    if v_err is not null then
      update public.pulse_load_jobs
         set status = 'failed', error_detail = 'pulse '||v_cursor||' load error: '||v_err, updated_at = now(),
             manifest = jsonb_set(manifest, array[v_cursor::text], (manifest -> v_cursor) || jsonb_build_object('status', 'failed', 'error', left(v_err, 500))),
             audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'failed', 'detail', 'pulse '||v_cursor||': '||v_err)
       where id = v_id;
      commit;
      return;
    end if;

    if v_count <> v_expected then
      update public.pulse_load_jobs
         set status = 'failed', error_detail = 'HALT-DATA-LOSS pulse '||v_cursor||': loaded '||v_count||' of '||v_expected, updated_at = now(),
             manifest = jsonb_set(manifest, array[v_cursor::text], (manifest -> v_cursor) || jsonb_build_object('status', 'failed', 'error', 'HALT-DATA-LOSS: loaded '||v_count||' of '||v_expected)),
             audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'failed', 'detail', 'pulse '||v_cursor||' data-loss')
       where id = v_id;
      commit;
      return;
    end if;

    update public.import_batches set status = 'completed', row_count = v_count, completed_at = now() where id = v_batch;
    v_cursor := v_cursor + 1;
    update public.pulse_load_jobs
       set cursor = v_cursor, rows_loaded = rows_loaded + v_count, updated_at = now(),
           manifest = jsonb_set(manifest, array[(v_cursor - 1)::text], (manifest -> (v_cursor - 1)) || jsonb_build_object('status', 'loaded', 'loadedAt', now(), 'rowsLoaded', v_count)),
           audit = audit || jsonb_build_object('at', now(), 'to', 'pulse:'||(v_cursor - 1)||' landed', 'detail', v_count||' rows')
     where id = v_id;
    commit;
  end loop;

  update public.pulse_load_jobs
     set status = 'complete', updated_at = now(),
         audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'complete', 'detail', rows_loaded||' rows across '||v_total||' pulses')
   where id = v_id and status = 'loading';
  commit;
end;
$$;
grant execute on procedure public.process_pulse_load_jobs() to service_role;
-- ============================================================
