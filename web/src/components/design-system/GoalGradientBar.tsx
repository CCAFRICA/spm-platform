'use client';

interface Tier {
  pct: number;
  label: string;
}

interface GoalGradientBarProps {
  currentPct: number;
  tiers: Tier[];
}

export function GoalGradientBar({ currentPct, tiers }: GoalGradientBarProps) {
  const sortedTiers = [...tiers].sort((a, b) => a.pct - b.pct);
  // Cap display at 200% to prevent extreme bar widths from bad data
  const cappedPct = Math.min(currentPct, 200);
  const maxPct = Math.max(sortedTiers[sortedTiers.length - 1]?.pct ?? 100, cappedPct) * 1.1;

  // Find next tier
  const nextTier = sortedTiers.find(t => t.pct > cappedPct);
  const gap = nextTier ? nextTier.pct - cappedPct : 0;

  // Gradient warms as you approach the next tier
  const gradientClass = cappedPct >= 100
    ? 'from-emerald-400 via-lime-400 to-yellow-400'
    : cappedPct >= 80
    ? 'from-emerald-500 via-lime-500 to-lime-400'
    : 'from-emerald-600 to-emerald-500';

  return (
    <div className="space-y-2">
      <div className="relative h-4 w-full rounded-full bg-zinc-800/60 overflow-visible">
        {/* Progress bar with gradient */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${gradientClass} transition-all duration-700 ease-out`}
          style={{ width: `${Math.min((cappedPct / maxPct) * 100, 100)}%` }}
        />
        {/* Tier landmarks */}
        {sortedTiers.map(tier => {
          const tierPos = (tier.pct / maxPct) * 100;
          if (tierPos > 100) return null;
          return (
            <div
              key={tier.pct}
              className="absolute top-0 h-full flex flex-col items-center"
              style={{ left: `${tierPos}%` }}
            >
              <div className="w-px h-full bg-zinc-500/60" />
              <span className="absolute -bottom-5 text-[10px] text-zinc-500 whitespace-nowrap -translate-x-1/2">
                {tier.label}
              </span>
            </div>
          );
        })}
        {/* Current position dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-zinc-900 shadow-lg z-10 transition-all duration-700"
          style={{ left: `${Math.min((cappedPct / maxPct) * 100, 100)}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      {/* Gap text */}
      {nextTier && gap > 0 && (
        <p className="text-xs text-zinc-400 mt-4">
          Solo <span className="text-emerald-400 font-medium">{gap.toFixed(1)}%</span> m&aacute;s para{' '}
          <span className="text-zinc-200">{nextTier.label}</span>
        </p>
      )}
    </div>
  );
}
