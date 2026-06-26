/**
 * Actor resolution for Prism API routes.
 *
 * The acting user's profile_id / tenant_id / role are resolved from the
 * AUTHENTICATED SESSION — never trusted from the request body. Routes then
 * switch to a service-role client for storage + file_objects writes. This is
 * the standard pattern used across the API surface (e.g. anomaly-resolve,
 * approvals); Prism does NOT introduce a new auth path (OB-246 Invariant 9).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface Actor {
  authUserId: string; // auth.uid() — owner_id + storage path prefix
  profileId: string; // profiles.id — audit_logs.profile_id (actor)
  tenantId: string;
  role: string;
}

/**
 * Resolve the authenticated actor, or null if unauthenticated / no profile.
 * Routes map null → 401/403. owner_id uses authUserId (auth.uid()) to align
 * with storage.objects.owner and the file_objects owner RLS predicate.
 */
export async function resolveActor(): Promise<Actor | null> {
  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return null;

  const { data: profile } = await authClient
    .from('profiles')
    .select('id, tenant_id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!profile || !profile.tenant_id) return null;
  return {
    authUserId: user.id,
    profileId: profile.id,
    tenantId: profile.tenant_id,
    role: profile.role ?? '',
  };
}
