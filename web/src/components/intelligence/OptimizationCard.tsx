'use client';

/**
 * OptimizationCard — optimization opportunities + access-scoped Simulate
 *
 * OB-211 WS-2 inc-2 (Simulate, Option B): the Simulate control is now LIVE and access-scoped.
 * Clicking it opens an inline what-if over ONLY the entities the user can act on — the
 * opportunity's `nearBoundaryEntities` are already scoped by the loader (manager=team,
 * rep=self, admin=full). Single entity → WhatIfSlider (rep's own context); group →
 * PopulationWhatIf. No model (structural-fallback opportunity) → disabled + tooltip.
 *
 * Five Elements:
 *   Value:      List of optimization opportunities
 *   Context:    Entity count + component name per opportunity
 *   Comparison: Cost impact number
 *   Action:     "Simulate" → inline access-scoped what-if
 *   Impact:     Projected payout change over the scoped near-boundary set
 */

import { useState } from 'react';
import { Sparkles, ArrowRight, Info, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IntelligenceCard } from './IntelligenceCard';
import { WhatIfSlider, PopulationWhatIf, calculatePayout } from '@/components/design-system';

interface OptimizationOpportunity {
  componentName: string;
  description: string;
  entityCount: number;
  costImpact: number;
  actionLabel: string;
  actionRoute: string;
  // OB-211 WS-2 inc-2: access-scoped Simulate inputs (scoped by the loader to the persona's set).
  boundary?: number;
  tiers?: Array<{ min: number; max: number; rate: number; label: string }>;
  nearBoundaryEntities?: Array<{ entityId: string; value: number; currentPayout: number }>;
}

interface OptimizationCardProps {
  accentColor: string;
  opportunities: OptimizationOpportunity[];
  confidenceTier: 'cold' | 'warm' | 'hot';
  formatCurrency: (n: number) => string;
  onSimulate?: (opportunity: OptimizationOpportunity) => void;
  onView?: () => void;
}

export function OptimizationCard({
  accentColor,
  opportunities,
  confidenceTier,
  formatCurrency,
  onSimulate,
  onView,
}: OptimizationCardProps) {
  const [simulatingIdx, setSimulatingIdx] = useState<number | null>(null);

  if (opportunities.length === 0) return null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Optimization Opportunities"
      elementId="optimization-opportunities"
      onView={onView}
    >
      <div className="space-y-3">
        {opportunities.map((opp, i) => {
          const entities = opp.nearBoundaryEntities ?? [];
          const hasModel = !!opp.tiers && opp.tiers.length > 0 && entities.length > 0 && opp.boundary != null;
          const isOpen = simulatingIdx === i;

          return (
            <div key={`${opp.componentName}-${i}`} className="rounded-md bg-zinc-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                      {opp.componentName}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-snug">{opp.description}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Cost impact:{' '}
                    <span className="text-amber-400 font-semibold">{formatCurrency(opp.costImpact)}</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!hasModel) return;
                    const next = isOpen ? null : i;
                    setSimulatingIdx(next);
                    if (next !== null) onSimulate?.(opp);
                  }}
                  disabled={!hasModel}
                  title={hasModel
                    ? 'Simulate the impact for the entities you can act on'
                    : 'Simulation needs tier data for this opportunity'}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded flex-shrink-0 mt-0.5 transition-colors',
                    hasModel
                      ? 'bg-zinc-700/60 hover:bg-zinc-700 text-slate-300 cursor-pointer'
                      : 'bg-zinc-800/40 text-slate-600 cursor-not-allowed',
                  )}
                >
                  Simulate
                  {hasModel
                    ? <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
                    : <ArrowRight className="h-3 w-3" />}
                </button>
              </div>

              {/* Inline access-scoped what-if: single-entity (rep own context) or population (group). */}
              {isOpen && hasModel && (
                <div className="mt-3 pt-3 border-t border-zinc-700/50">
                  {entities.length === 1 ? (() => {
                    // SR-38 dollar-anchoring (RepDashboard pattern): scale the raw plan tiers by
                    // sf = currentPayout / calculatePayout(value, tiers) so the slider's at-rest
                    // payout equals the engine's real payout (delta = 0 at rest) and projections
                    // are real dollars, not attainment-points x rate.
                    const e = entities[0];
                    const rawBase = calculatePayout(e.value, opp.tiers!);
                    const sf = rawBase > 0 ? e.currentPayout / rawBase : 1;
                    const scaledTiers = opp.tiers!.map(t => ({ ...t, rate: t.rate * sf }));
                    return (
                      <WhatIfSlider
                        currentValue={e.value}
                        currentPayout={e.currentPayout}
                        tiers={scaledTiers}
                        formatCurrency={formatCurrency}
                      />
                    );
                  })() : (
                    <PopulationWhatIf
                      entities={entities}
                      boundary={opp.boundary!}
                      tiers={opp.tiers!}
                      formatCurrency={formatCurrency}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confidence disclosure for cold tier */}
      {confidenceTier === 'cold' && (
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Structural analysis only. Trend-based projections require 2+ periods of data.
          </span>
        </div>
      )}
    </IntelligenceCard>
  );
}
