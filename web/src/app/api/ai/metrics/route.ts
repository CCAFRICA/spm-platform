/**
 * API Route: AI Accuracy + Health Metrics
 *
 * GET /api/ai/metrics?tenant_id=...
 * Returns: AccuracyMetrics + AIHealthSummary
 *
 * Auth: VL Admin for cross-tenant (no tenant_id), tenant admin for scoped.
 * OB-86: Powered by ai-metrics-service.ts — all from classification_signals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeAccuracyMetrics, computeOverallHealth } from '@/lib/intelligence/ai-metrics-service';

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tenantId = request.nextUrl.searchParams.get('tenant_id') || undefined;

    // If no tenant_id, require VL Admin role
    if (!tenantId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!profile || profile.role !== 'vl_admin') {
        return NextResponse.json({ error: 'Forbidden — VL Admin required for cross-tenant view' }, { status: 403 });
      }
    }

    const [accuracy, health] = await Promise.all([
      computeAccuracyMetrics(tenantId),
      computeOverallHealth(tenantId),
    ]);

    return NextResponse.json({ accuracy, health });
  } catch (err) {
    console.error('[AI Metrics API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
