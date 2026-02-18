/**
 * GET /api/periods?tenant_id=...
 *
 * Returns periods for a given tenant using service role client.
 * Bypasses RLS that may block browser-client reads on periods table.
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

    // 3. Service role client (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // 4. Fetch periods + latest batch lifecycle in parallel
    const [periodsRes, batchesRes] = await Promise.all([
      supabase
        .from('periods')
        .select('id, period_key, period_type, start_date, end_date, status')
        .eq('tenant_id', tenantId)
        .order('start_date', { ascending: false }),
      supabase
        .from('calculation_batches')
        .select('period_id, lifecycle_state, created_at')
        .eq('tenant_id', tenantId)
        .is('superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (periodsRes.error) {
      console.error('[GET /api/periods] Periods query failed:', periodsRes.error);
      return NextResponse.json({ error: periodsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      periods: periodsRes.data ?? [],
      batches: batchesRes.data ?? [],
    });
  } catch (err) {
    console.error('[GET /api/periods] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
