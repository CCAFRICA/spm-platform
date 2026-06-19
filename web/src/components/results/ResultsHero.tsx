'use client';

// ResultsHero — Total payout + stat cards + component breakdown bars
// OB-145 Phase 2 — DS-007 L5 Outcome layer

import React, { useEffect, useState } from 'react';
import type { ComponentTotal, ComponentDef } from '@/lib/data/results-loader';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

// OB-221: indigo ramp for the component-breakdown bars under Vialuce (replaces per-component dark hex).
const VIALUCE_RAMP = ['var(--vl-raw-indigo-deep)', 'var(--vl-raw-indigo)', 'var(--vl-raw-indigo-light)', '#9A9CE0', 'var(--vl-raw-gold)'];

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
  const isVialuce = useIsVialuce(); // OB-221: hero → .card; total + stats + bar figures → DM Mono, indigo ramp
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

  // Vialuce: white .card hero. Total payout is a DM-Mono .kpi-val; the three stat tiles read as mini KPIs;
  // the component breakdown bars use the indigo ramp (deep→light, gold accent). Else-branch byte-identical.
  if (isVialuce) {
    return (
      <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }} className="lg:grid-cols-2">
          {/* Left: Total payout */}
          <div style={{ padding: '28px' }}>
            <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10.5px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 6px' }}>
              Total Payout
            </p>
            <p style={{ fontFamily: 'var(--vl-font-mono)', fontWeight: 'var(--vl-fw-med)' as unknown as number, fontSize: '40px', letterSpacing: '-.5px', color: 'var(--vl-text)', lineHeight: 1.1, margin: 0 }}>
              <AnimatedNumber value={totalPayout} formatCurrency={formatCurrency} />
            </p>
            <p style={{ fontSize: '13px', color: 'var(--vl-text-muted)', marginTop: 8 }}>{planName}</p>

            {/* Stat tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, marginTop: 24 }}>
              <div style={{ borderRadius: 'var(--vl-r-md)', background: 'var(--vl-bg)', border: '1px solid var(--vl-line)', padding: 12 }}>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--vl-text-soft)', margin: 0 }}>Entities</p>
                <p style={{ fontFamily: 'var(--vl-font-mono)', fontWeight: 'var(--vl-fw-med)' as unknown as number, fontSize: '18px', color: 'var(--vl-text)', margin: '2px 0 0' }}>
                  {resultCount.toLocaleString()}
                </p>
              </div>
              <div style={{ borderRadius: 'var(--vl-r-md)', background: 'var(--vl-bg)', border: '1px solid var(--vl-line)', padding: 12 }}>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--vl-text-soft)', margin: 0 }}>Average</p>
                <p style={{ fontFamily: 'var(--vl-font-mono)', fontWeight: 'var(--vl-fw-med)' as unknown as number, fontSize: '18px', color: 'var(--vl-text)', margin: '2px 0 0' }}>
                  {formatCurrency(avgPerEntity)}
                </p>
              </div>
              <div style={{ borderRadius: 'var(--vl-r-md)', background: 'var(--vl-bg)', border: '1px solid var(--vl-line)', padding: 12 }}>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--vl-text-soft)', margin: 0 }}>Active</p>
                <p style={{ fontFamily: 'var(--vl-font-mono)', fontWeight: 'var(--vl-fw-med)' as unknown as number, fontSize: '18px', color: 'var(--vl-text)', margin: '2px 0 0' }}>
                  {activeComponents}<span style={{ color: 'var(--vl-text-soft)', fontSize: '13px' }}>/{componentDefinitions.length}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Right: Component breakdown bars (indigo ramp) */}
          <div style={{ padding: '28px', borderTop: '1px solid var(--vl-line)' }} className="lg:border-t-0 lg:border-l">
            <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10.5px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 16px' }}>
              Component Breakdown
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sortedComponents.map((comp, i) => {
                const pct = totalPayout > 0 ? (comp.total / totalPayout) * 100 : 0;
                const barWidth = maxTotal > 0 ? (comp.total / maxTotal) * 100 : 0;
                const color = VIALUCE_RAMP[i % VIALUCE_RAMP.length];

                return (
                  <div key={comp.componentId}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: color }} />
                      <span style={{ flex: 1, fontSize: '13px', color: 'var(--vl-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.componentName}>
                        {comp.componentName}
                      </span>
                      <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10px', color: 'var(--vl-text-soft)', padding: '1px 6px', borderRadius: 6, background: 'var(--vl-bg)' }}>
                        {comp.componentType.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '13px', color: 'var(--vl-text)', width: 80, textAlign: 'right' }}>
                        {formatCurrency(comp.total)}
                      </span>
                      <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '11px', color: 'var(--vl-text-soft)', width: 40, textAlign: 'right' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ marginLeft: 22, background: 'var(--vl-line-soft)', borderRadius: 'var(--vl-r-pill)', height: 6, overflow: 'hidden' }}>
                      <div style={{ height: 6, borderRadius: 'var(--vl-r-pill)', width: `${barWidth}%`, background: color, transition: 'all .5s' }} />
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
