-- Migration 021: Storage RLS for ingestion-raw bucket
-- OB-168 Phase 3: Fix CLT167-F05 — admin cannot upload to ingestion-raw
--
-- The ingestion-raw bucket was created via /api/ingest/setup with zero policies.
-- This migration adds INSERT, SELECT, and DELETE policies for platform + admin roles.
-- Uses IN ('platform', 'vl_admin', 'admin') to handle both current and legacy role names.

-- ══════════════════════════════════════════════
-- 1. Enable RLS on storage.objects (idempotent)
-- ══════════════════════════════════════════════

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════
-- 2. INSERT — platform and admin can upload, scoped to tenant folder
-- ══════════════════════════════════════════════

DROP POLICY IF EXISTS "ingestion_raw_insert" ON storage.objects;

CREATE POLICY "ingestion_raw_insert" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'ingestion-raw'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND role IN ('platform', 'vl_admin', 'admin')
  )
  AND (
    -- Platform admins can upload to any folder
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND role IN ('platform', 'vl_admin')
    )
    OR
    -- Tenant admins scoped to their tenant folder
    (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  )
);

-- ══════════════════════════════════════════════
-- 3. SELECT — platform and admin can read, scoped to tenant folder
-- ══════════════════════════════════════════════

DROP POLICY IF EXISTS "ingestion_raw_select" ON storage.objects;

CREATE POLICY "ingestion_raw_select" ON storage.objects
FOR SELECT USING (
  bucket_id = 'ingestion-raw'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND role IN ('platform', 'vl_admin', 'admin')
  )
  AND (
    -- Platform admins can read all
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND role IN ('platform', 'vl_admin')
    )
    OR
    -- Tenant admins scoped to their tenant folder
    (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  )
);

-- ══════════════════════════════════════════════
-- 4. DELETE — platform only (cleanup)
-- ══════════════════════════════════════════════

DROP POLICY IF EXISTS "ingestion_raw_delete" ON storage.objects;

CREATE POLICY "ingestion_raw_delete" ON storage.objects
FOR DELETE USING (
  bucket_id = 'ingestion-raw'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND role IN ('platform', 'vl_admin')
  )
);

-- ══════════════════════════════════════════════
-- 5. Also fix the imports bucket VL Admin policy to include 'platform' role
-- ══════════════════════════════════════════════

DROP POLICY IF EXISTS "VL Admin full storage access" ON storage.objects;

CREATE POLICY "VL Admin full storage access" ON storage.objects
FOR ALL
USING (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND role IN ('platform', 'vl_admin')
  )
)
WITH CHECK (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND role IN ('platform', 'vl_admin')
  )
);
