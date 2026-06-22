/**
 * OB-228 Phase 5 — GET /api/plan-surface/provenance?ruleSetId=&componentId=
 * Concept ④ correction history (classification_signals for the component). The static
 * provenance (source sentence, binding, confidence) is read client-side from the
 * component; this endpoint adds the tenant-scoped correction thread.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { getCorrectionHistory } from '@/lib/plan-surface/provenance';

export async function GET(request: NextRequest) {
  const auth = await getServerAuthState();
  if (!auth.isAuthenticated || !auth.profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ruleSetId = request.nextUrl.searchParams.get('ruleSetId');
  const componentId = request.nextUrl.searchParams.get('componentId');
  if (!ruleSetId || !componentId) return NextResponse.json({ error: 'Missing ruleSetId/componentId' }, { status: 400 });

  let sb;
  try { sb = await createServiceRoleClient(); }
  catch { return NextResponse.json({ corrections: [] }); }

  // tenant-scope guard
  const { data: rs } = await sb.from('rule_sets').select('tenant_id').eq('id', ruleSetId).maybeSingle();
  const tenantId = (rs as { tenant_id?: string } | null)?.tenant_id;
  const role = (auth.profile.role ?? '').toLowerCase();
  const isPlatform = role === 'platform' || role === 'vl_admin';
  if (!tenantId || (!isPlatform && tenantId !== auth.profile.tenantId)) return NextResponse.json({ error: 'Not in scope' }, { status: 403 });

  try {
    const corrections = await getCorrectionHistory(ruleSetId, componentId, sb as never);
    return NextResponse.json({ corrections });
  } catch {
    return NextResponse.json({ corrections: [] });
  }
}
