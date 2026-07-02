'use client';

/**
 * /revenue/bridge - Growth Bridge (OB-257 W2b).
 *
 * "Exactly what added and what subtracted revenue vs last period?" One loadBridge() call;
 * hero pair (prior -> current with the net delta), a diverging-polarity waterfall (floating
 * bars on an invisible base stack, ONE axis), and the tooltip-independent drill table of
 * every member's prior/current/delta. The decomposition grain is the SERVER's dimensionRole
 * - named honestly in the caption, including the entity fallback.
 *
 * C2: notMaterialized -> full StructuredAbsence; <2 periods -> StructuredAbsence; role
 * absences surface for the affected section only. THEME (Rule 30): all chart colors are
 * var(--vl-*) token strings composed from ds003-tokens exports - zero color literals here.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RevenueScaffold } from '@/components/revenue/RevenueScaffold';
import { StructuredAbsence } from '@/components/revenue/StructuredAbsence';
import { loadBridge } from '@/lib/revenue/revenue-data-service';
import type { BridgeResponse } from '@/lib/revenue/types';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { useCurrency } from '@/contexts/tenant-context';
import {
  AXIS_TICK,
  GRID_STROKE,
  HeroMetric,
  Panel,
  SEMANTIC,
  TOOLTIP_STYLE,
  compact,
  toneColor,
} from '@/components/insights/ds003';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Polarity + neutral tokens (ds003 idiom: var(--vl-*) with the token file's own fallback values).
const POSITIVE = `var(--vl-status-success, ${SEMANTIC.green})`;
const NEGATIVE = `var(--vl-status-danger, ${SEMANTIC.red})`;
const NEUTRAL = toneColor('neutral');
const LABEL_FILL = AXIS_TICK.fill;

/** Waterfall folds the tail beyond this many members into Other/Otros (chart only; table shows all). */
const MAX_WATERFALL_MEMBERS = 8;

interface WfRow {
  name: string;
  base: number; // invisible stack base (floating bar)
  span: number; // visible bar height = |delta| (or the total)
  kind: 'total' | 'pos' | 'neg';
  value: number; // total amount for totals; SIGNED delta for members
  prior: number | null;
  current: number | null;
  direct: boolean; // direct-label flag: the two totals + the largest delta only
  note?: string;
}

const trunc = (s: string, n = 12) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

