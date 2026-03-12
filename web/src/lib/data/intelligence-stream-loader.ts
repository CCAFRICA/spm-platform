/**
 * Intelligence Stream Data Loader
 *
 * Client-side module that queries Supabase for all data needed by the
 * intelligence stream experience. Supports admin, manager, and rep personas
 * with persona-specific data elements.
 *
 * Standing Rule 26: Zero component-level Supabase calls.
 * All data fetched here, components render props only.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { createClient } from '@/lib/supabase/client';
import { extractAttainment } from '@/lib/data/persona-queries';
import { COMPONENT_PALETTE } from '@/lib/design/tokens';
import { LIFECYCLE_STATES, getNextAction, type DashboardLifecycleState } from '@/lib/lifecycle/lifecycle-service';
import type { Json } from '@/lib/supabase/database.types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface IntelligenceStreamData {
  persona: 'admin' | 'manager' | 'rep';
  tenant: { name: string; currency: string; locale: string };
  currentPeriod: { id: string; name: string; startDate: string; endDate: string; status: string } | null;

  // Admin elements
  systemHealth?: {
    totalPayout: number;
    entityCount: number;
    exceptionCount: number;
    componentCount: number;
    priorPeriodTotal: number | null;
  };
  distribution?: {
    buckets: Array<{ label: string; count: number; min: number; max: number }>;
    mean: number; median: number; stdDev: number;
  };
  lifecycle?: {
    stages: Array<{ label: string; status: 'done' | 'active' | 'pending' }>;
    currentState: string;
    nextAction: { label: string; route: string } | null;
  };
  optimizationOpportunities?: Array<{
    componentName: string;
    description: string;
    entityCount: number;
    costImpact: number;
    actionLabel: string;
    actionRoute: string;
  }>;

  // Manager elements
  teamHealth?: {
    teamTotal: number;
    teamSize: number;
    onTrack: number; needsAttention: number; exceeding: number;
    priorPeriodTeamTotal: number | null;
  };
  coachingPriority?: {
    entityName: string;
    entityId: string;
    componentName: string;
    currentAttainment: number;
    gapToNextTier: number;
    projectedImpact: number;
    trend: number;
    actionLabel: string;
    actionEntityId: string;
  } | null;
  teamHeatmap?: Array<{
    entityName: string;
    entityId: string;
    components: Array<{ name: string; attainment: number; payout: number }>;
    totalPayout: number;
    isHighlight: boolean;
  }>;
  bloodworkItems?: Array<{
    entityName: string;
    entityId: string;
    issue: string;
    severity: 'critical' | 'warning';
    actionLabel: string;
    actionRoute: string;
  }>;

  // Individual elements
  personalEarnings?: {
    entityId: string;
    entityName: string;
    totalPayout: number;
    attainmentPct: number;
    priorPeriodTotal: number | null;
    currentTier: string;
    nextTier: string | null;
    gapToNextTier: number | null;
    gapUnit: string;
  };
  allocationRecommendation?: {
    componentName: string;
    rationale: string;
    projectedImpact: number;
    confidence: 'structural' | 'warm' | 'hot';
    actionLabel: string;
  } | null;
  componentBreakdown?: Array<{
    name: string;
    amount: number;
    pctOfTotal: number;
    color: string;
  }>;
  relativePosition?: {
    rank: number;
    totalEntities: number;
    aboveEntities: Array<{ name: string; amount: number }>;
    belowEntities: Array<{ name: string | null; amount: number }>;
    viewerAmount: number;
  } | null;

  confidenceTier: 'cold' | 'warm' | 'hot';
  periodCount: number;
  signalCaptureEnabled: boolean;
}

// ──────────────────────────────────────────────
// Internal types
// ──────────────────────────────────────────────

interface CalcResult {
  entity_id: string;
  total_payout: number;
  components: Json;
  metrics: Json;
  attainment: Json;
  metadata: Json;
}

interface ComponentDef {
  name: string;
  componentType?: string;
  component_type?: string;
  tiers?: Array<{
    min?: number; max?: number; from?: number; to?: number;
    rate?: number; multiplier?: number;
    label?: string; name?: string;
  }>;
  [key: string]: unknown;
}

interface TierBound {
  min: number;
  max: number;
  rate: number;
  label: string;
}

// ──────────────────────────────────────────────
// Confidence tier helper
// ──────────────────────────────────────────────

/**
 * Determines confidence tier based on number of periods with calculation data.
 *   cold: 0-1 periods (structural recommendations only)
 *   warm: 2-3 periods (trend-aware)
 *   hot:  4+ periods (high-confidence projections)
 */
