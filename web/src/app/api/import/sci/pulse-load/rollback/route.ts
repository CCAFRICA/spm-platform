/**
 * POST /api/import/sci/pulse-load/rollback   body: { tenantId, sessionId }
 *
 * HF-360 (Part B) — ROLL BACK an import session's hand-off load: delete the committed_data rows +
 * import_batches for every pulse of every job in the session (each pulse is its own batch), then mark the
 * jobs 'rolled_back'. Tenant-scoped on every delete (the HF-358 invariant — no unscoped delete is
 * structurally possible). Safe at any load stage (mid-load removes whatever loaded so far + the staged
 * batches; the worker will not advance a rolled_back job). Idempotent.
 *
 * DESTRUCTIVE — gated by the shared pulse-load capability gate (tenant member OR platform.data_operations),
 * refused (403) before any DB handle is used.
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { authorizePulseLoadCaller } from '@/lib/sci/pulse-load-authz';
import { rollbackSession } from '@/lib/sci/pulse-load-enqueue';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tenantId?: string; sessionId?: string };
  const { tenantId, sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
  }
  const authz = await authorizePulseLoadCaller(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const result = await rollbackSession(authz.service, tenantId!, sessionId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'rollback failed' }, { status: 500 });
  }
}
