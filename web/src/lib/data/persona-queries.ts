/**
 * Persona-Scoped Data Query Layer
 *
 * Single source of truth for ALL dashboard data queries.
 * Every query is scoped by persona context:
 *   - Admin: sees all entities for the tenant
 *   - Manager: sees only scoped entities (from profile_scope.visible_entity_ids)
 *   - Rep: sees only their own entity
 *
 * Uses EXACT table/column names from Supabase schema (database.types.ts).
 */

import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface AdminDashboardData {
  totalPayout: number;
  entityCount: number;
  attainmentDistribution: number[];
  storeBreakdown: StoreBreakdownItem[];
  lifecycleState: string | null;
  exceptions: ExceptionItem[];
  componentComposition: ComponentItem[];
}

export interface ManagerDashboardData {
  teamTotal: number;
  teamMembers: TeamMemberItem[];
  zoneAverage: number;
  accelerationOpportunities: AccelerationSignal[];
}

export interface RepDashboardData {
  totalPayout: number;
  components: ComponentItem[];
  rank: number;
  totalEntities: number;
  neighbors: NeighborItem[];
  history: { period: string; payout: number }[];
  attainment: number;
}

export interface StoreBreakdownItem {
  entityId: string;
  entityName: string;
  totalPayout: number;
  entityType: string;
}

export interface ExceptionItem {
  entityId: string;
  entityName: string;
  issue: string;
  severity: 'opportunity' | 'watch' | 'critical';
}

export interface ComponentItem {
  name: string;
  value: number;
}

export interface TeamMemberItem {
  entityId: string;
  entityName: string;
  externalId: string | null;
  entityType: string;
  totalPayout: number;
  attainment: number;
  trend: number[];
}

export interface AccelerationSignal {
  entityId: string;
  entityName: string;
  opportunity: string;
  severity: 'opportunity' | 'watch' | 'critical';
  estimatedImpact: number;
  recommendedAction: string;
}

export interface NeighborItem {
  rank: number;
  name: string;
  value: number;
  anonymous: boolean;
}

// ──────────────────────────────────────────────
// Period Resolution
// ──────────────────────────────────────────────

export async function getCurrentPeriodId(tenantId: string): Promise<string | null> {
  const supabase = createClient();

  // First try: most recent open period
  const { data: openPeriod } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('start_date', { ascending: false })
    .limit(1)
    .single();

  if (openPeriod) return openPeriod.id;

  // Fallback: most recent period of any status
  const { data: latestPeriod } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: false })
    .limit(1)
    .single();

  return latestPeriod?.id ?? null;
}

// ──────────────────────────────────────────────
// Admin Queries
// ──────────────────────────────────────────────

export async function getAdminDashboardData(tenantId: string): Promise<AdminDashboardData> {
  const supabase = createClient();
  const periodId = await getCurrentPeriodId(tenantId);

  if (!periodId) {
    return emptyAdminData();
  }

  // Fetch all entity outcomes for this period
  const { data: outcomes } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);

  const safeOutcomes = outcomes ?? [];

  // Fetch entities for names
  const entityIds = safeOutcomes.map(o => o.entity_id);
  const { data: entities } = await supabase
    .from('entities')
    .select('id, display_name, entity_type')
    .in('id', entityIds.length > 0 ? entityIds : ['__none__']);

  const entityMap = new Map((entities ?? []).map(e => [e.id, e]));

  // Lifecycle state from latest calculation batch
  const lifecycleState = await getLifecycleState(tenantId, periodId);

  return {
    totalPayout: sum(safeOutcomes.map(o => o.total_payout)),
    entityCount: safeOutcomes.length,
    attainmentDistribution: safeOutcomes.map(o => extractAttainment(o.attainment_summary)),
    storeBreakdown: safeOutcomes.map(o => ({
      entityId: o.entity_id,
      entityName: entityMap.get(o.entity_id)?.display_name ?? o.entity_id,
      totalPayout: o.total_payout,
      entityType: entityMap.get(o.entity_id)?.entity_type ?? 'individual',
    })),
    lifecycleState,
    exceptions: deriveExceptions(safeOutcomes, entityMap),
    componentComposition: aggregateComponents(safeOutcomes),
  };
}

// ──────────────────────────────────────────────
// Manager Queries
// ──────────────────────────────────────────────

