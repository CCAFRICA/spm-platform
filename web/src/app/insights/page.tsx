'use client';

/**
 * OB-234 T2-3 — Intelligence · Overview (/insights). Glanceable state: the authoritative period total,
 * composition, and standings. End-State A: every value reads getCalculatedPeriods / getEntityResults /
 * getComponentTotals (calculation_results / entity_period_outcomes) — zero committed_data.
 *
 * DS-003 composition: HeroMetric (Identification, dominant) + StackedBar (part-of-whole) + HorizontalBar
 * (ranked comparison) + DistributionPosition (population ranking) = 4 component types (Diversity Minimum).
 * Every viz carries a reference frame. Persona density filters which elements render (Rule 4).
 *
 * This is the REFERENCE surface for the OB-234 redesign — the other 7 surfaces mirror its structure.
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Award, BarChart3, DollarSign, Target, Users } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import {
  getCalculatedPeriods,
  getComponentTotals,
  ALL_INSIGHTS_SCOPE,
  type PeriodSummary,
  type ComponentTotal,
} from '@/lib/insights';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { PeriodCards } from '@/components/insights';
import {
  PersonaAmbient,
  DensityGate,
  usePersonaTheme,
  HeroMetric,
  StackedBar,
  HorizontalBar,
  DistributionPosition,
  Panel,
  TEXT,
} from '@/components/insights/ds003';

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof Users }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${TEXT.body}`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TEXT.headline}`}>{value}</div>
      <div className={`text-xs ${TEXT.muted}`}>{hint}</div>
    </div>
  );
}

export default function InsightsPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const theme = usePersonaTheme();

  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [rows, setRows] = useState<EntityResult[]>([]);
  const [componentTotals, setComponentTotals] = useState<ComponentTotal[]>([]);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Periods (canonical getCalculatedPeriods, start_date DESC).
  useEffect(() => {
    if (!currentTenant) return;
    let cancelled = false;
    getCalculatedPeriods(currentTenant.id)
      .then((ps) => {
        if (cancelled) return;
        setPeriods(ps);
        setSelectedPeriodId(ps[0]?.period_id ?? '');
        setPeriodsLoaded(true);
        if (ps.length === 0) setIsLoading(false);
      })
      .catch((err) => { console.warn('[Insights] periods load failed:', err); setPeriodsLoaded(true); setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant]);

  // Selected period outcomes + component totals.
  useEffect(() => {
    if (!currentTenant || !selectedPeriodId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      getEntityResults(currentTenant.id, ALL_INSIGHTS_SCOPE, { periodId: selectedPeriodId }),
      getComponentTotals(currentTenant.id, selectedPeriodId),
    ])
      .then(([rs, ct]) => { if (cancelled) return; setRows(rs); setComponentTotals(ct); setIsLoading(false); })
      .catch((err) => { console.warn('[Insights] period data load failed:', err); if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant, selectedPeriodId]);

  const selectedIdx = useMemo(() => periods.findIndex((p) => p.period_id === selectedPeriodId), [periods, selectedPeriodId]);

  const insights = useMemo(() => {
    if (rows.length === 0) return null;
    const totalPayout = rows.reduce((s, r) => s + (r.totalPayout || 0), 0);
    const avgPayout = totalPayout / rows.length;
    const sorted = [...rows].sort((a, b) => (b.totalPayout || 0) - (a.totalPayout || 0));
    const prior = selectedIdx >= 0 ? periods[selectedIdx + 1] : undefined;
    const priorTotal = prior?.total_payout ?? null;
    const delta = priorTotal != null && priorTotal > 0 ? (totalPayout - priorTotal) / priorTotal : null;
    return {
      totalPayout,
      avgPayout,
      entityCount: rows.length,
      top: sorted[0] ?? null,
      topFive: sorted.slice(0, 5),
      values: rows.map((r) => r.totalPayout || 0),
      delta,
      priorLabel: prior?.label ?? null,
    };
  }, [rows, periods, selectedIdx]);

  // Loading shell.
  if (isLoading && !periodsLoaded) {
    return (
      <PersonaAmbient>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
            <p className={TEXT.body}>Loading intelligence…</p>
          </div>
        </div>
      </PersonaAmbient>
    );
  }

  // No calculated periods → honest onboarding.
  if (periodsLoaded && periods.length === 0) {
    return (
      <PersonaAmbient>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <BarChart3 className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>No calculation data yet</h1>
          <p className={`mx-auto mt-2 max-w-md ${TEXT.body}`}>
            Intelligence appears once a compensation run completes — totals, standings, composition, and trends.
          </p>
          <Link href="/operate" className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
            <Target className="h-4 w-4" /> Go to Compensation
          </Link>
        </div>
      </PersonaAmbient>
    );
  }

  const selectedLabel = periods[selectedIdx]?.label ?? '';

  return (
    <PersonaAmbient>
      <div className="space-y-6">
        <header>
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>Overview</h1>
          <p className={`mt-1 text-sm ${TEXT.body}`}>
            Earnings analytics{insights ? ` · ${insights.entityCount} entities · ${selectedLabel}` : ''}
          </p>
        </header>

        {periods.length > 0 && (
          <PeriodCards
            periods={periods}
            selectedPeriodId={selectedPeriodId}
            onPeriodChange={setSelectedPeriodId}
            accentColor={theme.accent}
            accentSoft={theme.accentSoft}
          />
        )}

        {isLoading || !insights ? (
          <Panel><div className={`py-16 text-center text-sm ${TEXT.muted}`}>{isLoading ? 'Loading period…' : 'No outcomes for this period.'}</div></Panel>
        ) : (
          <>
            {/* Dominant: authoritative period total + supporting tiles */}
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <HeroMetric
                  label="Period Total"
                  value={insights.totalPayout}
                  format={format}
                  icon={DollarSign}
                  context={{
                    direction: insights.delta == null ? 'flat' : insights.delta > 0 ? 'up' : insights.delta < 0 ? 'down' : 'flat',
                    label: insights.delta == null ? 'no prior period' : `${insights.delta >= 0 ? '+' : ''}${(insights.delta * 100).toFixed(1)}% vs ${insights.priorLabel}`,
                  }}
                  subtitle={`${insights.entityCount} entities · avg ${format(insights.avgPayout)}`}
                />
              </div>
              <Stat label="Entities Paid" value={String(insights.entityCount)} hint="with outcomes this period" icon={Users} />
              <Stat label="Average Payout" value={format(insights.avgPayout)} hint="per entity" icon={Target} />
              <Stat label="Top Performer" value={insights.top ? format(insights.top.totalPayout || 0) : '—'} hint={insights.top?.displayName ?? '—'} icon={Award} />
            </div>

            {/* Composition + standings */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Earnings by Component" description="Where the period's payout is allocated">
                <StackedBar
                  segments={componentTotals.map((c) => ({ label: c.component_name, value: c.total_amount }))}
                  total={insights.totalPayout}
                  format={format}
                />
              </Panel>

              <Panel title="Top Performers" description="By total earnings, vs the population average">
                <HorizontalBar
                  items={insights.topFive.map((e) => ({ label: e.displayName || e.externalId, value: e.totalPayout || 0 }))}
                  referenceLine={{ value: insights.avgPayout, label: 'Avg' }}
                  format={format}
                />
              </Panel>
            </div>

            {/* Population shape — admin/manager density */}
            <DensityGate min="medium">
              <Panel title="Payout Distribution" description="Population shape with quartile + mean reference">
                <DistributionPosition data={insights.values} markers={{ quartiles: true, mean: true }} format={format} />
              </Panel>
            </DensityGate>
          </>
        )}
      </div>
    </PersonaAmbient>
  );
}
