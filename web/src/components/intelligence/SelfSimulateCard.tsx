'use client';

/**
 * SelfSimulateCard — HF-293 FIX-2 + OB-211 Phase D: the rep's OWN earnings what-if, routed by REGIME.
 *
 * Composes the EXISTING sliders, one per simulatable component, chosen by the component's regime
 * (#508 classifier — see the loader): regime 3 → WhatIfSlider (cross-the-tier-boundary, HF-293);
 * regime 2 → GapWhatIf (close-the-target-gap, live on BCL's attainment components). UNCONDITIONAL on
 * a simulatable regime — independent of near-boundary populations.
 *
 * SR-39: self-scoped (the loader scopes selfSimulations to [myResult]). SR-38: both sliders are
 * dollar-anchored — tiered via sf = currentPayout / calculatePayout(value, tiers); gap via the
 * straight-line projection from the real payout (delta = 0 at the current attainment).
 */

import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';
import { WhatIfSlider, GapWhatIf, calculatePayout } from '@/components/design-system';

interface SelfSimulation {
  componentName: string;
  value: number;
  currentPayout: number;
  kind: 'tiered' | 'gap';
  tiers?: Array<{ min: number; max: number; rate: number; label: string }>;
  target?: number;
}

interface SelfSimulateCardProps {
  accentColor: string;
  simulations: SelfSimulation[];
  formatCurrency: (n: number) => string;
  onView?: () => void;
}

export function SelfSimulateCard({ accentColor, simulations, formatCurrency, onView }: SelfSimulateCardProps) {
  const isVialuce = useIsVialuce(); // HF-316: eyebrow + divider → design-spec tokens (sliders self-theme)
  // A tiered sim is renderable only where its dollar anchor is establishable (calculatePayout>0);
  // a gap sim is already guarded at the loader (payout>0 & 0<attainment<100). Drop unrenderable tiered.
  const renderable = simulations.filter(s =>
    s.kind === 'gap' ? true : (s.tiers ? calculatePayout(s.value, s.tiers) > 0 : false),
  );
  if (renderable.length === 0) return null;

  // HF-316: the WhatIfSlider/GapWhatIf children handle their own Vialuce theming; here only the
  // per-component eyebrow + section divider switch to design-spec tokens. The IntelligenceCard
  // wrapper supplies the .card surface. The else-branch is byte-identical (Dark/Bliss cannot regress).

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Simulate Your Earnings"
      elementId="self-simulate"
      onView={onView}
    >
      <div className="space-y-5">
        {renderable.map((s, i) => (
          <div
            key={`${s.componentName}-${i}`}
            className={i > 0 ? (isVialuce ? 'pt-4' : 'pt-4 border-t border-zinc-800/60') : ''}
            style={i > 0 && isVialuce ? { borderTop: '1px solid var(--vl-line-soft)' } : undefined}
          >
            <p
              className={isVialuce ? 'text-xs font-medium uppercase tracking-wide mb-2' : 'text-xs text-slate-400 font-medium uppercase tracking-wide mb-2'}
              style={isVialuce ? { color: 'var(--vl-text-soft)' } : undefined}
            >
              {s.componentName}
            </p>
            {s.kind === 'tiered' && s.tiers ? (() => {
              // SR-38 dollar-anchoring (#515): scale tiers so the at-rest payout equals the engine payout.
              const rawBase = calculatePayout(s.value, s.tiers);
              const sf = rawBase > 0 ? s.currentPayout / rawBase : 1;
              const scaledTiers = s.tiers.map(t => ({ ...t, rate: t.rate * sf }));
              return (
                <WhatIfSlider
                  currentValue={s.value}
                  currentPayout={s.currentPayout}
                  tiers={scaledTiers}
                  formatCurrency={formatCurrency}
                />
              );
            })() : (
              <GapWhatIf
                value={s.value}
                currentPayout={s.currentPayout}
                target={s.target ?? 100}
                formatCurrency={formatCurrency}
              />
            )}
          </div>
        ))}
      </div>
    </IntelligenceCard>
  );
}
