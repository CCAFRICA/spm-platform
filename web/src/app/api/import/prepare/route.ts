/**
 * POST /api/import/prepare
 *
 * HF-047: Prepares for file-based import by:
 *   1. Ensuring the 'imports' storage bucket exists
 *   2. Generating a signed upload URL for the client
 *
 * The client uploads the file DIRECTLY to Supabase Storage using the signed URL.
 * This bypasses Vercel's 4.5MB body limit — the file never passes through Vercel.
 *
 * Receives: { tenantId, fileName }
 * Returns:  { storagePath, signedUrl, token }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Ensure the imports bucket exists (idempotent)
async function ensureBucket(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.id === 'imports');

  if (!exists) {
    const { error } = await supabase.storage.createBucket('imports', {
      public: false,
      fileSizeLimit: 524288000, // 500MB
      allowedMimeTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/octet-stream',
      ],
    });
    if (error && !error.message?.includes('already exists')) {
      throw new Error(`Failed to create imports bucket: ${error.message}`);
    }
    console.log('[ImportPrepare] Created imports bucket');
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tenantId, fileName } = await request.json();
    if (!tenantId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: tenantId, fileName' },
        { status: 400 }
      );
    }

    // Use service role client for bucket management
    const supabase = await createServiceRoleClient();

    // Ensure bucket exists
    await ensureBucket(supabase);

    // Generate unique storage path
    const batchId = crypto.randomUUID();
    const storagePath = `${tenantId}/${batchId}/${fileName}`;

    // Create signed upload URL (bypasses RLS, expires in 1 hour)
    const { data, error } = await supabase.storage
      .from('imports')
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error('[ImportPrepare] Failed to create signed upload URL:', error);
      return NextResponse.json(
        { error: 'Failed to prepare upload', details: error.message },
        { status: 500 }
      );
    }

    console.log(`[ImportPrepare] Prepared upload: ${storagePath}`);

    return NextResponse.json({
      success: true,
      storagePath,
      signedUrl: data.signedUrl,
      token: data.token,
      batchId,
    });
  } catch (err) {
    console.error('[ImportPrepare] Error:', err);
    return NextResponse.json(
      { error: 'Prepare failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
