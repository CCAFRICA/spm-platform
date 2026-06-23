-- ============================================================
-- HF-337 P2a storage: surface_bindings — the Surface Binding Recognition store.
--
-- DS-030 consumer-side mirror of Decision 158. A product SURFACE declares a free-form analytical
-- PURPOSE; the LLM RECOGNIZES which comprehended field(s) satisfy it (free-form intent meeting
-- free-form characterization); deterministic code persists the recognized binding HERE and renders.
-- Re-encounter READS this store (no second LLM call — Progressive Performance at tenant scope).
--
-- THE REGISTRY BRIGHT LINE (Korean Test / No-Fixed-Taxonomy): the store is keyed on the data's own
-- STRUCTURAL FINGERPRINT (`structural_fingerprint_hash`, a hash of the tenant's comprehension shape)
-- plus a fixed *product* surface id. It grows when the SYSTEM RECOGNIZES A NEW SHAPE (by encounter),
-- NEVER when a developer edits an entry (by maintenance). It is NEVER keyed on a developer-authored
-- intent/role/field string, and carries NO property-schema columns (is_monetary/is_additive/etc.) —
-- those would invert Decision 158 by constraining recognition into developer boxes. resolved_fields is
-- the free-form recognition result; purpose_text is the surface's free-form purpose (audit/observability).
--
-- OB-235 forward-shape: the cross-tenant index (structural_fingerprint_hash, surface_id) — tenant_id
-- DROPPED — is exactly the key OB-235's learner-core matches on to inherit a binding at a new tenant's
-- cold-start. This store is the artifact OB-235 SUBSUMES, not duplicates.
--
-- SQL-Verify gate (FP-49): read-only service-role probe (web/scripts/_hf337-p0-probe.ts) confirmed no
-- existing table carries (tenant_id, structural_fingerprint_hash, surface_id) -> resolved_fields
-- additively (structural_fingerprints is per-import classification; foundational/domain/synaptic are
-- learned-execution patterns) -> this minimal additive store is required. tenants.id (uuid) verified.
--
-- HALT-MIGRATION (SR-44): CC authors + commits this file + the SCHEMA_REFERENCE_LIVE.md update. The
-- ARCHITECT applies it in the Supabase SQL Editor. CC then verifies via a service-role read before any
-- P2 binding read/write code runs. CC never applies the migration itself.
-- ============================================================

create table if not exists public.surface_bindings (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants(id) on delete cascade,
  structural_fingerprint_hash text not null,                 -- hash of the tenant's comprehension shape
  surface_id                  text not null,                 -- the product surface (e.g. 'financial.network_pulse.revenue')
  purpose_text                text,                          -- the surface's FREE-FORM analytical purpose (audit)
  resolved_fields             jsonb not null default '[]'::jsonb, -- recognized field(s): [{field_name, display_label, confidence}]
  confidence                  numeric,                       -- overall recognition confidence
  recognized_by               text,                          -- model that performed the recognition
  created_at                  timestamp with time zone not null default now(),
  updated_at                  timestamp with time zone not null default now(),
  -- The decoupling/memoization key: one binding per (tenant comprehension-shape, surface). Recognition
  -- upserts on this key (recognize once, read forever at tenant scope).
  constraint surface_bindings_tenant_fp_surface_key unique (tenant_id, structural_fingerprint_hash, surface_id)
);

create index if not exists surface_bindings_tenant_surface_idx
  on public.surface_bindings (tenant_id, surface_id);
-- OB-235 cross-tenant matching key (tenant_id dropped): a new tenant whose comprehension fingerprint
-- matches a known (fingerprint, surface) inherits the binding at cold-start.
create index if not exists surface_bindings_fp_surface_idx
  on public.surface_bindings (structural_fingerprint_hash, surface_id);

alter table public.surface_bindings enable row level security;

-- Tenant-isolation + platform/vl_admin full access (mirrors 20260622_ob233_comprehension_artifacts.sql).
-- The recognizer writes via the service-role client (RLS-bypassing); this is the user-token-read backstop
-- and satisfies Standing Rule 9.
drop policy if exists "tenant_isolation_surface_bindings" on public.surface_bindings;
create policy "tenant_isolation_surface_bindings" on public.surface_bindings
  for all using (
    tenant_id in (select tenant_id from profiles where auth_user_id = auth.uid())
    or exists (select 1 from profiles where auth_user_id = auth.uid() and role in ('platform', 'vl_admin'))
  );
