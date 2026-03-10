/**
 * Briefing Page Data Loader
 *
 * Fetches calculation results shaped for the Briefing Experience.
 * Standing Rule 26: Zero component-level Supabase calls.
 * All data fetched here, components render props only.
 */

import { createClient } from '@/lib/supabase/client';
import { COMPONENT_PALETTE } from '@/lib/design/tokens';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface BriefingComponent {
  id: string;
  name: string;
  type: string;
  payout: number;
  color: string;
  details: Record<string, unknown>;
}

export interface BriefingEntity {
  entityId: string;
  externalId: string;
  displayName: string;
  totalPayout: number;
  rank: number;
  branch: string;
  level: string;
}

export interface PeriodTrend {
  periodId: string;
  periodLabel: string;
  canonicalKey: string;
  totalPayout: number;
  components: BriefingComponent[];
}

export interface IndividualBriefingData {
  // Hero
  entityId: string;
  externalId: string;
  displayName: string;
  totalPayout: number;
  branch: string;
  level: string;
  role: string;

  // Components for this period
  components: BriefingComponent[];

  // Trend across all periods
  trend: PeriodTrend[];

  // Leaderboard
  rank: number;
  totalEntities: number;
  percentile: number;
  leaderboard: BriefingEntity[];

  // Period metadata
  periodLabel: string;
  periodKey: string;
  planName: string;

  // Averages for benchmark
  avgPayout: number;
  medianPayout: number;
}

export interface ManagerBriefingData {
  managerName: string;
  managerId: string;
  teamTotal: number;
  teamCount: number;
  teamAvg: number;
  teamEntities: BriefingEntity[];
  componentHeatmap: Array<{ entityName: string; entityId: string; components: BriefingComponent[] }>;
  periodLabel: string;
  planName: string;
  trend: PeriodTrend[];
}

export interface AdminBriefingData {
  totalPayout: number;
  entityCount: number;
  avgPayout: number;
  medianPayout: number;
  componentTotals: BriefingComponent[];
  distribution: Array<{ bucket: string; count: number }>;
  topPerformers: BriefingEntity[];
  bottomPerformers: BriefingEntity[];
  periodLabel: string;
  planName: string;
  batchId: string;
  lifecycleState: string;
  trend: PeriodTrend[];
}

// ──────────────────────────────────────────────
// Individual Briefing Loader
// ──────────────────────────────────────────────

