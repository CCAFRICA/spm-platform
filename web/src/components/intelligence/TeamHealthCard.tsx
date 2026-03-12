'use client';

/**
 * TeamHealthCard — Manager hero card
 *
 * Five Elements:
 *   Value:      Team total payout
 *   Context:    Team size + on track / needs attention / exceeding counts
 *   Comparison: Trend vs prior period
 *   Action:     Coaching action (navigate to coaching)
 *   Impact:     Team improvement narrative
 *
 * OB-165: Intelligence Stream Foundation
 */

import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IntelligenceCard } from './IntelligenceCard';

interface TeamHealthCardProps {
  accentColor: string;
  teamTotal: number;
  teamSize: number;
  onTrack: number;
  needsAttention: number;
  exceeding: number;
  priorPeriodTeamTotal: number | null;
  formatCurrency: (n: number) => string;
  onCoachingAction?: () => void;
  onView?: () => void;
}

export function TeamHealthCard({
  accentColor,
  teamTotal,
  teamSize,
  onTrack,
  needsAttention,
  exceeding,
  priorPeriodTeamTotal,
  formatCurrency,
  onCoachingAction,
  onView,
}: TeamHealthCardProps) {
  const delta = priorPeriodTeamTotal != null ? teamTotal - priorPeriodTeamTotal : null;
  const deltaPct = priorPeriodTeamTotal != null && priorPeriodTeamTotal !== 0
    ? ((teamTotal - priorPeriodTeamTotal) / priorPeriodTeamTotal) * 100
    : null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Team Health"
      elementId="team-health"
      fullWidth
      onView={onView}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {/* Value: hero number */}
        <div>
          <p className="text-3xl font-bold text-slate-100 tracking-tight">
            {formatCurrency(teamTotal)}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <Users className="h-3.5 w-3.5 text-slate-500" />
            <p className="text-sm text-slate-500">
              {teamSize} team {teamSize === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>

        {/* Comparison: trend arrow */}
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
              {delta > 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs prior period
            </span>
          </div>
        )}
      </div>

      {/* Context: categorization pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        <CategoryPill label="Exceeding" count={exceeding} variant="exceeding" />
        <CategoryPill label="On Track" count={onTrack} variant="onTrack" />
        <CategoryPill label="Needs Attention" count={needsAttention} variant="needsAttention" />
      </div>

      {/* Action */}
      {onCoachingAction && (
        <div className="mt-4 border-t border-zinc-800/60 pt-3">
          <button
            onClick={onCoachingAction}
            className={cn(
              'text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors',
            )}
          >
            Review coaching priorities →
          </button>
        </div>
      )}
    </IntelligenceCard>
  );
}

// ──────────────────────────────────────────────
// Category pill
// ──────────────────────────────────────────────

function CategoryPill({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: 'exceeding' | 'onTrack' | 'needsAttention';
}) {
  const styles = {
    exceeding: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    onTrack: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    needsAttention: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border',
        styles[variant],
      )}
    >
      <span className="font-bold">{count}</span>
      {label}
    </span>
  );
}
