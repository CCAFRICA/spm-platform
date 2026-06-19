/**
 * GET /api/compensation/statement?tenantId=&entityId=&periodId=
 *
 * OB-219: returns an entity's per-period commission statement (component breakdown +
 * per-transaction traces) for the drill-down UI. Auth-gated; service-role for the
 * multi-table aggregation. Reads stored data only — zero LLM (Decision 158).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getCommissionStatement } from '@/lib/compensation/commission-statement';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tenantId = sp.get('tenantId');
  const entityId = sp.get('entityId');
  const periodId = sp.get('periodId');
  if (!tenantId || !entityId || !periodId) {
    return NextResponse.json({ error: 'Missing required query params: tenantId, entityId, periodId' }, { status: 400 });
  }

  // Auth gate (middleware also enforces; explicit here per the api/periods pattern).
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = await createServiceRoleClient();
    const statement = await getCommissionStatement(supabase, tenantId, entityId, periodId);
    if (!statement) {
      return NextResponse.json({ error: 'No calculation results for this entity and period' }, { status: 404 });
    }
    return NextResponse.json({ statement });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load commission statement' }, { status: 500 });
  }
}
