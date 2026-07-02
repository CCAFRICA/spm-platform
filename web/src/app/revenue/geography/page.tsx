'use client';

/**
 * /revenue/geography — Geography (OB-257 O3, W2a).
 *
 * Decision task: "where is revenue produced?" Data: loadGeography() — dimensionPeriod rollups
 * for the recognized 'location' role. When the role is unresolved the envelope carries a named
 * absence and this page renders StructuredAbsence with the recognizer's reason — never a
 * fabricated grain (C2).
 *
 * DS-003 composition: HeroMetric pair (leader with share-of-total frame, locations reporting
 * vs prior) + HorizontalBar ranking (mean reference line) + mix-over-time stacked bars
 * (composition; <=6 members + Other fold, stable member colors, legend, one axis) + member
 * table with trend sparklines (tooltip-independent) = 4 distinct component types. Reference
 * frames: share-of-total, vs prior period, mean per location, sparkline first-value baseline.
 */

import { useEffect, useMemo, useState } from 'react';
import { MapPin, Users } from 'lucide-react';
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
  HorizontalBar,
  Panel,
  Sparkline,
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_STYLE,
  compact,
  paletteColor,
} from '@/components/insights/ds003';
import { useCurrency } from '@/contexts/tenant-context';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { loadGeography } from '@/lib/revenue/revenue-data-service';
import type { GeographyResponse, RevenueDimensionPoint } from '@/lib/revenue/types';

// ── helpers ────────────────────────────────────────────────────────────────────