export function determineConfidenceTier(periodCount: number): 'cold' | 'warm' | 'hot' {
  if (periodCount <= 1) return 'cold';
  if (periodCount <= 3) return 'warm';
  return 'hot';
}

// ──────────────────────────────────────────────
// Main Loader
// ──────────────────────────────────────────────

export async function loadIntelligenceStream(
  tenantId: string,
  tenantName: string,
  currency: string,
  locale: string,
  persona: 'admin' | 'manager' | 'rep',
  entityId: string | null,
  scopeEntityIds: string[],
  canSeeAll: boolean,
): Promise<IntelligenceStreamData> {
  const supabase = createClient();

  // ── Round 1: Period + batch + rule set resolution (parallel) ──

  const [periodsRes, allBatchesRes] = await Promise.all([
    supabase
      .from('periods')
      .select('id, label, start_date, end_date, status')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false }),
    supabase
      .from('calculation_batches')
      .select('id, period_id, rule_set_id, lifecycle_state, superseded_by, created_at')
      .eq('tenant_id', tenantId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false }),
  ]);

  const allPeriods = periodsRes.data ?? [];
  const allBatches = allBatchesRes.data ?? [];

  // Resolve current period: most recent open, fallback to most recent any
  const openPeriod = allPeriods.find(p => p.status === 'open');
  const currentPeriod = openPeriod ?? allPeriods[0] ?? null;

  if (!currentPeriod) {
    return emptyStreamData(persona, tenantName, currency, locale);
  }

  // Find the latest non-superseded batch for this period
  const currentBatch = allBatches.find(b => b.period_id === currentPeriod.id) ?? null;

  if (!currentBatch) {
    return emptyStreamData(persona, tenantName, currency, locale, currentPeriod);
  }

  // Count periods with calculation data for confidence tier
  const periodsWithBatches = new Set(allBatches.map(b => b.period_id));
  const periodCount = periodsWithBatches.size;
  const confidenceTier = determineConfidenceTier(periodCount);

  // ── Round 2: Fetch results + rule set (parallel) ──

  const [resultsRes, ruleSetRes] = await Promise.all([
    supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metrics, attainment, metadata')
      .eq('tenant_id', tenantId)
      .eq('batch_id', currentBatch.id),
    currentBatch.rule_set_id
      ? supabase
          .from('rule_sets')
          .select('id, name, components')
          .eq('id', currentBatch.rule_set_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const allResults: CalcResult[] = (resultsRes.data ?? []).map(r => ({
    entity_id: r.entity_id,
    total_payout: r.total_payout ?? 0,
    components: r.components,
    metrics: r.metrics,
    attainment: r.attainment,
    metadata: r.metadata,
  }));

  const ruleSetComponents = extractComponentDefs(ruleSetRes.data?.components);

  // Base data shape
  const base: IntelligenceStreamData = {
    persona,
    tenant: { name: tenantName, currency, locale },
    currentPeriod: {
      id: currentPeriod.id,
      name: currentPeriod.label ?? '',
      startDate: currentPeriod.start_date ?? '',
      endDate: currentPeriod.end_date ?? '',
      status: currentPeriod.status ?? '',
    },
    confidenceTier,
    periodCount,
    signalCaptureEnabled: confidenceTier !== 'cold',
  };

  // ── Persona-specific data loading ──

  if (persona === 'admin') {
    const adminData = await buildAdminData(
      supabase, tenantId, allResults, ruleSetComponents,
      currentBatch, allPeriods, allBatches,
    );
    Object.assign(base, adminData);
  } else if (persona === 'manager') {
    const managerData = await buildManagerData(
      supabase, tenantId, entityId, scopeEntityIds, canSeeAll,
      allResults, ruleSetComponents, currentPeriod, allPeriods, allBatches,
    );
    Object.assign(base, managerData);
  } else {
    const repData = await buildRepData(
      supabase, tenantId, entityId, canSeeAll,
      allResults, ruleSetComponents, currentPeriod, allPeriods, allBatches,
      confidenceTier,
    );
    Object.assign(base, repData);
  }

  return base;
}

// ──────────────────────────────────────────────
// Admin Data Builder
// ──────────────────────────────────────────────

async function buildAdminData(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  allResults: CalcResult[],
  ruleSetComponents: ComponentDef[],
  currentBatch: { id: string; period_id: string; lifecycle_state: string | null; rule_set_id: string | null },
  allPeriods: Array<{ id: string; start_date: string | null }>,
  allBatches: Array<{ id: string; period_id: string; rule_set_id: string | null }>,
): Promise<Partial<IntelligenceStreamData>> {
  const payouts = allResults.map(r => r.total_payout);
  const totalPayout = sum(payouts);
  const entityCount = allResults.length;

  // Exception count: entities with attainment < 50%
  const exceptionCount = allResults.filter(r => {
    const att = extractAttainment(r.attainment);
    return att > 0 && att < 50;
  }).length;

  // Prior period total
  const priorPeriodTotal = await getPriorPeriodTotal(
    supabase, tenantId, currentBatch.period_id, allPeriods, allBatches, null,
  );

  // Distribution
  const distribution = computeDistribution(payouts);

  // Lifecycle
  const lifecycle = buildLifecycle(currentBatch.lifecycle_state);

  // Optimization opportunities
  const optimizationOpportunities = computeOptimizationOpportunities(
    allResults, ruleSetComponents,
  );

  return {
    systemHealth: {
      totalPayout,
      entityCount,
      exceptionCount,
      componentCount: ruleSetComponents.length,
      priorPeriodTotal,
    },
    distribution,
    lifecycle,
    optimizationOpportunities,
  };
}

// ──────────────────────────────────────────────
// Manager Data Builder
// ──────────────────────────────────────────────

async function buildManagerData(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  entityId: string | null,
  scopeEntityIds: string[],
  canSeeAll: boolean,
  allResults: CalcResult[],
  ruleSetComponents: ComponentDef[],
  currentPeriod: { id: string },
  allPeriods: Array<{ id: string; start_date: string | null }>,
  allBatches: Array<{ id: string; period_id: string; rule_set_id: string | null }>,
): Promise<Partial<IntelligenceStreamData>> {
  let teamEntityIds = [...scopeEntityIds];

  // If no scope provided, resolve via entity_relationships
  if (teamEntityIds.length === 0) {
    let managerId = entityId;

    // For demo/admin override: find first manager entity in tenant
    if (!managerId && canSeeAll) {
      const { data: firstManager } = await supabase
        .from('entity_relationships')
        .select('source_entity_id')
        .eq('tenant_id', tenantId)
        .eq('relationship_type', 'manages')
        .limit(1)
        .maybeSingle();
      managerId = firstManager?.source_entity_id ?? null;
    }

    if (managerId) {
      const { data: rels } = await supabase
        .from('entity_relationships')
        .select('target_entity_id')
        .eq('tenant_id', tenantId)
        .eq('source_entity_id', managerId)
        .eq('relationship_type', 'manages');
      teamEntityIds = (rels ?? []).map(r => r.target_entity_id);
    }

    // Fallback for admin with canSeeAll: use all entities
    if (teamEntityIds.length === 0 && canSeeAll) {
      teamEntityIds = allResults.map(r => r.entity_id);
    }
  }

  if (teamEntityIds.length === 0) {
    return {
      teamHealth: {
        teamTotal: 0, teamSize: 0,
        onTrack: 0, needsAttention: 0, exceeding: 0,
        priorPeriodTeamTotal: null,
      },
      coachingPriority: null,
      teamHeatmap: [],
      bloodworkItems: [],
    };
  }

  const teamEntityIdSet = new Set(teamEntityIds);
  const teamResults = allResults.filter(r => teamEntityIdSet.has(r.entity_id));

  // Fetch entity names in batches
  const entityNameMap = await fetchEntityNames(supabase, teamEntityIds);

  // Team health
  const teamTotal = sum(teamResults.map(r => r.total_payout));
  let onTrack = 0;
  let needsAttention = 0;
  let exceeding = 0;

  for (const r of teamResults) {
    const att = extractAttainment(r.attainment);
    if (att >= 120) exceeding++;
    else if (att >= 80) onTrack++;
    else needsAttention++;
  }

  // Prior period team total
  const priorPeriodTeamTotal = await getPriorPeriodTotal(
    supabase, tenantId, currentPeriod.id, allPeriods, allBatches, teamEntityIds,
  );

  // Coaching priority: entity x component with highest ROI (closest to next tier)
  const coachingPriority = computeCoachingPriority(
    teamResults, ruleSetComponents, entityNameMap,
  );

  // Team heatmap
  const teamHeatmap = buildTeamHeatmap(teamResults, ruleSetComponents, entityNameMap);

  // Bloodwork items
  const bloodworkItems = buildBloodworkItems(
    teamResults, entityNameMap,
  );

  return {
    teamHealth: {
      teamTotal,
      teamSize: teamResults.length,
      onTrack,
      needsAttention,
      exceeding,
      priorPeriodTeamTotal,
    },
    coachingPriority,
    teamHeatmap,
    bloodworkItems: await bloodworkItems,
  };
}

// ──────────────────────────────────────────────
// Rep Data Builder
// ──────────────────────────────────────────────

async function buildRepData(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  entityId: string | null,
  canSeeAll: boolean,
  allResults: CalcResult[],
  ruleSetComponents: ComponentDef[],
  currentPeriod: { id: string },
  allPeriods: Array<{ id: string; start_date: string | null }>,
  allBatches: Array<{ id: string; period_id: string; rule_set_id: string | null }>,
  confidenceTier: 'cold' | 'warm' | 'hot',
): Promise<Partial<IntelligenceStreamData>> {
  let resolvedEntityId = entityId;

  // For admin override: fall back to top-performing entity
  if (!resolvedEntityId && canSeeAll && allResults.length > 0) {
    const sorted = [...allResults].sort((a, b) => b.total_payout - a.total_payout);
    resolvedEntityId = sorted[0].entity_id;
  }

  if (!resolvedEntityId) {
    return {
      personalEarnings: undefined,
      allocationRecommendation: null,
      componentBreakdown: [],
      relativePosition: null,
    };
  }

  const myResult = allResults.find(r => r.entity_id === resolvedEntityId) ?? null;

  if (!myResult) {
    return {
      personalEarnings: undefined,
      allocationRecommendation: null,
      componentBreakdown: [],
      relativePosition: null,
    };
  }

  // Entity name
  const nameMap = await fetchEntityNames(supabase, [resolvedEntityId]);
  const entityName = nameMap.get(resolvedEntityId) ?? resolvedEntityId;

  // Attainment
  const attainmentPct = extractAttainment(myResult.attainment);

  // Tier info from components
  const myComponents = parseResultComponents(myResult.components);
  const { currentTier, nextTier, gapToNextTier, gapUnit } = resolveTierInfo(
    myComponents, ruleSetComponents, attainmentPct,
  );

  // Prior period total for this entity
  const priorPeriodTotal = await getPriorPeriodTotal(
    supabase, tenantId, currentPeriod.id, allPeriods, allBatches, [resolvedEntityId],
  );

  // Component breakdown with colors
  const totalPayout = myResult.total_payout;
  const componentBreakdown: IntelligenceStreamData['componentBreakdown'] = myComponents.map((c, i) => ({
    name: c.name,
    amount: c.payout,
    pctOfTotal: totalPayout > 0 ? (c.payout / totalPayout) * 100 : 0,
    color: COMPONENT_PALETTE[i % COMPONENT_PALETTE.length],
  }));

  // Allocation recommendation: component with narrowest gap to next tier
  const allocationRecommendation = computeAllocationRecommendation(
    myComponents, ruleSetComponents, confidenceTier,
  );

  // Relative position
  const relativePosition = buildRelativePosition(
    allResults, resolvedEntityId, supabase,
  );

  return {
    personalEarnings: {
      entityId: resolvedEntityId,
      entityName,
      totalPayout,
      attainmentPct,
      priorPeriodTotal,
      currentTier,
      nextTier,
      gapToNextTier,
      gapUnit,
    },
    allocationRecommendation,
    componentBreakdown,
    relativePosition: await relativePosition,
  };
}

// ──────────────────────────────────────────────
// Distribution computation
// ──────────────────────────────────────────────

function computeDistribution(payouts: number[]): IntelligenceStreamData['distribution'] {
  if (payouts.length === 0) {
    return { buckets: [], mean: 0, median: 0, stdDev: 0 };
  }

  const sorted = [...payouts].sort((a, b) => a - b);
  const mean = sum(sorted) / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  // Create 6-8 buckets across the payout range
  const minVal = sorted[0];
  const maxVal = sorted[sorted.length - 1];
  const range = maxVal - minVal;

  if (range === 0) {
    return {
      buckets: [{ label: formatBucketLabel(minVal, maxVal), count: sorted.length, min: minVal, max: maxVal }],
      mean, median, stdDev,
    };
  }

  const bucketCount = Math.min(8, Math.max(6, Math.ceil(Math.sqrt(sorted.length))));
  const bucketWidth = range / bucketCount;
  const buckets: Array<{ label: string; count: number; min: number; max: number }> = [];

  for (let i = 0; i < bucketCount; i++) {
    const lo = minVal + i * bucketWidth;
    const hi = i === bucketCount - 1 ? maxVal + 1 : minVal + (i + 1) * bucketWidth;
    const count = sorted.filter(v => v >= lo && (i === bucketCount - 1 ? v <= maxVal : v < hi)).length;
    buckets.push({
      label: formatBucketLabel(lo, hi),
      count,
      min: lo,
      max: hi,
    });
  }

  return { buckets, mean, median, stdDev };
}

function formatBucketLabel(lo: number, hi: number): string {
  const fmtLo = lo >= 1000 ? `${(lo / 1000).toFixed(1)}k` : lo.toFixed(0);
  const fmtHi = hi >= 1000 ? `${(hi / 1000).toFixed(1)}k` : hi.toFixed(0);
  return `${fmtLo}-${fmtHi}`;
}

// ──────────────────────────────────────────────
// Lifecycle builder
// ──────────────────────────────────────────────

function buildLifecycle(lifecycleState: string | null): IntelligenceStreamData['lifecycle'] {
  const currentState = (lifecycleState ?? 'DRAFT') as DashboardLifecycleState;
  const currentIdx = LIFECYCLE_STATES.indexOf(currentState);
  const effectiveIdx = currentIdx >= 0 ? currentIdx : 0;

  const stages = LIFECYCLE_STATES.map((state, i) => ({
    label: state,
    status: (i < effectiveIdx ? 'done' : i === effectiveIdx ? 'active' : 'pending') as 'done' | 'active' | 'pending',
  }));

  const nextActionInfo = getNextAction(currentState);
  const nextAction = nextActionInfo
    ? { label: nextActionInfo.label, route: '/admin/operate' }
    : null;

  return { stages, currentState, nextAction };
}

// ──────────────────────────────────────────────
// Optimization opportunities
// ──────────────────────────────────────────────

function computeOptimizationOpportunities(
  allResults: CalcResult[],
  ruleSetComponents: ComponentDef[],
): IntelligenceStreamData['optimizationOpportunities'] {
  const opportunities: NonNullable<IntelligenceStreamData['optimizationOpportunities']> = [];

  for (const compDef of ruleSetComponents) {
    const tiers = parseTiers(compDef);
    if (tiers.length < 2) continue;

    const compName = compDef.name;

    // For each tier boundary, count entities within 5% below it
    for (let t = 1; t < tiers.length; t++) {
      const boundary = tiers[t].min;
      const lowerRate = tiers[t - 1].rate;
      const upperRate = tiers[t].rate;
      const rateDelta = upperRate - lowerRate;

      if (rateDelta <= 0 || boundary <= 0) continue;

      const threshold = boundary * 0.95;
      let nearBoundaryCount = 0;
      let totalImpact = 0;

      for (const result of allResults) {
        const comps = parseResultComponents(result.components);
        const comp = comps.find(c => c.name === compName);
        if (!comp) continue;

        // Use component attainment to check proximity to boundary
        const compAttainment = comp.attainment ?? extractAttainment(result.attainment);
        if (compAttainment >= threshold && compAttainment < boundary) {
          nearBoundaryCount++;
          // Estimated impact: crossing the tier would apply the rate delta
          totalImpact += comp.payout * (rateDelta / (lowerRate || 1));
        }
      }

      if (nearBoundaryCount > 0) {
        opportunities.push({
          componentName: compName,
          description: `${nearBoundaryCount} entities within 5% of ${tiers[t].label || `Tier ${t + 1}`} threshold`,
          entityCount: nearBoundaryCount,
          costImpact: totalImpact,
          actionLabel: 'Review tier boundaries',
          actionRoute: '/admin/configure/plans',
        });
      }
    }
  }

  return opportunities;
}

// ──────────────────────────────────────────────
// Coaching priority
// ──────────────────────────────────────────────

function computeCoachingPriority(
  teamResults: CalcResult[],
  ruleSetComponents: ComponentDef[],
  entityNameMap: Map<string, string>,
): IntelligenceStreamData['coachingPriority'] {
  let bestCandidate: IntelligenceStreamData['coachingPriority'] = null;
  let bestScore = -Infinity;

  for (const result of teamResults) {
    const comps = parseResultComponents(result.components);
    const entityAtt = extractAttainment(result.attainment);

    for (const comp of comps) {
      const compDef = ruleSetComponents.find(d => d.name === comp.name);
      if (!compDef) continue;

      const tiers = parseTiers(compDef);
      if (tiers.length < 2) continue;

      const compAtt = comp.attainment ?? entityAtt;

      // Find current tier and gap to next
      for (let t = 0; t < tiers.length - 1; t++) {
        if (compAtt >= tiers[t].min && compAtt < tiers[t + 1].min) {
          const gap = tiers[t + 1].min - compAtt;
          const rateDelta = tiers[t + 1].rate - tiers[t].rate;
          const projectedImpact = comp.payout * (rateDelta / (tiers[t].rate || 1));

          // ROI score: higher impact for smaller gap = higher priority
          const score = gap > 0 ? projectedImpact / gap : 0;

          if (score > bestScore) {
            bestScore = score;
            bestCandidate = {
              entityName: entityNameMap.get(result.entity_id) ?? result.entity_id,
              entityId: result.entity_id,
              componentName: comp.name,
              currentAttainment: compAtt,
              gapToNextTier: gap,
              projectedImpact,
              trend: 0, // Would need multi-period data; set to 0 for now
              actionLabel: `Focus on ${comp.name}`,
              actionEntityId: result.entity_id,
            };
          }
          break;
        }
      }
    }
  }

  return bestCandidate;
}

// ──────────────────────────────────────────────
// Team heatmap
// ──────────────────────────────────────────────

function buildTeamHeatmap(
  teamResults: CalcResult[],
  ruleSetComponents: ComponentDef[],
  entityNameMap: Map<string, string>,
): NonNullable<IntelligenceStreamData['teamHeatmap']> {
  const medianPayout = computeMedian(teamResults.map(r => r.total_payout));

  return teamResults.map(result => {
    const comps = parseResultComponents(result.components);
    const entityAtt = extractAttainment(result.attainment);

    const components = ruleSetComponents.map(compDef => {
      const comp = comps.find(c => c.name === compDef.name);
      return {
        name: compDef.name,
        attainment: comp?.attainment ?? entityAtt,
        payout: comp?.payout ?? 0,
      };
    });

    return {
      entityName: entityNameMap.get(result.entity_id) ?? result.entity_id,
      entityId: result.entity_id,
      components,
      totalPayout: result.total_payout,
      isHighlight: result.total_payout >= medianPayout * 1.2 || result.total_payout <= medianPayout * 0.5,
    };
  }).sort((a, b) => b.totalPayout - a.totalPayout);
}

// ──────────────────────────────────────────────
// Bloodwork items
// ──────────────────────────────────────────────

async function buildBloodworkItems(
  teamResults: CalcResult[],
  entityNameMap: Map<string, string>,
): Promise<NonNullable<IntelligenceStreamData['bloodworkItems']>> {
  const items: NonNullable<IntelligenceStreamData['bloodworkItems']> = [];

  for (const result of teamResults) {
    const att = extractAttainment(result.attainment);
    const entityName = entityNameMap.get(result.entity_id) ?? result.entity_id;

    if (att > 0 && att < 50) {
      items.push({
        entityName,
        entityId: result.entity_id,
        issue: `Critically below benchmark at ${att.toFixed(0)}%`,
        severity: 'critical',
        actionLabel: 'Review performance',
        actionRoute: `/admin/perform/entity/${result.entity_id}`,
      });
    } else if (att > 0 && att < 70) {
      items.push({
        entityName,
        entityId: result.entity_id,
        issue: `Below benchmark at ${att.toFixed(0)}%`,
        severity: 'warning',
        actionLabel: 'Schedule coaching',
        actionRoute: `/admin/perform/entity/${result.entity_id}`,
      });
    }
  }

  // Sort: critical first, then warning
  items.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (a.severity !== 'critical' && b.severity === 'critical') return 1;
    return 0;
  });

  return items;
}

