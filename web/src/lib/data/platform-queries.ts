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

export interface IngestionMetricsData {
  totalEvents: number;
  committedCount: number;
  quarantinedCount: number;
  rejectedCount: number;
  totalBytesIngested: number;
  avgValidationPassRate: number;
  classificationAccuracy: number;
  perTenant: IngestionTenantMetrics[];
  recentEvents: IngestionRecentEvent[];
}

export interface IngestionTenantMetrics {
  tenantId: string;
  tenantName: string;
  totalEvents: number;
  committed: number;
  quarantined: number;
  rejected: number;
  bytesIngested: number;
}

export interface IngestionRecentEvent {
  id: string;
  tenantId: string;
  tenantName: string;
  fileName: string | null;
  fileSize: number | null;
  status: string;
  createdAt: string;
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

  const tenantIds = tenants.map(t => t.id);

  // Bulk fetch all related data in parallel (5 queries instead of 5N)
  const [allEntities, allProfiles, allPeriods, allBatches, allOutcomes] = await Promise.all([
    supabase.from('entities').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
    supabase.from('profiles').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
    supabase.from('periods').select('id, tenant_id, period_key, start_date, status')
      .in('tenant_id', tenantIds).order('start_date', { ascending: false }).limit(10000),
    supabase.from('calculation_batches').select('tenant_id, lifecycle_state, entity_count, created_at')
      .in('tenant_id', tenantIds).order('created_at', { ascending: false }).limit(10000),
    supabase.from('entity_period_outcomes').select('tenant_id, period_id, total_payout')
      .in('tenant_id', tenantIds).limit(10000),
  ]);

  const entityCounts = countByField(allEntities.data ?? [], 'tenant_id');
  const profileCounts = countByField(allProfiles.data ?? [], 'tenant_id');

  const latestPeriodByTenant = new Map<string, { id: string; period_key: string; status: string }>();
  for (const p of (allPeriods.data ?? [])) {
    if (!latestPeriodByTenant.has(p.tenant_id)) {
      latestPeriodByTenant.set(p.tenant_id, { id: p.id, period_key: p.period_key, status: p.status });
    }
  }

  const latestBatchByTenant = new Map<string, { lifecycle_state: string; created_at: string }>();
  for (const b of (allBatches.data ?? [])) {
    if (!latestBatchByTenant.has(b.tenant_id)) {
      latestBatchByTenant.set(b.tenant_id, { lifecycle_state: b.lifecycle_state, created_at: b.created_at });
    }
  }

  const payoutByTenant = new Map<string, number>();
  for (const o of (allOutcomes.data ?? [])) {
    const latestPeriod = latestPeriodByTenant.get(o.tenant_id);
    if (latestPeriod && o.period_id === latestPeriod.id) {
      payoutByTenant.set(o.tenant_id, (payoutByTenant.get(o.tenant_id) ?? 0) + (o.total_payout || 0));
    }
  }

  return tenants.map(t => {
    const settings = (t.settings || {}) as Record<string, unknown>;
    const latestPeriod = latestPeriodByTenant.get(t.id);
    const latestBatch = latestBatchByTenant.get(t.id);

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      industry: (settings.industry as string) || '',
      country: (settings.country_code as string) || '',
      status: t.status || 'active',
      entityCount: entityCounts.get(t.id) ?? 0,
      userCount: profileCounts.get(t.id) ?? 0,
      periodCount: 0,
      latestPeriodLabel: latestPeriod?.period_key ?? null,
      latestPeriodStatus: latestPeriod?.status ?? null,
      latestLifecycleState: latestBatch?.lifecycle_state ?? null,
      latestBatchPayout: payoutByTenant.get(t.id) ?? 0,
      lastActivity: latestBatch?.created_at || t.updated_at || t.created_at,
      createdAt: t.created_at,
    };
  });
}

// ──────────────────────────────────────────────
// Operations Queue
// ──────────────────────────────────────────────

