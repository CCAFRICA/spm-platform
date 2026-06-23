// OB-229 — admin manual backfill / recompute of summary_artifacts (Constraint 7).
// POST { tenantId } — platform admin only. Prefers the SQL RPC; falls back to JS aggregation.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { runSummaryEngine } from '@/lib/summary/summary-engine';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  const body = (await req.json().catch(() => ({}))) as { tenantId?: string };
  if (!body.tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const result = await runSummaryEngine(sb, body.tenantId);
    return NextResponse.json({ ok: true, tenantId: body.tenantId, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'backfill failed' }, { status: 500 });
  }
}
