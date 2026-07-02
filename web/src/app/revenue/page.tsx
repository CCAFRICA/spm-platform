'use client';

/**
 * /revenue — Revenue Pulse (OB-257 O3, W2a).
 *
 * Decision task: "where does revenue stand right now and is the pace healthy?"
 * Data: loadPulse() — every number is a materialized rollup served by /api/revenue/data
 * (MSP invariant; zero client-side aggregation beyond display deltas between served points).
 *
 * DS-003 composition: HeroMetric row (identification) + single-series period trend chart
 * (monitoring) + period detail table (tooltip-independent access) + InsightSlot + discovery
 * links = 3+ distinct component types. Every quantitative element carries a reference frame:
 * current revenue vs prior period, pace vs trailing mean of N periods (labeled arithmetic,
 * no prediction wording), active sellers vs prior period, table deltas vs prior period.
 *
 * C2: loading quiet / fetch error inline verbatim / notMaterialized + role absences render
 * StructuredAbsence — never zeros or empty charts. THEME (Rule 30): semantic classes +
 * ds003-token vars only.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight,
  ArrowRight,
  Clock,
  DollarSign,
  Gauge,
  Layers,
  MapPin,
  Percent,
  Target,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RevenueScaffold } from '@/components/revenue/RevenueScaffold';
import { StructuredAbsence } from '@/components/revenue/StructuredAbsence';
import { InsightSlot } from '@/components/revenue/InsightSlot';
import {
  HeroMetric,
  Panel,
  AXIS_TICK,
  CHART_NEUTRAL,
  GRID_STROKE,
  TOOLTIP_STYLE,
  compact,
} from '@/components/insights/ds003';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { usePersona } from '@/contexts/persona-context';
import { loadPulse } from '@/lib/revenue/revenue-data-service';
import type { PulseResponse, RevenuePeriodPoint } from '@/lib/revenue/types';

// ── helpers ────────────────────────────────────────────────────────────────────

/** signed percent with ASCII sign, e.g. +12.4% / -3.0% (input is already x100). */
function fmtPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function directionOf(delta: number | null): 'up' | 'down' | 'flat' {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/** endpoint direct-label — renders ONLY on the last point (selective labeling rule). */
function EndpointLabel(props: {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  index?: number;
  lastIndex?: number;
  formatValue?: (n: number) => string;
}) {
  const { x, y, value, index, lastIndex, formatValue } = props;
  if (index == null || index !== lastIndex || x == null || y == null || value == null) return null;
  return (
    <text
      x={Number(x)}
      y={Number(y) - 10}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
      fill={AXIS_TICK.fill}
    >
      {formatValue ? formatValue(Number(value)) : String(value)}
    </text>
  );
}

// ── discovery row: link cards to the other 7 revenue surfaces ─────────────────

const SURFACES = [
  { href: '/revenue/bridge', icon: ArrowLeftRight, en: 'Revenue Bridge', es: 'Puente de Ingresos', descEn: 'What moved revenue vs the prior period', descEs: 'Que movio los ingresos vs el periodo anterior' },
  { href: '/revenue/mix', icon: Layers, en: 'Revenue Mix', es: 'Composicion de Ingresos', descEn: 'Composition and share shifts over time', descEs: 'Composicion y cambios de participacion en el tiempo' },
  { href: '/revenue/sellers', icon: Users, en: 'Sellers', es: 'Vendedores', descEn: 'Ranked producers and cumulative share', descEs: 'Productores clasificados y participacion acumulada' },
  { href: '/revenue/concentration', icon: Target, en: 'Concentration', es: 'Concentracion', descEn: 'Dependence on top producers and decliners', descEs: 'Dependencia de los principales productores y descensos' },
  { href: '/revenue/yield', icon: Percent, en: 'Incentive Yield', es: 'Rendimiento de Incentivos', descEn: 'Revenue per incentive dollar paid', descEs: 'Ingresos por dolar de incentivo pagado' },
  { href: '/revenue/patterns', icon: Clock, en: 'Temporal Patterns', es: 'Patrones Temporales', descEn: 'How revenue moves across periods', descEs: 'Como se mueven los ingresos entre periodos' },
  { href: '/revenue/geography', icon: MapPin, en: 'Geography', es: 'Geografia', descEn: 'Where revenue is produced', descEs: 'Donde se producen los ingresos' },
] as const;

function DiscoveryRow({ isSpanish }: { isSpanish: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {isSpanish ? 'Superficies de Ingresos' : 'Revenue Surfaces'}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SURFACES.map((s) => (
          <Link key={s.href} href={s.href}>
            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50">
              <div className="mb-2 flex items-start justify-between">
                <s.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="mb-1 text-sm font-semibold text-foreground">{isSpanish ? s.es : s.en}</p>
              <p className="flex-1 text-xs text-muted-foreground">{isSpanish ? s.descEs : s.descEn}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function RevenuePulsePage() {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const { format } = useCurrency();
  // HF-374: switcher-effective tenant — the loaders REQUIRE it (financial idiom).
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [data, setData] = useState<PulseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { scope } = usePersona();
  // SR-39 fail-closed: non-admin sends an EXPLICIT scope (even empty) so the server serves only
  // scoped entity-grain data instead of falling open to the whole tenant.
  const scopeEntityIds = useMemo(() => (scope.canSeeAll ? undefined : scope.entityIds), [scope]);

  useEffect(() => {
    if (!tenantId) return; // tenant context resolves momentarily; the effect re-fires (HF-374)
    let cancelled = false;
    loadPulse(tenantId, { scopeEntityIds })
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
  }, [tenantId, scopeEntityIds]);

  const t = (en: string, es: string) => (isSpanish ? es : en);

  const periods: RevenuePeriodPoint[] = data?.periods ?? [];
  const current = data?.currentPeriodId ? periods.find((p) => p.periodId === data.currentPeriodId) ?? null : null;
  const prior = data?.priorPeriodId ? periods.find((p) => p.periodId === data.priorPeriodId) ?? null : null;
  const measureAbsence = data?.absences.find((a) => a.role === 'measure') ?? null;

  // reference frames (display arithmetic between SERVED points only)
  const revDeltaPct = current && prior && prior.primary > 0 ? ((current.primary - prior.primary) / prior.primary) * 100 : null;
  const sellersDelta = current && prior ? current.entityCount - prior.entityCount : null;
  const pace = data?.pace ?? null;

  const chartData = periods.map((p) => ({ label: p.label, primary: p.primary }));
  // detail table latest-first; deltas vs the prior served point in ascending order
  const tableRows = periods
    .map((p, i) => {
      const prev = i > 0 ? periods[i - 1] : null;
      return {
        point: p,
        delta: prev ? p.primary - prev.primary : null,
        deltaPct: prev && prev.primary > 0 ? ((p.primary - prev.primary) / prev.primary) * 100 : null,
      };
    })
    .reverse();

  return (
    <RevenueScaffold
      title="Revenue Pulse"
      titleEs="Pulso de Ingresos"
      subtitle="Where revenue stands right now and whether the pace is healthy"
      subtitleEs="Donde estan los ingresos ahora y si el ritmo es saludable"
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
        <>
          <StructuredAbsence reason={data.notMaterialized.reason} className="w-full" />
          <DiscoveryRow isSpanish={isSpanish} />
        </>
      ) : measureAbsence ? (
        <>
          <StructuredAbsence role={measureAbsence.role} reason={measureAbsence.reason} className="w-full" />
          <InsightSlot />
          <DiscoveryRow isSpanish={isSpanish} />
        </>
      ) : !current ? (
        <>
          <StructuredAbsence
            reason={t(
              'No materialized revenue periods exist for this tenant yet.',
              'Aun no existen periodos de ingresos materializados para esta organizacion.',
            )}
            className="w-full"
          />
          <DiscoveryRow isSpanish={isSpanish} />
        </>
      ) : (
        <>
          {/* Hero row — glanceable primary row (progressive disclosure) */}
          <div className="grid gap-4 md:grid-cols-3">
            <HeroMetric
              label={t('Revenue this period', 'Ingresos del periodo')}
              value={current.primary}
              format={format}
              icon={DollarSign}
              context={{
                direction: directionOf(revDeltaPct),
                label:
                  revDeltaPct != null && prior
                    ? `${fmtPct(revDeltaPct)} vs ${prior.label}`
                    : t('no prior period', 'sin periodo anterior'),
              }}
              subtitle={current.label}
            />
            <HeroMetric
              label={t('Pace', 'Ritmo')}
              value={pace && pace.deltaPct != null ? fmtPct(pace.deltaPct) : '-'}
              icon={Gauge}
              context={{
                direction: directionOf(pace?.deltaPct ?? null),
                label:
                  pace && pace.trailingMean != null
                    ? t(
                        `vs trailing mean of ${pace.trailingCount} periods`,
                        `vs media de los ${pace.trailingCount} periodos anteriores`,
                      )
                    : t('no trailing periods yet', 'aun no hay periodos anteriores'),
              }}
              subtitle={
                pace && pace.trailingMean != null
                  ? `${t('Trailing mean', 'Media de periodos anteriores')}: ${format(pace.trailingMean)}`
                  : undefined
              }
            />
            <HeroMetric
              label={t('Active sellers', 'Vendedores activos')}
              value={current.entityCount}
              icon={Users}
              context={{
                direction: directionOf(sellersDelta),
                label:
                  sellersDelta != null && prior
                    ? `${sellersDelta >= 0 ? '+' : ''}${sellersDelta} vs ${prior.label}`
                    : t('no prior period', 'sin periodo anterior'),
              }}
              subtitle={t('sellers with revenue this period', 'vendedores con ingresos este periodo')}
            />
          </div>

          {/* Period trend — single series, accent hue, endpoint direct-label, solid hairline grid */}
          <Panel
            title={t('Revenue by period', 'Ingresos por periodo')}
            description={t('Materialized periods, ascending', 'Periodos materializados, ascendente')}
          >
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 18, right: 48, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={compact} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number) => [format(value), t('Revenue', 'Ingresos')]}
                  />
                  <Area
                    type="monotone"
                    dataKey="primary"
                    stroke={CHART_NEUTRAL}
                    strokeWidth={2.25}
                    fill={CHART_NEUTRAL}
                    fillOpacity={0.08}
                    dot={false}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="primary"
                      content={<EndpointLabel lastIndex={chartData.length - 1} formatValue={compact} />}
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Period detail — every charted value reachable without the tooltip */}
          <Panel title={t('Period detail', 'Detalle por periodo')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">{t('Period', 'Periodo')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Revenue', 'Ingresos')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('vs prior', 'vs anterior')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('% change', '% cambio')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Rows', 'Filas')}</th>
                    <th className="py-2 text-right font-semibold">{t('Sellers', 'Vendedores')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(({ point, delta, deltaPct }) => (
                    <tr key={point.periodId} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-3 text-foreground">{point.label}</td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums text-foreground">
                        {format(point.primary)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {delta == null ? '-' : `${delta >= 0 ? '+' : ''}${format(delta)}`}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {deltaPct == null ? '-' : fmtPct(deltaPct)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {point.rowCount.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {point.entityCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Intelligence slot — self-gates on entitlement */}
          <InsightSlot />

          <DiscoveryRow isSpanish={isSpanish} />
        </>
      )}
    </RevenueScaffold>
  );
}
