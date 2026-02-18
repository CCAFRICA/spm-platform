/**
 * PATCH /api/platform/tenants/[tenantId]/modules
 *
 * Toggle module on/off for a tenant. Updates features, settings.billing.modules,
 * and recalculates bundle discount. Service role client (bypasses RLS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { MODULE_FEES, PLATFORM_FEES, type TenantTier, type ModuleKey } from '@/lib/billing/pricing';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;

    // Validate VL Admin
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden — VL Admin required' }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const { module, enabled } = await request.json() as { module: ModuleKey; enabled: boolean };

    // Get current tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('features, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = { ...(tenant.settings as Record<string, unknown> || {}) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any = { ...(tenant.features as Record<string, unknown> || {}) };
    const tier = (settings.tier || 'inicio') as TenantTier;

    // Update billing modules
    if (!settings.billing) settings.billing = {};
    if (!settings.billing.modules) settings.billing.modules = {};

    if (enabled) {
      settings.billing.modules[module] = { enabled: true, license: MODULE_FEES[module]?.[tier] || 0 };
    } else {
      delete settings.billing.modules[module];
    }

    // Map module to feature flag
    const featureMap: Record<string, string> = { icm: 'compensation', tfi: 'financial' };
    if (featureMap[module]) {
      features[featureMap[module]] = enabled;
    }

    // Recalculate bundle discount
    const moduleCount = Object.keys(settings.billing.modules).length;
    const bundleDiscount = moduleCount >= 4 ? 0.20 : moduleCount >= 3 ? 0.15 : moduleCount >= 2 ? 0.10 : 0;
    settings.billing.bundle_discount = bundleDiscount;

    // Recalculate total
    const platformFee = PLATFORM_FEES[tier] || 299;
    const moduleTotal = Object.values(settings.billing.modules as Record<string, { license: number }>)
      .reduce((sum, m) => sum + (m.license || 0), 0);
    const discountedModules = Math.round(moduleTotal * (1 - bundleDiscount));
    settings.billing.platform_fee = platformFee;
    settings.billing.monthly_total = platformFee + discountedModules + (settings.billing.experience_fee || 0);

    // Update tenant
    const { error } = await supabase
      .from('tenants')
      .update({ features, settings, updated_at: new Date().toISOString() })
      .eq('id', tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Metering event
    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await supabase.from('usage_metering').insert({
      tenant_id: tenantId,
      metric_name: enabled ? 'module_enabled' : 'module_disabled',
      metric_value: 1,
      period_key: periodKey,
      metadata: { module },
    });
    // Non-blocking metering — errors don't affect the response

    return NextResponse.json({ modules: Object.keys(settings.billing.modules), billing: settings.billing });
  } catch (err) {
    console.error('[PATCH /api/platform/tenants/[tenantId]/modules] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
