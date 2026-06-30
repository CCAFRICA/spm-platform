-- ============================================================
-- HF-360 (Part A/B) — HAND-OFF LOAD: the database-side pulse-load worker.
--
-- The serverless function stages all pulse CSVs to Storage + INSERTs ONE pulse_load_jobs row + EXITS (it
-- never spends the load duration). This pg_cron worker performs the per-pulse FDW loads OFF the serverless
-- clock, advancing a cursor, COMMITting after EACH pulse so a crash/stop leaves a precise, resumable
-- partial (prior pulses durable). The worker contains NO LLM and NO remediation — the staged CSVs are
-- already fully built (remediation applied at stage time; Decision 158 load-path boundary).
--
-- ARCHITECT (SR-44): apply this migration, confirm `create extension pg_cron` is enabled (1.6.4 confirmed),
-- and verify the cron.schedule below. CC does not apply migrations or schedule cron.
-- ============================================================

-- ── 1. THE JOB + MANIFEST + CURSOR (durable, auditable) ─────────────────────────────────────────────
create table if not exists public.pulse_load_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  session_id    uuid not null,                       -- the import session (UI + Part B find the job by this)
  unit_id       text not null,
  file_name     text not null,
  status        text not null default 'enqueued',    -- enqueued|loading|complete|failed|rolled_back
  manifest      jsonb not null,                      -- ordered [{index,batchId,csvPath,expectedRows,bytes,unitId,sheetName}]
  cursor        integer not null default 0,          -- index of the NEXT pulse to load (== total_pulses ⇒ done)
  total_pulses  integer not null,
  total_rows    integer not null,
  rows_loaded   integer not null default 0,          -- Σ verified-loaded rows for pulses [0, cursor)
  error_detail  text,
  audit         jsonb not null default '[]'::jsonb,  -- append-only transition log
  -- HF-360 (finalize sweep): once a job is 'complete', the post-commit finalize (entity resolution, which
  -- READS committed_data) must run. The client fires it when present, but a user who leaves the page would
  -- orphan it — so a server-side sweep (finalize-sweep endpoint, architect-scheduled cron) finalizes any
  -- complete-but-unfinalized job. Idempotent (finalize-import is safe to call repeatedly); this flag stops
  -- the sweep from re-firing.
  finalized     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()   -- heartbeat: a stale 'loading' (> 2 min) is reclaimable
);
create index if not exists pulse_load_jobs_drain_idx on public.pulse_load_jobs (status, updated_at);
create index if not exists pulse_load_jobs_session_idx on public.pulse_load_jobs (tenant_id, session_id);
-- the sweep's hot path: complete jobs not yet finalized.
create index if not exists pulse_load_jobs_finalize_idx on public.pulse_load_jobs (status, finalized) where status = 'complete' and finalized = false;

alter table public.pulse_load_jobs enable row level security;
-- The function (enqueue) + the worker run under service_role (full access). Authenticated callers may READ
-- their tenant's jobs (the truthful surface + Part B operations resolve the job server-side under
-- service_role; this SELECT policy lets a tenant member observe their own import's load state).
drop policy if exists pulse_load_jobs_service_all on public.pulse_load_jobs;
create policy pulse_load_jobs_service_all on public.pulse_load_jobs for all to service_role using (true) with check (true);
drop policy if exists pulse_load_jobs_tenant_read on public.pulse_load_jobs;
create policy pulse_load_jobs_tenant_read on public.pulse_load_jobs for select to authenticated
  using (tenant_id in (select p.tenant_id from public.profiles p where p.auth_user_id = auth.uid()));

-- ── 2. THE WORKER (a PROCEDURE — COMMITs per pulse for durable, resumable loads) ────────────────────
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
  v_err       text;     -- captured load error (set INSIDE the begin/exception block, handled OUTSIDE it)
  v_status    text;     -- the job's live status, re-read each iteration (rollback/external-change responsive)
