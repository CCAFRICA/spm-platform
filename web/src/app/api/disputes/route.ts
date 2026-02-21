/**
 * POST /api/disputes — Create a dispute
 * GET  /api/disputes — List disputes for tenant
 *
 * SCHEMA_REFERENCE.md verified columns:
 *   disputes: id, tenant_id, entity_id, period_id, batch_id, category, status,
 *             description, amount_disputed, amount_resolved, resolution,
 *             filed_by, resolved_by, created_at, updated_at, resolved_at
 *
 * Status CHECK: open, investigating, resolved, rejected, escalated
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import type { Database } from '@/lib/supabase/database.types';

type DisputeInsert = Database['public']['Tables']['disputes']['Insert'];

const VALID_CATEGORIES = [
  'data_error', 'calculation_error', 'plan_interpretation',
  'missing_transaction', 'wrong_attribution', 'incorrect_amount',
  'wrong_rate', 'split_error', 'timing_issue', 'other',
];

const VALID_STATUSES = ['open', 'investigating', 'resolved', 'rejected', 'escalated'];

export async function POST(request: NextRequest) {
  try {
    // 1. Validate caller
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get caller's profile
    const { data: profile } = await authClient
      .from('profiles')
      .select('id, tenant_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { entity_id, period_id, batch_id, category, description, amount_disputed } = body;

    if (!entity_id || !description) {
      return NextResponse.json({ error: 'entity_id and description are required' }, { status: 400 });
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `Invalid category: ${category}` }, { status: 400 });
    }

    // 3. Insert dispute using service role client
    const supabase = await createServiceRoleClient();

    const insertData: DisputeInsert = {
      tenant_id: profile.tenant_id,
      entity_id,
      period_id: period_id || null,
      batch_id: batch_id || null,
      category: category || 'other',
      status: 'open',
      description,
      amount_disputed: amount_disputed || null,
      filed_by: profile.id,
    };

    const { data: dispute, error: insertError } = await supabase
      .from('disputes')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: `Insert failed: ${insertError.message}` }, { status: 500 });
    }

    // 4. Write audit log
    await writeAuditLog(supabase, {
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      action: 'dispute.created',
      resource_type: 'dispute',
      resource_id: dispute.id,
      changes: {
        status: 'open',
        category: category || 'other',
        entity_id,
      },
    });

    return NextResponse.json({ dispute }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/disputes] Error:', err);
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
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const entity_id = searchParams.get('entity_id');

    // Build query
    let query = authClient
      .from('disputes')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }
    if (entity_id) {
      query = query.eq('entity_id', entity_id);
    }

    const { data: disputes, error } = await query;

    if (error) {
      return NextResponse.json({ error: `Query failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ disputes: disputes || [] });
  } catch (err) {
    console.error('[GET /api/disputes] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
