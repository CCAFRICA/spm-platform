/**
 * OB-151 / HF-089: Resolve profile ID for FK-constrained columns.
 *
 * All write operations that set created_by, uploaded_by, filed_by etc.
 * must use a profiles.id value (not auth.users.id). Resolution order:
 *   1. Profile by auth_user_id + tenant_id (user has a tenant-scoped profile)
 *   2. Platform profile (tenant_id IS NULL) for VL Admin (Decision 89)
 *   3. Tenant admin profile (borrow for created_by attribution)
 *   4. Any profile in tenant (last resort)
 *
 * Does NOT auto-create profiles (Decision 90).
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

  // 2. HF-089: Fall back to VL Admin platform profile (tenant_id IS NULL).
  // VL Admin operates inside tenants via Decision 89 but has no tenant-scoped
  // profile (Decision 90). Use their platform profile for created_by.
  const { data: platformProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .is('tenant_id', null)
    .maybeSingle();

  if (platformProfile) {
    console.log(`[resolveProfileId] Using platform profile ${platformProfile.id} for user ${authUser.id} in tenant ${tenantId}`);
    return platformProfile.id;
  }

  // 3. Check if caller is a platform admin (has vl_admin profile in ANY tenant)
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
    console.warn(`[resolveProfileId] No profile for user ${authUser.id} in tenant ${tenantId}`);
    return authUser.id;
  }

  // 4. Use tenant's own admin profile for created_by.
  const { data: tenantAdmin } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'tenant_admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (tenantAdmin) {
    console.log(`[resolveProfileId] VL Admin using tenant admin profile ${tenantAdmin.id} in tenant ${tenantId}`);
    return tenantAdmin.id;
  }

  // 5. Last resort: any profile in tenant.
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

  console.error(`[resolveProfileId] No profiles exist in tenant ${tenantId}`);
  throw new Error(`No profiles exist in tenant ${tenantId} — cannot resolve created_by`);
}
