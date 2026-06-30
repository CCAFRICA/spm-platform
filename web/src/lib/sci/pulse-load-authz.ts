// HF-360 (Part B) — the ONE authorization gate for the pulse-load operations surface (state/rollback/resume).
// Mirrors the HF-355 enqueue gate exactly: authenticate the session, resolve the caller's profile, and
// authorize on the NAMED capability (not a structural proxy) — caller is a member of the target tenant OR
// holds platform.data_operations. Returns the service-role client (the sole writer; bypasses RLS so platform
// operators can act cross-tenant) only AFTER the gate passes (nothing leaks on refuse). Pure boolean authz —
// zero LLM, zero domain literals (Decision 158).

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveIdentity } from '@/lib/auth/resolve-identity';

const PLATFORM_DATA_OPERATIONS = 'platform.data_operations';

export type PulseLoadAuthz =
  | { ok: true; service: SupabaseClient; isPlatformOperator: boolean; callerId: string }
  | { ok: false; response: NextResponse };

export async function authorizePulseLoadCaller(
  tenantId: string | null | undefined,
  // For a DESTRUCTIVE operation (rollback), require this capability of a TENANT MEMBER in addition to
  // membership — so not every member can wipe an import. A platform operator (platform.data_operations) is
  // always allowed. Omit for read-only/recovery operations (state/resume), which membership alone gates.
  requireTenantCapability?: string,
): Promise<PulseLoadAuthz> {
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
  // 2. Resolve the caller's identity + AUTHORIZE before any handle is used (I7). resolveIdentity is THE
  // sanctioned profiles-by-auth_user lookup — array-tolerant, so a multi-tenant member with >1 profile row
  // resolves deterministically instead of erroring on .maybeSingle().
  const identity = await resolveIdentity(service, authUser.id);
  if (!identity) {
    return { ok: false, response: NextResponse.json({ error: 'Could not resolve your profile to authorize the operation.' }, { status: 500 }) };
  }
  const caps: string[] = identity.capabilities;
  const isTenantMember = !!identity.tenantId && identity.tenantId === tenantId;
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
  // Destructive-op capability gate: a tenant member must ALSO hold the named capability. Platform operators
  // (already trusted via platform.data_operations) bypass — they are the cross-tenant operators by design.
  if (requireTenantCapability && isTenantMember && !isPlatformOperator && !caps.includes(requireTenantCapability)) {
    return {
      ok: false,
      response: NextResponse.json({
        error: `This action requires the ${requireTenantCapability} capability.`,
        code: 'PULSE_LOAD_CAPABILITY_REQUIRED',
      }, { status: 403 }),
    };
  }
  return { ok: true, service, isPlatformOperator, callerId: authUser.id };
}
