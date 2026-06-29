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
  IngestionMetricsData,
  MeteringEvent,
} from '@/lib/data/platform-queries';
import {
  computeAccuracyMetrics,
  computeCalibrationMetrics,
  computeFlywheelTrend,
  computeOverallHealth,
} from '@/lib/intelligence/ai-metrics-service';
import { computeSCIAccuracy, computeSCIFlywheelTrend, computeSCICostCurve } from '@/lib/sci/signal-capture-service';

type ServiceClient = Awaited<ReturnType<typeof createServiceRoleClient>>;

export async function GET(request: NextRequest) {
  try {
    // 1. Validate caller is authenticated VL Admin
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // OB-151: Use array query + find instead of .maybeSingle() — platform
    // admins may have profiles in multiple tenants, and .maybeSingle() errors
    // when >1 row matches.
    const { data: profiles } = await authClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .limit(10);

    const hasVLAdmin = profiles?.some(p => p.role === 'platform');
    if (!hasVLAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Use service role client for cross-tenant queries (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // 3. Route by tab parameter
    const tab = request.nextUrl.searchParams.get('tab') || 'fleet';

    switch (tab) {
      case 'fleet': {
        // HF-067: Shared data fetch — Queue and Fleet consume the same stats.
        // Uses count: 'exact' queries instead of .limit(10000) row counting.
        const { data: tenants } = await supabase
          .from('tenants')
          .select('id, name, slug, settings, created_at, updated_at')
          .order('name');

        const safeTenants = tenants ?? [];
        const tenantIds = safeTenants.map(t => t.id);

        const stats = tenantIds.length > 0
          ? await fetchSharedTenantStats(supabase, tenantIds)
          : { entityCounts: new Map(), profileCounts: new Map(), committedDataCounts: new Map(), latestBatchByTenant: new Map(), latestPeriodByTenant: new Map(), payoutByTenant: new Map(), allBatches: [] } as SharedTenantStats;

        const [overview, tenantCards, queue] = await Promise.all([
          fetchFleetOverview(supabase, safeTenants, stats),
          Promise.resolve(buildTenantFleetCards(safeTenants, stats)),
          Promise.resolve(buildOperationsQueue(safeTenants, stats)),
        ]);
        // Populate attention items count from queue
        overview.openAttentionItems = queue.filter(q => q.severity !== 'info').length;
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
      case 'ingestion':
        return NextResponse.json(await fetchIngestionMetrics(supabase));
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

// HF-356 (RC4/I9) — THE KILL SWITCH. POST { action: 'cancel-job', jobId }. A platform operator cancels a
// runaway async-ingestion job: the job is marked failed with an operator-attributed reason AND its
// retry_count is pushed past the dispatcher's MAX_RETRIES so the cron NEVER requeues or reclaims it (that
// requeue is exactly what would otherwise resurrect a cancelled job). Only an ACTIVE job (pending /
// classifying / committing) is cancellable. A Lambda already mid-execution cannot be force-aborted
// (serverless) — but it can never be re-dispatched, which is what took the DB down. Platform-admin only.
const CANCEL_RETRY_SENTINEL = 99; // >> dispatch-jobs MAX_RETRIES (3) → excluded from the requeue sweep forever.

export async function POST(request: NextRequest) {
  try {
    // Same VL-Admin gate as GET.
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: profiles } = await authClient
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .limit(10);
    if (!profiles?.some(p => p.role === 'platform')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { action?: string; jobId?: string } | null;
    if (body?.action !== 'cancel-job' || !body.jobId) {
      return NextResponse.json({ error: "Expected { action: 'cancel-job', jobId }" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    // Guard on the active status set so a job that already settled is never overwritten — and the cron's
    // requeue (.lt('retry_count', MAX_RETRIES)) and reclaim (status in classifying/committing) both skip it.
    // processing_jobs is not in the generated DB types (the async-worker tables are queried untyped, as in
    // the worker routes) → cast the builder.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('processing_jobs')
      .update({ status: 'failed', error_detail: 'Cancelled by platform operator', retry_count: CANCEL_RETRY_SENTINEL })
      .eq('id', body.jobId)
      .in('status', ['pending', 'classifying', 'committing'])
      .select('id');
    if (error) {
      console.error('[Platform Observatory API] cancel-job failed:', error.message);
      return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
    }
    const cancelled = (data?.length ?? 0) > 0;
    // cancelled=false ⇒ the job already reached a terminal state before the click (nothing to cancel).
    return NextResponse.json({ cancelled });
  } catch (err) {
    console.error('[Platform Observatory API] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════
// Fleet Tab — Shared Data Layer (HF-067)
// ═══════════════════════════════════════════════

// ── MRR lookup by tier ──
const TIER_MRR: Record<string, number> = {
  Inicio: 299, Crecimiento: 999, Profesional: 2999, Empresarial: 7999,
};

/**
 * Per-tenant stats shared between Queue and Fleet.
 * Uses count: 'exact' queries instead of .limit(10000) row fetching.
 */
interface SharedTenantStats {
  entityCounts: Map<string, number>;
  profileCounts: Map<string, number>;
  committedDataCounts: Map<string, number>;
  latestBatchByTenant: Map<string, { lifecycle_state: string; created_at: string }>;
  latestPeriodByTenant: Map<string, { id: string; canonical_key: string; label: string; status: string }>;
  payoutByTenant: Map<string, number>;
  allBatches: Array<{ tenant_id: string; lifecycle_state: string; created_at: string; updated_at: string | null }>;
}

/**
 * Fetch per-tenant counts using exact count queries (no .limit truncation).
 * With ~10 tenants, this runs ~30 lightweight count queries in parallel —
 * far less data than fetching 22K+ entity rows.
 */
async function fetchSharedTenantStats(supabase: ServiceClient, tenantIds: string[]): Promise<SharedTenantStats> {
  // Per-tenant exact counts for large tables (entities, profiles, committed_data)
  const entityCountPromises = tenantIds.map(id =>
    supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', id)
      .then(r => [id, r.count ?? 0] as const)
  );
  const profileCountPromises = tenantIds.map(id =>
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', id)
      .then(r => [id, r.count ?? 0] as const)
  );
  const dataCountPromises = tenantIds.map(id =>
    supabase.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', id)
      .then(r => [id, r.count ?? 0] as const)
  );

  // Detail rows: batches (need lifecycle_state), periods (need label), outcomes (need payout)
  const batchPromise = supabase.from('calculation_batches')
    .select('tenant_id, lifecycle_state, created_at, updated_at')
    .in('tenant_id', tenantIds)
    .order('created_at', { ascending: false });

  const periodPromise = supabase.from('periods')
    .select('id, tenant_id, canonical_key, label, start_date, status')
    .in('tenant_id', tenantIds)
    .order('start_date', { ascending: false });

  const outcomePromise = supabase.from('entity_period_outcomes')
    .select('tenant_id, period_id, total_payout')
    .in('tenant_id', tenantIds);

  // Run ALL queries in parallel
  const [entityResults, profileResults, dataResults, batchRes, periodRes, outcomeRes] = await Promise.all([
    Promise.all(entityCountPromises),
    Promise.all(profileCountPromises),
    Promise.all(dataCountPromises),
    batchPromise,
    periodPromise,
    outcomePromise,
  ]);

  const entityCounts = new Map(entityResults);
  const profileCounts = new Map(profileResults);
  const committedDataCounts = new Map(dataResults);

  const allBatches = (batchRes.data ?? []) as Array<{ tenant_id: string; lifecycle_state: string; created_at: string; updated_at: string | null }>;
  const allPeriods = periodRes.data ?? [];
  const allOutcomes = outcomeRes.data ?? [];

  // Latest batch per tenant (already ordered by created_at desc)
  const latestBatchByTenant = new Map<string, { lifecycle_state: string; created_at: string }>();
  for (const b of allBatches) {
    if (!latestBatchByTenant.has(b.tenant_id)) {
      latestBatchByTenant.set(b.tenant_id, { lifecycle_state: b.lifecycle_state, created_at: b.created_at });
    }
  }

  // Latest period per tenant (already ordered by start_date desc)
  const latestPeriodByTenant = new Map<string, { id: string; canonical_key: string; label: string; status: string }>();
  for (const p of allPeriods) {
    if (!latestPeriodByTenant.has(p.tenant_id)) {
      latestPeriodByTenant.set(p.tenant_id, { id: p.id, canonical_key: p.canonical_key, label: p.label, status: p.status });
    }
  }

  // Sum payout per tenant for their latest period only
  const payoutByTenant = new Map<string, number>();
  for (const o of allOutcomes) {
    const latestPeriod = latestPeriodByTenant.get(o.tenant_id);
    if (latestPeriod && o.period_id === latestPeriod.id) {
      payoutByTenant.set(o.tenant_id, (payoutByTenant.get(o.tenant_id) ?? 0) + (o.total_payout || 0));
    }
  }

  return { entityCounts, profileCounts, committedDataCounts, latestBatchByTenant, latestPeriodByTenant, payoutByTenant, allBatches };
}

async function fetchFleetOverview(
  supabase: ServiceClient,
  tenants: Array<{ id: string; settings: unknown; created_at: string }>,
  stats: SharedTenantStats,
): Promise<FleetOverview> {
  // Global counts (not per-tenant) for overview metrics
  const [entityRes, periodRes, signalsRes, dataRes] = await Promise.all([
    supabase.from('entities').select('*', { count: 'exact', head: true }),
    supabase.from('periods').select('*', { count: 'exact', head: true }).neq('status', 'closed'),
    supabase.from('classification_signals').select('confidence').limit(1000),
    supabase.from('committed_data').select('*', { count: 'exact', head: true }),
  ]);

  const signals = signalsRes.data ?? [];
  const tenantCount = tenants.length;

  // Active tenants: had a calculation in the last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeTenantIds = new Set<string>();
  for (const b of stats.allBatches) {
    if (new Date(b.created_at).getTime() > thirtyDaysAgo) {
      activeTenantIds.add(b.tenant_id);
    }
  }

  // MRR: sum tier prices across all tenants
  let mrr = 0;
  for (const t of tenants) {
    const settings = (t.settings || {}) as Record<string, unknown>;
    const billing = (settings.billing || {}) as Record<string, string>;
    const tier = billing.tier || 'Inicio';
    mrr += TIER_MRR[tier] ?? 299;
  }

  // Lifecycle throughput: batches that reached PAID or PUBLISHED this month
  const thisMonth = new Date();
  const firstOfMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
  let lifecycleThroughput = 0;
  for (const b of stats.allBatches) {
    if (['PAID', 'PUBLISHED'].includes(b.lifecycle_state) && new Date(b.created_at) >= firstOfMonth) {
      lifecycleThroughput++;
    }
  }

  // Avg days in lifecycle: from created_at to updated_at for completed batches
  let totalDays = 0;
  let completedCount = 0;
  for (const b of stats.allBatches) {
    if (['PAID', 'PUBLISHED', 'CLOSED'].includes(b.lifecycle_state) && b.updated_at) {
      const days = (new Date(b.updated_at).getTime() - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24);
      totalDays += days;
      completedCount++;
    }
  }

  // AI confidence average
  let totalConf = 0;
  let confCount = 0;
  for (const s of signals) {
    if (s.confidence != null) { totalConf += s.confidence; confCount++; }
  }

  return {
    tenantCount,
    activeTenantCount: activeTenantIds.size || tenantCount,
    totalEntities: entityRes.count ?? 0,
    totalBatches: stats.allBatches.length,
    activePeriodsCount: periodRes.count ?? 0,
    mrr,
    openAttentionItems: 0, // filled after queue is computed
    lifecycleThroughput,
    avgDaysInLifecycle: completedCount > 0 ? Math.round(totalDays / completedCount) : 0,
    avgAiConfidence: confCount > 0 ? totalConf / confCount : 0,
    totalDataRows: dataRes.count ?? 0,
  };
}

function buildTenantFleetCards(
  tenants: Array<{ id: string; name: string; slug: string; settings: unknown; created_at: string; updated_at: string | null }>,
  stats: SharedTenantStats,
): TenantFleetCard[] {
  return tenants.map(t => {
    const settings = (t.settings || {}) as Record<string, unknown>;
    const latestPeriod = stats.latestPeriodByTenant.get(t.id);
    const latestBatch = stats.latestBatchByTenant.get(t.id);

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      industry: (settings.industry as string) || '',
      country: (settings.country_code as string) || '',
      status: 'active',
      entityCount: stats.entityCounts.get(t.id) ?? 0,
      userCount: stats.profileCounts.get(t.id) ?? 0,
      periodCount: 0,
      latestPeriodLabel: latestPeriod?.label ?? latestPeriod?.canonical_key ?? null,
      latestPeriodStatus: latestPeriod?.status ?? null,
      latestLifecycleState: latestBatch?.lifecycle_state ?? null,
      latestBatchPayout: stats.payoutByTenant.get(t.id) ?? 0,
      lastActivity: latestBatch?.created_at || t.updated_at || t.created_at,
      createdAt: t.created_at,
      dataRowCount: stats.committedDataCounts.get(t.id) ?? 0,
    };
  });
}

function buildOperationsQueue(
  tenants: Array<{ id: string; name: string; created_at: string }>,
  stats: SharedTenantStats,
): OperationsQueueItem[] {
  const items: OperationsQueueItem[] = [];
  const STALL_THRESHOLD = 48 * 60 * 60 * 1000;

  for (const t of tenants) {
    const entityCount = stats.entityCounts.get(t.id) ?? 0;
    const dataRowCount = stats.committedDataCounts.get(t.id) ?? 0;

    // HF-067: Check committed_data count, not just entities.
    // A tenant has data if committed_data rows exist, regardless of entity resolution.
    if (dataRowCount === 0 && entityCount === 0) {
      const daysSinceCreation = Math.floor((Date.now() - new Date(t.created_at).getTime()) / (24 * 60 * 60 * 1000));
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: `No data imported yet (created ${daysSinceCreation}d ago)`,
        severity: daysSinceCreation > 2 ? 'warning' : 'info',
        timestamp: t.created_at,
        // HF-353 honest labels: every queue action does the SAME thing — enter the tenant (lands on
        // /operate via ObservatoryTab.handleSelectTenant). The old varied labels ("Run Calculation",
        // "Resume") implied actions the button does not perform. href is vestigial — the consumer
        // navigates via onClick, not this field (left untouched; out of scope to wire a deep-link).
        action: { label: 'Go to tenant', href: `/select-tenant` },
      });
      continue;
    }

    const latest = stats.latestBatchByTenant.get(t.id);
    if (!latest) {
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: 'Data imported but no calculations run yet',
        severity: 'info',
        timestamp: t.created_at,
        action: { label: 'Go to tenant', href: `/select-tenant` },
      });
      continue;
    }

    const batchAge = Date.now() - new Date(latest.created_at).getTime();
    if (
      batchAge > STALL_THRESHOLD &&
      latest.lifecycle_state !== 'POSTED' &&
      latest.lifecycle_state !== 'CLOSED' &&
      latest.lifecycle_state !== 'PAID' &&
      latest.lifecycle_state !== 'PUBLISHED'
    ) {
      const stalledDays = Math.floor(batchAge / (24 * 60 * 60 * 1000));
      items.push({
        tenantId: t.id,
        tenantName: t.name,
        message: `Lifecycle stalled at ${latest.lifecycle_state} for ${stalledDays}d`,
        severity: stalledDays > 3 ? 'critical' : 'warning',
        timestamp: latest.created_at,
        action: { label: 'Go to tenant', href: `/select-tenant` },
      });
    }
  }

  return items;
}

// ═══════════════════════════════════════════════
// AI Intelligence Tab
// ═══════════════════════════════════════════════

// OB-212 N8a: AI Substrate (read-only). One row per AI surface — the single-call
// surfaces from classification_signals cost:event (purpose x provider x model) and
// the agents from agent_invocations (agent_name x provider x model). No new capture;
// cost:event signals already flow. Surfacing only — no mutation controls anywhere.
type AgentInvRow = { agent_name: string | null; provider: string | null; model: string | null; cost_usd: number | null; cache_hit: boolean | null };
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

async function computeAISubstrate(supabase: ServiceClient): Promise<NonNullable<AIIntelligenceData['aiSubstrate']>> {
  const surfaces: NonNullable<AIIntelligenceData['aiSubstrate']>['surfaces'] = [];

  // single-call surfaces from cost:event (signal_type written as 'cost:event' by toPrefixSignalType)
  const { data: costRows } = await supabase
    .from('classification_signals')
    .select('signal_value')
    .eq('signal_type', 'cost:event')
    .limit(5000);
  const sc = new Map<string, { surface: string; provider: string | null; model: string | null; calls: number; cost: number }>();
  for (const r of costRows ?? []) {
    const v = (r.signal_value ?? {}) as Record<string, unknown>;
    const surface = String(v.purpose ?? 'unknown');
    const provider = (v.provider as string) ?? null;
    const model = (v.model as string) ?? null;
    const key = `${surface}|${provider}|${model}`;
    const cur = sc.get(key) ?? { surface, provider, model, calls: 0, cost: 0 };
    cur.calls++;
    cur.cost += Number(v.estimatedCostUSD) || 0;
    sc.set(key, cur);
  }
  for (const d of Array.from(sc.values())) {
    surfaces.push({ surface: d.surface, kind: 'single_call', provider: d.provider, model: d.model, calls: d.calls, totalCostUSD: round4(d.cost), avgCostUSD: d.calls ? round4(d.cost / d.calls) : 0 });
  }

  // agent surfaces from agent_invocations. The table may not exist yet (HALT-MIG
  // pending) and is not in the generated DB types — relaxed access + guarded so the
  // panel renders the single-call rows now; agent rows populate post-migration/runs.
  try {
    const relaxed = supabase as unknown as { from: (t: string) => { select: (c: string) => { limit: (n: number) => Promise<{ data: AgentInvRow[] | null; error: unknown }> } } };
    const agentRes = await relaxed.from('agent_invocations').select('agent_name, provider, model, cost_usd, cache_hit').limit(5000);
    if (!agentRes.error) {
      const ag = new Map<string, { surface: string; provider: string | null; model: string | null; calls: number; cost: number; cacheHits: number }>();
      for (const r of agentRes.data ?? []) {
        const surface = String(r.agent_name ?? 'unknown');
        const provider = r.provider ?? null;
        const model = r.model ?? null;
        const key = `${surface}|${provider}|${model}`;
        const cur = ag.get(key) ?? { surface, provider, model, calls: 0, cost: 0, cacheHits: 0 };
        cur.calls++;
        cur.cost += Number(r.cost_usd) || 0;
        if (r.cache_hit) cur.cacheHits++;
        ag.set(key, cur);
      }
      for (const d of Array.from(ag.values())) {
        surfaces.push({ surface: d.surface, kind: 'agent', provider: d.provider, model: d.model, calls: d.calls, totalCostUSD: round4(d.cost), avgCostUSD: d.calls ? round4(d.cost / d.calls) : 0, cacheHitRate: d.calls ? d.cacheHits / d.calls : 0 });
      }
    }
  } catch {
    /* agent_invocations not yet applied — agent rows populate post-migration */
  }

  surfaces.sort((a, b) => (a.kind === b.kind ? b.calls - a.calls : a.kind === 'agent' ? -1 : 1));
  return { surfaces };
}

// OB-212 N7: Agent Operations — runtime view of agent_invocations (read-only). Status mix, cost,
// cache-hit rate, per-agent metrics + recent runs. Relaxed/guarded access (table not in generated types).
type AgentOpsRow = {
  agent_name: string | null; invocation_type: string | null; status: string | null;
  turn_count: number | null; latency_ms: number | null; cost_usd: number | null;
  cache_hit: boolean | null; created_at: string | null;
};
async function computeAgentOps(supabase: ServiceClient): Promise<NonNullable<AIIntelligenceData['agentOps']>> {
  const empty: NonNullable<AIIntelligenceData['agentOps']> = { totalRuns: 0, statusCounts: {}, totalCostUSD: 0, cacheHitRate: 0, agents: [], recent: [] };
  try {
    const relaxed = supabase as unknown as {
      from: (t: string) => { select: (c: string) => { order: (col: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: AgentOpsRow[] | null; error: unknown }> } } };
    };
    const res = await relaxed
      .from('agent_invocations')
      .select('agent_name, invocation_type, status, turn_count, latency_ms, cost_usd, cache_hit, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (res.error || !res.data) return empty;
    const rows = res.data;
    const statusCounts: Record<string, number> = {};
    let totalCost = 0;
    let cacheHits = 0;
    const ag = new Map<string, { agentName: string; runs: number; completed: number; failed: number; cached: number; cost: number; latencySum: number; latencyN: number; cacheHits: number; lastRunAt: string | null }>();
    for (const r of rows) {
      const status = String(r.status ?? 'unknown');
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      totalCost += Number(r.cost_usd) || 0;
      if (r.cache_hit) cacheHits++;
      const name = String(r.agent_name ?? 'unknown');
      const cur = ag.get(name) ?? { agentName: name, runs: 0, completed: 0, failed: 0, cached: 0, cost: 0, latencySum: 0, latencyN: 0, cacheHits: 0, lastRunAt: null };
      cur.runs++;
      if (status === 'completed') cur.completed++;
      else if (status === 'failed') cur.failed++;
      else if (status === 'cached') cur.cached++;
      cur.cost += Number(r.cost_usd) || 0;
      if (!r.cache_hit && r.latency_ms != null) { cur.latencySum += Number(r.latency_ms); cur.latencyN++; }
      if (r.cache_hit) cur.cacheHits++;
      if (r.created_at && (!cur.lastRunAt || r.created_at > cur.lastRunAt)) cur.lastRunAt = r.created_at;
      ag.set(name, cur);
    }
    const agents = Array.from(ag.values())
      .map((a) => ({
        agentName: a.agentName, runs: a.runs, completed: a.completed, failed: a.failed, cached: a.cached,
        totalCostUSD: round4(a.cost), avgLatencyMs: a.latencyN ? Math.round(a.latencySum / a.latencyN) : 0,
        cacheHitRate: a.runs ? a.cacheHits / a.runs : 0, lastRunAt: a.lastRunAt,
      }))
      .sort((x, y) => y.runs - x.runs);
    const recent = rows.slice(0, 25).map((r) => ({
      agentName: String(r.agent_name ?? 'unknown'), invocationType: r.invocation_type ?? null,
      status: String(r.status ?? 'unknown'), turnCount: Number(r.turn_count) || 0,
      latencyMs: r.latency_ms ?? null, costUsd: r.cost_usd ?? null, cacheHit: !!r.cache_hit, createdAt: String(r.created_at ?? ''),
    }));
    return { totalRuns: rows.length, statusCounts, totalCostUSD: round4(totalCost), cacheHitRate: rows.length ? cacheHits / rows.length : 0, agents, recent };
  } catch {
    return empty;
  }
}

async function fetchAIIntelligence(supabase: ServiceClient): Promise<AIIntelligenceData> {
  const { data: signals, error } = await supabase
    .from('classification_signals')
    .select('id, tenant_id, signal_type, confidence, signal_value')
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

  // OB-86: Compute enhanced metrics in parallel
  // OB-135: Add SCI-specific metrics (per-tenant, pick first tenant with SCI signals)
  // OB-198 R-2: SCI-originated signals are identified by signal_value.sci_internal_type,
  // preserved at write time by signal-capture-service.ts toPrefixSignalType (OB-197 Phase 2),
  // not by a 'sci:' signal_type prefix (which no longer exists under the prefix vocabulary).
  const sciTenantId = tenantIds.find(tid =>
    safeSignals.some(s => {
      if (s.tenant_id !== tid) return false;
      const sv = s.signal_value as Record<string, unknown> | undefined;
      return typeof sv?.sci_internal_type === 'string';
    })
  ) || tenantIds[0] || '';

  const [accuracy, calibration, flywheel, health, sciAccuracy, sciFlywheel, sciCostCurve, aiSubstrate, agentOps] = await Promise.all([
    computeAccuracyMetrics().catch(() => null),
    computeCalibrationMetrics().catch(() => null),
    computeFlywheelTrend().catch(() => null),
    computeOverallHealth().catch(() => null),
    sciTenantId ? computeSCIAccuracy(sciTenantId).catch(() => null) : Promise.resolve(null),
    sciTenantId ? computeSCIFlywheelTrend(sciTenantId).catch(() => null) : Promise.resolve(null),
    sciTenantId ? computeSCICostCurve(sciTenantId).catch(() => null) : Promise.resolve(null),
    computeAISubstrate(supabase).catch(() => null),
    computeAgentOps(supabase).catch(() => null),
  ]);

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
    // OB-212: AI Substrate (read-only)
    aiSubstrate: aiSubstrate ?? undefined,
    // OB-212 N7: Agent Operations
    agentOps: agentOps ?? null,
    // OB-86: Enhanced metrics
    accuracyByType: accuracy?.byType ?? undefined,
    overallAccuracy: accuracy?.overall ?? undefined,
    calibration: calibration ?? undefined,
    flywheel: flywheel ?? undefined,
    healthSummary: health ? {
      totalSignals: health.totalSignals,
      overallAccuracy: health.overallAccuracy,
      avgConfidence: health.avgConfidence,
      calibrationError: health.calibrationError,
      trendDirection: health.trendDirection,
    } : undefined,
    // OB-135: SCI metrics
    sciAccuracy: sciAccuracy ?? null,
    sciFlywheel: sciFlywheel ?? null,
    sciCostCurve: sciCostCurve ?? null,
    // HF-341 R6: SCI weight-evolution removed — the agent weight registry it analyzed
    // is deleted (classification is expression-derived, not structurally scored).
    sciWeightEvolution: null,
  };
}

// ═══════════════════════════════════════════════
// Billing & Usage Tab
// ═══════════════════════════════════════════════

async function fetchBillingData(supabase: ServiceClient): Promise<{
  tenants: TenantBillingData[];
  recentActivity: RecentBatchActivity[];
  meteringEvents: MeteringEvent[];
}> {
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .order('name');

  const safeTenants = tenants ?? [];
  const tenantIds = safeTenants.map(t => t.id);

  // Bulk fetch all counts + payouts + metering in parallel
  const [allEntities, allPeriods, allBatches, allProfiles, allOutcomes, recentBatchesRes, meteringRes] = await Promise.all([
    supabase.from('entities').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('periods').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('calculation_batches').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('profiles').select('tenant_id').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('entity_period_outcomes').select('tenant_id, total_payout').in('tenant_id', tenantIds.length > 0 ? tenantIds : ['__none__']).limit(10000),
    supabase.from('calculation_batches').select('id, tenant_id, lifecycle_state, entity_count, created_at')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('usage_metering').select('metric_name, metric_value, period_key').limit(10000),
  ]);

  const entityCounts = countByField(allEntities.data ?? [], 'tenant_id');
  const periodCounts = countByField(allPeriods.data ?? [], 'tenant_id');
  const batchCounts = countByField(allBatches.data ?? [], 'tenant_id');
  const profileCounts = countByField(allProfiles.data ?? [], 'tenant_id');

  // Sum payouts per tenant
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

  // Aggregate metering events by metric_name + period_key
  const meterAgg = new Map<string, { totalValue: number; eventCount: number }>();
  for (const m of (meteringRes.data ?? [])) {
    const key = `${m.metric_name}||${m.period_key}`;
    const existing = meterAgg.get(key) ?? { totalValue: 0, eventCount: 0 };
    existing.totalValue += m.metric_value ?? 0;
    existing.eventCount += 1;
    meterAgg.set(key, existing);
  }

  const meteringEvents: MeteringEvent[] = Array.from(meterAgg.entries()).map(([key, agg]) => {
    const [metricName, periodKey] = key.split('||');
    return { metricName, periodKey, totalValue: agg.totalValue, eventCount: agg.eventCount };
  });

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
    meteringEvents,
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
  aiCallsThisPeriod: number;
  aiErrorCount: number;
  meteringConfigured: boolean;
  lastDeployTimestamp: string | null;
}> {
  const [tenantRes, dataRes, outcomeRes, meteringRes] = await Promise.all([
    supabase.from('tenants').select('*', { count: 'exact', head: true }),
    supabase.from('committed_data').select('*', { count: 'exact', head: true }),
    supabase.from('entity_period_outcomes').select('*', { count: 'exact', head: true }),
    supabase.from('usage_metering').select('metric_name, metric_value, period_key, recorded_at')
      .order('recorded_at', { ascending: false }).limit(10000),
  ]);

  const meteringRows = meteringRes.data ?? [];
  const meteringConfigured = meteringRows.length > 0;

  // Count AI inference calls and errors from metering
  let aiCallsThisPeriod = 0;
  let aiErrorCount = 0;
  for (const m of meteringRows) {
    if (m.metric_name === 'ai_inference') aiCallsThisPeriod += (m.metric_value ?? 1);
    if (m.metric_name === 'ai_error') aiErrorCount += (m.metric_value ?? 1);
  }

  // Use latest metering event as proxy for "last deploy" activity
  const lastDeployTimestamp = meteringRows.length > 0 ? meteringRows[0].recorded_at : null;

  return {
    supabaseHealthy: !tenantRes.error,
    tenantCount: tenantRes.count ?? 0,
    committedDataCount: dataRes.count ?? 0,
    totalOutcomes: outcomeRes.count ?? 0,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    aiCallsThisPeriod,
    aiErrorCount,
    meteringConfigured,
    lastDeployTimestamp,
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

  // Count batches per tenant + latest lifecycle
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

// ═══════════════════════════════════════════════
// Ingestion Tab
// ═══════════════════════════════════════════════

async function fetchIngestionMetrics(supabase: ServiceClient): Promise<IngestionMetricsData> {
  // Bulk fetch ingestion events and classification signals in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [eventsRes, signalsRes, tenantsRes, jobsRes] = await Promise.all([
    supabase.from('ingestion_events')
      .select('id, tenant_id, file_name, file_size_bytes, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10000),
    supabase.from('classification_signals')
      .select('id, was_corrected')
      .limit(10000),
    supabase.from('tenants')
      .select('id, name'),
    // HF-356 (RC4/I9): the async-worker queue — the most recent jobs cross-tenant, so the operator sees
    // (and can cancel) a runaway import. Oldest-active-first matters less than recency here; cap at 100.
    // processing_jobs is not in the generated DB types → cast the builder (as the worker routes do).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('processing_jobs')
      .select('id, tenant_id, file_name, status, retry_count, error_detail, created_at, started_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = eventsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signals: any[] = signalsRes.data ?? [];
  const tenantNameMap = new Map((tenantsRes.data ?? []).map(t => [t.id, t.name]));

  // Aggregate totals
  let committedCount = 0;
  let quarantinedCount = 0;
  let rejectedCount = 0;
  let totalBytes = 0;

  // Per-tenant aggregation
  const byTenant: Record<string, {
    totalEvents: number; committed: number; quarantined: number;
    rejected: number; bytes: number;
  }> = {};

  for (const e of events) {
    const tid = e.tenant_id;
    if (!byTenant[tid]) {
      byTenant[tid] = { totalEvents: 0, committed: 0, quarantined: 0, rejected: 0, bytes: 0 };
    }
    byTenant[tid].totalEvents++;
    const size = e.file_size_bytes ?? 0;
    totalBytes += size;
    byTenant[tid].bytes += size;

    if (e.status === 'committed') { committedCount++; byTenant[tid].committed++; }
    else if (e.status === 'quarantined') { quarantinedCount++; byTenant[tid].quarantined++; }
    else if (e.status === 'rejected') { rejectedCount++; byTenant[tid].rejected++; }
  }

  // Classification accuracy: % of signals where AI was NOT corrected
  const totalSignals = signals.length;
  const correctSignals = signals.filter(s => !s.was_corrected).length;
  const classificationAccuracy = totalSignals > 0 ? correctSignals / totalSignals : 0;

  // Validation pass rate: committed / (committed + quarantined)
  const validationTotal = committedCount + quarantinedCount;
  const avgValidationPassRate = validationTotal > 0 ? committedCount / validationTotal : 0;

  // Recent events (last 20)
  const recentEvents = events.slice(0, 20).map(e => ({
    id: e.id,
    tenantId: e.tenant_id,
    tenantName: tenantNameMap.get(e.tenant_id) ?? e.tenant_id,
    fileName: e.file_name ?? null,
    fileSize: e.file_size_bytes ?? null,
    status: e.status,
    createdAt: e.created_at,
  }));

  // HF-356 (RC4/I9): the async-worker queue, newest first, with active jobs flagged for the kill switch.
  const ACTIVE_JOB_STATUSES = ['pending', 'classifying', 'committing'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs: any[] = jobsRes.data ?? [];
  const processingJobs = jobs.map(j => ({
    id: j.id,
    tenantId: j.tenant_id,
    tenantName: tenantNameMap.get(j.tenant_id) ?? j.tenant_id,
    fileName: j.file_name ?? null,
    status: j.status,
    retryCount: j.retry_count ?? 0,
    errorDetail: j.error_detail ?? null,
    createdAt: j.created_at,
    startedAt: j.started_at ?? null,
    isActive: ACTIVE_JOB_STATUSES.includes(j.status),
  }));

  return {
    totalEvents: events.length,
    committedCount,
    quarantinedCount,
    rejectedCount,
    totalBytesIngested: totalBytes,
    avgValidationPassRate,
    classificationAccuracy,
    perTenant: Object.entries(byTenant).map(([tenantId, d]) => ({
      tenantId,
      tenantName: tenantNameMap.get(tenantId) ?? tenantId,
      totalEvents: d.totalEvents,
      committed: d.committed,
      quarantined: d.quarantined,
      rejected: d.rejected,
      bytesIngested: d.bytes,
    })),
    recentEvents,
    processingJobs,
  };
}

// ═══════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════

/** Count rows grouped by a field (typically tenant_id) */
function countByField<T extends Record<string, unknown>>(rows: T[], field: keyof T): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[field]);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}
