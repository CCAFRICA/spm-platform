-- ============================================================
-- OB-213 §2A (HALT-SCHEMA) — re-create public.disputes.
--
-- Phase-0 schema check found `disputes` MISSING (PGRST205). It was DROPPED on
-- 2026-04-28 (AUD-004) and never recreated. The directive assumed it existed —
-- it does not. Meanwhile the Adjustments page (/performance/adjustments) is
-- ALREADY Supabase-wired to it (loadAdjustmentsPageData selects the 14 columns
-- below + tenant_id; the page INSERTs on file and UPDATEs on approve/reject).
-- So the page is correct; the table is what's missing.
--
-- Columns match §2A (16) and the live page query exactly:
--   loadAdjustmentsPageData -> select(id, entity_id, period_id, category, status,
--     description, resolution, amount_disputed, amount_resolved, filed_by,
--     resolved_by, created_at, updated_at, resolved_at) .eq(tenant_id)
--   (batch_id is in the §2A spec but not selected by the page — kept for parity.)
--
-- HALT-SCHEMA: CC authors + commits this file. The ARCHITECT applies it in the
-- Supabase SQL Editor. CC then verifies via npx tsx and proceeds to Phase 2A.
-- The page uses the TENANT-SCOPED client (createClient(), not service-role), so
-- RLS must permit a tenant's members to read/file/resolve their own disputes.
-- ============================================================

create table if not exists public.disputes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  entity_id       uuid,                              -- nullable: page does .filter(Boolean) on entity_id
  period_id       uuid,
  batch_id        uuid,                              -- §2A parity (page does not select it)
  status          text not null default 'open',      -- open | resolved | rejected
  category        text not null default 'adjustment',
  description     text,
  resolution      text,
  amount_disputed numeric,
  amount_resolved numeric,
  filed_by        uuid,                              -- profiles.id (page maps to filer name)
  resolved_by     uuid,                              -- profiles.id (audit trail of who resolved)
  created_at      timestamp with time zone not null default now(),
  updated_at      timestamp with time zone not null default now(),
  resolved_at     timestamp with time zone
);

create index if not exists idx_disputes_tenant_created
  on public.disputes (tenant_id, created_at desc);
create index if not exists idx_disputes_tenant_entity
  on public.disputes (tenant_id, entity_id);

alter table public.disputes enable row level security;

-- Tenant-isolation + platform/vl_admin full access (mirrors the platform pattern:
-- 022_hf134_rls_audit_hardening.sql / agent_invocations). Tenant members may select,
-- file, and resolve their own tenant's disputes via the user-token client.
drop policy if exists "tenant_isolation_disputes" on public.disputes;
create policy "tenant_isolation_disputes" on public.disputes
  for all
  using (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  )
  with check (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  );
