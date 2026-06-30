-- ============================================================
-- HF-362 Part A — HAND-OFF BATCH-CREATION FIX.
--
-- The HF-360 hand-off stages each pulse's CSV and INSERTs its import_batches row with status='staged' so the
-- pg_cron worker's bulk_commit_from_storage finds the committed_data FK target. But the original constraint
-- (003_data_and_calculation.sql:21) is CHECK (status IN ('pending','processing','completed','failed')) — it
-- does NOT include 'staged'. So the insert failed (SQLSTATE 23514, error unchecked), no batch row was created,
-- and EVERY hand-off load failed on committed_data_import_batch_id_fkey.
--
-- 'staged' is the correct status (not just any FK target): the stale-batch reconciler
-- (committed-data-visibility.ts) acts ONLY on 'processing'/'failed' batches, so a distinct 'staged' status is
-- automatically EXEMPT from being reconciled-as-failed mid-load (a multi-pulse load exceeds the 6-min
-- liveness window); and the visibility gate hides non-'completed' batches, so staged rows stay invisible
-- until the worker finalizes them. This migration widens the constraint to allow 'staged' (preserving the
-- existing four), and updates the worker to mark a FAILED pulse's batch 'failed' (the staged→failed half of
-- the lifecycle; staged→completed already exists).
--
-- ARCHITECT (SR-44): apply this BEFORE the deploy. Part B makes hand-off automatic for large files, so the
-- code expects 'staged' to be valid. (Small-file synchronous imports use 'processing' and are unaffected.)
-- ============================================================

-- ── 1. Allow 'staged' (the hand-off batch status). Idempotent: drop-if-exists then re-add the full set. ──
alter table public.import_batches drop constraint if exists import_batches_status_check;
alter table public.import_batches add constraint import_batches_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'staged'));

-- ── 2. Worker: mark a FAILED pulse's batch 'failed' (staged → failed on error). Otherwise unchanged from the
--       HF-360 procedure (FOR-UPDATE-per-pulse concurrency guard, idempotent re-load, COMMIT-per-pulse). ──
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
    -- Re-acquire the job row FOR UPDATE per pulse (held through load + COMMIT) so an overlapping cron tick's
    -- SKIP-LOCKED claim skips this job while a pulse is loading — no double-load even for a slow pulse.
    select cursor, status into v_cursor, v_status from public.pulse_load_jobs where id = v_id for update;
    if v_status is distinct from 'loading' then
      return;
    end if;
    exit when v_cursor >= v_total;

    v_pulse    := v_manifest -> v_cursor;
    v_batch    := (v_pulse ->> 'batchId')::uuid;
    v_path     := v_pulse ->> 'csvPath';
    v_expected := (v_pulse ->> 'expectedRows')::integer;

    -- COMMIT is illegal inside an exception-handler block; capture the error and handle it outside.
    v_err := null;
    begin
      -- Idempotent re-load: clear any rows this batch already holds before inserting (atomic with the load).
      delete from public.committed_data where import_batch_id = v_batch and tenant_id = v_tenant;
      v_count := public.bulk_commit_from_storage(v_tenant, v_path, v_batch);
    exception when others then
      v_err := sqlerrm;
    end;

    if v_err is not null then
      -- HF-362: mark this pulse's batch failed (staged → failed), so it is visible-as-failed +
      -- reconciler-sweepable rather than a permanent hidden 'staged' orphan.
      update public.import_batches set status = 'failed',
             error_summary = jsonb_build_object('hf', 'HF-360-WORKER', 'error', 'pulse '||v_cursor||' load error: '||v_err)
       where id = v_batch;
      update public.pulse_load_jobs
         set status = 'failed', error_detail = 'pulse '||v_cursor||' load error: '||v_err, updated_at = now(),
             audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'failed', 'detail', 'pulse '||v_cursor||': '||v_err)
       where id = v_id;
      commit;
      return;
    end if;

    if v_count <> v_expected then
      update public.import_batches set status = 'failed',
             error_summary = jsonb_build_object('hf', 'HF-360-WORKER', 'error', 'HALT-DATA-LOSS: loaded '||v_count||' of '||v_expected)
       where id = v_batch;
      update public.pulse_load_jobs
         set status = 'failed', error_detail = 'HALT-DATA-LOSS pulse '||v_cursor||': loaded '||v_count||' of '||v_expected, updated_at = now(),
             audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'failed', 'detail', 'pulse '||v_cursor||' data-loss')
       where id = v_id;
      commit;
      return;
    end if;

    -- staged → completed.
    update public.import_batches set status = 'completed', row_count = v_count, completed_at = now() where id = v_batch;
    v_cursor := v_cursor + 1;
    update public.pulse_load_jobs
       set cursor = v_cursor, rows_loaded = rows_loaded + v_count, updated_at = now(),
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
