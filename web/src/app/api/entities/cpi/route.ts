// OB-204 F.2 — POST /api/entities/cpi — run a CPI hierarchy-inference pass for the caller's tenant.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runCpiPass } from '@/lib/entities/cpi';
import { authorizeUserMgmt } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

export async function POST() {
  const authz = await authorizeUserMgmt();
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  if (!authz.caller.tenantId) return NextResponse.json({ error: 'CPI runs within a tenant; platform users select a tenant first.' }, { status: 400 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const result = await runCpiPass(authz.caller.tenantId, sb);
    return NextResponse.json({ ok: true, proposed: result.proposed, written: result.written, dropped: result.dropped });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'CPI failed' }, { status: 500 });
  }
}
