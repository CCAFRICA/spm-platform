'use client';

/**
 * Rep Dashboard — "Crecer"
 *
 * Personal growth view: total payout, goal gradient, what-if slider,
 * component stack with waterfall drill-down, relative leaderboard, pacing.
 * All data from persona-queries.ts getRepDashboardData().
 */

import { useState, useEffect } from 'react';
import { useTenant } from '@/contexts/tenant-context';
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

  // Build default tiers for what-if slider (simplified)
  const defaultTiers: TierConfig[] = [
    { min: 0, max: data.attainment * 0.8, rate: 0.5, label: 'Base' },
    { min: data.attainment * 0.8, max: data.attainment * 1.2, rate: 1.0, label: 'Target' },
    { min: data.attainment * 1.2, max: data.attainment * 2, rate: 1.5, label: 'Acelerador' },
  ];

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
              $<AnimatedNumber value={data.totalPayout} />
            </p>
            <p className="text-emerald-100/60 text-sm mt-1">Cada peso explicado</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-emerald-100/50">
              <span>{activePeriodLabel}</span>
              <span>Logro: {data.attainment.toFixed(1)}%</span>
              {data.rank > 0 && <span>Posicion: #{data.rank} de {data.totalEntities}</span>}
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
            currency="MX$"
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
                  {c.name}: ${c.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </button>
              ))}
            </div>
            {expandedComponent && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <h5 className="text-xs text-zinc-400 mb-2">Detalle: {expandedComponent}</h5>
                <CalculationWaterfall steps={waterfallSteps} currency="MX$" />
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
    </div>
  );
}
