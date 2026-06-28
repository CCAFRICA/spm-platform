/**
 * HF-353 P-D — GET /api/import/sci/plan-run-status?tenantId=...
 *
 * Exposes the durable plan-interpretation liveness the client lacked: HF-259's
 * `plan_interpretation_runs.status` (in_progress | completed | failed), written by
 * claimRun/completeRun/failRun (plan-idempotency.ts). The import client polls this to
 * distinguish "still processing" (a legitimate 83s run) from "failed" — so it NEVER
 * re-submits a plan that is still running. Returns the tenant's MOST RECENT run (one
 * plan interpretation runs at a time), or 'absent' when none exists. Mirrors the
 * existing /api/plan-readiness pattern (service-role read scoped by tenantId).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  const fileName = request.nextUrl.searchParams.get('fileName');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }
  try {
    let query = supabase
      .from('plan_interpretation_runs')
      .select('status, updated_at, source_file_name')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (fileName) query = query.eq('source_file_name', fileName);
    const { data, error } = await query;
    if (error) {
      // Table missing / read error → 'absent' (degrade-safe; the client falls back to a retryable failure).
      return NextResponse.json({ status: 'absent', error: error.message });
    }
    const row = (data ?? [])[0] as { status?: string; updated_at?: string | null } | undefined;
    const status = (row?.status as 'in_progress' | 'completed' | 'failed' | undefined) ?? 'absent';
    return NextResponse.json({ status, updatedAt: row?.updated_at ?? null });
  } catch (e) {
    return NextResponse.json({ status: 'absent', error: e instanceof Error ? e.message : 'error' });
  }
}
