'use client';

/**
 * Admin Dashboard — Govern
 *
 * DS-001 Admin View layout (8 distinct visual forms):
 *   Row 1: Hero (col-5) + Distribution (col-4) + Lifecycle (col-3)
 *   Row 2: Locations vs Budget (col-7) + Components + Exceptions (col-5)
 *   Row 3: Period Readiness Checklist (full width)
 *
 * Cognitive Fit Test:
 *   1. Total payout → HeroMetric (AnimNum) — identification
 *   2. Attainment distribution → Histogram (5-bucket) — distribution
 *   3. Lifecycle state → Phase stepper (circles) — planning/sequence
 *   4. Locations vs budget → BenchBar (horizontal bars + reference) — comparison
 *   5. Component composition → StackedBar (part-of-whole) — part-of-whole
 *   6. Exceptions → PrioritySortedList (severity-coded) — selection/triage
 *   7. Trend vs prior period → TrendArrow — monitoring
 *   8. AI Assessment → AssessmentPanel — intelligence
 *   9. Period Readiness → Checklist — planning/progress
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePeriod } from '@/contexts/period-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import { useSearchParams } from 'next/navigation';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { LifecycleStepper } from '@/components/design-system/LifecycleStepper';
import { QueueItem } from '@/components/design-system/QueueItem';
import { TrendArrow } from '@/components/design-system/TrendArrow';
import { AssessmentPanel } from '@/components/design-system/AssessmentPanel';
import { AlertTriangle, CheckCircle2, Circle, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  getAdminDashboardData,
  type AdminDashboardData,
} from '@/lib/data/persona-queries';
import { TrialGate } from '@/components/trial/TrialGate';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { AgentInbox } from '@/components/agents/AgentInbox';

/** Dynamic lifecycle transition labels (OB-58) */
const TRANSITION_LABELS: Record<string, { label: string; labelEs: string; next: string }> = {
  DRAFT:              { label: 'Run Preview',          labelEs: 'Ejecutar Vista Previa',     next: 'PREVIEW' },
  PREVIEW:            { label: 'Run Reconciliation',   labelEs: 'Ejecutar Reconciliacion',   next: 'RECONCILE' },
  RECONCILE:          { label: 'Advance to Official',  labelEs: 'Avanzar a Oficial',         next: 'OFFICIAL' },
  OFFICIAL:           { label: 'Submit for Approval',  labelEs: 'Enviar para Aprobacion',    next: 'PENDING_APPROVAL' },
  PENDING_APPROVAL:   { label: 'Awaiting Approval',    labelEs: 'Esperando Aprobacion',      next: '' },
  APPROVED:           { label: 'Post Results',         labelEs: 'Publicar Resultados',       next: 'POSTED' },
  POSTED:             { label: 'Close Period',         labelEs: 'Cerrar Periodo',            next: 'CLOSED' },
  CLOSED:             { label: 'Mark as Paid',         labelEs: 'Marcar como Pagado',        next: 'PAID' },
  PAID:               { label: 'Publish',              labelEs: 'Publicar',                  next: 'PUBLISHED' },
  PUBLISHED:          { label: 'Complete',             labelEs: 'Completado',                next: '' },
};

// DS-001 inline styles
const HERO_STYLE = {
  background: 'linear-gradient(to bottom right, rgba(79, 70, 229, 0.8), rgba(109, 40, 217, 0.8))',
  border: '1px solid rgba(99, 102, 241, 0.2)',
  borderRadius: '16px',
  padding: '20px',
};

const CARD_STYLE = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '16px',
  padding: '20px',
};

