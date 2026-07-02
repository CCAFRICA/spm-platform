'use client';

/**
 * /revenue/yield — Incentive Yield (OB-257 O3, W2c — the platform differentiator).
 *
 * "How much revenue does each incentive unit produce?" Composition (DS-003): HeroMetric row
 * (current yield vs prior yield, current revenue, current payout) + period yield trend line
 * (nulls break the line honestly — no zero-fill; labeled mean reference) with the same values
 * in a table + ranked entity-yield table with a vs-median frame per row + DistributionPosition
 * histogram of entity yields (median/mean labeled) + component payout HorizontalBar with an
 * HONESTY caption (cost-side decomposition only — component revenue attribution does not exist
 * in the data) + <InsightSlot/> for incentive-yield outlier insights. yield=null renders an
 * em-dash with a bilingual 'no payout recorded' tooltip, never 0.
 */

import { useEffect, useMemo, useState } from 'react';
import { DollarSign, TrendingUp, Wallet } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RevenueScaffold } from '@/components/revenue/RevenueScaffold';
import { StructuredAbsence } from '@/components/revenue/StructuredAbsence';
import { InsightSlot } from '@/components/revenue/InsightSlot';
import {
  DistributionPosition,
  HeroMetric,
  HorizontalBar,
  Panel,
  AXIS_TICK,
  CHART_NEUTRAL,
  GRID_STROKE,
  TOOLTIP_STYLE,
  directionColor,
} from '@/components/insights/ds003';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { useCurrency } from '@/contexts/tenant-context';
import { loadYield } from '@/lib/revenue/revenue-data-service';
import type { YieldResponse } from '@/lib/revenue/types';

const EM_DASH = '\u2014';
const ENTITY_ROWS = 12;
const COMPONENT_ROWS = 10;

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

function yieldText(y: number | null): string {
  return y == null ? EM_DASH : `${y.toFixed(2)}x`;
}

