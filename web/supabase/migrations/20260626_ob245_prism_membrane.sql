-- Migration: OB-245 Prism Slice 1 — Acquisition Membrane
-- DS-031 §11 Slice 1. The physical quarantine→scan→promote gate.
--
-- Adds:
--   1. file_objects           — the file lifecycle table (received→…→promoted|infected_held)
--   2. ingest-quarantine      — private bucket where ALL bytes land first (scan-before-promote)
--   3. RLS                    — tenant + owner isolation on file_objects and on quarantine objects
--
-- Compliance is architecture (Decision 123): the physical gate (separate bucket),
-- the append-only file.* audit chain (audit_logs, resource_type='file_object'), and
-- RLS below are structural, not policy overlays.
--
-- Conventions verified against the live schema (FP-49):
--   * No auth.tenant_id() exists — tenant scope is the inline profiles subquery.
--   * public.is_platform() (HF-283) is the platform/vl_admin predicate.
--   * Owner isolation stores owner_id = auth.uid() (matches storage.objects.owner).
--   * profiles.id ≠ auth_user_id — always join on auth_user_id = auth.uid().

-- ══════════════════════════════════════════════════════════════════════════
-- 1. file_objects — the lifecycle table
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.file_objects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_id            uuid NOT NULL,                 -- auth.uid() of the submitter
  content_sha256      text NOT NULL,                 -- server-computed fingerprint (Slice 2 recognition identity)
  original_filename   text NOT NULL,
  mime_detected       text,                          -- magic-byte detected; NEVER from extension (Korean Test)
  byte_size           bigint,
  state               text NOT NULL,                 -- received|quarantined|scanning|clean|promoted|infected_held
  scan_verdict        text,                          -- clean|infected|error
  scan_engine_version text,
  scanned_at          timestamptz,
  promoted_at         timestamptz,
  quarantine_path     text,                          -- object path in ingest-quarantine
  clean_path          text,                          -- object path in ingestion-raw after promotion
  classification      text,
  retention           text,
  import_batch_id     uuid,                          -- SET ON PROMOTION ONLY (hand-off to Import, Slice 2+)
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Recognition lookup (Slice 2) + lifecycle queries.
CREATE INDEX IF NOT EXISTS idx_file_objects_tenant_sha256 ON public.file_objects (tenant_id, content_sha256);
CREATE INDEX IF NOT EXISTS idx_file_objects_tenant_owner_state ON public.file_objects (tenant_id, owner_id, state);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. RLS on file_objects — tenant + owner isolation (Invariant 5, DS-014)
--    Owner sees own; tenant admin/finance see all tenant files; platform sees all.
--    Writes flow through the service-role gate (commit + scan worker), which
--    bypasses RLS — so there is intentionally NO authenticated INSERT/UPDATE/DELETE
--    policy. Clients can only READ what they are permitted to see.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.file_objects ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.file_objects TO authenticated;

DROP POLICY IF EXISTS "file_objects_select" ON public.file_objects;
CREATE POLICY "file_objects_select" ON public.file_objects
FOR SELECT TO authenticated
USING (
  public.is_platform()
  OR (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        -- Tenant admin sees all tenant files (DS-014). 'tenant_admin' is the DB
        -- alias for the canonical 'admin' role; both are matched. VL/platform
        -- (cross-tenant) is covered by the public.is_platform() branch above.
        SELECT 1 FROM public.profiles p
        WHERE p.auth_user_id = auth.uid()
          AND p.tenant_id = public.file_objects.tenant_id
          AND p.role IN ('admin', 'tenant_admin')
      )
    )
  )
);

-- ══════════════════════════════════════════════════════════════════════════
-- 3. ingest-quarantine bucket — every byte lands here first
--    Private, no MIME allowlist (pre-scan content is unknown; the quarantine
--    must accept anything so it can be scanned — Carry Everything).
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ingest-quarantine', 'ingest-quarantine', false, 524288000, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Owner-scoped path prefix: <tenant_id>/<auth_uid>/<file>. Direct uploads use a
-- server-minted signed URL (which authorizes its own path), so these policies
-- are owner-isolation for any direct client access (defense in depth).

DROP POLICY IF EXISTS "prism_quarantine_insert" ON storage.objects;
CREATE POLICY "prism_quarantine_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ingest-quarantine'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.profiles WHERE auth_user_id = auth.uid()
  )
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "prism_quarantine_select" ON storage.objects;
CREATE POLICY "prism_quarantine_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'ingest-quarantine'
  AND (
    public.is_platform()
    OR (
      (storage.foldername(name))[1] IN (
        SELECT tenant_id::text FROM public.profiles WHERE auth_user_id = auth.uid()
      )
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);

-- Cleanup (purge) is Slice 3; restrict DELETE to platform so nothing is
-- accidentally removed (Carry Everything — infected bytes must persist).
DROP POLICY IF EXISTS "prism_quarantine_delete" ON storage.objects;
CREATE POLICY "prism_quarantine_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'ingest-quarantine'
  AND public.is_platform()
);
