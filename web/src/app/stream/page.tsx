'use client';

/**
 * Intelligence Stream — DS-013 Phase A
 *
 * The platform's primary experience. A single adaptive surface that
 * determines what matters most for THIS user in THIS context at THIS moment.
 *
 * Every rendered element contains all Five Elements:
 *   Value + Context + Comparison + Action + Impact
 *
 * Persona determines content ranking and density:
 *   Admin (indigo): SystemHealth → Bloodwork → Lifecycle → Optimization → Distribution
 *   Manager (amber): TeamHealth → CoachingPriority → Heatmap → Bloodwork
 *   Individual (emerald): Earnings → Allocation → Components → Leaderboard
 *
 * OB-165: Intelligence Stream Foundation
 * OB-170: Five Elements + Action Proximity + State Reader
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePersona } from '@/contexts/persona-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { PERSONA_TOKENS } from '@/lib/design/tokens';
import {
  loadIntelligenceStream,
  type IntelligenceStreamData,
} from '@/lib/data/intelligence-stream-loader';
import { getStateReader, loadTrajectoryData, type TenantContext } from '@/lib/intelligence/state-reader';
import { computePopulationTrajectory, type PopulationTrajectory } from '@/lib/intelligence/trajectory-service';
import { captureStreamSignal, flushPendingStreamSignals } from '@/lib/signals/stream-signals';
import {
  SystemHealthCard,
  LifecycleCard,
  DistributionCard,
  OptimizationCard,
  TeamHealthCard,
  CoachingPriorityCard,
  TeamHeatmapCard,
  BloodworkCard,
  PersonalEarningsCard,
  AllocationCard,
  ComponentBreakdownCard,
  RelativePositionCard,
  ActionRequiredCard,
  PipelineReadinessCard,
  TrajectoryCard,
} from '@/components/intelligence';
import { Loader2, Zap } from 'lucide-react';

// ──────────────────────────────────────────────
// Persona accent border classes
// ──────────────────────────────────────────────
const PERSONA_ACCENT: Record<string, string> = {
  admin: 'border-indigo-500',
  manager: 'border-amber-500',
  rep: 'border-emerald-500',
};

export default function StreamPage() {
  const router = useRouter();
  const { persona, scope, entityId: personaEntityId } = usePersona();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();

  const [data, setData] = useState<IntelligenceStreamData | null>(null);
  const [tenantCtx, setTenantCtx] = useState<TenantContext | null>(null);
  const [trajectoryData, setTrajectoryData] = useState<PopulationTrajectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantId = currentTenant?.id || '';
  const accentColor = PERSONA_ACCENT[persona] || PERSONA_ACCENT.admin;
  const personaToken = PERSONA_TOKENS[persona];

  // Load intelligence stream data
  const loadData = useCallback(async () => {
    if (!tenantId || !currentTenant) return;

    setLoading(true);
    setError(null);

    try {
      // OB-170: Load stream data and tenant context in parallel
      const [result, ctx] = await Promise.all([
        loadIntelligenceStream(
          tenantId,
          currentTenant.name || currentTenant.displayName || '',
          currentTenant.currency || 'USD',
          currentTenant.locale || 'en',
          persona,
          personaEntityId,
          scope.entityIds,
          scope.canSeeAll,
        ),
        getStateReader(tenantId).catch(() => null), // graceful degradation
      ]);
      setData(result);
      setTenantCtx(ctx);

      // OB-172: Load trajectory data if 2+ calculated periods
      if (ctx && ctx.calculatedPeriods.length >= 2) {
        try {
          const trajData = await loadTrajectoryData(tenantId);
          if (trajData.snapshots.length >= 2) {
            const trajectory = computePopulationTrajectory(trajData.snapshots, trajData.entityData);
            setTrajectoryData(trajectory);
          }
        } catch (trajErr) {
          console.warn('[IntelligenceStream] Trajectory load failed (non-blocking):', trajErr);
        }
      }
    } catch (err) {
      console.error('[IntelligenceStream] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load intelligence stream');
    } finally {
      setLoading(false);
    }
  }, [tenantId, currentTenant, persona, personaEntityId, scope.entityIds, scope.canSeeAll]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Signal capture — view event on data load
  const hasEmittedView = useRef(false);
  useEffect(() => {
    if (loading || !data || hasEmittedView.current || !tenantId) return;
    hasEmittedView.current = true;
    captureStreamSignal({
      persona,
      elementId: 'stream_page',
      action: 'view',
      tenantId,
    });
  }, [loading, data, tenantId, persona]);

  // Reset view signal on persona change
  useEffect(() => {
    hasEmittedView.current = false;
  }, [persona]);

  // Flush signals on unmount
  useEffect(() => {
    return () => { flushPendingStreamSignals(); };
  }, []);

  // Signal handler for child cards
  const onCardInteract = useCallback((elementId: string, action: 'click' | 'expand' | 'act') => {
    if (!tenantId) return;
    captureStreamSignal({ persona, elementId, action, tenantId });
  }, [persona, tenantId]);

  // ── Empty / Loading / Error states ──

  if (loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
          <span className="ml-2 text-sm text-zinc-500">Loading intelligence stream...</span>
        </div>
      </div>
    );
  }

  // HF-125: Detect empty data — data object exists but has no meaningful content
  const hasContent = data && (
    data.systemHealth || data.teamHealth || data.personalEarnings ||
    (data.bloodworkItems && data.bloodworkItems.length > 0) ||
    (data.teamHeatmap && data.teamHeatmap.length > 0) ||
    (data.componentBreakdown && data.componentBreakdown.length > 0)
  );

  if (error || !data || !hasContent) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center py-20">
            <Zap className="h-8 w-8 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">No Intelligence Available</h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
              {error || 'No calculation results found. Import data and run a calculation to see your intelligence stream.'}
            </p>
            <button
              onClick={() => router.push('/operate/import')}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Import Data
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Confidence tier badge ──
  const confidenceBadge = data.confidenceTier === 'cold'
    ? { label: 'Cold Start', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' }
    : data.confidenceTier === 'warm'
      ? { label: 'Warm', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' }
      : { label: 'Hot', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
      <div className="max-w-6xl mx-auto px-6 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${personaToken.heroGrad}`}>
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Intelligence</h1>
              <p className="text-sm text-zinc-500">
                {data.currentPeriod?.name || 'No active period'}
                {data.periodCount > 0 && ` \u00b7 ${data.periodCount} period${data.periodCount !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full border ${confidenceBadge.color}`}>
              {confidenceBadge.label}
            </span>
            <span className={`text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full border ${
              persona === 'admin'
                ? 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
                : persona === 'manager'
                  ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                  : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
            }`}>
              {persona === 'admin' ? 'Admin' : persona === 'manager' ? 'Manager' : 'Individual'}
            </span>
          </div>
        </div>

        {/* Intelligence Stream — persona-specific rendering */}
        {persona === 'admin' && (
          <AdminStream data={data} tenantCtx={tenantCtx} trajectoryData={trajectoryData} accentColor={accentColor} formatCurrency={formatCurrency} onInteract={onCardInteract} />
        )}
        {persona === 'manager' && (
          <ManagerStream data={data} accentColor={accentColor} formatCurrency={formatCurrency} onInteract={onCardInteract} />
        )}
        {persona === 'rep' && (
          <IndividualStream data={data} accentColor={accentColor} formatCurrency={formatCurrency} onInteract={onCardInteract} />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Admin Intelligence Stream
// Density: Highest. 2-column grid for secondary cards.
// ──────────────────────────────────────────────

function AdminStream({
  data,
  tenantCtx,
  trajectoryData,
  accentColor,
  formatCurrency,
  onInteract,
}: {
  data: IntelligenceStreamData;
  tenantCtx: TenantContext | null;
  trajectoryData: PopulationTrajectory | null;
  accentColor: string;
  formatCurrency: (n: number) => string;
  onInteract: (elementId: string, action: 'click' | 'expand' | 'act') => void;
}) {
  const router = useRouter();

  // OB-170: Derive reconciliation status from tenant context
  const latestCalc = tenantCtx?.calculatedPeriods?.[tenantCtx.calculatedPeriods.length - 1];
  const reconStatus = latestCalc?.hasReconciliation
    ? latestCalc.reconciliationMatch != null && latestCalc.reconciliationMatch >= 0
      ? `${latestCalc.reconciliationMatch.toFixed(2)}% match against ground truth`
      : 'Reconciliation completed'
    : 'No reconciliation run yet for this period';

  // OB-170: Derive impact text from lifecycle state
  const lifecycleState = data.lifecycle?.currentState;
  const impactText = lifecycleState === 'DRAFT'
    ? 'Advancing to Preview makes results visible for review.'
    : lifecycleState === 'PREVIEW' && !latestCalc?.hasReconciliation
      ? 'Running reconciliation verifies accuracy against external source.'
      : lifecycleState === 'PREVIEW'
        ? 'Advancing to Official freezes results for audit.'
        : lifecycleState === 'OFFICIAL'
          ? 'Submitting for approval starts the review workflow.'
          : undefined;

  return (
    <div className="space-y-4">
      {/* 1. System Health — hero, full width */}
      {data.systemHealth && (
        <SystemHealthCard
          accentColor={accentColor}
          totalPayout={data.systemHealth.totalPayout}
          entityCount={data.systemHealth.entityCount}
          componentCount={data.systemHealth.componentCount}
          exceptionCount={data.systemHealth.exceptionCount}
          priorPeriodTotal={data.systemHealth.priorPeriodTotal}
          nextAction={data.lifecycle?.nextAction ?? null}
          nextLifecycleState={data.lifecycle?.currentState ?? null}
          formatCurrency={formatCurrency}
          onAction={() => {
            onInteract('system_health', 'act');
            if (data.lifecycle?.nextAction?.route) {
              router.push(data.lifecycle.nextAction.route);
            }
          }}
          reconciliationStatus={reconStatus}
          impactText={impactText}
        />
      )}

      {/* OB-170: 2. Action Required — uncalculated periods with data */}
      {tenantCtx && tenantCtx.uncalculatedPeriodsWithData.length > 0 && (
        <ActionRequiredCard
          accentColor={accentColor}
          periods={tenantCtx.uncalculatedPeriodsWithData}
          calculatedPeriodCount={tenantCtx.calculatedPeriods.length}
          latestCalculatedLabel={latestCalc?.label}
          latestCalculatedTotal={latestCalc?.totalPayout}
          formatCurrency={formatCurrency}
          onCalculate={(periodId) => {
            onInteract('action_required', 'act');
            router.push(`/operate/calculate?periodId=${periodId}`);
          }}
        />
      )}

      {/* OB-170: 3. Pipeline Readiness — empty periods needing import */}
      {tenantCtx && tenantCtx.emptyPeriods.length > 0 && (
        <PipelineReadinessCard
          accentColor={accentColor}
          periods={tenantCtx.emptyPeriods}
          periodsWithDataCount={
            tenantCtx.calculatedPeriods.length + tenantCtx.uncalculatedPeriodsWithData.length
          }
          onImport={() => {
            onInteract('pipeline_readiness', 'act');
            router.push('/operate/import');
          }}
        />
      )}

      {/* OB-172: 4. Trajectory Intelligence — 2+ calculated periods */}
      {trajectoryData && trajectoryData.periods.length >= 2 && (
        <TrajectoryCard
          accentColor={accentColor}
          trajectory={trajectoryData}
          formatCurrency={formatCurrency}
          onViewEntities={() => {
            onInteract('trajectory', 'act');
            router.push('/operate/lifecycle');
          }}
        />
      )}

      {/* 5. Bloodwork — only if items exist */}
      {data.bloodworkItems && data.bloodworkItems.length > 0 && (
        <BloodworkCard
          accentColor={accentColor}
          items={data.bloodworkItems}
          onAction={() => onInteract('bloodwork', 'act')}
        />
      )}

      {/* 5. Lifecycle — stepper */}
      {data.lifecycle && (
        <LifecycleCard
          accentColor={accentColor}
          stages={data.lifecycle.stages}
          currentState={data.lifecycle.currentState}
          nextAction={data.lifecycle.nextAction}
          onAction={() => {
            onInteract('lifecycle', 'act');
            if (data.lifecycle?.nextAction?.route) {
              router.push(data.lifecycle.nextAction.route);
            }
          }}
        />
      )}

      {/* 6-7. Two-column grid: Optimization + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.optimizationOpportunities && data.optimizationOpportunities.length > 0 && (
          <OptimizationCard
            accentColor={accentColor}
            opportunities={data.optimizationOpportunities}
            confidenceTier={data.confidenceTier}
            formatCurrency={formatCurrency}
          />
        )}

        {data.distribution && (
          <DistributionCard
            accentColor={accentColor}
            buckets={data.distribution.buckets}
            mean={data.distribution.mean}
            median={data.distribution.median}
            stdDev={data.distribution.stdDev}
            formatCurrency={formatCurrency}
            isFirstPeriod={(tenantCtx?.calculatedPeriods.length ?? 0) <= 1}
            entityCount={data.systemHealth?.entityCount}
            onViewEntities={() => {
              onInteract('distribution', 'act');
              router.push('/operate/lifecycle');
            }}
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Manager Intelligence Stream
// Density: Medium. Single-column with full-width heatmap.
// ──────────────────────────────────────────────

function ManagerStream({
  data,
  accentColor,
  formatCurrency,
  onInteract,
}: {
  data: IntelligenceStreamData;
  accentColor: string;
  formatCurrency: (n: number) => string;
  onInteract: (elementId: string, action: 'click' | 'expand' | 'act') => void;
}) {
  return (
    <div className="space-y-4">
      {/* 1. Team Health — hero */}
      {data.teamHealth && (
        <TeamHealthCard
          accentColor={accentColor}
          teamTotal={data.teamHealth.teamTotal}
          teamSize={data.teamHealth.teamSize}
          onTrack={data.teamHealth.onTrack}
          needsAttention={data.teamHealth.needsAttention}
          exceeding={data.teamHealth.exceeding}
          priorPeriodTeamTotal={data.teamHealth.priorPeriodTeamTotal}
          formatCurrency={formatCurrency}
          onCoachingAction={() => onInteract('team_health', 'act')}
        />
      )}

      {/* 2. Coaching Priority */}
      {data.coachingPriority && (
        <CoachingPriorityCard
          accentColor={accentColor}
          entityName={data.coachingPriority.entityName}
          componentName={data.coachingPriority.componentName}
          currentAttainment={data.coachingPriority.currentAttainment}
          gapToNextTier={data.coachingPriority.gapToNextTier}
          projectedImpact={data.coachingPriority.projectedImpact}
          trend={data.coachingPriority.trend}
          confidenceTier={data.confidenceTier}
          formatCurrency={formatCurrency}
          onViewDetail={() => onInteract('coaching_priority', 'act')}
        />
      )}

      {/* 3. Team Heatmap — full width */}
      {data.teamHeatmap && data.teamHeatmap.length > 0 && (
        <TeamHeatmapCard
          accentColor={accentColor}
          entities={data.teamHeatmap}
          formatCurrency={formatCurrency}
        />
      )}

      {/* 4. Bloodwork — only if items exist */}
      {data.bloodworkItems && data.bloodworkItems.length > 0 && (
        <BloodworkCard
          accentColor={accentColor}
          items={data.bloodworkItems}
          onAction={() => onInteract('bloodwork', 'act')}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Individual Intelligence Stream
// Density: Lowest. Single-column. Hero dominant.
// ──────────────────────────────────────────────

function IndividualStream({
  data,
  accentColor,
  formatCurrency,
  onInteract,
}: {
  data: IntelligenceStreamData;
  accentColor: string;
  formatCurrency: (n: number) => string;
  onInteract: (elementId: string, action: 'click' | 'expand' | 'act') => void;
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      {/* 1. Personal Earnings — hero */}
      {data.personalEarnings && (
        <PersonalEarningsCard
          accentColor={accentColor}
          totalPayout={data.personalEarnings.totalPayout}
          attainmentPct={data.personalEarnings.attainmentPct}
          priorPeriodTotal={data.personalEarnings.priorPeriodTotal}
          currentTier={data.personalEarnings.currentTier}
          nextTier={data.personalEarnings.nextTier}
          gapToNextTier={data.personalEarnings.gapToNextTier}
          gapUnit={data.personalEarnings.gapUnit}
          allocationRecommendation={data.allocationRecommendation?.componentName ?? null}
          projectedIncrease={data.allocationRecommendation?.projectedImpact ?? null}
          formatCurrency={formatCurrency}
          onAllocationAction={() => onInteract('personal_earnings', 'act')}
        />
      )}

      {/* 2. Allocation Recommendation */}
      {data.allocationRecommendation && (
        <AllocationCard
          accentColor={accentColor}
          componentName={data.allocationRecommendation.componentName}
          rationale={data.allocationRecommendation.rationale}
          projectedImpact={data.allocationRecommendation.projectedImpact}
          confidence={data.allocationRecommendation.confidence}
          actionLabel={data.allocationRecommendation.actionLabel}
          formatCurrency={formatCurrency}
          onFocus={() => onInteract('allocation', 'act')}
        />
      )}

      {/* 3. Component Breakdown */}
      {data.componentBreakdown && data.componentBreakdown.length > 0 && (
        <ComponentBreakdownCard
          accentColor={accentColor}
          components={data.componentBreakdown}
          formatCurrency={formatCurrency}
        />
      )}

      {/* 4. Relative Position */}
      {data.relativePosition && (
        <RelativePositionCard
          accentColor={accentColor}
          rank={data.relativePosition.rank}
          totalEntities={data.relativePosition.totalEntities}
          aboveEntities={data.relativePosition.aboveEntities}
          belowEntities={data.relativePosition.belowEntities}
          viewerAmount={data.relativePosition.viewerAmount}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  );
}