export default function RevenueBridgePage() {
  const router = useRouter();
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const { format } = useCurrency();
  const t = (en: string, es: string) => (isSpanish ? es : en);

  const [data, setData] = useState<BridgeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadBridge()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const periodLabel = (pid: string | null | undefined): string =>
    (pid && data?.periods.find((p) => p.periodId === pid)?.label) || (pid ?? '');

  const signedMoney = (v: number) => `${v >= 0 ? '+' : '-'}${format(Math.abs(v))}`;
  const signedCompact = (v: number) => `${v >= 0 ? '+' : '-'}${compact(Math.abs(v))}`;
  const signedPctStr = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}%`;

  const grainCaption = (grain: BridgeResponse['dimensionRole']): string => {
    if (grain === 'location') return t('Decomposed by location.', 'Descompuesto por ubicacion.');
    if (grain === 'category') return t('Decomposed by category.', 'Descompuesto por categoria.');
    return t(
      'Decomposed by seller - no location or category dimension resolved for this tenant, so the entity grain is used.',
      'Descompuesto por vendedor - no se resolvio una dimension de ubicacion o categoria para esta organizacion, por lo que se usa el nivel de entidad.',
    );
  };

  // Waterfall rows: [prior total, members ranked by |delta| (tail folded), residual, current total].
  const chartRows = useMemo<WfRow[] | null>(() => {
    if (!data?.current || !data?.prior) return null;
    const priorName = periodLabel(data.prior.periodId) || t('Prior', 'Anterior');
    const currentName = periodLabel(data.current.periodId) || t('Current', 'Actual');
    const top = data.deltas.slice(0, MAX_WATERFALL_MEMBERS);
    const tail = data.deltas.slice(MAX_WATERFALL_MEMBERS);
    const items: Array<{ label: string; delta: number; prior: number | null; current: number | null; note?: string }> =
      top.map((d) => ({ label: d.label, delta: d.delta, prior: d.prior, current: d.current }));
    if (tail.length > 0) {
      items.push({
        label: t('Other', 'Otros'),
        delta: tail.reduce((s, d) => s + d.delta, 0),
        prior: tail.reduce((s, d) => s + d.prior, 0),
        current: tail.reduce((s, d) => s + d.current, 0),
        note: t(`${tail.length} smaller members folded`, `${tail.length} miembros menores agrupados`),
      });
    }
    const attributed = data.deltas.reduce((s, d) => s + d.delta, 0);
    const residual = Math.round((data.current.total - data.prior.total - attributed) * 100) / 100;
    if (Math.abs(residual) >= 0.01) {
      items.push({
        label: t('Unattributed', 'Sin atribuir'),
        delta: residual,
        prior: null,
        current: null,
        note: t('change on rows without a named member', 'cambio en filas sin miembro identificado'),
      });
    }
    let maxIdx = -1;
    let maxAbs = 0;
    items.forEach((it, i) => {
      if (Math.abs(it.delta) > maxAbs) {
        maxAbs = Math.abs(it.delta);
        maxIdx = i;
      }
    });
    const rows: WfRow[] = [
      { name: priorName, base: 0, span: data.prior.total, kind: 'total', value: data.prior.total, prior: null, current: null, direct: true },
    ];
    let cum = data.prior.total;
    items.forEach((it, i) => {
      const start = cum;
      cum += it.delta;
      rows.push({
        name: it.label,
        base: Math.min(start, cum),
        span: Math.abs(it.delta),
        kind: it.delta >= 0 ? 'pos' : 'neg',
        value: it.delta,
        prior: it.prior,
        current: it.current,
        direct: i === maxIdx,
        note: it.note,
      });
    });
    rows.push({ name: currentName, base: 0, span: data.current.total, kind: 'total', value: data.current.total, prior: null, current: null, direct: true });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isSpanish]);

  const navigable = data?.dimensionRole === 'location' || data?.dimensionRole === 'entity';
  const drillTarget = data?.dimensionRole === 'location' ? '/revenue/geography' : '/revenue/sellers';

  const renderBody = () => {
    if (!data) return null;
    if (data.notMaterialized) return <StructuredAbsence reason={data.notMaterialized.reason} className="w-full" />;

    const measureAbsence = data.absences.find((a) => a.role === 'measure');
    if (measureAbsence) return <StructuredAbsence role="measure" reason={measureAbsence.reason} className="w-full" />;

    if (!data.current || !data.prior || data.periods.length < 2) {
      return (
        <StructuredAbsence
          className="w-full"
          reason={t(
            'The growth bridge needs at least two materialized periods (current and prior); fewer are available for this tenant.',
            'El puente de crecimiento necesita al menos dos periodos materializados (actual y anterior); hay menos disponibles para esta organizacion.',
          )}
        />
      );
    }

    const net = data.current.total - data.prior.total;
    const netPct = data.prior.total > 0 ? (net / data.prior.total) * 100 : null;
    const priorName = periodLabel(data.prior.periodId);
    const currentName = periodLabel(data.current.periodId);
    const locationAbsence = data.dimensionRole === 'entity' ? data.absences.find((a) => a.role === 'location') : undefined;

    return (
      <>
        {/* Hero pair: prior -> current with the net delta (explicit frames) */}
        <div className="grid gap-4 md:grid-cols-2">
          <HeroMetric
            label={t('Prior Period', 'Periodo Anterior')}
            value={data.prior.total}
            format={format}
            context={{ direction: 'flat', label: `${priorName} - ${t('comparison base', 'base de comparacion')}` }}
          />
          <HeroMetric
            label={t('Current Period', 'Periodo Actual')}
            value={data.current.total}
            format={format}
            context={{
              direction: net > 0 ? 'up' : net < 0 ? 'down' : 'flat',
              label: netPct !== null ? `${signedPctStr(netPct)} vs ${priorName}` : `${signedMoney(net)} vs ${priorName}`,
            }}
            subtitle={`${t('Net change', 'Cambio neto')}: ${signedMoney(net)}`}
          />
        </div>

        {/* Waterfall: diverging polarity on ONE axis; floating bars via a transparent base stack */}
        <Panel title={t('Growth Bridge', 'Puente de Crecimiento')} description={grainCaption(data.dimensionRole)}>
          {chartRows && (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 24, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickFormatter={(v: string) => trunc(v)}
                  />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={compact} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0].payload as WfRow;
                      return (
                        <div style={TOOLTIP_STYLE} className="px-3 py-2">
                          <p className="font-medium">{row.name}</p>
                          {row.kind === 'total' ? (
                            <p>{format(row.value)}</p>
                          ) : (
                            <>
                              <p>{`${t('Change', 'Cambio')}: ${signedMoney(row.value)}`}</p>
                              {row.prior !== null && row.current !== null && (
                                <p>{`${t('Prior', 'Anterior')}: ${format(row.prior)} - ${t('Current', 'Actual')}: ${format(row.current)}`}</p>
                              )}
                            </>
                          )}
                          {row.note && <p className="mt-0.5">{row.note}</p>}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="span" stackId="wf" isAnimationActive={false}>
                    {chartRows.map((row, i) => (
                      <Cell key={`wf-${i}`} fill={row.kind === 'total' ? NEUTRAL : row.kind === 'pos' ? POSITIVE : NEGATIVE} />
                    ))}
                    <LabelList
                      content={(props) => {
                        const { x, y, width, index } = props as { x?: number | string; y?: number | string; width?: number | string; index?: number };
                        if (index === undefined) return null;
                        const row = chartRows[index];
                        if (!row?.direct) return null;
                        return (
                          <text
                            x={Number(x ?? 0) + Number(width ?? 0) / 2}
                            y={Number(y ?? 0) - 6}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={600}
                            fill={LABEL_FILL}
                          >
                            {row.kind === 'total' ? compact(row.value) : signedCompact(row.value)}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Polarity legend */}
          <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: POSITIVE }} />
              {t('Added revenue', 'Sumo ingresos')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: NEGATIVE }} />
              {t('Subtracted revenue', 'Resto ingresos')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: NEUTRAL }} />
              {t('Period total', 'Total del periodo')}
            </span>
          </div>
        </Panel>

        {locationAbsence && <StructuredAbsence role="location" reason={locationAbsence.reason} />}

        {/* Drill table: EVERY member's prior/current/delta (tooltip-independent view) */}
        <Panel
          title={t('Member Detail', 'Detalle por Miembro')}
          description={
            navigable
              ? t('Every member, sorted by absolute change. Click a row to drill in.', 'Cada miembro, ordenado por cambio absoluto. Haz clic en una fila para profundizar.')
              : t('Every member, sorted by absolute change.', 'Cada miembro, ordenado por cambio absoluto.')
          }
        >
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Member', 'Miembro')}</TableHead>
                  <TableHead className="text-right">{priorName}</TableHead>
                  <TableHead className="text-right">{currentName}</TableHead>
                  <TableHead className="text-right">{t('Change', 'Cambio')}</TableHead>
                  <TableHead className="text-right">{t('% vs prior', '% vs anterior')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.deltas.map((d) => (
                  <TableRow
                    key={d.key}
                    className={navigable ? 'cursor-pointer' : undefined}
                    onClick={navigable ? () => router.push(drillTarget) : undefined}
                  >
                    <TableCell className="font-medium text-foreground">{d.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{format(d.prior)}</TableCell>
                    <TableCell className="text-right tabular-nums">{format(d.current)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: d.delta > 0 ? POSITIVE : d.delta < 0 ? NEGATIVE : NEUTRAL }}
                        />
                        {signedMoney(d.delta)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {d.prior > 0 ? signedPctStr(((d.current - d.prior) / d.prior) * 100) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {chartRows?.some((r) => r.name === t('Unattributed', 'Sin atribuir')) && (
                  <TableRow>
                    <TableCell className="text-muted-foreground">{t('Unattributed', 'Sin atribuir')}</TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {signedMoney(chartRows.find((r) => r.name === t('Unattributed', 'Sin atribuir'))?.value ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </>
    );
  };

  return (
    <RevenueScaffold
      title="Growth Bridge"
      titleEs="Puente de Crecimiento"
      subtitle="What added and what subtracted revenue vs the prior period"
      subtitleEs="Que sumo y que resto ingresos frente al periodo anterior"
    >
      {error && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {t('Could not load revenue data: ', 'No se pudieron cargar los datos de ingresos: ')}
          {error}
        </div>
      )}
      {loading && !data && !error && (
        <p className="text-sm text-muted-foreground">{t('Loading...', 'Cargando...')}</p>
      )}
      {renderBody()}
    </RevenueScaffold>
  );
}
