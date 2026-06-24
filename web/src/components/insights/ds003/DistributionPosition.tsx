'use client';

/**
 * DS-003 §1.3 — DistributionPosition. Decision task: RANKING ("where does this sit in the population?").
 * A histogram of the population with REQUIRED reference markers (quartiles / mean) and, optionally, a
 * highlighted self/entity position. Admin sees the full shape. recharts BarChart over a numeric axis so
 * the quartile/self ReferenceLines land at true values.
 */

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePersonaTheme } from './persona-theme';
import { AXIS_TICK, compact, SEMANTIC, SECTION_LABEL_CLASS, TEXT, TOOLTIP_STYLE } from './ds003-tokens';

export interface DistributionMarkers {
  quartiles?: boolean; // P25/P50/P75
  mean?: boolean;
}

export interface DistributionPositionProps {
  title?: string;
  /** the population values to bin. */
  data: number[];
  /** the reference frame — which markers to draw (default: quartiles). Not optional in spirit. */
  markers?: DistributionMarkers;
  /** highlight a specific value's bin (the "you are here" position). */
  self?: { value: number; label?: string };
  binCount?: number;
  format?: (n: number) => string;
  height?: number;
  emptyLabel?: string;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function DistributionPosition({
  title,
  data,
  markers = { quartiles: true },
  self,
  binCount = 12,
  format,
  height = 220,
  emptyLabel = 'No population data.',
}: DistributionPositionProps) {
  const theme = usePersonaTheme();
  const fmt = format ?? ((n: number) => n.toLocaleString());
  const vals = data.filter((v) => Number.isFinite(v));
  if (vals.length === 0) return <div className={`text-sm ${TEXT.muted}`}>{emptyLabel}</div>;

  const sorted = [...vals].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const p25 = quantile(sorted, 0.25);
  const p50 = quantile(sorted, 0.5);
  const p75 = quantile(sorted, 0.75);

  const span = max - min || 1;
  const width = span / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => {
    const start = min + i * width;
    const end = i === binCount - 1 ? max : start + width;
    const count = vals.filter((v) => (i === binCount - 1 ? v >= start && v <= end : v >= start && v < end)).length;
    return { x: start + width / 2, start, end, count };
  });

  const selfBin = self ? Math.min(binCount - 1, Math.max(0, Math.floor((self.value - min) / width))) : -1;

  return (
    <div>
      {title && <div className={`mb-2 ${SECTION_LABEL_CLASS}`}>{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="x"
              type="number"
              domain={[min, max]}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={compact}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [`${v} entities`, 'count']}
              labelFormatter={(x: number) => fmt(x)}
            />
            {markers.mean && <ReferenceLine x={mean} stroke={SEMANTIC.amber} strokeDasharray="3 3" label={{ value: 'avg', position: 'top', fill: 'var(--vl-text-soft, #8A90A6)', fontSize: 10 }} />}
            {markers.quartiles && (
              <>
                <ReferenceLine x={p25} stroke="var(--vl-line, #E8EAF3)" strokeDasharray="2 2" label={{ value: 'P25', position: 'top', fill: 'var(--vl-text-soft, #8A90A6)', fontSize: 10 }} />
                <ReferenceLine x={p50} stroke="var(--vl-line, #E8EAF3)" label={{ value: 'P50', position: 'top', fill: 'var(--vl-text-soft, #8A90A6)', fontSize: 10 }} />
                <ReferenceLine x={p75} stroke="var(--vl-line, #E8EAF3)" strokeDasharray="2 2" label={{ value: 'P75', position: 'top', fill: 'var(--vl-text-soft, #8A90A6)', fontSize: 10 }} />
              </>
            )}
            {self && <ReferenceLine x={self.value} stroke={theme.accent} strokeWidth={2} label={{ value: self.label ?? 'You', position: 'insideTopRight', fill: theme.accent, fontSize: 11 }} />}
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {bins.map((_, i) => (
                <Cell key={i} fill={i === selfBin ? theme.accent : theme.accentBorder} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={`mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] ${TEXT.muted}`}>
        <span>median {fmt(p50)}</span>
        <span>mean {fmt(mean)}</span>
        <span>{vals.length} entities</span>
        {self && <span style={{ color: theme.accent }}>{self.label ?? 'You'}: {fmt(self.value)}</span>}
      </div>
    </div>
  );
}
