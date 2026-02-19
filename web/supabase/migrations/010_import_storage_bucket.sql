-- Migration 010: Import Storage Bucket
-- HF-047: File-based import pipeline — upload files to storage, not HTTP body
--
-- Creates the 'imports' bucket and RLS policies for secure tenant-scoped access.

-- ══════════════════════════════════════════════
-- 1. Create imports bucket
-- ══════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,
  524288000,  -- 500MB limit per file
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════
-- 2. Storage RLS policies
-- ══════════════════════════════════════════════

-- Tenant users can upload to their tenant's folder
CREATE POLICY "Tenant upload access"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.profiles WHERE auth_user_id = auth.uid()
  )
);

-- Tenant users can read their tenant's files
CREATE POLICY "Tenant read access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.profiles WHERE auth_user_id = auth.uid()
  )
);

-- VL Admin full access (read + write + delete)
CREATE POLICY "VL Admin full storage access"
ON storage.objects FOR ALL
USING (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role = 'vl_admin'
  )
)
WITH CHECK (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role = 'vl_admin'
  )
);
