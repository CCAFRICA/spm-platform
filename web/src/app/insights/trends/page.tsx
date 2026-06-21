'use client';

/**
 * Insights → Trends. OB-227 Phase 5: rebuilt from 100% mock constants to REAL cross-period
 * trajectory (DS-015 §6) over calculation_results. Population trend, per-entity direction/velocity,
 * and per-component trend lines — all from lib/insights (deterministic, Korean Test). Shows ALL
 * calculated periods (no single-period selector).
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUp, ArrowDown, Minus, TrendingUp } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { InsightsLayout, SummaryHero, TrendLine, type HeroCard } from '@/components/insights';
import {
  getCalculatedPeriods, getPopulationTrend, getEntityTrajectory, getComponentTotals,
  type PeriodSummary, type PopulationTrendPoint, type EntityTrajectory,
} from '@/lib/insights';

const DIR_ICON = { up: ArrowUp, down: ArrowDown, stable: Minus } as const;

export default function TrendsPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const isVialuce = useIsVialuce();
  const tenantId = currentTenant?.id ?? '';

  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [trend, setTrend] = useState<PopulationTrendPoint[]>([]);
  const [trajectory, setTrajectory] = useState<EntityTrajectory[]>([]);
  const [componentTrends, setComponentTrends] = useState<Array<{ name: string; series: { label: string; value: number }[] }>>([]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [cp, pt, tj] = await Promise.all([
        getCalculatedPeriods(tenantId),
        getPopulationTrend(tenantId),
        getEntityTrajectory(tenantId),
      ]);
      // per-component totals per period → trend series (chronological)
      const periodsAsc = [...cp].sort((a, b) => a.start_date.localeCompare(b.start_date));
      const byComponent = new Map<string, { label: string; value: number }[]>();
      for (const p of periodsAsc) {
        const comps = await getComponentTotals(tenantId, p.period_id);
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
      setLoading(false);
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const hero = useMemo<HeroCard[]>(() => {
    if (trend.length === 0) return [];
    const first = trend[0].total, last = trend[trend.length - 1].total;
    const popDir = last > first * 1.005 ? 'up' : last < first * 0.995 ? 'down' : 'stable';
    const velocities = trajectory.map(t => t.velocity).filter((v): v is number => v !== null);
    const avgVel = velocities.length ? velocities.reduce((s, v) => s + v, 0) / velocities.length : 0;
    const sortedByVel = [...trajectory].filter(t => t.velocity !== null).sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0));
    const fastestUp = sortedByVel[0];
    const fastestDown = sortedByVel[sortedByVel.length - 1];
    return [
      { label: 'Periods calculated', value: periods.length, format: 'number' },
      { label: 'Population direction', value: popDir === 'up' ? '↑ Rising' : popDir === 'down' ? '↓ Falling' : '→ Stable', format: 'text', tone: popDir === 'up' ? 'up' : popDir === 'down' ? 'down' : 'neutral', emphasis: true },
      { label: 'Avg velocity', value: avgVel, format: 'currency', detail: 'per period' },
      { label: 'Fastest growing', value: fastestUp?.display_name ?? '—', format: 'text', detail: fastestUp?.velocity != null ? format(fastestUp.velocity) + '/period' : undefined, tone: 'up' },
      { label: 'Fastest declining', value: fastestDown && fastestDown !== fastestUp ? fastestDown.display_name : '—', format: 'text', detail: fastestDown?.velocity != null ? format(fastestDown.velocity) + '/period' : undefined, tone: 'down' },
    ];
  }, [trend, trajectory, periods, format]);

  const trendData = useMemo(() => trend.map(t => ({ label: t.label, value: t.total, secondary: t.avg })), [trend]);
  const trajectorySorted = useMemo(() => [...trajectory].sort((a, b) => (b.velocity ?? -Infinity) - (a.velocity ?? -Infinity)), [trajectory]);

  return (
    <div className={isVialuce ? 'page space-y-6' : 'min-h-screen bg-background p-6 space-y-6'}>
      <InsightsLayout
        title="Trends"
        description="Cross-period trajectory across all calculated periods."
        periods={periods}
        selectedPeriodId=""
        onPeriodChange={() => {}}
        hidePeriodSelector
      >
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : periods.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
            No calculated periods yet. Run a calculation to see cross-period trends.
          </CardContent></Card>
        ) : (
          <div className="space-y-6">
            <SummaryHero cards={hero} />

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Population trend</CardTitle>
                <CardDescription>Total payout and average per entity, by period.</CardDescription></CardHeader>
              <CardContent><TrendLine data={trendData} primaryName="Total payout" secondaryName="Avg per entity" height={300} /></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Entity trajectory</CardTitle>
                <CardDescription>Direction, latest delta and velocity ($/period) per entity (DS-015: delta needs 2 periods, velocity 3).</CardDescription></CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto max-h-[420px]">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Entity</TableHead><TableHead>Direction</TableHead>
                      <TableHead className="text-right">Δ Latest</TableHead><TableHead className="text-right">Velocity</TableHead><TableHead className="text-right">Latest</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {trajectorySorted.map(t => {
                        const Icon = t.direction ? DIR_ICON[t.direction] : Minus;
                        const tone = t.direction === 'up' ? 'text-[color:var(--vl-success,#15936A)]' : t.direction === 'down' ? 'text-[color:var(--vl-danger,#DC5454)]' : 'text-muted-foreground';
                        const latest = t.periods[t.periods.length - 1]?.total_payout ?? 0;
                        return (
                          <TableRow key={t.entity_id}>
                            <TableCell className="font-medium">{t.display_name}</TableCell>
                            <TableCell><span className={`inline-flex items-center gap-1 text-sm ${tone}`}><Icon className="h-3.5 w-3.5" />{t.direction ?? '—'}</span></TableCell>
                            <TableCell className={`text-right tabular-nums text-sm ${tone}`}>{t.delta == null ? '—' : `${t.delta > 0 ? '+' : ''}${format(t.delta)}`}</TableCell>
                            <TableCell className={`text-right tabular-nums text-sm ${tone}`}>{t.velocity == null ? '—' : `${t.velocity > 0 ? '+' : ''}${format(t.velocity)}`}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{format(latest)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {componentTrends.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Component trends</CardTitle>
                  <CardDescription>Total per component across periods.</CardDescription></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {componentTrends.map(c => (
                      <div key={c.name}>
                        <div className="text-sm font-medium mb-1">{c.name}</div>
                        <TrendLine data={c.series} primaryName={c.name} height={180} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </InsightsLayout>
    </div>
  );
}
