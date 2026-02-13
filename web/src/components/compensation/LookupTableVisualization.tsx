'use client';

import type { CalculationStep } from '@/types/compensation-plan';
import { useCurrency } from '@/contexts/tenant-context';
import { cn } from '@/lib/utils';

interface LookupTableVisualizationProps {
  step: CalculationStep;
  compact?: boolean;
}

export function LookupTableVisualization({ step, compact = false }: LookupTableVisualizationProps) {
  if (step.componentType === 'matrix_lookup' && step.lookupDetails?.tableType === 'matrix') {
    return <MatrixVisualization step={step} compact={compact} />;
  }

  if (step.componentType === 'tier_lookup' && step.lookupDetails?.tableType === 'tier') {
    return <TierVisualization step={step} compact={compact} />;
  }

  return null;
}

interface MatrixVisualizationProps {
  step: CalculationStep;
  compact: boolean;
}

function MatrixVisualization({ step, compact }: MatrixVisualizationProps) {
  const { format: formatCurrency } = useCurrency();
  const { lookupDetails } = step;
  if (!lookupDetails) return null;

  // Sample matrix data for visualization
  // In production, this would come from the plan configuration
  const rowLabels = ['< 80%', '80-90%', '90-100%', '100-110%', '> 110%'];
  const colLabels = ['< $120K', '$120-150K', '$150-180K', '$180-210K', '> $210K'];
  const values = [
    [0, 0, 0, 0, 0],
    [500, 750, 1000, 1250, 1500],
    [750, 1000, 1250, 1500, 1750],
    [1000, 1250, 1500, 1750, 2000],
    [1250, 1500, 1750, 2000, 2500],
  ];

  const matchedRowIndex = rowLabels.findIndex((l) => l === lookupDetails.rowBand);
  const matchedColIndex = colLabels.findIndex((l) => l === lookupDetails.colBand);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Lookup:</span>
        <span className="font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
          {lookupDetails.rowBand}
        </span>
        <span className="text-muted-foreground">×</span>
        <span className="font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
          {lookupDetails.colBand}
        </span>
        <span className="text-muted-foreground">→</span>
        <span className="font-bold text-green-600">
          {formatCurrency(lookupDetails.foundValue)}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="text-xs text-muted-foreground mb-2">Lookup Table</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="p-1.5 text-left bg-muted/50 border font-medium">
                Attainment ↓ / Volume →
              </th>
              {colLabels.map((label, i) => (
                <th
                  key={i}
                  className={cn(
                    'p-1.5 text-center border font-medium min-w-[70px]',
                    i === matchedColIndex
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted/50'
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((rowLabel, rowIndex) => (
              <tr key={rowIndex}>
                <td
                  className={cn(
                    'p-1.5 border font-medium',
                    rowIndex === matchedRowIndex
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted/30'
                  )}
                >
                  {rowLabel}
                </td>
                {colLabels.map((_, colIndex) => {
                  const isMatch = rowIndex === matchedRowIndex && colIndex === matchedColIndex;
                  const value = values[rowIndex]?.[colIndex] ?? 0;

                  return (
                    <td
                      key={colIndex}
                      className={cn(
                        'p-1.5 text-center border',
                        isMatch
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-bold ring-2 ring-green-500 ring-inset'
                          : rowIndex === matchedRowIndex || colIndex === matchedColIndex
                          ? 'bg-primary/5'
                          : ''
                      )}
                    >
                      {formatCurrency(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-center text-muted-foreground">
        Your result: <span className="font-semibold text-green-600">{formatCurrency(lookupDetails.foundValue)}</span>
      </div>
    </div>
  );
}

interface TierVisualizationProps {
  step: CalculationStep;
  compact: boolean;
}

function TierVisualization({ step, compact }: TierVisualizationProps) {
  const { format: formatCurrency } = useCurrency();
  const { lookupDetails, inputs } = step;
  if (!lookupDetails) return null;

  // Sample tier data for visualization
  // In production, this would come from the plan configuration
  const tiers = getTiersForComponent(step.componentId);
  const matchedTierIndex = tiers.findIndex((t) => t.label === lookupDetails.tierLabel);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Tier:</span>
        <span className="font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
          {lookupDetails.tierLabel}
        </span>
        <span className="text-muted-foreground">→</span>
        <span className="font-bold text-green-600">
          {formatCurrency(lookupDetails.foundValue)}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="text-xs text-muted-foreground mb-2">
        Tier Lookup ({(inputs.actual).toFixed(1)}% attainment)
      </div>
      <div className="space-y-1">
        {tiers.map((tier, index) => {
          const isMatch = index === matchedTierIndex;
          const isBelow = index < matchedTierIndex;

          return (
            <div
              key={index}
              className={cn(
                'flex items-center justify-between p-2 rounded border',
                isMatch
                  ? 'bg-green-100 dark:bg-green-900/40 border-green-500 ring-1 ring-green-500'
                  : isBelow
                  ? 'bg-muted/30 text-muted-foreground'
                  : 'bg-background'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-3 h-3 rounded-full',
                    isMatch
                      ? 'bg-green-500'
                      : isBelow
                      ? 'bg-green-300'
                      : 'bg-muted'
                  )}
                />
                <span className={cn('text-sm', isMatch && 'font-medium')}>
                  {tier.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({tier.range})
                </span>
              </div>
              <span className={cn(
                'font-semibold',
                isMatch ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'
              )}>
                {formatCurrency(tier.value)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-center text-muted-foreground">
        Your result: <span className="font-semibold text-green-600">{formatCurrency(lookupDetails.foundValue)}</span>
      </div>
    </div>
  );
}

// Helper to get tier data for different components
function getTiersForComponent(componentId: string) {
  switch (componentId) {
    case 'comp-store':
      return [
        { label: '< 90%', range: '0-89.99%', value: 0 },
        { label: '90-95%', range: '90-94.99%', value: 200 },
        { label: '95-100%', range: '95-99.99%', value: 350 },
        { label: '100-105%', range: '100-104.99%', value: 500 },
        { label: '> 105%', range: '105%+', value: 750 },
      ];
    case 'comp-customers':
      return [
        { label: '< 90%', range: '0-89.99%', value: 0 },
        { label: '90-100%', range: '90-99.99%', value: 150 },
        { label: '100-110%', range: '100-109.99%', value: 250 },
        { label: '> 110%', range: '110%+', value: 400 },
      ];
    case 'comp-collections':
      return [
        { label: '< 95%', range: '0-94.99%', value: 0 },
        { label: '95-98%', range: '95-97.99%', value: 100 },
        { label: '98-100%', range: '98-99.99%', value: 200 },
        { label: '100%', range: '100%+', value: 350 },
      ];
    default:
      return [
        { label: 'Tier 1', range: '0-50%', value: 0 },
        { label: 'Tier 2', range: '50-100%', value: 100 },
        { label: 'Tier 3', range: '100%+', value: 200 },
      ];
  }
}
