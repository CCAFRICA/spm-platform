/**
 * POST /api/ingest/setup — Create Supabase Storage bucket + apply RLS
 *
 * Idempotent: safe to call multiple times.
 * Requires VL Admin authentication.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET_NAME = 'ingestion-raw';

const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/gzip',
];

export async function POST() {
  try {
    // Validate VL Admin
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden — VL Admin only' }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();

    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET_NAME);

    if (!exists) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 500 * 1024 * 1024, // 500MB
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      });

      if (createError) {
        return NextResponse.json({ error: `Failed to create bucket: ${createError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      bucket: BUCKET_NAME,
      created: !exists,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      fileSizeLimit: '500MB',
    });
  } catch (err) {
    console.error('[Ingest Setup] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
