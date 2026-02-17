'use client';

/**
 * Manager Dashboard — "Acelerar"
 *
 * Team-centric view: team total, member attainment bars, sparklines,
 * acceleration cards for coaching opportunities.
 * All data from persona-queries.ts getManagerDashboardData().
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { Sparkline } from '@/components/design-system/Sparkline';
import { AccelerationCard } from '@/components/design-system/AccelerationCard';
import {
  getManagerDashboardData,
  type ManagerDashboardData,
} from '@/lib/data/persona-queries';

export function ManagerDashboard() {
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol } = useCurrency();
  const { scope } = usePersona();
  const { activePeriodId } = usePeriod();
  const tenantId = currentTenant?.id ?? '';

  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || (scope.entityIds.length === 0 && !scope.canSeeAll)) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    getManagerDashboardData(tenantId, scope.entityIds, scope.canSeeAll).then(result => {
      if (!cancelled) {
        setData(result);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [tenantId, scope.entityIds, scope.canSeeAll, activePeriodId]);

  const teamStats = useMemo(() => {
    if (!data || data.teamMembers.length === 0) return null;
    const onTarget = data.teamMembers.filter(m => m.attainment >= 100).length;
    const coaching = data.teamMembers.filter(m => m.attainment >= 70 && m.attainment < 100).length;
    const accelerating = data.teamMembers.filter(m => m.attainment >= 100).length;
    return { onTarget, coaching, accelerating, total: data.teamMembers.length };
  }, [data]);

  const avgAttainment = useMemo(() => {
    if (!data || data.teamMembers.length === 0) return 0;
    return data.teamMembers.reduce((s, m) => s + m.attainment, 0) / data.teamMembers.length;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data || data.teamMembers.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-zinc-400">No hay datos de equipo para este periodo.</p>
        <p className="text-sm text-zinc-600">Los resultados apareceran cuando se ejecuten los calculos para las entidades de tu equipo.</p>
      </div>
    );
  }

  const sortedMembers = [...data.teamMembers].sort((a, b) => b.attainment - a.attainment);

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="bg-gradient-to-br from-amber-600/80 to-yellow-700/80 rounded-2xl p-6 border border-amber-500/20">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-amber-100/60 text-sm">Total del Equipo</p>
            <p className="text-3xl font-bold text-white mt-1">
              {currencySymbol}<AnimatedNumber value={data.teamTotal} />
            </p>
            <div className="flex items-center gap-4 mt-2 text-sm text-amber-100/50">
              <span>{data.teamMembers.length} miembros</span>
              <span>Logro promedio: {avgAttainment.toFixed(1)}%</span>
            </div>
          </div>
          {teamStats && (
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-300">{teamStats.onTarget}</p>
                <p className="text-amber-100/50 text-[11px]">En meta</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-amber-300">{teamStats.coaching}</p>
                <p className="text-amber-100/50 text-[11px]">Coaching</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Team Members */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
            Miembros del Equipo (por logro)
          </h4>
          <span className="text-[10px] text-zinc-500">
            Promedio zona: {avgAttainment.toFixed(1)}%
          </span>
        </div>
        <div className="space-y-3">
          {sortedMembers.map(member => (
            <div key={member.entityId} className="flex items-center gap-3">
              <span className="text-xs text-zinc-300 w-32 truncate flex-shrink-0">
                {member.entityName}
              </span>
              <div className="flex-1">
                <BenchmarkBar
                  value={member.attainment}
                  benchmark={avgAttainment}
                  label=""
                  rightLabel={
                    <span className={`text-[11px] tabular-nums ${member.attainment >= 100 ? 'text-emerald-400' : member.attainment >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {member.attainment.toFixed(1)}%
                    </span>
                  }
                  color={member.attainment >= 100 ? '#10b981' : member.attainment >= 70 ? '#f59e0b' : '#ef4444'}
                />
              </div>
              <div className="w-20 flex-shrink-0">
                {member.trend.length > 1 ? (
                  <Sparkline data={member.trend} height={20} width={80} />
                ) : (
                  <span className="text-[10px] text-zinc-600">-</span>
                )}
              </div>
              <span className="text-[11px] text-zinc-500 tabular-nums w-20 text-right flex-shrink-0">
                {currencySymbol}{member.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Acceleration Opportunities */}
      {data.accelerationOpportunities.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
            Oportunidades de Aceleracion ({data.accelerationOpportunities.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.accelerationOpportunities.slice(0, 6).map((signal, i) => (
              <AccelerationCard
                key={i}
                severity={signal.severity}
                title={signal.entityName}
                description={`${signal.opportunity} — ${signal.recommendedAction}`}
                actionLabel="Ver detalle"
                onAction={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
