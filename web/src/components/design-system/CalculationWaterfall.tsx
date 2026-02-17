'use client';

import { useMemo } from 'react';

export interface WaterfallStep {
  label: string;
  value: number;
  type: 'add' | 'subtract' | 'total';
}

interface CalculationWaterfallProps {
  steps: WaterfallStep[];
  currency?: string;
}

export function CalculationWaterfall({ steps, currency = 'MX$' }: CalculationWaterfallProps) {
  const bars = useMemo(() => {
    let runningTotal = 0;
    const maxAbs = steps.reduce((max, s) => {
      if (s.type === 'total') return Math.max(max, Math.abs(s.value));
      runningTotal += s.type === 'add' ? s.value : -s.value;
      return Math.max(max, Math.abs(runningTotal));
    }, 0) || 1;

    runningTotal = 0;
    return steps.map((step) => {
      const prevTotal = runningTotal;
      if (step.type === 'total') {
        runningTotal = step.value;
      } else {
        runningTotal += step.type === 'add' ? step.value : -step.value;
      }

      return {
        ...step,
        start: step.type === 'total' ? 0 : prevTotal,
        end: runningTotal,
        maxAbs,
      };
    });
  }, [steps]);

  if (steps.length === 0) {
    return <p className="text-sm text-zinc-500">Sin detalles de calculo.</p>;
  }

  const maxVal = bars[0]?.maxAbs ?? 1;

  return (
    <div className="space-y-1">
      {bars.map((bar, i) => {
        const isTotal = bar.type === 'total';
        const isAdd = bar.type === 'add';

        const leftPercent = (Math.min(bar.start, bar.end) / maxVal) * 50 + 50;
        const widthPercent = (Math.abs(bar.end - bar.start) / maxVal) * 50;

        const barColor = isTotal
          ? 'bg-indigo-500/70'
          : isAdd
            ? 'bg-emerald-500/70'
            : 'bg-rose-500/70';

        const textColor = isTotal
          ? 'text-indigo-400'
          : isAdd
            ? 'text-emerald-400'
            : 'text-rose-400';

        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-28 truncate text-right flex-shrink-0">
              {bar.label}
            </span>
            <div className="flex-1 relative h-5">
              {/* Connector from previous bar */}
              {i > 0 && !isTotal && (
                <div
                  className="absolute top-0 h-full w-px bg-zinc-700"
                  style={{ left: `${(bars[i - 1].end / maxVal) * 50 + 50}%` }}
                />
              )}
              <div
                className={`absolute top-0.5 h-4 rounded-sm ${barColor}`}
                style={{
                  left: `${leftPercent}%`,
                  width: `${Math.max(widthPercent, 0.5)}%`,
                }}
              />
            </div>
            <span className={`text-[11px] tabular-nums w-24 text-right flex-shrink-0 ${textColor}`}>
              {bar.type === 'subtract' ? '-' : ''}{currency}{Math.abs(bar.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
