'use client';

/**
 * OB-234 T2 — Intelligence · Acceleration (/acceleration). Coaching, recognition, actions.
 *
 * End-State A: every value reads getCalculatedPeriods / getEntityResults / getComponentTotals
 * (calculation_results / entity_period_outcomes) through @/lib/insights + @/lib/drill-through —
 * zero committed_data, zero raw re-aggregation. The prior period total comes from getEntityResults
 * on periods[selectedIdx+1] so movement is honest (no fabricated deltas).
 *
 * DS-003 composition: HorizontalBar (recognition / ranked comparison, dominant) + PrioritySortedList
 * splitView (movers triage) + NeighborhoodLeaderboard (rep relative rank) = 3 distinct component types
 * (Diversity Minimum). Every viz carries a reference frame. Coaching action is a StubAction (honest
 * disabled — coaching backend not built). Tiers/Goals/SPIFs/Alerts have NO config for BCL → honest
 * empty (never fabricated). Persona density filters which elements render.
 *
 * Mirrors the reference surface web/src/app/insights/page.tsx.
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Rocket, Bell, Target, Lightbulb, Users, Award, MessageSquare } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import {
  getCalculatedPeriods,
  getComponentTotals,
  ALL_INSIGHTS_SCOPE,
  type PeriodSummary,
  type ComponentTotal,
} from '@/lib/insights';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { PeriodCards, PeriodSelector } from '@/components/insights';
import {
  PersonaAmbient,
  DensityGate,
  usePersonaTheme,
  HorizontalBar,
  PrioritySortedList,
  NeighborhoodLeaderboard,
  StubAction,
  Panel,
  TEXT,
  type PriorityItem,
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

export default function AccelerationPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const theme = usePersonaTheme();
  const { persona, entityId } = usePersona();

  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [rows, setRows] = useState<EntityResult[]>([]);
  const [priorRows, setPriorRows] = useState<EntityResult[]>([]);
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
      .catch((err) => { console.warn('[Acceleration] periods load failed:', err); setPeriodsLoaded(true); setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant]);

  const selectedIdx = useMemo(() => periods.findIndex((p) => p.period_id === selectedPeriodId), [periods, selectedPeriodId]);

  // Selected-period outcomes + prior-period outcomes (movement) + component totals.
  useEffect(() => {
    if (!currentTenant || !selectedPeriodId) return;
    let cancelled = false;
    setIsLoading(true);
    const priorId = selectedIdx >= 0 ? periods[selectedIdx + 1]?.period_id : undefined;
    Promise.all([
      getEntityResults(currentTenant.id, ALL_INSIGHTS_SCOPE, { periodId: selectedPeriodId }),
      priorId ? getEntityResults(currentTenant.id, ALL_INSIGHTS_SCOPE, { periodId: priorId }) : Promise.resolve([] as EntityResult[]),
      getComponentTotals(currentTenant.id, selectedPeriodId),
    ])
      .then(([rs, prs, ct]) => {
        if (cancelled) return;
        setRows(rs);
        setPriorRows(prs);
        setComponentTotals(ct);
        setIsLoading(false);
      })
      .catch((err) => { console.warn('[Acceleration] period data load failed:', err); if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant, selectedPeriodId, selectedIdx, periods]);

  const priorLabel = selectedIdx >= 0 ? periods[selectedIdx + 1]?.label ?? null : null;

  const insights = useMemo(() => {
    if (rows.length === 0) return null;
    const totalPayout = rows.reduce((s, r) => s + (r.totalPayout || 0), 0);
    const avgPayout = totalPayout / rows.length;
    const sorted = [...rows].sort((a, b) => (b.totalPayout || 0) - (a.totalPayout || 0));

    // Movement vs prior period (honest: only where we have both periods' outcomes).
    const priorById = new Map(priorRows.map((r) => [r.entityId, r.totalPayout || 0]));
    const movers = rows
      .map((r) => {
        const prev = priorById.get(r.entityId);
        if (prev == null) return null;
        const delta = (r.totalPayout || 0) - prev;
        return { entity: r, delta };
      })
      .filter((m): m is { entity: EntityResult; delta: number } => m != null && m.delta !== 0);
    const gainers = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const decliners = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);

    return {
      totalPayout,
      avgPayout,
      entityCount: rows.length,
      top: sorted[0] ?? null,
      topFive: sorted.slice(0, 5),
      leaderboard: sorted.map((r) => ({ id: r.entityId, name: r.displayName || r.externalId, value: r.totalPayout || 0 })),
      gainers,
      decliners,
      hasPrior: priorRows.length > 0,
    };
  }, [rows, priorRows]);

  // Top Movers → PrioritySortedList (gainers = opportunity, decliners = warning). Triage.
  const moverItems = useMemo<PriorityItem[]>(() => {
    if (!insights) return [];
    const gainItems: PriorityItem[] = insights.gainers.map((m) => ({
      id: `gain-${m.entity.entityId}`,
      severity: 'opportunity',
      label: m.entity.displayName || m.entity.externalId,
      detail: `${format(m.entity.totalPayout || 0)} this period`,
      value: `+${format(Math.abs(m.delta))}`,
    }));
    const declineItems: PriorityItem[] = insights.decliners.map((m) => ({
      id: `decline-${m.entity.entityId}`,
      severity: 'warning',
      label: m.entity.displayName || m.entity.externalId,
      detail: `${format(m.entity.totalPayout || 0)} this period`,
      value: `-${format(Math.abs(m.delta))}`,
    }));
    return [...gainItems, ...declineItems];
  }, [insights, format]);

  // Component coaching: each component's avg per participating entity vs the population. The coaching
  // ACTION is a StubAction (workflow backend not built). getComponentTotals is the clean source.
  const coachingComponents = useMemo(
    () =>
      componentTotals
        .filter((c) => c.entity_count > 0)
        .map((c) => ({
          name: c.component_name,
          avgPerEntity: c.total_amount / c.entity_count,
          entityCount: c.entity_count,
          share: c.percentage_of_total,
        }))
        .sort((a, b) => b.avgPerEntity - a.avgPerEntity)
        .slice(0, 6),
    [componentTotals],
  );

  const showMyRank = persona === 'rep' && !!entityId && !!insights;

  // Loading shell.
  if (isLoading && !periodsLoaded) {
    return (
      <PersonaAmbient>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
            <p className={TEXT.body}>Loading acceleration…</p>
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
          <Rocket className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>No calculation data yet</h1>
          <p className={`mx-auto mt-2 max-w-md ${TEXT.body}`}>
            Recognition, movement, and coaching appear once a compensation run completes — top performers, movers, and component standings.
          </p>
          <Link href="/operate" className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
            <Target className="h-4 w-4" /> Go to Compensation
          </Link>
        </div>
      </PersonaAmbient>
    );
  }

  const selectedLabel = periods[selectedIdx]?.label ?? '';

  // Honest-empty config card (SPIFs / Alerts / Tiers / Goals — no config in tenant data).
  const EmptyConfig = ({ icon: Icon, title, body }: { icon: typeof Bell; title: string; body: string }) => (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon className="h-9 w-9 text-muted-foreground/50" />
      <p className={`text-sm font-medium ${TEXT.body}`}>{title}</p>
      <p className={`max-w-sm text-xs ${TEXT.muted}`}>{body}</p>
    </div>
  );

  return (
    <PersonaAmbient>
      <div className="space-y-6">
        <header>
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>Acceleration</h1>
          <p className={`mt-1 text-sm ${TEXT.body}`}>
            {/* HF-344: whole-population entity count is admin-only */}
            Recognition, movement &amp; coaching{insights ? (persona === 'admin' ? ` · ${insights.entityCount} entities · ${selectedLabel}` : (selectedLabel ? ` · ${selectedLabel}` : '')) : ''}
          </p>
        </header>

        {/* HF-344: PeriodCards shows per-period tenant totals → admin only; rep/manager get the
            amount-free PeriodSelector so My Rank keeps its period context. */}
        {periods.length > 0 && (persona === 'admin' ? (
          <PeriodCards
            periods={periods}
            selectedPeriodId={selectedPeriodId}
            onPeriodChange={setSelectedPeriodId}
            accentColor={theme.accent}
            accentSoft={theme.accentSoft}
          />
        ) : (
          <PeriodSelector
            periods={periods}
            selectedPeriodId={selectedPeriodId}
            onPeriodChange={setSelectedPeriodId}
          />
        ))}

        {isLoading || !insights ? (
          <Panel><div className={`py-16 text-center text-sm ${TEXT.muted}`}>{isLoading ? 'Loading period…' : 'No outcomes for this period.'}</div></Panel>
        ) : (
          <>
            {/* Supporting tiles — HF-344: whole-population aggregates → admin only */}
            {persona === 'admin' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Entities Paid" value={String(insights.entityCount)} hint="with outcomes this period" icon={Users} />
              <Stat label="Average Payout" value={format(insights.avgPayout)} hint="per entity" icon={Target} />
              <Stat label="Top Performer" value={insights.top ? format(insights.top.totalPayout || 0) : '—'} hint={insights.top?.displayName ?? '—'} icon={Award} />
            </div>
            )}

            {/* Rep relative rank — only when persona is rep and we know their entity (honest). */}
            {showMyRank && (
              <DensityGate min="low">
                <Panel title="My Rank" description="Your neighbourhood by total earnings this period">
                  <NeighborhoodLeaderboard
                    entities={insights.leaderboard}
                    selfId={entityId!}
                    format={format}
                    emptyLabel="Your standing appears once you have an outcome this period."
                  />
                </Panel>
              </DensityGate>
            )}

            {/* Dominant: recognition (ranked vs population average). HF-344: tenant-wide → admin only */}
            {persona === 'admin' && (
            <Panel title="Top Performers" description="By total earnings this period, vs the population average">
              <HorizontalBar
                items={insights.topFive.map((e) => ({ label: e.displayName || e.externalId, value: e.totalPayout || 0 }))}
                referenceLine={{ value: insights.avgPayout, label: 'Avg' }}
                format={format}
              />
            </Panel>
            )}

            {/* Movement triage — split gainers / decliners. HF-344: tenant-wide → admin only */}
            {persona === 'admin' && (
            <Panel title="Top Movers" description={priorLabel ? `Change versus ${priorLabel}` : 'Change versus the prior period'}>
              {!insights.hasPrior ? (
                <div className={`py-8 text-center text-sm ${TEXT.muted}`}>
                  At least two calculated periods are required to show movement.
                </div>
              ) : (
                <PrioritySortedList
                  items={moverItems}
                  splitView
                  emptyLabel="No measurable movement versus the prior period."
                />
              )}
            </Panel>
            )}

            {/* Component coaching — HF-344: was admin+manager (DensityGate medium); now admin only */}
            {persona === 'admin' && (
            <DensityGate min="medium">
              <Panel
                title="Component Coaching"
                description="Average per participating entity, by earnings component — coaching targets"
              >
                {coachingComponents.length === 0 ? (
                  <div className={`py-8 text-center text-sm ${TEXT.muted}`}>No component breakdown for this period.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {coachingComponents.map((c) => (
                        <div key={c.name} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                          <Lightbulb className="h-4 w-4 shrink-0" style={{ color: theme.accent }} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">{c.name}</div>
                            <div className={`truncate text-xs ${TEXT.muted}`}>{c.entityCount} entities · {c.share.toFixed(1)}% of payout</div>
                          </div>
                          <span className={`shrink-0 text-sm font-semibold tabular-nums ${TEXT.headline}`}>{format(c.avgPerEntity)}</span>
                        </div>
                      ))}
                    </div>
                    <StubAction
                      label="Start coaching workflow"
                      description="Coaching workflow coming soon — assign focus components and track follow-up."
                      icon={MessageSquare}
                    />
                  </div>
                )}
              </Panel>
            </DensityGate>
            )}

            {/* Config-backed surfaces — honest empty (no SPIF / alert / tier / goal config in tenant data). */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Incentive Programs (SPIFs)" description="Configured incentive programs">
                <EmptyConfig icon={Rocket} title="No incentive programs configured." body="SPIF / incentive programs will appear here when configured for this tenant." />
              </Panel>
              <Panel title="Alerts" description="Threshold-based monitoring">
                <EmptyConfig icon={Bell} title="No alerts." body="Alerts will appear here when threshold-based monitoring is configured." />
              </Panel>
            </div>

            {/* Goals / tiers — no tier config exists for this tenant → omit the progress viz, state honestly. */}
            <DensityGate min="medium">
              <Panel title="Goals &amp; Tiers" description="Tier targets and pacing">
                <EmptyConfig icon={Target} title="No goals configured." body="Tiers, pacing, and goal progress will appear here when targets are configured for this tenant." />
              </Panel>
            </DensityGate>
          </>
        )}
      </div>
    </PersonaAmbient>
  );
}
