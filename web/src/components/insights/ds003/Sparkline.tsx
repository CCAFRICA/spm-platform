'use client';

/**
 * DS-003 §1.4 — Sparkline. Decision task: MONITORING (embedded). Small, inline, no axes — the SHAPE
 * is the information. Embed in cards / table rows next to a value. A faint baseline (first value, or a
 * provided reference) is the lightweight reference frame. recharts LineChart internals.
 */

import { Line, LineChart, ReferenceLine, ResponsiveContainer } from 'recharts';
import { SEMANTIC } from './ds003-tokens';

export interface SparklineProps {
  data: number[];
  /** line color; default emerald→ if rising else red, or pass an explicit hex. */
  color?: string;
  width?: number;
  height?: number;
  /** optional baseline (defaults to the series' first value) — the reference frame. */
  baseline?: number;
}

export function Sparkline({ data, color, width = 88, height = 26, baseline }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const rising = data[data.length - 1] >= data[0];
  const stroke = color ?? (rising ? SEMANTIC.green : SEMANTIC.red);
  const ref = baseline ?? data[0];
  const series = data.map((value, i) => ({ i, value }));

  return (
    <div style={{ width, height }} className="inline-block align-middle">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <ReferenceLine y={ref} stroke="var(--vl-line, #E8EAF3)" strokeDasharray="2 2" />
          <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
