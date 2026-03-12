'use client';

/**
 * PersonalEarningsCard — Individual hero card
 *
 * Five Elements:
 *   Value:      Total payout (hero number)
 *   Context:    Attainment % + prior period delta
 *   Comparison: Current tier + gap to next tier (goal-gradient bar)
 *   Action:     Allocation recommendation
 *   Impact:     Projected earnings increase
 *
 * OB-165: Intelligence Stream Foundation
 */

import { TrendingUp, TrendingDown, Minus, Award, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IntelligenceCard } from './IntelligenceCard';

interface PersonalEarningsCardProps {
  accentColor: string;
  totalPayout: number;
  attainmentPct: number;
  priorPeriodTotal: number | null;
  currentTier: string;
  nextTier: string | null;
  gapToNextTier: number | null;
  gapUnit: string;
  allocationRecommendation: string | null;
  projectedIncrease: number | null;
  formatCurrency: (n: number) => string;
  onAllocationAction?: () => void;
  onView?: () => void;
}

export function PersonalEarningsCard({
  accentColor,
  totalPayout,
  attainmentPct,
  priorPeriodTotal,
  currentTier,
  nextTier,
  gapToNextTier,
  gapUnit,
  allocationRecommendation,
  projectedIncrease,
  formatCurrency,
  onAllocationAction,
  onView,
}: PersonalEarningsCardProps) {
  const delta = priorPeriodTotal != null ? totalPayout - priorPeriodTotal : null;
  const deltaPct = priorPeriodTotal != null && priorPeriodTotal !== 0
    ? ((totalPayout - priorPeriodTotal) / priorPeriodTotal) * 100
    : null;

  // Goal-gradient progress: how far through current tier toward next
  const goalProgressPct = gapToNextTier != null && gapToNextTier > 0
    ? Math.max(0, Math.min(100, (attainmentPct / (attainmentPct + gapToNextTier)) * 100))
    : 100; // At max tier

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Your Earnings"
      elementId="personal-earnings"
      fullWidth
      onView={onView}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {/* Value: hero payout number */}
        <div>
          <p className="text-3xl font-bold text-slate-100 tracking-tight">
            {formatCurrency(totalPayout)}
          </p>
          <p className="text-sm text-slate-500 mt-1">Total this period</p>
        </div>

        {/* Comparison: trend vs prior period */}
        {delta != null && deltaPct != null && (
          <div className="flex items-center gap-2">
            {delta > 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : delta < 0 ? (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            ) : (
              <Minus className="h-4 w-4 text-slate-500" />
            )}
            <span
              className={cn(
                'text-sm font-medium',
                delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-500',
              )}
            >
              {delta > 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs prior
            </span>
          </div>
        )}
      </div>

      {/* Context: attainment percentage */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Attainment</span>
          <span className="text-lg font-semibold text-slate-200">
            {attainmentPct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Comparison: tier + goal-gradient progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Award className="h-3.5 w-3.5" />
            {currentTier}
          </span>
          {nextTier && (
            <span className="text-emerald-400 font-medium">
              {gapToNextTier != null && `${gapToNextTier.toFixed(1)}${gapUnit} to `}
              {nextTier}
            </span>
          )}
          {!nextTier && (
            <span className="text-emerald-400 font-medium">
              Max tier reached
            </span>
          )}
        </div>
        <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-500"
            style={{ width: `${goalProgressPct}%` }}
          />
        </div>
      </div>

      {/* Action + Impact */}
      {allocationRecommendation && (
        <div className="mt-4 border-t border-zinc-800/60 pt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 flex-1">
            {allocationRecommendation}
            {projectedIncrease != null && projectedIncrease > 0 && (
              <span className="text-emerald-400 font-semibold ml-1">
                +{formatCurrency(projectedIncrease)}
              </span>
            )}
          </p>
          {onAllocationAction && (
            <button
              onClick={onAllocationAction}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                'text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0',
              )}
            >
              Focus
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </IntelligenceCard>
  );
}
