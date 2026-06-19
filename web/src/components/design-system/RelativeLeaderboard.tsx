'use client';

import { useIsVialuce } from '@/hooks/use-is-vialuce';

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
  const isVialuce = useIsVialuce(); // HF-316: design-spec .rank rows under Vialuce
  const above = neighbors.filter(n => n.rank < yourRank).sort((a, b) => a.rank - b.rank);
  const below = neighbors.filter(n => n.rank > yourRank).sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-0.5">
      {above.map(n => (
        <Row key={n.rank} rank={n.rank} name={n.anonymous ? '\u00B7 \u00B7 \u00B7' : n.name} value={n.value} isYou={false} isVialuce={isVialuce} />
      ))}
      <Row rank={yourRank} name={yourName} value={neighbors.find(n => n.rank === yourRank)?.value ?? 0} isYou={true} isVialuce={isVialuce} />
      {below.map(n => (
        <Row key={n.rank} rank={n.rank} name={n.anonymous ? '\u00B7 \u00B7 \u00B7' : n.name} value={n.value} isYou={false} isVialuce={isVialuce} />
      ))}
    </div>
  );
}

function Row({ rank, name, value, isYou, isVialuce }: { rank: number; name: string; value: number; isYou: boolean; isVialuce: boolean }) {
  if (isVialuce) {
    // Design-spec .rank: circular position chip on the indigo ramp; the viewer's own row is gold-accented.
    const posBg = isYou ? 'var(--vl-raw-gold)' : rank <= 3 ? 'var(--vl-raw-indigo)' : 'var(--vl-raw-slate)';
    return (
      <div className="rank" style={isYou ? { background: 'var(--vl-gold-50)', boxShadow: 'inset 0 0 0 1px #F0E4C4' } : undefined}>
        <span className="pos" style={{ background: posBg }}>{rank}</span>
        <div className="nm" style={{ flex: 1, minWidth: 0 }}>
          <b className="truncate" style={{ display: 'block', color: isYou ? 'var(--vl-text)' : undefined }}>{name}</b>
        </div>
        <div className="amt">
          <b>{value.toLocaleString()}</b>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-colors ${
        isYou
          ? 'bg-emerald-500/15 border border-emerald-500/30'
          : 'hover:bg-zinc-800/40'
      }`}
    >
      <span className="w-6 text-xs text-zinc-400 text-right tabular-nums">#{rank}</span>
      <span className={`flex-1 text-sm truncate ${isYou ? 'text-emerald-300 font-medium' : 'text-zinc-300'}`}>
        {name}
      </span>
      <span className={`text-sm tabular-nums ${isYou ? 'text-emerald-300' : 'text-zinc-400'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
