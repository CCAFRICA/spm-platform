'use client';

/**
 * /revenue/concentration — Concentration & Risk (OB-257 O3, W2c).
 *
 * "How dependent are we on few contributors, and who is declining?" Composition (DS-003):
 * HeroMetric CR tiles (top-1/4/8 share, movement in points vs prior — the frame) + grouped bar
 * chart of current-vs-prior CR shares (2 series, legend, one % axis) + decliners table with
 * per-entity Sparkline and built-in trend evidence (trendPct). Empty decliners with enough
 * periods is a HEALTHY finding and renders as a quiet positive, not an absence. C2 data states
 * (loading / error / notMaterialized / role absence) render structured absence, never zeros.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { loadConcentration } from '@/lib/revenue/revenue-data-service';
import type { ConcentrationResponse } from '@/lib/revenue/types';

const EM_DASH = '\u2014';

function dirOf(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export default function ConcentrationPage() {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const t = (en: string, es: string) => (isSpanish ? es : en);
  const { format } = useCurrency();
  // HF-374: switcher-effective tenant — the loaders REQUIRE it (financial idiom).
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [data, setData] = useState<ConcentrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { scope } = usePersona();
  // SR-39 fail-closed: non-admin sends an EXPLICIT scope (even empty) so the server serves only
  // scoped entity-grain data instead of falling open to the whole tenant.
  const scopeEntityIds = useMemo(() => (scope.canSeeAll ? undefined : scope.entityIds), [scope]);

  useEffect(() => {
    if (!tenantId) return; // tenant context resolves momentarily; the effect re-fires (HF-374)
    let cancelled = false;
    loadConcentration(tenantId, { scopeEntityIds })
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

  const hasPrior = useMemo(
    () => (data ? data.topShares.some((s) => s.priorShare != null) : false),
    [data],
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.topShares.map((s) => ({
      name: `Top ${s.n}`,
      current: Math.round(s.share * 1000) / 10,
      prior: s.priorShare != null ? Math.round(s.priorShare * 1000) / 10 : null,
    }));
  }, [data]);

  const measureAbsence = data?.absences.find((a) => a.role === 'measure') ?? null;
  const enoughPeriodsForTrend = (data?.periods.length ?? 0) >= 2;

  return (
    <RevenueScaffold
      title="Concentration & Risk"
      titleEs="Concentracion y Riesgo"
      subtitle="How dependent is revenue on few contributors, and who is declining?"
      subtitleEs="Que tan dependiente es el ingreso de pocos contribuyentes, y quien esta en declive?"
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

      {data && !data.notMaterialized && !measureAbsence && data.topShares.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'No seller-level revenue is materialized yet for this tenant.',
              'Aun no hay ingresos por vendedor materializados para esta organizacion.',
            )}
          </p>
        </div>
      )}

      {data && !data.notMaterialized && !measureAbsence && data.topShares.length > 0 && (
        <>
          {/* Glanceable primary row — concentration ratios, movement in points vs prior */}
          <div className="grid gap-4 md:grid-cols-3">
            {data.topShares.map((s) => {
              const movePts = s.priorShare != null ? (s.share - s.priorShare) * 100 : null;
              return (
                <HeroMetric
                  key={s.n}
                  label={`${t('Top', 'Top')} ${s.n} ${t('Share', 'Participacion')}`}
                  value={`${(s.share * 100).toFixed(1)}%`}
                  context={{
                    direction: dirOf(movePts),
                    label:
                      movePts != null
                        ? `${movePts >= 0 ? '+' : ''}${movePts.toFixed(1)} pts ${t('vs prior period', 'vs periodo anterior')}`
                        : t('no prior period', 'sin periodo anterior'),
                  }}
                  subtitle={
                    s.n === 1
                      ? t('share of current revenue from the top seller', 'participacion del vendedor principal en el ingreso actual')
                      : t(
                          `share of current revenue from the top ${s.n} sellers`,
                          `participacion de los ${s.n} mejores vendedores en el ingreso actual`,
                        )
                  }
                />
              );
            })}
          </div>

          {/* Dependency visual — current vs prior CR shares, one % axis, legend for 2 series */}
          <Panel
            title={t('Dependency on Top Sellers', 'Dependencia de los Mejores Vendedores')}
            description={t(
              'Concentration ratios: the share of period revenue produced by the top N sellers.',
              'Razones de concentracion: la participacion del ingreso del periodo producida por los N mejores vendedores.',
            )}
          >
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
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
                  />
                  {hasPrior && (
                    <Legend
                      formatter={(value: unknown) => <span style={{ color: AXIS_TICK.fill }}>{String(value)}</span>}
                    />
                  )}
                  <Bar
                    dataKey="current"
                    name={t('Current period', 'Periodo actual')}
                    fill={CHART_NEUTRAL}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  {hasPrior && (
                    <Bar
                      dataKey="prior"
                      name={t('Prior period', 'Periodo anterior')}
                      fill={AXIS_TICK.fill}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                'A rising bar means more of the revenue depends on fewer sellers.',
                'Una barra que sube significa que mas del ingreso depende de menos vendedores.',
              )}
            </p>
          </Panel>

          {/* Decliners — trend evidence built in; empty is a healthy finding */}
          <Panel
            title={t('Declining Sellers', 'Vendedores en Declive')}
            description={t(
              'Trend compares each seller\'s recent-half average vs their earlier-half average across materialized periods.',
              'La tendencia compara el promedio de la mitad reciente de cada vendedor vs el promedio de la mitad anterior en los periodos materializados.',
            )}
          >
            {!enoughPeriodsForTrend ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  'Not enough periods yet to compute decline trends (at least two are needed).',
                  'Aun no hay suficientes periodos para calcular tendencias de declive (se necesitan al menos dos).',
                )}
              </p>
            ) : data.decliners.length === 0 ? (
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('No declining sellers detected.', 'No se detectaron vendedores en declive.')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    'Every seller\'s recent-half average holds at or above their earlier-half average \u2014 a healthy finding.',
                    'El promedio reciente de cada vendedor se mantiene igual o por encima de su promedio anterior \u2014 un hallazgo saludable.',
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">{t('Seller', 'Vendedor')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('Period Series', 'Serie por Periodo')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('Latest Period', 'Ultimo Periodo')}</th>
                      <th className="py-2 text-right font-semibold">{t('Trend', 'Tendencia')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.decliners.map((d) => {
                      const series = data.periods.map((p) => d.byPeriod[p.periodId] ?? 0);
                      const latest = data.currentPeriodId != null ? (d.byPeriod[data.currentPeriodId] ?? 0) : null;
                      return (
                        <tr key={d.entityId} className="border-b border-border last:border-b-0">
                          <td className="max-w-[240px] truncate py-2 pr-3 font-medium text-foreground">
                            {d.displayName}
                          </td>
                          <td className="py-2 pr-3">
                            <Sparkline data={series} />
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                            {latest != null ? format(latest) : EM_DASH}
                          </td>
                          <td
                            className="py-2 text-right font-semibold tabular-nums"
                            style={{ color: directionColor('down') }}
                          >
                            {`${d.trendPct.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </RevenueScaffold>
  );
}
