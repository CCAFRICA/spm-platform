/**
 * PATCH /api/disputes/[id] — Update dispute status/resolution
 *
 * SCHEMA_REFERENCE.md verified columns:
 *   disputes: status, resolution (text), amount_resolved, resolved_by, resolved_at, updated_at
 *
 * Status CHECK: open, investigating, resolved, rejected, escalated
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import type { Database } from '@/lib/supabase/database.types';

type DisputeUpdate = Database['public']['Tables']['disputes']['Update'];

const VALID_STATUSES = ['open', 'investigating', 'resolved', 'rejected', 'escalated'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: disputeId } = await params;

    // 1. Validate caller
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('id, tenant_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { status, resolution, amount_resolved } = body;

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    // 3. Get current dispute
    const supabase = await createServiceRoleClient();
    const { data: existing } = await supabase
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // 4. Build update
    const updateData: DisputeUpdate = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
    }

    if (resolution !== undefined) {
      updateData.resolution = resolution;
    }

    if (amount_resolved !== undefined) {
      updateData.amount_resolved = amount_resolved;
    }

    // If resolving, set resolved_by and resolved_at
    if (status === 'resolved' || status === 'rejected') {
      updateData.resolved_by = profile.id;
      updateData.resolved_at = new Date().toISOString();
    }

    // 5. Update
    const { data: updated, error: updateError } = await supabase
      .from('disputes')
      .update(updateData)
      .eq('id', disputeId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: `Update failed: ${updateError.message}` }, { status: 500 });
    }

    // 6. Write audit log
    const action = status === 'resolved' ? 'dispute.resolved' :
                   status === 'rejected' ? 'dispute.rejected' :
                   status === 'investigating' ? 'dispute.investigating' :
                   'dispute.updated';

    await writeAuditLog(supabase, {
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      action,
      resource_type: 'dispute',
      resource_id: disputeId,
      changes: {
        before_status: existing.status,
        after_status: status || existing.status,
        resolution: resolution || null,
        amount_resolved: amount_resolved || null,
      },
    });

    return NextResponse.json({ dispute: updated });
  } catch (err) {
    console.error('[PATCH /api/disputes/[id]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: disputeId } = await params;

    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('id, tenant_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const { data: dispute, error } = await authClient
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (error || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    return NextResponse.json({ dispute });
  } catch (err) {
    console.error('[GET /api/disputes/[id]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
