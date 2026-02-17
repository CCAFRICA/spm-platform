'use client';

/** @cognitiveFit ranking — "Where do I stand?" */

interface Neighbor {
  rank: number;
  name: string;
  value: number;
  anonymous: boolean;
}

interface RelativeLeaderboardProps {
  yourRank: number;
  yourName: string;
  neighbors: Neighbor[];
}

export function RelativeLeaderboard({ yourRank, yourName, neighbors }: RelativeLeaderboardProps) {
  const above = neighbors.filter(n => n.rank < yourRank).sort((a, b) => a.rank - b.rank);
  const below = neighbors.filter(n => n.rank > yourRank).sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-0.5">
      {above.map(n => (
        <Row key={n.rank} rank={n.rank} name={n.anonymous ? '\u00B7 \u00B7 \u00B7' : n.name} value={n.value} isYou={false} />
      ))}
      <Row rank={yourRank} name={yourName} value={neighbors.find(n => n.rank === yourRank)?.value ?? 0} isYou={true} />
      {below.map(n => (
        <Row key={n.rank} rank={n.rank} name={n.anonymous ? '\u00B7 \u00B7 \u00B7' : n.name} value={n.value} isYou={false} />
      ))}
    </div>
  );
}

function Row({ rank, name, value, isYou }: { rank: number; name: string; value: number; isYou: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-colors ${
        isYou
          ? 'bg-emerald-500/15 border border-emerald-500/30'
          : 'hover:bg-zinc-800/40'
      }`}
    >
      <span className="w-6 text-xs text-zinc-500 text-right tabular-nums">#{rank}</span>
      <span className={`flex-1 text-sm truncate ${isYou ? 'text-emerald-300 font-medium' : 'text-zinc-300'}`}>
        {name}
      </span>
      <span className={`text-sm tabular-nums ${isYou ? 'text-emerald-300' : 'text-zinc-400'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
