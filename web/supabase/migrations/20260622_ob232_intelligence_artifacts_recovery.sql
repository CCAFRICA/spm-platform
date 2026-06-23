-- ============================================================
-- OB-232 RECOVERY: intelligence_artifacts — the Insight Engine store.
--
-- WHY THIS FILE EXISTS (SR-43 reproducibility gap): OB-232 (PR #590) shipped the
-- Insight Engine and the intelligence_artifacts table WITHOUT a migration — the
-- table was created manually in the Supabase SQL Editor. The table is now LIVE.
-- This file reproduces the live definition for migration history so the schema is
-- reproducible from migrations alone (a fresh environment gets the same table).
--
-- SAFETY: the table is ALREADY LIVE — this migration reproduces it for migration
-- history; `create table if not exists` makes it a NO-OP against the live DB. Every
-- statement is IF-NOT-EXISTS / idempotent, so this file can NEVER alter, drop, or
-- re-shape the live table. It only fills the missing migration-history record and
-- bootstraps a fresh database identically.
--
-- AUTHORITATIVE SOURCE: the column shape below was derived from the live Supabase
-- OpenAPI spec (`GET /rest/v1/` -> .definitions.intelligence_artifacts), the same
-- introspection method used to generate SCHEMA_REFERENCE_LIVE.md. The OpenAPI
-- `required` array gives NOT NULL (id, tenant_id, title, data_references, created_at,
-- updated_at); every other column is nullable. The `<fk .../>` notes in each column
-- description give the foreign keys (tenants.id, entities.id, import_batches.id).
--
-- WRITER CROSS-CHECK (web/src/lib/insight/insight-engine.ts): the live OpenAPI shape
-- is a SUPERSET/variant of the writer's insert — the live table carries period_id,
-- shape_description, structural_fingerprint_hash, source, context, source_import_batch_id
-- that the writer does not set, and the writer references period_start/period_end/
-- insight_shape/recommended_action/generated_by that are NOT live columns. The LIVE
-- OpenAPI shape is authoritative here (this file reproduces what EXISTS); reconciling
-- the writer to the live shape is out of scope for this recovery migration.
--
-- KOREAN TEST: artifact_type / severity / entity_type are free-form TEXT — no enum,
-- no fixed-set CHECK. The LLM characterizes each insight in its own words and the
-- value is stored verbatim; deterministic code never substring-matches it.
--
-- HALT-MIGRATION (SR-44): CC authors + commits this file. The ARCHITECT applies it
-- in the Supabase SQL Editor. Because every statement is idempotent and the table is
-- already live, applying it is a no-op against production state (and brings the
-- migration history into sync). CC does NOT apply this migration itself.
-- ============================================================

create table if not exists public.intelligence_artifacts (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants(id) on delete cascade,
  entity_id                   uuid references public.entities(id) on delete set null,  -- FK; nullable for network-level insights
  period_id                   uuid,                     -- nullable period scope
  artifact_type               text,                     -- free-form: insight characterization (LLM-recognized, no enum)
  severity                    text,                     -- free-form: insight severity (LLM-recognized, no enum)
  entity_type                 text,                     -- free-form: what the entity is, or 'network'
  title                       text not null,            -- insight headline
  narrative                   text,                     -- human-readable insight body
  data_references             jsonb not null default '[]'::jsonb,  -- traceable numerics copied from summary data
  shape_description           text,                     -- tenant-content-free structural fingerprint
  structural_fingerprint_hash text,                     -- hash of the structural shape (EP-3)
  source                      text,                     -- structural provenance of the artifact
  context                     jsonb not null default '{}'::jsonb,  -- additional structural context
  source_import_batch_id      uuid references public.import_batches(id) on delete set null,  -- FK; nullable
  created_at                  timestamp with time zone not null default now(),
  updated_at                  timestamp with time zone not null default now()
);

create index if not exists idx_intelligence_artifacts_tenant
  on public.intelligence_artifacts (tenant_id);
create index if not exists idx_intelligence_artifacts_tenant_entity
  on public.intelligence_artifacts (tenant_id, entity_id);

alter table public.intelligence_artifacts enable row level security;

-- Tenant-isolation + platform/vl_admin full access. Mirrors the platform's existing
-- pattern (20260616000000_ob212_agent_invocations.sql /
-- 20260622_ob233_comprehension_artifacts.sql). The Insight Engine writes via the
-- service-role client (RLS-bypassing); this policy is the backstop for any user-token
-- read and satisfies Standing Rule 9 (VL Admin full access).
drop policy if exists "tenant_isolation_intelligence_artifacts" on public.intelligence_artifacts;
create policy "tenant_isolation_intelligence_artifacts" on public.intelligence_artifacts
  for all using (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  );
