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
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313: Vialuce page-template adoption (else-branch unchanged)
import { usePersona } from '@/contexts/persona-context';
import { loadNetworkPulseData, type NetworkPulseData } from '@/lib/financial/financial-data-service'; // HF-327 O5
import { FinancialStream } from './FinancialStream'; // HF-327 O5
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { PERSONA_TOKENS } from '@/lib/design/tokens';
import {
  loadIntelligenceStream,
  type IntelligenceStreamData,
} from '@/lib/data/intelligence-stream-loader';
import { getStateReader, loadTrajectoryData, type TenantContext } from '@/lib/intelligence/state-reader';
import { InsightNarrative } from '@/components/results/InsightNarrative';
import { buildInsightNarrative, type InsightNarrative as InsightNarrativeData } from '@/lib/results/insight-narrative';
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
  AccelerationCards,
  BloodworkCard,
  PersonalEarningsCard,
  AllocationCard,
  ComponentBreakdownCard,
  RelativePositionCard,
  SelfSimulateCard,
  ActionRequiredCard,
  PipelineReadinessCard,
  TrajectoryCard,
} from '@/components/intelligence';
import {
  CarrierImportHealth,
  CarrierPipelineReadiness,
} from '@/components/stream';
import { useCarrierIntelligence } from '@/lib/hooks/useCarrierIntelligence';
// OB-224: inline drill-through — dead-end numbers gain click-through to entity→component→trace→source.
import { useDrillThrough } from '@/hooks/useDrillThrough';
import { DrillThroughPanel } from '@/components/drill-through';
import type { EntityScope } from '@/lib/drill-through';
import { Loader2, Zap } from 'lucide-react';