// ──────────────────────────────────────────────
// Relative position
// ──────────────────────────────────────────────

async function buildRelativePosition(
  allResults: CalcResult[],
  entityId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<IntelligenceStreamData['relativePosition']> {
  if (allResults.length === 0) return null;

  const sorted = [...allResults].sort((a, b) => b.total_payout - a.total_payout);
  const rank = sorted.findIndex(r => r.entity_id === entityId) + 1;
  if (rank === 0) return null;

  const medianIdx = Math.floor(sorted.length / 2);
  const viewerAmount = sorted[rank - 1].total_payout;

  // Collect entity IDs we need names for (3 above, entity itself)
  const aboveIndices: number[] = [];
  for (let i = Math.max(0, rank - 4); i < rank - 1; i++) {
    aboveIndices.push(i);
  }

  const belowIndices: number[] = [];
  for (let i = rank; i < Math.min(sorted.length, rank + 3); i++) {
    belowIndices.push(i);
  }

  // Fetch names for above entities (they get shown by name)
  const aboveIds = aboveIndices.map(i => sorted[i].entity_id);
  const aboveNameMap = aboveIds.length > 0
    ? await fetchEntityNames(supabase, aboveIds)
    : new Map<string, string>();

  const aboveEntities = aboveIndices.map(i => ({
    name: aboveNameMap.get(sorted[i].entity_id) ?? `#${i + 1}`,
    amount: sorted[i].total_payout,
  }));

  // Below entities: anonymize those below median
  const belowEntities = belowIndices.map(i => ({
    name: i >= medianIdx ? null : `#${i + 1}`,
    amount: sorted[i].total_payout,
  }));

  return {
    rank,
    totalEntities: sorted.length,
    aboveEntities,
    belowEntities,
    viewerAmount,
  };
}

// ──────────────────────────────────────────────
// Tier info resolution
// ──────────────────────────────────────────────

function resolveTierInfo(
  components: Array<{ name: string; payout: number; attainment: number | null }>,
  ruleSetComponents: ComponentDef[],
  overallAttainment: number,
): { currentTier: string; nextTier: string | null; gapToNextTier: number | null; gapUnit: string } {
  // Use the first component with tier data
  for (const comp of components) {
    const compDef = ruleSetComponents.find(d => d.name === comp.name);
    if (!compDef) continue;

    const tiers = parseTiers(compDef);
    if (tiers.length < 2) continue;

    const att = comp.attainment ?? overallAttainment;

    for (let t = 0; t < tiers.length; t++) {
      const isLastTier = t === tiers.length - 1;
      const inTier = isLastTier
        ? att >= tiers[t].min
        : att >= tiers[t].min && att < tiers[t + 1].min;

      if (inTier) {
        return {
          currentTier: tiers[t].label || `Tier ${t + 1}`,
          nextTier: isLastTier ? null : (tiers[t + 1].label || `Tier ${t + 2}`),
          gapToNextTier: isLastTier ? null : tiers[t + 1].min - att,
          gapUnit: '%',
        };
      }
    }
  }

  return { currentTier: 'Base', nextTier: null, gapToNextTier: null, gapUnit: '%' };
}

// ──────────────────────────────────────────────
// Allocation recommendation
// ──────────────────────────────────────────────

function computeAllocationRecommendation(
  components: Array<{ name: string; payout: number; attainment: number | null }>,
  ruleSetComponents: ComponentDef[],
  confidenceTier: 'cold' | 'warm' | 'hot',
): IntelligenceStreamData['allocationRecommendation'] {
  let bestCandidate: IntelligenceStreamData['allocationRecommendation'] = null;
  let smallestGap = Infinity;

  for (const comp of components) {
    const compDef = ruleSetComponents.find(d => d.name === comp.name);
    if (!compDef) continue;

    const tiers = parseTiers(compDef);
    if (tiers.length < 2) continue;

    const att = comp.attainment ?? 0;

    for (let t = 0; t < tiers.length - 1; t++) {
      if (att >= tiers[t].min && att < tiers[t + 1].min) {
        const gap = tiers[t + 1].min - att;
        const rateDelta = tiers[t + 1].rate - tiers[t].rate;
        const projectedImpact = comp.payout * (rateDelta / (tiers[t].rate || 1));

        if (gap < smallestGap && gap > 0) {
          smallestGap = gap;
          const tierLabel = tiers[t + 1].label || `Tier ${t + 2}`;
          bestCandidate = {
            componentName: comp.name,
            rationale: confidenceTier === 'cold'
              ? `Structurally closest to ${tierLabel} threshold (${gap.toFixed(1)}% gap)`
              : `${gap.toFixed(1)}% from ${tierLabel} with projected ${projectedImpact.toFixed(0)} additional payout`,
            projectedImpact,
            confidence: confidenceTier === 'cold' ? 'structural' : confidenceTier,
            actionLabel: `Focus effort on ${comp.name}`,
          };
        }
        break;
      }
    }
  }

  return bestCandidate;
}

// ──────────────────────────────────────────────
// Prior period total
// ──────────────────────────────────────────────

async function getPriorPeriodTotal(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  currentPeriodId: string,
  allPeriods: Array<{ id: string; start_date: string | null }>,
  allBatches: Array<{ id: string; period_id: string; rule_set_id: string | null }>,
  entityFilter: string[] | null,
): Promise<number | null> {
  // Sort periods by start_date descending to find prior period
  const sortedPeriods = [...allPeriods].sort((a, b) => {
    const da = a.start_date ?? '';
    const db = b.start_date ?? '';
    return db.localeCompare(da);
  });

  const currentIdx = sortedPeriods.findIndex(p => p.id === currentPeriodId);
  if (currentIdx < 0 || currentIdx >= sortedPeriods.length - 1) return null;

  const priorPeriod = sortedPeriods[currentIdx + 1];
  const priorBatch = allBatches.find(b => b.period_id === priorPeriod.id);
  if (!priorBatch) return null;

  const query = supabase
    .from('calculation_results')
    .select('entity_id, total_payout')
    .eq('tenant_id', tenantId)
    .eq('batch_id', priorBatch.id);

  if (entityFilter && entityFilter.length > 0) {
    // Batch entity IDs in chunks of 200
    let totalPayout = 0;
    for (let i = 0; i < entityFilter.length; i += 200) {
      const chunk = entityFilter.slice(i, i + 200);
      const { data } = await supabase
        .from('calculation_results')
        .select('total_payout')
        .eq('tenant_id', tenantId)
        .eq('batch_id', priorBatch.id)
        .in('entity_id', chunk);
      totalPayout += sum((data ?? []).map(r => r.total_payout ?? 0));
    }
    return totalPayout;
  }

  // No entity filter — sum all
  const { data } = await query;
  if (!data || data.length === 0) return null;
  return sum(data.map(r => r.total_payout ?? 0));
}

// ──────────────────────────────────────────────
// Component parsing helpers
// ──────────────────────────────────────────────

function extractComponentDefs(raw: unknown): ComponentDef[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ComponentDef[];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.components)) return obj.components as ComponentDef[];
  if (Array.isArray(obj.variants)) {
    const variants = obj.variants as Array<Record<string, unknown>>;
    if (variants[0] && Array.isArray(variants[0].components)) {
      return variants[0].components as ComponentDef[];
    }
  }
  return [];
}

