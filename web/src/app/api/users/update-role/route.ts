/**
 * PATCH /api/users/update-role
 *
 * Updates a user's role in both profiles table and auth user_metadata.
 * Requires caller to be platform or admin for the same tenant.
 *
 * SCHEMA_TRUTH.md: profiles columns used: id, tenant_id, auth_user_id, role, capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

// OB-204 A.6: the legacy ROLE_CAPABILITIES literal map is retired — capabilities are
// derived at the single door (deriveCapabilities via changeRole). No literal here.
const VALID_ROLES = ['platform', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'];

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

    if (!callerProfile || !['platform', 'admin'].includes(callerProfile.role)) {
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

    // Non-platform cannot set platform role
    if (newRole === 'platform' && callerProfile.role !== 'platform') {
      return NextResponse.json({ error: 'Only platform admins can assign platform role' }, { status: 403 });
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

    // Same tenant check (platform can cross-tenant)
    if (callerProfile.role !== 'platform' && targetProfile.tenant_id !== callerProfile.tenant_id) {
      return NextResponse.json({ error: 'Cannot modify users in other tenants' }, { status: 403 });
    }

    // 4. OB-204 A.6: route the role change through THE SINGLE DOOR (changeRole). Capabilities
    // are re-derived from role (deriveCapabilities), the lockout guard applies, user_metadata
    // is synced, and an I-1 PII-free lifecycle event is emitted — no capability literal here.
    const { changeRole, ProvisionError } = await import('@/lib/auth/provision-user');
    try {
      const r = await changeRole({ targetProfileId: profileId, newRole });
      return NextResponse.json({ success: true, profileId, newRole: r.role });
    } catch (e) {
      if (e instanceof ProvisionError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === 'lockout_guard' ? 409 : 400 });
      return NextResponse.json({ error: e instanceof Error ? e.message : 'role change failed' }, { status: 500 });
    }
  } catch (err) {
    console.error('[PATCH /api/users/update-role] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
