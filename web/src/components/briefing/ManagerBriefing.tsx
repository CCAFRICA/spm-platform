'use client';

/**
 * Manager Briefing Experience — Manager Persona (Amber Gradient)
 *
 * OB-163 Phase 6: 5 elements
 *   1. Team Total — Hero card with team aggregate
 *   2. Coaching Priority — Who needs attention
 *   3. Entity x Component Heatmap — Visual matrix
 *   4. Team Trend — Monthly sparkline for team
 *   5. Team Roster — Full entity list with payouts
 */

import React from 'react';
import type { ManagerBriefingData } from '@/lib/data/briefing-loader';

// ──────────────────────────────────────────────
// Coaching Priority
// ──────────────────────────────────────────────

function CoachingPriority({ entities, avgPayout, formatCurrency }: {
  entities: Array<{ displayName: string; totalPayout: number; branch: string }>;
  avgPayout: number;
  formatCurrency: (v: number) => string;
}) {
  // Bottom quartile = coaching candidates
  const sorted = [...entities].sort((a, b) => a.totalPayout - b.totalPayout);
  const bottomQuartile = sorted.slice(0, Math.ceil(sorted.length * 0.25));
  const topQuartile = sorted.slice(-Math.ceil(sorted.length * 0.25));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] text-amber-400/60 uppercase tracking-wider font-medium mb-2">
          Needs Coaching
        </p>
        <div className="space-y-1">
          {bottomQuartile.slice(0, 5).map(e => (
            <div key={e.displayName} className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-2">
              <span className="text-xs text-amber-300 flex-1 truncate">{e.displayName}</span>
              <span className="text-[10px] text-zinc-600">{e.branch}</span>
              <span className="text-xs text-amber-400 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(e.totalPayout)}
              </span>
              <span className="text-[10px] text-rose-400 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(e.totalPayout - avgPayout)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] text-emerald-400/60 uppercase tracking-wider font-medium mb-2">
          Top Performers
        </p>
        <div className="space-y-1">
          {topQuartile.slice(-3).reverse().map(e => (
            <div key={e.displayName} className="flex items-center gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
              <span className="text-xs text-emerald-300 flex-1 truncate">{e.displayName}</span>
              <span className="text-[10px] text-zinc-600">{e.branch}</span>
              <span className="text-xs text-emerald-400 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(e.totalPayout)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Component Heatmap
// ──────────────────────────────────────────────

function ComponentHeatmap({ heatmap, formatCurrency }: {
  heatmap: Array<{ entityName: string; entityId: string; components: Array<{ name: string; payout: number; color: string }> }>;
  formatCurrency: (v: number) => string;
}) {
  if (heatmap.length === 0) return null;

  const componentNames = heatmap[0]?.components.map(c => c.name) || [];
  const maxPayout = Math.max(...heatmap.flatMap(r => r.components.map(c => c.payout)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left text-[10px] text-zinc-600 uppercase tracking-wider py-2 pr-4 font-medium">Name</th>
            {componentNames.map(name => (
              <th key={name} className="text-center text-[10px] text-zinc-600 uppercase tracking-wider py-2 px-2 font-medium whitespace-nowrap">
                {name.length > 15 ? name.slice(0, 12) + '...' : name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.slice(0, 20).map(row => (
            <tr key={row.entityId} className="border-t border-zinc-800/30">
              <td className="text-zinc-400 py-1.5 pr-4 truncate max-w-[140px]">{row.entityName}</td>
              {row.components.map(comp => {
                const intensity = maxPayout > 0 ? comp.payout / maxPayout : 0;
                return (
                  <td key={comp.name} className="text-center py-1.5 px-1">
                    <span
                      className="inline-block rounded px-2 py-0.5 font-mono"
                      style={{
                        backgroundColor: `${comp.color}${Math.round(intensity * 40 + 5).toString(16).padStart(2, '0')}`,
                        color: intensity > 0.5 ? '#fff' : '#94a3b8',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatCurrency(comp.payout)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────
// Team Trend Sparkline
// ──────────────────────────────────────────────

function TeamTrend({ trend }: { trend: Array<{ canonicalKey: string; totalPayout: number }> }) {
  if (trend.length < 2) return <p className="text-xs text-zinc-600">Not enough periods for trend</p>;

  const max = Math.max(...trend.map(t => t.totalPayout));
  const min = Math.min(...trend.map(t => t.totalPayout));
  const range = max - min || 1;
  const width = 280;
  const height = 72;
  const padding = 4;

  const points = trend.map((t, i) => {
    const x = padding + (i / (trend.length - 1)) * (width - padding * 2);
    const y = height - padding - ((t.totalPayout - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="url(#amberGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={padding + ((trend.length - 1) / (trend.length - 1)) * (width - padding * 2)}
          cy={height - padding - ((trend[trend.length - 1].totalPayout - min) / range) * (height - padding * 2)}
          r="4" fill="#f59e0b" stroke="#0f172a" strokeWidth="2"
        />
        <defs>
          <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex justify-between mt-1">
        {trend.map(t => (
          <span key={t.canonicalKey} className="text-[9px] text-zinc-600 font-mono">
            {t.canonicalKey.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

interface ManagerBriefingProps {
  data: ManagerBriefingData;
  formatCurrency: (v: number) => string;
}

export function ManagerBriefing({ data, formatCurrency }: ManagerBriefingProps) {
  return (
    <div className="space-y-6">
      {/* 1. Team Total Hero */}
      <div
        className="rounded-2xl border border-amber-500/15 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(15,23,42,0.8) 100%)' }}
      >
        <div className="p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[11px] text-amber-400/60 uppercase tracking-wider font-medium">
              Team Total
            </p>
            <span className="text-[10px] text-zinc-600 bg-zinc-800/60 rounded px-1.5 py-0.5">
              {data.periodLabel}
            </span>
          </div>
          <p className="text-4xl lg:text-5xl font-bold text-zinc-100 tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(data.teamTotal)}
          </p>
          <p className="text-sm text-zinc-500 mt-1">{data.managerName} — {data.planName}</p>

          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Team Size</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5">{data.teamCount}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Average</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(data.teamAvg)}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Trend</p>
              <TeamTrend trend={data.trend} />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Coaching Priority */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <CoachingPriority
          entities={data.teamEntities}
          avgPayout={data.teamAvg}
          formatCurrency={formatCurrency}
        />
      </div>

      {/* 3. Entity x Component Heatmap */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
          Entity x Component Heatmap
        </p>
        <ComponentHeatmap heatmap={data.componentHeatmap} formatCurrency={formatCurrency} />
      </div>

      {/* 5. Full Roster */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
          Team Roster
        </p>
        <div className="space-y-1">
          {data.teamEntities.map(e => (
            <div key={e.entityId} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-800/30">
              <span className="text-sm font-mono text-zinc-600 w-8 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                #{e.rank}
              </span>
              <span className="text-sm text-zinc-400 flex-1 truncate">{e.displayName}</span>
              <span className="text-[10px] text-zinc-600">{e.level}</span>
              <span className="text-[10px] text-zinc-600 hidden sm:block">{e.branch}</span>
              <span className="text-sm text-zinc-300 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(e.totalPayout)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
