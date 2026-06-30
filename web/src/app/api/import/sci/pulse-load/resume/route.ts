/**
 * POST /api/import/sci/pulse-load/resume   body: { tenantId, sessionId }
 *
 * HF-360 (Part B) — RESUME an import session's hand-off load: re-arm any failed (or stalled-loading) job
 * back to 'enqueued' so the worker continues from its PERSISTED cursor, replaying the frozen manifest
 * byte-identically (the byte-budget + batch structure are not recomputed — a resumed import is identical to
 * an uninterrupted one). Loaded pulses are untouched (cursor preserved); rollback is terminal (not resumed).
 *
 * Gated by the shared pulse-load capability gate (tenant member OR platform.data_operations).
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { authorizePulseLoadCaller } from '@/lib/sci/pulse-load-authz';
import { resumeSession } from '@/lib/sci/pulse-load-enqueue';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tenantId?: string; sessionId?: string };
  const { tenantId, sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
  }
  const authz = await authorizePulseLoadCaller(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const result = await resumeSession(authz.service, tenantId!, sessionId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'resume failed' }, { status: 500 });
  }
}
