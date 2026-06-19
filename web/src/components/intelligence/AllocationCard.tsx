'use client';

/**
 * AllocationCard — Individual focus recommendation
 *
 * Five Elements:
 *   Value:      Component name (focus recommendation)
 *   Context:    Rationale (why this component)
 *   Comparison: Gap analysis (distance to next tier)
 *   Action:     "Focus Here" button
 *   Impact:     Projected earnings impact
 *
 * Confidence disclosure for cold tier.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { Crosshair, ArrowRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';

interface AllocationCardProps {
  accentColor: string;
  componentName: string;
  rationale: string;
  projectedImpact: number;
  confidence: 'structural' | 'warm' | 'hot';
  actionLabel: string;
  formatCurrency: (n: number) => string;
  onFocus?: () => void;
  onView?: () => void;
}

export function AllocationCard({
  accentColor,
  componentName,
  rationale,
  projectedImpact,
  confidence,
  actionLabel,
  formatCurrency,
  onFocus,
  onView,
}: AllocationCardProps) {
  const isVialuce = useIsVialuce(); // HF-316: projected impact→DM Mono, indigo CTA, muted disclosure

  // HF-316: Vialuce content uses DM Mono for the projected number, indigo CTA, and design-spec text
  // tokens. The IntelligenceCard wrapper supplies the .card surface. The else-branch is byte-identical
  // to the original (Dark/Bliss cannot regress).
  if (isVialuce) {
    return (
      <IntelligenceCard
        accentColor={accentColor}
        label="Focus Recommendation"
        elementId="allocation-recommendation"
        onView={onView}
      >
        {/* Value: highlighted component name */}
        <div className="flex items-center gap-2.5 mb-3">
          <Crosshair className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--vialuce-indigo)' }} />
          <p className="text-lg font-semibold" style={{ color: 'var(--vl-text)' }}>
            {componentName}
          </p>
        </div>

        {/* Context: rationale */}
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--vl-text-muted)' }}>
          {rationale}
        </p>

        {/* Impact: projected earnings */}
        <p className="text-xs" style={{ color: 'var(--vl-text-soft)' }}>
          Projected impact:{' '}
          <span className="font-semibold" style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-success)' }}>
            +{formatCurrency(projectedImpact)}
          </span>
        </p>

        {/* Action: Focus Here */}
        {onFocus && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--vl-line-soft)' }}>
            <button
              onClick={onFocus}
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: 'var(--vialuce-indigo)' }}
            >
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Confidence disclosure */}
        {confidence === 'structural' && (
          <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: 'var(--vl-text-soft)' }}>
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Structural recommendation based on plan design. Trend-aware projections require 2+ periods.
            </span>
          </div>
        )}
      </IntelligenceCard>
    );
  }

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Focus Recommendation"
      elementId="allocation-recommendation"
      onView={onView}
    >
      {/* Value: highlighted component name */}
      <div className="flex items-center gap-2.5 mb-3">
        <Crosshair className="h-5 w-5 text-emerald-400 flex-shrink-0" />
        <p className="text-lg font-semibold text-slate-100">
          {componentName}
        </p>
      </div>

      {/* Context: rationale */}
      <p className="text-sm text-slate-400 leading-relaxed mb-3">
        {rationale}
      </p>

      {/* Impact: projected earnings */}
      <p className="text-xs text-slate-500">
        Projected impact:{' '}
        <span className="text-emerald-400 font-semibold">
          +{formatCurrency(projectedImpact)}
        </span>
      </p>

      {/* Action: Focus Here */}
      {onFocus && (
        <div className="mt-3 border-t border-zinc-800/60 pt-3">
          <button
            onClick={onFocus}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium',
              'text-emerald-400 hover:text-emerald-300 transition-colors',
            )}
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Confidence disclosure */}
      {confidence === 'structural' && (
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Structural recommendation based on plan design. Trend-aware projections require 2+ periods.
          </span>
        </div>
      )}
    </IntelligenceCard>
  );
}
