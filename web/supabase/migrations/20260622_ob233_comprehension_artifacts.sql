-- ============================================================
-- OB-233 Phase 0: comprehension_artifacts — the plan-independent comprehension store.
--
-- DS-030 Persistent Comprehension Architecture. Comprehension is a property of the
-- DATA, not of a plan. It is stored here, keyed by data identity (tenant_id, field_name),
-- and is NEVER written to rule_sets.input_bindings (C0b / C6: the calc engine's binding
-- read-contract is untouched). A tenant with zero plans still produces full comprehension
-- on import; a tenant with five plans comprehends each field ONCE (UNIQUE below), not 5x.
--
-- KOREAN TEST (C3): every semantic column is free-form text. There is NO structuralType /
-- contextualIdentity / role-enum column and NO fixed-set data_type column. A Korean tenant
-- with Hangul field names is comprehended with no code change. The free-form text is produced
-- by the LLM (recognition, C1) and stored verbatim; deterministic code never substring-matches it.
--
-- C0 (no registries): no column constrains values to a permitted set. The only integrity rule
-- is the UNIQUE data-identity key. aggregation_method/display_label are LLM-recognized caches
-- (Objective 4); dispatch on aggregation_method is fail-loud in code (C2), not constrained here.
--
-- SQL-Verify gate (FP-49 / AP-18): read-only service-role probe confirmed BEFORE authoring:
--   tenants.id        uuid  (sample 5035b1e8-... uuid? true)   -> FK target valid
--   import_batches.id uuid  (sample 71184c3a-... uuid? true)   -> FK target valid
--   comprehension_artifacts: ABSENT (PGRST205 "Could not find the table ... in the schema cache")
-- (script: web/scripts/_ob233-fp49-schema-verify.ts; output pasted in OB-233 completion report.)
--
-- HALT-MIGRATION (SR-44): CC authors + commits this file. The ARCHITECT applies it in the
-- Supabase SQL Editor. CC then verifies via npx tsx web/scripts/_ob233-fp49-schema-verify.ts
-- and pastes the output. CC does NOT apply this migration itself and does NOT wire any
-- comprehension-reading/writing code until this table is verified present.
-- ============================================================

create table if not exists public.comprehension_artifacts (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  field_name             text not null,            -- the source column this row comprehends
  characterization       text not null,            -- free-form: what the field means (DS-030 §4.1)
  data_nature            text,                     -- free-form: the nature of the value
  relationships          text,                     -- free-form: how it relates to other fields
  aggregation_behavior   text,                     -- free-form: read by Summary Engine, never substring-matched
  identifies             text,                     -- free-form entity description; NULL if not an identifier
  display_label          text,                     -- cached LLM-derived label (Objective 4)
  aggregation_method     text,                     -- cached LLM-recognized method (Objective 4); dispatched fail-loud (C2)
  source_import_batch_id uuid references public.import_batches(id) on delete set null,
  created_at             timestamp with time zone not null default now(),
  updated_at             timestamp with time zone not null default now(),
  -- The decoupling guarantee (C0b): one comprehension per field per tenant, independent of
  -- plan count. The comprehension generator upserts on this key (idempotent, never blanked
  -- without replacement). Proven by PG-3b on a multi-plan tenant.
  constraint comprehension_artifacts_tenant_field_key unique (tenant_id, field_name)
);

create index if not exists comprehension_artifacts_tenant_idx
  on public.comprehension_artifacts (tenant_id);

alter table public.comprehension_artifacts enable row level security;

-- Tenant-isolation + platform/vl_admin full access. Mirrors the platform's existing pattern
-- (20260616000000_ob212_agent_invocations.sql). The pipeline writes via the service-role client
-- (RLS-bypassing); this policy is the backstop for any user-token read and satisfies Standing
-- Rule 9 (VL Admin full access on every table the pipeline writes to).
drop policy if exists "tenant_isolation_comprehension_artifacts" on public.comprehension_artifacts;
create policy "tenant_isolation_comprehension_artifacts" on public.comprehension_artifacts
  for all using (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  );
