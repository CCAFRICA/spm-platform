/**
 * POST /api/admin/tenants/create
 *
 * Server-side tenant creation using service role client (bypasses RLS).
 * Validates caller is VL Admin. Creates tenant, admin user, profile, and metering event.
 * Returns the created tenant record including UUID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

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
      .maybeSingle();

    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden — VL Admin required' }, { status: 403 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { name, slug, settings, features, locale, currency, hierarchy_labels, entity_type_labels } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'name is required (min 2 chars)' }, { status: 400 });
    }

    // Extract admin user details from settings (sent by the wizard)
    const adminEmail = settings?.admin_email;
    const adminName = settings?.admin_name;

    // Generate slug from name if not provided
    const tenantSlug = slug || name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    // 3. Use service role client to bypass RLS
    const supabase = await createServiceRoleClient();

    // 4. Check slug uniqueness
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `Slug "${tenantSlug}" already exists. Choose a different name.` },
        { status: 409 }
      );
    }

    // 5. Insert tenant
    const { data: tenant, error: insertError } = await supabase
      .from('tenants')
      .insert({
        name: name.trim(),
        slug: tenantSlug,
        settings: settings || {},
        features: features || {},
        locale: locale || 'en',
        currency: currency || 'USD',
        hierarchy_labels: hierarchy_labels || {},
        entity_type_labels: entity_type_labels || {},
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[POST /api/admin/tenants/create] Insert failed:', insertError);
      return NextResponse.json(
        { error: `Failed to create tenant: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[POST /api/admin/tenants/create] Tenant created:', tenant.id, tenant.name);

    // 6. Create admin user if email provided
    let adminUserId: string | null = null;
    const warnings: string[] = [];

    if (adminEmail && typeof adminEmail === 'string' && adminEmail.includes('@')) {
      try {
        // Try inviteUserByEmail first (sends magic link via configured SMTP)
        const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
          adminEmail,
          {
            data: {
              display_name: adminName || name.trim(),
              tenant_id: tenant.id,
            },
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`,
          }
        );

        if (inviteError) {
          console.error('[POST /api/admin/tenants/create] Invite failed:', inviteError.message);
          // Fallback: create user with temporary password
          const tempPassword = `Vl${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;
          const { data: createData, error: createError } = await supabase.auth.admin.createUser({
            email: adminEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              display_name: adminName || name.trim(),
              tenant_id: tenant.id,
            },
          });

          if (createError) {
            console.error('[POST /api/admin/tenants/create] createUser fallback failed:', createError.message);
            warnings.push(`Admin user creation failed: ${createError.message}. User can be invited separately.`);
          } else {
            adminUserId = createData.user.id;
            warnings.push('Admin user created with temporary password. A password reset email should be sent separately.');
          }
        } else if (inviteData?.user) {
          adminUserId = inviteData.user.id;
          console.log('[POST /api/admin/tenants/create] Admin invited:', adminEmail);
        }

        // Create profile record for the admin user
        if (adminUserId) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              auth_user_id: adminUserId,
              tenant_id: tenant.id,
              display_name: adminName || name.trim(),
              email: adminEmail,
              role: 'tenant_admin',
              capabilities: ['view_outcomes', 'approve_outcomes', 'export_results', 'manage_rule_sets', 'manage_assignments'],
              scope_level: 'tenant',
              locale: locale || 'en',
              status: 'active',
              settings: {},
            });

          if (profileError) {
            console.error('[POST /api/admin/tenants/create] Profile creation failed:', profileError.message);
            warnings.push(`Profile creation failed: ${profileError.message}`);
          } else {
            console.log('[POST /api/admin/tenants/create] Admin profile created for:', adminEmail);
          }
        }
      } catch (adminErr) {
        console.error('[POST /api/admin/tenants/create] Admin user error:', adminErr);
        warnings.push('Admin user creation encountered an error. User can be invited separately.');
      }
    }

    // 7. Write metering event (don't fail on metering errors)
    try {
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { error: meterError } = await supabase
        .from('usage_metering')
        .insert({
          tenant_id: tenant.id,
          metric_name: 'tenant_created',
          metric_value: 1,
          period_key: periodKey,
          dimensions: {
            created_by: user.email || 'vl_admin',
            industry: settings?.industry || null,
            admin_email: adminEmail || null,
          },
        });
      if (meterError) console.error('[POST /api/admin/tenants/create] Metering insert error:', meterError);
    } catch (meterErr) {
      console.error('[POST /api/admin/tenants/create] Metering failed:', meterErr);
    }

    // 8. Return created tenant
    return NextResponse.json({
      tenant,
      adminUserId,
      warnings,
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/admin/tenants/create] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
