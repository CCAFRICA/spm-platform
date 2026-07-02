/**
 * POST /api/revenue/activate -- manual (re-)run of the Revenue activation materializer (OB-257 O2;
 * ADR minor decisions "Activation trigger").
 *
 * The entitlement PATCH route fires the SAME materializer automatically on the false->true flip;
 * this endpoint exists for capability-gated manual re-runs and PG-2 evidence capture (the full
 * MaterializeResult is returned verbatim -- counts, roles, noop, duration). Same platform
 * authorization as the entitlement writer (authorizePlatformObservability); requires the tenant
 * to be revenue-entitled (409 when off -- activation of an un-entitled tenant is a state error,
 * not an authorization one).
 */

export const runtime = 'nodejs';
export const maxDuration = 300; // the materializer pages the whole committed_data set (activation backfill)

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { isRevenueEnabledForTenant } from '@/lib/revenue/tenant-feature';
import { materializeRevenueRollups } from '@/lib/revenue/materializer';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const gate = await authorizePlatformObservability();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await request.json()) as { tenantId?: unknown };
    if (typeof body.tenantId !== 'string' || body.tenantId.length === 0) {
      return NextResponse.json({ error: 'tenantId (string) required' }, { status: 400 });
    }
    const tenantId = body.tenantId;

    if (!(await isRevenueEnabledForTenant(tenantId))) {
      return NextResponse.json({ error: 'tenant is not revenue-entitled' }, { status: 409 });
    }

    const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const result = await materializeRevenueRollups(supabase, tenantId, (msg) =>
      console.log(`[Revenue Activate] ${tenantId} | ${msg}`),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/revenue/activate] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Revenue activation failed' },
      { status: 500 },
    );
  }
}
