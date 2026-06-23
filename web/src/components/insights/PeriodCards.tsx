'use client';

/**
 * OB-322 — PeriodCards. The shared Insights period control rendered as a horizontal strip of
 * selectable cards (label · total payout · entities · lifecycle badge) instead of a dropdown,
 * so every period's outcome scale is visible at a glance and selection is one click. Same data
 * source as PeriodSelector (getCalculatedPeriods → PeriodSummary[], start_date DESC). Korean
 * Test: labels and lifecycle states come from the data.
 */
import { useCurrency } from '@/contexts/tenant-context';
import { Badge } from '@/components/ui/badge';
import type { PeriodSummary } from '@/lib/insights';

interface PeriodCardsProps {
  periods: PeriodSummary[];
  selectedPeriodId: string;
  onPeriodChange: (id: string) => void;
  className?: string;
}

export function PeriodCards({ periods, selectedPeriodId, onPeriodChange, className }: PeriodCardsProps) {
  const { format } = useCurrency();
  if (periods.length === 0) return null;
  const selected = periods.find((p) => p.period_id === selectedPeriodId)?.period_id ?? periods[0].period_id;

  return (
    <div className={`flex gap-3 overflow-x-auto pb-1 ${className ?? ''}`} role="tablist" aria-label="Select period">
      {periods.map((p) => {
        const active = p.period_id === selected;
        return (
          <button
            key={p.period_id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onPeriodChange(p.period_id)}
            className={`shrink-0 min-w-[160px] rounded-lg border px-4 py-3 text-left transition-colors ${
              active
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border bg-card hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-semibold truncate">{p.label}</span>
              {p.lifecycle_state && (
                <Badge variant="outline" className="text-[9px] uppercase shrink-0">{p.lifecycle_state}</Badge>
              )}
            </div>
            <div className="text-lg font-bold tabular-nums">{format(p.total_payout)}</div>
            <div className="text-xs text-muted-foreground">{p.entity_count} {p.entity_count === 1 ? 'entity' : 'entities'}</div>
          </button>
        );
      })}
    </div>
  );
}
