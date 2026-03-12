'use client';

/**
 * ComponentBreakdownCard — Individual stacked bar (Intelligence Stream version)
 *
 * Shows component breakdown using horizontal stacked bar segments.
 * Each component colored from COMPONENT_PALETTE. Amount and percentage labels.
 * Legend below the bar.
 *
 * Note: This is the Intelligence Stream card version, distinct from the
 * existing compensation/ComponentBreakdownCard which is a full card+table.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { IntelligenceCard } from './IntelligenceCard';

interface BreakdownComponent {
  name: string;
  amount: number;
  pctOfTotal: number;
  color: string; // hex color from COMPONENT_PALETTE
}

interface ComponentBreakdownCardProps {
  accentColor: string;
  components: BreakdownComponent[];
  formatCurrency: (n: number) => string;
  onView?: () => void;
}

export function ComponentBreakdownCard({
  accentColor,
  components,
  formatCurrency,
  onView,
}: ComponentBreakdownCardProps) {
  if (components.length === 0) return null;

  const total = components.reduce((sum, c) => sum + c.amount, 0);

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Component Breakdown"
      elementId="component-breakdown"
      onView={onView}
    >
      {/* Total */}
      <p className="text-xl font-bold text-slate-100 mb-3">
        {formatCurrency(total)}
      </p>

      {/* Horizontal stacked bar */}
      <div className="h-6 rounded-md overflow-hidden flex bg-zinc-800">
        {components.map(comp => {
          const widthPct = total > 0 ? (comp.amount / total) * 100 : 0;
          if (widthPct < 0.5) return null; // skip negligible segments
          return (
            <div
              key={comp.name}
              className="h-full transition-all duration-500 relative group"
              style={{
                width: `${widthPct}%`,
                backgroundColor: comp.color,
                opacity: 0.8,
              }}
              title={`${comp.name}: ${formatCurrency(comp.amount)} (${comp.pctOfTotal.toFixed(0)}%)`}
            >
              {/* Show percentage on hover for wider segments */}
              {widthPct >= 12 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white/90">
                  {comp.pctOfTotal.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {components.map(comp => (
          <div key={comp.name} className="flex items-center gap-2 min-w-0">
            <span
              className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: comp.color }}
            />
            <span className="text-xs text-slate-400 truncate flex-1">
              {comp.name}
            </span>
            <span className="text-xs text-slate-300 font-medium flex-shrink-0">
              {formatCurrency(comp.amount)}
            </span>
          </div>
        ))}
      </div>
    </IntelligenceCard>
  );
}