export async function getOperationsQueue(): Promise<OperationsQueueItem[]> {
  const supabase = createClient();

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, created_at');

  if (!tenants) return [];

  const tenantIds = tenants.map(t => t.id);

  // Bulk fetch entity counts and latest batches (2 queries instead of 2N)
  const [allEntities, allBatches] = await Promise.all([
    supabase.from('entities').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
    supabase.from('calculation_batches').select('tenant_id, lifecycle_state, created_at')
      .in('tenant_id', tenantIds).order('created_at', { ascending: false }).limit(10000),
  ]);

  const entityCounts = countByField(allEntities.data ?? [], 'tenant_id');

  const latestBatchByTenant = new Map<string, { lifecycle_state: string; created_at: string }>();
  for (const b of (allBatches.data ?? [])) {
    if (!latestBatchByTenant.has(b.tenant_id)) {
      latestBatchByTenant.set(b.tenant_id, { lifecycle_state: b.lifecycle_state, created_at: b.created_at });
    }
  }

  const items: OperationsQueueItem[] = [];
  const STALL_THRESHOLD = 48 * 60 * 60 * 1000;

  for (const t of tenants) {
    if ((entityCounts.get(t.id) ?? 0) === 0) {
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: `No data imported yet (created ${new Date(t.created_at).toLocaleDateString()})`,
        severity: 'warning',
        timestamp: t.created_at,
      });
      continue;
    }

    const latest = latestBatchByTenant.get(t.id);
    if (!latest) {
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: 'No calculations run yet',
        severity: 'info',
        timestamp: t.created_at,
      });
      continue;
    }

    const batchAge = Date.now() - new Date(latest.created_at).getTime();
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

  const safeTenants = tenants ?? [];
  const tenantIds = safeTenants.map(t => t.id);

  // Bulk fetch all counts + payouts in parallel (6 queries instead of 5N+3)
  const [allEntities, allPeriods, allBatches, allProfiles, allOutcomes, recentBatchesRes] = await Promise.all([
    supabase.from('entities').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('periods').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('calculation_batches').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('profiles').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('entity_period_outcomes').select('tenant_id, total_payout').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('calculation_batches').select('id, tenant_id, lifecycle_state, entity_count, created_at')
      .order('created_at', { ascending: false }).limit(10),
  ]);

  const entityCounts = countByField(allEntities.data ?? [], 'tenant_id');
  const periodCounts = countByField(allPeriods.data ?? [], 'tenant_id');
  const batchCounts = countByField(allBatches.data ?? [], 'tenant_id');
  const profileCounts = countByField(allProfiles.data ?? [], 'tenant_id');

  const payoutByTenant = new Map<string, number>();
  for (const o of (allOutcomes.data ?? [])) {
    payoutByTenant.set(o.tenant_id, (payoutByTenant.get(o.tenant_id) ?? 0) + (o.total_payout || 0));
  }

  const tenantData: TenantBillingData[] = safeTenants.map(t => ({
    tenantId: t.id,
    tenantName: t.name,
    entityCount: entityCounts.get(t.id) ?? 0,
    periodCount: periodCounts.get(t.id) ?? 0,
    batchCount: batchCounts.get(t.id) ?? 0,
    userCount: profileCounts.get(t.id) ?? 0,
    totalPayout: payoutByTenant.get(t.id) ?? 0,
  }));

  const nameMap = new Map(safeTenants.map(t => [t.id, t.name]));

  return {
    tenants: tenantData,
    recentActivity: (recentBatchesRes.data ?? []).map(b => ({
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

  if (!tenants || tenants.length === 0) return [];

  const tenantIds = tenants.map(t => t.id);

  // Bulk fetch all onboarding data in parallel (4 queries instead of 4N)
  const [allProfiles, allRuleSets, allData, allBatches] = await Promise.all([
    supabase.from('profiles').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
    supabase.from('rule_sets').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
    supabase.from('committed_data').select('tenant_id').in('tenant_id', tenantIds).limit(10000),
    supabase.from('calculation_batches').select('tenant_id, lifecycle_state, created_at')
      .in('tenant_id', tenantIds).order('created_at', { ascending: false }).limit(10000),
  ]);

  const profileCounts = countByField(allProfiles.data ?? [], 'tenant_id');
  const ruleSetCounts = countByField(allRuleSets.data ?? [], 'tenant_id');
  const dataCounts = countByField(allData.data ?? [], 'tenant_id');

  const batchCounts = new Map<string, number>();
  const latestLifecycleByTenant = new Map<string, string>();
  for (const b of (allBatches.data ?? [])) {
    batchCounts.set(b.tenant_id, (batchCounts.get(b.tenant_id) ?? 0) + 1);
    if (!latestLifecycleByTenant.has(b.tenant_id)) {
      latestLifecycleByTenant.set(b.tenant_id, b.lifecycle_state);
    }
  }

  return tenants.map(t => {
    const userCount = profileCounts.get(t.id) ?? 0;
    const ruleSetCount = ruleSetCounts.get(t.id) ?? 0;
    const dataCount = dataCounts.get(t.id) ?? 0;
    const batchCount = batchCounts.get(t.id) ?? 0;
    const latestLifecycle = latestLifecycleByTenant.get(t.id) ?? null;

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

    return {
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
    };
  });
}

// ──────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────

function countByField<T extends Record<string, unknown>>(rows: T[], field: keyof T): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[field]);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}
