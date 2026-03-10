'use client';

/**
 * Individual Briefing Experience — Rep Persona (Emerald Gradient)
 *
 * OB-163 Phase 5: 7 elements
 *   1. AI Narrative — Motivational summary from data
 *   2. Hero Earnings — Total payout with animation
 *   3. Attainment Ring — SVG circular progress
 *   4. Goal-Gradient Bar — Linear benchmark comparison
 *   5. Pace Indicator — Sparkline showing monthly trend
 *   6. Component Stack — Stacked horizontal bar
 *   7. Relative Leaderboard — Peer ranking
 */

import React, { useEffect, useState } from 'react';
import type { IndividualBriefingData } from '@/lib/data/briefing-loader';

// ──────────────────────────────────────────────
// Animated Number
// ──────────────────────────────────────────────

function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
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

  return <span>{format(display)}</span>;
}

// ──────────────────────────────────────────────
// Attainment Ring (SVG)
// ──────────────────────────────────────────────

function AttainmentRing({ percentile }: { percentile: number }) {
  const radius = 52;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentile / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          stroke="url(#emeraldGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 64 64)"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#84cc16" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-emerald-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {percentile}
        </span>
        <span className="text-[10px] text-emerald-400/60 uppercase tracking-wider">percentile</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Pace Sparkline
// ──────────────────────────────────────────────

function PaceSparkline({ trend }: { trend: Array<{ canonicalKey: string; totalPayout: number }> }) {
  if (trend.length < 2) return null;

  const max = Math.max(...trend.map(t => t.totalPayout));
  const min = Math.min(...trend.map(t => t.totalPayout));
  const range = max - min || 1;
  const width = 240;
  const height = 64;
  const padding = 4;

  const points = trend.map((t, i) => {
    const x = padding + (i / (trend.length - 1)) * (width - padding * 2);
    const y = height - padding - ((t.totalPayout - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const lastPoint = trend[trend.length - 1];
  const prevPoint = trend[trend.length - 2];
  const delta = lastPoint.totalPayout - prevPoint.totalPayout;
  const deltaPct = prevPoint.totalPayout > 0 ? (delta / prevPoint.totalPayout) * 100 : 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Pace</span>
        <span className={`text-xs font-mono ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {delta >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
        </span>
      </div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="url(#sparkGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {trend.length > 0 && (
          <circle
            cx={padding + ((trend.length - 1) / (trend.length - 1)) * (width - padding * 2)}
            cy={height - padding - ((lastPoint.totalPayout - min) / range) * (height - padding * 2)}
            r="4"
            fill="#10b981"
            stroke="#0f172a"
            strokeWidth="2"
          />
        )}
        <defs>
          <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#84cc16" />
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
// Component Stack
// ──────────────────────────────────────────────

function ComponentStack({ components, totalPayout, formatCurrency }: {
  components: Array<{ id: string; name: string; payout: number; color: string }>;
  totalPayout: number;
  formatCurrency: (v: number) => string;
}) {
  const sorted = [...components].sort((a, b) => b.payout - a.payout);

  return (
    <div>
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
        Component Breakdown
      </p>
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-zinc-800/50 mb-4">
        {sorted.map(comp => {
          const pct = totalPayout > 0 ? (comp.payout / totalPayout) * 100 : 0;
          return (
            <div
              key={comp.id}
              className="h-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: comp.color, opacity: 0.8 }}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="space-y-2">
        {sorted.map(comp => {
          const pct = totalPayout > 0 ? (comp.payout / totalPayout) * 100 : 0;
          return (
            <div key={comp.id} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: comp.color }}
              />
              <span className="text-xs text-zinc-400 flex-1 truncate">{comp.name}</span>
              <span className="text-xs text-zinc-300 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(comp.payout)}
              </span>
              <span className="text-[10px] text-zinc-600 w-10 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// AI Narrative
// ──────────────────────────────────────────────

function generateNarrative(data: IndividualBriefingData): string {
  const { displayName, totalPayout, rank, totalEntities, percentile, trend, avgPayout } = data;
  const firstName = displayName.split(' ')[0];

  // Determine trend direction
  const trendDir = trend.length >= 2
    ? trend[trend.length - 1].totalPayout > trend[trend.length - 2].totalPayout
      ? 'up'
      : trend[trend.length - 1].totalPayout < trend[trend.length - 2].totalPayout
        ? 'down'
        : 'flat'
    : 'flat';

  const aboveAvg = totalPayout > avgPayout;

  if (percentile >= 90 && trendDir === 'up') {
    return `${firstName}, you're in the top ${100 - percentile}% this period and still accelerating. Your consistency is what separates the best from the rest. Keep building on this momentum.`;
  }
  if (percentile >= 75) {
    return `${firstName}, you're ranked #${rank} of ${totalEntities} — solidly in the top quartile. ${trendDir === 'up' ? 'Your upward trend shows real momentum.' : 'A small push could take you into the top tier.'}`;
  }
  if (percentile >= 50 && trendDir === 'up') {
    return `${firstName}, your trajectory is pointing up. You've moved to #${rank} of ${totalEntities}, and the gap to the next level is closing. The work is paying off.`;
  }
  if (percentile >= 50) {
    return `${firstName}, you're at #${rank} of ${totalEntities}. ${aboveAvg ? 'Above the team average — a solid foundation to build on.' : 'Close to the team average. A focused effort on your strongest component could shift the picture.'}`;
  }
  if (trendDir === 'up') {
    return `${firstName}, the trend is positive — you're building momentum even if the rank (#${rank}) doesn't reflect it yet. Every period of growth compounds. Stay the course.`;
  }
  return `${firstName}, this period puts you at #${rank} of ${totalEntities}. Look at which components have the most room to move — that's where one change can shift everything.`;
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

interface IndividualBriefingProps {
  data: IndividualBriefingData;
  formatCurrency: (v: number) => string;
}

export function IndividualBriefing({ data, formatCurrency }: IndividualBriefingProps) {
  const narrative = generateNarrative(data);

  return (
    <div className="space-y-6">
      {/* 1. AI Narrative */}
      <div
        className="rounded-2xl border border-emerald-500/10 p-6"
        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(15,23,42,0.9) 100%)' }}
      >
        <p className="text-sm text-zinc-300 leading-relaxed italic">
          &ldquo;{narrative}&rdquo;
        </p>
      </div>

      {/* 2. Hero Earnings + 3. Attainment Ring */}
      <div
        className="rounded-2xl border border-emerald-500/15 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(15,23,42,0.8) 100%)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* Hero left */}
          <div className="col-span-2 p-6 lg:p-8">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] text-emerald-400/60 uppercase tracking-wider font-medium">
                My Earnings
              </p>
              <span className="text-[10px] text-zinc-600 bg-zinc-800/60 rounded px-1.5 py-0.5">
                {data.periodLabel}
              </span>
            </div>
            <p
              className="text-4xl lg:text-5xl font-bold text-zinc-100 tracking-tight"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <AnimatedNumber value={data.totalPayout} format={formatCurrency} />
            </p>
            <p className="text-sm text-zinc-500 mt-1">{data.displayName} — {data.role}</p>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Rank</p>
                <p className="text-lg font-bold text-zinc-200 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  #{data.rank}<span className="text-zinc-500 text-sm">/{data.totalEntities}</span>
                </p>
              </div>
              <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Team Avg</p>
                <p className="text-lg font-bold text-zinc-200 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(data.avgPayout)}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Branch</p>
                <p className="text-sm font-bold text-zinc-200 mt-0.5 truncate" title={data.branch}>
                  {data.branch || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Attainment ring right */}
          <div className="flex items-center justify-center p-6 border-t md:border-t-0 md:border-l border-zinc-800/40">
            <AttainmentRing percentile={data.percentile} />
          </div>
        </div>
      </div>

      {/* 4. Goal-Gradient Bar */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
            vs. Team Average
          </span>
          <span className={`text-xs font-mono ${data.totalPayout >= data.avgPayout ? 'text-emerald-400' : 'text-amber-400'}`}>
            {data.totalPayout >= data.avgPayout ? '+' : ''}
            {formatCurrency(data.totalPayout - data.avgPayout)}
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-zinc-800/60 overflow-hidden">
          {/* Entity bar */}
          <div
            className="absolute h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min((data.totalPayout / (data.avgPayout * 2)) * 100, 100)}%`,
              background: 'linear-gradient(90deg, #10b981, #84cc16)',
              opacity: 0.8,
            }}
          />
          {/* Average marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-zinc-400"
            style={{ left: '50%' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-zinc-600">$0</span>
          <span className="text-[9px] text-zinc-500">Avg: {formatCurrency(data.avgPayout)}</span>
          <span className="text-[9px] text-zinc-600">{formatCurrency(data.avgPayout * 2)}</span>
        </div>
      </div>

      {/* 5. Pace Indicator + 6. Component Stack */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <PaceSparkline trend={data.trend} />
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <ComponentStack
            components={data.components}
            totalPayout={data.totalPayout}
            formatCurrency={formatCurrency}
          />
        </div>
      </div>

      {/* 7. Relative Leaderboard */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-4">
          Leaderboard
        </p>
        <div className="space-y-1">
          {data.leaderboard.map((entry, idx) => {
            const isMe = entry.entityId === data.entityId;
            const prevRank = idx > 0 ? data.leaderboard[idx - 1].rank : 0;
            const showGap = prevRank > 0 && entry.rank - prevRank > 1;

            return (
              <React.Fragment key={entry.entityId}>
                {showGap && (
                  <div className="flex items-center gap-2 py-1 px-3">
                    <span className="text-[10px] text-zinc-700">...</span>
                  </div>
                )}
                <div
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                    isMe
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : 'hover:bg-zinc-800/30'
                  }`}
                >
                  <span
                    className={`text-sm font-mono w-8 text-right ${
                      isMe ? 'text-emerald-400 font-bold' : 'text-zinc-600'
                    }`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    #{entry.rank}
                  </span>
                  <span className={`text-sm flex-1 truncate ${isMe ? 'text-emerald-300 font-medium' : 'text-zinc-400'}`}>
                    {entry.displayName}
                    {isMe && <span className="text-emerald-500 text-[10px] ml-1.5">YOU</span>}
                  </span>
                  <span className="text-[10px] text-zinc-600 hidden sm:block">{entry.branch}</span>
                  <span
                    className={`text-sm font-mono ${isMe ? 'text-emerald-300' : 'text-zinc-400'}`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatCurrency(entry.totalPayout)}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
