'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Users,
} from 'lucide-react';
import type { CalculationResult } from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

interface ScenarioComparisonProps {
  baseline: CalculationResult;
  scenario: CalculationResult;
  employeeName: string;
  scenarioName: string;
}

export function ScenarioComparison({
  baseline,
  scenario,
  employeeName,
  scenarioName,
}: ScenarioComparisonProps) {
  const difference = scenario.totalIncentive - baseline.totalIncentive;
  const percentChange = baseline.totalIncentive > 0
    ? ((difference / baseline.totalIncentive) * 100)
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="h-4 w-4 text-green-600" />;
    if (change < 0) return <ArrowDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {employeeName}
            </CardTitle>
            <CardDescription>Impact analysis for {scenarioName}</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              difference > 0 && 'border-green-500 text-green-600',
              difference < 0 && 'border-red-500 text-red-600',
              difference === 0 && 'border-muted text-muted-foreground'
            )}
          >
            {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Total Comparison */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 mb-6">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-1">Current Plan</div>
            <div className="text-2xl font-bold">{formatCurrency(baseline.totalIncentive)}</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-1">With Changes</div>
            <div className={cn('text-2xl font-bold', getChangeColor(difference))}>
              {formatCurrency(scenario.totalIncentive)}
            </div>
          </div>
          <div className="text-center pl-4 border-l">
            <div className="text-sm text-muted-foreground mb-1">Change</div>
            <div className={cn('text-xl font-bold flex items-center gap-1', getChangeColor(difference))}>
              {getChangeIcon(difference)}
              {Math.abs(percentChange).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Component-by-Component Breakdown */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">Component Changes</h4>
          {baseline.components.map((baseComp) => {
            const scenarioComp = scenario.components.find((s) => s.componentId === baseComp.componentId);
            if (!scenarioComp) return null;

            const compDiff = scenarioComp.outputValue - baseComp.outputValue;

            return (
              <div
                key={baseComp.componentId}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{baseComp.componentName}</div>
                  <div className="text-xs text-muted-foreground">
                    {baseComp.componentType}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">
                      {formatCurrency(baseComp.outputValue)}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="text-right min-w-[80px]">
                    <div className={cn('font-medium', getChangeColor(compDiff))}>
                      {formatCurrency(scenarioComp.outputValue)}
                    </div>
                    {compDiff !== 0 && (
                      <div className={cn('text-xs flex items-center justify-end gap-1', getChangeColor(compDiff))}>
                        {getChangeIcon(compDiff)}
                        {compDiff >= 0 ? '+' : ''}{formatCurrency(compDiff)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