export async function loadIndividualBriefing(
  tenantId: string,
  periodId: string,
  ruleSetId: string,
  entityId: string,
): Promise<IndividualBriefingData | null> {
  const supabase = createClient();

  // Round 1: Parallel fetches — batch, entity, rule_set, period, all periods
  const [batchRes, entityRes, ruleSetRes, periodRes, allPeriodsRes] = await Promise.all([
    supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .eq('rule_set_id', ruleSetId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('entities')
      .select('id, external_id, display_name, metadata')
      .eq('id', entityId)
      .single(),
    supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('id', ruleSetId)
      .single(),
    supabase
      .from('periods')
      .select('id, label, canonical_key')
      .eq('id', periodId)
      .single(),
    supabase
      .from('periods')
      .select('id, label, canonical_key, start_date')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: true }),
  ]);

  const batch = batchRes.data;
  if (!batch) return null;

  const entity = entityRes.data;
  if (!entity) return null;

  const ruleSet = ruleSetRes.data;
  const period = periodRes.data;
  const allPeriods = allPeriodsRes.data || [];

  const meta = (entity.metadata ?? {}) as Record<string, unknown>;

  // Build component color map from rule set
  const rawComps = extractComponents(ruleSet?.components);
  const compColorMap = new Map<string, { name: string; type: string; color: string }>();
  rawComps.forEach((c, i) => {
    const id = String(c.id ?? c.name ?? `comp_${i}`);
    compColorMap.set(id, {
      name: String(c.name ?? `Component ${i + 1}`),
      type: String(c.componentType ?? c.component_type ?? ''),
      color: COMPONENT_PALETTE[i % COMPONENT_PALETTE.length],
    });
  });

  // Round 2: All results for this batch + entity's result
  const [allResultsRes, entityResultRes] = await Promise.all([
    supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metadata')
      .eq('tenant_id', tenantId)
      .eq('batch_id', batch.id),
    supabase
      .from('calculation_results')
      .select('total_payout, components, metrics, attainment')
      .eq('tenant_id', tenantId)
      .eq('batch_id', batch.id)
      .eq('entity_id', entityId)
      .maybeSingle(),
  ]);

  const allResults = allResultsRes.data || [];
  const entityResult = entityResultRes.data;

  if (!entityResult) return null;

  // Build leaderboard — sorted by total_payout descending
  const entityIds = allResults.map(r => r.entity_id);
  const entityMap = new Map<string, { externalId: string; displayName: string; branch: string; level: string }>();

  // Batch-fetch entities
  const BATCH_SIZE = 200;
  for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
    const chunk = entityIds.slice(i, i + BATCH_SIZE);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id, display_name, metadata')
      .in('id', chunk);

    for (const e of ents ?? []) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      entityMap.set(e.id, {
        externalId: e.external_id ?? '',
        displayName: e.display_name ?? '',
        branch: String(m.branch ?? ''),
        level: String(m.level ?? ''),
      });
    }
  }

  // Sort by payout for ranking
  const sorted = [...allResults].sort((a, b) => (b.total_payout || 0) - (a.total_payout || 0));
  const rank = sorted.findIndex(r => r.entity_id === entityId) + 1;
  const totalEntities = sorted.length;
  const percentile = totalEntities > 1 ? Math.round(((totalEntities - rank) / (totalEntities - 1)) * 100) : 100;

  // Leaderboard — top 10 + entity if not in top 10
  const leaderboard: BriefingEntity[] = sorted.slice(0, 10).map((r, i) => {
    const ent = entityMap.get(r.entity_id);
    return {
      entityId: r.entity_id,
      externalId: ent?.externalId || '',
      displayName: ent?.displayName || '',
      totalPayout: r.total_payout || 0,
      rank: i + 1,
      branch: ent?.branch || '',
      level: ent?.level || '',
    };
  });

  // If entity not in top 10, add them
  if (rank > 10) {
    const ent = entityMap.get(entityId);
    leaderboard.push({
      entityId,
      externalId: ent?.externalId || entity.external_id || '',
      displayName: ent?.displayName || entity.display_name || '',
      totalPayout: entityResult.total_payout || 0,
      rank,
      branch: ent?.branch || String(meta.branch ?? ''),
      level: ent?.level || String(meta.level ?? ''),
    });
  }

  // Entity's components for this period
  const components = parseComponents(entityResult.components, compColorMap);

  // Averages
  const payouts = sorted.map(r => r.total_payout || 0);
  const avgPayout = payouts.length > 0 ? payouts.reduce((s, v) => s + v, 0) / payouts.length : 0;
  const sortedPayouts = [...payouts].sort((a, b) => a - b);
  const medianPayout = sortedPayouts.length > 0
    ? sortedPayouts.length % 2 === 0
      ? (sortedPayouts[sortedPayouts.length / 2 - 1] + sortedPayouts[sortedPayouts.length / 2]) / 2
      : sortedPayouts[Math.floor(sortedPayouts.length / 2)]
    : 0;

  // Round 3: Trend — fetch entity's results across all periods
  const trend: PeriodTrend[] = [];
  for (const p of allPeriods) {
    const { data: pBatch } = await supabase
      .from('calculation_batches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_id', p.id)
      .eq('rule_set_id', ruleSetId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pBatch) continue;

    const { data: pResult } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .eq('batch_id', pBatch.id)
      .eq('entity_id', entityId)
      .maybeSingle();

    if (pResult) {
      trend.push({
        periodId: p.id,
        periodLabel: p.label,
        canonicalKey: p.canonical_key,
        totalPayout: pResult.total_payout || 0,
        components: parseComponents(pResult.components, compColorMap),
      });
    }
  }

  return {
    entityId,
    externalId: entity.external_id ?? '',
    displayName: entity.display_name ?? '',
    totalPayout: entityResult.total_payout || 0,
    branch: String(meta.branch ?? ''),
    level: String(meta.level ?? ''),
    role: String(meta.role ?? ''),
    components,
    trend,
    rank,
    totalEntities,
    percentile,
    leaderboard,
    periodLabel: period?.label ?? '',
    periodKey: period?.canonical_key ?? '',
    planName: ruleSet?.name ?? 'Plan',
    avgPayout,
    medianPayout,
  };
}

