'use client';

/**
 * DS-003 §1.4 — SparkTrend. Decision task: MONITORING. A small trend line PLUS an explicit reference
 * frame: latest value + velocity text + direction arrow (and optional projected next point). The
 * velocity/direction IS the reference frame — "is that good or bad?" answered by the trend itself.
 * recharts LineChart internals; persona accent for the line.
 */

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePersonaTheme } from './persona-theme';
import { AXIS_TICK, compact, directionColor, SECTION_LABEL_CLASS, TEXT, TOOLTIP_STYLE } from './ds003-tokens';

export interface SparkPoint {
  label: string;
  value: number;
}

export interface SparkTrendProps {
  title?: string;
  data: SparkPoint[];
  /** velocity text, e.g. "+MX$3,400 / period". If omitted it's derived from the last two points. */
  velocity?: string;
  /** explicit direction; else derived. */
  direction?: 'up' | 'down' | 'flat';
  /** dotted projected next value (linear extrapolation) appended to the line. */
  projection?: number | null;
  format?: (n: number) => string;
  height?: number;
}

export function SparkTrend({ title, data, velocity, direction, projection, format, height = 120 }: SparkTrendProps) {
  const theme = usePersonaTheme();
  const fmt = format ?? ((n: number) => n.toLocaleString());
  if (!data || data.length === 0) return null;

  const last = data[data.length - 1].value;
  const prior = data.length >= 2 ? data[data.length - 2].value : null;
  const dir: 'up' | 'down' | 'flat' =
    direction ?? (prior == null ? 'flat' : last > prior ? 'up' : last < prior ? 'down' : 'flat');
  const velText =
    velocity ?? (prior == null ? 'no prior period' : `${last - prior >= 0 ? '+' : ''}${fmt(last - prior)} / period`);
  const color = directionColor(dir);
  const TrendIcon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;

  const series: { label: string; value: number; projected?: number }[] = data.map((d) => ({ ...d }));
  if (projection != null) {
    series[series.length - 1] = { ...series[series.length - 1], projected: series[series.length - 1].value };
    series.push({ label: 'Proj.', value: NaN as unknown as number, projected: projection });
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        {title && <span className={SECTION_LABEL_CLASS}>{title}</span>}
        <span className={`text-lg font-bold tabular-nums ${TEXT.headline}`}>{fmt(last)}</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} tickFormatter={compact} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => (Number.isNaN(v) ? '—' : fmt(v))} />
            <Line type="monotone" dataKey="value" stroke={theme.accent} strokeWidth={2.25} dot={false} isAnimationActive={false} connectNulls />
            {projection != null && (
              <Line type="monotone" dataKey="projected" stroke={theme.accent} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
        <TrendIcon className="h-4 w-4" />
        <span>{velText}</span>
        {projection != null && <span className={`ml-auto text-xs ${TEXT.muted}`}>proj. next {fmt(projection)}</span>}
      </div>
    </div>
  );
}
