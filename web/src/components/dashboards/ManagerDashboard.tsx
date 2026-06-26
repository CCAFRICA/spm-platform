'use client';

/**
 * Manager Dashboard — "Acelerar"
 *
 * DS-001 Manager View layout (8 distinct visual forms):
 *   Row 1: Zone Hero (col-4) + Pacing (col-3) + Acceleration Opportunities (col-5)
 *   Row 2: Team Performance with Momentum (full width)
 *
 * Cognitive Fit Test:
 *   1. Zone total → HeroMetric (AnimNum) — identification
 *   2. Pacing indicator → progress + run rate — monitoring
 *   3. Acceleration opportunities → Prescriptive action cards — selection/decision
 *   4. Team performance → BenchBar per person — comparison
 *   5. Individual trajectory → Sparkline — monitoring
 *   6. Momentum index → Weighted arrows — trend
 *   7. Streak recognition → Pill badge — identification (achievement)
 *   8. AI Assessment → AssessmentPanel — intelligence
 */

import { useState, useEffect, useMemo } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { Sparkline } from '@/components/design-system/Sparkline';
import { TrendArrow } from '@/components/design-system/TrendArrow';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { AssessmentPanel } from '@/components/design-system/AssessmentPanel';
import {
  getManagerDashboardData,
  type ManagerDashboardData,
} from '@/lib/data/persona-queries';
import { AgentInbox } from '@/components/agents/AgentInbox';
import { InsightPanel } from '@/components/intelligence/InsightPanel';
import { computeManagerInsights } from '@/lib/intelligence/insight-engine';
import { NextAction } from '@/components/intelligence/NextAction';
import type { NextActionContext } from '@/lib/intelligence/next-action-engine';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useAuth } from '@/contexts/auth-context'; // OB-246: manager-scoped drill-through from useAuth().scope
import { getPeriodsWithResults } from '@/lib/drill-through'; // OB-226 C
import { DrillThroughPanel } from '@/components/drill-through'; // OB-226 C

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

// HF-315: Vialuce surfaces — dark zinc cards regress on the white page. The Manager hero
// keeps its gold identity (the Vialuce signal accent); section cards become the .card surface.
const VL_HERO_STYLE = {
  background: 'linear-gradient(135deg, var(--vl-raw-gold) 0%, #C98A1E 100%)',
  border: '1px solid var(--vl-line)',
  borderRadius: 'var(--vl-r-lg)',
  padding: '20px',
  boxShadow: 'var(--vl-sh-1)',
};

const VL_CARD_STYLE = {
  background: 'var(--vl-surface)',
  border: '1px solid var(--vl-line)',
  borderRadius: 'var(--vl-r-lg)',
  padding: '20px',
  boxShadow: 'var(--vl-sh-1)',
};

// HF-315: section eyebrow + value text that read on white under Vialuce.
const VL_LABEL = 'var(--vl-text-soft)';   // replaces #71717a section labels
const VL_VALUE = 'var(--vl-text)';        // replaces #e4e4e7 / #d4d4d8 strong values
const VL_MUTED = 'var(--vl-text-muted)';  // replaces #a1a1aa secondary text
const VL_TRACK = '#EEF0F6';               // replaces dark rgba(39,39,42,0.8) progress tracks

const SEVERITY_STYLES: Record<string, { bg: string; border: string; accent: string }> = {
  opportunity: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', accent: '#34d399' },
  watch: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', accent: '#fbbf24' },
  critical: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', accent: '#f87171' },
  proximity: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.4)', accent: '#fbbf24' },
};

// Tier thresholds for proximity detection
const TIER_THRESHOLDS = [
  { pct: 80, label: 'Base', labelEs: 'Base' },
  { pct: 100, label: 'Premium', labelEs: 'Premium' },
  { pct: 120, label: 'Accelerator', labelEs: 'Acelerador' },
];

// Compute momentum index: weighted 3-period delta (most recent 3x, middle 2x, oldest 1x)
function computeMomentum(trend: number[]): { symbol: string; color: string; label: string } | null {
  if (trend.length < 3) return null;
  const recent = trend.slice(-3);
  const d1 = recent[2] - recent[1]; // most recent delta
  const d2 = recent[1] - recent[0]; // middle delta
  const weighted = (d1 * 3 + d2 * 2) / 5;

  if (weighted > 5) return { symbol: '↑↑', color: '#34d399', label: 'Strong improving' };
  if (weighted > 1) return { symbol: '↑', color: '#34d399', label: 'Improving' };
  if (weighted > -1) return { symbol: '→', color: '#fbbf24', label: 'Stable' };
  if (weighted > -5) return { symbol: '↓', color: '#f87171', label: 'Declining' };
  return { symbol: '↓↓', color: '#f87171', label: 'Rapid decline' };
}

