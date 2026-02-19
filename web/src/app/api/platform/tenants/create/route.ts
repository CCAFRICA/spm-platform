/**
 * POST /api/platform/tenants/create
 *
 * Server-side tenant creation using service role client (bypasses RLS).
 * OB-57: Accepts qualifying wizard data including tier, modules, billing.
 * Validates VL Admin caller, checks slug uniqueness, creates tenant with
 * commercial billing data stored in settings JSONB.
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
    const { name, slug, industry, country, currency, locale, modules, tier, experienceTier, billing } = body;

    if (!name || !slug || !industry || !country) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, industry, country' },
        { status: 400 }
      );
    }

    // 3. Use service role client
    const supabase = await createServiceRoleClient();

    // 4. Check slug uniqueness
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `Tenant with slug "${slug}" already exists` },
        { status: 409 }
      );
    }

    // 5. Build settings with billing data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = {
      industry,
      country_code: country,
      tier: tier || 'inicio',
      experience_tier: experienceTier || 'self_service',
      billing: billing || {},
    };

    // 6. Insert tenant
    const { data: tenant, error: insertError } = await supabase
      .from('tenants')
      .insert({
        name: name.trim(),
        slug,
        settings,
        features: {
          compensation: modules?.includes('icm') || false,
          financial: modules?.includes('tfi') || false,
        },
        locale: locale || 'es-MX',
        currency: currency || 'MXN',
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[POST /api/platform/tenants/create] Insert failed:', insertError);
      return NextResponse.json(
        { error: `Failed to create tenant: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[POST /api/platform/tenants/create] Tenant created:', tenant.id, tenant.name);

    // 7. Write metering event
    try {
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await supabase.from('usage_metering').insert({
        tenant_id: tenant.id,
        metric_name: 'tenant_created',
        metric_value: 1,
        period_key: periodKey,
        dimensions: {
          created_by: user.email || 'vl_admin',
          industry,
          tier: tier || 'inicio',
          modules: modules || [],
        },
      });
    } catch (meterErr) {
      console.error('[POST /api/platform/tenants/create] Metering failed (non-blocking):', meterErr);
    }

    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/platform/tenants/create] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