// ──────────────────────────────────────────────
// Manager Briefing Loader
// ──────────────────────────────────────────────

export async function loadManagerBriefing(
  tenantId: string,
  periodId: string,
  ruleSetId: string,
  managerEntityId: string,
): Promise<ManagerBriefingData | null> {
  const supabase = createClient();

  // Get batch, rule set, period, manager entity
  const [batchRes, ruleSetRes, periodRes, managerRes] = await Promise.all([
    supabase
      .from('calculation_batches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .eq('rule_set_id', ruleSetId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('id', ruleSetId)
      .single(),
    supabase
      .from('periods')
      .select('id, label, canonical_key')
      .eq('id', periodId)
      .single(),
    supabase
      .from('entities')
      .select('id, display_name')
      .eq('id', managerEntityId)
      .single(),
  ]);

  const batch = batchRes.data;
  if (!batch) return null;

  const rawComps = extractComponents(ruleSetRes.data?.components);
  const compColorMap = new Map<string, { name: string; type: string; color: string }>();
  rawComps.forEach((c, i) => {
    const id = String(c.id ?? c.name ?? `comp_${i}`);
    compColorMap.set(id, {
      name: String(c.name ?? `Component ${i + 1}`),
      type: String(c.componentType ?? c.component_type ?? ''),
      color: COMPONENT_PALETTE[i % COMPONENT_PALETTE.length],
    });
  });

  // Get team members (entities managed by this manager)
  const { data: relationships } = await supabase
    .from('entity_relationships')
    .select('target_entity_id')
    .eq('tenant_id', tenantId)
    .eq('source_entity_id', managerEntityId)
    .eq('relationship_type', 'manages');

  const teamEntityIds = (relationships || []).map(r => r.target_entity_id);
  if (teamEntityIds.length === 0) return null;

  // Get results for team members
  const { data: teamResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batch.id)
    .in('entity_id', teamEntityIds.slice(0, 200));

  if (!teamResults || teamResults.length === 0) return null;

  // Fetch entity details
  const entityMap = new Map<string, { displayName: string; branch: string; level: string; externalId: string }>();
  for (let i = 0; i < teamEntityIds.length; i += 200) {
    const chunk = teamEntityIds.slice(i, i + 200);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id, display_name, metadata')
      .in('id', chunk);
    for (const e of ents ?? []) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      entityMap.set(e.id, {
        displayName: e.display_name ?? '',
        branch: String(m.branch ?? ''),
        level: String(m.level ?? ''),
        externalId: e.external_id ?? '',
      });
    }
  }

  const sorted = [...teamResults].sort((a, b) => (b.total_payout || 0) - (a.total_payout || 0));
  const teamTotal = sorted.reduce((s, r) => s + (r.total_payout || 0), 0);

  const teamEntities: BriefingEntity[] = sorted.map((r, i) => {
    const ent = entityMap.get(r.entity_id);
    return {
      entityId: r.entity_id,
      externalId: ent?.externalId || '',
      displayName: ent?.displayName || '',
      totalPayout: r.total_payout || 0,
      rank: i + 1,
      branch: ent?.branch || '',
      level: ent?.level || '',
    };
  });

  const componentHeatmap = sorted.map(r => {
    const ent = entityMap.get(r.entity_id);
    return {
      entityName: ent?.displayName || '',
      entityId: r.entity_id,
      components: parseComponents(r.components, compColorMap),
    };
  });

  // Trend across periods
  const { data: allPeriods } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: true });

  const trend: PeriodTrend[] = [];
  for (const p of allPeriods || []) {
    const { data: pBatch } = await supabase
      .from('calculation_batches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_id', p.id)
      .eq('rule_set_id', ruleSetId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pBatch) continue;

    const { data: pResults } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .eq('batch_id', pBatch.id)
      .in('entity_id', teamEntityIds.slice(0, 200));

    if (pResults && pResults.length > 0) {
      const periodTotal = pResults.reduce((s, r) => s + (r.total_payout || 0), 0);
      trend.push({
        periodId: p.id,
        periodLabel: p.label,
        canonicalKey: p.canonical_key,
        totalPayout: periodTotal,
        components: [],
      });
    }
  }

  return {
    managerName: managerRes.data?.display_name ?? '',
    managerId: managerEntityId,
    teamTotal,
    teamCount: teamResults.length,
    teamAvg: teamResults.length > 0 ? teamTotal / teamResults.length : 0,
    teamEntities,
    componentHeatmap,
    periodLabel: periodRes.data?.label ?? '',
    planName: ruleSetRes.data?.name ?? 'Plan',
    trend,
  };
}