export function AdminDashboard() {
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol } = useCurrency();
  const { activePeriodId, activePeriodLabel } = usePeriod();
  const { locale } = useLocale();
  const { user } = useAuth();
  const userIsVLAdmin = user && isVLAdmin(user);
  const tenantId = currentTenant?.id ?? '';
  const { checkGate } = useTrialStatus(currentTenant?.id);
  const lifecycleGate = checkGate('lifecycle');
  const searchParams = useSearchParams();

  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeToast, setShowUpgradeToast] = useState(false);

  // Post-upgrade success toast
  useEffect(() => {
    if (searchParams.get('upgraded') === 'true') {
      setShowUpgradeToast(true);
      // Remove query param
      const url = new URL(window.location.href);
      url.searchParams.delete('upgraded');
      window.history.replaceState({}, '', url.pathname);
      // Auto-dismiss after 8 seconds
      const timer = setTimeout(() => setShowUpgradeToast(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setIsLoading(true);

    getAdminDashboardData(tenantId).then(result => {
      if (!cancelled) {
        setData(result);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [tenantId, activePeriodId]);

  // CLT-56: Budget is estimated as 110% of actual payout since no real budget
  // field exists in entity_period_outcomes. This produces a tautological -9.1%
  // delta (=-1/11) for all entities. When a real budget_target column is added,
  // this should read from the database instead.
  const budgetTotal = useMemo(() => {
    if (!data) return 0;
    return data.totalPayout * 1.1;
  }, [data]);
  const isBudgetEstimated = true; // No real budget source yet

  const budgetPct = useMemo(() => {
    if (!budgetTotal || !data) return 0;
    return Math.round((data.totalPayout / budgetTotal) * 100);
  }, [data, budgetTotal]);

  // Distribution stats
  const distStats = useMemo(() => {
    if (!data || data.attainmentDistribution.length === 0) return null;
    const arr = data.attainmentDistribution;
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    const sorted = [...arr].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const variance = arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / arr.length;
    const stdDev = Math.sqrt(variance);
    return { avg, median, stdDev };
  }, [data]);

  // Outlier detection for store breakdown (4D)
  const storeOutliers = useMemo(() => {
    if (!data || data.storeBreakdown.length < 3) return new Set<string>();
    const deltas = data.storeBreakdown.map(store => {
      const storeBudget = budgetTotal > 0
        ? (store.totalPayout / data.totalPayout) * budgetTotal
        : store.totalPayout * 1.1;
      return {
        entityId: store.entityId,
        delta: storeBudget > 0 ? ((store.totalPayout - storeBudget) / storeBudget) * 100 : 0,
      };
    });
    const deltaValues = deltas.map(d => d.delta);
    const mean = deltaValues.reduce((s, v) => s + v, 0) / deltaValues.length;
    const variance = deltaValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / deltaValues.length;
    const stdDev = Math.sqrt(variance);

    const outlierSet = new Set<string>();

    // Flag entities > 2 std devs from mean
    if (stdDev > 0) {
      for (const d of deltas) {
        if (Math.abs(d.delta - mean) > 2 * stdDev) {
          outlierSet.add(d.entityId);
        }
      }
    }

    // Flag if all deltas are identical (uniform delta investigation)
    const allSame = deltaValues.length > 1 && deltaValues.every(v => Math.abs(v - deltaValues[0]) < 0.01);
    if (allSame) {
      for (const d of deltas) outlierSet.add(d.entityId);
    }

    return outlierSet;
  }, [data, budgetTotal]);

  // Uniform delta flag
  const isUniformDelta = useMemo(() => {
    if (!data || data.storeBreakdown.length < 2) return false;
    const deltas = data.storeBreakdown.map(store => {
      const storeBudget = budgetTotal > 0
        ? (store.totalPayout / data.totalPayout) * budgetTotal
        : store.totalPayout * 1.1;
      return storeBudget > 0 ? ((store.totalPayout - storeBudget) / storeBudget) * 100 : 0;
    });
    return deltas.every(v => Math.abs(v - deltas[0]) < 0.01);
  }, [data, budgetTotal]);

  // Period Readiness criteria (4E)
  const readinessCriteria = useMemo(() => {
    if (!data) return [];
    const criteria = [
      {
        label: 'Data imported',
        labelEs: 'Datos importados',
        met: data.entityCount > 0,
        detail: data.entityCount > 0 ? `${data.entityCount} entities` : 'No data',
      },
      {
        label: 'Calculations run',
        labelEs: 'Calculos ejecutados',
        met: data.totalPayout > 0,
        detail: data.totalPayout > 0 ? `${currencySymbol}${data.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'Not run',
      },
      {
        label: 'All entities covered',
        labelEs: 'Todas las entidades cubiertas',
        met: data.entityCount > 0 && data.storeBreakdown.length > 0,
        detail: `${data.storeBreakdown.length}/${data.entityCount} locations`,
      },
      {
        label: 'Distribution within bounds',
        labelEs: 'Distribucion dentro de limites',
        met: distStats !== null && distStats.stdDev < 40,
        detail: distStats ? `StdDev: ${distStats.stdDev.toFixed(1)}%` : 'No data',
      },
      {
        label: 'Exceptions resolved',
        labelEs: 'Excepciones resueltas',
        met: data.exceptions.filter(e => e.severity === 'critical').length === 0,
        detail: data.exceptions.filter(e => e.severity === 'critical').length === 0
          ? 'No critical issues'
          : `${data.exceptions.filter(e => e.severity === 'critical').length} critical`,
      },
      {
        label: 'Budget within threshold',
        labelEs: 'Presupuesto dentro del umbral',
        met: budgetPct >= 85 && budgetPct <= 115,
        detail: `${budgetPct}% of budget`,
      },
      {
        label: 'Component composition valid',
        labelEs: 'Composicion de componentes valida',
        met: data.componentComposition.length > 0,
        detail: `${data.componentComposition.length} components`,
      },
    ];
    return criteria;
  }, [data, distStats, budgetPct, currencySymbol]);

  const readinessMet = readinessCriteria.filter(c => c.met).length;

  // Build assessment payload (must be before early returns for hooks rule)
  const assessmentData = useMemo(() => {
    if (!data) return {};
    return {
      totalPayout: data.totalPayout,
      entityCount: data.entityCount,
      budgetUtilization: budgetPct,
      avgAttainment: distStats?.avg,
      medianAttainment: distStats?.median,
      stdDev: distStats?.stdDev,
      lifecycleState: data.lifecycleState,
      exceptionsCount: data.exceptions.length,
      topExceptions: data.exceptions.slice(0, 3).map(e => `${e.entityName}: ${e.issue}`),
      componentNames: data.componentComposition.map(c => c.name),
      storeCount: data.storeBreakdown.length,
    };
  }, [data, budgetPct, distStats]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Standing Rule 3: VL Admin always sees English
  const isSpanish = userIsVLAdmin ? false : locale === 'es-MX';

  if (!data || data.entityCount === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-zinc-400">
          {isSpanish ? 'No hay resultados de calculo para este periodo.' : 'No calculation results for this period.'}
        </p>
        <p className="text-sm text-zinc-600">
          {isSpanish ? 'Ejecuta un calculo desde el Centro de Operaciones para ver los datos aqui.' : 'Run a calculation from the Operations Center to see data here.'}
        </p>
      </div>
    );
  }

  const currentState = (data.lifecycleState || 'DRAFT').toUpperCase();
  const transition = TRANSITION_LABELS[currentState];
  const hasNextTransition = transition && transition.next !== '';

  return (
    <div className="space-y-4">
      {/* Post-upgrade success toast */}
      {showUpgradeToast && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.4)',
          borderRadius: '8px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#22C55E', fontSize: '18px' }}>&#10003;</span>
            <span style={{ color: '#22C55E', fontSize: '14px', fontWeight: 600 }}>
              Subscription activated! Your team now has full access.
            </span>
          </div>
          <button
            onClick={() => setShowUpgradeToast(false)}
            style={{ background: 'none', border: 'none', color: '#22C55E', cursor: 'pointer', fontSize: '16px' }}
          >
            &times;
          </button>
        </div>
      )}
      <AgentInbox tenantId={currentTenant?.id} persona="admin" />
      {/* OB-86: AI Quality Card */}
      {data.aiMetrics && (
        <div style={CARD_STYLE}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AI Quality
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ color: '#94A3B8', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                {data.aiMetrics.totalSignals} signals
              </span>
              <span className={`text-xs font-medium tabular-nums px-2 py-0.5 rounded-full border ${
                data.aiMetrics.acceptanceRate >= 0.8
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : data.aiMetrics.acceptanceRate >= 0.6
                  ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                  : 'border-red-500/40 text-red-400 bg-red-500/10'
              }`}>
                {(data.aiMetrics.acceptanceRate * 100).toFixed(0)}% accept
              </span>
              {data.aiMetrics.trendDirection === 'improving' && <TrendingUp size={14} style={{ color: '#34d399' }} />}
              {data.aiMetrics.trendDirection === 'declining' && <TrendingDown size={14} style={{ color: '#f87171' }} />}
              {data.aiMetrics.trendDirection === 'stable' && <Minus size={14} style={{ color: '#94A3B8' }} />}
            </div>
          </div>
        </div>
      )}
      <AssessmentPanel
        persona="admin"
        data={assessmentData}
        locale={isSpanish ? 'es' : 'en'}
        accentColor="#6366f1"
        tenantId={tenantId}
      />
      {/* ── Row 1: Hero (5) + Distribution (4) + Lifecycle (3) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Hero Card — 4A: budget context + advance button */}
        <div className="col-span-12 lg:col-span-5" style={HERO_STYLE}>
          <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {isSpanish ? 'Total Compensacion' : 'Total Compensation'} · {activePeriodLabel}
          </p>
          <p className="text-4xl font-bold mt-2" style={{ color: '#ffffff' }}>
            {currencySymbol}<AnimatedNumber value={data.totalPayout} />
          </p>
          <p style={{ color: 'rgba(199, 210, 254, 0.8)', fontSize: '13px', marginTop: '4px' }}>
            {budgetPct}% of {isBudgetEstimated ? 'est. ' : ''}budget ({currencySymbol}{budgetTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })})
          </p>
          <div className="mt-1">
            <TrendArrow delta={3.2} label={isSpanish ? 'vs periodo anterior' : 'vs prior period'} size="sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div>
              <p className="text-lg font-bold" style={{ color: '#ffffff' }}>{data.entityCount}</p>
              <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '13px' }}>{isSpanish ? 'entidades' : 'entities'}</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: '#ffffff' }}>{budgetPct}%</p>
              <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '13px' }}>{isSpanish ? 'presupuesto' : 'budget'}</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: '#ffffff' }}>{data.exceptions.length}</p>
              <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '13px' }}>{isSpanish ? 'excepciones' : 'exceptions'}</p>
            </div>
          </div>
          {hasNextTransition && (
            <TrialGate allowed={lifecycleGate.allowed} message={lifecycleGate.message}>
              <button
                className="mt-4 w-full py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; }}
              >
                {isSpanish ? transition.labelEs : transition.label} &rarr;
              </button>
            </TrialGate>
          )}
        </div>

        {/* Distribution Histogram */}
        <div className="col-span-12 lg:col-span-4" style={CARD_STYLE}>
          <p style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            {isSpanish ? 'Distribucion' : 'Distribution'}
          </p>
          {data.attainmentDistribution.length > 0 ? (
            <>
              <DistributionChart data={data.attainmentDistribution} benchmarkLine={100} />
              {distStats && (
                <div className="flex gap-4 mt-3">
                  <div>
                    <p style={{ color: '#94A3B8', fontSize: '13px' }}>{isSpanish ? 'Promedio' : 'Average'}</p>
                    <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{distStats.avg.toFixed(0)}%</p>
                  </div>
                  <div>
                    <p style={{ color: '#94A3B8', fontSize: '13px' }}>{isSpanish ? 'Mediana' : 'Median'}</p>
                    <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{distStats.median.toFixed(0)}%</p>
                  </div>
                  <div>
                    <p style={{ color: '#94A3B8', fontSize: '13px' }}>{isSpanish ? 'Desv.Est' : 'Std.Dev'}</p>
                    <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{distStats.stdDev.toFixed(1)}%</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: '#94A3B8' }}>{isSpanish ? 'Sin datos de distribucion.' : 'No distribution data.'}</p>
          )}
        </div>

        {/* Lifecycle — 4C: ensure all phases visible */}
        <div className="col-span-12 lg:col-span-3" style={CARD_STYLE}>
          <p style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            {isSpanish ? 'Ciclo de Vida' : 'Lifecycle'}
          </p>
          <LifecycleStepper
            currentState={data.lifecycleState || 'DRAFT'}
          />
        </div>
      </div>

      {/* ── Row 2: Locations vs Budget (7) + Components + Exceptions (5) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Locations vs Budget — 4D: outlier flags */}
        <div className="col-span-12 lg:col-span-7" style={CARD_STYLE}>
          <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
            <div className="flex items-center gap-2">
              <p style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Locations vs Budget
              </p>
              {isBudgetEstimated && (
                <span style={{ color: '#94A3B8', fontSize: '13px', fontStyle: 'italic' }}>(estimated)</span>
              )}
            </div>
            {isUniformDelta && isBudgetEstimated && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                <AlertTriangle size={12} style={{ color: '#fbbf24' }} />
                <span style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 500 }}>No real budget — using 110% estimate</span>
              </span>
            )}
          </div>
          <div className="space-y-3">
            {data.storeBreakdown.length > 0 ? (
              data.storeBreakdown.slice(0, 10).map(store => {
                const storeBudget = budgetTotal > 0
                  ? (store.totalPayout / data.totalPayout) * budgetTotal
                  : store.totalPayout * 1.1;
                const deltaPct = storeBudget > 0
                  ? ((store.totalPayout - storeBudget) / storeBudget) * 100
                  : 0;
                const barColor = store.totalPayout >= storeBudget ? '#34d399'
                  : store.totalPayout >= storeBudget * 0.85 ? '#fbbf24'
                  : '#f87171';
                const isOutlier = storeOutliers.has(store.entityId);

                return (
                  <div key={store.entityId} className="flex items-center gap-2">
                    <div className="flex-1">
                      <BenchmarkBar
                        value={store.totalPayout}
                        benchmark={storeBudget}
                        label={store.entityName}
                        sublabel={`${currencySymbol}${store.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${currencySymbol}${storeBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        rightLabel={
                          <span className="tabular-nums font-medium" style={{ color: deltaPct >= 0 ? '#34d399' : '#f87171', fontSize: '12px' }}>
                            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                          </span>
                        }
                        color={barColor}
                      />
                    </div>
                    {isOutlier && !isUniformDelta && (
                      <AlertTriangle size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm" style={{ color: '#94A3B8' }}>{isSpanish ? 'Sin datos de ubicacion.' : 'No location data.'}</p>
            )}
          </div>
        </div>

        {/* Components + Exceptions */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Component Stack */}
          <div style={CARD_STYLE}>
            <p style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              {isSpanish ? 'Composicion de Componentes' : 'Component Composition'}
            </p>
            {data.componentComposition.length > 0 ? (
              <ComponentStack components={data.componentComposition} total={data.totalPayout} />
            ) : (
              <p className="text-sm" style={{ color: '#94A3B8' }}>{isSpanish ? 'Sin datos de componentes.' : 'No component data.'}</p>
            )}
          </div>

          {/* Exceptions */}
          <div style={CARD_STYLE}>
            <p style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              {isSpanish ? 'Excepciones Activas' : 'Active Exceptions'} ({data.exceptions.length})
            </p>
            {data.exceptions.length > 0 ? (
              <div className="space-y-2">
                {data.exceptions.slice(0, 5).map((exc, i) => (
                  <QueueItem
                    key={i}
                    priority={exc.severity === 'critical' ? 'high' : exc.severity === 'watch' ? 'medium' : 'low'}
                    text={`${exc.entityName}: ${exc.issue}`}
                    action={exc.severity === 'critical' ? (isSpanish ? 'Resolver ahora' : 'Resolve now') : (isSpanish ? 'Investigar' : 'Investigate')}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: '#94A3B8' }}>{isSpanish ? 'Sin excepciones activas.' : 'No active exceptions.'}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: Period Readiness Checklist (4E) ── */}
      <div style={CARD_STYLE}>
        <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
          <p style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Period Readiness
          </p>
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: readinessMet === readinessCriteria.length ? '#34d399' : '#fbbf24',
          }}>
            {readinessMet}/{readinessCriteria.length} criteria met
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ height: '4px', background: 'rgba(39,39,42,0.8)', borderRadius: '2px', marginBottom: '16px' }}>
          <div style={{
            height: '4px',
            borderRadius: '2px',
            width: `${(readinessMet / readinessCriteria.length) * 100}%`,
            background: readinessMet === readinessCriteria.length
              ? 'linear-gradient(90deg, #34d399, #10b981)'
              : 'linear-gradient(90deg, #fbbf24, #f59e0b)',
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {readinessCriteria.map((criterion, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{ background: criterion.met ? 'rgba(52, 211, 153, 0.05)' : 'rgba(251, 191, 36, 0.05)' }}
            >
              {criterion.met ? (
                <CheckCircle2 size={16} style={{ color: '#34d399', flexShrink: 0 }} />
              ) : (
                <Circle size={16} style={{ color: '#94A3B8', flexShrink: 0 }} />
              )}
              <div className="flex-1 min-w-0">
                <p style={{ color: criterion.met ? '#d4d4d8' : '#a1a1aa', fontSize: '13px' }}>
                  {isSpanish ? criterion.labelEs : criterion.label}
                </p>
                <p style={{ color: '#94A3B8', fontSize: '13px' }}>{criterion.detail}</p>
              </div>
            </div>
          ))}
        </div>
        {readinessMet === readinessCriteria.length && hasNextTransition && (
          <button
            className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'linear-gradient(90deg, #4f46e5, #6d28d9)',
              color: '#ffffff',
            }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = '0.9'; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = '1'; }}
          >
            {isSpanish ? transition.labelEs : transition.label} &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
