/**
 * HF-086: Resolve profile ID for FK-constrained columns.
 *
 * All write operations that set created_by, uploaded_by, filed_by etc.
 * must use a profiles.id value (not auth.users.id). This helper:
 *   1. Looks up existing profile by auth_user_id + tenant_id
 *   2. If not found and caller is a platform admin, auto-creates a profile
 *   3. Returns the profile.id for use in FK-constrained columns
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Resolve a profile ID for the given auth user within a tenant.
 *
 * For regular tenant users, their profile already exists.
 * For VL Platform Admins operating inside a tenant, a profile is
 * auto-created on first write operation.
 */
export async function resolveProfileId(
  supabase: SupabaseClient,
  authUser: AuthUser,
  tenantId: string
): Promise<string> {
  // 1. Try to find existing profile in this tenant
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing) return existing.id;

  // 2. Check if caller is a platform admin (has vl_admin profile in ANY tenant)
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', authUser.id)
    .eq('role', 'vl_admin')
    .limit(1);

  const isPlatformAdmin = (adminProfiles && adminProfiles.length > 0)
    || authUser.email?.endsWith('@vialuce.com')
    || authUser.email?.endsWith('@vialuce.ai');

  if (!isPlatformAdmin) {
    // Not a platform admin and no profile in tenant — should not happen in normal flow
    // Return auth user ID as last resort (may fail FK if constraint is strict)
    console.warn(`[resolveProfileId] No profile for user ${authUser.id} in tenant ${tenantId}`);
    return authUser.id;
  }

  // 3. Auto-create profile for platform admin in this tenant
  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      tenant_id: tenantId,
      email: authUser.email || 'platform@vialuce.com',
      display_name: 'VL Platform Admin',
      role: 'admin',
      auth_user_id: authUser.id,
      capabilities: ['manage_team', 'approve_outcomes'],
    })
    .select('id')
    .single();

  if (error) {
    // Profile creation failed — might be a race condition (another request created it)
    // Try one more lookup
    const { data: retryProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (retryProfile) return retryProfile.id;

    console.error(`[resolveProfileId] Failed to create platform admin profile:`, error);
    throw new Error(`Failed to create platform admin profile in tenant: ${error.message}`);
  }

  console.log(`[resolveProfileId] Auto-created VL Admin profile ${newProfile.id} in tenant ${tenantId}`);
  return newProfile.id;
}