// Admin sees the whole tenant; manager/individual panels are scoped to the entities already on-screen.
const ALL_SCOPE: EntityScope = { visibleEntityIds: [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'all' };

// ──────────────────────────────────────────────
// Persona accent border classes
// ──────────────────────────────────────────────
const PERSONA_ACCENT: Record<string, string> = {
  admin: 'border-indigo-500',
  manager: 'border-amber-500',
  rep: 'border-emerald-500',
};

// ──────────────────────────────────────────────
// OB-211 WS-2 / B2: the Insight Agent narrative for /stream.
// Maps the surface's ALREADY-LOADED, persona-shaped stream state into the same
// deterministic builder that leads /operate/results (OB-210 Unit A) — leverage, not
// rebuild. No LLM, no per-entity call (Synaptic scale litmus). Regime classification is
// not loaded on the stream surface, so targetDrivenComponents is 0 here (the builder
// degrades to a component-count note). Anomalies come from bloodworkItems (the stream's
// attention list); a clean state affirms health quietly (Bloodwork tone).
// ──────────────────────────────────────────────
function buildStreamInsight(
  data: IntelligenceStreamData,
  formatCurrency: (n: number) => string,
): InsightNarrativeData | null {
  const bloodwork = data.bloodworkItems ?? [];
  const topAnomaly = bloodwork[0]
    ? { description: bloodwork[0].issue, severity: bloodwork[0].severity }
    : null;

  if (data.persona === 'admin' && data.systemHealth) {
    return buildInsightNarrative({
      persona: 'admin',
      totalPayout: data.systemHealth.totalPayout,
      entityCount: data.systemHealth.entityCount,
      componentCount: data.systemHealth.componentCount,
      anomalyCount: bloodwork.length,
      topAnomaly,
      targetDrivenComponents: 0,
      formatCurrency,
    });
  }
  if (data.persona === 'manager' && data.teamHealth) {
    return buildInsightNarrative({
      persona: 'manager',
      totalPayout: data.teamHealth.teamTotal,
      entityCount: data.teamHealth.teamSize,
      componentCount: data.teamHeatmap?.[0]?.components.length ?? 0,
      anomalyCount: bloodwork.length,
      topAnomaly,
      targetDrivenComponents: 0,
      formatCurrency,
    });
  }
  if (data.persona === 'rep' && data.personalEarnings) {
    return buildInsightNarrative({
      persona: 'rep',
      totalPayout: data.personalEarnings.totalPayout,
      entityCount: 1,
      componentCount: data.componentBreakdown?.length ?? 0,
      anomalyCount: bloodwork.length,
      topAnomaly,
      targetDrivenComponents: 0,
      formatCurrency,
    });
  }
  return null;
}

export default function StreamPage() {
  const router = useRouter();
  const isVialuce = useIsVialuce(); // HF-313: Vialuce page-template adoption (else-branch unchanged)
  const { persona, scope, entityId: personaEntityId } = usePersona();
  const { currentTenant } = useTenant();
  // HF-327 O5: a Financial Agent tenant is detected by the presence of pos_cheque data — the only
  // reliable signal (features.financial is true for ICM tenants too; useFinancialOnly requires
  // ruleSetCount===0 which is false when financial plans are active). loadNetworkPulseData returns
  // null for an ICM tenant (no cheques), so financialPulse?.checksServed>0 ⇒ financial context.
  const [financialPulse, setFinancialPulse] = useState<NetworkPulseData | null>(null);
  const [financialChecked, setFinancialChecked] = useState(false);
  const { format: formatCurrency } = useCurrency();

  const [data, setData] = useState<IntelligenceStreamData | null>(null);
  const [tenantCtx, setTenantCtx] = useState<TenantContext | null>(null);
  const [trajectoryData, setTrajectoryData] = useState<PopulationTrajectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantId = currentTenant?.id || '';
  const accentColor = PERSONA_ACCENT[persona] || PERSONA_ACCENT.admin;
  const personaToken = PERSONA_TOKENS[persona];

  // OB-205 / DS-029 Phase 1: carrier intelligence — reads the substrate carrier
  // (committed_data, entities, …) with no calculation prerequisite. Non-blocking;
  // renders the moment it resolves, in both the no-calculation and calculated views.
  const { carrier, loading: carrierLoading } = useCarrierIntelligence(tenantId);

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

  // HF-327 O5: detect financial context (pos_cheque data) in parallel with the ICM load.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setFinancialChecked(false);
    loadNetworkPulseData(tenantId)
      .then(d => { if (!cancelled) setFinancialPulse(d); })
      .catch(() => { /* ICM tenant — null pulse */ })
      .finally(() => { if (!cancelled) setFinancialChecked(true); });
    return () => { cancelled = true; };
  }, [tenantId]);

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

  // HF-291: carrier cards are ADMIN-ONLY governance surfaces (DS-029 §6 persona
  // matrix). Manager/Rep never see import metrics. Data Health folds entity info in;
  // Next Step renders only while the pipeline is not yet calculated (Bloodwork:
  // passing checks are silent). Placement: supplementary, BELOW the intelligence
  // elements (F-2) — defined here, rendered after the persona streams.
  const isAdmin = persona === 'admin';
  const carrierAdminStack = carrier && isAdmin ? (
    <div className="space-y-4">
      <CarrierImportHealth carrier={carrier} accentColor={accentColor} />
      {!carrier.pipelineReadiness.hasCalculation && (
        <CarrierPipelineReadiness carrier={carrier} accentColor={accentColor} onNavigate={(route) => router.push(route)} />
      )}
    </div>
  ) : null;

  // ── Empty / Loading / Error states ──

  if (loading || !financialChecked) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
          <span className="ml-2 text-sm text-zinc-500">Loading intelligence stream...</span>
        </div>
      </div>
    );
  }

  // HF-327 O5: financial-tenant module context. When pos_cheque data exists (Sabor: 263K cheques),
  // render financial intelligence instead of the ICM pipeline view (Calculate Now / "periods need
  // data" / archived-rule-set "Total payout"), which is irrelevant and misleading. ICM tenants (BCL:
  // 0 cheques → null pulse) never enter this branch — their ICM stream is byte-identical (PG-15).
  if (financialPulse?.networkMetrics && financialPulse.networkMetrics.checksServed > 0) {
    return <FinancialStream pulse={financialPulse} bgClass={personaToken.bg} />;
  }

  // HF-125: Detect empty data — data object exists but has no meaningful content
  const hasContent = data && (
    data.systemHealth || data.teamHealth || data.personalEarnings ||
    (data.bloodworkItems && data.bloodworkItems.length > 0) ||
    (data.teamHeatmap && data.teamHeatmap.length > 0) ||
    (data.componentBreakdown && data.componentBreakdown.length > 0)
  );

  if (error || !data || !hasContent) {
    // OB-206 §7.2: Rep entity-linking guard. A rep whose profile is not linked to an
    // entity (no personaEntityId, not see-all) sees a SINGLE linking message — never a
    // blank stream, never an error. Full Rep intelligence requires DS-027 entity↔user
    // linking (R4); this degrades gracefully until then.
    if (persona === 'rep' && !personaEntityId && !scope.canSeeAll) {
      return (
        <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
          <div className="max-w-3xl mx-auto px-6 py-6 lg:py-8">
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-2 rounded-lg bg-gradient-to-br ${personaToken.heroGrad}`}>
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">Intelligence</h1>
                <p className="text-sm text-zinc-500">Account setup</p>
              </div>
            </div>
            <div className="rounded-lg p-5 bg-zinc-900/50 border border-zinc-800/60 border-l-[3px] border-emerald-500">
              <p className="text-sm text-slate-300">Your entity record is not yet linked. Contact your administrator.</p>
            </div>
          </div>
        </div>
      );
    }

    // OB-205 / DS-029 Phase 1: carrier intelligence is the primary surface when no
    // calculation exists. Wait for the carrier, then render it (the upstream pipeline)
    // instead of the bare "No Intelligence" state. PipelineReadiness renders even with
    // zero data; ImportHealth/EntityLandscape appear once the carrier holds data.
    if (carrierLoading && !carrier) {
      return (
        <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
            <span className="ml-2 text-sm text-zinc-500">Loading intelligence stream...</span>
          </div>
        </div>
      );
    }
    if (carrier) {
      const hasData = carrier.pipelineReadiness.hasData;
      // HF-291 §4.2: persona-scoped no-calculation surface. Admin gets the carrier
      // (governance task). Manager/Rep get a SINGLE waiting message — never import
      // metrics or pipeline state. (R1: static text until persona-scoped carrier
      // queries exist; entity count is tenant-wide, not yet visible-scoped.)
      const waitingCopy = persona === 'manager'
        ? (hasData
            ? `Data imported for ${carrier.entities.total.toLocaleString()} team member${carrier.entities.total !== 1 ? 's' : ''}. Calculation pending — your team performance will appear here once the admin runs the calculation.`
            : 'Your team performance will appear here once data is imported and the calculation runs.')
        : (hasData
            ? 'Your data has been imported. Your statement will appear here once calculation is complete.'
            : 'Your statement will appear here once your data is imported and calculated.');
      const subtitle = isAdmin
        ? (hasData ? `${carrier.dataSnapshot.totalRows.toLocaleString()} rows in the carrier · calculation pending` : 'No data yet — import to begin')
        : 'Calculation pending';
      return (
        <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
          <div className="max-w-6xl mx-auto px-6 py-6 lg:py-8">
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-2 rounded-lg bg-gradient-to-br ${personaToken.heroGrad}`}>
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">Intelligence</h1>
                <p className="text-sm text-zinc-500">{subtitle}</p>
              </div>
            </div>
            {isAdmin ? carrierAdminStack : (
              <div className={`rounded-lg p-5 bg-zinc-900/50 border border-zinc-800/60 border-l-[3px] ${accentColor}`}>
                <p className="text-sm text-slate-300">{waitingCopy}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // OB-175: Show tenant context in empty state — not bare "No Intelligence"
    const hasPlan = !!tenantCtx?.activeRuleSet;
    const hasEntities = (tenantCtx?.entityCount ?? 0) > 0;
    const hasUncalculated = (tenantCtx?.uncalculatedPeriodsWithData?.length ?? 0) > 0;
    const totalPeriods = (tenantCtx?.calculatedPeriods?.length ?? 0)
      + (tenantCtx?.uncalculatedPeriodsWithData?.length ?? 0)
      + (tenantCtx?.emptyPeriods?.length ?? 0);

    // HF-313: Vialuce renders the design-spec .empty state ("never a dead end") inside
    // the .page frame; tenant-context card + action keep the same logic below it.
    if (isVialuce) {
      return (
        <div className="page">
          <div className="empty">
            <div className="ic"><Zap className="h-7 w-7" /></div>
            <b>{error ? 'Intelligence Unavailable' : 'No Intelligence Available'}</b>
            <p>{error || 'Import data and run a calculation to see your intelligence stream.'}</p>
          </div>
          <div className="max-w-sm mx-auto mt-6 space-y-6">
            {tenantCtx && !error && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Plan</span>
                  <span className={hasPlan ? 'text-zinc-200' : 'text-zinc-600'}>
                    {tenantCtx.activeRuleSet?.name || 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Entities</span>
                  <span className={hasEntities ? 'text-zinc-200' : 'text-zinc-600'}>
                    {tenantCtx.entityCount > 0 ? tenantCtx.entityCount.toLocaleString() : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Periods</span>
                  <span className={totalPeriods > 0 ? 'text-zinc-200' : 'text-zinc-600'}>
                    {totalPeriods > 0 ? totalPeriods : 'None'}
                  </span>
                </div>
                {hasUncalculated && (
                  <p className="text-xs text-indigo-400 pt-1">
                    {tenantCtx.uncalculatedPeriodsWithData.length} period{tenantCtx.uncalculatedPeriodsWithData.length !== 1 ? 's' : ''} with data ready to calculate
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              {hasUncalculated ? (
                <button
                  onClick={() => router.push('/operate/calculate')}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
                >
                  Go to Calculate
                  <span aria-hidden="true">&rarr;</span>
                </button>
              ) : (
                <button
                  onClick={() => router.push('/operate/import')}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
                >
                  Import Data
                  <span aria-hidden="true">&rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center py-12">
            <Zap className="h-8 w-8 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">
              {error ? 'Intelligence Unavailable' : 'No Intelligence Available'}
            </h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto mb-8">
              {error || 'Import data and run a calculation to see your intelligence stream.'}
            </p>

            {/* Tenant context — what exists, what's needed */}
            {tenantCtx && !error && (
              <div className="max-w-sm mx-auto mb-8 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Plan</span>
                  <span className={hasPlan ? 'text-zinc-200' : 'text-zinc-600'}>
                    {tenantCtx.activeRuleSet?.name || 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Entities</span>
                  <span className={hasEntities ? 'text-zinc-200' : 'text-zinc-600'}>
                    {tenantCtx.entityCount > 0 ? tenantCtx.entityCount.toLocaleString() : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Periods</span>
                  <span className={totalPeriods > 0 ? 'text-zinc-200' : 'text-zinc-600'}>
                    {totalPeriods > 0 ? totalPeriods : 'None'}
                  </span>
                </div>
                {hasUncalculated && (
                  <p className="text-xs text-indigo-400 pt-1">
                    {tenantCtx.uncalculatedPeriodsWithData.length} period{tenantCtx.uncalculatedPeriodsWithData.length !== 1 ? 's' : ''} with data ready to calculate
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              {hasUncalculated ? (
                <button
                  onClick={() => router.push('/operate/calculate')}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
                >
                  Go to Calculate
                  <span aria-hidden="true">&rarr;</span>
                </button>
              ) : (
                <button
                  onClick={() => router.push('/operate/import')}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
                >
                  Import Data
                  <span aria-hidden="true">&rarr;</span>
                </button>
              )}
            </div>
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

  // OB-211 WS-2 / B2: build the lead Insight narrative from loaded stream state (data is
  // guaranteed non-null past the empty/error guard above). Closes the B4 "AI-front absent
  // on /stream" gap — the narrative becomes the first element, as on /operate/results.
  const streamNarrative = buildStreamInsight(data, formatCurrency);

  // HF-313: Vialuce page badges (confidence + persona) reused as .pactions chips.
  const headerBadges = (
    <>
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
    </>
  );
  const headerSubtitle = `${data.currentPeriod?.name || 'No active period'}${data.periodCount > 0 ? ` · ${data.periodCount} period${data.periodCount !== 1 ? 's' : ''}` : ''}`;

  return (
    <div className={isVialuce ? '' : `min-h-screen bg-gradient-to-br ${personaToken.bg}`}>
      <div className={isVialuce ? 'page' : 'max-w-6xl mx-auto px-6 py-6 lg:py-8'}>
        {/* Header */}
        {isVialuce ? (
          <div className="phead">
            <div>
              <h1>Intelligence</h1>
              <div className="sub">{headerSubtitle}</div>
            </div>
            <div className="pactions">{headerBadges}</div>
          </div>
        ) : (
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
            {headerBadges}
          </div>
        </div>
        )}

        {/* OB-211 WS-2 / B2: the Insight Agent narrative LEADS the surface (AI front-and-center,
            DS-013 — the narrative is the first element). Bloodwork-toned via the shared component. */}
        {streamNarrative && (
          <div className={isVialuce ? 'insight mb-4' : 'mb-4'}>
            <InsightNarrative narrative={streamNarrative} />
          </div>
        )}

        {/* Intelligence Stream — persona-specific rendering */}
        {persona === 'admin' && (
          <AdminStream data={data} tenantCtx={tenantCtx} trajectoryData={trajectoryData} accentColor={accentColor} formatCurrency={formatCurrency} onInteract={onCardInteract} tenantId={currentTenant?.id ?? ''} periodId={data.currentPeriod?.id} />
        )}
        {persona === 'manager' && (
          <ManagerStream data={data} accentColor={accentColor} formatCurrency={formatCurrency} onInteract={onCardInteract} tenantId={currentTenant?.id ?? ''} periodId={data.currentPeriod?.id} />
        )}
        {persona === 'rep' && (
          <IndividualStream data={data} accentColor={accentColor} formatCurrency={formatCurrency} onInteract={onCardInteract} />
        )}

        {/* HF-291 F-2: carrier cards are supplementary context for Admin — rendered
            BELOW the intelligence elements, not above. Manager/Rep never see them. */}
        {carrierAdminStack && <div className="mt-4">{carrierAdminStack}</div>}
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
  tenantId,
  periodId,
}: {
  data: IntelligenceStreamData;
  tenantCtx: TenantContext | null;
  trajectoryData: PopulationTrajectory | null;
  accentColor: string;
  formatCurrency: (n: number) => string;
  onInteract: (elementId: string, action: 'click' | 'expand' | 'act') => void;
  tenantId: string;
  periodId?: string;
}) {
  const router = useRouter();
  const isVialuce = useIsVialuce();
  // OB-224: Distribution "view entities" now opens the five-layer drill inline (was a dead route push).
  const drill = useDrillThrough<{ entityId?: string }>(periodId);

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
            onSimulate={() => onInteract('optimization_simulate', 'act')}
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
              onInteract('distribution', 'expand');
              if (!tenantId || !periodId) router.push('/operate/lifecycle');
              else if (drill.isOpen) drill.close();
              else drill.open({});
            }}
          />
        )}
      </div>

      {/* OB-224: inline five-layer drill (entity → component → trace → source) for this period. */}
      {drill.isOpen && tenantId && periodId && (
        <StreamDrillRegion isVialuce={isVialuce} onClose={drill.close}>
          <DrillThroughPanel tenantId={tenantId} scope={ALL_SCOPE} periodId={periodId} initialEntityId={drill.target?.entityId} showExport />
        </StreamDrillRegion>
      )}
    </div>
  );
}

// OB-224: a small theme-aware wrapper that frames an inline drill panel with a "Hide" control.
function StreamDrillRegion({ isVialuce, onClose, children }: { isVialuce: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p style={isVialuce ? { fontFamily: 'var(--vl-font-mono)', fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: 0 } : undefined} className={isVialuce ? undefined : 'text-[10px] uppercase tracking-wider text-zinc-500'}>Entity detail</p>
        <button onClick={onClose} className={isVialuce ? 'gbtn' : 'text-xs text-zinc-500 hover:text-zinc-300'}>Hide</button>
      </div>
      {children}
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
  tenantId,
  periodId,
}: {
  data: IntelligenceStreamData;
  accentColor: string;
  formatCurrency: (n: number) => string;
  onInteract: (elementId: string, action: 'click' | 'expand' | 'act') => void;
  tenantId: string;
  periodId?: string;
}) {
  const isVialuce = useIsVialuce();
  // OB-224: clicking a team member opens their five-layer drill inline. The panel grid is scoped to
  // exactly the team entities already on this page — no over-disclosure of the rest of the tenant.
  const drill = useDrillThrough<{ entityId?: string }>(periodId);
  const teamScope: EntityScope = {
    visibleEntityIds: (data.teamHeatmap ?? []).map(e => e.entityId),
    visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'graph_derived',
  };
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

      {/* OB-206 §6.2: Acceleration Cards — actionable team triage above the grid. */}
      {data.teamHeatmap && data.teamHeatmap.length > 0 && (
        <AccelerationCards
          entities={data.teamHeatmap}
          triage={data.teamHealth ? { exceeding: data.teamHealth.exceeding, onTrack: data.teamHealth.onTrack, needsAttention: data.teamHealth.needsAttention } : undefined}
          formatCurrency={formatCurrency}
          onEntityClick={(entityId) => { onInteract('acceleration', 'expand'); if (tenantId && periodId) drill.open({ entityId }); }}
        />
      )}

      {/* OB-206 §6.1: entity × component coaching grid (real per-component payout,
          sorted by coaching priority — replaces the all-dashes flat grid). */}
      {data.teamHeatmap && data.teamHeatmap.length > 0 && (
        <TeamHeatmapCard
          accentColor={accentColor}
          entities={data.teamHeatmap}
          formatCurrency={formatCurrency}
          onEntityClick={(entityId) => { onInteract('team_heatmap', 'expand'); if (tenantId && periodId) drill.open({ entityId }); }}
        />
      )}

      {/* OB-224: inline five-layer drill for the clicked team member (scoped to the team set). */}
      {drill.isOpen && tenantId && periodId && (
        <StreamDrillRegion isVialuce={isVialuce} onClose={drill.close}>
          <DrillThroughPanel tenantId={tenantId} scope={teamScope} periodId={periodId} initialEntityId={drill.target?.entityId} compact />
        </StreamDrillRegion>
      )}

      {/* OB-211 WS-2 inc-2: access-scoped Simulate — opportunities over the manager's TEAM only.
          Recognize/Coach over the near-boundary team set; the slider never includes other teams. */}
      {data.optimizationOpportunities && data.optimizationOpportunities.length > 0 && (
        <OptimizationCard
          accentColor={accentColor}
          opportunities={data.optimizationOpportunities}
          confidenceTier={data.confidenceTier}
          formatCurrency={formatCurrency}
          onSimulate={() => onInteract('optimization_simulate', 'act')}
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

      {/* HF-293 FIX-2: the rep's OWN simulate affordance — UNCONDITIONAL on tiered components,
          independent of near-boundary populations (the population OptimizationCard, a "population
          of one" for a rep, almost never rendered). Self-scoped (loader scopes to [myResult]),
          dollar-anchored (#515 sf). HALT-REP-TIERS: renders nothing if no tiered component. */}
      {data.selfSimulations && data.selfSimulations.length > 0 && (
        <SelfSimulateCard
          accentColor={accentColor}
          simulations={data.selfSimulations}
          formatCurrency={formatCurrency}
          onView={() => onInteract('self_simulate', 'act')}
        />
      )}
    </div>
  );
}
