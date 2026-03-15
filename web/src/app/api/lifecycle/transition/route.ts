/**
 * POST /api/lifecycle/transition
 *
 * OB-171: Server-side lifecycle state transition API.
 * Wraps the existing performLifecycleTransition() with:
 * - Auth verification
 * - Capability checking
 * - Separation of duties enforcement
 * - audit_logs entry on every transition
 *
 * Body: { batchId, targetState, notes? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/database.types';

// Allowed transitions matrix
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PREVIEW'],
  PREVIEW: ['PREVIEW', 'OFFICIAL', 'RECONCILE'],
  RECONCILE: ['OFFICIAL', 'PREVIEW'],
  OFFICIAL: ['PENDING_APPROVAL', 'SUPERSEDED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  REJECTED: ['OFFICIAL'],
  APPROVED: ['POSTED'],
  POSTED: ['CLOSED'],
  CLOSED: ['PAID'],
  PAID: ['PUBLISHED'],
};

// Required capabilities per transition
const TRANSITION_CAPABILITIES: Record<string, string[]> = {
  'PREVIEW': ['manage_rule_sets'],
  'OFFICIAL': ['manage_rule_sets'],
  'PENDING_APPROVAL': ['manage_rule_sets'],
  'APPROVED': ['approve_outcomes'],
  'REJECTED': ['approve_outcomes'],
  'POSTED': ['manage_rule_sets'],
  'CLOSED': ['manage_rule_sets'],
  'PAID': ['manage_rule_sets'],
  'PUBLISHED': ['manage_rule_sets'],
};

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { batchId, targetState, notes } = body as {
      batchId: string;
      targetState: string;
      notes?: string;
    };

    if (!batchId || !targetState) {
      return NextResponse.json({ error: 'Missing batchId or targetState' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // 2. Load profile + batch
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, role, capabilities, tenant_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const { data: batch } = await supabase
      .from('calculation_batches')
      .select('id, tenant_id, period_id, lifecycle_state, entity_count, summary')
      .eq('id', batchId)
      .single();

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // 3. Verify tenant isolation
    const isVLAdmin = profile.role === 'platform' || profile.role === 'vl_admin';
    if (!isVLAdmin && profile.tenant_id !== batch.tenant_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const tenantId = batch.tenant_id;
    const currentState = batch.lifecycle_state;

    // 4. Validate transition is allowed
    const allowed = ALLOWED_TRANSITIONS[currentState] || [];
    if (!allowed.includes(targetState)) {
      return NextResponse.json(
        { error: `Invalid transition: ${currentState} → ${targetState}. Allowed: ${allowed.join(', ')}` },
        { status: 400 }
      );
    }

    // 5. Check capabilities
    const userCapabilities = (profile.capabilities as string[]) || [];
    const required = TRANSITION_CAPABILITIES[targetState] || [];
    const hasCapability = isVLAdmin || required.every(cap => userCapabilities.includes(cap));
    if (!hasCapability) {
      return NextResponse.json(
        { error: `Missing required capability: ${required.join(', ')}` },
        { status: 403 }
      );
    }

    // 6. Separation of duties for approval
    const summary = (batch.summary as Record<string, unknown>) || {};
    if (targetState === 'APPROVED') {
      const submitterId = summary.submitted_by_id as string | undefined;
      if (submitterId && submitterId === profile.id && !isVLAdmin) {
        // For single-admin tenants, check if there's only one admin
        const { count: adminCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('role', ['admin', 'platform', 'vl_admin']);

        if ((adminCount ?? 0) > 1) {
          return NextResponse.json(
            { error: 'Cannot approve your own submission. A different user must approve.' },
            { status: 403 }
          );
        }
        // Single admin — allow with warning (demo exception)
      }
    }

    // 7. Reject requires notes
    if (targetState === 'REJECTED' && !notes) {
      return NextResponse.json(
        { error: 'Rejection requires a reason (notes field)' },
        { status: 400 }
      );
    }

    // 8. Build summary updates
    const summaryUpdates: Record<string, unknown> = { ...summary };

    if (targetState === 'PENDING_APPROVAL') {
      summaryUpdates.submittedBy = profile.display_name;
      summaryUpdates.submitted_by_id = profile.id;
      summaryUpdates.submittedAt = new Date().toISOString();

      // Create approval_request (table exists but not in generated types)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('approval_requests').insert({
        tenant_id: tenantId,
        batch_id: batchId,
        period_id: batch.period_id,
        request_type: 'calculation_approval',
        status: 'pending',
        requested_by: profile.id,
      });
    }

    if (targetState === 'APPROVED') {
      summaryUpdates.approvedBy = profile.display_name;
      summaryUpdates.approvedAt = new Date().toISOString();

      // Update approval_request
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('approval_requests')
        .update({
          status: 'approved',
          decided_by: profile.id,
          decided_at: new Date().toISOString(),
        })
        .eq('batch_id', batchId)
        .eq('status', 'pending');
    }

    if (targetState === 'REJECTED') {
      summaryUpdates.rejectionReason = notes;
      summaryUpdates.rejectedBy = profile.display_name;
      summaryUpdates.rejectedAt = new Date().toISOString();

      // Update approval_request
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('approval_requests')
        .update({
          status: 'rejected',
          decided_by: profile.id,
          decision_notes: notes,
          decided_at: new Date().toISOString(),
        })
        .eq('batch_id', batchId)
        .eq('status', 'pending');
    }

    if (targetState === 'POSTED') {
      summaryUpdates.postedAt = new Date().toISOString();
      summaryUpdates.postedBy = profile.display_name;
    }

    // 9. Execute transition
    const { error: updateError } = await supabase
      .from('calculation_batches')
      .update({
        lifecycle_state: targetState as Database['public']['Tables']['calculation_batches']['Row']['lifecycle_state'],
        summary: summaryUpdates as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    if (updateError) {
      return NextResponse.json(
        { error: `Transition failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // 10. Write audit log
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      profile_id: profile.id,
      action: `lifecycle_${targetState.toLowerCase()}`,
      resource_type: 'calculation_batch',
      resource_id: batchId,
      changes: {
        from: currentState,
        to: targetState,
        notes: notes || null,
      } as unknown as Json,
      metadata: {
        period_id: batch.period_id,
        entity_count: batch.entity_count,
        actor_name: profile.display_name,
      } as unknown as Json,
    });

    return NextResponse.json({
      success: true,
      batchId,
      previousState: currentState,
      currentState: targetState,
    });
  } catch (error) {
    console.error('[LifecycleTransition] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transition failed' },
      { status: 500 }
    );
  }
}
