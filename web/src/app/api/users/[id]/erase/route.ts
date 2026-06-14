// OB-204 A.4 — POST /api/users/[id]/erase (GDPR Art 17 tombstone; disabled-only enforced at the surface).
import { NextRequest, NextResponse } from 'next/server';
import { erase, ProvisionError } from '@/lib/auth/provision-user';
import { authorizeUserMgmt, targetTenantId, provisionErrorStatus } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = await targetTenantId(id);
  if (!target.found) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  const authz = await authorizeUserMgmt({ tenantId: target.tenantId });
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  try {
    await erase({ targetProfileId: id, actorProfileId: authz.caller.profileId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ProvisionError) return NextResponse.json({ error: e.message, code: e.code }, { status: provisionErrorStatus(e.code) });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erase failed' }, { status: 500 });
  }
}