function parseResultComponents(
  components: Json,
): Array<{ name: string; payout: number; attainment: number | null }> {
  if (!components) return [];

  if (Array.isArray(components)) {
    return components.map(c => {
      const comp = c as Record<string, unknown>;
      return {
        name: String(comp.componentName ?? comp.name ?? 'Unknown'),
        payout: Number(comp.payout ?? comp.value ?? comp.outputValue ?? 0),
        attainment: typeof comp.attainment === 'number'
          ? normalizeAttainmentValue(comp.attainment)
          : null,
      };
    });
  }

  if (typeof components === 'object' && components !== null) {
    return Object.entries(components as Record<string, unknown>).map(([name, value]) => ({
      name,
      payout: typeof value === 'number' ? value : 0,
      attainment: null,
    }));
  }

  return [];
}

function normalizeAttainmentValue(val: number): number {
  if (val <= 0) return 0;
  if (val <= 3) return val * 100;
  return val;
}

function parseTiers(compDef: ComponentDef): TierBound[] {
  const rawTiers = compDef.tiers;
  if (!Array.isArray(rawTiers) || rawTiers.length === 0) return [];

  return rawTiers.map(t => ({
    min: Number(t.min ?? t.from ?? 0),
    max: Number(t.max ?? t.to ?? Infinity),
    rate: Number(t.rate ?? t.multiplier ?? 1),
    label: String(t.label ?? t.name ?? ''),
  })).sort((a, b) => a.min - b.min);
}

