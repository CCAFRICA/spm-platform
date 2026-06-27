/**
 * Actor resolution for Prism API routes.
 *
 * Reconciled to the canonical server-route pattern (OB-247 Phase 0): the auth
 * gate is getUser() ONLY; the profile is resolved via the SERVICE-ROLE client
 * (never gating 401 on an RLS read); and the effective tenant is the user's
 * profile tenant OR, for platform admins (tenant_id NULL since migration 005),
 * the selected-tenant cookie — exactly like /api/comprehension and the rest of
 * the app. This fixes the OB-245 HALT-C finding where every /api/prism/* route
 * 401'd a platform-admin session (resolveActor used to require a non-null
 * profile.tenant_id, which platform users do not have). No new auth path.
 *
 * The acting user's profile_id / tenant_id / role come from the AUTHENTICATED
 * session, never from the request body. owner_id uses authUserId (auth.uid()).
 */

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/auth/permissions';
import { cookies } from 'next/headers';

export interface Actor {
  authUserId: string; // auth.uid() — owner_id + storage path prefix
  profileId: string; // profiles.id — audit_logs.profile_id (actor)
  tenantId: string; // effective tenant (profile tenant, or selected tenant for platform)
  role: string;
}

/**
 * Resolve the authenticated actor, or null if unauthenticated / no tenant context.
 * Routes map null → 401. Tenant users always resolve; platform admins resolve the
 * active tenant from the vialuce-tenant-id cookie (null if none selected yet).
 */
export async function resolveActor(): Promise<Actor | null> {
  // 1. Auth gate — the ONLY authentication check (canonical pattern).
  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return null;

  // 2. Resolve the profile via service-role (bypass RLS — never 401 on an RLS miss).
  const svc = await createServiceRoleClient();
  const { data: profile } = await svc
    .from('profiles')
    .select('id, tenant_id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!profile) return null;

  // 3. Effective tenant: tenant-bound users carry profile.tenant_id; ONLY platform
  //    admins (NULL tenant_id) fall back to the selected-tenant cookie. The cookie
  //    branch is gated on the platform ROLE (not merely a null tenant_id) so a
  //    mis-provisioned non-platform account with a null tenant cannot use a forged
  //    cookie to act in an arbitrary tenant — fail-closed by role, mirroring
  //    /api/comprehension's `isPlatform &&` guard.
  let tenantId: string | null = profile.tenant_id ?? null;
  if (!tenantId && resolveRole(profile.role ?? '') === 'platform') {
    const cookieStore = await cookies();
    tenantId = cookieStore.get('vialuce-tenant-id')?.value ?? null;
  }
  if (!tenantId) return null; // no tenant context (e.g. platform admin with none selected)

  return { authUserId: user.id, profileId: profile.id, tenantId, role: profile.role ?? '' };
}
