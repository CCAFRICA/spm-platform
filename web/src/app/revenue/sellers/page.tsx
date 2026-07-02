'use client';

/**
 * /revenue/sellers — Seller Revenue Distribution (OB-257 O3, W2c).
 *
 * "Is revenue production healthy across the team or concentrated?" Composition (DS-003):
 * HeroMetric row (top-seller share, median seller revenue, seller count — each vs prior) +
 * ranked leaderboard table with per-seller Sparkline and rank-movement arrows + Lorenz/Pareto
 * cumulative-share curve against a neutral equality diagonal. Every quantitative element carries
 * a reference frame; C2 data states (loading / error / notMaterialized / role absence) render
 * structured absence, never zeros. Theme: shadcn semantic classes + ds003 chart tokens only.
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Award, Minus, Target, Users } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RevenueScaffold } from '@/components/revenue/RevenueScaffold';
import { StructuredAbsence } from '@/components/revenue/StructuredAbsence';
import {
  HeroMetric,
  Panel,
  Sparkline,
  AXIS_TICK,
  CHART_NEUTRAL,
  GRID_STROKE,
  TOOLTIP_STYLE,
  directionColor,
} from '@/components/insights/ds003';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { usePersona } from '@/contexts/persona-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { loadSellers } from '@/lib/revenue/revenue-data-service';
import type { SellersResponse } from '@/lib/revenue/types';

const EM_DASH = '\u2014';
const LEADERBOARD_ROWS = 10;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pctDelta(current: number, prior: number | null): number | null {
  if (prior == null || prior <= 0) return null;
  return ((current - prior) / prior) * 100;
}

function dirOf(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export default function SellersPage() {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const t = (en: string, es: string) => (isSpanish ? es : en);
  const { format } = useCurrency();
  // HF-374: switcher-effective tenant — the loaders REQUIRE it (financial idiom).
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [data, setData] = useState<SellersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { scope } = usePersona();
  // SR-39 fail-closed: non-admin sends an EXPLICIT scope (even empty) so the server serves only
  // scoped entity-grain data instead of falling open to the whole tenant.
  const scopeEntityIds = useMemo(() => (scope.canSeeAll ? undefined : scope.entityIds), [scope]);

  useEffect(() => {
    if (!tenantId) return; // tenant context resolves momentarily; the effect re-fires (HF-374)
    let cancelled = false;
    loadSellers(tenantId, { scopeEntityIds })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, scopeEntityIds]);

  const stats = useMemo(() => {
    if (!data || data.entities.length === 0) return null;
    const entities = data.entities;
    const totalCurrent = entities.reduce((s, e) => s + e.primary, 0);
    const hasPrior = data.priorPeriodId != null;
    const totalPrior = hasPrior ? entities.reduce((s, e) => s + (e.prior ?? 0), 0) : null;

    const topShare = data.distribution.cumulativeShare[0]?.share ?? null;
    const priorTopShare =
      totalPrior != null && totalPrior > 0
        ? Math.max(...entities.map((e) => e.prior ?? 0)) / totalPrior
        : null;

    const medianCurrent = median(entities.filter((e) => e.primary > 0).map((e) => e.primary));
    const medianPrior = hasPrior
      ? median(entities.filter((e) => (e.prior ?? 0) > 0).map((e) => e.prior ?? 0))
      : null;

    const currentPeriod = data.periods.find((p) => p.periodId === data.currentPeriodId) ?? null;
    const priorPeriod = data.periods.find((p) => p.periodId === data.priorPeriodId) ?? null;
    const sellerCount = currentPeriod?.entityCount ?? entities.filter((e) => e.primary > 0).length;
    const priorSellerCount = priorPeriod?.entityCount ?? null;

    return { totalCurrent, topShare, priorTopShare, medianCurrent, medianPrior, sellerCount, priorSellerCount };
  }, [data]);

  const lorenz = useMemo(() => {
    if (!data) return null;
    const shares = data.distribution.cumulativeShare;
    const n = shares.length;
    if (n < 2) return null;
    const points = [{ pctSellers: 0, curve: 0, equality: 0 }];
    for (const c of shares) {
      const pct = Math.round((c.rank / n) * 1000) / 10;
      points.push({ pctSellers: pct, curve: Math.round(c.share * 1000) / 10, equality: pct });
    }
    const rank20 = Math.max(1, Math.round(n * 0.2));
    const p20 = shares[rank20 - 1];
    return { points, p20x: Math.round((rank20 / n) * 1000) / 10, p20y: Math.round(p20.share * 1000) / 10 };
  }, [data]);

  const measureAbsence = data?.absences.find((a) => a.role === 'measure') ?? null;

  return (
    <RevenueScaffold
      title="Seller Distribution"
      titleEs="Distribucion de Vendedores"
      subtitle="Is revenue production healthy across the team or concentrated?"
      subtitleEs="Es la produccion de ingresos saludable en el equipo o esta concentrada?"
    >
      {!data && !error && (
        <p className="text-sm text-muted-foreground">{t('Loading revenue data...', 'Cargando datos de ingresos...')}</p>
      )}

      {error && !data && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            {t('Revenue data could not be loaded', 'No se pudieron cargar los datos de ingresos')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {data && data.notMaterialized && <StructuredAbsence reason={data.notMaterialized.reason} />}

      {data && !data.notMaterialized && measureAbsence && (
        <StructuredAbsence role={measureAbsence.role} reason={measureAbsence.reason} />
      )}

      {data && !data.notMaterialized && !measureAbsence && (!stats || data.entities.length === 0) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'No seller-level revenue is materialized yet for this tenant.',
              'Aun no hay ingresos por vendedor materializados para esta organizacion.',
            )}
          </p>
        </div>
      )}

      {data && !data.notMaterialized && !measureAbsence && stats && data.entities.length > 0 && (
        <>
          {/* Glanceable primary row — each tile framed vs prior period */}
          <div className="grid gap-4 md:grid-cols-3">
            <HeroMetric
              label={t('Top Seller Share', 'Participacion del Lider')}
              value={stats.topShare != null ? `${(stats.topShare * 100).toFixed(1)}%` : EM_DASH}
              icon={Award}
              context={{
                direction:
                  stats.topShare != null && stats.priorTopShare != null
                    ? dirOf((stats.topShare - stats.priorTopShare) * 100)
                    : 'flat',
                label:
                  stats.topShare != null && stats.priorTopShare != null
                    ? `${(stats.topShare - stats.priorTopShare) * 100 >= 0 ? '+' : ''}${((stats.topShare - stats.priorTopShare) * 100).toFixed(1)} pts ${t('vs prior period', 'vs periodo anterior')}`
                    : t('no prior period', 'sin periodo anterior'),
              }}
              subtitle={data.entities[0]?.displayName}
            />
            <HeroMetric
              label={t('Median Seller Revenue', 'Ingreso Mediano por Vendedor')}
              value={stats.medianCurrent ?? EM_DASH}
              format={format}
              icon={Target}
              context={{
                direction: dirOf(pctDelta(stats.medianCurrent ?? 0, stats.medianPrior)),
                label: (() => {
                  const d = pctDelta(stats.medianCurrent ?? 0, stats.medianPrior);
                  return d != null
                    ? `${d >= 0 ? '+' : ''}${d.toFixed(1)}% ${t('vs prior period', 'vs periodo anterior')}`
                    : t('no prior period', 'sin periodo anterior');
                })(),
              }}
              subtitle={t('across sellers with revenue this period', 'entre vendedores con ingresos este periodo')}
            />
            <HeroMetric
              label={t('Active Sellers', 'Vendedores Activos')}
              value={String(stats.sellerCount)}
              icon={Users}
              context={{
                direction:
                  stats.priorSellerCount != null ? dirOf(stats.sellerCount - stats.priorSellerCount) : 'flat',
                label:
                  stats.priorSellerCount != null
                    ? `${stats.sellerCount - stats.priorSellerCount >= 0 ? '+' : ''}${stats.sellerCount - stats.priorSellerCount} ${t('vs prior period', 'vs periodo anterior')}`
                    : t('no prior period', 'sin periodo anterior'),
              }}
              subtitle={t('with revenue in the current period', 'con ingresos en el periodo actual')}
            />
          </div>

          {/* Ranked leaderboard — rank movement is the per-row reference frame */}
          <Panel
            title={t('Seller Leaderboard', 'Tabla de Vendedores')}
            description={t(
              'Ranked by current-period revenue; movement is rank change vs the prior period.',
              'Ordenado por ingresos del periodo actual; el movimiento es el cambio de posicion vs el periodo anterior.',
            )}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">#</th>
                    <th className="py-2 pr-3 font-semibold">{t('Seller', 'Vendedor')}</th>
                    <th className="py-2 pr-3 font-semibold">{t('Trend', 'Tendencia')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Revenue', 'Ingresos')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('vs Prior', 'vs Anterior')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Cum. Share', 'Part. Acum.')}</th>
                    <th className="py-2 text-right font-semibold">{t('Movement', 'Movimiento')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entities.slice(0, LEADERBOARD_ROWS).map((e) => {
                    const series = data.periods.map((p) => e.byPeriod[p.periodId] ?? 0);
                    const delta = pctDelta(e.primary, e.prior);
                    const move = e.priorRank != null ? e.priorRank - e.rank : null;
                    const MoveIcon = move != null && move > 0 ? ArrowUp : move != null && move < 0 ? ArrowDown : Minus;
                    const cum = data.distribution.cumulativeShare[e.rank - 1];
                    return (
                      <tr key={e.entityId} className="border-b border-border last:border-b-0">
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{e.rank}</td>
                        <td className="max-w-[220px] truncate py-2 pr-3 font-medium text-foreground">{e.displayName}</td>
                        <td className="py-2 pr-3">
                          <Sparkline data={series} />
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums text-foreground">
                          {format(e.primary)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {delta != null ? (
                            <span style={{ color: directionColor(dirOf(delta)) }}>
                              {`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                            </span>
                          ) : e.prior === 0 && e.primary > 0 ? (
                            <span className="text-muted-foreground">{t('new', 'nuevo')}</span>
                          ) : (
                            <span className="text-muted-foreground" title={t('no prior period', 'sin periodo anterior')}>
                              {EM_DASH}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {cum ? `${(cum.share * 100).toFixed(1)}%` : EM_DASH}
                        </td>
                        <td className="py-2 text-right">
                          {move == null ? (
                            <span className="text-muted-foreground" title={t('no prior period', 'sin periodo anterior')}>
                              {EM_DASH}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center justify-end gap-0.5 tabular-nums"
                              style={{ color: directionColor(move > 0 ? 'up' : move < 0 ? 'down' : 'flat') }}
                            >
                              <MoveIcon className="h-3.5 w-3.5" />
                              {move !== 0 ? Math.abs(move) : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.entities.length > LEADERBOARD_ROWS && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  `Showing top ${LEADERBOARD_ROWS} of ${data.entities.length} sellers.`,
                  `Mostrando los ${LEADERBOARD_ROWS} primeros de ${data.entities.length} vendedores.`,
                )}
              </p>
            )}
          </Panel>

          {/* Distribution curve — Lorenz/Pareto vs the equality diagonal */}
          {lorenz && (
            <Panel
              title={t('Revenue Distribution Curve', 'Curva de Distribucion de Ingresos')}
              description={t(
                'Cumulative revenue share by seller rank vs the perfect-equality diagonal.',
                'Participacion acumulada de ingresos por posicion vs la diagonal de igualdad perfecta.',
              )}
            >
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lorenz.points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis
                      dataKey="pctSellers"
                      type="number"
                      domain={[0, 100]}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <YAxis
                      type="number"
                      domain={[0, 100]}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                      labelFormatter={(x: number) => `${x}% ${t('of sellers', 'de vendedores')}`}
                    />
                    <Legend
                      formatter={(value: unknown) => <span style={{ color: AXIS_TICK.fill }}>{String(value)}</span>}
                    />
                    <Line
                      type="monotone"
                      dataKey="equality"
                      name={t('Perfect equality', 'Igualdad perfecta')}
                      stroke={AXIS_TICK.fill}
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="curve"
                      name={t('Cumulative revenue share', 'Participacion acumulada')}
                      stroke={CHART_NEUTRAL}
                      strokeWidth={2.25}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <ReferenceDot
                      x={lorenz.p20x}
                      y={lorenz.p20y}
                      r={4}
                      fill={CHART_NEUTRAL}
                      stroke={CHART_NEUTRAL}
                      label={{
                        value: `${lorenz.p20y.toFixed(0)}%`,
                        position: 'top',
                        fill: AXIS_TICK.fill,
                        fontSize: 11,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  `Reading: the top 20% of sellers produce ${lorenz.p20y.toFixed(0)}% of revenue (marked point). The further the curve bows above the diagonal, the more concentrated production is.`,
                  `Lectura: el 20% superior de vendedores produce ${lorenz.p20y.toFixed(0)}% de los ingresos (punto marcado). Cuanto mas se separa la curva de la diagonal, mas concentrada esta la produccion.`,
                )}
              </p>
            </Panel>
          )}
        </>
      )}
    </RevenueScaffold>
  );
}
