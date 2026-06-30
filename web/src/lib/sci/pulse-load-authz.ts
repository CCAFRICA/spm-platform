// HF-360 (Part B) — the ONE authorization gate for the pulse-load operations surface (state/rollback/resume).
// Mirrors the HF-355 enqueue gate exactly: authenticate the session, resolve the caller's profile, and
// authorize on the NAMED capability (not a structural proxy) — caller is a member of the target tenant OR
// holds platform.data_operations. Returns the service-role client (the sole writer; bypasses RLS so platform
// operators can act cross-tenant) only AFTER the gate passes (nothing leaks on refuse). Pure boolean authz —
// zero LLM, zero domain literals (Decision 158).

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PLATFORM_DATA_OPERATIONS = 'platform.data_operations';

export type PulseLoadAuthz =
  | { ok: true; service: SupabaseClient; isPlatformOperator: boolean; callerId: string }
  | { ok: false; response: NextResponse };

export async function authorizePulseLoadCaller(tenantId: string | null | undefined): Promise<PulseLoadAuthz> {
  if (!tenantId) {
    return { ok: false, response: NextResponse.json({ error: 'tenantId is required.' }, { status: 400 }) };
  }
  // 1. Authenticate the session.
  const authClient = await createServerSupabaseClient();
  const { data: { user: authUser } } = await authClient.auth.getUser();
  if (!authUser) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };
  }
  // Service-role client — bypasses RLS (a platform operator's tenant_id is NULL and would fail the
  // tenant-scoped RLS read). The capability gate below is the real authorization.
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  // 2. Resolve the caller's profile + AUTHORIZE before any handle is used (I7).
  const { data: profile, error: profErr } = await service
    .from('profiles')
    .select('tenant_id, capabilities')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  if (profErr) {
    return { ok: false, response: NextResponse.json({ error: 'Could not resolve your profile to authorize the operation.' }, { status: 500 }) };
  }
  const caps: string[] = Array.isArray(profile?.capabilities) ? (profile!.capabilities as string[]) : [];
  const isTenantMember = !!profile?.tenant_id && profile.tenant_id === tenantId;
  const isPlatformOperator = caps.includes(PLATFORM_DATA_OPERATIONS);
  if (!isTenantMember && !isPlatformOperator) {
    return {
      ok: false,
      response: NextResponse.json({
        error: 'Not authorized for this tenant. A platform operator needs the platform.data_operations capability; a tenant member can act only on their own tenant.',
        code: 'PULSE_LOAD_FORBIDDEN',
      }, { status: 403 }),
    };
  }
  return { ok: true, service, isPlatformOperator, callerId: authUser.id };
}
