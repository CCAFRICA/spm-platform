'use client';

/**
 * OB-227 — InsightsLayout. Shared Insights page shell: a controls bar (PeriodSelector + optional
 * page controls) above the content area. AP-17: every Insights page composes this same layout.
 */
import type { ReactNode } from 'react';
import { PeriodSelector } from './PeriodSelector';
import type { PeriodSummary } from '@/lib/insights';

interface InsightsLayoutProps {
  title?: string;
  description?: string;
  periods: PeriodSummary[];
  selectedPeriodId: string;
  onPeriodChange: (id: string) => void;
  /** hide the period selector (e.g. Trends shows all periods) */
  hidePeriodSelector?: boolean;
  controls?: ReactNode;
  children: ReactNode;
}

export function InsightsLayout({
  title, description, periods, selectedPeriodId, onPeriodChange, hidePeriodSelector, controls, children,
}: InsightsLayoutProps) {
  return (
    <div className="space-y-5">
      {(title || !hidePeriodSelector || controls) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {title && (
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          )}
          <div className="flex items-center gap-2">
            {controls}
            {!hidePeriodSelector && (
              <PeriodSelector periods={periods} selectedPeriodId={selectedPeriodId} onPeriodChange={onPeriodChange} />
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
