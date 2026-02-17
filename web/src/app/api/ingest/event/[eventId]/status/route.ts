/**
 * POST /api/ingest/event/[eventId]/status — Progress ingestion event status
 *
 * IMMUTABLE: Creates a NEW event that supersedes the previous one.
 * Body: { new_status, classification_result?, validation_result?, record_count? }
 * Returns: { new_event_id, status }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const VALID_STATUSES = ['received', 'classified', 'mapped', 'validated', 'committed', 'quarantined', 'rejected'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('id, role, email')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body = await request.json();
    const { new_status, classification_result, validation_result, record_count } = body;

    if (!new_status || !VALID_STATUSES.includes(new_status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // Fetch the original event
    const { data: original, error: fetchError } = await supabase
      .from('ingestion_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Create a NEW event that supersedes the original (immutable chain)
    const { data: newEvent, error: insertError } = await supabase
      .from('ingestion_events')
      .insert({
        tenant_id: original.tenant_id,
        batch_id: original.batch_id,
        uploaded_by: original.uploaded_by,
        uploaded_by_email: original.uploaded_by_email,
        uploaded_by_role: original.uploaded_by_role,
        file_name: original.file_name,
        file_size_bytes: original.file_size_bytes,
        file_type: original.file_type,
        file_hash_sha256: original.file_hash_sha256,
        storage_path: original.storage_path,
        uploaded_at: original.uploaded_at,
        status: new_status,
        classification_result: classification_result || original.classification_result,
        validation_result: validation_result || original.validation_result,
        record_count: record_count ?? original.record_count,
        sheet_count: original.sheet_count,
        supersedes_event_id: eventId,
      })
      .select('id, status')
      .single();

    if (insertError) {
      console.error('[Ingest Status] Insert error:', insertError);
      return NextResponse.json({ error: `Failed to progress status: ${insertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ new_event_id: newEvent.id, status: newEvent.status });
  } catch (err) {
    console.error('[Ingest Status] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
