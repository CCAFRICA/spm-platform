'use client';

/**
 * CoachingPriorityCard — Manager highest-ROI coaching target
 *
 * Five Elements:
 *   Value:      Entity name + component
 *   Context:    Current attainment + trend
 *   Comparison: Gap to next tier (progress bar)
 *   Action:     "View Detail" button
 *   Impact:     Projected team impact (earnings increase)
 *
 * Confidence disclosure: cold tier shows structural note.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { Target, TrendingUp, TrendingDown, Minus, ArrowRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';

interface CoachingPriorityCardProps {
  accentColor: string;
  entityName: string;
  componentName: string;
  currentAttainment: number;
  gapToNextTier: number;
  projectedImpact: number;
  trend: number; // positive = improving, negative = declining
  confidenceTier: 'cold' | 'warm' | 'hot';
  formatCurrency: (n: number) => string;
  onViewDetail?: () => void;
  onView?: () => void;
}

export function CoachingPriorityCard({
  accentColor,
  entityName,
  componentName,
  currentAttainment,
  gapToNextTier,
  projectedImpact,
  trend,
  confidenceTier,
  formatCurrency,
  onViewDetail,
  onView,
}: CoachingPriorityCardProps) {
  const isVialuce = useIsVialuce(); // HF-316: numbers→DM Mono, trend→.kpi-delta, bar→indigo ramp
  const nextTierTarget = currentAttainment + gapToNextTier;
  const progressPct = nextTierTarget > 0
    ? Math.min(100, (currentAttainment / nextTierTarget) * 100)
    : 0;

  // HF-316: Vialuce content speaks the design-spec vocabulary (DM Mono attainment, .kpi-delta trend
  // chip, indigo-ramp progress bar, indigo CTA). The IntelligenceCard wrapper supplies the .card
  // surface. The else-branch is byte-identical to the original (Dark/Bliss cannot regress).
  if (isVialuce) {
    return (
      <IntelligenceCard
        accentColor={accentColor}
        label="Highest-ROI Coaching Target"
        elementId="coaching-priority"
        onView={onView}
      >
        {/* Value: entity + component */}
        <div className="flex items-start gap-3 mb-3">
          <Target className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--vialuce-gold)' }} />
          <div>
            <p className="text-lg font-semibold" style={{ color: 'var(--vl-text)' }}>{entityName}</p>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--vl-text-soft)' }}>{componentName}</p>
          </div>
        </div>

        {/* Context: current attainment + trend */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm" style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text-muted)' }}>
            {currentAttainment.toFixed(1)}% attainment
          </span>
          {trend !== 0 && (
            <span className={cn('kpi-delta', trend > 0 ? 'up' : 'down')}>
              {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
            </span>
          )}
          {trend === 0 && (
            <span className="kpi-delta flat">
              <Minus className="h-3 w-3" />
              flat
            </span>
          )}
        </div>

        {/* Comparison: gap to next tier — progress bar (indigo ramp) */}
        <div className="mb-1">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--vl-text-soft)' }}>Current</span>
            <span className="font-medium" style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vialuce-indigo)' }}>
              {gapToNextTier.toFixed(1)}% to next tier
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--vl-line-soft)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: 'linear-gradient(to right, var(--vl-raw-indigo-deep), var(--vl-raw-indigo-light))' }}
            />
          </div>
        </div>

        {/* Impact: projected team impact */}
        <p className="text-xs mt-3" style={{ color: 'var(--vl-text-soft)' }}>
          Projected team impact:{' '}
          <span className="font-semibold" style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-success)' }}>
            +{formatCurrency(projectedImpact)}
          </span>
        </p>

        {/* Action: View Detail */}
        {onViewDetail && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--vl-line-soft)' }}>
            <button
              onClick={onViewDetail}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: 'var(--vialuce-indigo)' }}
            >
              View Detail
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Confidence disclosure */}
        {confidenceTier === 'cold' && (
          <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: 'var(--vl-text-soft)' }}>
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Structural recommendation. Trend projections require 2+ periods.
            </span>
          </div>
        )}
      </IntelligenceCard>
    );
  }

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Highest-ROI Coaching Target"
      elementId="coaching-priority"
      onView={onView}
    >
      {/* Value: entity + component */}
      <div className="flex items-start gap-3 mb-3">
        <Target className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-lg font-semibold text-slate-100">{entityName}</p>
          <p className="text-xs text-slate-400 uppercase tracking-wide">{componentName}</p>
        </div>
      </div>

      {/* Context: current attainment + trend */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-slate-300">
          {currentAttainment.toFixed(1)}% attainment
        </span>
        {trend !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              trend > 0 ? 'text-emerald-400' : 'text-rose-400',
            )}
          >
            {trend > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
        {trend === 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Minus className="h-3 w-3" />
            flat
          </span>
        )}
      </div>

      {/* Comparison: gap to next tier — progress bar */}
      <div className="mb-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-500">Current</span>
          <span className="text-amber-400 font-medium">
            {gapToNextTier.toFixed(1)}% to next tier
          </span>
        </div>
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Impact: projected team impact */}
      <p className="text-xs text-slate-500 mt-3">
        Projected team impact:{' '}
        <span className="text-emerald-400 font-semibold">
          +{formatCurrency(projectedImpact)}
        </span>
      </p>

      {/* Action: View Detail */}
      {onViewDetail && (
        <div className="mt-3 border-t border-zinc-800/60 pt-3">
          <button
            onClick={onViewDetail}
            className={cn(
              'inline-flex items-center gap-1 text-sm font-medium',
              'text-amber-400 hover:text-amber-300 transition-colors',
            )}
          >
            View Detail
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Confidence disclosure */}
      {confidenceTier === 'cold' && (
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Structural recommendation. Trend projections require 2+ periods.
          </span>
        </div>
      )}
    </IntelligenceCard>
  );
}
