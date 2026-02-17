'use client';

/**
 * Manager Dashboard — "Acelerar"
 *
 * DS-001 Manager View layout (6 distinct visual forms):
 *   Row 1: Zone Hero (col-4) + Acceleration Opportunities (col-8)
 *   Row 2: Team Performance (full width)
 *
 * Cognitive Fit Test:
 *   1. Zone total → HeroMetric (AnimNum) — identification
 *   2. Acceleration opportunities → Prescriptive action cards — selection/decision
 *   3. Team performance → BenchBar per person — comparison
 *   4. Individual trajectory → Sparkline — monitoring
 *   5. Streak recognition → Pill badge — identification (achievement)
 *   6. Trend delta → TrendArrow — monitoring
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { Sparkline } from '@/components/design-system/Sparkline';
import { TrendArrow } from '@/components/design-system/TrendArrow';
import {
  getManagerDashboardData,
  type ManagerDashboardData,
} from '@/lib/data/persona-queries';

const HERO_STYLE = {
  background: 'linear-gradient(to bottom right, rgba(217, 119, 6, 0.7), rgba(161, 98, 7, 0.6))',
  border: '1px solid rgba(245, 158, 11, 0.2)',
  borderRadius: '16px',
  padding: '20px',
};

const CARD_STYLE = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '16px',
  padding: '20px',
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; accent: string }> = {
  opportunity: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', accent: '#34d399' },
  watch: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', accent: '#fbbf24' },
  critical: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', accent: '#f87171' },
};

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
    return { onTarget, coaching, total: data.teamMembers.length };
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
        <p style={{ color: '#a1a1aa' }}>No hay datos de equipo para este periodo.</p>
        <p className="text-sm" style={{ color: '#52525b' }}>Los resultados apareceran cuando se ejecuten los calculos para las entidades de tu equipo.</p>
      </div>
    );
  }

  const sortedMembers = [...data.teamMembers].sort((a, b) => b.attainment - a.attainment);

  return (
    <div className="space-y-4">
      {/* ── Row 1: Zone Hero (4) + Acceleration Opportunities (8) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Zone Hero */}
        <div className="col-span-12 lg:col-span-4" style={HERO_STYLE}>
          <p style={{ color: 'rgba(254, 243, 199, 0.6)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Total del Equipo
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: '#ffffff' }}>
            {currencySymbol}<AnimatedNumber value={data.teamTotal} />
          </p>
          <div className="mt-1">
            <TrendArrow delta={0} label="vs periodo anterior" size="sm" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div>
              <p className="text-lg font-bold" style={{ color: '#ffffff' }}>{avgAttainment.toFixed(0)}%</p>
              <p style={{ color: 'rgba(254, 243, 199, 0.6)', fontSize: '10px' }}>promedio</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: '#34d399' }}>{teamStats?.onTarget ?? 0}</p>
              <p style={{ color: 'rgba(254, 243, 199, 0.6)', fontSize: '10px' }}>en meta</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: '#fbbf24' }}>{teamStats?.coaching ?? 0}</p>
              <p style={{ color: 'rgba(254, 243, 199, 0.6)', fontSize: '10px' }}>coaching</p>
            </div>
          </div>
        </div>

        {/* Acceleration Opportunities */}
        <div className="col-span-12 lg:col-span-8" style={CARD_STYLE}>
          <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Oportunidades de Aceleracion
          </p>
          {data.accelerationOpportunities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.accelerationOpportunities.slice(0, 4).map((signal, i) => {
                const sev = SEVERITY_STYLES[signal.severity] || SEVERITY_STYLES.watch;
                const actionLabel = signal.severity === 'opportunity' ? 'Agendar'
                  : signal.severity === 'watch' ? 'Coaching'
                  : 'Plan';
                return (
                  <div
                    key={i}
                    style={{
                      background: sev.bg,
                      borderLeft: `3px solid ${sev.border}`,
                      borderRadius: '12px',
                      padding: '14px',
                    }}
                  >
                    <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>{signal.entityName}</p>
                    <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>{signal.opportunity}</p>
                    <button
                      className="mt-2 text-xs font-medium px-3 py-1 rounded-md transition-opacity hover:opacity-80"
                      style={{ background: sev.accent, color: '#18181b' }}
                    >
                      {actionLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm" style={{ color: '#71717a' }}>Sin oportunidades de aceleracion identificadas.</p>
          )}
        </div>
      </div>

      {/* ── Row 2: Team Performance (full width) ── */}
      <div style={CARD_STYLE}>
        <div className="flex items-center justify-between mb-4">
          <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Rendimiento del Equipo
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-px h-3" style={{ background: 'rgba(255,255,255,0.4)' }} />
              <span style={{ color: '#71717a', fontSize: '10px' }}>Promedio zona: {avgAttainment.toFixed(0)}%</span>
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {sortedMembers.map((member, idx) => {
            const streak = member.trend.length >= 3 && member.trend.every(v => v >= 100)
              ? member.trend.length
              : 0;
            return (
              <div key={member.entityId} className="flex items-center gap-3">
                {/* Rank */}
                <span className="text-xs tabular-nums font-medium w-5 text-right" style={{ color: '#71717a' }}>
                  {idx + 1}
                </span>
                {/* Name */}
                <span className="text-xs w-28 truncate flex-shrink-0" style={{ color: '#d4d4d8' }}>
                  {member.entityName}
                </span>
                {/* BenchBar */}
                <div className="flex-1">
                  <BenchmarkBar
                    value={member.attainment}
                    benchmark={avgAttainment}
                    label=""
                    rightLabel={
                      <span className="tabular-nums font-medium" style={{
                        color: member.attainment >= 100 ? '#34d399' : member.attainment >= 85 ? '#fbbf24' : '#f87171',
                        fontSize: '11px',
                      }}>
                        {member.attainment.toFixed(0)}%
                      </span>
                    }
                    color={member.attainment >= 100 ? '#34d399' : member.attainment >= 85 ? '#fbbf24' : '#f87171'}
                  />
                </div>
                {/* Sparkline */}
                <div className="w-16 flex-shrink-0">
                  {member.trend.length >= 2 ? (
                    <Sparkline
                      data={member.trend}
                      height={18}
                      width={60}
                      color={member.attainment >= 100 ? '#34d399' : '#fbbf24'}
                    />
                  ) : (
                    <span style={{ color: '#52525b', fontSize: '10px' }}>—</span>
                  )}
                </div>
                {/* Payout */}
                <span className="tabular-nums w-20 text-right flex-shrink-0" style={{ color: '#a1a1aa', fontSize: '11px' }}>
                  {currencySymbol}{member.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                {/* Streak badge */}
                <div className="w-14 flex-shrink-0 text-right">
                  {streak >= 3 && (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)' }}
                    >
                      {streak}m
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
