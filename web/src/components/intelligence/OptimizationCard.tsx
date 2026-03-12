'use client';

/**
 * OptimizationCard — Admin optimization opportunities
 *
 * Five Elements:
 *   Value:      List of optimization opportunities
 *   Context:    Entity count + component name per opportunity
 *   Comparison: Cost impact number
 *   Action:     "Simulate" button per item
 *   Impact:     Cost effect of tier boundary changes
 *
 * Confidence disclosure: shows structural note when in cold tier.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { Sparkles, ArrowRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IntelligenceCard } from './IntelligenceCard';

interface OptimizationOpportunity {
  componentName: string;
  description: string;
  entityCount: number;
  costImpact: number;
  actionLabel: string;
  actionRoute: string;
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
  if (opportunities.length === 0) return null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Optimization Opportunities"
      elementId="optimization-opportunities"
      onView={onView}
    >
      <div className="space-y-3">
        {opportunities.map((opp, i) => (
          <div
            key={`${opp.componentName}-${i}`}
            className="flex items-start justify-between gap-3 rounded-md bg-zinc-800/40 p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                  {opp.componentName}
                </span>
              </div>
              <p className="text-sm text-slate-300 leading-snug">
                {opp.description}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Cost impact:{' '}
                <span className="text-amber-400 font-semibold">
                  {formatCurrency(opp.costImpact)}
                </span>
              </p>
            </div>
            <button
              onClick={() => onSimulate?.(opp)}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded',
                'bg-zinc-700/60 hover:bg-zinc-700 text-slate-300 transition-colors',
                'flex-shrink-0 mt-0.5',
              )}
            >
              Simulate
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        ))}
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
