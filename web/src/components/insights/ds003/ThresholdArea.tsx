'use client';

/**
 * DS-003 §1.4 — ThresholdArea. Decision task: MONITORING (temporal, with an expected range). An area
 * chart with a shaded target BAND (the required reference frame): line inside band = healthy, outside =
 * deviation. recharts ComposedChart (ReferenceArea band + Area line) internals.
 */

import {
  Area,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePersonaTheme } from './persona-theme';
import { AXIS_TICK, compact, SEMANTIC, SECTION_LABEL_CLASS, TEXT, TOOLTIP_STYLE } from './ds003-tokens';

export interface ThresholdPoint {
  label: string;
  value: number;
}

export interface ThresholdAreaProps {
  title?: string;
  data: ThresholdPoint[];
  /** the target band — the reference frame. Provide a band [low,high] OR a single line. */
  band?: { low: number; high: number; label?: string };
  referenceLine?: { value: number; label?: string };
  format?: (n: number) => string;
  height?: number;
}

export function ThresholdArea({ title, data, band, referenceLine, format, height = 220 }: ThresholdAreaProps) {
  const theme = usePersonaTheme();
  const fmt = format ?? ((n: number) => n.toLocaleString());
  if (!data || data.length === 0) return null;

  return (
    <div>
      {title && <div className={`mb-2 ${SECTION_LABEL_CLASS}`}>{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ds003-thresholdfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} tickFormatter={compact} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
            {band && (
              <ReferenceArea
                y1={band.low}
                y2={band.high}
                fill={SEMANTIC.green}
                fillOpacity={0.1}
                stroke={SEMANTIC.green}
                strokeOpacity={0.25}
                ifOverflow="extendDomain"
              />
            )}
            {referenceLine && (
              <ReferenceLine
                y={referenceLine.value}
                stroke={SEMANTIC.amber}
                strokeDasharray="4 4"
                label={{ value: referenceLine.label, position: 'insideTopRight', fill: '#94a3b8', fontSize: 11 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={theme.accent}
              strokeWidth={2.25}
              fill="url(#ds003-thresholdfill)"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {band?.label && (
        <div className={`mt-1.5 text-[11px] ${TEXT.muted}`}>
          <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: SEMANTIC.green }}>
            {band.label}: {fmt(band.low)}–{fmt(band.high)}
          </span>
        </div>
      )}
    </div>
  );
}
