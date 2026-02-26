/**
 * /api/periods
 *
 * GET  ?tenant_id=...  — Returns periods + batches for a tenant
 * POST { tenant_id, periods: [...] } — Creates one or more periods
 * DELETE { tenant_id, period_id } — Deletes a draft period
 *
 * Uses service role client (bypasses RLS). Falls back to auth client.
 * NEVER returns 500 for empty data — always returns 200 with {periods: [], batches: []}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { PeriodType, PeriodStatus, Json } from '@/lib/supabase/database.types';

export async function GET(request: NextRequest) {
  try {
    // 1. Validate authenticated user
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Get tenant_id from query params
    const tenantId = request.nextUrl.searchParams.get('tenant_id');
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant_id parameter' }, { status: 400 });
    }

    // 3. Get Supabase client — prefer service role, fall back to auth client
    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch {
      console.warn('[GET /api/periods] Service role client unavailable, using auth client');
      supabase = authClient;
    }

    // 4. Fetch periods (primary query — must succeed)
    const periodsRes = await supabase
      .from('periods')
      .select('id, canonical_key, label, period_type, start_date, end_date, status')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false });

    if (periodsRes.error) {
      console.error('[GET /api/periods] Periods query failed:', periodsRes.error);
      // Return empty instead of 500 — allow UI to show "no periods" gracefully
      return NextResponse.json({ periods: [], batches: [] });
    }

    // 5. Fetch batches (secondary — non-blocking)
    let batches: Array<{ period_id: string; lifecycle_state: string; created_at: string }> = [];
    try {
      const batchesRes = await supabase
        .from('calculation_batches')
        .select('period_id, lifecycle_state, created_at')
        .eq('tenant_id', tenantId)
        .is('superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      batches = batchesRes.data ?? [];
    } catch {
      // Batches query failure is non-blocking
      console.warn('[GET /api/periods] Batches query failed (non-blocking)');
    }

    return NextResponse.json({
      periods: periodsRes.data ?? [],
      batches,
    });
  } catch (err) {
    console.error('[GET /api/periods] Error:', err);
    // Even on total failure, return empty data instead of 500
    return NextResponse.json({ periods: [], batches: [] });
  }
}

/**
 * POST /api/periods — Create one or more periods
 *
 * Body: { tenant_id: string, periods: Array<{ label, period_type, start_date, end_date, canonical_key, status? }> }
 * Returns: { created: Period[], errors: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { tenant_id, periods } = body;

    if (!tenant_id) {
      return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 });
    }
    if (!Array.isArray(periods) || periods.length === 0) {
      return NextResponse.json({ error: 'Missing or empty periods array' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch {
      supabase = authClient;
    }

    // Validate each period has required fields
    const rows = periods.map((p: Record<string, unknown>) => ({
      tenant_id: tenant_id as string,
      label: p.label as string,
      period_type: ((p.period_type as string) || 'monthly') as PeriodType,
      start_date: p.start_date as string,
      end_date: p.end_date as string,
      canonical_key: p.canonical_key as string,
      status: ((p.status as string) || 'draft') as PeriodStatus,
      metadata: (p.metadata || {}) as Json,
    }));

    // Validate required fields
    for (const row of rows) {
      if (!row.label || !row.start_date || !row.end_date || !row.canonical_key) {
        return NextResponse.json(
          { error: `Period missing required fields: label, start_date, end_date, canonical_key. Got: ${JSON.stringify(row)}` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('periods')
      .insert(rows)
      .select('id, canonical_key, label, period_type, start_date, end_date, status');

    if (error) {
      console.error('[POST /api/periods] Insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ created: data ?? [], errors: [] });
  } catch (err) {
    console.error('[POST /api/periods] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/periods — Delete a draft period
 *
 * Body: { tenant_id: string, period_id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { tenant_id, period_id } = body;

    if (!tenant_id || !period_id) {
      return NextResponse.json({ error: 'Missing tenant_id or period_id' }, { status: 400 });
    }

    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch {
      supabase = authClient;
    }

    // Only delete draft periods
    const { error } = await supabase
      .from('periods')
      .delete()
      .eq('id', period_id)
      .eq('tenant_id', tenant_id)
      .eq('status', 'draft');

    if (error) {
      console.error('[DELETE /api/periods] Delete failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/periods] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
