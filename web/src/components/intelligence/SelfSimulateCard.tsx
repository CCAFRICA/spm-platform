'use client';

/**
 * SelfSimulateCard — HF-293 FIX-2: the rep's OWN earnings what-if.
 *
 * Composes the EXISTING single-entity WhatIfSlider per tiered component (no new machinery).
 * UNCONDITIONAL on tiered (regime-3) components — independent of near-boundary populations,
 * which is what left the rep with no simulate affordance (the population OptimizationCard only
 * renders when a near-boundary group exists, and a rep is a population of one).
 *
 * SR-39: self-scoped — only THIS rep's own component data (loader scopes selfSimulations to
 * [myResult]). SR-38: dollar-anchored via the #515 reconciliation sf = currentPayout /
 * calculatePayout(value, tiers), so the at-rest payout equals the engine's real payout.
 */

import { IntelligenceCard } from './IntelligenceCard';
import { WhatIfSlider, calculatePayout } from '@/components/design-system';

interface SelfSimulation {
  componentName: string;
  value: number;
  currentPayout: number;
  tiers: Array<{ min: number; max: number; rate: number; label: string }>;
}

interface SelfSimulateCardProps {
  accentColor: string;
  simulations: SelfSimulation[];
  formatCurrency: (n: number) => string;
  onView?: () => void;
}

export function SelfSimulateCard({ accentColor, simulations, formatCurrency, onView }: SelfSimulateCardProps) {
  // HF-293 sweep MEDIUM: only show a slider where the dollar anchor is ESTABLISHABLE —
  // calculatePayout(value, tiers) > 0. If the rep's attainment is at/below the lowest tier min,
  // the tier model prices it at 0, sf can't reconcile to the real payout, and the at-rest delta
  // would show -currentPayout (a misleading negative). Skip those (HALT-REP-TIERS spirit: no
  // slider rather than a broken one).
  const anchored = simulations.filter(s => calculatePayout(s.value, s.tiers) > 0);
  if (anchored.length === 0) return null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Simulate Your Earnings"
      elementId="self-simulate"
      onView={onView}
    >
      <div className="space-y-5">
        {anchored.map((s, i) => {
          // SR-38 dollar-anchoring (#515 pattern): scale the plan tiers so the at-rest payout
          // equals the engine's real payout (delta = 0 at rest) and projections are real dollars.
          // rawBase > 0 is guaranteed by the `anchored` filter above.
          const rawBase = calculatePayout(s.value, s.tiers);
          const sf = rawBase > 0 ? s.currentPayout / rawBase : 1;
          const scaledTiers = s.tiers.map(t => ({ ...t, rate: t.rate * sf }));
          return (
            <div key={`${s.componentName}-${i}`} className={i > 0 ? 'pt-4 border-t border-zinc-800/60' : ''}>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">{s.componentName}</p>
              <WhatIfSlider
                currentValue={s.value}
                currentPayout={s.currentPayout}
                tiers={scaledTiers}
                formatCurrency={formatCurrency}
              />
            </div>
          );
        })}
      </div>
    </IntelligenceCard>
  );
}
