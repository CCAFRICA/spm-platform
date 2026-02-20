/**
 * POST /api/approvals — Request approval for a calculation batch
 * GET  /api/approvals — List approval requests for tenant
 *
 * Writes to approval_requests table (if exists) + audit_logs.
 * Falls back gracefully if approval_requests table hasn't been migrated yet.
 *
 * SCHEMA_REFERENCE.md verified columns:
 *   approval_requests: id, tenant_id, batch_id, period_id, request_type, status,
 *                      requested_by, decided_by, decision_notes, requested_at,
 *                      decided_at, created_at, updated_at
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit/audit-logger';

export async function POST(request: NextRequest) {
  try {
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
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { batch_id, period_id, request_type } = body;

    if (!batch_id) {
      return NextResponse.json({ error: 'batch_id is required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // 3. Try to insert into approval_requests table
    let approvalId: string | null = null;
    // Cast to 'any' because approval_requests is not in database.types.ts until migration is applied
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: approval, error: insertError } = await (supabase as any)
        .from('approval_requests')
        .insert({
          tenant_id: profile.tenant_id,
          batch_id,
          period_id: period_id || null,
          request_type: request_type || 'calculation_approval',
          status: 'pending',
          requested_by: profile.id,
          requested_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!insertError && approval) {
        approvalId = (approval as { id: string }).id;
      } else {
        console.warn('[POST /api/approvals] approval_requests insert skipped:', insertError?.message);
      }
    } catch {
      console.warn('[POST /api/approvals] approval_requests table may not exist yet');
    }

    // 4. Write audit log (always works — audit_logs table exists)
    await writeAuditLog(supabase, {
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      action: 'approval.requested',
      resource_type: 'approval_request',
      resource_id: approvalId || batch_id,
      changes: {
        batch_id,
        period_id: period_id || null,
        request_type: request_type || 'calculation_approval',
        status: 'pending',
      },
    });

    return NextResponse.json({
      approval: {
        id: approvalId,
        batch_id,
        status: 'pending',
        requested_by: profile.id,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/approvals] Error:', err);
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

    const { data: profile } = await authClient
      .from('profiles')
      .select('id, tenant_id')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // Try approval_requests table first
    // Cast to 'any' because approval_requests is not in database.types.ts until migration is applied
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (authClient as any)
        .from('approval_requests')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (status) {
        query = query.eq('status', status);
      }

      const { data: approvals, error } = await query;
      if (!error) {
        return NextResponse.json({ approvals: approvals || [] });
      }
    } catch {
      // Table may not exist yet
    }

    // Fallback: return empty
    return NextResponse.json({ approvals: [] });
  } catch (err) {
    console.error('[GET /api/approvals] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
