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

    // OB-151: Use array query + find — .maybeSingle() fails when VL Admin
    // has profiles in multiple tenants.
    const { data: profiles } = await authClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .limit(10);

    const hasVLAdmin = profiles?.some(p => p.role === 'platform');
    if (!hasVLAdmin) {
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
      // OB-204 A.6: the tenant-creator admin is provisioned through THE SINGLE DOOR
      // (createUser, invite mode) — never an inline auth+profile insert. This removes the
      // Option-B violation (per-tenant creator auto-insert) AND the object/legacy-cap path:
      // the service derives capabilities from role and emits I-1 PII-free lifecycle events.
      try {
        const { createUser } = await import('@/lib/auth/provision-user');
        const result = await createUser({
          email: adminEmail,
          displayName: adminName || name.trim(),
          role: 'admin',                 // canonical (not legacy 'tenant_admin')
          tenantId: tenant.id,
          mode: 'invite',
          locale: (locale as 'en' | 'es-MX') || 'en',
        });
        adminUserId = result.authUserId;
        console.log('[POST /api/admin/tenants/create] Admin provisioned via single door:', result.profileId);
        if (result.delivery === 'dry_run') warnings.push('Admin invite was a dry-run (RESEND_API_KEY absent); resend from the Users page in production.');
      } catch (adminErr) {
        console.error('[POST /api/admin/tenants/create] Admin provisioning error:', adminErr);
        warnings.push('Admin user could not be provisioned through the user service. Invite them via the Users page.');
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
            created_by: user.email || 'platform',
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
