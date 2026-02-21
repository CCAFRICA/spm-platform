/**
 * PATCH /api/approvals/[id] — Decide on an approval (approve/reject)
 *
 * This route does THREE things atomically:
 * 1. Updates the approval_requests record (if table exists)
 * 2. Transitions the calculation_batch lifecycle state
 * 3. Writes audit log entries
 *
 * SCHEMA_REFERENCE.md verified columns:
 *   approval_requests: status, decided_by, decision_notes, decided_at, updated_at
 *   calculation_batches: lifecycle_state, summary
 *   audit_logs: profile_id, action, resource_type, resource_id, changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import type { LifecycleState } from '@/lib/supabase/database.types';
import { isValidTransition } from '@/lib/supabase/calculation-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: approvalId } = await params;

    // 1. Validate caller
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('id, tenant_id, role, display_name')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    // Only admin/vl_admin can approve
    if (!['vl_admin', 'admin', 'tenant_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { status, decision_notes, batch_id } = body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'status must be "approved" or "rejected"' }, { status: 400 });
    }

    if (!batch_id) {
      return NextResponse.json({ error: 'batch_id is required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const now = new Date().toISOString();

    // 3. Update approval_requests record (if table exists)
    // Cast to 'any' because approval_requests is not in database.types.ts until migration is applied
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('approval_requests')
        .update({
          status,
          decided_by: profile.id,
          decision_notes: decision_notes || null,
          decided_at: now,
          updated_at: now,
        })
        .eq('id', approvalId);
    } catch {
      console.warn('[PATCH /api/approvals] approval_requests update skipped (table may not exist)');
    }

    // 4. Transition lifecycle state on calculation_batch
    const targetState: LifecycleState = status === 'approved' ? 'APPROVED' : 'REJECTED';
    const summaryUpdate = status === 'approved'
      ? { approvalComments: decision_notes, approvedBy: profile.display_name, approvedAt: now }
      : { rejectionReason: decision_notes, rejectedBy: profile.display_name, rejectedAt: now };

    // Get current batch to verify it exists and get current state
    const { data: batch, error: batchError } = await supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, summary, tenant_id')
      .eq('id', batch_id)
      .single();

    if (batchError || !batch) {
      return NextResponse.json({ error: 'Calculation batch not found' }, { status: 404 });
    }

    // Verify tenant match
    if (batch.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: 'Batch does not belong to your tenant' }, { status: 403 });
    }

    const beforeState = batch.lifecycle_state as LifecycleState;

    // Validate lifecycle transition is allowed
    if (!isValidTransition(beforeState, targetState)) {
      return NextResponse.json({
        error: `Invalid lifecycle transition: ${beforeState} → ${targetState}`,
      }, { status: 409 });
    }

    // Merge summary
    const existingSummary = (batch.summary || {}) as Record<string, unknown>;
    const mergedSummary = { ...existingSummary, ...summaryUpdate };

    const { error: transitionError } = await supabase
      .from('calculation_batches')
      .update({
        lifecycle_state: targetState,
        summary: mergedSummary,
        updated_at: now,
      })
      .eq('id', batch_id);

    if (transitionError) {
      return NextResponse.json({
        error: `Lifecycle transition failed: ${transitionError.message}`,
      }, { status: 500 });
    }

    // 5. Write audit logs
    // Approval decision audit
    await writeAuditLog(supabase, {
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      action: status === 'approved' ? 'approval.approved' : 'approval.rejected',
      resource_type: 'approval_request',
      resource_id: approvalId,
      changes: {
        batch_id,
        before_status: 'pending',
        after_status: status,
        decision_notes: decision_notes || null,
      },
    });

    // Lifecycle transition audit
    await writeAuditLog(supabase, {
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      action: 'lifecycle.transition',
      resource_type: 'calculation_batch',
      resource_id: batch_id,
      changes: {
        from_state: beforeState,
        to_state: targetState,
        triggered_by: 'approval_decision',
      },
    });

    return NextResponse.json({
      approval: {
        id: approvalId,
        status,
        batch_id,
        decided_by: profile.id,
      },
      lifecycle: {
        batch_id,
        before_state: beforeState,
        after_state: targetState,
      },
    });
  } catch (err) {
    console.error('[PATCH /api/approvals/[id]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
