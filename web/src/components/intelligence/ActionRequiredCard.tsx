'use client';

/**
 * ActionRequiredCard — Shows periods ready to calculate
 *
 * Five Elements:
 *   Value:      N periods ready to calculate
 *   Context:    Period labels with data row counts
 *   Comparison: Reference to already-calculated period
 *   Action:     "Calculate Now →" per period
 *   Impact:     What calculating produces (trajectory activation)
 *
 * OB-170: Intelligence Stream Phase A
 */

import { Calculator, ArrowRight } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';

interface UncalculatedPeriod {
  periodId: string;
  label: string;
  dataRowCount: number;
}

interface ActionRequiredCardProps {
  accentColor: string;
  periods: UncalculatedPeriod[];
  calculatedPeriodCount: number;
  latestCalculatedLabel?: string;
  latestCalculatedTotal?: number;
  formatCurrency: (n: number) => string;
  onCalculate: (periodId: string) => void;
  onView?: () => void;
}

export function ActionRequiredCard({
  accentColor,
  periods,
  calculatedPeriodCount,
  latestCalculatedLabel,
  latestCalculatedTotal,
  formatCurrency,
  onCalculate,
  onView,
}: ActionRequiredCardProps) {
  const isVialuce = useIsVialuce(); // HF-315: hook must precede any early return (rules-of-hooks)
  if (periods.length === 0) return null;

  const nextCalcCount = calculatedPeriodCount + 1;

  // HF-316: under Vialuce the period rows sit on a light surface, the data-row counts + totals are DM
  // Mono, and the calculate action is the gold .btn-calc. The IntelligenceCard wrapper supplies the
  // .card surface. The else-branch is byte-identical to the original (Dark/Bliss cannot regress).
  if (isVialuce) {
    return (
      <IntelligenceCard
        accentColor={accentColor}
        label="Action Required"
        elementId="action-required"
        fullWidth
        onView={onView}
        tier="action"
      >
        {/* Value */}
        <p className="text-lg font-semibold" style={{ color: 'var(--vl-text)' }}>
          {periods.length} period{periods.length !== 1 ? 's' : ''} ready to calculate
        </p>

        {/* Comparison: reference to existing calculation */}
        {latestCalculatedLabel && latestCalculatedTotal != null && (
          <p className="text-xs mt-1" style={{ color: 'var(--vl-text-soft)' }}>
            {latestCalculatedLabel} already calculated (
            <span style={{ fontFamily: 'var(--vl-font-mono)' }}>{formatCurrency(latestCalculatedTotal)}</span>
            )
          </p>
        )}

        {/* Context + Action: period list with buttons */}
        <div className="mt-4 space-y-2">
          {periods.map(p => (
            <div
              key={p.periodId}
              className="flex items-center justify-between px-4 py-2.5 rounded-md"
              style={{ background: 'var(--vl-bg)', border: '1px solid var(--vl-line)' }}
            >
              <div className="flex items-center gap-3">
                <Calculator className="h-4 w-4" style={{ color: 'var(--vl-text-soft)' }} />
                <span className="text-sm" style={{ color: 'var(--vl-text)' }}>{p.label}</span>
                <span className="text-xs" style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text-soft)' }}>
                  {p.dataRowCount} data rows
                </span>
              </div>
              <button onClick={() => onCalculate(p.periodId)} className="btn-calc">
                Calculate Now
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Impact */}
        <p className="mt-3 text-xs" style={{ color: 'var(--vl-text-soft)' }}>
          {nextCalcCount >= 2
            ? `Calculating adds trajectory intelligence across ${nextCalcCount} periods.`
            : 'Calculating produces results for review and reconciliation.'}
        </p>
      </IntelligenceCard>
    );
  }

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Action Required"
      elementId="action-required"
      fullWidth
      onView={onView}
      tier="action"
    >
      {/* Value */}
      <p className="text-lg font-semibold text-slate-100">
        {periods.length} period{periods.length !== 1 ? 's' : ''} ready to calculate
      </p>

      {/* Comparison: reference to existing calculation */}
      {latestCalculatedLabel && latestCalculatedTotal != null && (
        <p className="text-xs text-slate-500 mt-1">
          {latestCalculatedLabel} already calculated ({formatCurrency(latestCalculatedTotal)})
        </p>
      )}

      {/* Context + Action: period list with buttons */}
      <div className="mt-4 space-y-2">
        {periods.map(p => (
          <div
            key={p.periodId}
            className="flex items-center justify-between px-4 py-2.5 rounded-md bg-zinc-800/40 border border-zinc-800/60"
          >
            <div className="flex items-center gap-3">
              <Calculator className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-200">{p.label}</span>
              <span className="text-xs text-slate-500">{p.dataRowCount} data rows</span>
            </div>
            <button
              onClick={() => onCalculate(p.periodId)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors"
            >
              Calculate Now
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Impact */}
      <p className="mt-3 text-xs text-slate-500">
        {nextCalcCount >= 2
          ? `Calculating adds trajectory intelligence across ${nextCalcCount} periods.`
          : 'Calculating produces results for review and reconciliation.'}
      </p>
    </IntelligenceCard>
  );
}
