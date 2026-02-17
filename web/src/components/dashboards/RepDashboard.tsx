'use client';

/**
 * Rep Dashboard — "Crecer"
 *
 * DS-001 Rep View layout (7 distinct visual forms):
 *   Hero: Full width (emerald gradient + Ring gauge + GoalGradient + Pill badges)
 *   Row 2: Components (col-7) + Leaderboard + Trajectory + Actions (col-5)
 *
 * Cognitive Fit Test:
 *   1. Personal payout → HeroMetric (AnimNum, 5xl) — identification
 *   2. Attainment → Ring gauge — monitoring
 *   3. Tier progress → GoalGradient (multi-tier progress bar) — progress
 *   4. Component breakdown → StackedBar + expandable list — part-of-whole
 *   5. Relative position → RelativeLeaderboard (neighbors) — ranking
 *   6. Trajectory → Small multiples (5 months) — comparison over time
 *   7. Actions → Card buttons (Simulador, Mi Plan) — selection
 */

import { useState, useEffect } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { ProgressRing } from '@/components/design-system/ProgressRing';
import { GoalGradientBar } from '@/components/design-system/GoalGradientBar';
import { WhatIfSlider, type TierConfig } from '@/components/design-system/WhatIfSlider';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { RelativeLeaderboard } from '@/components/design-system/RelativeLeaderboard';
import {
  getRepDashboardData,
  type RepDashboardData,
} from '@/lib/data/persona-queries';

const HERO_STYLE = {
  background: 'linear-gradient(to bottom right, rgba(5, 150, 105, 0.7), rgba(13, 148, 136, 0.7))',
  border: '1px solid rgba(52, 211, 153, 0.2)',
  borderRadius: '16px',
  padding: '24px',
};