export async function getManagerDashboardData(
  tenantId: string,
  entityIds: string[]
): Promise<ManagerDashboardData> {
  const supabase = createClient();
  const periodId = await getCurrentPeriodId(tenantId);

  if (!periodId || entityIds.length === 0) {
    return emptyManagerData();
  }

  // Fetch outcomes for scoped entities only
  const { data: outcomes } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .in('entity_id', entityIds);

  const safeOutcomes = outcomes ?? [];

  // Fetch entity details
  const { data: entities } = await supabase
    .from('entities')
    .select('id, display_name, external_id, entity_type')
    .in('id', entityIds);

  // Fetch multi-period history for sparklines
  const { data: history } = await supabase
    .from('entity_period_outcomes')
    .select('entity_id, period_id, total_payout, attainment_summary')
    .eq('tenant_id', tenantId)
    .in('entity_id', entityIds)
    .order('materialized_at', { ascending: true });

  const historyByEntity = groupBy(history ?? [], 'entity_id');

  return {
    teamTotal: sum(safeOutcomes.map(o => o.total_payout)),
    teamMembers: (entities ?? []).map(entity => {
      const outcome = safeOutcomes.find(o => o.entity_id === entity.id);
      const entityHistory = historyByEntity[entity.id] ?? [];
      return {
        entityId: entity.id,
        entityName: entity.display_name,
        externalId: entity.external_id,
        entityType: entity.entity_type,
        totalPayout: outcome?.total_payout ?? 0,
        attainment: extractAttainment(outcome?.attainment_summary ?? null),
        trend: entityHistory.map(h => h.total_payout),
      };
    }),
    zoneAverage: average(safeOutcomes.map(o => extractAttainment(o.attainment_summary))),
    accelerationOpportunities: deriveAccelerationSignals(entities ?? [], safeOutcomes, historyByEntity),
  };
}

// ──────────────────────────────────────────────
// Rep Queries
// ──────────────────────────────────────────────

export async function getRepDashboardData(
  tenantId: string,
  entityId: string
): Promise<RepDashboardData> {
  const supabase = createClient();
  const periodId = await getCurrentPeriodId(tenantId);

  if (!periodId) {
    return emptyRepData();
  }

  // Own outcome
  const { data: myOutcome } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .eq('period_id', periodId)
    .single();

  // Detailed component breakdown from calculation_results
  const { data: myResults } = await supabase
    .from('calculation_results')
    .select('components, total_payout, period_id, batch_id')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  // All outcomes for relative ranking
  const { data: allOutcomes } = await supabase
    .from('entity_period_outcomes')
    .select('entity_id, total_payout')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .order('total_payout', { ascending: false });

  const safeAll = allOutcomes ?? [];
  const myRank = safeAll.findIndex(o => o.entity_id === entityId) + 1;
  const neighbors = buildRelativeNeighbors(safeAll, entityId, myRank);

  // Resolve period IDs to human-readable labels
  const resultPeriodIds = Array.from(new Set((myResults ?? []).map(r => r.period_id).filter(Boolean)));
  let periodLabelMap = new Map<string, string>();
  if (resultPeriodIds.length > 0) {
    const { data: periodRows } = await supabase
      .from('periods')
      .select('id, period_key, start_date')
      .in('id', resultPeriodIds as string[]);
    if (periodRows) {
      periodLabelMap = new Map(periodRows.map(p => {
        const label = formatPeriodLabelFromDate(p.start_date);
        return [p.id, label];
      }));
    }
  }

  return {
    totalPayout: myOutcome?.total_payout ?? 0,
    components: parseComponents(myResults?.[0]?.components ?? null),
    rank: myRank || safeAll.length,
    totalEntities: safeAll.length,
    neighbors,
    history: (myResults ?? []).map(r => ({
      period: periodLabelMap.get(r.period_id ?? '') ?? r.period_id ?? '',
      payout: r.total_payout,
    })),
    attainment: extractAttainment(myOutcome?.attainment_summary ?? null),
  };
}

// ──────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────

function formatPeriodLabelFromDate(startDate: string): string {
  try {
    const d = new Date(startDate);
    const month = d.toLocaleString('es-MX', { month: 'short' });
    const year = d.getFullYear();
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
  } catch {
    return startDate;
  }
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + (v || 0), 0);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

function groupBy<T extends Record<string, unknown>>(items: T[], key: string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const k = String(item[key] ?? '');
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}

