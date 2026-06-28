/**
 * OB-250 Layer E — POST /api/import/sci/aggregate-flywheel
 *
 * Dedicated async aggregation job, triggered AFTER processing completion. It
 * CONSUMES the queued flywheel signals by running the existing promotion step
 * (identifyPromotionCandidates) and recording the promotions — closing the
 * "queued-but-never-consumed" gap where identifyPromotionCandidates /
 * checkPromotedPatterns had zero callers.
 *
 * HALT-CALC (Decision 158): advances RECOGNITION STATE ONLY. Does not call or
 * modify resolveClassification, never reconnects the Bayesian scorer, and writes
 * to a ledger no classification path reads — sealed tenants stay byte-identical.
 *
 * Service-role read/write scoped by tenantId. Mirrors plan-run-status/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runFlywheelAggregation } from '@/lib/sci/flywheel-aggregation';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function POST(request: NextRequest) {
  let tenantId: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
    tenantId = body.tenantId;
  } catch {
    tenantId = undefined;
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }

  try {
    const result = await runFlywheelAggregation(supabase, tenantId, supabaseUrl, serviceKey);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: 'aggregation failed', details: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
