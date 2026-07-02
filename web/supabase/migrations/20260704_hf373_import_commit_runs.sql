-- HF-373 Phase D (D9) — single-fire commit dispatch. execute-bulk accepted unlimited concurrent
-- identical commits: the 2026-07-02 Casa Diaz run committed the plan arm TWICE concurrently
-- (contained only by the HF-259 plan_interpretation_runs content-hash single-flight), and the
-- 2026-07-01 pre-HF-371 window shows the class at runaway scale (312 batches for ONE 837-row unit
-- in ONE proposal, all superseded). This table is the atomic commit-side coalescing claim,
-- mirroring import_finalize_runs (HF-371): the first caller INSERTs (unique PK (tenant_id,
-- proposal_id, scope_hash)); a CONCURRENT duplicate of the SAME work hits 23505 and coalesces
-- loudly. scope_hash identifies the request's work (sha256 of its sorted contentUnitIds), so two
-- DIFFERENT file groups of one import never contend. A crashed pass goes stale (>10 min) →
-- takeover; 'failed' → retryable; 'done' → a re-POST is GRANTED and the resume machinery /
-- single-flight makes it a no-op (the HF-296 lost-response recovery contract is preserved —
-- only CONCURRENT duplicates coalesce). execute-bulk writes this with the SERVICE ROLE only.
--
-- Tenant-scoped ephemeral state → cleared by Clean Slate (HF-370 O5 'data' category; the
-- disposition drift-guard test asserts coverage). Never holds tenant data beyond the claim key.

create table if not exists public.import_commit_runs (
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  proposal_id text        not null,
  scope_hash  text        not null,
  status      text        not null default 'running',   -- running | done | failed
  claimed_at  timestamptz not null default now(),
  primary key (tenant_id, proposal_id, scope_hash)
);

create index if not exists import_commit_runs_tenant_idx on public.import_commit_runs (tenant_id);

-- Service-role only: execute-bulk runs service-role (bypasses RLS). RLS on with NO policies.
alter table public.import_commit_runs enable row level security;
