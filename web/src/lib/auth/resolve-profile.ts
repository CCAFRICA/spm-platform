/**
 * OB-151: Resolve profile ID for FK-constrained columns.
 *
 * All write operations that set created_by, uploaded_by, filed_by etc.
 * must use a profiles.id value (not auth.users.id). This helper:
 *   1. Looks up existing profile by auth_user_id + tenant_id
 *   2. If not found and caller is a platform admin, uses the tenant's
 *      own admin profile (does NOT auto-create — that breaks platform auth)
 *   3. Returns the profile.id for use in FK-constrained columns
 *
 * HF-086 originally auto-created profiles for VL Admin in each tenant.
 * OB-151 rewrites to Option B: borrow tenant admin's profile for created_by.
 * This avoids creating extra profiles that break .maybeSingle() queries
 * in the observatory API and auth context.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  email?: string;
}

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
    // Not a platform admin and no profile in tenant — should not happen
    console.warn(`[resolveProfileId] No profile for user ${authUser.id} in tenant ${tenantId}`);
    return authUser.id;
  }

  // 3. OB-151 Option B: Use tenant's own admin profile for created_by.
  // Do NOT auto-create a profile — that breaks VL Admin's platform auth
  // (.maybeSingle() in observatory API fails with multiple profiles).
  const { data: tenantAdmin } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (tenantAdmin) {
    console.log(`[resolveProfileId] VL Admin using tenant admin profile ${tenantAdmin.id} in tenant ${tenantId}`);
    return tenantAdmin.id;
  }

  // 4. Last resort: no admin profile in tenant either. Use any profile in tenant.
  const { data: anyProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anyProfile) {
    console.log(`[resolveProfileId] VL Admin using fallback profile ${anyProfile.id} in tenant ${tenantId}`);
    return anyProfile.id;
  }

  // No profiles at all in tenant — this tenant has no users. Should not happen.
  console.error(`[resolveProfileId] No profiles exist in tenant ${tenantId}`);
  throw new Error(`No profiles exist in tenant ${tenantId} — cannot resolve created_by`);
}
