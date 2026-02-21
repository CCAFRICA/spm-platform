/**
 * PATCH /api/users/update-role
 *
 * Updates a user's role in both profiles table and auth user_metadata.
 * Requires caller to be vl_admin or admin for the same tenant.
 *
 * SCHEMA_TRUTH.md: profiles columns used: id, tenant_id, auth_user_id, role, capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { Capability } from '@/lib/supabase/database.types';

const VALID_ROLES = ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'];

const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  vl_admin: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments', 'import_data', 'view_audit', 'manage_tenants', 'manage_profiles'],
  admin: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments', 'import_data', 'view_audit'],
  tenant_admin: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments'],
  manager: ['view_outcomes', 'approve_outcomes', 'export_results'],
  viewer: ['view_outcomes'],
  sales_rep: ['view_outcomes'],
};

export async function PATCH(request: NextRequest) {
  try {
    // 1. Validate caller
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: callerProfile } = await authClient
      .from('profiles')
      .select('role, tenant_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!callerProfile || !['vl_admin', 'admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin required' }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { profileId, newRole } = body;

    if (!profileId || !newRole) {
      return NextResponse.json({ error: 'profileId and newRole required' }, { status: 400 });
    }

    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Invalid role: ${newRole}` }, { status: 400 });
    }

    // Non-vl_admin cannot set vl_admin role
    if (newRole === 'vl_admin' && callerProfile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Only platform admins can assign vl_admin role' }, { status: 403 });
    }

    // 3. Get target profile
    const serviceClient = await createServiceRoleClient();
    const { data: targetProfile } = await serviceClient
      .from('profiles')
      .select('id, auth_user_id, tenant_id, role')
      .eq('id', profileId)
      .maybeSingle();

    if (!targetProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Same tenant check (vl_admin can cross-tenant)
    if (callerProfile.role !== 'vl_admin' && targetProfile.tenant_id !== callerProfile.tenant_id) {
      return NextResponse.json({ error: 'Cannot modify users in other tenants' }, { status: 403 });
    }

    // 4. Update profile role + capabilities
    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({
        role: newRole,
        capabilities: ROLE_CAPABILITIES[newRole] || [],
      })
      .eq('id', profileId);

    if (updateError) {
      return NextResponse.json({ error: `Update failed: ${updateError.message}` }, { status: 500 });
    }

    // 5. Update auth user_metadata so middleware can read role from JWT
    if (targetProfile.auth_user_id) {
      await serviceClient.auth.admin.updateUserById(targetProfile.auth_user_id, {
        user_metadata: { role: newRole },
      }).catch(err => {
        console.error('[PATCH /api/users/update-role] user_metadata update failed:', err);
      });
    }

    return NextResponse.json({ success: true, profileId, newRole });
  } catch (err) {
    console.error('[PATCH /api/users/update-role] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
