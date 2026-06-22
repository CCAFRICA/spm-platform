/**
 * OB-230 — Single authorization gate for the User Operations Console (DS-014).
 *
 * Every /api/admin/users/* route calls this FIRST. Gates on the `platform.system_config` capability
 * via getServerAuthState() (which resolves identity alias-safely, so 'platform' and the legacy
 * 'vl_admin' both pass). One auth path for the whole namespace (AP-17 mitigation).
 *
 * Reads (list/detail) and platform-scoped remediation actions both use this gate. It deliberately
 * does NOT require an AAL2 step-up the way authorizeUserMgmt (tenant-admin user management) does —
 * the directive gates this surface on the platform capability, not on a step-up. (AAL2 step-up for
 * the destructive actions is a noted future hardening option, not a directive requirement.)
 */

import { getServerAuthState } from '@/lib/auth/server-auth';
import { hasCapability } from '@/lib/auth/permissions';

export interface PlatformObservabilityCaller {
  authUserId: string;
  profileId: string;
  role: string;
  email: string;
}

export type PlatformObservabilityAuthz =
  | { ok: true; caller: PlatformObservabilityCaller }
  | { ok: false; status: number; error: string };

export async function authorizePlatformObservability(): Promise<PlatformObservabilityAuthz> {
  const state = await getServerAuthState();
  if (!state.isAuthenticated || !state.user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (!state.profile) {
    return { ok: false, status: 403, error: 'Forbidden — no resolvable profile' };
  }
  if (!hasCapability(state.profile.role, 'platform.system_config')) {
    return { ok: false, status: 403, error: 'Forbidden — platform admin only (platform.system_config)' };
  }
  return {
    ok: true,
    caller: {
      authUserId: state.user.id,
      profileId: state.profile.id,
      role: state.profile.role,
      email: state.profile.email,
    },
  };
}
