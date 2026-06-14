// OB-204 A.4 — POST /api/users/[id]/role (change role; capabilities re-derived).
import { NextRequest, NextResponse } from 'next/server';
import { changeRole, ProvisionError } from '@/lib/auth/provision-user';
import { authorizeUserMgmt, targetTenantId, provisionErrorStatus } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { newRole } = await req.json().catch(() => ({}));
  if (!newRole) return NextResponse.json({ error: 'newRole required' }, { status: 400 });
  const target = await targetTenantId(id);
  if (!target.found) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  const authz = await authorizeUserMgmt({ tenantId: target.tenantId, assigningPlatform: newRole === 'platform' });
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  try {
    const r = await changeRole({ targetProfileId: id, newRole, actorProfileId: authz.caller.profileId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ProvisionError) return NextResponse.json({ error: e.message, code: e.code }, { status: provisionErrorStatus(e.code) });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'role change failed' }, { status: 500 });
  }
}