// ──────────────────────────────────────────────
// Entity name fetcher (batched)
// ──────────────────────────────────────────────

const BATCH_SIZE = 200;

async function fetchEntityNames(
  supabase: ReturnType<typeof createClient>,
  entityIds: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  const uniqueIds = Array.from(new Set(entityIds));

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from('entities')
      .select('id, display_name')
      .in('id', chunk);

    for (const e of data ?? []) {
      nameMap.set(e.id, e.display_name ?? e.id);
    }
  }

  return nameMap;
}

// ──────────────────────────────────────────────
// Math helpers
// ──────────────────────────────────────────────

function sum(values: number[]): number {
  return values.reduce((s, v) => s + (v || 0), 0);
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
}

// ──────────────────────────────────────────────
// Empty data factory
// ──────────────────────────────────────────────

function emptyStreamData(
  persona: 'admin' | 'manager' | 'rep',
  tenantName: string,
  currency: string,
  locale: string,
  period?: { id: string; label: string | null; start_date: string | null; end_date: string | null; status: string | null } | null,
): IntelligenceStreamData {
  return {
    persona,
    tenant: { name: tenantName, currency, locale },
    currentPeriod: period
      ? { id: period.id, name: period.label ?? '', startDate: period.start_date ?? '', endDate: period.end_date ?? '', status: period.status ?? '' }
      : null,
    confidenceTier: 'cold',
    periodCount: 0,
    signalCaptureEnabled: false,
  };
}
