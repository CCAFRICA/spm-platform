/**
 * OB-246 Phase 5 (AP3) — server-side tenant binding for data-serving API routes.
 *
 * The dominant route shape on the platform is `createServiceRoleClient()` (RLS-bypass) reading a
 * `tenantId` taken from the request body/query with NO session check — so an authenticated user of
 * tenant A could read tenant B's payout/financial/intelligence data cross-tenant. This helper closes
 * that acute hole: it derives the caller's tenant from the AUTHENTICATED session (the tenant-scoped
 * cookie client, the carrier-intelligence pattern), never trusting a client-supplied tenantId.
 *
 *   - platform / vl_admin: MAY target another tenant via `requested` (the Observatory cross-tenant case)
 *   - everyone else: pinned to their profile tenant; a mismatched `requested` is rejected 403
 *
 * The data query may still run service-role AFTER this gate (perf/materialization paths depend on
 * RLS-bypass) — but scoped to the SESSION-derived tenant, not the caller's claim. Byte-identical for
 * legitimate same-tenant callers (the UI always sends the user's own/selected tenant).
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface CallerTenant {
  userId: string;
  role: string;
  tenantId: string;
  isPlatform: boolean;
}

export type ResolveTenantResult =
  | { ok: true; caller: CallerTenant }
  | { ok: false; response: NextResponse };

const PLATFORM_ROLES = ['platform', 'vl_admin'];

export async function resolveCallerTenant(requested?: string | null): Promise<ResolveTenantResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const role = (profile?.role as string) ?? '';
  const isPlatform = PLATFORM_ROLES.includes(role);
  const sessionTenant = (profile?.tenant_id as string | null) ?? null;

  if (isPlatform) {
    const tenantId = requested || sessionTenant;
    if (!tenantId) {
      return { ok: false, response: NextResponse.json({ error: 'No tenant specified' }, { status: 400 }) };
    }
    return { ok: true, caller: { userId: user.id, role, tenantId, isPlatform } };
  }

  if (!sessionTenant) {
    return { ok: false, response: NextResponse.json({ error: 'No tenant in session' }, { status: 403 }) };
  }
  if (requested && requested !== sessionTenant) {
    return { ok: false, response: NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 }) };
  }
  return { ok: true, caller: { userId: user.id, role, tenantId: sessionTenant, isPlatform } };
}
