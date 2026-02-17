/**
 * POST /api/admin/tenants/create
 *
 * Server-side tenant creation using service role client (bypasses RLS).
 * Validates caller is VL Admin. Inserts into tenants table.
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
      .single();

    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden — VL Admin required' }, { status: 403 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { name, slug, settings, features, locale, currency, hierarchy_labels, entity_type_labels } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'name is required (min 2 chars)' }, { status: 400 });
    }

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

    // 6. Return created tenant
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/admin/tenants/create] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
