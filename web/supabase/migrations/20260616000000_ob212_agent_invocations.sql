-- ============================================================
-- OB-212 N2: agent_invocations — capture table for the agent runtime.
--
-- VP public.agent_invocations. Distinct from VG's igf.agent_invocations
-- (separate governance database) — no collision.
--
-- Every agent run writes exactly one row (running -> completed|failed|cached).
-- Read-only above the Deterministic Calculation Boundary: agents write here,
-- to agent_inbox, and to classification_signals — never to calc tables.
-- Structural columns only (Korean Test). provider/model are kept (Amendment 1,
-- architect §B) to feed the AI Substrate panel.
--
-- SQL-Verify gate (FP-49): confirmed public.agent_invocations did NOT exist
-- (read-only service-role probe -> PGRST205) before authoring.
--
-- HALT-MIG: CC authors + commits this file. The ARCHITECT applies it in the
-- Supabase SQL Editor (SR-44). CC then verifies via npx tsx and pastes output.
-- ============================================================

create table if not exists public.agent_invocations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  agent_name          text not null,            -- structural agent id
  invocation_type     text not null,            -- structural, e.g. 'reconciliation_diagnosis'
  subject_ref         jsonb not null default '{}'::jsonb,  -- what was investigated (ids only)
  request_fingerprint text not null,            -- Progressive Performance cache key
  status              text not null default 'running',     -- running|completed|failed|cached
  turn_count          integer not null default 0,
  tool_calls          jsonb not null default '[]'::jsonb,  -- ordered trajectory (bounded summaries)
  result              jsonb not null default '{}'::jsonb,  -- diagnosis/output
  confidence          numeric,
  latency_ms          integer,
  provider            text,                     -- structural: provider that served this run
  model               text,                     -- structural: model that served this run
  token_usage         jsonb not null default '{}'::jsonb,
  cost_usd            numeric,
  cache_hit           boolean not null default false,
  created_by          uuid,
  created_at          timestamp with time zone not null default now(),
  completed_at        timestamp with time zone
);

create index if not exists idx_agent_invocations_tenant_agent_created
  on public.agent_invocations (tenant_id, agent_name, created_at desc);
create index if not exists idx_agent_invocations_fingerprint
  on public.agent_invocations (request_fingerprint);

alter table public.agent_invocations enable row level security;

-- Tenant-isolation + platform/vl_admin full access. Mirrors the platform's
-- existing pattern (022_hf134_rls_audit_hardening.sql: agent_inbox / platform_events).
-- Routes use the service-role client (RLS-bypassing); this policy is the backstop
-- for any user-token read and satisfies Standing Rule 9 (VL Admin full access).
drop policy if exists "tenant_isolation_agent_invocations" on public.agent_invocations;
create policy "tenant_isolation_agent_invocations" on public.agent_invocations
  for all using (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  );
