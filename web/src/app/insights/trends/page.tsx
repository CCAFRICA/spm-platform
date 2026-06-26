'use client';

/**
 * OB-234 T2 — Intelligence · Trends (/insights/trends). The TEMPORAL axis. Cross-period trajectory
 * across ALL calculated periods — there is no single-period selector here (honest: this surface spans
 * every period), so PeriodCards is intentionally OMITTED. End-State A: every value reads
 * getPopulationTrend / getEntityTrajectory / getComponentTotals / getCalculatedPeriods from
 * @/lib/insights (calculation_results) — zero committed_data, zero raw createClient queries.
 *
 * DS-003 composition (Diversity Minimum ≥3): ThresholdArea (temporal w/ expected band, DOMINANT) +
 * SparkTrend (trend + velocity + projection) + PrioritySortedList (splitView gainers/decliners) +
 * Sparkline (embedded per-entity series) = 4 component types. Every viz carries a reference frame:
 * ThresholdArea band = mean±std, SparkTrend velocity/projection, PrioritySortedList severity sort,
 * Sparkline baseline. Persona density filters which depth renders (Rule 4). PersonaAmbient wraps body.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Minus, Target, TrendingUp } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import {
  getCalculatedPeriods,
  getPopulationTrend,
  getEntityTrajectory,
  getComponentTotals,
  type PeriodSummary,
  type PopulationTrendPoint,
  type EntityTrajectory,
} from '@/lib/insights';
import {
  PersonaAmbient,
  DensityGate,
  usePersonaTheme,
  HeroMetric,
  ThresholdArea,
  SparkTrend,
  Sparkline,
  PrioritySortedList,
  Panel,
  TEXT,
  paletteColor,
  type PriorityItem,
} from '@/components/insights/ds003';

type ComponentSeries = { name: string; series: { label: string; value: number }[] };

/** Compact supporting stat tile (mirrors the reference Stat helper). */
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`text-xs font-semibold uppercase tracking-wide ${TEXT.body}`}>{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TEXT.headline}`}>{value}</div>
      <div className={`text-xs ${TEXT.muted}`}>{hint}</div>
    </div>
  );
}

/** Linear extrapolation of the next period from ≥3 chronological totals (least-squares slope). */
function projectNext(values: number[]): number | null {
  if (values.length < 3) return null;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  return Math.max(0, intercept + slope * n);
}

export default function TrendsPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const theme = usePersonaTheme();

  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [trend, setTrend] = useState<PopulationTrendPoint[]>([]);
  const [trajectory, setTrajectory] = useState<EntityTrajectory[]>([]);
  const [componentTrends, setComponentTrends] = useState<ComponentSeries[]>([]);

  // ALL-periods cross-period read — the clean End-State A path (no committed_data, no raw query).
  useEffect(() => {
    if (!currentTenant) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [cp, pt, tj] = await Promise.all([
        getCalculatedPeriods(currentTenant.id),
        getPopulationTrend(currentTenant.id),
        getEntityTrajectory(currentTenant.id),
      ]);
      // per-component totals per period → chronological trend series.
      const periodsAsc = [...cp].sort((a, b) => a.start_date.localeCompare(b.start_date));
      const byComponent = new Map<string, { label: string; value: number }[]>();
      for (const p of periodsAsc) {
        const comps = await getComponentTotals(currentTenant.id, p.period_id);
        for (const c of comps) {
          const arr = byComponent.get(c.component_name) ?? [];
          arr.push({ label: p.label, value: c.total_amount });
          byComponent.set(c.component_name, arr);
        }
      }
      if (cancelled) return;
      setPeriods(cp);
      setTrend(pt);
      setTrajectory(tj);
      setComponentTrends(Array.from(byComponent.entries()).map(([name, series]) => ({ name, series })));
      setLoaded(true);
      setLoading(false);
    })().catch((err) => {
      console.warn('[Trends] load failed:', err);
      if (!cancelled) { setLoaded(true); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [currentTenant]);

  // Derived temporal frame: population band (mean±std), velocity, projection.
  const pop = useMemo(() => {
    if (trend.length === 0) return null;
    const totals = trend.map((t) => t.total);
    const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
    const variance = totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length;
    const std = Math.sqrt(variance);
    const first = totals[0];
    const last = totals[totals.length - 1];
    const dir: 'up' | 'down' | 'flat' = last > first * 1.005 ? 'up' : last < first * 0.995 ? 'down' : 'flat';
    const overallDelta = first > 0 ? (last - first) / first : null;
    // avg period-over-period change rate (currency / period).
    const steps = totals.slice(1).map((v, i) => v - totals[i]);
    const avgChange = steps.length ? steps.reduce((s, v) => s + v, 0) / steps.length : 0;
    const projection = projectNext(totals); // null if <3 periods (honest)
    return {
      mean, std, dir, overallDelta, avgChange, projection,
      series: trend.map((t) => ({ label: t.label, value: t.total })),
      band: { low: Math.max(0, mean - std), high: mean + std, label: 'Expected (mean ± σ)' },
      latest: last,
    };
  }, [trend]);

  // Avg velocity across entities (DS-015: velocity needs ≥3 periods → null otherwise).
  const avgVelocity = useMemo(() => {
    const vs = trajectory.map((t) => t.velocity).filter((v): v is number => v !== null);
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  }, [trajectory]);

  // Movers split: opportunities (up) vs warnings (down) — the triage reference frame.
  const movers = useMemo<PriorityItem[]>(() => {
    const withVel = trajectory.filter((t) => t.velocity !== null);
    const sorted = [...withVel].sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0));
    const gaining = sorted.filter((t) => t.direction === 'up').slice(0, 5);
    const declining = sorted.filter((t) => t.direction === 'down').slice(-5).reverse();
    const fmtVel = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${format(v)}/period`);
    return [
      ...gaining.map((t): PriorityItem => ({
        id: `up-${t.entity_id}`,
        severity: 'opportunity',
        label: t.display_name,
        detail: t.delta != null ? `Δ latest ${t.delta >= 0 ? '+' : ''}${format(t.delta)}` : 'rising',
        value: fmtVel(t.velocity),
      })),
      ...declining.map((t): PriorityItem => ({
        id: `down-${t.entity_id}`,
        severity: 'warning',
        label: t.display_name,
        detail: t.delta != null ? `Δ latest ${t.delta >= 0 ? '+' : ''}${format(t.delta)}` : 'declining',
        value: fmtVel(t.velocity),
      })),
    ];
  }, [trajectory, format]);

  // Entity trajectory table rows (top-N by velocity), each with its own Sparkline series.
  const tableRows = useMemo(() => {
    const sorted = [...trajectory].sort((a, b) => (b.velocity ?? -Infinity) - (a.velocity ?? -Infinity));
    return sorted.slice(0, 25).map((t) => ({
      id: t.entity_id,
      name: t.display_name,
      direction: t.direction,
      delta: t.delta,
      velocity: t.velocity,
      latest: t.periods[t.periods.length - 1]?.total_payout ?? 0,
      seriesNums: t.periods.map((p) => p.total_payout),
    }));
  }, [trajectory]);

  // ── Loading shell (mirror reference) ──
  if (loading && !loaded) {
    return (
      <PersonaAmbient>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
            <p className={TEXT.body}>Loading trends…</p>
          </div>
        </div>
      </PersonaAmbient>
    );
  }

  // ── No calculated periods → honest onboarding (mirror reference) ──
  if (loaded && periods.length === 0) {
    return (
      <PersonaAmbient>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <TrendingUp className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>No trend data yet</h1>
          <p className={`mx-auto mt-2 max-w-md ${TEXT.body}`}>
            Cross-period trends appear once two or more compensation runs complete — population trajectory,
            per-entity velocity, and component movement over time.
          </p>
          <Link href="/operate" className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
            <Target className="h-4 w-4" /> Go to Compensation
          </Link>
        </div>
      </PersonaAmbient>
    );
  }

  const periodCount = periods.length;
  const singlePeriod = trend.length < 2; // can't show direction/velocity honestly

  return (
    <PersonaAmbient>
      <div className="space-y-6">
        <header>
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>Trends</h1>
          <p className={`mt-1 text-sm ${TEXT.body}`}>
            Cross-period trajectory across all {periodCount} calculated period{periodCount === 1 ? '' : 's'}
            {/* HF-344: latest tenant payout amount is admin-only */}
            {pop && theme.persona === 'admin' ? ` · latest ${format(pop.latest)}` : ''}
          </p>
        </header>

        {/* HF-344: the whole population-trend body (HeroMetric, trend area, trajectory, movers,
            component trends, entity trajectory table) reads getPopulationTrend/getEntityTrajectory =
            tenant-wide → admin-only. Rep/manager get a reduced state. Admin branch byte-identical (DD-7). */}
        {theme.persona === 'admin' ? (
        <>
        {singlePeriod || !pop ? (
          <Panel>
            <div className={`py-16 text-center text-sm ${TEXT.muted}`}>
              {singlePeriod
                ? 'Only one calculated period — trends need at least two periods to show direction and velocity.'
                : 'No trend outcomes available.'}
            </div>
          </Panel>
        ) : (
          <>
            {/* DOMINANT: population trajectory with the expected band + supporting stat tiles. */}
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <HeroMetric
                  label="Population Direction"
                  value={pop.dir === 'up' ? 'Rising' : pop.dir === 'down' ? 'Falling' : 'Stable'}
                  icon={pop.dir === 'up' ? ArrowUp : pop.dir === 'down' ? ArrowDown : Minus}
                  context={{
                    direction: pop.dir,
                    label: pop.overallDelta == null
                      ? `${format(pop.latest)} latest`
                      : `${pop.overallDelta >= 0 ? '+' : ''}${(pop.overallDelta * 100).toFixed(1)}% over ${periodCount} periods`,
                  }}
                  subtitle={`avg change ${pop.avgChange >= 0 ? '+' : ''}${format(pop.avgChange)} / period`}
                />
              </div>
              <Stat
                label="Avg Velocity"
                value={avgVelocity == null ? '—' : `${avgVelocity >= 0 ? '+' : ''}${format(avgVelocity)}`}
                hint={avgVelocity == null ? 'needs 3+ periods' : 'per entity / period'}
              />
              <Stat
                label="Population Mean"
                value={format(pop.mean)}
                hint={`±${format(pop.std)} σ band`}
              />
              <Stat
                label="Projected Next"
                value={pop.projection == null ? '—' : format(pop.projection)}
                hint={pop.projection == null ? 'needs 3+ periods' : 'linear extrapolation'}
              />
            </div>

            {/* DOMINANT viz: temporal area with mean±std band = the expected range reference frame. */}
            <Panel title="Population Trend" description="Total payout by period, against the expected mean ± σ band">
              <ThresholdArea
                data={pop.series}
                band={pop.band}
                referenceLine={{ value: pop.mean, label: 'Mean' }}
                format={format}
                height={300}
              />
            </Panel>

            {/* Trend + velocity + projection (dotted projected point). */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Trajectory & Projection" description="Period totals with velocity and the projected next period">
                <SparkTrend
                  data={pop.series}
                  direction={pop.dir}
                  velocity={`${pop.avgChange >= 0 ? '+' : ''}${format(pop.avgChange)} / period`}
                  projection={pop.projection}
                  format={format}
                  height={160}
                />
              </Panel>

              {/* Triage: gainers (opportunity) vs decliners (warning) — severity-sorted. */}
              <Panel title="Movers" description="Fastest growing and declining entities by velocity ($/period)">
                <PrioritySortedList
                  items={movers}
                  splitView
                  emptyLabel="No directional movers yet (needs 3+ periods for velocity)."
                />
              </Panel>
            </div>

            {/* Per-component movement across periods — admin/manager depth. */}
            <DensityGate min="medium">
              {componentTrends.length > 0 && (
                <Panel title="Component Trends" description="Total per component across periods, each with its own trajectory">
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {componentTrends.map((c) => (
                      <div key={c.name} className="rounded-lg border border-border bg-card p-3">
                        <SparkTrend
                          title={c.name}
                          data={c.series}
                          projection={projectNext(c.series.map((s) => s.value))}
                          format={format}
                          height={110}
                        />
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </DensityGate>

            {/* Entity trajectory table — top movers, each row carrying an embedded Sparkline. Admin depth. */}
            <DensityGate min="high">
              <Panel title="Entity Trajectory" description="Top 25 by velocity — direction, latest Δ, velocity, and the per-entity trend shape">
                <div className="max-h-[460px] overflow-x-auto overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card backdrop-blur-sm">
                      <tr className={`text-left ${TEXT.body}`}>
                        <th className="px-3 py-2 font-medium">Entity</th>
                        <th className="px-3 py-2 font-medium">Trend</th>
                        <th className="px-3 py-2 text-center font-medium">Dir</th>
                        <th className="px-3 py-2 text-right font-medium">Δ Latest</th>
                        <th className="px-3 py-2 text-right font-medium">Velocity</th>
                        <th className="px-3 py-2 text-right font-medium">Latest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r, i) => {
                        const tone = r.direction === 'up' ? '#10B981' : r.direction === 'down' ? '#EF4444' : 'var(--vl-text-soft, #8A90A6)';
                        const DirIcon = r.direction === 'up' ? ArrowUp : r.direction === 'down' ? ArrowDown : Minus;
                        return (
                          <tr key={r.id} className="border-t border-border">
                            <td className={`px-3 py-2 font-medium ${TEXT.headline}`}>{r.name}</td>
                            <td className="px-3 py-2">
                              <Sparkline data={r.seriesNums} color={paletteColor(i)} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <DirIcon className="inline h-3.5 w-3.5" style={{ color: tone }} />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: tone }}>
                              {r.delta == null ? '—' : `${r.delta >= 0 ? '+' : ''}${format(r.delta)}`}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: tone }}>
                              {r.velocity == null ? '—' : `${r.velocity >= 0 ? '+' : ''}${format(r.velocity)}`}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold tabular-nums ${TEXT.headline}`}>{format(r.latest)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </DensityGate>
          </>
        )}
        </>
        ) : (
          <Panel>
            <div className={`py-16 text-center text-sm ${TEXT.muted}`}>
              Population-wide trends are available to administrators. Your own trajectory over time appears on{' '}
              <Link href="/perform" className="underline">your dashboard →</Link>.
            </div>
          </Panel>
        )}
      </div>
    </PersonaAmbient>
  );
}
