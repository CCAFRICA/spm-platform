/**
 * POST /api/platform/users/invite
 *
 * Server-side user invitation using service role client (bypasses RLS).
 * Creates auth user via inviteUserByEmail (or createUser fallback),
 * then creates a profile record with role-based capabilities.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { Capability } from '@/lib/supabase/database.types';

// Role template → scope + capabilities mapping
const ROLE_TEMPLATES: Record<string, {
  scope: string;
  role: string;
  capabilities: Capability[];
}> = {
  platform_admin: {
    scope: 'platform',
    role: 'vl_admin',
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments'],
  },
  tenant_admin: {
    scope: 'tenant',
    role: 'tenant_admin',
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments'],
  },
  manager: {
    scope: 'team',
    role: 'manager',
    capabilities: ['view_outcomes', 'approve_outcomes', 'export_results'],
  },
  individual: {
    scope: 'individual',
    role: 'individual',
    capabilities: ['view_outcomes'],
  },
};

export async function POST(request: NextRequest) {
  try {
    // 1. Validate caller is authenticated VL Admin
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden — VL Admin required' }, { status: 403 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { email, displayName, tenantId, roleTemplate, entityId } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json({ error: `Invalid tenantId: expected UUID, received "${String(tenantId).substring(0, 50)}"` }, { status: 400 });
    }

    const template = ROLE_TEMPLATES[roleTemplate] || ROLE_TEMPLATES.individual;

    // 3. Use service role client
    const supabase = await createServiceRoleClient();

    // 4. Verify tenant exists
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // 5. Create auth user via invite
    let authUserId: string | null = null;
    let method: 'invite' | 'create' = 'invite';

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          display_name: displayName,
          tenant_id: tenantId,
          role: template.role,  // OB-67: Store role in user_metadata for middleware JWT access
        },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`,
      }
    );

    if (inviteError) {
      console.error('[POST /api/platform/users/invite] Invite failed, trying createUser:', inviteError.message);
      method = 'create';

      // Fallback: create user with temporary password
      const tempPassword = `Vl${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          tenant_id: tenantId,
          role: template.role,  // OB-67: Store role in user_metadata for middleware JWT access
        },
      });

      if (createError) {
        return NextResponse.json(
          { error: `Failed to create user: ${createError.message}` },
          { status: 500 }
        );
      }
      authUserId = createData.user.id;
    } else if (inviteData?.user) {
      authUserId = inviteData.user.id;
    }

    if (!authUserId) {
      return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 });
    }

    // 6. Create profile record
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: authUserId,
        tenant_id: tenantId,
        display_name: displayName,
        email,
        role: template.role,
        capabilities: template.capabilities,
        scope_level: template.scope,
        status: 'active',
        settings: {},
      });

    if (profileError) {
      console.error('[POST /api/platform/users/invite] Profile creation failed:', profileError.message);
      // OB-67: Atomic cleanup — delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authUserId).catch(cleanupErr => {
        console.error('[POST /api/platform/users/invite] Auth user cleanup failed:', cleanupErr);
      });
      return NextResponse.json(
        { error: `Profile creation failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 6b. OB-67: Link to entity if provided (entities.profile_id → profiles.id)
    if (entityId) {
      // Get the newly created profile ID
      const { data: newProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', authUserId)
        .eq('tenant_id', tenantId)
        .single();

      if (newProfile) {
        await supabase
          .from('entities')
          .update({ profile_id: newProfile.id })
          .eq('id', entityId)
          .eq('tenant_id', tenantId);
      }
    }

    // 7. Write metering event
    try {
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await supabase
        .from('usage_metering')
        .insert({
          tenant_id: tenantId,
          metric_name: 'user_invited',
          metric_value: 1,
          period_key: periodKey,
          dimensions: {
            email,
            role: roleTemplate || 'individual',
            method,
            invited_by: user.email || 'vl_admin',
          },
        });
    } catch (meterErr) {
      console.error('[POST /api/platform/users/invite] Metering failed:', meterErr);
    }

    console.log('[POST /api/platform/users/invite] User invited:', email, 'to tenant:', tenant.name, 'role:', template.role);

    return NextResponse.json({
      user: {
        id: authUserId,
        email,
        displayName,
        role: template.role,
        scope: template.scope,
      },
      method,
      tenantName: tenant.name,
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/platform/users/invite] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
