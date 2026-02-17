/**
 * Platform Tenant Config API — Load tenant configuration by ID
 *
 * GET /api/platform/tenant-config?id=<tenant-id>
 *
 * Uses service role client to bypass RLS for cross-tenant reads.
 * Validates the calling user is a VL Admin before serving data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('id');
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant id' }, { status: 400 });
    }

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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Load tenant using service role client (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // Try by ID first, then by slug
    let row: Record<string, unknown> | null = null;

    const { data: byId } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();
    if (byId) row = byId as Record<string, unknown>;

    if (!row) {
      const { data: bySlug } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantId)
        .single();
      if (bySlug) row = bySlug as Record<string, unknown>;
    }

    if (!row) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // 3. Map to TenantConfig shape
    const settings = (row.settings || {}) as Record<string, unknown>;
    const features = (row.features || {}) as Record<string, boolean>;

    const tenantConfig = {
      id: row.id as string,
      name: row.name as string,
      displayName: row.name as string,
      industry: (settings.industry as string) || 'Retail',
      country: (settings.country_code as string) || 'MX',
      currency: (row.currency as string) || 'MXN',
      locale: (row.locale as string) || 'es-MX',
      timezone: (settings.timezone as string) || 'America/Mexico_City',
      features,
      createdAt: (row.created_at as string) || new Date().toISOString(),
      updatedAt: (row.updated_at as string) || new Date().toISOString(),
      status: 'active',
    };

    return NextResponse.json(tenantConfig);
  } catch (err) {
    console.error('[Platform Tenant Config API] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
