/**
 * HF-352 — GET /api/platform/tenants/[tenantId]/confirm-challenge?action=clean-slate|delete-tenant
 * Step 1 of the server-enforced two-step (I2): issues a short-lived signed challenge bound to
 * {action, tenantId}. The destructive POST (step 2) must present it. Platform-admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { issueChallenge, type DestructiveAction } from '@/lib/platform/confirm-challenge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { tenantId } = await params;

  const action = req.nextUrl.searchParams.get('action');
  if (action !== 'clean-slate' && action !== 'delete-tenant') {
    return NextResponse.json({ error: 'action must be clean-slate or delete-tenant' }, { status: 400 });
  }
  const { challenge, expiresInMs } = issueChallenge(action as DestructiveAction, tenantId, Date.now());
  return NextResponse.json({ challenge, expiresInMs });
}