export function extractAttainment(attainmentSummary: Json | null): number {
  if (!attainmentSummary) return 0;
  if (typeof attainmentSummary === 'number') return attainmentSummary;
  if (typeof attainmentSummary === 'object' && attainmentSummary !== null && !Array.isArray(attainmentSummary)) {
    const obj = attainmentSummary as Record<string, Json | undefined>;
    // Try common keys
    const val = obj.overall ?? obj.attainment ?? obj.pct ?? obj.value;
    if (typeof val === 'number') return val;
  }
  return 0;
}

function parseComponents(components: Json | null): ComponentItem[] {
  if (!components) return [];
  if (!Array.isArray(components)) {
    if (typeof components === 'object' && components !== null) {
      // Handle object format: { componentName: value }
      return Object.entries(components as Record<string, Json | undefined>).map(([name, value]) => ({
        name,
        value: typeof value === 'number' ? value : 0,
      }));
    }
    return [];
  }
  return components.map((c) => {
    const comp = c as Record<string, Json | undefined>;
    return {
      name: String(comp.name ?? comp.componentName ?? 'Unknown'),
      value: typeof comp.value === 'number' ? comp.value : typeof comp.outputValue === 'number' ? comp.outputValue : 0,
    };
  });
}

function aggregateComponents(
  outcomes: Array<{ component_breakdown: Json }>
): ComponentItem[] {
  const totals: Record<string, number> = {};
  for (const outcome of outcomes) {
    const components = parseComponents(outcome.component_breakdown);
    for (const comp of components) {
      totals[comp.name] = (totals[comp.name] ?? 0) + comp.value;
    }
  }
  return Object.entries(totals).map(([name, value]) => ({ name, value }));
}

function buildRelativeNeighbors(
  allOutcomes: Array<{ entity_id: string; total_payout: number }>,
  entityId: string,
  myRank: number
): NeighborItem[] {
  const neighbors: NeighborItem[] = [];

  // 3 above (not anonymized)
  for (let i = Math.max(0, myRank - 4); i < myRank - 1; i++) {
    if (allOutcomes[i]) {
      neighbors.push({
        rank: i + 1,
        name: `#${i + 1}`,
        value: allOutcomes[i].total_payout,
        anonymous: false,
      });
    }
  }

  // Self
  if (myRank > 0 && allOutcomes[myRank - 1]) {
    neighbors.push({
      rank: myRank,
      name: 'You',
      value: allOutcomes[myRank - 1].total_payout,
      anonymous: false,
    });
  }

  // 3 below (anonymized)
  for (let i = myRank; i < Math.min(allOutcomes.length, myRank + 3); i++) {
    if (allOutcomes[i]) {
      neighbors.push({
        rank: i + 1,
        name: '\u00B7 \u00B7 \u00B7',
        value: allOutcomes[i].total_payout,
        anonymous: true,
      });
    }
  }

  return neighbors;
}

async function getLifecycleState(tenantId: string, periodId: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('calculation_batches')
    .select('lifecycle_state')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data?.lifecycle_state ?? null;
}

function deriveExceptions(
  outcomes: Array<{ entity_id: string; total_payout: number; attainment_summary: Json }>,
  entityMap: Map<string, { display_name: string }>
): ExceptionItem[] {
  const exceptions: ExceptionItem[] = [];

  for (const outcome of outcomes) {
    const attainment = extractAttainment(outcome.attainment_summary);
    const name = entityMap.get(outcome.entity_id)?.display_name ?? outcome.entity_id;

    if (attainment < 50) {
      exceptions.push({
        entityId: outcome.entity_id,
        entityName: name,
        issue: `Attainment critically below benchmark at ${attainment.toFixed(0)}%`,
        severity: 'critical',
      });
    } else if (attainment < 70) {
      exceptions.push({
        entityId: outcome.entity_id,
        entityName: name,
        issue: `Attainment below benchmark at ${attainment.toFixed(0)}%`,
        severity: 'watch',
      });
    }
  }

  return exceptions;
}

