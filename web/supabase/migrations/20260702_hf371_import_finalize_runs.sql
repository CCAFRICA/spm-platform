-- HF-371 (Root 1) — deterministic single finalize. The post-commit finalize (entity resolution,
-- transaction→entity linking, rule_set_assignments) is dispatched by up to three triggers for one import
-- (the client, execute-bulk's server-side waitUntil, the finalize-sweep cron). On the SYNCHRONOUS path the
-- client AND execute-bulk fire run concurrently with no coalescing → two passes disagree (one creates the
-- entities, the other reports 0 and links fewer rows). This table is the atomic coalescing claim: the first
-- caller INSERTs (unique PK (tenant_id, proposal_id)); a concurrent duplicate hits 23505 and no-ops. A
-- crashed pass leaves a 'running' row that goes stale (>15 min) → retryable; a 'failed' row is retryable; a
-- 'done' row coalesces later duplicates. finalize-import writes this with the SERVICE ROLE only.
--
-- Tenant-scoped ephemeral state → cleared by Clean Slate (HF-370 O5 'data' category; the disposition
-- drift-guard test asserts coverage). Never holds tenant data beyond the claim key + status.

create table if not exists public.import_finalize_runs (
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  proposal_id text        not null,
  status      text        not null default 'running',   -- running | done | failed
  claimed_at  timestamptz not null default now(),
  primary key (tenant_id, proposal_id)
);

-- Fast lookup of an existing claim on the 23505 path.
create index if not exists import_finalize_runs_tenant_idx on public.import_finalize_runs (tenant_id);

-- Service-role only: finalize-import runs service-role (bypasses RLS). Enable RLS with NO policies so no
-- browser/anon principal can read or write the claim ledger.
alter table public.import_finalize_runs enable row level security;
