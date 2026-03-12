'use client';

/**
 * RelativePositionCard — Individual leaderboard snippet
 *
 * Shows 3 entities above the viewer, the viewer (highlighted), and
 * 3 entities below. Names below median are anonymized as "- - -".
 *
 * OB-165: Intelligence Stream Foundation
 */

import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';
import { IntelligenceCard } from './IntelligenceCard';

interface LeaderboardEntry {
  name: string | null; // null = anonymized
  amount: number;
}

interface RelativePositionCardProps {
  accentColor: string;
  rank: number;
  totalEntities: number;
  aboveEntities: LeaderboardEntry[];
  belowEntities: LeaderboardEntry[];
  viewerAmount: number;
  formatCurrency: (n: number) => string;
  onView?: () => void;
}

export function RelativePositionCard({
  accentColor,
  rank,
  totalEntities,
  aboveEntities,
  belowEntities,
  viewerAmount,
  formatCurrency,
  onView,
}: RelativePositionCardProps) {
  // Compute rank numbers for above entries
  // They are sorted closest-to-viewer first, so reverse for display
  const aboveRows = aboveEntities.map((entry, i) => ({
    rank: rank - (aboveEntities.length - i),
    name: entry.name ?? '- - -',
    amount: entry.amount,
    isViewer: false,
    isAnonymized: entry.name == null,
  }));

  // Viewer row
  const viewerRow = {
    rank,
    name: 'You',
    amount: viewerAmount,
    isViewer: true,
    isAnonymized: false,
  };

  // Below rows
  const belowRows = belowEntities.map((entry, i) => ({
    rank: rank + 1 + i,
    name: entry.name ?? '- - -',
    amount: entry.amount,
    isViewer: false,
    isAnonymized: entry.name == null,
  }));

  const allRows = [...aboveRows, viewerRow, ...belowRows];

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Your Position"
      elementId="relative-position"
      onView={onView}
    >
      {/* Rank summary */}
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-amber-400" />
        <span className="text-sm text-slate-300">
          Rank <span className="font-bold text-slate-100">{rank}</span> of{' '}
          <span className="font-medium text-slate-300">{totalEntities}</span>
        </span>
      </div>

      {/* Leaderboard snippet */}
      <div className="space-y-0.5">
        {allRows.map(row => (
          <div
            key={row.rank}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
              row.isViewer
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : 'hover:bg-zinc-800/30',
            )}
          >
            {/* Rank number */}
            <span
              className={cn(
                'text-xs font-bold w-6 text-right flex-shrink-0',
                row.isViewer ? 'text-emerald-400' : 'text-slate-600',
              )}
            >
              {row.rank}
            </span>

            {/* Name */}
            <span
              className={cn(
                'text-sm flex-1 min-w-0 truncate',
                row.isViewer
                  ? 'text-emerald-300 font-semibold'
                  : row.isAnonymized
                    ? 'text-slate-600 font-normal'
                    : 'text-slate-400',
              )}
            >
              {row.name}
            </span>

            {/* Amount */}
            <span
              className={cn(
                'text-sm font-medium flex-shrink-0',
                row.isViewer ? 'text-emerald-300' : 'text-slate-500',
              )}
            >
              {formatCurrency(row.amount)}
            </span>
          </div>
        ))}
      </div>
    </IntelligenceCard>
  );
}
