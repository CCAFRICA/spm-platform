'use client';

import type { ReactNode } from 'react';

interface BenchmarkBarProps {
  value: number;
  benchmark: number;
  max?: number;
  label: string;
  sublabel?: string;
  rightLabel?: ReactNode;
  color?: string;
}

export function BenchmarkBar({
  value,
  benchmark,
  max,
  label,
  sublabel,
  rightLabel,
  color = '#6366f1',
}: BenchmarkBarProps) {
  const effectiveMax = max ?? Math.max(value, benchmark) * 1.3;
  const valuePct = Math.min((value / effectiveMax) * 100, 100);
  const benchmarkPct = Math.min((benchmark / effectiveMax) * 100, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-sm font-medium text-zinc-200">{label}</span>
          {sublabel && <span className="ml-2 text-xs text-zinc-500">{sublabel}</span>}
        </div>
        {rightLabel && <div className="text-sm">{rightLabel}</div>}
      </div>
      <div className="relative h-3 w-full rounded-full bg-zinc-800/60 overflow-hidden">
        {/* Value bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${valuePct}%`, backgroundColor: color }}
        />
        {/* Benchmark reference line */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/80 z-10"
          style={{ left: `${benchmarkPct}%` }}
          title={`Benchmark: ${benchmark}`}
        />
      </div>
    </div>
  );
}
