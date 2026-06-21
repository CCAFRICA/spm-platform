'use client';

/**
 * OB-227 — PeriodSelector. The single Insights period control, fed by getCalculatedPeriods
 * (canonical periods table source, start_date DESC — Decision 92/93). Labels and lifecycle badges
 * come from the data (Korean Test). Same source of truth as /configure/periods.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { PeriodSummary } from '@/lib/insights';

interface PeriodSelectorProps {
  periods: PeriodSummary[];
  selectedPeriodId: string;
  onPeriodChange: (id: string) => void;
  className?: string;
}

export function PeriodSelector({ periods, selectedPeriodId, onPeriodChange, className }: PeriodSelectorProps) {
  if (periods.length === 0) return null;
  const selected = periods.find(p => p.period_id === selectedPeriodId) ?? periods[0];

  return (
    <div className={className}>
      <Select value={selected.period_id} onValueChange={onPeriodChange}>
        <SelectTrigger className="w-[220px]" aria-label="Select period">
          <SelectValue>
            <span className="flex items-center gap-2">
              <span className="font-medium">{selected.label}</span>
              {selected.lifecycle_state && (
                <Badge variant="outline" className="text-[10px] uppercase">{selected.lifecycle_state}</Badge>
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {periods.map(p => (
            <SelectItem key={p.period_id} value={p.period_id}>
              <span className="flex items-center justify-between gap-3 w-full">
                <span>{p.label}</span>
                {p.lifecycle_state && (
                  <Badge variant="outline" className="text-[10px] uppercase">{p.lifecycle_state}</Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
