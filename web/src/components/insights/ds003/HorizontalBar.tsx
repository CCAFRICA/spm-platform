'use client';

/**
 * DS-003 §1.2 — HorizontalBar. Decision task: COMPARISON (ranked). Sorted highest-first so ranking is
 * instant; a REQUIRED vertical reference line (average / target / budget) answers "is that good or
 * bad?". Bar fill = persona accent (environment); the reference marker is neutral slate.
 */

import { usePersonaTheme } from './persona-theme';
import { CARD_PAD, SECTION_LABEL_CLASS, TEXT } from './ds003-tokens';

export interface BarItem {
  label: string;
  value: number;
  /** optional per-bar color override (else persona accent). */
  color?: string;
}

export interface HorizontalBarProps {
  title?: string;
  items: BarItem[];
  /** the reference frame — average/target marker. Not optional (DS-003 Rule 3). */
  referenceLine: { value: number; label: string };
  format?: (n: number) => string;
  onBarClick?: (item: BarItem) => void;
  maxRows?: number;
  emptyLabel?: string;
}

export function HorizontalBar({
  title,
  items,
  referenceLine,
  format,
  onBarClick,
  maxRows,
  emptyLabel = 'No data.',
}: HorizontalBarProps) {
  const theme = usePersonaTheme();
  const fmt = format ?? ((n: number) => n.toLocaleString());
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxRows ?? items.length);
  const max = Math.max(...sorted.map((i) => i.value), referenceLine.value, 1);

  if (sorted.length === 0) return <div className={`text-sm ${TEXT.muted} ${CARD_PAD}`}>{emptyLabel}</div>;

  const refPct = (referenceLine.value / max) * 100;

  return (
    <div>
      {title && <div className={`mb-3 ${SECTION_LABEL_CLASS}`}>{title}</div>}
      <div className="relative space-y-2.5">
        {/* reference line spanning the bar column */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-slate-500/60"
          style={{ left: `${refPct}%` }}
        />
        {sorted.map((item) => {
          const pct = (item.value / max) * 100;
          const Row = onBarClick ? 'button' : 'div';
          return (
            <Row
              key={item.label}
              type={onBarClick ? 'button' : undefined}
              onClick={onBarClick ? () => onBarClick(item) : undefined}
              className={`group block w-full text-left ${onBarClick ? 'cursor-pointer' : ''}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${TEXT.body} group-hover:text-slate-200`}>{item.label}</span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${TEXT.headline}`}>{fmt(item.value)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/70">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: item.color ?? theme.accent }}
                />
              </div>
            </Row>
          );
        })}
      </div>
      <div className={`mt-2 text-[11px] ${TEXT.muted}`}>
        <span className="border-l border-dashed border-slate-500/60 pl-1.5">
          {referenceLine.label}: {fmt(referenceLine.value)}
        </span>
      </div>
    </div>
  );
}
