/**
 * GET /api/periods?tenant_id=...
 *
 * Returns periods for a given tenant.
 * Tries service role client first (bypasses RLS), falls back to regular client.
 * NEVER returns 500 for empty data — always returns 200 with {periods: [], batches: []}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

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
      .select('id, period_key, period_type, start_date, end_date, status')
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
