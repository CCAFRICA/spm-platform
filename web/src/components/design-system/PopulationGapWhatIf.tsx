'use client';

/**
 * PopulationGapWhatIf — OB-211 Phase D: the population close-the-target-gap (regime 2), the
 * aggregate analog of GapWhatIf over the persona's scoped below-target set.
 *
 * SR-38 (anchored to the engine payout): per entity the projection is a straight-line scaling from
 * the REAL payout — delta = currentPayout × (min(value+lift, target) − value) / value — so at lift 0
 * the aggregate delta is exactly 0. SR-39: `entities` is already the persona's scoped set (loader).
 * A client-side what-if, not an asserted payout.
 */

import { useState, useMemo } from 'react';

interface GapEntity {
  entityId: string;
  value: number;          // attainment
  currentPayout: number;  // the engine's real payout (the dollar anchor)
}

interface PopulationGapWhatIfProps {
  entities: GapEntity[];
  target: number;         // the attainment target (100)
  formatCurrency?: (n: number) => string;
}

export function PopulationGapWhatIf({ entities, target, formatCurrency }: PopulationGapWhatIfProps) {
  const fmt = formatCurrency ?? ((n: number) => `$${Math.round(n).toLocaleString()}`);

  const minValue = useMemo(() => entities.reduce((m, e) => Math.min(m, e.value), target), [entities, target]);
  const maxLift = Math.max(1, Math.ceil(target - minValue));
  const [lift, setLift] = useState(0);

  const { aggregateDelta, reached } = useMemo(() => {
    let agg = 0;
    let r = 0;
    for (const e of entities) {
      if (e.value > 0) {
        const newValue = Math.min(e.value + lift, target); // cap the recovery at full target
        agg += e.currentPayout * (newValue - e.value) / e.value;
      }
      if (e.value < target && e.value + lift >= target) r++;
    }
    return { aggregateDelta: agg, reached: r };
  }, [entities, lift, target]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Attainment lift toward target (pts)</span>
        <span className="text-sm font-medium text-zinc-200 tabular-nums">+{lift.toFixed(0)}</span>
      </div>

      <input
        type="range"
        min={0}
        max={maxLift}
        step={maxLift / 100}
        value={lift}
        onChange={(e) => setLift(Number(e.target.value))}
        className="w-full h-2 cursor-pointer accent-emerald-500"
        aria-label="Attainment lift toward target"
      />

      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[11px] text-zinc-400">
            Projected change ({entities.length} entit{entities.length === 1 ? 'y' : 'ies'} below target)
          </p>
          <p className={`text-lg font-bold tabular-nums ${aggregateDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {aggregateDelta >= 0 ? '+' : ''}{fmt(aggregateDelta)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-zinc-400">Reach target</p>
          <p className="text-sm font-medium text-zinc-200 tabular-nums">{reached} of {entities.length}</p>
        </div>
      </div>

      <p className="text-[10px] text-zinc-500">
        Straight-line attainment model anchored to each entity&apos;s current payout — a what-if, not an asserted payout.
      </p>
    </div>
  );
}
