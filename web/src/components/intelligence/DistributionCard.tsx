'use client';

/**
 * DistributionCard — Admin histogram of payout distribution
 *
 * OB-211 WS-2 inc-2 (B3): composes the canonical `DistributionChart` primitive (extended
 * with optional buckets/formatter/reference-lines) instead of an inline recharts BarChart.
 * SR-34: the primitive is canonical for both attainment-% and payout-currency; no inline
 * parallel remains. This is the composition TEMPLATE WS-3..6 inherit.
 *
 * Five Elements:
 *   Value:      Population distribution visualization
 *   Context:    Mean, median, stdDev statistics
 *   Comparison: Mean and median reference lines on chart
 *   Action:     Implicit (admin reviews distribution for outliers)
 *   Impact:     Understanding population health
 */

import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';
import { DistributionChart } from '@/components/design-system/DistributionChart';

// Vialuce indigo ramp for histogram bars (replaces the dark-theme translucent indigo).
const VIALUCE_BAR_RAMP = ['#2D2F8F', '#4446B8', '#6668D8', '#9A9CE0', '#E8A838'];

interface DistributionBucket {
  label: string;
  count: number;
  min: number;
  max: number;
}

interface DistributionCardProps {
  accentColor: string;
  buckets: DistributionBucket[];
  mean: number;
  median: number;
  stdDev: number;
  formatCurrency: (n: number) => string;
  onView?: () => void;
  // OB-170: Five Elements additions
  onViewEntities?: () => void;
  isFirstPeriod?: boolean;
  entityCount?: number;
}

export function DistributionCard({
  accentColor,
  buckets,
  mean,
  median,
  stdDev,
  formatCurrency,
  onView,
  onViewEntities,
  isFirstPeriod,
  entityCount,
}: DistributionCardProps) {
  const isVialuce = useIsVialuce(); // Vialuce: histogram bars → indigo ramp, footer text/% → Vialuce tokens (mono)
  if (buckets.length === 0) return null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Population Distribution"
      elementId="population-distribution"
      fullWidth
      onView={onView}
    >
      {/* Chart — composed from the extended canonical primitive (payout buckets + currency
          formatter + mean/median reference lines). Replaces the prior inline recharts BarChart. */}
      <DistributionChart
        data={[]}
        buckets={buckets.map((b, i) => ({
          label: b.label,
          count: b.count,
          min: b.min,
          max: b.max,
          color: isVialuce ? VIALUCE_BAR_RAMP[Math.min(i, VIALUCE_BAR_RAMP.length - 1)] : 'rgba(99, 102, 241, 0.5)',
        }))}
        valueFormatter={formatCurrency}
        mean={mean}
        median={median}
        stdDev={stdDev}
        showReferenceLines
      />

      {/* OB-170: Comparison + Action + Impact */}
      {isVialuce ? (
        <div className="mt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--vl-line-soft)', paddingTop: 12 }}>
          <div style={{ fontSize: '11.5px', color: 'var(--vl-text-muted)', fontFamily: 'var(--vl-font-mono)' }}>
            {isFirstPeriod
              ? 'First calculated period — comparison available after next calculation.'
              : entityCount != null
                ? `${Math.round((buckets.filter(b => b.max <= median).reduce((s, b) => s + b.count, 0) / Math.max(entityCount, 1)) * 100)}% of entities below median.`
                : null}
          </div>
          {onViewEntities && (
            <button
              onClick={onViewEntities}
              className="inline-flex items-center gap-1"
              style={{ fontSize: '12.5px', fontWeight: 'var(--vl-fw-med)', color: 'var(--vialuce-indigo)' }}
            >
              View Entity Detail →
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between border-t border-zinc-800/60 pt-3">
          <div className="text-[11px] text-slate-500">
            {isFirstPeriod
              ? 'First calculated period — comparison available after next calculation.'
              : entityCount != null
                ? `${Math.round((buckets.filter(b => b.max <= median).reduce((s, b) => s + b.count, 0) / Math.max(entityCount, 1)) * 100)}% of entities below median.`
                : null}
          </div>
          {onViewEntities && (
            <button
              onClick={onViewEntities}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              View Entity Detail →
            </button>
          )}
        </div>
      )}
    </IntelligenceCard>
  );
}
