'use client';

// ResultsHero — Total payout + stat cards + component breakdown bars
// OB-145 Phase 2 — DS-007 L5 Outcome layer

import React, { useEffect, useState } from 'react';
import type { ComponentTotal, ComponentDef } from '@/lib/data/results-loader';

interface ResultsHeroProps {
  totalPayout: number;
  resultCount: number;
  componentTotals: ComponentTotal[];
  componentDefinitions: ComponentDef[];
  planName: string;
  formatCurrency: (value: number) => string;
}

function AnimatedNumber({ value, formatCurrency }: { value: number; formatCurrency: (v: number) => string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, value);
      setDisplay(current);
      if (step >= steps) {
        setDisplay(value);
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{formatCurrency(display)}</span>;
}

export function ResultsHero({
  totalPayout,
  resultCount,
  componentTotals,
  componentDefinitions,
  planName,
  formatCurrency,
}: ResultsHeroProps) {
  const entitiesWithPayout = componentTotals.length > 0
    ? componentTotals.reduce((max, c) => Math.max(max, c.entityCount), 0)
    : 0;
  const avgPerEntity = resultCount > 0 ? totalPayout / resultCount : 0;
  const activeComponents = componentTotals.filter(c => c.total > 0).length;

  // Sort components by total (largest first)
  const sortedComponents = [...componentTotals].sort((a, b) => b.total - a.total);
  const maxTotal = sortedComponents[0]?.total || 1;

  // Build color lookup from definitions
  const colorMap = new Map<string, string>();
  for (const cd of componentDefinitions) {
    colorMap.set(cd.id, cd.color);
    colorMap.set(cd.name, cd.color);
  }

  return (
    <div className="rounded-2xl border border-zinc-800/60 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(15,23,42,0.8) 100%)' }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Left: Total payout */}
        <div className="p-6 lg:p-8">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-1">
            Total Payout
          </p>
          <p className="text-4xl lg:text-5xl font-bold text-zinc-100 tracking-tight"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <AnimatedNumber value={totalPayout} formatCurrency={formatCurrency} />
          </p>
          <p className="text-sm text-zinc-500 mt-2">{planName}</p>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Entities</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {resultCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Average</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatCurrency(avgPerEntity)}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Active</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5">
                {activeComponents}<span className="text-zinc-500 text-sm">/{componentDefinitions.length}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Right: Component breakdown bars */}
        <div className="p-6 lg:p-8 border-t lg:border-t-0 lg:border-l border-zinc-800/60">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-4">
            Component Breakdown
          </p>
          <div className="space-y-3">
            {sortedComponents.map(comp => {
              const pct = totalPayout > 0 ? (comp.total / totalPayout) * 100 : 0;
              const barWidth = maxTotal > 0 ? (comp.total / maxTotal) * 100 : 0;
              const color = colorMap.get(comp.componentId) || colorMap.get(comp.componentName) || '#6366f1';

              return (
                <div key={comp.componentId} className="group">
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-zinc-400 flex-1 truncate" title={comp.componentName}>
                      {comp.componentName}
                    </span>
                    <span className="text-[10px] text-zinc-600 font-mono px-1.5 py-0.5 rounded bg-zinc-800/50">
                      {comp.componentType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-zinc-300 font-mono w-20 text-right"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatCurrency(comp.total)}
                    </span>
                    <span className="text-[10px] text-zinc-600 w-10 text-right"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="ml-5 bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.7 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
