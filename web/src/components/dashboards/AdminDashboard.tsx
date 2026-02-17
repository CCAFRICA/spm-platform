'use client';

/**
 * Admin Dashboard — "Gobernar"
 *
 * Governance view: total payout, distribution, component composition,
 * budget position, exceptions, payroll summary, period comparison.
 * All data from persona-queries.ts getAdminDashboardData().
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { StatusPill } from '@/components/design-system/StatusPill';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { BudgetGauge } from '@/components/design-system/BudgetGauge';
import { PayrollSummary, type PayrollRow } from '@/components/design-system/PayrollSummary';
import { QueueItem } from '@/components/design-system/QueueItem';
import {
  getAdminDashboardData,
  type AdminDashboardData,
} from '@/lib/data/persona-queries';
import {
  LIFECYCLE_DISPLAY,
  isDashboardState,
  type DashboardLifecycleState,
} from '@/lib/lifecycle/lifecycle-service';

export function AdminDashboard() {
  const { currentTenant } = useTenant();
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

  const stateLabel = useMemo(() => {
    if (!data?.lifecycleState) return null;
    if (isDashboardState(data.lifecycleState)) {
      return LIFECYCLE_DISPLAY[data.lifecycleState as DashboardLifecycleState];
    }
    return null;
  }, [data?.lifecycleState]);

  const payrollRows: PayrollRow[] = useMemo(() => {
    if (!data) return [];
    return data.storeBreakdown.map(s => ({
      entityName: s.entityName,
      entityType: s.entityType,
      totalPayout: s.totalPayout,
      components: 0,
      lifecycleState: data.lifecycleState ?? undefined,
      approved: data.lifecycleState === 'APPROVED' || data.lifecycleState === 'POSTED',
    }));
  }, [data]);

  const budgetTotal = useMemo(() => {
    if (!data) return 0;
    // Estimate budget as 110% of total payout (placeholder until real budget data exists)
    return data.totalPayout * 1.1;
  }, [data]);

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

  const statePillColor = data.lifecycleState === 'APPROVED' || data.lifecycleState === 'POSTED' ? 'emerald'
    : data.lifecycleState === 'PUBLISHED' ? 'indigo'
    : 'zinc';

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="bg-gradient-to-r from-indigo-600/80 to-violet-700/80 rounded-xl p-6 border border-indigo-500/20">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-indigo-200/70 text-sm">Pago Total del Periodo</p>
            <p className="text-3xl font-bold text-white mt-1">
              $<AnimatedNumber value={data.totalPayout} />
            </p>
            <div className="flex items-center gap-4 mt-2 text-sm text-indigo-200/60">
              <span>{data.entityCount} entidades</span>
              <span>{activePeriodLabel}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {stateLabel && (
              <StatusPill color={statePillColor}>{stateLabel.labelEs}</StatusPill>
            )}
          </div>
        </div>
      </div>

      {/* Distribution + Component Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Distribucion de Logro</h4>
          {data.attainmentDistribution.length > 0 ? (
            <DistributionChart data={data.attainmentDistribution} benchmarkLine={100} />
          ) : (
            <p className="text-sm text-zinc-500">Sin datos de distribucion.</p>
          )}
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Composicion de Componentes</h4>
          {data.componentComposition.length > 0 ? (
            <ComponentStack components={data.componentComposition} total={data.totalPayout} />
          ) : (
            <p className="text-sm text-zinc-500">Sin datos de componentes.</p>
          )}
        </div>
      </div>

      {/* Budget Gauge */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Posicion Presupuestaria</h4>
        <BudgetGauge actual={data.totalPayout} budget={budgetTotal} currency="MX$" />
      </div>

      {/* Exceptions */}
      {data.exceptions.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Excepciones ({data.exceptions.length})
          </h4>
          <div className="space-y-2">
            {data.exceptions.slice(0, 10).map((exc, i) => (
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

      {/* Payroll Summary */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Resumen de Nomina</h4>
        <PayrollSummary rows={payrollRows} currency="MX$" />
      </div>
    </div>
  );
}
