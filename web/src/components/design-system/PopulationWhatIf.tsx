'use client';

/**
 * PopulationWhatIf — OB-211 WS-2 inc-2 (Simulate, Option B: access-scoped population mode).
 *
 * Models the WHOLE near-boundary group the user can act on — and ONLY the entities the user
 * has access to. The `entities` set is already access-scoped by the loader (manager=team,
 * rep=self, admin=full); this component never widens it. A single lever (attainment lift)
 * projects, over the scoped set:
 *   - the AGGREGATE payout change (sum of per-entity tier-math deltas), and
 *   - the COUNT of entities that cross the boundary.
 *
 * SR-34: composes the SAME `calculatePayout` tier math as the single-entity WhatIfSlider — no
 * parallel payout computation. SR-38: the aggregate traces to the per-entity tier computation.
 * Reconciliation-channel: this is a client-side what-if, never an asserted payout.
 */

import { useState, useMemo } from 'react';
import { calculatePayout, type TierConfig } from './WhatIfSlider';

export interface PopulationEntity {
  entityId: string;
  value: number;          // attainment value (same scale as the tier bounds)
  currentPayout: number;  // the engine's actual payout for this entity+component
}

interface PopulationWhatIfProps {
  entities: PopulationEntity[];
  boundary: number;
  tiers: TierConfig[];
  formatCurrency?: (n: number) => string;
}

export function PopulationWhatIf({ entities, boundary, tiers, formatCurrency }: PopulationWhatIfProps) {
  const fmt = formatCurrency ?? ((n: number) => `$${Math.round(n).toLocaleString()}`);

  // Lift range: enough to bring the lowest in-scope near-boundary entity up to the boundary.
  const minValue = useMemo(
    () => entities.reduce((m, e) => Math.min(m, e.value), boundary),
    [entities, boundary],
  );
  const maxLift = Math.max(1, Math.ceil(boundary - minValue));
  const [lift, setLift] = useState(0);

  // Projection: per-entity tier-math delta (SR-38), summed over the SCOPED set only (SR-39).
  // SR-38 dollar-anchoring (the canonical RepDashboard pattern): raw `calculatePayout` sums
  // attainment-points x rate, which is NOT dollars (the plan's rate is per-volume). So scale each
  // entity's tier math by sf = currentPayout / calculatePayout(value, tiers) — then the baseline
  // equals the engine's REAL payout and the delta lands in real dollars. (If rawBase is 0, sf=1,
  // matching RepDashboard; such an entity contributes ~0 anyway.)
  const { aggregateDelta, affected } = useMemo(() => {
    let agg = 0;
    let crossed = 0;
    for (const e of entities) {
      const newValue = e.value + lift;
      const rawBase = calculatePayout(e.value, tiers);
      const sf = rawBase > 0 ? e.currentPayout / rawBase : 1;
      agg += sf * (calculatePayout(newValue, tiers) - rawBase);
      if (e.value < boundary && newValue >= boundary) crossed++;
    }
    return { aggregateDelta: agg, affected: crossed };
  }, [entities, lift, tiers, boundary]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Simulated lift (attainment pts)</span>
        <span className="text-sm font-medium text-zinc-200 tabular-nums">+{lift.toFixed(1)}</span>
      </div>

      <input
        type="range"
        min={0}
        max={maxLift}
        step={maxLift / 100}
        value={lift}
        onChange={(e) => setLift(Number(e.target.value))}
        className="w-full h-2 cursor-pointer accent-emerald-500"
        aria-label="Simulated attainment lift"
      />

      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[11px] text-zinc-400">
            Projected change ({entities.length} entit{entities.length === 1 ? 'y' : 'ies'} in scope)
          </p>
          <p className={`text-lg font-bold tabular-nums ${aggregateDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {aggregateDelta >= 0 ? '+' : ''}{fmt(aggregateDelta)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-zinc-400">Cross the boundary</p>
          <p className="text-sm font-medium text-zinc-200 tabular-nums">{affected} of {entities.length}</p>
        </div>
      </div>

      <p className="text-[10px] text-zinc-500">
        Client-side projection from the plan&apos;s tier rates — a what-if, not an asserted payout.
      </p>
    </div>
  );
}
