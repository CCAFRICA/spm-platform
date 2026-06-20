'use client';

/**
 * Admin Briefing Experience — Admin Persona (Indigo Gradient)
 *
 * OB-163 Phase 7: 6 elements
 *   1. System Health — Total payout + entity count
 *   2. Lifecycle Stepper — Batch state visualization
 *   3. Distribution Histogram — Payout distribution bars
 *   4. Component Totals — Aggregate component breakdown
 *   5. Top/Bottom Performers
 *   6. Period Trend — System-wide monthly trend
 */

import React from 'react';
import type { AdminBriefingData, BriefingComponent, BriefingEntity } from '@/lib/data/briefing-loader';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

// ──────────────────────────────────────────────
// Lifecycle Stepper
// ──────────────────────────────────────────────

const LIFECYCLE_STEPS = ['DRAFT', 'PREVIEW', 'RECONCILE', 'OFFICIAL', 'LOCKED', 'ARCHIVED'];

function LifecycleStepper({ currentState }: { currentState: string }) {
  const currentIdx = LIFECYCLE_STEPS.indexOf(currentState);

  return (
    <div className="flex items-center gap-1">
      {LIFECYCLE_STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono border transition-colors ${
                  isActive
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                    : isPast
                      ? 'bg-zinc-700/50 border-zinc-600 text-zinc-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-700'
                }`}
              >
                {isPast ? '\u2713' : i + 1}
              </div>
              <span className={`text-[8px] uppercase tracking-wider ${
                isActive ? 'text-indigo-400' : isPast ? 'text-zinc-500' : 'text-zinc-700'
              }`}>
                {step}
              </span>
            </div>
            {i < LIFECYCLE_STEPS.length - 1 && (
              <div className={`w-4 h-px mt-[-12px] ${isPast ? 'bg-zinc-600' : 'bg-zinc-800'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// Distribution Histogram
// ──────────────────────────────────────────────

function DistributionHistogram({ distribution }: {
  distribution: Array<{ bucket: string; count: number }>;
}) {
  const maxCount = Math.max(...distribution.map(d => d.count));

  return (
    <div className="space-y-1">
      {distribution.map(d => (
        <div key={d.bucket} className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-600 font-mono w-20 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {d.bucket}
          </span>
          <div className="flex-1 h-4 bg-zinc-800/40 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${maxCount > 0 ? (d.count / maxCount) * 100 : 0}%`,
                background: 'linear-gradient(90deg, rgba(99,102,241,0.6), rgba(139,92,246,0.6))',
              }}
            />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono w-6 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Component Totals Bar
// ──────────────────────────────────────────────

function AdminComponentTotals({ components, totalPayout, formatCurrency }: {
  components: BriefingComponent[];
  totalPayout: number;
  formatCurrency: (v: number) => string;
}) {
  const sorted = [...components].sort((a, b) => b.payout - a.payout);

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-4 rounded-full overflow-hidden bg-zinc-800/50 mb-4">
        {sorted.map(comp => {
          const pct = totalPayout > 0 ? (comp.payout / totalPayout) * 100 : 0;
          return (
            <div
              key={comp.id}
              className="h-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: comp.color, opacity: 0.7 }}
              title={`${comp.name}: ${formatCurrency(comp.payout)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sorted.map(comp => {
          const pct = totalPayout > 0 ? (comp.payout / totalPayout) * 100 : 0;
          return (
            <div key={comp.id} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: comp.color }} />
              <span className="text-xs text-zinc-400 flex-1 truncate">{comp.name}</span>
              <span className="text-xs text-zinc-300 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(comp.payout)}
              </span>
              <span className="text-[10px] text-zinc-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
// Performer Lists
// ──────────────────────────────────────────────

function PerformerList({ title, entities, accentClass, formatCurrency }: {
  title: string;
  entities: BriefingEntity[];
  accentClass: string;
  formatCurrency: (v: number) => string;
}) {
  return (
    <div>
      <p className={`text-[11px] ${accentClass} uppercase tracking-wider font-medium mb-2`}>
        {title}
      </p>
      <div className="space-y-1">
        {entities.map(e => (
          <div key={e.entityId} className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-zinc-800/30">
            <span className="text-xs font-mono text-zinc-600 w-6 text-right">#{e.rank}</span>
            <span className="text-xs text-zinc-400 flex-1 truncate">{e.displayName}</span>
            <span className="text-[10px] text-zinc-600">{e.branch}</span>
            <span className="text-xs text-zinc-300 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(e.totalPayout)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// System Trend
// ──────────────────────────────────────────────

function SystemTrend({ trend, formatCurrency }: {
  trend: Array<{ canonicalKey: string; totalPayout: number }>;
  formatCurrency: (v: number) => string;
}) {
  if (trend.length < 2) return <p className="text-xs text-zinc-600">Not enough periods</p>;

  const max = Math.max(...trend.map(t => t.totalPayout));
  const min = Math.min(...trend.map(t => t.totalPayout));
  const range = max - min || 1;

  return (
    <div className="space-y-1">
      {trend.map(t => {
        const pct = range > 0 ? ((t.totalPayout - min) / range) * 80 + 20 : 50;
        return (
          <div key={t.canonicalKey} className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600 font-mono w-10">{t.canonicalKey.slice(5)}</span>
            <div className="flex-1 h-3 bg-zinc-800/40 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, rgba(99,102,241,0.5), rgba(139,92,246,0.5))',
                }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 font-mono w-20 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(t.totalPayout)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

interface AdminBriefingProps {
  data: AdminBriefingData;
  formatCurrency: (v: number) => string;
}

export function AdminBriefing({ data, formatCurrency }: AdminBriefingProps) {
  const isVialuce = useIsVialuce(); // HF-315: admin briefing → design-spec .kpi hero + .card sections + .tbl performers; numbers DM Mono

  // Vialuce: the indigo-gradient hero becomes a white .card with a DM Mono eyebrow + .kpi-val total and
  // a 4-up .kpi stat grid; each section is a .card with a mono uppercase header; the Top/Attention
  // performer lists become .tbl tables (td.num for payouts). Inner bars (lifecycle, histogram, component
  // totals, trend) reuse the existing functions — they read fine under the dark CSS safety net (Prong 1).
  // The else-branch is the existing dark rendering, byte-identical (Dark/Bliss cannot regress).
  if (isVialuce) {
    const sortedComponents = [...data.componentTotals].sort((a, b) => b.payout - a.payout);
    const cardHead = (label: string) => (
      <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10.5px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', fontWeight: 400, margin: '0 0 14px' }}>
        {label}
      </p>
    );
    const performerTable = (entities: BriefingEntity[]) => (
      <div className="card flush" style={{ marginTop: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Name</th>
                <th>Branch</th>
                <th className="r">Payout</th>
              </tr>
            </thead>
            <tbody>
              {entities.map(e => (
                <tr key={e.entityId}>
                  <td className="num mut">{e.rank}</td>
                  <td className="name" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.displayName}>{e.displayName}</td>
                  <td className="mut">{e.branch}</td>
                  <td className="num">{formatCurrency(e.totalPayout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        {/* 1. System Health Hero */}
        <div className="kpi" style={{ marginTop: 0, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10.5px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)' }}>System Health</span>
            <span className="pill neutral">{data.periodLabel}</span>
          </div>
          <p className="kpi-val" style={{ fontSize: '40px' }}>{formatCurrency(data.totalPayout)}</p>
          <p style={{ fontSize: '13px', color: 'var(--vl-text-muted)', marginTop: 4 }}>{data.planName}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 22 }}>
            <div className="card" style={{ marginTop: 0, padding: 14 }}>
              <p className="kpi-label" style={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '10px' }}>Entities</p>
              <p className="kpi-val sm">{data.entityCount}</p>
            </div>
            <div className="card" style={{ marginTop: 0, padding: 14 }}>
              <p className="kpi-label" style={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '10px' }}>Average</p>
              <p className="kpi-val sm">{formatCurrency(data.avgPayout)}</p>
            </div>
            <div className="card" style={{ marginTop: 0, padding: 14 }}>
              <p className="kpi-label" style={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '10px' }}>Median</p>
              <p className="kpi-val sm">{formatCurrency(data.medianPayout)}</p>
            </div>
            <div className="card" style={{ marginTop: 0, padding: 14 }}>
              <p className="kpi-label" style={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '10px' }}>Batch</p>
              <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', color: 'var(--vl-text-muted)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={data.batchId}>{data.batchId.slice(0, 8)}</p>
            </div>
          </div>
        </div>

        {/* 2. Lifecycle Stepper */}
        <div className="card" style={{ marginTop: 0 }}>
          {cardHead('Batch Lifecycle')}
          <LifecycleStepper currentState={data.lifecycleState} />
        </div>

        {/* 3. Distribution + 4. Component Totals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card" style={{ marginTop: 0 }}>
            {cardHead('Payout Distribution')}
            <DistributionHistogram distribution={data.distribution} />
          </div>
          <div className="card" style={{ marginTop: 0 }}>
            {cardHead('Component Totals')}
            {/* Stacked bar reused from inner fn; legend rendered as design-spec .legend */}
            <div style={{ display: 'flex', height: 16, borderRadius: 'var(--vl-r-pill)', overflow: 'hidden', background: 'var(--vl-line-soft)', marginBottom: 16 }}>
              {sortedComponents.map(comp => {
                const pct = data.totalPayout > 0 ? (comp.payout / data.totalPayout) * 100 : 0;
                return (
                  <div key={comp.id} style={{ width: `${pct}%`, backgroundColor: comp.color }} title={`${comp.name}: ${formatCurrency(comp.payout)} (${pct.toFixed(1)}%)`} />
                );
              })}
            </div>
            <div className="legend" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 9 }}>
              {sortedComponents.map(comp => {
                const pct = data.totalPayout > 0 ? (comp.payout / data.totalPayout) * 100 : 0;
                return (
                  <div key={comp.id} className="row">
                    <span className="dot" style={{ backgroundColor: comp.color }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.name}</span>
                    <span style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text-muted)' }}>{formatCurrency(comp.payout)}</span>
                    <span className="pct" style={{ color: 'var(--vl-text-soft)' }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 5. Top + Bottom */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card" style={{ marginTop: 0 }}>
            {cardHead('Top Performers')}
            {performerTable(data.topPerformers)}
          </div>
          <div className="card" style={{ marginTop: 0 }}>
            {cardHead('Attention Needed')}
            {performerTable(data.bottomPerformers)}
          </div>
        </div>

        {/* 6. System Trend */}
        <div className="card" style={{ marginTop: 0 }}>
          {cardHead('Period Trend')}
          <SystemTrend trend={data.trend} formatCurrency={formatCurrency} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. System Health Hero */}
      <div
        className="rounded-2xl border border-indigo-500/15 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(15,23,42,0.8) 100%)' }}
      >
        <div className="p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[11px] text-indigo-400/60 uppercase tracking-wider font-medium">
              System Health
            </p>
            <span className="text-[10px] text-zinc-600 bg-zinc-800/60 rounded px-1.5 py-0.5">
              {data.periodLabel}
            </span>
          </div>
          <p className="text-4xl lg:text-5xl font-bold text-zinc-100 tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(data.totalPayout)}
          </p>
          <p className="text-sm text-zinc-500 mt-1">{data.planName}</p>

          <div className="grid grid-cols-4 gap-3 mt-6">
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Entities</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5">{data.entityCount}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Average</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(data.avgPayout)}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Median</p>
              <p className="text-lg font-bold text-zinc-200 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(data.medianPayout)}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Batch</p>
              <p className="text-xs font-mono text-zinc-400 mt-1 truncate" title={data.batchId}>
                {data.batchId.slice(0, 8)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Lifecycle Stepper */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-4">
          Batch Lifecycle
        </p>
        <LifecycleStepper currentState={data.lifecycleState} />
      </div>

      {/* 3. Distribution + 4. Component Totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
            Payout Distribution
          </p>
          <DistributionHistogram distribution={data.distribution} />
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
            Component Totals
          </p>
          <AdminComponentTotals
            components={data.componentTotals}
            totalPayout={data.totalPayout}
            formatCurrency={formatCurrency}
          />
        </div>
      </div>

      {/* 5. Top + Bottom */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <PerformerList
            title="Top Performers"
            entities={data.topPerformers}
            accentClass="text-emerald-400/60"
            formatCurrency={formatCurrency}
          />
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <PerformerList
            title="Attention Needed"
            entities={data.bottomPerformers}
            accentClass="text-amber-400/60"
            formatCurrency={formatCurrency}
          />
        </div>
      </div>

      {/* 6. System Trend */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
          Period Trend
        </p>
        <SystemTrend trend={data.trend} formatCurrency={formatCurrency} />
      </div>
    </div>
  );
}
