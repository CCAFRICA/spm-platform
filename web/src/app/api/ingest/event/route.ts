/**
 * POST /api/ingest/event — Create a new ingestion event (immutable audit record)
 *
 * Body: { tenant_id, file_name, file_size_bytes, file_type, file_hash_sha256, storage_path, batch_id?, sheet_count? }
 * Returns: { event_id, status }
 *
 * GET /api/ingest/event?tenant_id=...&limit=50 — List ingestion events for a tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('id, tenant_id, role, email')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { tenant_id, file_name, file_size_bytes, file_type, file_hash_sha256, storage_path, batch_id, sheet_count } = body;

    if (!tenant_id || !file_name || !file_size_bytes || !file_type || !file_hash_sha256 || !storage_path) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Use service role to bypass restrictive RLS on insert
    const supabase = await createServiceRoleClient();

    const { data, error } = await supabase
      .from('ingestion_events')
      .insert({
        tenant_id,
        batch_id: batch_id || null,
        uploaded_by: profile.id,
        uploaded_by_email: profile.email || user.email || 'unknown',
        uploaded_by_role: profile.role,
        file_name,
        file_size_bytes,
        file_type,
        file_hash_sha256,
        storage_path,
        status: 'received',
        uploaded_at: new Date().toISOString(),
        sheet_count: sheet_count || null,
      })
      .select('id, status')
      .single();

    if (error) {
      console.error('[Ingest Event] Insert error:', error);
      return NextResponse.json({ error: `Failed to create event: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ event_id: data.id, status: data.status });
  } catch (err) {
    console.error('[Ingest Event] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenantId = request.nextUrl.searchParams.get('tenant_id');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    const { data, error } = await supabase
      .from('ingestion_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('uploaded_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data });
  } catch (err) {
    console.error('[Ingest Event GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
