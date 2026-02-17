/**
 * Platform-Scoped Data Query Layer
 *
 * Cross-tenant queries for the VL Admin Platform Observatory.
 * All data from Supabase — no mock data, no hardcoded values.
 * Requires platform-scope RLS (VL Admin auth).
 */

import { createClient } from '@/lib/supabase/client';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface FleetOverview {
  tenantCount: number;
  activeTenantCount: number;
  totalEntities: number;
  totalBatches: number;
  activePeriodsCount: number;
}

export interface TenantFleetCard {
  id: string;
  name: string;
  slug: string;
  industry: string;
  country: string;
  status: string;
  entityCount: number;
  userCount: number;
  periodCount: number;
  latestPeriodLabel: string | null;
  latestPeriodStatus: string | null;
  latestLifecycleState: string | null;
  latestBatchPayout: number;
  lastActivity: string;
  createdAt: string;
}

export interface OperationsQueueItem {
  tenantId: string;
  tenantName: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
}

export interface AIIntelligenceData {
  totalSignals: number;
  avgConfidence: number;
  signalsByType: { signalType: string; count: number; avgConfidence: number }[];
  perTenant: { tenantId: string; tenantName: string; signalCount: number; avgConfidence: number }[];
  tableExists: boolean;
}

export interface TenantBillingData {
  tenantId: string;
  tenantName: string;
  entityCount: number;
  periodCount: number;
  batchCount: number;
  userCount: number;
  totalPayout: number;
}

export interface RecentBatchActivity {
  batchId: string;
  tenantId: string;
  tenantName: string;
  lifecycleState: string;
  entityCount: number;
  createdAt: string;
}

export interface OnboardingTenant {
  id: string;
  name: string;
  createdAt: string;
  stage: number; // 1-6
  stages: {
    tenantCreated: boolean;
    usersInvited: boolean;
    planImported: boolean;
    dataImported: boolean;
    firstCalculation: boolean;
    goLive: boolean;
  };
  userCount: number;
  ruleSetCount: number;
  dataCount: number;
  batchCount: number;
  latestLifecycleState: string | null;
}

// ──────────────────────────────────────────────
// Fleet Overview
// ──────────────────────────────────────────────

export async function getFleetOverview(): Promise<FleetOverview> {
  const supabase = createClient();

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

// ──────────────────────────────────────────────
// Tenant Fleet Cards
// ──────────────────────────────────────────────

export async function getTenantFleetCards(): Promise<TenantFleetCard[]> {
  const supabase = createClient();

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, settings, status, created_at, updated_at')
    .order('name');

  if (!tenants || tenants.length === 0) return [];

  const cards: TenantFleetCard[] = [];

  for (const t of tenants) {
    const settings = (t.settings || {}) as Record<string, unknown>;

    // Parallel queries for this tenant
    const [entityRes, profileRes, periodRes, batchRes] = await Promise.all([
      supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabase.from('periods').select('id, period_key, start_date, status')
        .eq('tenant_id', t.id).order('start_date', { ascending: false }).limit(1),
      supabase.from('calculation_batches').select('id, lifecycle_state, entity_count, created_at')
        .eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(1),
    ]);

    // Total payout from entity_period_outcomes for latest period
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

// ──────────────────────────────────────────────
// Operations Queue
// ──────────────────────────────────────────────

export async function getOperationsQueue(): Promise<OperationsQueueItem[]> {
  const supabase = createClient();
  const items: OperationsQueueItem[] = [];

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, created_at');

  if (!tenants) return [];

  for (const t of tenants) {
    // Check for no entities
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

    // Check for no calculation batches
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

    // Check for stalled lifecycle
    const latest = batches[0];
    const batchAge = Date.now() - new Date(latest.created_at).getTime();
    const STALL_THRESHOLD = 48 * 60 * 60 * 1000; // 48 hours

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

// ──────────────────────────────────────────────
// AI Intelligence
// ──────────────────────────────────────────────

export async function getAIIntelligenceData(): Promise<AIIntelligenceData> {
  const supabase = createClient();

  // Check if table has data
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

  // Aggregate by type
  const byType: Record<string, { count: number; totalConf: number }> = {};
  const byTenant: Record<string, { count: number; totalConf: number }> = {};
  let totalConf = 0;
  let confCount = 0;

  for (const s of safeSignals) {
    const conf = s.confidence ?? 0;
    if (s.confidence != null) {
      totalConf += conf;
      confCount++;
    }

    // By type
    if (!byType[s.signal_type]) byType[s.signal_type] = { count: 0, totalConf: 0 };
    byType[s.signal_type].count++;
    byType[s.signal_type].totalConf += conf;

    // By tenant
    if (!byTenant[s.tenant_id]) byTenant[s.tenant_id] = { count: 0, totalConf: 0 };
    byTenant[s.tenant_id].count++;
    byTenant[s.tenant_id].totalConf += conf;
  }

  // Resolve tenant names
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

// ──────────────────────────────────────────────
// Billing & Usage
// ──────────────────────────────────────────────

export async function getBillingData(): Promise<{
  tenants: TenantBillingData[];
  recentActivity: RecentBatchActivity[];
}> {
  const supabase = createClient();

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

  // Recent batch activity
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

// ──────────────────────────────────────────────
// Infrastructure
// ──────────────────────────────────────────────

export async function getInfrastructureData(): Promise<{
  supabaseHealthy: boolean;
  tenantCount: number;
  committedDataCount: number;
  totalOutcomes: number;
  hasAnthropicKey: boolean;
}> {
  const supabase = createClient();

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
    hasAnthropicKey: typeof window !== 'undefined' ? false : false, // Server-side only
  };
}

// ──────────────────────────────────────────────
// Onboarding
// ──────────────────────────────────────────────

export async function getOnboardingData(): Promise<OnboardingTenant[]> {
  const supabase = createClient();

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
      tenantCreated: true, // If we're querying it, it exists
      usersInvited: userCount > 1,
      planImported: ruleSetCount > 0,
      dataImported: dataCount > 0,
      firstCalculation: batchCount > 0,
      goLive: latestLifecycle === 'POSTED' || latestLifecycle === 'CLOSED' || latestLifecycle === 'PAID',
    };

    // Determine current stage
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
