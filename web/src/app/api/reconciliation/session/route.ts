/**
 * GET /api/reconciliation/session?sessionId=…&tenantId=…  (OB-212 N9)
 *
 * Returns a saved reconciliation_sessions row for the ACTIVE tenant so the results view can be
 * restored from a deep link — the agent_inbox action_url and the N9 keystone proof open directly
 * into the results (with the inline Diagnose action). Tenant-scoped: only returns a session whose
 * tenant_id matches the supplied tenantId (no cross-tenant read via this route). Read-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!sessionId || !tenantId) {
    return NextResponse.json({ error: 'sessionId and tenantId are required' }, { status: 400 });
  }
  try {
    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from('reconciliation_sessions')
      .select('id, tenant_id, batch_id, period_id, status, config, results, summary, created_at')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId) // tenant-scope: a session is only readable within its own tenant
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'session not found for this tenant' }, { status: 404 });

    // resolve the platform batch's period label for display
    let periodLabel: string | null = null;
    if (data.period_id) {
      const { data: p } = await supabase.from('periods').select('label').eq('id', data.period_id).maybeSingle();
      periodLabel = (p as { label?: string } | null)?.label ?? null;
    }
    return NextResponse.json({ session: data, periodLabel });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed to load session' }, { status: 500 });
  }
}
