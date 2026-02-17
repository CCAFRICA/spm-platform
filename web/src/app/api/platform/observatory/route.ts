/**
 * Platform Observatory API — Server-side data for VL Admin Observatory
 *
 * GET /api/platform/observatory?tab=fleet|ai|billing|infra|onboarding
 *
 * Uses service role client to bypass RLS for cross-tenant platform queries.
 * Validates the calling user is a VL Admin before serving data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  FleetOverview,
  TenantFleetCard,
  OperationsQueueItem,
  AIIntelligenceData,
  TenantBillingData,
  RecentBatchActivity,
  OnboardingTenant,
} from '@/lib/data/platform-queries';

type ServiceClient = Awaited<ReturnType<typeof createServiceRoleClient>>;

export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Use service role client for cross-tenant queries (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // 3. Route by tab parameter
    const tab = request.nextUrl.searchParams.get('tab') || 'fleet';

    switch (tab) {
      case 'fleet': {
        const [overview, tenantCards, queue] = await Promise.all([
          fetchFleetOverview(supabase),
          fetchTenantFleetCards(supabase),
          fetchOperationsQueue(supabase),
        ]);
        return NextResponse.json({ overview, tenantCards, queue });
      }
      case 'ai':
        return NextResponse.json(await fetchAIIntelligence(supabase));
      case 'billing':
        return NextResponse.json(await fetchBillingData(supabase));
      case 'infra':
        return NextResponse.json(await fetchInfrastructureData(supabase));
      case 'onboarding':
        return NextResponse.json(await fetchOnboardingData(supabase));
      default:
        return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[Platform Observatory API] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════
// Fleet Tab
// ═══════════════════════════════════════════════

async function fetchFleetOverview(supabase: ServiceClient): Promise<FleetOverview> {
  const [tenantRes, entityRes, batchRes, periodRes] = await Promise.all([
    supabase.from('tenants').select('id', { count: 'exact', head: false }),
    supabase.from('entities').select('*', { count: 'exact', head: true }),
    supabase.from('calculation_batches').select('*', { count: 'exact', head: true }),
    supabase.from('periods').select('*', { count: 'exact', head: true }).neq('status', 'closed'),
  ]);

  if (tenantRes.error) {
    console.error('[fetchFleetOverview] tenants query error:', tenantRes.error);
  }

  const tenantCount = tenantRes.count ?? (tenantRes.data?.length ?? 0);

  return {
    tenantCount,
    activeTenantCount: tenantCount, // all tenants are active (no status column)
    totalEntities: entityRes.count ?? 0,
    totalBatches: batchRes.count ?? 0,
    activePeriodsCount: periodRes.count ?? 0,
  };
}

async function fetchTenantFleetCards(supabase: ServiceClient): Promise<TenantFleetCard[]> {
  const { data: tenants, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, slug, settings, created_at, updated_at')
    .order('name');

  if (tenantError) {
    console.error('[fetchTenantFleetCards] tenants query error:', tenantError);
  }

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
      status: 'active',
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

// ═══════════════════════════════════════════════
// AI Intelligence Tab
// ═══════════════════════════════════════════════

async function fetchAIIntelligence(supabase: ServiceClient): Promise<AIIntelligenceData> {
  const { data: signals, error } = await supabase
    .from('classification_signals')
    .select('id, tenant_id, signal_type, confidence')
    .limit(1000);

  if (error) {
    return { totalSignals: 0, avgConfidence: 0, signalsByType: [], perTenant: [], tableExists: false };
  }

  const safeSignals = signals ?? [];
  if (safeSignals.length === 0) {
    return { totalSignals: 0, avgConfidence: 0, signalsByType: [], perTenant: [], tableExists: true };
  }

  const byType: Record<string, { count: number; totalConf: number }> = {};
  const byTenant: Record<string, { count: number; totalConf: number }> = {};
  let totalConf = 0;
  let confCount = 0;

  for (const s of safeSignals) {
    const conf = s.confidence ?? 0;
    if (s.confidence != null) { totalConf += conf; confCount++; }
    if (!byType[s.signal_type]) byType[s.signal_type] = { count: 0, totalConf: 0 };
    byType[s.signal_type].count++;
    byType[s.signal_type].totalConf += conf;
    if (!byTenant[s.tenant_id]) byTenant[s.tenant_id] = { count: 0, totalConf: 0 };
    byTenant[s.tenant_id].count++;
    byTenant[s.tenant_id].totalConf += conf;
  }

  const tenantIds = Object.keys(byTenant);
  const { data: tenantRows } = await supabase
    .from('tenants')
    .select('id, name')
    .in('id', tenantIds.length > 0 ? tenantIds : ['__none__']);

  const tenantNameMap = new Map((tenantRows ?? []).map(t => [t.id, t.name]));

  return {
    totalSignals: safeSignals.length,
    avgConfidence: confCount > 0 ? totalConf / confCount : 0,
    signalsByType: Object.entries(byType).map(([signalType, d]) => ({
      signalType,
      count: d.count,
      avgConfidence: d.count > 0 ? d.totalConf / d.count : 0,
    })),
    perTenant: Object.entries(byTenant).map(([tenantId, d]) => ({
      tenantId,
      tenantName: tenantNameMap.get(tenantId) ?? tenantId,
      signalCount: d.count,
      avgConfidence: d.count > 0 ? d.totalConf / d.count : 0,
    })),
    tableExists: true,
  };
}

// ═══════════════════════════════════════════════
// Billing & Usage Tab
// ═══════════════════════════════════════════════

async function fetchBillingData(supabase: ServiceClient): Promise<{
  tenants: TenantBillingData[];
  recentActivity: RecentBatchActivity[];
}> {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .order('name');

  const tenantData: TenantBillingData[] = [];

  for (const t of (tenants ?? [])) {
    const [entityRes, periodRes, batchRes, profileRes, payoutRes] = await Promise.all([
      supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('calculation_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('entity_period_outcomes').select('total_payout').eq('tenant_id', t.id),
    ]);

    tenantData.push({
      tenantId: t.id,
      tenantName: t.name,
      entityCount: entityRes.count ?? 0,
      periodCount: periodRes.count ?? 0,
      batchCount: batchRes.count ?? 0,
      userCount: profileRes.count ?? 0,
      totalPayout: (payoutRes.data ?? []).reduce((s, o) => s + (o.total_payout || 0), 0),
    });
  }

  const { data: recentBatches } = await supabase
    .from('calculation_batches')
    .select('id, tenant_id, lifecycle_state, entity_count, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  const batchTenantIds = Array.from(new Set((recentBatches ?? []).map(b => b.tenant_id)));
  const { data: batchTenants } = await supabase
    .from('tenants')
    .select('id, name')
    .in('id', batchTenantIds.length > 0 ? batchTenantIds : ['__none__']);
  const nameMap = new Map((batchTenants ?? []).map(t => [t.id, t.name]));

  return {
    tenants: tenantData,
    recentActivity: (recentBatches ?? []).map(b => ({
      batchId: b.id,
      tenantId: b.tenant_id,
      tenantName: nameMap.get(b.tenant_id) ?? b.tenant_id,
      lifecycleState: b.lifecycle_state,
      entityCount: b.entity_count,
      createdAt: b.created_at,
    })),
  };
}

// ═══════════════════════════════════════════════
// Infrastructure Tab
// ═══════════════════════════════════════════════

async function fetchInfrastructureData(supabase: ServiceClient): Promise<{
  supabaseHealthy: boolean;
  tenantCount: number;
  committedDataCount: number;
  totalOutcomes: number;
  hasAnthropicKey: boolean;
}> {
  const [tenantRes, dataRes, outcomeRes] = await Promise.all([
    supabase.from('tenants').select('*', { count: 'exact', head: true }),
    supabase.from('committed_data').select('*', { count: 'exact', head: true }),
    supabase.from('entity_period_outcomes').select('*', { count: 'exact', head: true }),
  ]);

  return {
    supabaseHealthy: !tenantRes.error,
    tenantCount: tenantRes.count ?? 0,
    committedDataCount: dataRes.count ?? 0,
    totalOutcomes: outcomeRes.count ?? 0,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  };
}

// ═══════════════════════════════════════════════
// Onboarding Tab
// ═══════════════════════════════════════════════

async function fetchOnboardingData(supabase: ServiceClient): Promise<OnboardingTenant[]> {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });

  if (!tenants) return [];

  const result: OnboardingTenant[] = [];

  for (const t of tenants) {
    const [profileRes, ruleSetRes, dataRes, batchRes] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('calculation_batches').select('id, lifecycle_state')
        .eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(1),
    ]);

    const userCount = profileRes.count ?? 0;
    const ruleSetCount = ruleSetRes.count ?? 0;
    const dataCount = dataRes.count ?? 0;
    const batchCount = batchRes.data?.length ?? 0;
    const latestLifecycle = batchRes.data?.[0]?.lifecycle_state ?? null;

    const stages = {
      tenantCreated: true,
      usersInvited: userCount > 1,
      planImported: ruleSetCount > 0,
      dataImported: dataCount > 0,
      firstCalculation: batchCount > 0,
      goLive: latestLifecycle === 'POSTED' || latestLifecycle === 'CLOSED' || latestLifecycle === 'PAID',
    };

    let stage = 1;
    if (stages.usersInvited) stage = 2;
    if (stages.planImported) stage = 3;
    if (stages.dataImported) stage = 4;
    if (stages.firstCalculation) stage = 5;
    if (stages.goLive) stage = 6;

    result.push({
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
      stage,
      stages,
      userCount,
      ruleSetCount,
      dataCount,
      batchCount,
      latestLifecycleState: latestLifecycle,
    });
  }

  return result;
}