/** signed percent with ASCII sign (input already x100). */
function fmtPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function directionOf(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/** stacked mix-over-time: top members by all-period total; colors stable by FIRST-period order. */
const MAX_STACK_MEMBERS = 6;

// ── page ───────────────────────────────────────────────────────────────────────

export default function RevenueGeographyPage() {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const { format } = useCurrency();

  const [data, setData] = useState<GeographyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGeography()
      .then((res) => {
        if (!cancelled) {
          setData(res); // previous render held until this lands (no skeleton flash)
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

  const t = (en: string, es: string) => (isSpanish ? es : en);

  const members: RevenueDimensionPoint[] = data?.members ?? [];
  const periods = data?.periods ?? [];
  const locationAbsence = data?.absences.find((a) => a.role === 'location') ?? null;
  const measureAbsence = data?.absences.find((a) => a.role === 'measure') ?? null;

  // reference frames over SERVED points (display arithmetic only)
  const totalCurrent = members.reduce((s, m) => s + m.primary, 0);
  const leader = members.length > 0 ? members[0] : null; // served ranked by current primary desc
  const meanCurrent = members.length > 0 ? totalCurrent / members.length : 0;
  const reportingNow = members.filter((m) => m.primary > 0).length;
  const reportingPrior = data?.priorPeriodId ? members.filter((m) => (m.prior ?? 0) > 0).length : null;
  const reportingDelta = reportingPrior != null ? reportingNow - reportingPrior : null;
  const leaderDelta = leader && leader.prior != null ? leader.primary - leader.prior : null;

  // mix-over-time stack: keep top members by all-period total, fold the tail into Other;
  // color assignment is stable by first-period order (never re-colored on filter).
  const mixChart = useMemo(() => {
    if (!data || periods.length < 2 || members.length === 0) return null;
    const firstId = periods[0].periodId;
    const byTotal = [...members].sort(
      (a, b) =>
        periods.reduce((s, p) => s + (b.byPeriod[p.periodId] ?? 0), 0) -
        periods.reduce((s, p) => s + (a.byPeriod[p.periodId] ?? 0), 0),
    );
    const kept = byTotal
      .slice(0, MAX_STACK_MEMBERS)
      .sort((a, b) => (b.byPeriod[firstId] ?? 0) - (a.byPeriod[firstId] ?? 0));
    const folded = byTotal.slice(MAX_STACK_MEMBERS);
    const rows = periods.map((p) => {
      const row: Record<string, number | string> = { label: p.label };
      kept.forEach((m, i) => {
        row[`m${i}`] = m.byPeriod[p.periodId] ?? 0;
      });
      if (folded.length > 0) {
        row.other = folded.reduce((s, m) => s + (m.byPeriod[p.periodId] ?? 0), 0);
      }
      return row;
    });
    return { rows, kept, hasOther: folded.length > 0 };
  }, [data, periods, members]);

  return (
    <RevenueScaffold
      title="Geography"
      titleEs="Geografia"
      subtitle="Where revenue is produced"
      subtitleEs="Donde se producen los ingresos"
    >
      {error ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold text-destructive">
            {t('Revenue data could not be loaded', 'No se pudieron cargar los datos de ingresos')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">{t('Loading revenue data...', 'Cargando datos de ingresos...')}</p>
      ) : data.notMaterialized ? (
        <StructuredAbsence reason={data.notMaterialized.reason} className="w-full" />
      ) : locationAbsence ? (
        <StructuredAbsence role={locationAbsence.role} reason={locationAbsence.reason} className="w-full" />
      ) : measureAbsence ? (
        <StructuredAbsence role={measureAbsence.role} reason={measureAbsence.reason} className="w-full" />
      ) : members.length === 0 ? (
        <StructuredAbsence
          reason={t(
            'No location-attributed revenue rows exist in the materialized periods.',
            'No existen filas de ingresos atribuidas a ubicaciones en los periodos materializados.',
          )}
          className="w-full"
        />
      ) : (
        <>
          {/* Hero row — glanceable primary row (progressive disclosure) */}
          <div className="grid gap-4 md:grid-cols-2">
            {leader && (
              <HeroMetric
                label={t('Leading location', 'Ubicacion lider')}
                value={leader.primary}
                format={format}
                icon={MapPin}
                context={{
                  direction: directionOf(leaderDelta),
                  label:
                    totalCurrent > 0
                      ? `${((leader.primary / totalCurrent) * 100).toFixed(1)}% ${t('of located revenue', 'de los ingresos ubicados')}`
                      : t('no located revenue this period', 'sin ingresos ubicados este periodo'),
                }}
                subtitle={
                  leaderDelta != null
                    ? `${leader.member} (${leaderDelta >= 0 ? '+' : ''}${format(leaderDelta)} ${t('vs prior period', 'vs periodo anterior')})`
                    : leader.member
                }
              />
            )}
            <HeroMetric
              label={t('Locations reporting', 'Ubicaciones con ingresos')}
              value={reportingNow}
              icon={Users}
              context={{
                direction: directionOf(reportingDelta),
                label:
                  reportingDelta != null
                    ? `${reportingDelta >= 0 ? '+' : ''}${reportingDelta} ${t('vs prior period', 'vs periodo anterior')}`
                    : t('no prior period', 'sin periodo anterior'),
              }}
              subtitle={t('locations with revenue this period', 'ubicaciones con ingresos este periodo')}
            />
          </div>

          {/* Ranked comparison — one series, one hue, mean reference line */}
          <Panel
            title={t('Revenue by location (current period)', 'Ingresos por ubicacion (periodo actual)')}
            description={t(
              'Ranked by current-period revenue; the dashed line marks the mean per location.',
              'Clasificado por ingresos del periodo actual; la linea discontinua marca el promedio por ubicacion.',
            )}
          >
            <HorizontalBar
              items={members.map((m) => ({ label: m.member, value: m.primary }))}
              referenceLine={{ value: meanCurrent, label: t('Mean per location', 'Promedio por ubicacion') }}
              format={format}
              maxRows={12}
              emptyLabel={t('No data.', 'Sin datos.')}
            />
          </Panel>

          {/* Mix over time — composition; <=6 members + Other, stable colors, legend, one axis */}
          {mixChart && (
            <Panel
              title={t('Mix over time', 'Composicion en el tiempo')}
              description={t(
                'Revenue by location per period; smaller locations are folded into Other.',
                'Ingresos por ubicacion por periodo; las ubicaciones menores se agrupan en Otros.',
              )}
            >
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mixChart.rows} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={compact} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => [format(value), name]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value: string) => <span style={{ color: AXIS_TICK.fill }}>{value}</span>}
                    />
                    {mixChart.kept.map((m, i) => (
                      <Bar
                        key={m.member}
                        dataKey={`m${i}`}
                        name={m.member}
                        stackId="mix"
                        fill={paletteColor(i)}
                        stroke={TOOLTIP_STYLE.background}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    ))}
                    {mixChart.hasOther && (
                      <Bar
                        dataKey="other"
                        name={t('Other', 'Otros')}
                        stackId="mix"
                        fill={AXIS_TICK.fill}
                        stroke={TOOLTIP_STYLE.background}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          {/* Member detail — every charted value reachable without the tooltip */}
          <Panel
            title={t('Location detail', 'Detalle por ubicacion')}
            description={t(
              'Only rows with a recognized location value are shown; shares are of located revenue.',
              'Solo se muestran filas con un valor de ubicacion reconocido; las participaciones son sobre ingresos ubicados.',
            )}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">{t('Location', 'Ubicacion')}</th>
                    <th className="py-2 pr-3 font-semibold">{t('Trend', 'Tendencia')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Current', 'Actual')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('vs prior', 'vs anterior')}</th>
                    <th className="py-2 text-right font-semibold">{t('Share', 'Participacion')}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const trendSeries = periods.map((p) => m.byPeriod[p.periodId] ?? 0);
                    const delta = m.prior != null ? m.primary - m.prior : null;
                    const deltaPct = m.prior != null && m.prior > 0 ? ((m.primary - m.prior) / m.prior) * 100 : null;
                    return (
                      <tr key={m.member} className="border-b border-border last:border-b-0">
                        <td className="py-2 pr-3 text-foreground">{m.member}</td>
                        <td className="py-2 pr-3">
                          <Sparkline data={trendSeries} />
                        </td>
                        <td className="py-2 pr-3 text-right font-medium tabular-nums text-foreground">
                          {format(m.primary)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {delta == null
                            ? '-'
                            : `${delta >= 0 ? '+' : ''}${format(delta)}${deltaPct != null ? ` (${fmtPct(deltaPct)})` : ''}`}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {totalCurrent > 0 ? `${((m.primary / totalCurrent) * 100).toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </RevenueScaffold>
  );
}
