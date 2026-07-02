-- OB-257 — summary_rollups: domain-agnostic period/dimension-grain materialization store (MSP family).
-- SR-44: authored by CC, APPLIED BY THE ARCHITECT in the Supabase SQL Editor. Not run by CC.
-- SQL Verification Gate (FP-49): FK targets tenants/periods/entities verified live; table verified ABSENT;
-- profiles(auth_user_id, tenant_id, role) verified for the RLS policy
-- (web/scripts/ob257-sqlgate-summary-rollups.ts, pasted in the OB-257 completion report).
--
-- WHY A NEW TABLE (ADR Decision 2): summary_artifacts.entity_id is FK NOT NULL by design — period-grain
-- and dimension-grain rollups have no semantically honest home there (the calc sentinel and the fine tier
-- borrow entity ids to satisfy the constraint; that hack is not extended). Rows here are keyed by what they
-- actually are: a period, optionally an entity, optionally a (dimension_role, dimension_member) pair.
-- Writers own a data_type namespace and idempotently replace ONLY their own namespace — this table is not
-- subject to the summary-engine tenant-wide wipe.
--
-- KOREAN TEST: zero domain vocabulary in the schema. dimension_role carries the RECOGNIZED semantic role
-- (recognition output, e.g. a location-role token); dimension_member carries tenant DATA values. Field
-- selection happens at the recognition layer (Decision 158); this table stores results only.

create table if not exists public.summary_rollups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid references public.periods(id) on delete cascade,
  summary_date date,
  data_type text not null,           -- writer-owned namespace (open vocabulary, AP-26)
  entity_id uuid references public.entities(id) on delete cascade,
  dimension_role text,               -- recognized semantic role for dimension-grain rows
  dimension_member text,             -- dimension member value (tenant data)
  metrics jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_summary_rollups_tenant_type
  on public.summary_rollups (tenant_id, data_type);
create index if not exists idx_summary_rollups_tenant_period
  on public.summary_rollups (tenant_id, period_id);
create index if not exists idx_summary_rollups_tenant_entity
  on public.summary_rollups (tenant_id, entity_id) where entity_id is not null;

alter table public.summary_rollups enable row level security;

-- Tenant-isolation + platform/vl_admin full access — mirrors 20260622_ob232_intelligence_artifacts_recovery.sql.
-- Writers use the service-role client (RLS-bypassing); this policy is the backstop for user-token reads
-- and satisfies Standing Rule 9 (VL Admin access).
drop policy if exists "tenant_isolation_summary_rollups" on public.summary_rollups;
create policy "tenant_isolation_summary_rollups" on public.summary_rollups
  for all using (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  );