// ──────────────────────────────────────────────
// Admin Briefing Loader
// ──────────────────────────────────────────────

export async function loadAdminBriefing(
  tenantId: string,
  periodId: string,
  ruleSetId: string,
): Promise<AdminBriefingData | null> {
  const supabase = createClient();

  const [batchRes, ruleSetRes, periodRes] = await Promise.all([
    supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .eq('rule_set_id', ruleSetId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('id', ruleSetId)
      .single(),
    supabase
      .from('periods')
      .select('id, label, canonical_key')
      .eq('id', periodId)
      .single(),
  ]);

  const batch = batchRes.data;
  if (!batch) return null;

  const rawComps = extractComponents(ruleSetRes.data?.components);
  const compColorMap = new Map<string, { name: string; type: string; color: string }>();
  rawComps.forEach((c, i) => {
    const id = String(c.id ?? c.name ?? `comp_${i}`);
    compColorMap.set(id, {
      name: String(c.name ?? `Component ${i + 1}`),
      type: String(c.componentType ?? c.component_type ?? ''),
      color: COMPONENT_PALETTE[i % COMPONENT_PALETTE.length],
    });
  });

  const { data: allResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, metadata')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batch.id);

  if (!allResults || allResults.length === 0) return null;

  // Entity details
  const entityIds = allResults.map(r => r.entity_id);
  const entityMap = new Map<string, { displayName: string; branch: string; level: string; externalId: string }>();
  for (let i = 0; i < entityIds.length; i += 200) {
    const chunk = entityIds.slice(i, i + 200);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id, display_name, metadata')
      .in('id', chunk);
    for (const e of ents ?? []) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      entityMap.set(e.id, {
        displayName: e.display_name ?? '',
        branch: String(m.branch ?? ''),
        level: String(m.level ?? ''),
        externalId: e.external_id ?? '',
      });
    }
  }

  const sorted = [...allResults].sort((a, b) => (b.total_payout || 0) - (a.total_payout || 0));
  const payouts = sorted.map(r => r.total_payout || 0);
  const totalPayout = payouts.reduce((s, v) => s + v, 0);
  const avgPayout = payouts.length > 0 ? totalPayout / payouts.length : 0;
  const sortedPayouts = [...payouts].sort((a, b) => a - b);
  const medianPayout = sortedPayouts.length > 0
    ? sortedPayouts.length % 2 === 0
      ? (sortedPayouts[sortedPayouts.length / 2 - 1] + sortedPayouts[sortedPayouts.length / 2]) / 2
      : sortedPayouts[Math.floor(sortedPayouts.length / 2)]
    : 0;

  // Component totals
  const compTotalMap = new Map<string, number>();
  for (const r of allResults) {
    const comps = Array.isArray(r.components) ? r.components : [];
    for (const c of comps as Array<Record<string, unknown>>) {
      const id = String(c.componentId ?? c.componentName ?? '');
      compTotalMap.set(id, (compTotalMap.get(id) || 0) + Number(c.payout ?? 0));
    }
  }
  const componentTotals: BriefingComponent[] = Array.from(compTotalMap.entries()).map(([id, total]) => {
    const def = compColorMap.get(id);
    return {
      id,
      name: def?.name || id,
      type: def?.type || '',
      payout: total,
      color: def?.color || COMPONENT_PALETTE[0],
      details: {},
    };
  });

  // Distribution buckets
  const bucketSize = avgPayout > 0 ? Math.ceil(avgPayout / 3) : 100;
  const distribution: Array<{ bucket: string; count: number }> = [];
  const maxBuckets = 8;
  for (let i = 0; i < maxBuckets; i++) {
    const lo = i * bucketSize;
    const hi = (i + 1) * bucketSize;
    const count = payouts.filter(p => p >= lo && p < hi).length;
    if (count > 0 || i < 5) {
      distribution.push({ bucket: `$${lo}-${hi}`, count });
    }
  }

  const toBriefingEntity = (r: typeof sorted[0], rank: number): BriefingEntity => {
    const ent = entityMap.get(r.entity_id);
    return {
      entityId: r.entity_id,
      externalId: ent?.externalId || '',
      displayName: ent?.displayName || '',
      totalPayout: r.total_payout || 0,
      rank,
      branch: ent?.branch || '',
      level: ent?.level || '',
    };
  };

  const topPerformers = sorted.slice(0, 5).map((r, i) => toBriefingEntity(r, i + 1));
  const bottomPerformers = sorted.slice(-5).reverse().map((r, i) => toBriefingEntity(r, sorted.length - 4 + i));

  // Trend
  const { data: allPeriods } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: true });

  const trend: PeriodTrend[] = [];
  for (const p of allPeriods || []) {
    const { data: pBatch } = await supabase
      .from('calculation_batches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_id', p.id)
      .eq('rule_set_id', ruleSetId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pBatch) continue;

    const { data: pResults } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', tenantId)
      .eq('batch_id', pBatch.id);

    if (pResults && pResults.length > 0) {
      const periodTotal = pResults.reduce((s, r) => s + (r.total_payout || 0), 0);
      trend.push({
        periodId: p.id,
        periodLabel: p.label,
        canonicalKey: p.canonical_key,
        totalPayout: periodTotal,
        components: [],
      });
    }
  }

  return {
    totalPayout,
    entityCount: allResults.length,
    avgPayout,
    medianPayout,
    componentTotals,
    distribution,
    topPerformers,
    bottomPerformers,
    periodLabel: periodRes.data?.label ?? '',
    planName: ruleSetRes.data?.name ?? 'Plan',
    batchId: batch.id,
    lifecycleState: batch.lifecycle_state ?? 'DRAFT',
    trend,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function extractComponents(raw: unknown): Array<Record<string, unknown>> {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.components)) return obj.components as Array<Record<string, unknown>>;
  if (Array.isArray(obj.variants)) {
    const variants = obj.variants as Array<Record<string, unknown>>;
    if (variants[0] && Array.isArray(variants[0].components)) {
      return variants[0].components as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function parseComponents(
  raw: unknown,
  colorMap: Map<string, { name: string; type: string; color: string }>,
): BriefingComponent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((c, i) => {
    const id = String(c.componentId ?? c.componentName ?? `comp_${i}`);
    const def = colorMap.get(id);
    return {
      id,
      name: String(c.componentName ?? def?.name ?? id),
      type: String(c.componentType ?? def?.type ?? ''),
      payout: Number(c.payout ?? 0),
      color: def?.color || COMPONENT_PALETTE[i % COMPONENT_PALETTE.length],
      details: (c.details ?? {}) as Record<string, unknown>,
    };
  });
}
