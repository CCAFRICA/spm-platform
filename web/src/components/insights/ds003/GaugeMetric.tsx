'use client';

/**
 * DS-003 §1.1 — GaugeMetric. Decision task: MONITORING (bounded). Use ONLY for a value with a natural
 * range and meaningful thresholds (confidence %, match %, attainment %) — never for open-ended money.
 * The threshold bands ON the arc ARE the reference frame (required). recharts RadialBarChart internals.
 */

import { RadialBar, RadialBarChart, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { SEMANTIC, TEXT } from './ds003-tokens';

export interface GaugeThresholds {
  /** below `amber` (or above, if invert) = healthy green; between = amber; past `red` = red. */
  amber: number;
  red: number;
}

export interface GaugeMetricProps {
  value: number;
  label: string;
  /** the reference frame — band boundaries. Not optional (DS-003 Rule 3). */
  thresholds: GaugeThresholds;
  min?: number;
  max?: number;
  unit?: string;
  /** when true, HIGH is good (e.g. confidence): green above red-band, red below amber. */
  invert?: boolean;
  height?: number;
}

function bandColor(value: number, t: GaugeThresholds, invert: boolean): string {
  if (invert) {
    if (value >= t.red) return SEMANTIC.green;
    if (value >= t.amber) return SEMANTIC.amber;
    return SEMANTIC.red;
  }
  if (value >= t.red) return SEMANTIC.red;
  if (value >= t.amber) return SEMANTIC.amber;
  return SEMANTIC.green;
}

export function GaugeMetric({
  value,
  label,
  thresholds,
  min = 0,
  max = 100,
  unit = '%',
  invert = false,
  height = 150,
}: GaugeMetricProps) {
  const clamped = Math.max(min, Math.min(max, value));
  const color = bandColor(value, thresholds, invert);
  const data = [{ name: label, value: clamped, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={180}
            endAngle={0}
            barSize={14}
          >
            <PolarAngleAxis type="number" domain={[min, max]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: 'rgba(51,65,85,0.4)' }} dataKey="value" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className={`text-3xl font-bold tabular-nums ${TEXT.headline}`} style={{ color }}>
            {Math.round(value)}
            <span className="text-lg">{unit}</span>
          </span>
        </div>
      </div>
      <div className={`mt-1 text-xs font-semibold uppercase tracking-wide ${TEXT.body}`}>{label}</div>
      <div className={`mt-0.5 text-[11px] ${TEXT.muted}`}>
        {invert
          ? `≥${thresholds.red}${unit} good · <${thresholds.amber}${unit} risk`
          : `<${thresholds.amber}${unit} good · ≥${thresholds.red}${unit} risk`}
      </div>
    </div>
  );
}