begin
  -- Claim ONE job: enqueued, or a 'loading' job whose tick died (heartbeat > 2 min stale → resume from its
  -- cursor). FOR UPDATE SKIP LOCKED ⇒ concurrent cron ticks never grab the same job (they take other jobs).
  select id, tenant_id, cursor, total_pulses, manifest
    into v_id, v_tenant, v_cursor, v_total, v_manifest
  from public.pulse_load_jobs
  where status = 'enqueued' or (status = 'loading' and updated_at < now() - interval '2 minutes')
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return;  -- nothing to do this tick
  end if;

  update public.pulse_load_jobs
     set status = 'loading', updated_at = now(),
         audit = audit || jsonb_build_object('at', now(), 'from', status, 'to', 'loading', 'detail', 'claimed at cursor '||v_cursor)
   where id = v_id;
  commit;  -- claim is durable + the heartbeat (updated_at) now protects this job from other ticks

  -- Load remaining pulses, COMMITting after each (per-pulse durability ⇒ a later failure leaves prior
  -- pulses committed and resumable from the cursor).
  loop
    -- CRITICAL concurrency guard: re-acquire the job row lock (FOR UPDATE) for THIS pulse and read the
    -- AUTHORITATIVE cursor + status from the row. The lock is held through this pulse's load + COMMIT, so an
    -- overlapping cron tick (the SKIP-LOCKED claim above) cannot grab this job while a pulse is loading —
    -- even a pulse SLOWER than the 2-min stale-heartbeat window (the very regime HF-360 exists for). Without
    -- this, a slow pulse leaves the row unlocked + the heartbeat stale, so a second tick would re-load the
    -- SAME pulse concurrently and double-insert (the per-pulse count check cannot detect a duplicate; the
    -- delete-first below is MVCC-blind to a live concurrent inserter). Reading the cursor from the row (not a
    -- local) also makes a concurrent advance / external change authoritative, and the status read STOPS the
    -- worker if a Part-B ROLLBACK marked the job (bounds any orphan to zero — the lock serializes them).
    select cursor, status into v_cursor, v_status from public.pulse_load_jobs where id = v_id for update;
    if v_status is distinct from 'loading' then
      return;  -- rolled_back / failed / external change — FOR UPDATE released on return (rollback)
    end if;
    exit when v_cursor >= v_total;  -- all pulses loaded; mark complete below (still holding the lock → safe)

    v_pulse    := v_manifest -> v_cursor;
    v_batch    := (v_pulse ->> 'batchId')::uuid;
    v_path     := v_pulse ->> 'csvPath';
    v_expected := (v_pulse ->> 'expectedRows')::integer;

    -- Capture any load error in v_err — a COMMIT is ILLEGAL inside a block that has an EXCEPTION handler
    -- (the handler establishes a subtransaction), so the failure is HANDLED + COMMITted OUTSIDE this block.
    v_err := null;
    begin
      -- Idempotent re-load: clear any committed_data this batch may already hold (a reclaimed/resumed pulse,
      -- or a concurrent attempt) BEFORE inserting, so a re-processed pulse can never duplicate rows. This +
      -- the bulk load are one transaction (committed together below), so the delete+insert is atomic. On the
      -- normal first load of a freshly-staged batch this deletes 0 rows. Tenant-scoped (defense in depth).
      delete from public.committed_data where import_batch_id = v_batch and tenant_id = v_tenant;
      v_count := public.bulk_commit_from_storage(v_tenant, v_path, v_batch);  -- the FDW load (no LLM)
    exception when others then
      v_err := sqlerrm;
    end;

    if v_err is not null then
      update public.pulse_load_jobs
         set status = 'failed', error_detail = 'pulse '||v_cursor||' load error: '||v_err, updated_at = now(),
             audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'failed', 'detail', 'pulse '||v_cursor||': '||v_err)
       where id = v_id;
      commit;
      return;
    end if;

    -- HALT-DATA-LOSS: the DB must have loaded EXACTLY the staged row count (no silent partial).
    if v_count <> v_expected then
      update public.pulse_load_jobs
         set status = 'failed', error_detail = 'HALT-DATA-LOSS pulse '||v_cursor||': loaded '||v_count||' of '||v_expected, updated_at = now(),
             audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'failed', 'detail', 'pulse '||v_cursor||' data-loss')
       where id = v_id;
      commit;
      return;
    end if;

    -- Finalize this pulse's batch (staged → completed) and advance the cursor.
    update public.import_batches set status = 'completed', row_count = v_count, completed_at = now() where id = v_batch;
    v_cursor := v_cursor + 1;
    update public.pulse_load_jobs
       set cursor = v_cursor, rows_loaded = rows_loaded + v_count, updated_at = now(),
           audit = audit || jsonb_build_object('at', now(), 'to', 'pulse:'||(v_cursor - 1)||' landed', 'detail', v_count||' rows')
     where id = v_id;
    commit;  -- THIS pulse is now durable; a stop here resumes from v_cursor
  end loop;

  -- Complete only if still loading (a rollback during the final pulse must not flip a rolled_back job to
  -- complete). The guard mirrors the per-iteration check for the last pulse.
  update public.pulse_load_jobs
     set status = 'complete', updated_at = now(),
         audit = audit || jsonb_build_object('at', now(), 'from', 'loading', 'to', 'complete', 'detail', rows_loaded||' rows across '||v_total||' pulses')
   where id = v_id and status = 'loading';
  commit;
end;
$$;

grant execute on procedure public.process_pulse_load_jobs() to service_role;

-- ── 3. SCHEDULE (architect verifies; pg_cron 1.6.4 supports the seconds syntax + procedure CALL) ─────
-- select cron.schedule('hf360-pulse-loader', '30 seconds', $cron$ call public.process_pulse_load_jobs(); $cron$);
-- ARCHITECT: uncomment/run the cron.schedule above after applying this migration. The procedure COMMITs
-- per pulse, so pg_cron must CALL it (not wrap it in an outer transaction) — pg_cron does this for top-level
-- CALL. One tick drains one job to completion (or to its bound); concurrent ticks take different jobs
-- (SKIP LOCKED). The old Vercel cron stays OFF — this replaces it.
-- ============================================================