const CARD_STYLE = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '16px',
  padding: '20px',
};

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
        <p style={{ color: '#a1a1aa' }}>No hay resultados de compensacion para este periodo.</p>
        <p className="text-sm" style={{ color: '#52525b' }}>Tus resultados apareceran aqui cuando se ejecute el calculo.</p>
      </div>
    );
  }

  // Scale tiers so calculatePayout(current) = actual payout
  const rawTiers: TierConfig[] = [
    { min: 0, max: 80, rate: 0.5, label: 'Base' },
    { min: 80, max: 120, rate: 1.0, label: 'Target' },
    { min: 120, max: 250, rate: 1.5, label: 'Acelerador' },
  ];
  let rawPayout = 0;
  for (const t of rawTiers) {
    if (data.attainment <= t.min) continue;
    const applicable = Math.min(data.attainment, t.max) - t.min;
    if (applicable > 0) rawPayout += applicable * t.rate;
  }
  const scaleFactor = rawPayout > 0 ? data.totalPayout / rawPayout : 1;
  const defaultTiers: TierConfig[] = rawTiers.map(t => ({ ...t, rate: t.rate * scaleFactor }));

  // Ring gauge capped at 100% for display
  const ringPct = Math.min(data.attainment, 200);
  const ringColor = data.attainment >= 100 ? '#34d399' : data.attainment >= 80 ? '#fbbf24' : '#f87171';

  return (
    <div className="space-y-4">
      {/* ── Hero: Full width ── */}
      <div style={HERO_STYLE}>
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <p style={{ color: 'rgba(167, 243, 208, 0.6)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Mi Compensacion · {activePeriodLabel}
            </p>
            <p className="text-4xl lg:text-5xl font-bold mt-2" style={{ color: '#ffffff' }}>
              {currencySymbol}<AnimatedNumber value={data.totalPayout} />
            </p>
            {/* Pill badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              {data.rank > 0 && data.totalEntities > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                  #{data.rank} de {data.totalEntities}
                </span>
              )}
              {data.attainment >= 100 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#6ee7b7', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                  Certificado
                </span>
              )}
              {data.history.length >= 3 && data.history.slice(-3).every(h => h.payout > 0) && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                  {data.history.length} meses
                </span>
              )}
            </div>
            {/* GoalGradient */}
            <div className="mt-4">
              <GoalGradientBar
                currentPct={data.attainment}
                tiers={[
                  { pct: 0, label: '0%' },
                  { pct: 80, label: 'Base' },
                  { pct: 100, label: 'Premium' },
                  { pct: 150, label: 'Elite' },
                ]}
              />
            </div>
          </div>
          {/* Ring gauge */}
          <div className="flex-shrink-0 hidden md:block">
            <ProgressRing pct={Math.min(ringPct / 1.5, 100)} size={100} stroke={8} color={ringColor}>
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: '#ffffff' }}>{data.attainment.toFixed(0)}%</p>
                <p style={{ color: 'rgba(167, 243, 208, 0.6)', fontSize: '9px' }}>logro</p>
              </div>
            </ProgressRing>
          </div>
        </div>
      </div>

      {/* ── Row 2: Components (7) + Leaderboard + Trajectory + Actions (5) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Component breakdown */}
        <div className="col-span-12 lg:col-span-7" style={CARD_STYLE}>
          <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Cada Peso Explicado
          </p>
          {data.components.length > 0 ? (
            <div className="space-y-3">
              <ComponentStack components={data.components} total={data.totalPayout} />
              <div className="space-y-1 mt-3">
                {data.components.map(c => (
                  <button
                    key={c.name}
                    onClick={() => setExpandedComponent(expandedComponent === c.name ? null : c.name)}
                    className="w-full flex items-center justify-between py-2 px-2 rounded-lg transition-colors"
                    style={{
                      background: expandedComponent === c.name ? 'rgba(52, 211, 153, 0.08)' : 'transparent',
                    }}
                  >
                    <span className="text-xs" style={{ color: '#d4d4d8' }}>{c.name}</span>
                    <span className="text-xs tabular-nums font-medium" style={{ color: '#a1a1aa' }}>
                      {currencySymbol}{c.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </button>
                ))}
                <div className="flex items-center justify-between pt-2 mt-2" style={{ borderTop: '1px solid rgba(39, 39, 42, 0.6)' }}>
                  <span className="text-xs font-medium" style={{ color: '#e4e4e7' }}>Total</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#ffffff' }}>
                    {currencySymbol}{data.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: '#71717a' }}>Sin desglose de componentes.</p>
          )}
        </div>

        {/* Right column: Leaderboard + Trajectory + Actions */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Relative Leaderboard */}
          {data.neighbors.length > 0 && (
            <div style={CARD_STYLE}>
              <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Tu Posicion Relativa
              </p>
              <RelativeLeaderboard
                yourRank={data.rank}
                yourName="Tu"
                neighbors={data.neighbors}
              />
            </div>
          )}

          {/* Trajectory */}
          {data.history.length > 0 && (
            <div style={CARD_STYLE}>
              <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Trayectoria
              </p>
              <div className="grid grid-cols-5 gap-2">
                {data.history.slice(-5).map((h, i) => (
                  <div key={i} className="text-center p-2 rounded-lg" style={{ background: 'rgba(39, 39, 42, 0.5)' }}>
                    <p style={{ color: '#71717a', fontSize: '10px' }} className="truncate">{h.period}</p>
                    <p className="text-sm font-bold tabular-nums mt-1" style={{ color: '#e4e4e7' }}>
                      {currencySymbol}{h.payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What-If */}
          <div style={CARD_STYLE}>
            <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              Que Pasaria Si...
            </p>
            <WhatIfSlider
              currentValue={data.attainment}
              currentPayout={data.totalPayout}
              tiers={defaultTiers}
              currency={currencySymbol}
            />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="cursor-pointer transition-all"
              style={{
                ...CARD_STYLE,
                padding: '14px',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(52, 211, 153, 0.3)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(39, 39, 42, 0.6)'; }}
            >
              <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>Simulador</p>
              <p style={{ color: '#71717a', fontSize: '10px', marginTop: '4px' }}>Proyecta escenarios</p>
            </div>
            <div
              className="cursor-pointer transition-all"
              style={{
                ...CARD_STYLE,
                padding: '14px',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(52, 211, 153, 0.3)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(39, 39, 42, 0.6)'; }}
            >
              <p className="text-sm font-medium" style={{ color: '#e4e4e7' }}>Mi Plan</p>
              <p style={{ color: '#71717a', fontSize: '10px', marginTop: '4px' }}>Revisa tu plan</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
