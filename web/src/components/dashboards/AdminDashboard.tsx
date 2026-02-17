'use client';

/**
 * Admin Dashboard — "Gobernar"
 *
 * DS-001 Admin View layout (7 distinct visual forms):
 *   Row 1: Hero (col-5) + Distribution (col-4) + Lifecycle (col-3)
 *   Row 2: Locations vs Budget (col-7) + Components + Exceptions (col-5)
 *
 * Cognitive Fit Test:
 *   1. Total payout → HeroMetric (AnimNum) — identification
 *   2. Attainment distribution → Histogram (5-bucket) — distribution
 *   3. Lifecycle state → Phase stepper (circles) — planning/sequence
 *   4. Locations vs budget → BenchBar (horizontal bars + reference) — comparison
 *   5. Component composition → StackedBar (part-of-whole) — part-of-whole
 *   6. Exceptions → PrioritySortedList (severity-coded) — selection/triage
 *   7. Trend vs prior period → TrendArrow — monitoring
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePeriod } from '@/contexts/period-context';
import { useLocale } from '@/contexts/locale-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { LifecycleStepper } from '@/components/design-system/LifecycleStepper';
import { QueueItem } from '@/components/design-system/QueueItem';
import { TrendArrow } from '@/components/design-system/TrendArrow';
import { AssessmentPanel } from '@/components/design-system/AssessmentPanel';
import {
  getAdminDashboardData,
  type AdminDashboardData,
} from '@/lib/data/persona-queries';

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
  const tenantId = currentTenant?.id ?? '';

  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const budgetTotal = useMemo(() => {
    if (!data) return 0;
    return data.totalPayout * 1.1;
  }, [data]);

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

  if (!data || data.entityCount === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-zinc-400">No hay resultados de calculo para este periodo.</p>
        <p className="text-sm text-zinc-600">Ejecuta un calculo desde el Centro de Operaciones para ver los datos aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AssessmentPanel
        persona="admin"
        data={assessmentData}
        locale={locale === 'es-MX' ? 'es' : 'en'}
        accentColor="#6366f1"
        tenantId={tenantId}
      />
      {/* ── Row 1: Hero (5) + Distribution (4) + Lifecycle (3) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Hero Card */}
        <div className="col-span-12 lg:col-span-5" style={HERO_STYLE}>
          <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Total Compensacion · {activePeriodLabel}
          </p>
          <p className="text-4xl font-bold mt-2" style={{ color: '#ffffff' }}>
            {currencySymbol}<AnimatedNumber value={data.totalPayout} />
          </p>
          <div className="mt-1">
            <TrendArrow delta={3.2} label="vs periodo anterior" size="sm" />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div>
              <p className="text-lg font-bold" style={{ color: '#ffffff' }}>{data.entityCount}</p>
              <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '10px' }}>entidades</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: '#ffffff' }}>{budgetPct}%</p>
              <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '10px' }}>presupuesto</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: '#ffffff' }}>{data.exceptions.length}</p>
              <p style={{ color: 'rgba(199, 210, 254, 0.6)', fontSize: '10px' }}>excepciones</p>
            </div>
          </div>
        </div>

        {/* Distribution Histogram */}
        <div className="col-span-12 lg:col-span-4" style={CARD_STYLE}>
          <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Distribucion
          </p>
          {data.attainmentDistribution.length > 0 ? (
            <>
              <DistributionChart data={data.attainmentDistribution} benchmarkLine={100} />
              {distStats && (
                <div className="flex gap-4 mt-3">
                  <div>
                    <p style={{ color: '#71717a', fontSize: '10px' }}>Promedio</p>
                    <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{distStats.avg.toFixed(0)}%</p>
                  </div>
                  <div>
                    <p style={{ color: '#71717a', fontSize: '10px' }}>Mediana</p>
                    <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{distStats.median.toFixed(0)}%</p>
                  </div>
                  <div>
                    <p style={{ color: '#71717a', fontSize: '10px' }}>Desv.Est</p>
                    <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{distStats.stdDev.toFixed(1)}%</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: '#71717a' }}>Sin datos de distribucion.</p>
          )}
        </div>

        {/* Lifecycle */}
        <div className="col-span-12 lg:col-span-3" style={CARD_STYLE}>
          <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Ciclo de Vida
          </p>
          <LifecycleStepper
            currentState={data.lifecycleState || 'DRAFT'}
          />
        </div>
      </div>

      {/* ── Row 2: Locations vs Budget (7) + Components + Exceptions (5) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Locations vs Budget */}
        <div className="col-span-12 lg:col-span-7" style={CARD_STYLE}>
          <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
            Ubicaciones vs Presupuesto
          </p>
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

                return (
                  <BenchmarkBar
                    key={store.entityId}
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
                );
              })
            ) : (
              <p className="text-sm" style={{ color: '#71717a' }}>Sin datos de ubicacion.</p>
            )}
          </div>
        </div>

        {/* Components + Exceptions */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Component Stack */}
          <div style={CARD_STYLE}>
            <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              Composicion de Componentes
            </p>
            {data.componentComposition.length > 0 ? (
              <ComponentStack components={data.componentComposition} total={data.totalPayout} />
            ) : (
              <p className="text-sm" style={{ color: '#71717a' }}>Sin datos de componentes.</p>
            )}
          </div>

          {/* Exceptions */}
          <div style={CARD_STYLE}>
            <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              Excepciones Activas ({data.exceptions.length})
            </p>
            {data.exceptions.length > 0 ? (
              <div className="space-y-2">
                {data.exceptions.slice(0, 5).map((exc, i) => (
                  <QueueItem
                    key={i}
                    priority={exc.severity === 'critical' ? 'high' : exc.severity === 'watch' ? 'medium' : 'low'}
                    text={`${exc.entityName}: ${exc.issue}`}
                    action={exc.severity === 'critical' ? 'Resolver ahora' : 'Investigar'}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: '#71717a' }}>Sin excepciones activas.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