function deriveAccelerationSignals(
  entities: Array<{ id: string; display_name: string }>,
  outcomes: Array<{ entity_id: string; total_payout: number; attainment_summary: Json }>,
  historyByEntity: Record<string, Array<{ total_payout: number }>>
): AccelerationSignal[] {
  const signals: AccelerationSignal[] = [];

  for (const entity of entities) {
    const outcome = outcomes.find(o => o.entity_id === entity.id);
    const history = historyByEntity[entity.id] ?? [];
    const attainment = extractAttainment(outcome?.attainment_summary ?? null);

    // Near-tier: within 5% of next tier threshold
    if (attainment >= 95 && attainment < 100) {
      signals.push({
        entityId: entity.id,
        entityName: entity.display_name,
        opportunity: `${(100 - attainment).toFixed(1)}% away from target tier`,
        severity: 'opportunity',
        estimatedImpact: (outcome?.total_payout ?? 0) * 0.15,
        recommendedAction: 'Coaching intervention to push past threshold',
      });
    }

    // Declining trend: 3+ periods of declining payout
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const declining = recent.every((h, i) => i === 0 || h.total_payout < recent[i - 1].total_payout);
      if (declining) {
        signals.push({
          entityId: entity.id,
          entityName: entity.display_name,
          opportunity: '3 consecutive periods of declining performance',
          severity: 'watch',
          estimatedImpact: 0,
          recommendedAction: 'Investigate root cause of declining trajectory',
        });
      }
    }

    // Critically below benchmark
    if (attainment < 50 && attainment > 0) {
      signals.push({
        entityId: entity.id,
        entityName: entity.display_name,
        opportunity: `Critically below benchmark at ${attainment.toFixed(0)}%`,
        severity: 'critical',
        estimatedImpact: 0,
        recommendedAction: 'Immediate performance review required',
      });
    }
  }

  return signals;
}

// ──────────────────────────────────────────────
// Empty data shapes
// ──────────────────────────────────────────────

function emptyAdminData(): AdminDashboardData {
  return {
    totalPayout: 0,
    entityCount: 0,
    attainmentDistribution: [],
    storeBreakdown: [],
    lifecycleState: null,
    exceptions: [],
    componentComposition: [],
  };
}

function emptyManagerData(): ManagerDashboardData {
  return {
    teamTotal: 0,
    teamMembers: [],
    zoneAverage: 0,
    accelerationOpportunities: [],
  };
}

function emptyRepData(): RepDashboardData {
  return {
    totalPayout: 0,
    components: [],
    rank: 0,
    totalEntities: 0,
    neighbors: [],
    history: [],
    attainment: 0,
  };
}

// ──────────────────────────────────────────────
// Extended Queries (OB-46B Phase 10)
// ──────────────────────────────────────────────

/**
 * Get peer rankings for leaderboard context.
 * Returns top N entities by total payout for the given period.
 */
export async function getPeerRankings(
  tenantId: string,
  periodId: string,
  limit = 20
): Promise<{ entityId: string; entityName: string; totalPayout: number; rank: number }[]> {
  const supabase = createClient();

  const { data: outcomes } = await supabase
    .from('entity_period_outcomes')
    .select('entity_id, total_payout')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .order('total_payout', { ascending: false })
    .limit(limit);

  if (!outcomes || outcomes.length === 0) return [];

  const entityIds = outcomes.map(o => o.entity_id);
  const { data: entities } = await supabase
    .from('entities')
    .select('id, display_name')
    .in('id', entityIds);

  const nameMap = new Map((entities ?? []).map(e => [e.id, e.display_name]));

  return outcomes.map((o, i) => ({
    entityId: o.entity_id,
    entityName: nameMap.get(o.entity_id) ?? o.entity_id,
    totalPayout: o.total_payout,
    rank: i + 1,
  }));
}

/**
 * Get detailed component breakdown for a specific entity + batch.
 */
export async function getComponentDetail(
  tenantId: string,
  batchId: string,
  entityId: string
): Promise<ComponentItem[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from('calculation_results')
    .select('components')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batchId)
    .eq('entity_id', entityId)
    .limit(1)
    .maybeSingle();

  if (!data) return [];
  return parseComponents(data.components);
}

/**
 * Get plan tier configuration for what-if slider.
 */
export async function getPlanTiers(
  tenantId: string,
  ruleSetId: string
): Promise<{ componentName: string; tiers: { min: number; max: number; rate: number; label: string }[] }[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', tenantId)
    .eq('id', ruleSetId)
    .limit(1)
    .maybeSingle();

  if (!data?.components || !Array.isArray(data.components)) return [];

  return (data.components as Array<Record<string, unknown>>).map(comp => {
    const tiers = Array.isArray(comp.tiers) ? comp.tiers : [];
    return {
      componentName: String(comp.name ?? comp.componentName ?? ''),
      tiers: tiers.map((t: unknown) => {
        const tier = t as Record<string, unknown>;
        return {
          min: Number(tier.min ?? tier.from ?? 0),
          max: Number(tier.max ?? tier.to ?? Infinity),
          rate: Number(tier.rate ?? tier.multiplier ?? 1),
          label: String(tier.label ?? tier.name ?? ''),
        };
      }),
    };
  });
}
