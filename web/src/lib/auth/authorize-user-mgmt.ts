/**
 * OB-204 A.4 — the single authorization helper for every user-management route.
 *
 * Pipeline (DS-028 §3): resolveIdentity → capability `tenant.manage_users` → AAL2
 * step-up assertion (Q-C; user management is a step-up-gated operation) → tenant
 * scoping (admin: own tenant only; platform: any) → only platform assigns/creates
 * the platform role. Routes hold ZERO authorization logic of their own — they call
 * this and map the structured result to HTTP.
 */
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { hasCapability, resolveRole, type Role } from '@/lib/auth/permissions';

export interface AuthorizedCaller {
  profileId: string;
  role: Role;
  tenantId: string | null;
}
export type AuthzResult =
  | { ok: true; caller: AuthorizedCaller }
  | { ok: false; status: number; code: string; error: string };

export interface AuthzTarget {
  tenantId: string | null;     // target's tenant (for scoping)
  assigningPlatform?: boolean;  // is this action creating/assigning the platform role?
}

export async function authorizeUserMgmt(target?: AuthzTarget): Promise<AuthzResult> {
  const state = await getServerAuthState();
  if (!state.isAuthenticated || !state.profile) {
    return { ok: false, status: 401, code: 'unauthenticated', error: 'Authentication required' };
  }
  const role = resolveRole(state.profile.role);
  if (!role) return { ok: false, status: 403, code: 'forbidden', error: 'Caller role does not resolve' };

  // capability — the PDP, role-based (not the stored array)
  if (!hasCapability(role, 'tenant.manage_users')) {
    return { ok: false, status: 403, code: 'forbidden', error: 'manage_users capability required' };
  }

  // AAL2 step-up assertion (Q-C). Caller roles with manage_users (platform/admin) are
  // MFA-enforced by middleware, so AAL2 is reachable; reject below if the session is < aal2.
  const sb = await createServerSupabaseClient();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') {
    return { ok: false, status: 403, code: 'aal2_required', error: 'Step-up authentication (AAL2) required for user management' };
  }

  // tenant scoping + platform-assignment restriction
  if (target) {
    if (role !== 'platform') {
      if (target.tenantId !== state.profile.tenantId) {
        return { ok: false, status: 403, code: 'tenant_scope', error: 'Cross-tenant user management is denied' };
      }
      if (target.assigningPlatform) {
        return { ok: false, status: 403, code: 'platform_only', error: 'Only a platform user may create or assign the platform role' };
      }
    }
  }
  return { ok: true, caller: { profileId: state.profile.id, role, tenantId: state.profile.tenantId } };
}

/**
 * Read-side authorization for the user LIST (C.1/C.2). Capability + caller identity only —
 * NO AAL2 step-up (step-up gates management mutations, Q-C; a read does not). The route applies
 * tenant scoping to the QUERY using the returned caller (admin → own tenant; platform → any).
 */
export async function authorizeUserRead(): Promise<AuthzResult> {
  const state = await getServerAuthState();
  if (!state.isAuthenticated || !state.profile) {
    return { ok: false, status: 401, code: 'unauthenticated', error: 'Authentication required' };
  }
  const role = resolveRole(state.profile.role);
  if (!role) return { ok: false, status: 403, code: 'forbidden', error: 'Caller role does not resolve' };
  if (!hasCapability(role, 'tenant.manage_users')) {
    return { ok: false, status: 403, code: 'forbidden', error: 'manage_users capability required' };
  }
  return { ok: true, caller: { profileId: state.profile.id, role, tenantId: state.profile.tenantId } };
}

/** Resolve a target profile's tenant_id (service-role) so the route can scope before acting. */
export async function targetTenantId(profileId: string): Promise<{ found: boolean; tenantId: string | null }> {
  const sb = await createServiceRoleClient();
  const { data } = await sb.from('profiles').select('tenant_id').eq('id', profileId).maybeSingle();
  if (!data) return { found: false, tenantId: null };
  return { found: true, tenantId: (data.tenant_id as string | null) ?? null };
}

/** Map a ProvisionError.code to an HTTP status (routes stay thin). */
export function provisionErrorStatus(code: string): number {
  switch (code) {
    case 'invalid_role':
    case 'tenant_scope_violation': return 400;
    case 'duplicate_identity': return 409;
    case 'not_found': return 404;
    case 'lockout_guard': return 409;
    case 'rate_limited': return 429;
    default: return 500;
  }
}
