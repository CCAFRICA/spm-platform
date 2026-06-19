'use client';

/**
 * TrajectoryCard — Population trajectory intelligence
 *
 * OB-172: Renders when 2+ calculated periods exist.
 * 2 periods: period comparison with component deltas
 * 3+ periods: full trajectory with velocity, acceleration, movers
 *
 * Five Elements:
 *   Value:      Velocity or period delta
 *   Context:    Period count, entity count, component count
 *   Comparison: Period-over-period deltas, component growth/decline
 *   Action:     "Compare Periods" expands inline, entity detail link
 *   Impact:     Extrapolation with confidence disclosure
 *
 * DS-013 Section 7: Confidence disclosure mandatory.
 */

import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown, Info } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';
import type { PopulationTrajectory } from '@/lib/intelligence/trajectory-service';

interface TrajectoryCardProps {
  accentColor: string;
  trajectory: PopulationTrajectory;
  formatCurrency: (n: number) => string;
  onViewEntities?: () => void;
  onView?: () => void;
}

export function TrajectoryCard({
  accentColor,
  trajectory,
  formatCurrency,
  onViewEntities,
  onView,
}: TrajectoryCardProps) {
  const [showComparison, setShowComparison] = useState(false);
  const isVialuce = useIsVialuce(); // Vialuce: values → DM Mono, signed deltas → mono success/danger, comparison → .card flush + .tbl
  const { periods, velocity, trend, componentTrajectories, topAccelerators, topDecliners, confidenceBasis, periodCount } = trajectory;

  if (periods.length < 2) return null;

  const isWarm = periodCount >= 3;
  const latest = periods[periods.length - 1];
  const previous = periods[periods.length - 2];
  const periodDelta = latest.totalPayout - previous.totalPayout;
  const periodDeltaPct = previous.totalPayout !== 0 ? (periodDelta / previous.totalPayout * 100) : 0;

  const TrendIcon = trend === 'accelerating' ? TrendingUp : trend === 'decelerating' ? TrendingDown : Minus;
  const trendColor = trend === 'accelerating' ? 'text-emerald-400' : trend === 'decelerating' ? 'text-rose-400' : 'text-slate-400';
  const trendLabel = trend === 'accelerating' ? 'Accelerating' : trend === 'decelerating' ? 'Decelerating' : trend === 'stable' ? 'Stable' : '';
  // Vialuce token color for the trend (success/danger/muted), mirrors the dark trendColor mapping.
  const vlTrendColor = trend === 'accelerating' ? 'var(--vl-success)' : trend === 'decelerating' ? 'var(--vl-danger)' : 'var(--vl-text-muted)';

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label={isWarm ? 'Trajectory Intelligence' : 'Period Comparison'}
      elementId="trajectory-intelligence"
      fullWidth
      onView={onView}
    >
      {/* Value: velocity or delta — C2.3: with percentage growth rate + period range */}
      <div className="flex items-end justify-between">
        <div>
          {isWarm && velocity !== null ? (() => {
            // Compute average percentage growth rate
            const pctDeltas: number[] = [];
            for (let i = 1; i < periods.length; i++) {
              const prev = periods[i - 1].totalPayout;
              if (prev > 0) {
                pctDeltas.push(((periods[i].totalPayout - prev) / prev) * 100);
              }
            }
            const avgGrowthPct = pctDeltas.length > 0
              ? pctDeltas.reduce((a, b) => a + b, 0) / pctDeltas.length
              : null;
            const firstPeriod = periods[0];

            return (
              <>
                <p
                  className={isVialuce ? 'kpi-val' : 'text-2xl font-bold text-zinc-100 tracking-tight'}
                  style={isVialuce ? { fontSize: '24px' } : undefined}
                >
                  {velocity >= 0 ? '+' : ''}{formatCurrency(velocity)}<span className={isVialuce ? '' : 'text-base text-zinc-400'} style={isVialuce ? { fontSize: '14px', color: 'var(--vl-text-muted)' } : undefined}>/period</span>
                  {avgGrowthPct !== null && (
                    <span className={isVialuce ? 'ml-2' : 'text-base text-zinc-400 ml-2'} style={isVialuce ? { fontSize: '14px', color: 'var(--vl-text-muted)' } : undefined}>
                      ({avgGrowthPct >= 0 ? '+' : ''}{avgGrowthPct.toFixed(1)}% avg growth)
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <TrendIcon className={isVialuce ? 'h-4 w-4' : `h-4 w-4 ${trendColor}`} style={isVialuce ? { color: vlTrendColor } : undefined} />
                  <span className={isVialuce ? 'text-sm font-medium' : `text-sm font-medium ${trendColor}`} style={isVialuce ? { color: vlTrendColor } : undefined}>
                    {trendLabel} — from {formatCurrency(firstPeriod.totalPayout)} to {formatCurrency(latest.totalPayout)} over {periods.length} periods
                  </span>
                </div>
              </>
            );
          })() : (
            <>
              <p
                className={isVialuce ? 'kpi-val' : 'text-2xl font-bold text-zinc-100 tracking-tight'}
                style={isVialuce ? { fontSize: '24px' } : undefined}
              >
                {periodDelta >= 0 ? '+' : ''}{formatCurrency(periodDelta)}
              </p>
              <p className={isVialuce ? 'kpi-label' : 'text-sm text-zinc-500 mt-1'}>
                {previous.periodLabel} → {latest.periodLabel} ({periodDeltaPct >= 0 ? '+' : ''}{periodDeltaPct.toFixed(1)}%)
              </p>
            </>
          )}
        </div>

        {/* Impact: extrapolation */}
        {isWarm && velocity !== null && velocity > 0 && (
          <div className="text-right">
            <p className={isVialuce ? '' : 'text-xs text-zinc-400'} style={isVialuce ? { fontSize: '12px', color: 'var(--vl-text-muted)', fontFamily: 'var(--vl-font-mono)' } : undefined}>
              Projected next period: {formatCurrency(latest.totalPayout + velocity)}
            </p>
          </div>
        )}
      </div>

      {/* Component trajectories */}
      <div className="mt-4 space-y-1">
        {componentTrajectories.map(ct => {
          const latestVal = ct.periods[ct.periods.length - 1]?.total ?? 0;
          const prevVal = ct.periods.length >= 2 ? ct.periods[ct.periods.length - 2]?.total ?? 0 : null;
          const delta = prevVal !== null ? latestVal - prevVal : null;
          const ctIcon = ct.trend === 'growing' ? '▲' : ct.trend === 'declining' ? '▼' : '→';
          const ctColor = ct.trend === 'growing' ? 'text-emerald-400' : ct.trend === 'declining' ? 'text-rose-400' : 'text-zinc-500';
          const vlCtColor = ct.trend === 'growing' ? 'var(--vl-success)' : ct.trend === 'declining' ? 'var(--vl-danger)' : 'var(--vl-text-soft)';

          if (isVialuce) {
            return (
              <div key={ct.componentName} className="flex items-center gap-3 px-3 py-1.5 rounded">
                <span style={{ fontSize: '12px', color: vlCtColor }}>{ctIcon}</span>
                <span className="flex-1" style={{ fontSize: '13px', color: 'var(--vl-text)' }}>{ct.componentName}</span>
                {isWarm && ct.velocity !== null ? (
                  <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', color: vlCtColor }}>
                    {ct.velocity >= 0 ? '+' : ''}{formatCurrency(ct.velocity)}/period
                  </span>
                ) : delta !== null ? (
                  <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', color: delta >= 0 ? 'var(--vl-success)' : 'var(--vl-danger)' }}>
                    {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
                  </span>
                ) : (
                  <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', color: 'var(--vl-text-muted)' }}>{formatCurrency(latestVal)}</span>
                )}
              </div>
            );
          }

          return (
            <div key={ct.componentName} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-zinc-800/30">
              <span className={`text-xs ${ctColor}`}>{ctIcon}</span>
              <span className="text-xs text-zinc-200 flex-1">{ct.componentName}</span>
              {isWarm && ct.velocity !== null ? (
                <span className={`text-xs font-mono tabular-nums ${ctColor}`}>
                  {ct.velocity >= 0 ? '+' : ''}{formatCurrency(ct.velocity)}/period
                </span>
              ) : delta !== null ? (
                <span className={`text-xs font-mono tabular-nums ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">{formatCurrency(latestVal)}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Top movers (Warm only) */}
      {isWarm && (topAccelerators.length > 0 || topDecliners.length > 0) && (
        isVialuce ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--vl-line-soft)', paddingTop: 16 }}>
            {topAccelerators.length > 0 && (
              <div>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--vl-success)', marginBottom: 8, fontFamily: 'var(--vl-font-mono)' }}>Top Accelerators</p>
                {topAccelerators.map(e => (
                  <div key={e.entityId} className="flex items-center justify-between py-1">
                    <span className="truncate max-w-[150px]" style={{ fontSize: '12px', color: 'var(--vl-text)' }}>{e.displayName}</span>
                    <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', color: 'var(--vl-success)' }}>
                      +{formatCurrency(e.velocity ?? 0)}/period
                    </span>
                  </div>
                ))}
              </div>
            )}
            {topDecliners.length > 0 && (
              <div>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--vl-danger)', marginBottom: 8, fontFamily: 'var(--vl-font-mono)' }}>Attention Needed</p>
                {topDecliners.map(e => (
                  <div key={e.entityId} className="flex items-center justify-between py-1">
                    <span className="truncate max-w-[150px]" style={{ fontSize: '12px', color: 'var(--vl-text)' }}>{e.displayName}</span>
                    <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', color: 'var(--vl-danger)' }}>
                      {formatCurrency(e.velocity ?? 0)}/period
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800/60 pt-4">
            {topAccelerators.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-2">Top Accelerators</p>
                {topAccelerators.map(e => (
                  <div key={e.entityId} className="flex items-center justify-between text-xs py-1">
                    <span className="text-zinc-300 truncate max-w-[150px]">{e.displayName}</span>
                    <span className="text-emerald-400 font-mono tabular-nums">
                      +{formatCurrency(e.velocity ?? 0)}/period
                    </span>
                  </div>
                ))}
              </div>
            )}
            {topDecliners.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-rose-400 mb-2">Attention Needed</p>
                {topDecliners.map(e => (
                  <div key={e.entityId} className="flex items-center justify-between text-xs py-1">
                    <span className="text-zinc-300 truncate max-w-[150px]">{e.displayName}</span>
                    <span className="text-rose-400 font-mono tabular-nums">
                      {formatCurrency(e.velocity ?? 0)}/period
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Action + Confidence */}
      {isVialuce ? (
        <div className="mt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--vl-line-soft)', paddingTop: 12 }}>
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5" style={{ color: 'var(--vl-text-soft)' }} />
            <span style={{ fontSize: '11px', color: 'var(--vl-text-muted)' }}>{confidenceBasis}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="inline-flex items-center gap-1"
              style={{ fontSize: '12.5px', fontWeight: 'var(--vl-fw-med)', color: 'var(--vialuce-indigo)' }}
            >
              Compare Periods
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showComparison ? 'rotate-180' : ''}`} />
            </button>
            {onViewEntities && (
              <button
                onClick={onViewEntities}
                className="inline-flex items-center gap-1"
                style={{ fontSize: '12.5px', fontWeight: 'var(--vl-fw-med)', color: 'var(--vialuce-indigo)' }}
              >
                View Entities →
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between border-t border-zinc-800/60 pt-3">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-[11px] text-zinc-500">{confidenceBasis}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Compare Periods
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showComparison ? 'rotate-180' : ''}`} />
            </button>
            {onViewEntities && (
              <button
                onClick={onViewEntities}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                View Entities →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inline comparison (Phase 4) */}
      {showComparison && (
        isVialuce ? (
          <div className="card flush mt-4 overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="tbl">
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr>
                  <th>Component</th>
                  {periods.map(p => (
                    <th key={p.periodId} className="r">{p.periodLabel}</th>
                  ))}
                  <th className="r">Trend</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="name">Total</td>
                  {periods.map(p => (
                    <td key={p.periodId} className="num">{formatCurrency(p.totalPayout)}</td>
                  ))}
                  <td className="r" style={{ color: vlTrendColor }}>{trendLabel}</td>
                </tr>
                {componentTrajectories.map(ct => (
                  <tr key={ct.componentName}>
                    <td className="mut">{ct.componentName}</td>
                    {ct.periods.map((p, i) => (
                      <td key={i} className="num mut">{formatCurrency(p.total)}</td>
                    ))}
                    <td className="r" style={{ fontSize: '12px', color: ct.trend === 'growing' ? 'var(--vl-success)' : ct.trend === 'declining' ? 'var(--vl-danger)' : 'var(--vl-text-soft)' }}>
                      {ct.trend === 'growing' ? '▲ Growing' : ct.trend === 'declining' ? '▼ Declining' : '→ Stable'}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="mut">Entities</td>
                  {periods.map(p => (
                    <td key={p.periodId} className="num mut">{p.entityCount}</td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800 max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 text-left text-zinc-400">Component</th>
                  {periods.map(p => (
                    <th key={p.periodId} className="px-3 py-2 text-right text-zinc-400">{p.periodLabel}</th>
                  ))}
                  <th className="px-3 py-2 text-right text-zinc-400">Trend</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-zinc-800 font-semibold">
                  <td className="px-3 py-2 text-zinc-100">Total</td>
                  {periods.map(p => (
                    <td key={p.periodId} className="px-3 py-2 text-right font-mono text-zinc-100 tabular-nums">
                      {formatCurrency(p.totalPayout)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right ${trendColor}`}>{trendLabel}</td>
                </tr>
                {componentTrajectories.map(ct => (
                  <tr key={ct.componentName} className="border-t border-zinc-800/50">
                    <td className="px-3 py-2 text-zinc-300">{ct.componentName}</td>
                    {ct.periods.map((p, i) => (
                      <td key={i} className="px-3 py-2 text-right font-mono text-zinc-400 tabular-nums">
                        {formatCurrency(p.total)}
                      </td>
                    ))}
                    <td className={`px-3 py-2 text-right text-xs ${
                      ct.trend === 'growing' ? 'text-emerald-400' : ct.trend === 'declining' ? 'text-rose-400' : 'text-zinc-500'
                    }`}>
                      {ct.trend === 'growing' ? '▲ Growing' : ct.trend === 'declining' ? '▼ Declining' : '→ Stable'}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-800/50">
                  <td className="px-3 py-2 text-zinc-400">Entities</td>
                  {periods.map(p => (
                    <td key={p.periodId} className="px-3 py-2 text-right text-zinc-500">{p.entityCount}</td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}
    </IntelligenceCard>
  );
}
