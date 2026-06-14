// OB-204 A.4 — POST /api/users/[id]/send-credentials { type: 'invite_resend'|'magiclink'|'recovery' }.
import { NextRequest, NextResponse } from 'next/server';
import { sendCredentials, ProvisionError } from '@/lib/auth/provision-user';
import { authorizeUserMgmt, targetTenantId, provisionErrorStatus } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

const VALID = new Set(['invite_resend', 'magiclink', 'recovery']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { type, notifyEmail } = await req.json().catch(() => ({}));
  if (!VALID.has(type)) return NextResponse.json({ error: 'type must be invite_resend | magiclink | recovery' }, { status: 400 });
  const target = await targetTenantId(id);
  if (!target.found) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  const authz = await authorizeUserMgmt({ tenantId: target.tenantId });
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  try {
    const r = await sendCredentials({ targetProfileId: id, type, notifyEmail: notifyEmail || undefined, actorProfileId: authz.caller.profileId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ProvisionError) return NextResponse.json({ error: e.message, code: e.code }, { status: provisionErrorStatus(e.code) });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'send-credentials failed' }, { status: 500 });
  }
}
