/**
 * API Route: AI Calibration + Flywheel Trend
 *
 * GET /api/ai/calibration?tenant_id=...
 * Returns: CalibrationBucket[] + FlywheelPoint[]
 *
 * Auth: VL Admin for cross-tenant (no tenant_id), tenant admin for scoped.
 * OB-86: Powered by ai-metrics-service.ts — all from classification_signals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeCalibrationMetrics, computeFlywheelTrend } from '@/lib/intelligence/ai-metrics-service';

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

    const [calibration, flywheel] = await Promise.all([
      computeCalibrationMetrics(tenantId),
      computeFlywheelTrend(tenantId),
    ]);

    return NextResponse.json({ calibration, flywheel });
  } catch (err) {
    console.error('[AI Calibration API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
