'use client';

import { useMemo } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

export interface WaterfallStep {
  label: string;
  value: number;
  type: 'add' | 'subtract' | 'total';
}

interface CalculationWaterfallProps {
  steps: WaterfallStep[];
  currency?: string;
}

function fmtAmt(v: number, sym: string) {
  const fd = Math.abs(v) >= 10_000 ? 0 : 2;
  return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: fd, maximumFractionDigits: fd })}`;
}

export function CalculationWaterfall({ steps, currency = '$' }: CalculationWaterfallProps) {
  const isVialuce = useIsVialuce(); // HF-316: indigo total, success/danger steps, DM Mono numbers under Vialuce
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
    if (isVialuce) {
      return (
        <div className="empty">
          <div className="ic">∑</div>
          <b>Sin detalles de calculo.</b>
        </div>
      );
    }
    return <p className="text-sm text-zinc-500">Sin detalles de calculo.</p>;
  }

  const maxVal = bars[0]?.maxAbs ?? 1;

  if (isVialuce) {
    return (
      <div className="space-y-1">
        {bars.map((bar, i) => {
          const isTotal = bar.type === 'total';
          const isAdd = bar.type === 'add';

          const leftPercent = (Math.min(bar.start, bar.end) / maxVal) * 50 + 50;
          const widthPercent = (Math.abs(bar.end - bar.start) / maxVal) * 50;

          // Design-spec ramp: total = indigo, additions = success, subtractions = danger.
          const vlBar = isTotal ? 'var(--vl-raw-indigo)' : isAdd ? 'var(--vl-success)' : 'var(--vl-danger)';
          const vlText = isTotal ? 'var(--vialuce-indigo)' : isAdd ? 'var(--vl-success)' : 'var(--vl-danger)';

          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-28 truncate text-right flex-shrink-0" style={{ fontSize: '11px', color: 'var(--vl-text-muted)' }}>
                {bar.label}
              </span>
              <div className="flex-1 relative h-5">
                {i > 0 && !isTotal && (
                  <div
                    className="absolute top-0 h-full w-px"
                    style={{ left: `${(bars[i - 1].end / maxVal) * 50 + 50}%`, background: 'var(--vl-line)' }}
                  />
                )}
                <div
                  className="absolute top-0.5 h-4"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${Math.max(widthPercent, 0.5)}%`,
                    borderRadius: '4px',
                    background: vlBar,
                  }}
                />
              </div>
              <span className="w-24 text-right flex-shrink-0" style={{ fontSize: '11px', fontFamily: 'var(--vl-font-mono)', color: vlText }}>
                {bar.type === 'subtract' ? '-' : ''}{fmtAmt(Math.abs(bar.value), currency)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

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
              {bar.type === 'subtract' ? '-' : ''}{fmtAmt(Math.abs(bar.value), currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
