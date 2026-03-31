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
      .maybeSingle();

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

    // Cast: DS-005 columns added via migration 007, not yet in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: any = {
      tenant_id,
      batch_id: batch_id || null,
      uploaded_by: user.id,
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
    };

    const { data, error } = await supabase
      .from('ingestion_events')
      .insert(insertPayload)
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
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // HF-182 Fix 9: Also include import_batches for SCI imports
    // SCI pipeline writes to import_batches, not ingestion_events.
    // Merge both sources so import history shows all imports.
    let allEvents: Record<string, unknown>[] = (data || []) as Record<string, unknown>[];
    if (allEvents.length < limit) {
      const { data: batches } = await supabase
        .from('import_batches')
        .select('id, tenant_id, file_name, file_type, status, row_count, created_at, metadata')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (batches && batches.length > 0) {
        const batchEvents = batches.map(b => {
          const meta = (b.metadata || {}) as Record<string, unknown>;
          return {
            id: b.id,
            tenant_id: b.tenant_id,
            status: b.status === 'completed' ? 'committed' : b.status,
            file_name: (meta.sourceFileName as string) || b.file_name || 'SCI Import',
            file_size_bytes: null,
            file_type: b.file_type,
            file_hash_sha256: null,
            storage_path: null,
            uploaded_by_email: null,
            uploaded_at: b.created_at,
            created_at: b.created_at,
            record_count: b.row_count,
            supersedes_event_id: null,
            classification_result: (meta.classification as unknown) || null,
            validation_result: null,
          };
        });
        // Merge and dedup by id, sort by created_at desc
        const existingIds = new Set(allEvents.map(e => String(e.id)));
        const merged = [...allEvents, ...batchEvents.filter(be => !existingIds.has(be.id))];
        merged.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        allEvents = merged.slice(0, limit);
      }
    }

    return NextResponse.json({ events: allEvents });
  } catch (err) {
    console.error('[Ingest Event GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
