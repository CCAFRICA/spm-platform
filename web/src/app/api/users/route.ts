// OB-204 A.4 — POST /api/users (create a user through the single door).
import { NextRequest, NextResponse } from 'next/server';
import { createUser, ProvisionError } from '@/lib/auth/provision-user';
import { authorizeUserMgmt, provisionErrorStatus } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, displayName, role, tenantId = null, entityId, mode, locale } = body ?? {};
  if (!email || !displayName || !role || !mode) {
    return NextResponse.json({ error: 'email, displayName, role and mode are required' }, { status: 400 });
  }
  const authz = await authorizeUserMgmt({ tenantId: tenantId ?? null, assigningPlatform: role === 'platform' });
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  try {
    const result = await createUser({ email, displayName, role, tenantId: tenantId ?? null, entityId, mode, locale, actorProfileId: authz.caller.profileId });
    // result.tempPassword (temp_password mode) is returned ONCE here; never logged or persisted by us.
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ProvisionError) return NextResponse.json({ error: e.message, code: e.code }, { status: provisionErrorStatus(e.code) });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 500 });
  }
}
