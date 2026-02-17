/**
 * Platform Observatory API — Server-side data for VL Admin Observatory
 *
 * GET /api/platform/observatory
 *
 * Uses service role client to bypass RLS for cross-tenant platform queries.
 * Validates the calling user is a VL Admin before serving data.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  FleetOverview,
  TenantFleetCard,
  OperationsQueueItem,
} from '@/lib/data/platform-queries';

export async function GET() {
  try {
    // 1. Validate caller is authenticated VL Admin
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check profile for vl_admin role (using auth client which respects profiles_select_own policy)
    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile || profile.role !== 'vl_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Use service role client for cross-tenant queries (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // 3. Fetch all Observatory data in parallel
    const [overview, tenantCards, queue] = await Promise.all([
      fetchFleetOverview(supabase),
      fetchTenantFleetCards(supabase),
      fetchOperationsQueue(supabase),
    ]);

    return NextResponse.json({ overview, tenantCards, queue });
  } catch (err) {
    console.error('[Platform Observatory API] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Fleet Overview ──

type ServiceClient = Awaited<ReturnType<typeof createServiceRoleClient>>;

async function fetchFleetOverview(supabase: ServiceClient): Promise<FleetOverview> {
  const [tenantRes, entityRes, batchRes, periodRes] = await Promise.all([
    supabase.from('tenants').select('id, status', { count: 'exact', head: false }),
    supabase.from('entities').select('*', { count: 'exact', head: true }),
    supabase.from('calculation_batches').select('*', { count: 'exact', head: true }),
    supabase.from('periods').select('*', { count: 'exact', head: true }).neq('status', 'closed'),
  ]);

  const tenants = tenantRes.data ?? [];
  const activeTenants = tenants.filter(t => t.status === 'active' || !t.status);

  return {
    tenantCount: tenantRes.count ?? tenants.length,
    activeTenantCount: activeTenants.length,
    totalEntities: entityRes.count ?? 0,
    totalBatches: batchRes.count ?? 0,
    activePeriodsCount: periodRes.count ?? 0,
  };
}

// ── Tenant Fleet Cards ──

async function fetchTenantFleetCards(supabase: ServiceClient): Promise<TenantFleetCard[]> {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, settings, status, created_at, updated_at')
    .order('name');

  if (!tenants || tenants.length === 0) return [];

  const cards: TenantFleetCard[] = [];

  for (const t of tenants) {
    const settings = (t.settings || {}) as Record<string, unknown>;

    const [entityRes, profileRes, periodRes, batchRes] = await Promise.all([
      supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('periods').select('id, period_key, start_date, status')
        .eq('tenant_id', t.id).order('start_date', { ascending: false }).limit(1),
      supabase.from('calculation_batches').select('id, lifecycle_state, entity_count, created_at')
        .eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(1),
    ]);

    let latestBatchPayout = 0;
    const latestPeriod = periodRes.data?.[0];
    if (latestPeriod) {
      const { data: outcomes } = await supabase
        .from('entity_period_outcomes')
        .select('total_payout')
        .eq('tenant_id', t.id)
        .eq('period_id', latestPeriod.id);
      latestBatchPayout = (outcomes ?? []).reduce((s, o) => s + (o.total_payout || 0), 0);
    }

    cards.push({
      id: t.id,
      name: t.name,
      slug: t.slug,
      industry: (settings.industry as string) || '',
      country: (settings.country_code as string) || '',
      status: t.status || 'active',
      entityCount: entityRes.count ?? 0,
      userCount: profileRes.count ?? 0,
      periodCount: 0,
      latestPeriodLabel: latestPeriod?.period_key ?? null,
      latestPeriodStatus: latestPeriod?.status ?? null,
      latestLifecycleState: batchRes.data?.[0]?.lifecycle_state ?? null,
      latestBatchPayout,
      lastActivity: batchRes.data?.[0]?.created_at || t.updated_at || t.created_at,
      createdAt: t.created_at,
    });
  }

  return cards;
}

// ── Operations Queue ──

async function fetchOperationsQueue(supabase: ServiceClient): Promise<OperationsQueueItem[]> {
  const items: OperationsQueueItem[] = [];

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, created_at');

  if (!tenants) return [];

  for (const t of tenants) {
    const { count: entityCount } = await supabase
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', t.id);

    if ((entityCount ?? 0) === 0) {
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: `No data imported yet (created ${new Date(t.created_at).toLocaleDateString()})`,
        severity: 'warning',
        timestamp: t.created_at,
      });
      continue;
    }

    const { data: batches } = await supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, created_at')
      .eq('tenant_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!batches || batches.length === 0) {
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: 'No calculations run yet',
        severity: 'info',
        timestamp: t.created_at,
      });
      continue;
    }

    const latest = batches[0];
    const batchAge = Date.now() - new Date(latest.created_at).getTime();
    const STALL_THRESHOLD = 48 * 60 * 60 * 1000;

    if (
      batchAge > STALL_THRESHOLD &&
      latest.lifecycle_state !== 'POSTED' &&
      latest.lifecycle_state !== 'CLOSED' &&
      latest.lifecycle_state !== 'PAID'
    ) {
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: `Lifecycle stalled at ${latest.lifecycle_state} for ${Math.floor(batchAge / (24 * 60 * 60 * 1000))}d`,
        severity: 'critical',
        timestamp: latest.created_at,
      });
    }
  }

  return items;
}
