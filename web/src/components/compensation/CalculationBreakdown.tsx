'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ExternalLink, Info } from 'lucide-react';
import Link from 'next/link';
import type { CalculationResult, CalculationStep } from '@/types/compensation-plan';
import { LookupTableVisualization } from './LookupTableVisualization';
import { cn } from '@/lib/utils';

interface CalculationBreakdownProps {
  result: CalculationResult;
  showPlanLink?: boolean;
  compact?: boolean;
}

export function CalculationBreakdown({
  result,
  showPlanLink = false,
  compact = false,
}: CalculationBreakdownProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: result.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-4">
      {/* Plan Reference Card */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Info className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Compensation Plan</div>
                <div className="font-semibold">{result.planName}</div>
                <div className="text-xs text-muted-foreground">
                  Version {result.planVersion} • {result.variantName || 'Default Variant'}
                </div>
              </div>
            </div>
            {showPlanLink && (
              <Link href={`/performance/plans/${result.planId}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <ExternalLink className="h-3 w-3" />
                  View Plan
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Component Cards */}
      <div className={cn('space-y-3', compact && 'space-y-2')}>
        {result.components.map((step) => (
          <ComponentCard
            key={step.componentId}
            step={step}
            compact={compact}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
          />
        ))}
      </div>

      {/* Total Card */}
      <Card className="border-2 border-primary">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Total Incentive</div>
              <div className="text-xs text-muted-foreground">
                {result.period} ({result.periodStart} - {result.periodEnd})
              </div>
            </div>
            <div className="text-3xl font-bold text-primary">
              {formatCurrency(result.totalIncentive)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {result.warnings && result.warnings.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Calculation Notes
            </div>
            <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside">
              {result.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ComponentCardProps {
  step: CalculationStep;
  compact: boolean;
  formatCurrency: (value: number) => string;
  formatPercent: (value: number) => string;
}

function ComponentCard({ step, compact, formatCurrency, formatPercent }: ComponentCardProps) {
  const attainmentPercent = step.inputs.attainment * 100;
  const isZero = step.outputValue === 0;

  return (
    <Card className={cn(isZero && 'opacity-60')}>
      <CardHeader className={cn('pb-2', compact && 'p-3 pb-1')}>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className={cn('text-base', compact && 'text-sm')}>
              {step.componentName}
            </CardTitle>
            {!compact && (
              <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
            )}
          </div>
          <div className="text-right">
            <div className={cn('font-bold', compact ? 'text-lg' : 'text-xl', isZero && 'text-muted-foreground')}>
              {formatCurrency(step.outputValue)}
            </div>
            <Badge variant="outline" className="text-xs capitalize">
              {step.componentType.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn(compact && 'p-3 pt-0')}>
        {/* Attainment Bar */}
        {step.inputs.target > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Attainment</span>
              <span className={cn(
                'font-medium',
                attainmentPercent >= 100 ? 'text-green-600' : 'text-yellow-600'
              )}>
                {formatPercent(step.inputs.attainment)}
              </span>
            </div>
            <Progress
              value={Math.min(attainmentPercent, 150)}
              max={150}
              className="h-2"
            />
          </div>
        )}

        {/* Lookup Visualization */}
        {(step.componentType === 'matrix_lookup' || step.componentType === 'tier_lookup') && (
          <LookupTableVisualization step={step} compact={compact} />
        )}

        {/* Calculation Formula */}
        {!compact && (
          <div className="mt-3 p-2 bg-muted/50 rounded text-sm font-mono">
            {step.calculation}
          </div>
        )}

        {/* Additional Factors */}
        {step.inputs.additionalFactors && Object.keys(step.inputs.additionalFactors).length > 0 && !compact && (
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(step.inputs.additionalFactors).map(([key, value]) => (
              <Badge key={key} variant="secondary" className="text-xs">
                {key.replace(/_/g, ' ')}: {typeof value === 'number' && value > 1000
                  ? `$${value.toLocaleString()}`
                  : value}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
