'use client';

/**
 * /revenue/patterns — Temporal Patterns (OB-257 O3, W2a).
 *
 * Decision task: "how does revenue move over time?" Data: loadPatterns() — the period revenue
 * series served from materialized rollups. For month-grain tenants the PERIOD is the honest
 * grain: no sub-period (day/hour) detail exists in the source data, so no heatmap is fabricated
 * — the grain is stated in a caption instead.
 *
 * DS-003 composition: HeroMetric pair (best/worst period, framed vs the period mean) +
 * single-series trend chart (monitoring) + period delta table (tooltip-independent) = 3
 * distinct component types. Reference frames: best/worst vs period mean; each table row vs
 * its prior period; chart endpoint direct-labeled.
 *
 * C2: loading quiet / fetch error inline verbatim / notMaterialized + measure absence render
 * StructuredAbsence; fewer than two materialized periods renders a named absence (temporal
 * patterns need at least two points) — never a one-point trend or empty chart.
 */

import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
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
import { loadPatterns } from '@/lib/revenue/revenue-data-service';
import type { PatternsResponse } from '@/lib/revenue/types';

// ── helpers ────────────────────────────────────────────────────────────────────

/** signed percent with ASCII sign (input already x100). */
function fmtPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
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

// ── page ───────────────────────────────────────────────────────────────────────

export default function RevenuePatternsPage() {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const { format } = useCurrency();
  // HF-374: switcher-effective tenant — the loaders REQUIRE it (financial idiom).
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;

  const [data, setData] = useState<PatternsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { scope } = usePersona();
  // SR-39 fail-closed: non-admin sends an EXPLICIT scope (even empty) so the server serves only
  // scoped entity-grain data instead of falling open to the whole tenant.
  const scopeEntityIds = useMemo(() => (scope.canSeeAll ? undefined : scope.entityIds), [scope]);

  useEffect(() => {
    if (!tenantId) return; // tenant context resolves momentarily; the effect re-fires (HF-374)
    let cancelled = false;
    loadPatterns(tenantId, { scopeEntityIds })
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

  const series = data?.series ?? [];
  const measureAbsence = data?.absences.find((a) => a.role === 'measure') ?? null;

  // best/worst vs the period mean (served points only; display arithmetic)
  const mean = series.length > 0 ? series.reduce((s, p) => s + p.primary, 0) / series.length : 0;
  const best = series.length > 0 ? series.reduce((a, b) => (b.primary > a.primary ? b : a)) : null;
  const worst = series.length > 0 ? series.reduce((a, b) => (b.primary < a.primary ? b : a)) : null;
  const vsMeanPct = (v: number): number | null => (mean > 0 ? ((v - mean) / mean) * 100 : null);

  const tableRows = series
    .map((p, i) => {
      const prev = i > 0 ? series[i - 1] : null;
      return {
        point: p,
        delta: prev ? p.primary - prev.primary : null,
        deltaPct: prev && prev.primary > 0 ? ((p.primary - prev.primary) / prev.primary) * 100 : null,
      };
    })
    .reverse();

  return (
    <RevenueScaffold
      title="Temporal Patterns"
      titleEs="Patrones Temporales"
      subtitle="How revenue moves across materialized periods"
      subtitleEs="Como se mueven los ingresos entre periodos materializados"
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
      ) : measureAbsence ? (
        <StructuredAbsence role={measureAbsence.role} reason={measureAbsence.reason} className="w-full" />
      ) : series.length < 2 ? (
        <StructuredAbsence
          reason={t(
            'At least two materialized periods are required for temporal patterns.',
            'Se requieren al menos dos periodos materializados para patrones temporales.',
          )}
          className="w-full"
        />
      ) : (
        <>
          {/* Best/worst callouts — framed vs the period mean */}
          <div className="grid gap-4 md:grid-cols-2">
            {best && (
              <HeroMetric
                label={t('Best period', 'Mejor periodo')}
                value={best.primary}
                format={format}
                icon={TrendingUp}
                context={{
                  direction: 'up',
                  label:
                    vsMeanPct(best.primary) != null
                      ? `${fmtPct(vsMeanPct(best.primary)!)} ${t('vs period mean', 'vs media de periodos')} (${format(mean)})`
                      : t('period mean unavailable', 'media de periodos no disponible'),
                }}
                subtitle={best.label}
              />
            )}
            {worst && (
              <HeroMetric
                label={t('Worst period', 'Peor periodo')}
                value={worst.primary}
                format={format}
                icon={TrendingDown}
                context={{
                  direction: 'down',
                  label:
                    vsMeanPct(worst.primary) != null
                      ? `${fmtPct(vsMeanPct(worst.primary)!)} ${t('vs period mean', 'vs media de periodos')} (${format(mean)})`
                      : t('period mean unavailable', 'media de periodos no disponible'),
                }}
                subtitle={worst.label}
              />
            )}
          </div>

          {/* Period-over-period trend — single series, endpoint direct-label, solid grid */}
          <Panel
            title={t('Revenue over time', 'Ingresos en el tiempo')}
            description={t(
              'Grain: materialized periods. Sub-period (day/hour) detail does not exist in the source data and is not shown.',
              'Grano: periodos materializados. El detalle sub-periodo (dia u hora) no existe en los datos fuente y no se muestra.',
            )}
          >
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={series.map((p) => ({ label: p.label, primary: p.primary }))}
                  margin={{ top: 18, right: 48, bottom: 4, left: 8 }}
                >
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
                      content={<EndpointLabel lastIndex={series.length - 1} formatValue={compact} />}
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Period deltas — every charted value reachable without the tooltip */}
          <Panel title={t('Period-over-period detail', 'Detalle periodo a periodo')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">{t('Period', 'Periodo')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('Revenue', 'Ingresos')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('vs prior', 'vs anterior')}</th>
                    <th className="py-2 text-right font-semibold">{t('% change', '% cambio')}</th>
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
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {deltaPct == null ? '-' : fmtPct(deltaPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </RevenueScaffold>
  );
}
