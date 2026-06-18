-- ============================================================
-- OB-215 §6.1 (HALT-MIG) — create public.ai_call_metrics.
--
-- Phase-0 schema check (AUD-018 scouting): NO ai_call_metrics table exists. The
-- OB-212 `agent_invocations` table is the AGENT-RUNTIME capture table — its NOT-NULL
-- columns (agent_name, invocation_type, request_fingerprint, subject_ref) are
-- meaningful only for the multi-turn agent loop and the general AIService.execute()
-- path (the 20 single-call surfaces: file_classification, plan_component, …) cannot
-- write there without nulling those agent columns. So per-call metrics for execute()
-- get their own dedicated, queryable, indexable home here.
--
-- One row per AIService.execute() call (fire-and-forget; see ai-metrics-writer.ts):
--   task (AITaskType), provider, model (the RESOLVED model actually sent — OB-215
--   propagates it up so plan tasks correctly read claude-opus-4-8), tokens_in/out,
--   latency_ms, cost_usd (computeCallCostUSD × MODEL_PRICING), status, created_at.
--
-- HALT-MIG: CC authors + commits this file. The ARCHITECT applies it in the Supabase
-- SQL Editor (SR-44). CC then verifies via npx tsx. The writer uses the SERVICE-ROLE
-- client (RLS-bypassing at write); the RLS policy below is the backstop for
-- user-token reads (the Observatory AI-Metrics panel reads via the service-role
-- platform route, but the policy mirrors the platform pattern for VL-Admin reads).
-- ============================================================

create table if not exists public.ai_call_metrics (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  task        text not null,                              -- the AITaskType discriminant
  provider    text,
  model       text,                                       -- the RESOLVED model string actually sent
  tokens_in   integer,
  tokens_out  integer,
  latency_ms  integer,
  cost_usd    numeric,                                    -- per-call cost (MODEL_PRICING)
  status      text not null default 'success',            -- success | provider_error | degraded
  created_at  timestamp with time zone not null default now()
);

-- Time-series cost/usage queries (totals, last-30-days) and per-task / per-model rollups.
create index if not exists idx_ai_call_metrics_tenant_created
  on public.ai_call_metrics (tenant_id, created_at desc);
create index if not exists idx_ai_call_metrics_task_created
  on public.ai_call_metrics (tenant_id, task, created_at desc);
create index if not exists idx_ai_call_metrics_model_created
  on public.ai_call_metrics (model, created_at desc);

alter table public.ai_call_metrics enable row level security;

-- Tenant-isolation + platform/vl_admin full access (mirrors agent_invocations /
-- 022_hf134_rls_audit_hardening.sql). Service-role writes bypass RLS; this policy
-- governs user-token reads.
drop policy if exists "tenant_isolation_ai_call_metrics" on public.ai_call_metrics;
create policy "tenant_isolation_ai_call_metrics" on public.ai_call_metrics
  for all
  using (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  )
  with check (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  );
