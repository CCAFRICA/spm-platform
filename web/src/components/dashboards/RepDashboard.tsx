'use client';

/**
 * Rep Dashboard — "Crecer"
 *
 * DS-001 Rep View layout (10 distinct visual forms):
 *   Hero: Full width (emerald gradient + Ring gauge + GoalGradient + Pill badges)
 *   Row 2: Scenario Cards (3-col)
 *   Row 3: Components + Opportunity Map (col-7) + Leaderboard + Pace Clock + Trajectory (col-5)
 *
 * Cognitive Fit Test:
 *   1. Personal payout → HeroMetric (AnimNum, 5xl) — identification
 *   2. Attainment → Ring gauge — monitoring
 *   3. Tier progress → GoalGradient (multi-tier progress bar) — progress
 *   4. Scenario Cards → 3 futures (current/stretch/max) — projection
 *   5. Component breakdown → StackedBar + expandable list — part-of-whole
 *   6. Component Opportunity Map → headroom bars — opportunity
 *   7. Relative position → RelativeLeaderboard (neighbors) — ranking
 *   8. Pace Clock → circular days + run rate — temporal urgency
 *   9. Trajectory → Small multiples (5 months) — comparison over time
 *  10. AI Assessment → AssessmentPanel — intelligence
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { ProgressRing } from '@/components/design-system/ProgressRing';
import { GoalGradientBar } from '@/components/design-system/GoalGradientBar';
import { WhatIfSlider, type TierConfig } from '@/components/design-system/WhatIfSlider';
import { ComponentStack } from '@/components/design-system/ComponentStack';
import { RelativeLeaderboard } from '@/components/design-system/RelativeLeaderboard';
import { TrendArrow } from '@/components/design-system/TrendArrow';
import { useLocale } from '@/contexts/locale-context';
import { AssessmentPanel } from '@/components/design-system/AssessmentPanel';
import {
  getRepDashboardData,
  type RepDashboardData,
} from '@/lib/data/persona-queries';
import { AgentInbox } from '@/components/agents/AgentInbox';
import { InsightPanel } from '@/components/intelligence/InsightPanel';
import { computeRepInsights } from '@/lib/intelligence/insight-engine';
import { RepTrajectoryPanel } from '@/components/intelligence/RepTrajectory';
import { getActiveRuleSet } from '@/lib/supabase/rule-set-service';
import { NextAction } from '@/components/intelligence/NextAction';
import type { NextActionContext } from '@/lib/intelligence/next-action-engine';

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

// Calculate payout for a given attainment using tiers
function calculatePayout(attainment: number, tiers: TierConfig[]): number {
  let payout = 0;
  for (const t of tiers) {
    if (attainment <= t.min) continue;
    const applicable = Math.min(attainment, t.max) - t.min;
    if (applicable > 0) payout += applicable * t.rate;
  }
  return payout;
}

export function RepDashboard() {
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol } = useCurrency();
  const { entityId } = usePersona();
  const { activePeriodId, activePeriodLabel } = usePeriod();
  const { locale } = useLocale();
  const tenantId = currentTenant?.id ?? '';

  const [data, setData] = useState<RepDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null);
  const [ruleSetConfig, setRuleSetConfig] = useState<unknown>(null);

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    // Load dashboard data and rule set config in parallel
    Promise.all([
      getRepDashboardData(tenantId, entityId),
      getActiveRuleSet(tenantId).catch(() => null),
    ]).then(([result, ruleSet]) => {
      if (!cancelled) {
        setData(result);
        setRuleSetConfig(ruleSet?.configuration ?? null);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [tenantId, entityId, activePeriodId]);

  // Build assessment payload (must be before early returns for hooks rule)
  const assessmentData = useMemo(() => {
    if (!data) return {};
    const priorP = data.history.length >= 2 ? data.history[data.history.length - 2].payout : 0;
    const delta = priorP > 0 ? ((data.totalPayout - priorP) / priorP) * 100 : 0;
    return {
      totalPayout: data.totalPayout,
      attainment: data.attainment,
      rank: data.rank,
      totalEntities: data.totalEntities,
      components: data.components.map(c => ({ name: c.name, value: c.value })),
      trendDelta: delta,
      historyMonths: data.history.length,
      tierPosition: data.attainment >= 120 ? 'Accelerator' : data.attainment >= 80 ? 'Target' : 'Base',
    };
  }, [data]);

  // OB-98: Deterministic insight computation
  const repInsights = useMemo(() => {
    if (!data) return [];
    return computeRepInsights(data);
  }, [data]);

  // OB-98 Phase 6: Next-action context
  const nextActionContext = useMemo<NextActionContext | null>(() => {
    if (!data) return null;
    const weakest = data.components.length > 1
      ? [...data.components].sort((a, b) => a.value - b.value)[0]
      : null;
    return {
      persona: 'rep',
      lifecycleState: null,
      hasCalculationResults: data.totalPayout > 0,
      hasReconciliation: false,
      reconciliationMatch: null,
      anomalyCount: 0,
      entityCount: 0,
      repAttainment: data.attainment,
      repBestOpportunityComponent: weakest?.name,
      repBestOpportunityGap: weakest
        ? `${((weakest.value / data.totalPayout) * 100).toFixed(0)}% of total`
        : undefined,
    };
  }, [data]);

  // Scenario cards data (6B) — must be before early returns
  const scenarios = useMemo(() => {
    if (!data) return null;
    const rawTiers: TierConfig[] = [
      { min: 0, max: 80, rate: 0.5, label: 'Base' },
      { min: 80, max: 120, rate: 1.0, label: 'Target' },
      { min: 120, max: 250, rate: 1.5, label: 'Acelerador' },
    ];
    let rawPay = 0;
    for (const t of rawTiers) {
      if (data.attainment <= t.min) continue;
      const applicable = Math.min(data.attainment, t.max) - t.min;
      if (applicable > 0) rawPay += applicable * t.rate;
    }
    const sf = rawPay > 0 ? data.totalPayout / rawPay : 1;
    const scaledTiers = rawTiers.map(t => ({ ...t, rate: t.rate * sf }));

    const stretchAtt = Math.min(data.attainment * 1.1, 150);
    const maxAtt = Math.min(data.attainment * 1.25, 200);

    return {
      current: { attainment: data.attainment, payout: data.totalPayout },
      stretch: { attainment: stretchAtt, payout: calculatePayout(stretchAtt, scaledTiers) },
      maximum: { attainment: maxAtt, payout: calculatePayout(maxAtt, scaledTiers) },
      stretchTier: stretchAtt >= 120 ? 'Acelerador' : stretchAtt >= 100 ? 'Premium' : 'Base',
      maxTier: maxAtt >= 120 ? 'Acelerador' : maxAtt >= 100 ? 'Premium' : 'Base',
    };
  }, [data]);

  // Pace clock data (6C) — must be before early returns
  const paceClock = useMemo(() => {
    if (!data) return null;
    const daysPassed = 15;
    const daysInPeriod = 30;
    const daysRemaining = daysInPeriod - daysPassed;
    const targetGap = 100 - data.attainment;
    const dailyRateNeeded = daysRemaining > 0 && targetGap > 0
      ? (data.totalPayout * (targetGap / data.attainment)) / daysRemaining
      : 0;
    return { daysPassed, daysInPeriod, daysRemaining, dailyRateNeeded, timePct: (daysPassed / daysInPeriod) * 100 };
  }, [data]);

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

  // Trend delta vs prior period
  const priorPayout = data.history.length >= 2 ? data.history[data.history.length - 2].payout : 0;
  const trendDelta = priorPayout > 0 ? ((data.totalPayout - priorPayout) / priorPayout) * 100 : 0;

  // Component opportunity map data (6D)
  const opportunityMap = data.components.length > 0
    ? [...data.components]
        .map(c => {
          const compPct = data.totalPayout > 0 ? (c.value / data.totalPayout) * 100 : 0;
          const headroom = Math.max(100 - compPct * (data.components.length), 0);
          return { name: c.name, value: c.value, pct: compPct, headroom };
        })
        .sort((a, b) => b.headroom - a.headroom)
    : [];

  return (
    <div className="space-y-4">
      <AgentInbox tenantId={currentTenant?.id} persona="rep" />
      {nextActionContext ? <NextAction context={nextActionContext} /> : null}
      <AssessmentPanel
        persona="rep"
        data={assessmentData}
        locale={locale === 'es-MX' ? 'es' : 'en'}
        accentColor="#10b981"
        tenantId={tenantId}
      />
      <InsightPanel
        persona="rep"
        insights={repInsights}
        tenantName={currentTenant?.name || ''}
        periodLabel={activePeriodLabel}
        locale={locale === 'es-MX' ? 'es' : 'en'}
      />
      {/* ── Hero: Full width ── */}
      <div style={HERO_STYLE}>
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <p style={{ color: 'rgba(167, 243, 208, 0.6)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Mi Compensacion · {activePeriodLabel}
            </p>
            <div className="flex items-baseline gap-3 mt-2">
              <p className="text-4xl lg:text-5xl font-bold" style={{ color: '#ffffff' }}>
                {currencySymbol}<AnimatedNumber value={data.totalPayout} />
              </p>
              {priorPayout > 0 && <TrendArrow delta={trendDelta} label="vs periodo anterior" />}
            </div>
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

      {/* ── Scenario Cards (6B) ── */}
      {scenarios && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Current Pace */}
          <div style={{ ...CARD_STYLE, padding: '16px', borderColor: 'rgba(52, 211, 153, 0.3)' }}>
            <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ritmo Actual
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: '#ffffff' }}>
              {currencySymbol}{scenarios.current.payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '4px' }}>
              {scenarios.current.attainment.toFixed(0)}% logro
            </p>
          </div>
          {/* Stretch */}
          <div style={{ ...CARD_STYLE, padding: '16px', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
            <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Estiramiento
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: '#a5b4fc' }}>
              {currencySymbol}{scenarios.stretch.payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '4px' }}>
              {scenarios.stretch.attainment.toFixed(0)}% · {scenarios.stretchTier}
            </p>
          </div>
          {/* Maximum */}
          <div style={{ ...CARD_STYLE, padding: '16px', borderColor: 'rgba(234, 179, 8, 0.3)' }}>
            <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Maximo
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: '#facc15' }}>
              {currencySymbol}{scenarios.maximum.payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '4px' }}>
              {scenarios.maximum.attainment.toFixed(0)}% · {scenarios.maxTier}
            </p>
          </div>
        </div>
      )}

      {/* ── OB-98: Rep Performance Trajectory ── */}
      {data && ruleSetConfig ? (
        <RepTrajectoryPanel data={data} ruleSetConfig={ruleSetConfig} />
      ) : null}

      {/* ── Row 3: Components + Opportunity (7) + Right Column (5) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Component breakdown + Opportunity Map */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {/* Component breakdown */}
          <div style={CARD_STYLE}>
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

          {/* Component Opportunity Map (6D) */}
          {opportunityMap.length > 0 && (
            <div style={CARD_STYLE}>
              <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Mapa de Oportunidad
              </p>
              <div className="space-y-3">
                {opportunityMap.map(comp => {
                  const fillPct = Math.min(comp.pct * data.components.length, 100);
                  const headroomPct = Math.max(100 - fillPct, 0);
                  return (
                    <div key={comp.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ color: '#d4d4d8', fontSize: '12px' }}>{comp.name}</span>
                        <span style={{ color: '#71717a', fontSize: '10px' }}>
                          {headroomPct > 0 && `${headroomPct.toFixed(0)}% headroom`}
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(39,39,42,0.8)', borderRadius: '4px', display: 'flex', overflow: 'hidden' }}>
                        <div style={{
                          width: `${fillPct}%`,
                          background: '#34d399',
                          borderRadius: '4px 0 0 4px',
                          transition: 'width 0.5s ease',
                        }} />
                        {headroomPct > 0 && (
                          <div style={{
                            width: `${headroomPct}%`,
                            background: 'rgba(52, 211, 153, 0.15)',
                            transition: 'width 0.5s ease',
                          }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Leaderboard + Pace Clock + Trajectory + What-If */}
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

          {/* Pace Clock (6C) */}
          {paceClock && (
            <div style={CARD_STYLE}>
              <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Reloj de Ritmo
              </p>
              <div className="flex items-center gap-4">
                {/* Circular progress */}
                <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    {/* Background circle */}
                    <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(39,39,42,0.8)" strokeWidth="6" />
                    {/* Progress arc */}
                    <circle
                      cx="40" cy="40" r="32" fill="none"
                      stroke={data.attainment >= paceClock.timePct ? '#34d399' : '#fbbf24'}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(paceClock.timePct / 100) * 201} 201`}
                      transform="rotate(-90 40 40)"
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700, lineHeight: 1 }}>{data.attainment.toFixed(0)}%</span>
                    <span style={{ color: '#71717a', fontSize: '9px' }}>logro</span>
                  </div>
                </div>
                {/* Stats */}
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <span style={{ color: '#71717a', fontSize: '11px' }}>Dias restantes</span>
                    <span style={{ color: '#e4e4e7', fontSize: '11px', fontWeight: 600 }}>{paceClock.daysRemaining}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#71717a', fontSize: '11px' }}>Dia {paceClock.daysPassed}/{paceClock.daysInPeriod}</span>
                    <span style={{ color: '#a1a1aa', fontSize: '11px' }}>{paceClock.timePct.toFixed(0)}%</span>
                  </div>
                  {paceClock.dailyRateNeeded > 0 && (
                    <div style={{ background: 'rgba(52, 211, 153, 0.08)', borderRadius: '8px', padding: '8px', marginTop: '4px' }}>
                      <p style={{ color: '#34d399', fontSize: '11px', fontWeight: 500 }}>
                        {currencySymbol}{paceClock.dailyRateNeeded.toLocaleString(undefined, { maximumFractionDigits: 0 })}/dia para meta
                      </p>
                    </div>
                  )}
                </div>
              </div>
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
        </div>
      </div>
    </div>
  );
}
