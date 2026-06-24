'use client';

/**
 * DS-003 §1.2 — StackedBar. Decision task: COMPARISON (part-of-whole). A single horizontal stacked
 * bar instead of a pie (Cleveland & McGill: bars read more accurately). The TOTAL is the reference
 * frame (each segment shows its % of whole). Segment colors from the categorical data palette.
 */

import { useState } from 'react';
import { paletteColor, SECTION_LABEL_CLASS, TEXT } from './ds003-tokens';

export interface StackSegment {
  label: string;
  value: number;
  color?: string;
}

export interface StackedBarProps {
  title?: string;
  segments: StackSegment[];
  /** override the implied whole (else = sum of segments) — the reference frame. */
  total?: number;
  format?: (n: number) => string;
  onSegmentClick?: (seg: StackSegment) => void;
  emptyLabel?: string;
}

export function StackedBar({
  title,
  segments,
  total,
  format,
  onSegmentClick,
  emptyLabel = 'No component data.',
}: StackedBarProps) {
  const [active, setActive] = useState<string | null>(null);
  const fmt = format ?? ((n: number) => n.toLocaleString());
  const sorted = [...segments].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const whole = total ?? sorted.reduce((s, x) => s + x.value, 0);

  if (sorted.length === 0 || whole <= 0) return <div className={`text-sm ${TEXT.muted}`}>{emptyLabel}</div>;

  return (
    <div>
      {title && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className={SECTION_LABEL_CLASS}>{title}</span>
          <span className={`text-sm font-semibold tabular-nums ${TEXT.headline}`}>{fmt(whole)}</span>
        </div>
      )}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-800/70">
        {sorted.map((seg, i) => {
          const pct = (seg.value / whole) * 100;
          const color = seg.color ?? paletteColor(i);
          const Seg = onSegmentClick ? 'button' : 'div';
          return (
            <Seg
              key={`${seg.label}-${i}`}
              type={onSegmentClick ? 'button' : undefined}
              title={`${seg.label}: ${fmt(seg.value)} (${pct.toFixed(0)}%)`}
              onClick={onSegmentClick ? () => onSegmentClick(seg) : undefined}
              onMouseEnter={() => setActive(seg.label)}
              onMouseLeave={() => setActive(null)}
              className="h-full transition-opacity"
              style={{
                width: `${pct}%`,
                backgroundColor: color,
                opacity: active && active !== seg.label ? 0.45 : 1,
              }}
            />
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {sorted.map((seg, i) => {
          const pct = (seg.value / whole) * 100;
          return (
            <div key={`${seg.label}-${i}`} className="flex items-center gap-1.5 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seg.color ?? paletteColor(i) }} />
              <span className={`truncate ${TEXT.body}`}>{seg.label}</span>
              <span className={`ml-auto shrink-0 tabular-nums ${TEXT.muted}`}>{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
