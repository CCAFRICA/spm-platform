/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: data layer walks untyped rule_sets.components / committed_data.row_data JSONB (substrate is dynamic by design)
/**
 * OB-228 — GET /api/plan-surface/distribution?ruleSetId=&componentId=&periodId=
 *
 * Concept ① real-data overlay. Aggregates the period's committed rows SERVER-SIDE
 * (§A.2) and returns bucket counts only — never row data through the body. Returns
 * resolved=false (HALT-2) when the component's bound column is absent from the data,
 * never a fabricated distribution.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { getComponentDistribution } from '@/lib/plan-surface';

export async function GET(request: NextRequest) {
  const auth = await getServerAuthState();
  if (!auth.isAuthenticated || !auth.profile) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const ruleSetId = sp.get('ruleSetId');
  const componentId = sp.get('componentId');
  const periodId = sp.get('periodId');
  if (!ruleSetId || !componentId || !periodId) {
    return NextResponse.json({ error: 'Missing ruleSetId/componentId/periodId' }, { status: 400 });
  }

  let sb;
  try { sb = await createServiceRoleClient(); }
  catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }

  // Tenant-scope guard: the rule_set must belong to a tenant the caller may see.
  const { data: rs } = await sb.from('rule_sets').select('tenant_id').eq('id', ruleSetId).maybeSingle();
  const tenantId = (rs as any)?.tenant_id as string | undefined;
  const role = (auth.profile.role ?? '').toLowerCase();
  const isPlatform = role === 'platform' || role === 'vl_admin';
  if (!tenantId || (!isPlatform && tenantId !== auth.profile.tenantId)) {
    return NextResponse.json({ error: 'Not in scope' }, { status: 403 });
  }

  try {
    const dist = await getComponentDistribution(ruleSetId, componentId, periodId, sb as any);
    return NextResponse.json(dist);
  } catch (err) {
    console.error('[GET /api/plan-surface/distribution]', err);
    return NextResponse.json({ componentId, periodId, buckets: [], totalEntities: 0, resolved: false, measureColumn: null, grain: 'row', note: 'error' });
  }
}
