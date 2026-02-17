'use client';

/**
 * Admin Dashboard — "Gobernar"
 *
 * DS-001 Admin View layout:
 *   Row 1: Hero (col-5) + Distribution (col-4) + Lifecycle (col-3)
 *   Row 2: Locations vs Budget (col-7) + Components + Exceptions (col-5)
 *
 * All data from persona-queries.ts getAdminDashboardData().
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { LifecycleStepper } from '@/components/design-system/LifecycleStepper';
import { QueueItem } from '@/components/design-system/QueueItem';
import {
  getAdminDashboardData,
  type AdminDashboardData,
} from '@/lib/data/persona-queries';

export function AdminDashboard() {
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol } = useCurrency();
  const { activePeriodId, activePeriodLabel } = usePeriod();
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
      {/* ── Row 1: Hero (5) + Distribution (4) + Lifecycle (3) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Hero Card */}
        <div className="col-span-12 lg:col-span-5 bg-gradient-to-br from-indigo-600/80 to-violet-700/80 rounded-2xl p-5 border border-indigo-500/20">
          <p className="text-indigo-200/60 text-[10px] font-medium uppercase tracking-widest">
            Total Compensacion · {activePeriodLabel}
          </p>
          <p className="text-4xl font-bold text-white mt-2">
            {currencySymbol}<AnimatedNumber value={data.totalPayout} />
          </p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div>
              <p className="text-lg font-bold text-white">{data.entityCount}</p>
              <p className="text-[10px] text-indigo-200/60">entidades</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{budgetPct}%</p>
              <p className="text-[10px] text-indigo-200/60">presupuesto</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{data.exceptions.length}</p>
              <p className="text-[10px] text-indigo-200/60">excepciones</p>
            </div>
          </div>
        </div>

        {/* Distribution Histogram */}
        <div className="col-span-12 lg:col-span-4 bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-3">Distribucion</p>
          {data.attainmentDistribution.length > 0 ? (
            <DistributionChart data={data.attainmentDistribution} benchmarkLine={100} />
          ) : (
            <p className="text-sm text-zinc-500">Sin datos de distribucion.</p>
          )}
        </div>

        {/* Lifecycle */}
        <div className="col-span-12 lg:col-span-3 bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-3">Ciclo de Vida</p>
          <LifecycleStepper
            currentState={data.lifecycleState || 'DRAFT'}
          />
        </div>
      </div>

      {/* ── Row 2: Locations vs Budget (7) + Components + Exceptions (5) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Locations vs Budget */}
        <div className="col-span-12 lg:col-span-7 bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
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
                const barColor = store.totalPayout >= storeBudget ? '#10b981'
                  : store.totalPayout >= storeBudget * 0.85 ? '#f59e0b'
                  : '#ef4444';

                return (
                  <BenchmarkBar
                    key={store.entityId}
                    value={store.totalPayout}
                    benchmark={storeBudget}
                    label={store.entityName}
                    sublabel={`${currencySymbol}${store.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${currencySymbol}${storeBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    rightLabel={
                      <span className={`text-xs tabular-nums font-medium ${deltaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                      </span>
                    }
                    color={barColor}
                  />
                );
              })
            ) : (
              <p className="text-sm text-zinc-500">Sin datos de ubicacion.</p>
            )}
          </div>
        </div>

        {/* Components + Exceptions */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Component Stack */}
          <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5">
            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-3">
              Composicion de Componentes
            </p>
            {data.componentComposition.length > 0 ? (
              <ComponentStack components={data.componentComposition} total={data.totalPayout} />
            ) : (
              <p className="text-sm text-zinc-500">Sin datos de componentes.</p>
            )}
          </div>

          {/* Exceptions */}
          {data.exceptions.length > 0 && (
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5">
              <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-3">
                Excepciones Activas ({data.exceptions.length})
              </p>
              <div className="space-y-2">
                {data.exceptions.slice(0, 5).map((exc, i) => (
                  <QueueItem
                    key={i}
                    priority={exc.severity === 'critical' ? 'high' : exc.severity === 'watch' ? 'medium' : 'low'}
                    text={`${exc.entityName}: ${exc.issue}`}
                    action="Investigar"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