export function ManagerDashboard() {
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol, format } = useCurrency();
  const { scope } = usePersona();
  // OB-246: drill-through scope comes straight from the authenticated scope (team/own/deny — fail-closed).
  const { scope: authScope } = useAuth();
  const { activePeriodId, activePeriodLabel } = usePeriod();
  const { locale } = useLocale();
  const tenantId = currentTenant?.id ?? '';
  const isSpanish = isSpanishLocale(locale);
  const isVialuce = useIsVialuce(); // HF-315: dark zinc DS-001 cards → design-spec .card surfaces + readable text
  // Theme-aware surface + section text. Non-Vialuce keeps the exact dark literals (byte-identical).
  const cardStyle = isVialuce ? VL_CARD_STYLE : CARD_STYLE;
  const heroStyle = isVialuce ? VL_HERO_STYLE : HERO_STYLE;
  const labelColor = isVialuce ? VL_LABEL : '#71717a';
  const valueColor = isVialuce ? VL_VALUE : '#e4e4e7';
  const mutedColor = isVialuce ? VL_MUTED : '#a1a1aa';
  const trackColor = isVialuce ? VL_TRACK : 'rgba(39,39,42,0.8)';

  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // OB-246: the team drill-through uses the authenticated scope (useAuth().scope). A manager with no
  // profile_scope row now fails CLOSED (own entity, or deny if unlinked) — NOT the whole tenant (the
  // OB-226 C fail-open is the DIAG-077 AP4 defect this OB closes). Only the latest period is loaded here.
  const [drillPeriodId, setDrillPeriodId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const periods = await getPeriodsWithResults(tenantId);
        if (cancelled) return;
        setDrillPeriodId(periods[0]?.id);
      } catch {
        // swallow — the empty state handles a genuinely empty result
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

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

  // Tier proximity alerts (5A)
  const tierProximityAlerts = useMemo(() => {
    if (!data) return [];
    const alerts: Array<{ entityName: string; attainment: number; tierLabel: string; distance: number }> = [];
    for (const member of data.teamMembers) {
      for (const tier of TIER_THRESHOLDS) {
        const distance = tier.pct - member.attainment;
        if (distance > 0 && distance <= 10) {
          alerts.push({
            entityName: member.entityName,
            attainment: member.attainment,
            tierLabel: tier.label,
            distance,
          });
          break; // only closest tier
        }
      }
    }
    return alerts.sort((a, b) => a.distance - b.distance).slice(0, 3);
  }, [data]);

  // Pacing indicator (5C)
  // OB-104 F10: Return null when teamTotal is 0 (no calculation data) to avoid "Behind Pace MX$0/day"
  const pacing = useMemo(() => {
    if (!data || data.teamMembers.length === 0) return null;
    if (data.teamTotal === 0) return null;
    // Estimate: assume we're midway through the period
    const daysPassed = 15;
    const daysInPeriod = 30;
    const dailyRate = data.teamTotal / Math.max(daysPassed, 1);
    const targetTotal = data.teamTotal * (100 / Math.max(avgAttainment, 1));
    const targetDailyRate = targetTotal / daysInPeriod;
    const projectedPct = daysInPeriod > 0 ? (dailyRate * daysInPeriod / Math.max(targetTotal, 1)) * 100 : 0;
    const isOnPace = avgAttainment >= (daysPassed / daysInPeriod) * 100 * 0.95;
    return {
      isOnPace,
      dailyRate,
      targetDailyRate,
      projectedPct: Math.min(projectedPct, 200),
      daysPassed,
      daysInPeriod,
      daysRemaining: daysInPeriod - daysPassed,
    };
  }, [data, avgAttainment]);

  // Build assessment payload (must be before early returns for hooks rule)
  const assessmentData = useMemo(() => {
    if (!data || data.teamMembers.length === 0) return {};
    return {
      teamTotal: data.teamTotal,
      avgAttainment,
      onTarget: teamStats?.onTarget ?? 0,
      coaching: teamStats?.coaching ?? 0,
      teamSize: data.teamMembers.length,
      accelerationSignals: data.accelerationOpportunities.length,
      members: data.teamMembers.map(m => ({
        name: m.entityName,
        attainment: m.attainment,
        payout: m.totalPayout,
        trendLength: m.trend.length,
        streak: m.trend.length >= 3 && m.trend.every(v => v >= 100) ? m.trend.length : 0,
      })),
    };
  }, [data, avgAttainment, teamStats]);

  // OB-98: Deterministic insight computation
  const managerInsights = useMemo(() => {
    if (!data) return [];
    return computeManagerInsights(data);
  }, [data]);

  // OB-98 Phase 6: Next-action context
  const nextActionContext = useMemo<NextActionContext | null>(() => {
    if (!data) return null;
    return {
      persona: 'manager',
      lifecycleState: null,
      hasCalculationResults: data.teamTotal > 0,
      hasReconciliation: false,
      reconciliationMatch: null,
      anomalyCount: 0,
      entityCount: data.teamMembers.length,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data || data.teamMembers.length === 0) {
    // OB-246: the team drill-through renders the manager's authenticated scope (team via profile_scope,
    // else own entity, else deny → honest empty). The DrillThroughPanel shows the empty message below
    // when the scope genuinely has no results (e.g. a manager with no team assignment and no own entity).
    const emptyMessage = isSpanish
      ? 'No hay asignaciones de equipo configuradas. Asigna entidades a los gerentes en Configurar → Personas.'
      : 'No team assignments configured. Assign entities to managers in Configure → People.';

    if (!tenantId) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div style={cardStyle}>
          <p style={{ color: labelColor, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            {isSpanish ? 'Rendimiento del Equipo' : 'Team Performance'}
          </p>
          <DrillThroughPanel
            tenantId={tenantId}
            scope={authScope}
            periodId={drillPeriodId}
            emptyMessage={emptyMessage}
          />
          <div className="mt-4 flex flex-wrap gap-4">
            <a
              href="/configure/people"
              className="text-sm transition-colors"
              style={{ color: isVialuce ? 'var(--vialuce-indigo)' : '#fbbf24' }}
            >
              {isSpanish ? 'Asignar equipo' : 'Assign team'} →
            </a>
            <a
              href="/operate/results"
              className="text-sm transition-colors"
              style={{ color: isVialuce ? 'var(--vialuce-indigo)' : '#fbbf24' }}
            >
              {isSpanish ? 'Ver todos los resultados' : 'View all results'} →
            </a>
          </div>
        </div>
      </div>
    );
  }

  const sortedMembers = [...data.teamMembers].sort((a, b) => b.attainment - a.attainment);

  // Merge tier proximity into acceleration opportunities
  const allOpportunities = [
    ...tierProximityAlerts.map(alert => ({
      entityName: alert.entityName,
      opportunity: `${alert.distance.toFixed(0)}% from ${alert.tierLabel} tier. Focus coaching this week.`,
      severity: 'proximity' as const,
    })),
    ...data.accelerationOpportunities.slice(0, 4 - tierProximityAlerts.length),
  ].slice(0, 4);

  return (
    <div className="space-y-4">
      <AgentInbox tenantId={currentTenant?.id} persona="manager" />
      {nextActionContext ? <NextAction context={nextActionContext} /> : null}
      <AssessmentPanel
        persona="manager"
        data={assessmentData}
        locale={isSpanishLocale(locale) ? 'es' : 'en'}
        accentColor="#f59e0b"
        tenantId={tenantId}
      />
      <InsightPanel
        persona="manager"
        insights={managerInsights}
        tenantName={currentTenant?.name || ''}
        periodLabel={activePeriodLabel}
        locale={isSpanishLocale(locale) ? 'es' : 'en'}
      />
      {/* ── Row 1: Zone Hero (4) + Pacing (3) + Acceleration (5) ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Zone Hero */}
        <div className="col-span-12 lg:col-span-4" style={heroStyle}>
          <p style={{ color: 'rgba(254, 243, 199, 0.6)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Total del Equipo
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: '#ffffff' }}>
            {currencySymbol}<AnimatedNumber value={data.teamTotal} />
          </p>
          <div className="mt-1">
            <TrendArrow delta={0} label="vs periodo anterior" size="sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
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

        {/* Pacing Indicator (5C) */}
        {pacing && (
          <div className="col-span-12 lg:col-span-3" style={cardStyle}>
            <p style={{ color: labelColor, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              Pacing
            </p>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="px-2 py-0.5 rounded-md text-xs font-semibold"
                style={{
                  background: pacing.isOnPace ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                  color: pacing.isOnPace ? '#34d399' : '#fbbf24',
                  border: `1px solid ${pacing.isOnPace ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
                }}
              >
                {pacing.isOnPace ? 'On Pace' : 'Behind Pace'}
              </span>
            </div>
            {/* Days progress bar */}
            <div style={{ marginBottom: '12px' }}>
              <div className="flex justify-between mb-1">
                <span style={{ color: labelColor, fontSize: '10px' }}>Day {pacing.daysPassed}/{pacing.daysInPeriod}</span>
                <span style={{ color: mutedColor, fontSize: '10px' }}>{pacing.daysRemaining}d left</span>
              </div>
              <div style={{ height: '4px', background: trackColor, borderRadius: '2px' }}>
                <div style={{
                  height: '4px',
                  borderRadius: '2px',
                  width: `${(pacing.daysPassed / pacing.daysInPeriod) * 100}%`,
                  background: pacing.isOnPace ? '#34d399' : '#fbbf24',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span style={{ color: labelColor, fontSize: '11px' }}>Run rate</span>
                <span style={{ color: valueColor, fontSize: '11px', fontWeight: 500 }}>
                  {format(pacing.dailyRate)}/day
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: labelColor, fontSize: '11px' }}>Target</span>
                <span style={{ color: mutedColor, fontSize: '11px' }}>
                  {format(pacing.targetDailyRate)}/day
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: labelColor, fontSize: '11px' }}>Projected</span>
                <span style={{ color: pacing.projectedPct >= 100 ? '#34d399' : '#fbbf24', fontSize: '11px', fontWeight: 500 }}>
                  {pacing.projectedPct.toFixed(0)}% of target
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Acceleration Opportunities (with tier proximity 5A) */}
        <div className={`col-span-12 ${pacing ? 'lg:col-span-5' : 'lg:col-span-8'}`} style={cardStyle}>
          <p style={{ color: labelColor, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Oportunidades de Aceleracion
          </p>
          {allOpportunities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allOpportunities.map((signal, i) => {
                const sev = SEVERITY_STYLES[signal.severity] || SEVERITY_STYLES.watch;
                const actionLabel = signal.severity === 'opportunity' ? 'Agendar'
                  : signal.severity === 'proximity' ? 'Focus'
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
                    <p className="text-sm font-medium" style={{ color: valueColor }}>{signal.entityName}</p>
                    <p className="text-xs mt-1" style={{ color: mutedColor }}>{signal.opportunity}</p>
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
            <p className="text-sm" style={{ color: labelColor }}>Sin oportunidades de aceleracion identificadas.</p>
          )}
        </div>
      </div>

      {/* ── Row 2: Team Performance with Momentum (full width) ── */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <p style={{ color: labelColor, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Rendimiento del Equipo
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-px h-3" style={{ background: 'rgba(255,255,255,0.4)' }} />
              <span style={{ color: labelColor, fontSize: '10px' }}>Promedio zona: {avgAttainment.toFixed(0)}%</span>
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {sortedMembers.map((member, idx) => {
            const streak = member.trend.length >= 3 && member.trend.every(v => v >= 100)
              ? member.trend.length
              : 0;
            const momentum = computeMomentum(member.trend);
            return (
              <div key={member.entityId} className="flex items-center gap-3">
                {/* Rank */}
                <span className="text-xs tabular-nums font-medium w-5 text-right" style={{ color: labelColor }}>
                  {idx + 1}
                </span>
                {/* Name */}
                <span className="text-xs w-28 truncate flex-shrink-0" style={{ color: valueColor }}>
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
                {/* Momentum (5B) */}
                <div className="w-8 flex-shrink-0 text-center">
                  {momentum ? (
                    <span style={{ color: momentum.color, fontSize: '13px', fontWeight: 600 }} title={momentum.label}>
                      {momentum.symbol}
                    </span>
                  ) : (
                    <span style={{ color: '#52525b', fontSize: '10px' }}>—</span>
                  )}
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
                <span className="tabular-nums w-20 text-right flex-shrink-0" style={{ color: mutedColor, fontSize: '11px' }}>
                  {format(member.totalPayout)}
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
