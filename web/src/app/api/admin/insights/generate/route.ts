// OB-232 Obj3 — admin manual insight generation. POST { tenantId } — platform admin only.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { generateInsights } from '@/lib/insight/insight-engine';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });
  const body = (await req.json().catch(() => ({}))) as { tenantId?: string; dataType?: string };
  if (!body.tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  const sb = await createServiceRoleClient();
  try {
    const result = await generateInsights(sb, body.tenantId, body.dataType ? { dataType: body.dataType } : {});
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'insight generation failed' }, { status: 500 });
  }
}
