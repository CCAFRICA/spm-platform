'use client';

/**
 * /revenue/mix - Revenue Mix & Mix-Shift (OB-257 W2b).
 *
 * "What is the composition and how is it moving?" - THE SHIFT IS THE INSIGHT, so it leads:
 * hero movers + a diverging horizontal bar of share shifts (pts, polarity tokens) + the
 * ranked shift list, then composition over time (stacked share columns, <=6 members +
 * Other fold, stable member colors by first-period order, 2px surface gaps) and the
 * tooltip-independent composition table. Grain caption mirrors /revenue/bridge honestly.
 *
 * C2: notMaterialized -> full StructuredAbsence; single period -> shift section renders a
 * StructuredAbsence while composition still shows. THEME (Rule 30): chart colors are token
 * strings composed from ds003-tokens exports - zero color literals in this file.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RevenueScaffold } from '@/components/revenue/RevenueScaffold';
import { StructuredAbsence } from '@/components/revenue/StructuredAbsence';
import { loadMix } from '@/lib/revenue/revenue-data-service';
import type { MixResponse } from '@/lib/revenue/types';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { usePersona } from '@/contexts/persona-context';
import { useCurrency } from '@/contexts/tenant-context';
import {
  AXIS_TICK,
  GRID_STROKE,
  HeroMetric,
  Panel,
  SEMANTIC,
  TOOLTIP_STYLE,
  paletteColor,
  toneColor,
} from '@/components/insights/ds003';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Polarity + neutral tokens (ds003 idiom: var(--vl-*) with the token file's own fallbacks).
const POSITIVE = `var(--vl-status-success, ${SEMANTIC.green})`;
const NEGATIVE = `var(--vl-status-danger, ${SEMANTIC.red})`;
const NEUTRAL = toneColor('neutral');
const LABEL_FILL = AXIS_TICK.fill;
const SURFACE_STROKE = TOOLTIP_STYLE.background; // 2px segment gaps wear the surface color

const MAX_SHIFT_BARS = 10; // diverging chart rows (list + table carry the rest)
const MAX_STACK_MEMBERS = 5; // stacked composition: <=6 segments = 5 members + Other
const MAX_TABLE_MEMBERS = 20; // leader-level density; charted members are always within these

const trunc = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
const pctStr = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;
const signedPts = (pts: number) => `${pts >= 0 ? '+' : '-'}${Math.abs(pts).toFixed(1)}`;

export default function RevenueMixPage() {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const { format } = useCurrency();
  const t = (en: string, es: string) => (isSpanish ? es : en);

  const [data, setData] = useState<MixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { scope } = usePersona();
  // SR-39 fail-closed: non-admin sends an EXPLICIT scope (even empty) so the server serves only
  // scoped entity-grain data instead of falling open to the whole tenant.
  const scopeEntityIds = useMemo(() => (scope.canSeeAll ? undefined : scope.entityIds), [scope]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadMix({ scopeEntityIds })
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
  }, [scopeEntityIds]);

  const periodLabel = (pid: string): string => data?.periods.find((p) => p.periodId === pid)?.label ?? pid;

  const grainCaption = (grain: MixResponse['dimensionRole']): string => {
    if (grain === 'location') return t('Composition by location.', 'Composicion por ubicacion.');
    if (grain === 'category') return t('Composition by category.', 'Composicion por categoria.');
    return t(
      'Composition by seller - no location or category dimension resolved for this tenant, so the entity grain is used.',
      'Composicion por vendedor - no se resolvio una dimension de ubicacion o categoria para esta organizacion, por lo que se usa el nivel de entidad.',
    );
  };

  // Stacked composition: member selection (top by current-period value) + STABLE colors by
  // first-period order (color follows the member, never re-assigned per period).
  const stack = useMemo(() => {
    if (!data || data.composition.length === 0) return null;
    const first = data.composition[0];
    const currentComp = data.composition.find((c) => c.periodId === data.currentPeriodId) ?? data.composition[data.composition.length - 1];
    const colorOrder = new Map<string, number>();
    for (const c of [first, ...data.composition]) {
      for (const s of c.shares) if (!colorOrder.has(s.key)) colorOrder.set(s.key, colorOrder.size);
    }
    const members = [...currentComp.shares]
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_STACK_MEMBERS)
      .map((s) => ({ key: s.key, label: s.label }));
    const memberKeys = new Set(members.map((m) => m.key));
    const rows = data.composition.map((c) => {
      const row: Record<string, number | string> = { period: periodLabel(c.periodId) };
      let selected = 0;
      let total = 0;
      for (const s of c.shares) total += s.share;
      members.forEach((m, i) => {
        const s = c.shares.find((x) => x.key === m.key);
        const v = Math.round((s?.share ?? 0) * 1000) / 10;
        row[`m${i}`] = v;
        selected += v;
      });
      const other = Math.max(0, Math.round(total * 1000) / 10 - selected);
      row.oth = Math.round(other * 10) / 10;
      return row;
    });
    const hasOther = data.composition.some((c) => c.shares.some((s) => !memberKeys.has(s.key)));
    return {
      rows,
      members: members.map((m) => ({ ...m, color: paletteColor(colorOrder.get(m.key) ?? 0) })),
      hasOther,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Composition table: members ranked by current share (capped for leader-level density).
  const tableMembers = useMemo(() => {
    if (!data) return { rows: [] as Array<{ key: string; label: string; currentValue: number | null; byPeriod: Map<string, number> }>, total: 0 };
    const byKey = new Map<string, { key: string; label: string; currentValue: number | null; byPeriod: Map<string, number> }>();
    for (const c of data.composition) {
      for (const s of c.shares) {
        let m = byKey.get(s.key);
        if (!m) {
          m = { key: s.key, label: s.label, currentValue: null, byPeriod: new Map() };
          byKey.set(s.key, m);
        }
        m.byPeriod.set(c.periodId, s.share);
        if (c.periodId === data.currentPeriodId) m.currentValue = s.value;
      }
    }
    const all = Array.from(byKey.values()).sort(
      (a, b) => (b.byPeriod.get(data.currentPeriodId ?? '') ?? 0) - (a.byPeriod.get(data.currentPeriodId ?? '') ?? 0),
    );
    return { rows: all.slice(0, MAX_TABLE_MEMBERS), total: all.length };
  }, [data]);

  const renderBody = () => {
    if (!data) return null;
    if (data.notMaterialized) return <StructuredAbsence reason={data.notMaterialized.reason} className="w-full" />;

    const measureAbsence = data.absences.find((a) => a.role === 'measure');
    if (measureAbsence) return <StructuredAbsence role="measure" reason={measureAbsence.reason} className="w-full" />;

    if (data.composition.length === 0) {
      return (
        <StructuredAbsence
          className="w-full"
          reason={t(
            'No materialized revenue periods are available for this tenant yet.',
            'Aun no hay periodos de ingresos materializados para esta organizacion.',
          )}
        />
      );
    }

    const shifts = data.shifts;
    const topGainer = shifts.find((s) => s.shiftPts > 0);
    const topDecliner = shifts.find((s) => s.shiftPts < 0);
    const shiftBars = shifts.slice(0, MAX_SHIFT_BARS);
    const maxAbsPts = shiftBars.reduce((m, s) => Math.max(m, Math.abs(s.shiftPts)), 0);
    const dom = Math.max(1, Math.ceil(maxAbsPts));
    let maxPosIdx = -1;
    let maxNegIdx = -1;
    shiftBars.forEach((s, i) => {
      if (s.shiftPts > 0 && (maxPosIdx < 0 || s.shiftPts > shiftBars[maxPosIdx].shiftPts)) maxPosIdx = i;
      if (s.shiftPts < 0 && (maxNegIdx < 0 || s.shiftPts < shiftBars[maxNegIdx].shiftPts)) maxNegIdx = i;
    });
    const currentName = data.currentPeriodId ? periodLabel(data.currentPeriodId) : t('current', 'actual');
    const priorName = data.priorPeriodId ? periodLabel(data.priorPeriodId) : t('prior', 'anterior');
    const locationAbsence = data.dimensionRole === 'entity' ? data.absences.find((a) => a.role === 'location') : undefined;

    return (
      <>
        {/* THE SHIFT LEADS - hero movers (frame: current vs prior share) */}
        {(topGainer || topDecliner) && (
          <div className="grid gap-4 md:grid-cols-2">
            {topGainer && (
              <HeroMetric
                label={t('Top Share Gainer', 'Mayor Ganancia de Participacion')}
                value={`${signedPts(topGainer.shiftPts)} pts`}
                context={{
                  direction: 'up',
                  label: `${pctStr(topGainer.currentShare)} vs ${pctStr(topGainer.priorShare)} ${t('share of revenue', 'de participacion')}`,
                }}
                subtitle={topGainer.label}
              />
            )}
            {topDecliner && (
              <HeroMetric
                label={t('Top Share Decliner', 'Mayor Perdida de Participacion')}
                value={`${signedPts(topDecliner.shiftPts)} pts`}
                context={{
                  direction: 'down',
                  label: `${pctStr(topDecliner.currentShare)} vs ${pctStr(topDecliner.priorShare)} ${t('share of revenue', 'de participacion')}`,
                }}
                subtitle={topDecliner.label}
              />
            )}
          </div>
        )}

        {/* Mix-shift: diverging horizontal bars (pts vs prior period; zero line = no change) */}
        <Panel
          title={t('Mix Shift', 'Cambio de Composicion')}
          description={`${grainCaption(data.dimensionRole)} ${t(
            `Share change in points, ${currentName} vs ${priorName}.`,
            `Cambio de participacion en puntos, ${currentName} vs ${priorName}.`,
          )}`}
        >
          {shifts.length === 0 ? (
            <StructuredAbsence
              reason={t(
                'Mix shift needs at least two materialized periods (current and prior); only one is available for this tenant.',
                'El cambio de composicion necesita al menos dos periodos materializados (actual y anterior); solo hay uno disponible para esta organizacion.',
              )}
            />
          ) : (
            <>
              <div style={{ height: Math.max(160, shiftBars.length * 34 + 48) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={shiftBars} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[-dom, dom]}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={140}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => trunc(v)}
                    />
                    <ReferenceLine x={0} stroke={NEUTRAL} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const row = payload[0].payload as MixResponse['shifts'][number];
                        return (
                          <div style={TOOLTIP_STYLE} className="px-3 py-2">
                            <p className="font-medium">{row.label}</p>
                            <p>{`${signedPts(row.shiftPts)} pts`}</p>
                            <p>{`${t('Now', 'Ahora')} ${pctStr(row.currentShare)} (${t('was', 'antes')} ${pctStr(row.priorShare)})`}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="shiftPts" isAnimationActive={false}>
                      {shiftBars.map((s, i) => (
                        <Cell key={`sh-${i}`} fill={s.shiftPts >= 0 ? POSITIVE : NEGATIVE} />
                      ))}
                      <LabelList
                        content={(props) => {
                          const { x, y, width, height, index } = props as {
                            x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number;
                          };
                          if (index === undefined || (index !== maxPosIdx && index !== maxNegIdx)) return null;
                          const s = shiftBars[index];
                          const w = Number(width ?? 0);
                          const pos = s.shiftPts >= 0;
                          return (
                            <text
                              x={pos ? Number(x ?? 0) + w + 6 : Number(x ?? 0) + w - 6}
                              y={Number(y ?? 0) + Number(height ?? 0) / 2 + 4}
                              textAnchor={pos ? 'start' : 'end'}
                              fontSize={11}
                              fontWeight={600}
                              fill={LABEL_FILL}
                            >
                              {`${signedPts(s.shiftPts)} pts`}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: POSITIVE }} />
                  {t('Gaining share', 'Gana participacion')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: NEGATIVE }} />
                  {t('Losing share', 'Pierde participacion')}
                </span>
              </div>

              {/* Ranked shift list - frames built in (pts + current vs prior share + current value) */}
              <ol className="mt-4 space-y-1.5">
                {shiftBars.map((s, i) => {
                  const currentValue = tableMembers.rows.find((m) => m.key === s.key)?.currentValue ?? null;
                  return (
                    <li key={s.key} className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5 text-sm last:border-b-0">
                      <span className="min-w-0 truncate text-foreground">
                        <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                        {s.label}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.shiftPts >= 0 ? POSITIVE : NEGATIVE }} />
                          {signedPts(s.shiftPts)} pts
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {`${t('now', 'ahora')} ${pctStr(s.currentShare)} (${t('was', 'antes')} ${pctStr(s.priorShare)})`}
                        </span>
                        {currentValue !== null && <span className="text-xs text-muted-foreground">{format(currentValue)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </Panel>

        {locationAbsence && <StructuredAbsence role="location" reason={locationAbsence.reason} />}

        {/* Composition over time: stacked share columns, ONE axis (share of total, 0-100%) */}
        {stack && (
          <Panel
            title={t('Composition Over Time', 'Composicion en el Tiempo')}
            description={t('Share of period revenue per member; colors are stable across periods.', 'Participacion del ingreso del periodo por miembro; los colores son estables entre periodos.')}
          >
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stack.rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="period" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name) => [`${Number(v).toFixed(1)}%`, String(name)]}
                  />
                  <Legend
                    iconType="square"
                    iconSize={10}
                    formatter={(value) => (
                      <span style={{ color: LABEL_FILL, fontSize: 11 }}>{String(value)}</span>
                    )}
                  />
                  {stack.members.map((m, i) => (
                    <Bar
                      key={m.key}
                      dataKey={`m${i}`}
                      name={m.label}
                      stackId="mix"
                      fill={m.color}
                      stroke={SURFACE_STROKE}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  ))}
                  {stack.hasOther && (
                    <Bar
                      dataKey="oth"
                      name={t('Other', 'Otros')}
                      stackId="mix"
                      fill={NEUTRAL}
                      stroke={SURFACE_STROKE}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        {/* Composition table: period x member share (tooltip-independent) */}
        <Panel
          title={t('Composition Table', 'Tabla de Composicion')}
          description={
            tableMembers.total > tableMembers.rows.length
              ? t(
                  `Top ${tableMembers.rows.length} of ${tableMembers.total} members by current share.`,
                  `Los ${tableMembers.rows.length} principales de ${tableMembers.total} miembros por participacion actual.`,
                )
              : t('Share of period revenue per member.', 'Participacion del ingreso del periodo por miembro.')
          }
        >
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Member', 'Miembro')}</TableHead>
                  {data.periods.map((p) => (
                    <TableHead key={p.periodId} className="text-right">
                      {p.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">{t('Current value', 'Valor actual')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableMembers.rows.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium text-foreground">{m.label}</TableCell>
                    {data.periods.map((p) => {
                      const share = m.byPeriod.get(p.periodId);
                      return (
                        <TableCell key={p.periodId} className="text-right tabular-nums">
                          {share !== undefined ? pctStr(share) : '-'}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {m.currentValue !== null ? format(m.currentValue) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </>
    );
  };

  return (
    <RevenueScaffold
      title="Revenue Mix"
      titleEs="Composicion de Ingresos"
      subtitle="What the composition is and how it is moving"
      subtitleEs="Cual es la composicion y como se esta moviendo"
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