export default function YieldPage() {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const t = (en: string, es: string) => (isSpanish ? es : en);
  const { format } = useCurrency();
  const noPayoutTip = t('no payout recorded', 'sin pago registrado');

  const [data, setData] = useState<YieldResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadYield()
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
  }, []);

  const view = useMemo(() => {
    if (!data || data.periodYield.length === 0) return null;
    const labelOf = new Map(data.periods.map((p) => [p.periodId, p.label]));
    const current = data.periodYield.find((p) => p.periodId === data.currentPeriodId) ?? null;
    const prior = data.periodYield.find((p) => p.periodId === data.priorPeriodId) ?? null;
    const trend = data.periodYield.map((p) => ({
      label: labelOf.get(p.periodId) ?? p.periodId,
      y: p.yield, // null stays null -- recharts breaks the line (connectNulls off)
      revenue: p.revenue,
      payout: p.payout,
    }));
    const nonNullYields = data.periodYield.filter((p) => p.yield != null).map((p) => p.yield as number);
    const meanYield =
      nonNullYields.length > 0 ? nonNullYields.reduce((s, v) => s + v, 0) / nonNullYields.length : null;
    const entityYields = data.entityYield.filter((e) => e.yield != null).map((e) => e.yield as number);
    const medianEntityYield = median(entityYields);
    return { labelOf, current, prior, trend, meanYield, entityYields, medianEntityYield };
  }, [data]);

  const measureAbsence = data?.absences.find((a) => a.role === 'measure') ?? null;

  return (
    <RevenueScaffold
      title="Incentive Yield"
      titleEs="Rendimiento de Incentivos"
      subtitle="Revenue produced per incentive unit spent"
      subtitleEs="Ingresos producidos por unidad de incentivo gastada"
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

      {data && !data.notMaterialized && !measureAbsence && !view && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'No revenue periods are materialized yet for this tenant.',
              'Aun no hay periodos de ingresos materializados para esta organizacion.',
            )}
          </p>
        </div>
      )}

      {data && !data.notMaterialized && !measureAbsence && view && (
        <>
          {/* Glanceable primary row — yield is the differentiator, framed vs prior period */}
          <div className="grid gap-4 md:grid-cols-3">
            <div title={view.current?.yield == null ? noPayoutTip : undefined}>
              <HeroMetric
                label={t('Incentive Yield', 'Rendimiento de Incentivos')}
                value={yieldText(view.current?.yield ?? null)}
                icon={TrendingUp}
                context={{
                  direction:
                    view.current?.yield != null && view.prior?.yield != null
                      ? dirOf(view.current.yield - view.prior.yield)
                      : 'flat',
                  label:
                    view.current?.yield == null
                      ? noPayoutTip
                      : view.prior?.yield != null
                        ? `${view.current.yield - view.prior.yield >= 0 ? '+' : ''}${(view.current.yield - view.prior.yield).toFixed(2)}x ${t('vs prior period', 'vs periodo anterior')}`
                        : t('no prior yield to compare', 'sin rendimiento anterior para comparar'),
                }}
                subtitle={t('revenue per incentive unit, current period', 'ingresos por unidad de incentivo, periodo actual')}
              />
            </div>
            <HeroMetric
              label={t('Current Revenue', 'Ingresos Actuales')}
              value={view.current?.revenue ?? EM_DASH}
              format={format}
              icon={DollarSign}
              context={{
                direction: dirOf(pctDelta(view.current?.revenue ?? 0, view.prior?.revenue ?? null)),
                label: (() => {
                  const d = pctDelta(view.current?.revenue ?? 0, view.prior?.revenue ?? null);
                  return d != null
                    ? `${d >= 0 ? '+' : ''}${d.toFixed(1)}% ${t('vs prior period', 'vs periodo anterior')}`
                    : t('no prior period', 'sin periodo anterior');
                })(),
              }}
            />
            <HeroMetric
              label={t('Current Incentive Payout', 'Pago de Incentivos Actual')}
              value={view.current?.payout ?? EM_DASH}
              format={format}
              icon={Wallet}
              context={{
                direction: dirOf(pctDelta(view.current?.payout ?? 0, view.prior?.payout ?? null)),
                label: (() => {
                  const d = pctDelta(view.current?.payout ?? 0, view.prior?.payout ?? null);
                  return d != null
                    ? `${d >= 0 ? '+' : ''}${d.toFixed(1)}% ${t('vs prior period', 'vs periodo anterior')}`
                    : t('no prior period', 'sin periodo anterior');
                })(),
              }}
            />
          </div>

          {/* Yield trend — nulls break the line honestly; mean reference labels the frame */}
          <Panel
            title={t('Yield by Period', 'Rendimiento por Periodo')}
            description={t(
              'Revenue per incentive unit over time. Gaps are periods with no recorded payout \u2014 never shown as zero.',
              'Ingresos por unidad de incentivo en el tiempo. Los huecos son periodos sin pago registrado \u2014 nunca se muestran como cero.',
            )}
          >
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={view.trend} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v: number) => `${v.toFixed(1)}x`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [`${v.toFixed(2)}x`, t('Yield', 'Rendimiento')]}
                  />
                  {view.meanYield != null && (
                    <ReferenceLine
                      y={view.meanYield}
                      stroke={AXIS_TICK.fill}
                      strokeDasharray="4 4"
                      label={{
                        value: `${t('mean', 'promedio')} ${view.meanYield.toFixed(2)}x`,
                        position: 'insideTopRight',
                        fill: AXIS_TICK.fill,
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="y"
                    stroke={CHART_NEUTRAL}
                    strokeWidth={2.25}
                    dot={{ r: 2.5, fill: CHART_NEUTRAL, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">{t('Period', 'Periodo')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Revenue', 'Ingresos')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Payout', 'Pago')}</th>
                    <th className="py-2 text-right font-semibold">{t('Yield', 'Rendimiento')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.periodYield.map((p) => (
                    <tr key={p.periodId} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-3 text-foreground">{view.labelOf.get(p.periodId) ?? p.periodId}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{format(p.revenue)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{format(p.payout)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-foreground">
                        {p.yield == null ? (
                          <span className="text-muted-foreground" title={noPayoutTip}>{EM_DASH}</span>
                        ) : (
                          yieldText(p.yield)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Entity yield — ranked table with a vs-median frame + population histogram */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={t('Yield by Seller', 'Rendimiento por Vendedor')}
              description={t(
                'Current period, ranked by revenue; each yield framed against the seller median.',
                'Periodo actual, ordenado por ingresos; cada rendimiento comparado con la mediana de vendedores.',
              )}
            >
              {data.entityYield.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'No seller-level revenue is materialized for the current period.',
                    'No hay ingresos por vendedor materializados para el periodo actual.',
                  )}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-semibold">#</th>
                          <th className="py-2 pr-3 font-semibold">{t('Seller', 'Vendedor')}</th>
                          <th className="py-2 pr-3 text-right font-semibold">{t('Revenue', 'Ingresos')}</th>
                          <th className="py-2 pr-3 text-right font-semibold">{t('Payout', 'Pago')}</th>
                          <th className="py-2 pr-3 text-right font-semibold">{t('Yield', 'Rendimiento')}</th>
                          <th className="py-2 text-right font-semibold">{t('vs Median', 'vs Mediana')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.entityYield.slice(0, ENTITY_ROWS).map((e, i) => {
                          const vsMedian =
                            e.yield != null && view.medianEntityYield != null ? e.yield - view.medianEntityYield : null;
                          return (
                            <tr key={e.entityId} className="border-b border-border last:border-b-0">
                              <td className="py-2 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
                              <td className="max-w-[180px] truncate py-2 pr-3 font-medium text-foreground">
                                {e.displayName}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums text-foreground">{format(e.revenue)}</td>
                              <td className="py-2 pr-3 text-right tabular-nums text-foreground">{format(e.payout)}</td>
                              <td className="py-2 pr-3 text-right font-semibold tabular-nums text-foreground">
                                {e.yield == null ? (
                                  <span className="text-muted-foreground" title={noPayoutTip}>{EM_DASH}</span>
                                ) : (
                                  yieldText(e.yield)
                                )}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {vsMedian == null ? (
                                  <span className="text-muted-foreground" title={noPayoutTip}>{EM_DASH}</span>
                                ) : (
                                  <span style={{ color: directionColor(dirOf(vsMedian)) }}>
                                    {`${vsMedian >= 0 ? '+' : ''}${vsMedian.toFixed(2)}x`}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {data.entityYield.length > ENTITY_ROWS && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(
                        `Showing top ${ENTITY_ROWS} of ${data.entityYield.length} sellers by revenue.`,
                        `Mostrando los ${ENTITY_ROWS} primeros de ${data.entityYield.length} vendedores por ingresos.`,
                      )}
                    </p>
                  )}
                </>
              )}
            </Panel>

            <Panel
              title={t('Yield Distribution', 'Distribucion del Rendimiento')}
              description={t(
                'Where seller yields cluster \u2014 outliers sit far from the labeled median (P50).',
                'Donde se agrupan los rendimientos \u2014 los atipicos quedan lejos de la mediana marcada (P50).',
              )}
            >
              {view.entityYields.length >= 2 ? (
                <DistributionPosition
                  data={view.entityYields}
                  markers={{ quartiles: true, mean: true }}
                  format={(n: number) => `${n.toFixed(2)}x`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Not enough sellers with recorded payout to draw a distribution.',
                    'No hay suficientes vendedores con pago registrado para dibujar una distribucion.',
                  )}
                </p>
              )}
            </Panel>
          </div>

          {/* Cost composition — HONESTY: cost side only, no component revenue attribution */}
          <Panel
            title={t('Incentive Cost Composition', 'Composicion del Costo de Incentivos')}
            description={t(
              'Current-period payout by plan component, against the average component payout.',
              'Pago del periodo actual por componente del plan, contra el pago promedio por componente.',
            )}
          >
            {data.componentPayouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  'No component-level payout is recorded for the current period.',
                  'No hay pagos por componente registrados para el periodo actual.',
                )}
              </p>
            ) : (
              <>
                <HorizontalBar
                  items={data.componentPayouts.map((c) => ({ label: c.name, value: c.payout }))}
                  referenceLine={{
                    value:
                      data.componentPayouts.reduce((s, c) => s + c.payout, 0) / data.componentPayouts.length,
                    label: t('Avg component', 'Promedio por componente'),
                  }}
                  format={format}
                  maxRows={COMPONENT_ROWS}
                />
                {data.componentPayouts.length > COMPONENT_ROWS && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t(
                      `Showing top ${COMPONENT_ROWS} of ${data.componentPayouts.length} components.`,
                      `Mostrando los ${COMPONENT_ROWS} primeros de ${data.componentPayouts.length} componentes.`,
                    )}
                  </p>
                )}
              </>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                'Honesty note: this is the COST-side decomposition of each revenue unit. Component-level revenue attribution does not exist in the data, so components are compared by what they pay out, not by what they earn.',
                'Nota de honestidad: esta es la descomposicion del lado del COSTO por cada unidad de ingreso. La atribucion de ingresos por componente no existe en los datos, asi que los componentes se comparan por lo que pagan, no por lo que generan.',
              )}
            </p>
          </Panel>

          {/* Intelligence — incentive-yield outlier insights render here when entitled */}
          <InsightSlot />
        </>
      )}
    </RevenueScaffold>
  );
}
