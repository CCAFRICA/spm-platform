'use client';

/**
 * GapWhatIf — OB-211 Phase D: the close-the-target-gap what-if for REGIME-2 components (#508).
 *
 * Regime-2 components (target tracked, no tier gate — e.g. BCL's Colocación/Captación) have an
 * attainment and a target but no tier structure to "cross". The actionable lever is the GAP to
 * target: lifting attainment toward 100% recovers the amount left on the table.
 *
 * SR-38 (anchored to the engine payout): the projection is a straight-line scaling from the rep's
 * REAL payout — projected(newAtt) = currentPayout × (newAtt / value). At the current attainment
 * (newAtt = value) projected = currentPayout, so delta = 0 at rest. It is a client-side what-if,
 * never an asserted payout. Only rendered where value>0 & payout>0 (the loader guards the anchor).
 */

import { useState } from 'react';

interface GapWhatIfProps {
  value: number;          // current attainment (e.g. 86)
  currentPayout: number;  // the engine's real payout for this component (the dollar anchor)
  target: number;         // the attainment target (100 = full attainment)
  formatCurrency: (n: number) => string;
}

export function GapWhatIf({ value, currentPayout, target, formatCurrency }: GapWhatIfProps) {
  const max = Math.max(target, value);
  const [att, setAtt] = useState(value);

  // SR-38: linear scaling anchored to the real payout (delta = 0 at the current attainment).
  const projectedDelta = value > 0 ? currentPayout * (att / value) - currentPayout : 0;
  const recoverAtTarget = value > 0 ? currentPayout * (target / value) - currentPayout : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Attainment — close the gap to target</span>
        <span className="text-sm font-medium text-zinc-200 tabular-nums">{att.toFixed(0)}% / {target}%</span>
      </div>

      <input
        type="range"
        min={value}
        max={max}
        step={(max - value) / 100 || 1}
        value={att}
        onChange={(e) => setAtt(Number(e.target.value))}
        className="w-full h-2 cursor-pointer accent-emerald-500"
        aria-label="Attainment lift toward target"
      />

      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[11px] text-zinc-400">Projected change</p>
          <p className={`text-lg font-bold tabular-nums ${projectedDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {projectedDelta >= 0 ? '+' : ''}{formatCurrency(projectedDelta)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-zinc-400">At target ({target}%)</p>
          <p className="text-sm font-medium text-emerald-400 tabular-nums">+{formatCurrency(recoverAtTarget)}</p>
        </div>
      </div>

      <p className="text-[10px] text-zinc-500">
        Straight-line attainment model anchored to your current payout — a what-if, not an asserted payout.
      </p>
    </div>
  );
}
