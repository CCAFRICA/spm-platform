'use client';

/**
 * OB-234 T2-1 — Intelligence · Stream (/stream). The canonical Intelligence landing (DS-015).
 *
 * BRANCH STRUCTURE (preserved per the T2 contract — do NOT collapse):
 *   (a) Financial-tenant branch — FinancialStream via loadNetworkPulseData / pos_cheque (Sabor). KEPT.
 *   (b) No-calculation carrier onboarding — useCarrierIntelligence / CarrierImportHealth /
 *       CarrierPipelineReadiness, plus the rep entity-linking guard + tenant-context empty state. KEPT.
 *   (c) Drill-through — useDrillThrough + DrillThroughPanel (inline five-layer entity drill). KEPT.
 *   (d) Loading / error states. KEPT.
 *
 * REDESIGNED: the ICM (calculated, non-financial) stream render. It no longer reads the legacy
 * intelligence-stream-loader for its NUMBERS — it reads End-State A clean functions
 * (getCalculatedPeriods / getPeriodTotal / getBatchValidity / getEntityResults / getPopulationTrend /
 * getComponentTotals + recallDensity for learning) and composes DS-003 components on the persona theme.
 * The legacy loader is still used only as the BRANCH ROUTER (financial vs carrier vs calculated) and
 * for the InsightNarrative lead. Money via useCurrency().format. Thermostat honesty (directive §0.4):
 * navigation/lifecycle links are real; AI plan-health / simulate affordances are honest StubActions.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowRight, Loader2, TrendingUp, Zap } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313 (preserved branches use it)
import { usePersona } from '@/contexts/persona-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { PERSONA_TOKENS } from '@/lib/design/tokens';

// PRESERVED branch sources
import { loadNetworkPulseData, type NetworkPulseData } from '@/lib/financial/financial-data-service';
import { FinancialStream } from './FinancialStream';
import {
  loadIntelligenceStream,
  type IntelligenceStreamData,
} from '@/lib/data/intelligence-stream-loader';
import { getStateReader, type TenantContext } from '@/lib/intelligence/state-reader';
import { InsightNarrative } from '@/components/results/InsightNarrative';
import { buildInsightNarrative, type InsightNarrative as InsightNarrativeData } from '@/lib/results/insight-narrative';
import { captureStreamSignal, flushPendingStreamSignals } from '@/lib/signals/stream-signals';
import { CarrierImportHealth, CarrierPipelineReadiness } from '@/components/stream';
import { useCarrierIntelligence } from '@/lib/hooks/useCarrierIntelligence';
import { useDrillThrough } from '@/hooks/useDrillThrough';
import { DrillThroughPanel } from '@/components/drill-through';
import type { EntityScope } from '@/lib/drill-through';

// REDESIGN — End-State A clean data layer (the only calc-data reads on the ICM render)
import {
  getCalculatedPeriods,
  getPeriodTotal,
  getBatchValidity,
  getComponentTotals,
  getPopulationTrend,
  ALL_INSIGHTS_SCOPE,
  type PeriodSummary,
  type ComponentTotal,
  type PopulationTrendPoint,
  type ValidityVerdict as Verdict,
} from '@/lib/insights';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { recallDensity } from '@/lib/learning/density-recall';

// REDESIGN — persona theme + DS-003 vocabulary
import { PeriodCards } from '@/components/insights';
import {
  PersonaAmbient,
  DensityGate,
  useDensityAllows,
  usePersonaTheme,
  HeroMetric,
  GaugeMetric,
  SparkTrend,
  Sparkline,
  DistributionPosition,
  PrioritySortedList,
  ConfigurablePipeline,
  StubAction,
  Panel,
  ValidityVerdict,
  IntelligenceElement,
  TEXT,
  type PriorityItem,
  type PipelineStage,
} from '@/components/insights/ds003';

// Admin sees the whole tenant; manager/individual drill panels are scoped to on-screen entities.
const ALL_SCOPE: EntityScope = { visibleEntityIds: [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'all' };

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// OB-211 WS-2 / B2: the lead Insight narrative for /stream (preserved — same deterministic builder
// that leads /operate/results). No LLM, no per-entity call.
// ──────────────────────────────────────────────────────────────────────────────────────────────────
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
  const isVialuce = useIsVialuce();
  const { persona, scope, entityId: personaEntityId } = usePersona();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const theme = usePersonaTheme();

  // HF-327 O5: financial detection (pos_cheque) — null pulse ⇒ ICM tenant.
  const [financialPulse, setFinancialPulse] = useState<NetworkPulseData | null>(null);
  const [financialChecked, setFinancialChecked] = useState(false);

  // Legacy loader as BRANCH ROUTER + InsightNarrative lead (NOT the ICM numbers anymore).
  const [data, setData] = useState<IntelligenceStreamData | null>(null);
  const [tenantCtx, setTenantCtx] = useState<TenantContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantId = currentTenant?.id || '';
  const personaToken = PERSONA_TOKENS[persona];
  const accentColor = persona === 'admin' ? 'border-indigo-500' : persona === 'manager' ? 'border-amber-500' : 'border-emerald-500';

  // OB-205 / DS-029 Phase 1: carrier intelligence (no calculation prerequisite).
  const { carrier, loading: carrierLoading } = useCarrierIntelligence(tenantId);

  // ── Branch router load (legacy loader + state reader) ──
  const loadData = useCallback(async () => {
    if (!tenantId || !currentTenant) return;
    setLoading(true);
    setError(null);
    try {
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
        getStateReader(tenantId).catch(() => null),
      ]);
      setData(result);
      setTenantCtx(ctx);
    } catch (err) {
      console.error('[IntelligenceStream] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load intelligence stream');
    } finally {
      setLoading(false);
    }
  }, [tenantId, currentTenant, persona, personaEntityId, scope.entityIds, scope.canSeeAll]);

  useEffect(() => { loadData(); }, [loadData]);

  // HF-327 O5: detect financial context in parallel.
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

  // Signal capture — view event on data load.
  const hasEmittedView = useRef(false);
  useEffect(() => {
    if (loading || !data || hasEmittedView.current || !tenantId) return;
    hasEmittedView.current = true;
    captureStreamSignal({ persona, elementId: 'stream_page', action: 'view', tenantId });
  }, [loading, data, tenantId, persona]);
  useEffect(() => { hasEmittedView.current = false; }, [persona]);
  useEffect(() => () => { flushPendingStreamSignals(); }, []);

  // ── HF-291: carrier admin stack (governance surface, Admin-only). ──
  const isAdmin = persona === 'admin';
  const carrierAdminStack = carrier && isAdmin ? (
    <div className="space-y-4">
      <CarrierImportHealth carrier={carrier} accentColor={accentColor} />
      {!carrier.pipelineReadiness.hasCalculation && (
        <CarrierPipelineReadiness carrier={carrier} accentColor={accentColor} onNavigate={(route) => router.push(route)} />
      )}
    </div>
  ) : null;

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // PRESERVED BRANCHES — loading / financial / rep-link / carrier / empty
  // ════════════════════════════════════════════════════════════════════════════════════════════════

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

  // (a) Financial-tenant module context (pos_cheque data exists). PRESERVED.
  if (financialPulse?.networkMetrics && financialPulse.networkMetrics.checksServed > 0) {
    return <FinancialStream pulse={financialPulse} bgClass={personaToken.bg} />;
  }

  // HF-125: empty-content detection (drives the no-calculation branch).
  const hasContent = data && (
    data.systemHealth || data.teamHealth || data.personalEarnings ||
    (data.bloodworkItems && data.bloodworkItems.length > 0) ||
    (data.teamHeatmap && data.teamHeatmap.length > 0) ||
    (data.componentBreakdown && data.componentBreakdown.length > 0)
  );

  // (b) No-calculation / error / carrier onboarding. PRESERVED.
  if (error || !data || !hasContent) {
    // OB-206 §7.2: rep entity-linking guard.
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

    // OB-205 / DS-029 Phase 1: carrier intelligence is the primary no-calculation surface.
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

    // OB-175: tenant-context empty state.
    const hasPlan = !!tenantCtx?.activeRuleSet;
    const hasEntities = (tenantCtx?.entityCount ?? 0) > 0;
    const hasUncalculated = (tenantCtx?.uncalculatedPeriodsWithData?.length ?? 0) > 0;
    const totalPeriods = (tenantCtx?.calculatedPeriods?.length ?? 0)
      + (tenantCtx?.uncalculatedPeriodsWithData?.length ?? 0)
      + (tenantCtx?.emptyPeriods?.length ?? 0);

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
                  <span className={hasPlan ? 'text-zinc-200' : 'text-zinc-600'}>{tenantCtx.activeRuleSet?.name || 'None'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Entities</span>
                  <span className={hasEntities ? 'text-zinc-200' : 'text-zinc-600'}>{tenantCtx.entityCount > 0 ? tenantCtx.entityCount.toLocaleString() : 'None'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Periods</span>
                  <span className={totalPeriods > 0 ? 'text-zinc-200' : 'text-zinc-600'}>{totalPeriods > 0 ? totalPeriods : 'None'}</span>
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
                <button onClick={() => router.push('/operate/calculate')} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">
                  Go to Calculate <span aria-hidden="true">&rarr;</span>
                </button>
              ) : (
                <button onClick={() => router.push('/operate/import')} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">
                  Import Data <span aria-hidden="true">&rarr;</span>
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
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">{error ? 'Intelligence Unavailable' : 'No Intelligence Available'}</h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto mb-8">{error || 'Import data and run a calculation to see your intelligence stream.'}</p>
            {tenantCtx && !error && (
              <div className="max-w-sm mx-auto mb-8 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Plan</span>
                  <span className={hasPlan ? 'text-zinc-200' : 'text-zinc-600'}>{tenantCtx.activeRuleSet?.name || 'None'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Entities</span>
                  <span className={hasEntities ? 'text-zinc-200' : 'text-zinc-600'}>{tenantCtx.entityCount > 0 ? tenantCtx.entityCount.toLocaleString() : 'None'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Periods</span>
                  <span className={totalPeriods > 0 ? 'text-zinc-200' : 'text-zinc-600'}>{totalPeriods > 0 ? totalPeriods : 'None'}</span>
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
                <button onClick={() => router.push('/operate/calculate')} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">
                  Go to Calculate <span aria-hidden="true">&rarr;</span>
                </button>
              ) : (
                <button onClick={() => router.push('/operate/import')} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors">
                  Import Data <span aria-hidden="true">&rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // (d) ICM CALCULATED STREAM — REDESIGNED on the End-State A data layer + DS-003 (PersonaAmbient).
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  const streamNarrative = buildStreamInsight(data, formatCurrency);
  return (
    <IcmStream
      tenantId={tenantId}
      streamNarrative={streamNarrative}
      carrierAdminStack={carrierAdminStack}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// ICM stream — clean read-path. Hooks live here so they only run on the calculated branch (after the
// preserved early returns), avoiding conditional-hook violations in the router component.
// ──────────────────────────────────────────────────────────────────────────────────────────────────
function IcmStream({
  tenantId,
  streamNarrative,
  carrierAdminStack,
}: {
  tenantId: string;
  streamNarrative: InsightNarrativeData | null;
  carrierAdminStack: ReactNode;
}) {
  const { format } = useCurrency();
  const theme = usePersonaTheme();
  const isVialuce = useIsVialuce();
  const showHigh = useDensityAllows('high');
  const isAdmin = theme.persona === 'admin';

  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [periodsLoaded, setPeriodsLoaded] = useState(false);

  const [periodTotal, setPeriodTotal] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [rows, setRows] = useState<EntityResult[]>([]);
  const [priorRows, setPriorRows] = useState<EntityResult[]>([]);
  const [componentTotals, setComponentTotals] = useState<ComponentTotal[]>([]);
  const [trend, setTrend] = useState<PopulationTrendPoint[]>([]);
  const [componentSeries, setComponentSeries] = useState<{ name: string; points: number[] }[]>([]);
  const [learnedPct, setLearnedPct] = useState<number | null>(null);
  const [learnCold, setLearnCold] = useState(false);
  const [learnStats, setLearnStats] = useState<{ learned: number; cold: number; total: number } | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);

  // OB-224 (preserved): inline five-layer drill (entity → component → trace → source) for the period.
  const drill = useDrillThrough<{ entityId?: string }>(selectedPeriodId || undefined);

  // ── Periods (canonical getCalculatedPeriods, start_date DESC) + population trend. ──
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    Promise.all([getCalculatedPeriods(tenantId), getPopulationTrend(tenantId)])
      .then(([ps, tr]) => {
        if (cancelled) return;
        setPeriods(ps);
        setSelectedPeriodId(ps[0]?.period_id ?? '');
        setTrend(tr);
        setPeriodsLoaded(true);
        if (ps.length === 0) setPeriodLoading(false);
      })
      .catch((err) => { console.warn('[Stream] periods load failed:', err); setPeriodsLoaded(true); setPeriodLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  // ── Component trajectories across ALL calculated periods (Admin depth). ──
  useEffect(() => {
    if (!tenantId || !showHigh || periods.length < 2) { setComponentSeries([]); return; }
    let cancelled = false;
    const asc = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    Promise.all(asc.map((p) => getComponentTotals(tenantId, p.period_id).catch(() => [] as ComponentTotal[])))
      .then((perPeriod) => {
        if (cancelled) return;
        // union of component names, one series of per-period totals each (most recent period's top first)
        const names = new Set<string>();
        perPeriod.forEach((cts) => cts.forEach((c) => names.add(c.component_name)));
        const series = Array.from(names).map((name) => ({
          name,
          points: perPeriod.map((cts) => cts.find((c) => c.component_name === name)?.total_amount ?? 0),
        }));
        // rank by latest-period magnitude, keep the most material few
        series.sort((a, b) => (b.points[b.points.length - 1] || 0) - (a.points[a.points.length - 1] || 0));
        setComponentSeries(series.slice(0, 6));
      })
      .catch(() => { if (!cancelled) setComponentSeries([]); });
    return () => { cancelled = true; };
  }, [tenantId, showHigh, periods]);

  // ── Learning confidence (Admin only). ──
  useEffect(() => {
    if (!tenantId || !isAdmin) return;
    let cancelled = false;
    recallDensity(tenantId)
      .then((dr) => {
        if (cancelled) return;
        const sigs = Array.from(dr.density.keys());
        const dist = dr.modeDistribution(sigs);
        const total = sigs.length;
        const learned = dist.silent;
        const cold = dist.full_trace;
        setLearnedPct(total > 0 ? (learned / total) * 100 : 0);
        setLearnCold(dr.coldStart);
        setLearnStats({ learned, cold, total });
      })
      .catch(() => { if (!cancelled) { setLearnCold(true); setLearnedPct(0); setLearnStats({ learned: 0, cold: 0, total: 0 }); } });
    return () => { cancelled = true; };
  }, [tenantId, isAdmin]);

  // ── Selected period: total, validity, entities (current + prior), component totals. ──
  useEffect(() => {
    if (!tenantId || !selectedPeriodId) return;
    let cancelled = false;
    setPeriodLoading(true);
    const idx = periods.findIndex((p) => p.period_id === selectedPeriodId);
    const priorPeriod = idx >= 0 ? periods[idx + 1] : undefined; // periods are DESC → next index is prior
    Promise.all([
      getPeriodTotal(tenantId, selectedPeriodId),
      getBatchValidity(tenantId, selectedPeriodId),
      getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: selectedPeriodId }),
      priorPeriod
        ? getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: priorPeriod.period_id })
        : Promise.resolve([] as EntityResult[]),
      getComponentTotals(tenantId, selectedPeriodId),
    ])
      .then(([tot, val, rs, prs, cts]) => {
        if (cancelled) return;
        setPeriodTotal(tot);
        setVerdict(val);
        setRows(rs);
        setPriorRows(prs);
        setComponentTotals(cts);
        setPeriodLoading(false);
      })
      .catch((err) => { console.warn('[Stream] period data load failed:', err); if (!cancelled) setPeriodLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, selectedPeriodId, periods]);

  const selectedIdx = useMemo(() => periods.findIndex((p) => p.period_id === selectedPeriodId), [periods, selectedPeriodId]);
  const selected = periods[selectedIdx];
  const priorPeriod = selectedIdx >= 0 ? periods[selectedIdx + 1] : undefined;

  // ── Derived: deltas, accelerators/decliners, zero-payout cohort, trajectory series. ──
  const derived = useMemo(() => {
    if (rows.length === 0) return null;
    const total = periodTotal ?? rows.reduce((s, r) => s + (r.totalPayout || 0), 0);
    const entityCount = rows.length;
    const avg = entityCount > 0 ? total / entityCount : 0;
    const priorTotal = priorPeriod?.total_payout ?? null;
    const delta = priorTotal != null && priorTotal > 0 ? (total - priorTotal) / priorTotal : null;

    // per-entity delta vs prior period
    const priorById = new Map(priorRows.map((r) => [r.entityId, r.totalPayout || 0]));
    const withDelta = rows.map((r) => {
      const prior = priorById.get(r.entityId);
      const d = prior != null ? (r.totalPayout || 0) - prior : null;
      return { ...r, delta: d };
    });
    const movers = withDelta.filter((r) => r.delta != null);
    const sortedByDelta = [...movers].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
    const gainers = sortedByDelta.filter((r) => (r.delta ?? 0) > 0).slice(0, 5);
    const decliners = [...movers].filter((r) => (r.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 5);

    // zero-payout cohort: entities whose total payout is 0 (optimization opportunity)
    const zeroCohort = rows.filter((r) => (r.totalPayout || 0) === 0).slice(0, 8);

    const values = rows.map((r) => r.totalPayout || 0);
    const top = [...rows].sort((a, b) => (b.totalPayout || 0) - (a.totalPayout || 0))[0] ?? null;

    return { total, entityCount, avg, delta, gainers, decliners, zeroCohort, values, top, hasPrior: priorRows.length > 0 };
  }, [rows, priorRows, periodTotal, priorPeriod]);

  // population trend → SparkTrend points (chronological)
  const trendPoints = useMemo(() => trend.map((t) => ({ label: t.label, value: t.total })), [trend]);
  const projection = useMemo(() => {
    if (trend.length < 2) return null;
    const a = trend[trend.length - 2].total;
    const b = trend[trend.length - 1].total;
    return b + (b - a);
  }, [trend]);
  const velocityText = useMemo(() => {
    if (trend.length < 2) return undefined;
    const a = trend[trend.length - 2].total;
    const b = trend[trend.length - 1].total;
    const d = b - a;
    return `${d >= 0 ? '+' : ''}${format(d)} / period`;
  }, [trend, format]);

  // lifecycle stages from the selected period's lifecycle_state
  const lifecycleStages = useMemo<PipelineStage[]>(() => {
    const ORDER = ['DRAFT', 'PREVIEW', 'OFFICIAL', 'APPROVED', 'PAID'];
    const state = (selected?.lifecycle_state || '').toUpperCase();
    const idx = ORDER.indexOf(state);
    return ORDER.map((label, i) => ({
      label: label.charAt(0) + label.slice(1).toLowerCase(),
      status: idx < 0 ? (i === 0 ? 'current' : 'future') : i < idx ? 'done' : i === idx ? 'current' : 'future',
    }));
  }, [selected]);

  // ── Loading / empty (mirror reference) ──
  if (periodLoading && !periodsLoaded) {
    return (
      <PersonaAmbient>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
            <p className={TEXT.body}>Loading intelligence…</p>
          </div>
        </div>
      </PersonaAmbient>
    );
  }

  if (periodsLoaded && periods.length === 0) {
    return (
      <PersonaAmbient>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <Activity className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>No calculation data yet</h1>
          <p className={`mx-auto mt-2 max-w-md ${TEXT.body}`}>
            Your intelligence stream appears once a compensation run completes — totals, validity, trajectory, and standings.
          </p>
          <a href="/operate" className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
            <ArrowRight className="h-4 w-4" /> Go to Compensation
          </a>
        </div>
      </PersonaAmbient>
    );
  }

  const selectedLabel = selected?.label ?? '';

  // ── Accelerators / decliners → PrioritySortedList (splitView) ──
  const canDrill = !!tenantId && !!selectedPeriodId;
  const moverItems: PriorityItem[] = derived
    ? [
        ...derived.gainers.map<PriorityItem>((r) => ({
          id: `g-${r.entityId}`,
          severity: 'opportunity',
          label: r.displayName || r.externalId,
          detail: `now ${format(r.totalPayout || 0)}`,
          value: `+${format(r.delta ?? 0)}`,
          action: canDrill ? { label: 'View', onClick: () => drill.open({ entityId: r.entityId }) } : undefined,
        })),
        ...derived.decliners.map<PriorityItem>((r) => ({
          id: `d-${r.entityId}`,
          severity: 'warning',
          label: r.displayName || r.externalId,
          detail: `now ${format(r.totalPayout || 0)}`,
          value: format(r.delta ?? 0),
          action: canDrill ? { label: 'View', onClick: () => drill.open({ entityId: r.entityId }) } : undefined,
        })),
      ]
    : [];

  // ── Zero-payout cohort → PrioritySortedList. Action is an honest StubAction (no plan-health backend). ──
  const zeroItems: PriorityItem[] = derived
    ? derived.zeroCohort.map<PriorityItem>((r) => ({
        id: `z-${r.entityId}`,
        severity: 'info',
        label: r.displayName || r.externalId,
        detail: 'no payout this period',
        action: { label: 'Diagnose', disabled: true }, // STUB: plan-health diagnostics not built (§0.4)
      }))
    : [];

  // ── ONE IntelligenceElement (G2): the single most important insight. Prefer the validity finding
  //     when the batch is dirty; otherwise the top accelerator. ──
  const dirty = verdict && (verdict.severity === 'warning' || verdict.severity === 'critical');
  const topGainer = derived?.gainers[0];
  const leadElement: ReactNode = (() => {
    if (dirty && verdict) {
      return (
        <IntelligenceElement
          icon={Activity}
          label="Data Validity"
          value={verdict.matchPercent != null ? `${verdict.matchPercent.toFixed(1)}% match` : `${verdict.exceptionCount} exceptions`}
          context={verdict.recommendation}
          comparison={`${verdict.exceptionCount} exception${verdict.exceptionCount === 1 ? '' : 's'} on this batch`}
          comparisonTone={verdict.severity === 'critical' ? 'negative' : 'warning'}
          impact="Resolving exceptions before publishing prevents disputed statements downstream."
          action={{ label: 'Review in Compensation', href: '/operate' }}
        />
      );
    }
    if (topGainer && derived) {
      return (
        <IntelligenceElement
          icon={TrendingUp}
          label="Top Accelerator"
          value={topGainer.displayName || topGainer.externalId}
          context={`Largest period-over-period gain across ${derived.entityCount} entities — now earning ${format(topGainer.totalPayout || 0)}.`}
          comparison={`+${format(topGainer.delta ?? 0)} vs ${priorPeriod?.label ?? 'prior period'}`}
          comparisonTone="positive"
          impact="Momentum like this often signals a repeatable play worth recognizing across the population."
          action={{ label: 'View in Compensation', href: '/operate' }}
        />
      );
    }
    // honest neutral lead when there's no prior period to compare
    return derived ? (
      <IntelligenceElement
        icon={Activity}
        label="Period Standing"
        value={format(derived.total)}
        context={`${derived.entityCount} entities earned this period, averaging ${format(derived.avg)}.`}
        comparison={derived.hasPrior ? 'compared to the prior period' : 'first calculated period — no prior comparison yet'}
        comparisonTone="neutral"
        impact="A second calculated period unlocks trajectory, velocity, and per-entity movement."
        action={{ label: 'Open Compensation', href: '/operate' }}
      />
    ) : null;
  })();

  return (
    <PersonaAmbient>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header>
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>Intelligence Stream</h1>
          <p className={`mt-1 text-sm ${TEXT.body}`}>
            What matters most right now{derived ? ` · ${derived.entityCount} entities · ${selectedLabel}` : ''}
          </p>
        </header>

        {/* OB-211 WS-2 / B2: the Insight Agent narrative leads the surface (preserved). */}
        {streamNarrative && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-1">
            <InsightNarrative narrative={streamNarrative} />
          </div>
        )}

        <PeriodCards
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          onPeriodChange={setSelectedPeriodId}
          accentColor={theme.accent}
          accentSoft={theme.accentSoft}
        />

        {periodLoading || !derived ? (
          <Panel><div className={`py-16 text-center text-sm ${TEXT.muted}`}>{periodLoading ? 'Loading period…' : 'No outcomes for this period.'}</div></Panel>
        ) : (
          <>
            {/* DOMINANT: System Health hero + validity verdict + supporting tiles */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <HeroMetric
                  label="System Health"
                  value={derived.total}
                  format={format}
                  icon={Activity}
                  context={{
                    direction: derived.delta == null ? 'flat' : derived.delta > 0 ? 'up' : derived.delta < 0 ? 'down' : 'flat',
                    label: derived.delta == null ? 'no prior period' : `${derived.delta >= 0 ? '+' : ''}${(derived.delta * 100).toFixed(1)}% vs ${priorPeriod?.label ?? 'prior'}`,
                  }}
                  subtitle={`${derived.entityCount} entities · avg ${format(derived.avg)}`}
                />
              </div>

              {/* G4: the single ValidityVerdict (same component + getBatchValidity source as /perform). */}
              <div className="lg:col-span-2 space-y-4">
                {verdict && <ValidityVerdict verdict={verdict} variant="card" />}
                {/* The single most important insight — IntelligenceElement (G2). */}
                {leadElement}
              </div>
            </div>

            {/* Lifecycle pipeline (real action → Compensation). All personas. */}
            <Panel title="Lifecycle" description="Where this period sits in the compensation pipeline">
              <ConfigurablePipeline
                stages={lifecycleStages}
                action={{ label: 'Go to Compensation', href: '/operate' }}
                slaNote={selected?.lifecycle_state ? undefined : 'Not yet advanced'}
              />
            </Panel>

            {/* Trajectory + movers — Admin+Manager (medium). */}
            <DensityGate min="medium">
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Population Trajectory" description="Total payout across calculated periods, with velocity + projection">
                  {trendPoints.length >= 2 ? (
                    <SparkTrend
                      data={trendPoints}
                      velocity={velocityText}
                      projection={projection}
                      format={format}
                    />
                  ) : (
                    <div className={`py-8 text-center text-sm ${TEXT.muted}`}>A second calculated period unlocks trajectory.</div>
                  )}
                </Panel>

                <Panel title="Accelerators & Attention" description={derived.hasPrior ? `Largest movers vs ${priorPeriod?.label ?? 'prior period'}` : 'Period-over-period movement'}>
                  <PrioritySortedList
                    items={moverItems}
                    splitView
                    emptyLabel={derived.hasPrior ? 'No material movement this period.' : 'No prior period to compare yet.'}
                  />
                </Panel>
              </div>
            </DensityGate>

            {/* Admin depth (high): component trajectories, optimization cohort, distribution, learning. */}
            <DensityGate min="high">
              <div className="space-y-4">
                {componentSeries.length > 0 && (
                  <Panel title="Component Trajectories" description="Per-component payout across calculated periods">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {componentSeries.map((c) => (
                        <div key={c.name} className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-3">
                          <div className={`mb-1 flex items-baseline justify-between gap-2`}>
                            <span className={`truncate text-xs font-semibold uppercase tracking-wide ${TEXT.body}`} title={c.name}>{c.name}</span>
                            <span className={`shrink-0 text-sm font-bold tabular-nums ${TEXT.headline}`}>{format(c.points[c.points.length - 1] || 0)}</span>
                          </div>
                          <Sparkline data={c.points} color={theme.accent} height={36} width={140} />
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel
                    title="Optimization Opportunities"
                    description="Zero-payout cohort — entities with no payout this period"
                    action={<StubAction label="AI plan-health scan" variant="chip" />}
                  >
                    <PrioritySortedList
                      items={zeroItems}
                      emptyLabel="No zero-payout entities — every entity earned this period."
                    />
                  </Panel>

                  <Panel title="Population Distribution" description="Payout shape with quartile + mean reference">
                    <DistributionPosition data={derived.values} markers={{ quartiles: true, mean: true }} format={format} />
                  </Panel>
                </div>

                {/* Learning confidence — Admin only. Honest when cold/empty. */}
                <Panel title="Learning Confidence" description="How much of the calculation graph the platform has learned to run silently">
                  {learnStats == null ? (
                    <div className={`py-8 text-center text-sm ${TEXT.muted}`}>Loading learning state…</div>
                  ) : learnCold || learnStats.total === 0 ? (
                    <div className={`flex flex-col items-center gap-2 py-8 text-sm ${TEXT.muted}`}>
                      <Activity className="h-7 w-7 text-slate-600" />
                      <span>Cold start — no learned patterns yet. Confidence builds as calculations run.</span>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
                      <GaugeMetric
                        value={learnedPct ?? 0}
                        label="Learned"
                        invert
                        thresholds={{ amber: 40, red: 70 }}
                      />
                      <div className="space-y-2">
                        <StatLine label="Patterns learned" value={`${learnStats.learned} / ${learnStats.total}`} accent={theme.accent} />
                        <StatLine label="Still cold (full trace)" value={String(learnStats.cold)} />
                        <p className={`text-xs ${TEXT.muted}`}>Silent patterns run without per-step tracing — the math is byte-identical; only the trace is skipped.</p>
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
            </DensityGate>
          </>
        )}

        {/* OB-224 (preserved): inline five-layer drill for the clicked entity, scoped to this period. */}
        {drill.isOpen && tenantId && selectedPeriodId && (
          <StreamDrillRegion isVialuce={isVialuce} onClose={drill.close}>
            <DrillThroughPanel tenantId={tenantId} scope={ALL_SCOPE} periodId={selectedPeriodId} initialEntityId={drill.target?.entityId} showExport />
          </StreamDrillRegion>
        )}

        {/* HF-291 F-2: carrier admin governance cards (supplementary, below intelligence). */}
        {carrierAdminStack && <div className="mt-2">{carrierAdminStack}</div>}
      </div>
    </PersonaAmbient>
  );
}

// OB-224: a small theme-aware wrapper that frames the inline drill panel with a "Hide" control.
function StreamDrillRegion({ isVialuce, onClose, children }: { isVialuce: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={isVialuce ? 'text-[10px] uppercase tracking-wider text-zinc-500' : `text-[10px] uppercase tracking-wider ${TEXT.muted}`}>Entity detail</p>
        <button onClick={onClose} className={`text-xs ${TEXT.muted} hover:text-slate-300`}>Hide</button>
      </div>
      {children}
    </div>
  );
}

function StatLine({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2">
      <span className={`text-xs ${TEXT.muted}`}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: accent ?? '#e2e8f0' }}>{value}</span>
    </div>
  );
}
