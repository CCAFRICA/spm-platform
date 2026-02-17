'use client';

/**
 * Rep Dashboard — "Crecer"
 *
 * Personal growth view: total payout, goal gradient, what-if slider,
 * component stack with waterfall drill-down, relative leaderboard, pacing.
 * All data from persona-queries.ts getRepDashboardData().
 */

import { useState, useEffect } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { GoalGradientBar } from '@/components/design-system/GoalGradientBar';
import { WhatIfSlider, type TierConfig } from '@/components/design-system/WhatIfSlider';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { CalculationWaterfall, type WaterfallStep } from '@/components/design-system/CalculationWaterfall';
import { RelativeLeaderboard } from '@/components/design-system/RelativeLeaderboard';
import { PacingCone } from '@/components/design-system/PacingCone';
import {
  getRepDashboardData,
  type RepDashboardData,
} from '@/lib/data/persona-queries';

export function RepDashboard() {
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol } = useCurrency();
  const { entityId } = usePersona();
  const { activePeriodId, activePeriodLabel } = usePeriod();
  const tenantId = currentTenant?.id ?? '';

  const [data, setData] = useState<RepDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    getRepDashboardData(tenantId, entityId).then(result => {
      if (!cancelled) {
        setData(result);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [tenantId, entityId, activePeriodId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data || data.totalPayout === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-zinc-400">No hay resultados de compensacion para este periodo.</p>
        <p className="text-sm text-zinc-600">Tus resultados apareceran aqui cuando se ejecute el calculo.</p>
      </div>
    );
  }

  // Build tiers for what-if slider, scaled so calculatePayout(currentAttainment) ≈ totalPayout
  // Without scaling, rates multiply against percentage points giving nonsensical results
  const rawTiers: TierConfig[] = [
    { min: 0, max: 80, rate: 0.5, label: 'Base' },
    { min: 80, max: 120, rate: 1.0, label: 'Target' },
    { min: 120, max: 250, rate: 1.5, label: 'Acelerador' },
  ];
  // Calculate raw payout at current attainment to derive scale factor
  let rawPayout = 0;
  for (const t of rawTiers) {
    if (data.attainment <= t.min) continue;
    const applicable = Math.min(data.attainment, t.max) - t.min;
    if (applicable > 0) rawPayout += applicable * t.rate;
  }
  const scaleFactor = rawPayout > 0 ? data.totalPayout / rawPayout : 1;
  const defaultTiers: TierConfig[] = rawTiers.map(t => ({
    ...t,
    rate: t.rate * scaleFactor,
  }));

  // Build waterfall for expanded component
  const waterfallSteps: WaterfallStep[] = data.components.map(c => ({
    label: c.name,
    value: c.value,
    type: 'add' as const,
  }));
  waterfallSteps.push({
    label: 'Total',
    value: data.totalPayout,
    type: 'total' as const,
  });

  // Pacing history from trend data
  const pacingHistory = data.history.map(h => h.payout);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-600/80 to-lime-700/80 rounded-2xl p-6 border border-emerald-500/20">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-emerald-100/50 text-sm">Mi Pago Total</p>
            <p className="text-3xl font-bold text-white mt-1">
              {currencySymbol}<AnimatedNumber value={data.totalPayout} />
            </p>
            <p className="text-emerald-100/60 text-sm mt-1">Cada peso explicado</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-emerald-100/50">
              <span>{activePeriodLabel}</span>
              <span>Logro: {data.attainment.toFixed(1)}%</span>
              {data.rank > 0 && data.totalPayout > 0 && <span>Posicion: #{data.rank} de {data.totalEntities}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Goal Gradient + What-If */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Progreso hacia Meta</h4>
          <GoalGradientBar
            currentPct={data.attainment}
            tiers={[
              { pct: 80, label: 'Base' },
              { pct: 100, label: 'Target' },
              { pct: 120, label: 'Acelerador' },
            ]}
          />
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Que Pasaria Si...</h4>
          <WhatIfSlider
            currentValue={data.attainment}
            currentPayout={data.totalPayout}
            tiers={defaultTiers}
            currency={currencySymbol}
          />
        </div>
      </div>

      {/* Component Stack + Waterfall Drill-down */}
      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
        <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Componentes de Compensacion</h4>
        {data.components.length > 0 ? (
          <div className="space-y-3">
            <ComponentStack
              components={data.components}
              total={data.totalPayout}
            />
            {/* Click any component legend to expand waterfall */}
            <div className="flex flex-wrap gap-2 mt-2">
              {data.components.map(c => (
                <button
                  key={c.name}
                  onClick={() => setExpandedComponent(expandedComponent === c.name ? null : c.name)}
                  className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                    expandedComponent === c.name
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {c.name}: {currencySymbol}{c.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </button>
              ))}
            </div>
            {expandedComponent && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <h5 className="text-xs text-zinc-400 mb-2">Detalle: {expandedComponent}</h5>
                <CalculationWaterfall steps={waterfallSteps} currency={currencySymbol} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Sin desglose de componentes.</p>
        )}
      </div>

      {/* Relative Leaderboard */}
      {data.neighbors.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Tu Posicion Relativa</h4>
          <RelativeLeaderboard
            yourRank={data.rank}
            yourName="Tu"
            neighbors={data.neighbors}
          />
        </div>
      )}

      {/* Pacing Cone */}
      {pacingHistory.length > 1 && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Ritmo y Proyeccion</h4>
          <PacingCone
            history={pacingHistory}
            daysRemaining={15}
            daysTotal={30}
            tiers={[
              { threshold: data.totalPayout * 0.8, label: 'Base' },
              { threshold: data.totalPayout, label: 'Target' },
              { threshold: data.totalPayout * 1.2, label: 'Acelerador' },
            ]}
          />
        </div>
      )}

      {/* Trajectory History */}
      {data.history.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Trayectoria</h4>
          <div className="grid grid-cols-5 gap-2">
            {data.history.slice(-5).map((h, i) => (
              <div key={i} className="text-center p-2 rounded-lg bg-zinc-800/50">
                <p className="text-[10px] text-zinc-500 truncate">{h.period}</p>
                <p className="text-sm font-bold text-zinc-200 tabular-nums mt-1">
                  {currencySymbol}{h.payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 hover:border-emerald-500/30 transition-colors cursor-pointer">
          <p className="text-sm font-medium text-zinc-200">Simulador</p>
          <p className="text-[10px] text-zinc-500 mt-1">Proyecta tu pago con distintos escenarios</p>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5 hover:border-emerald-500/30 transition-colors cursor-pointer">
          <p className="text-sm font-medium text-zinc-200">Mi Plan</p>
          <p className="text-[10px] text-zinc-500 mt-1">Revisa tu plan de compensacion completo</p>
        </div>
      </div>
    </div>
  );
}
