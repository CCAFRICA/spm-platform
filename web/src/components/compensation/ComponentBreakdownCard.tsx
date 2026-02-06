'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  ChevronRight,
  Eye,
  Glasses,
  Store,
  Users,
  Wallet,
  Shield,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import type { CalculationResult } from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

interface ComponentBreakdownCardProps {
  result: CalculationResult;
  onViewDetails?: (componentId: string) => void;
}

const COMPONENT_ICONS: Record<string, React.ElementType> = {
  'optical': Glasses,
  'store': Store,
  'customers': Users,
  'collections': Wallet,
  'insurance': Shield,
  'services': Wrench,
};

const COMPONENT_COLORS: Record<string, string> = {
  'optical': 'bg-blue-500',
  'store': 'bg-green-500',
  'customers': 'bg-purple-500',
  'collections': 'bg-amber-500',
  'insurance': 'bg-pink-500',
  'services': 'bg-cyan-500',
};

function getComponentIcon(componentName: string): React.ElementType {
  const lowerName = componentName.toLowerCase();
  for (const [key, icon] of Object.entries(COMPONENT_ICONS)) {
    if (lowerName.includes(key)) return icon;
  }
  return HelpCircle;
}

function getComponentColor(componentName: string): string {
  const lowerName = componentName.toLowerCase();
  for (const [key, color] of Object.entries(COMPONENT_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return 'bg-gray-500';
}

export function ComponentBreakdownCard({ result, onViewDetails }: ComponentBreakdownCardProps) {
  const totalEarnings = result.totalIncentive;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Sort components by value descending
  const sortedComponents = [...result.components].sort((a, b) => b.outputValue - a.outputValue);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Earnings by Component</CardTitle>
            <CardDescription>
              How your {result.planName} compensation breaks down
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{formatCurrency(totalEarnings)}</div>
            <div className="text-xs text-muted-foreground">Total This Period</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stacked Bar Visualization */}
        <div className="h-8 rounded-full overflow-hidden flex mb-6">
          {sortedComponents.map((comp) => {
            const percentage = totalEarnings > 0 ? (comp.outputValue / totalEarnings) * 100 : 0;
            return (
              <div
                key={comp.componentId}
                className={cn('transition-all', getComponentColor(comp.componentName))}
                style={{ width: `${percentage}%` }}
                title={`${comp.componentName}: ${formatCurrency(comp.outputValue)}`}
              />
            );
          })}
        </div>

        {/* Component List */}
        <div className="space-y-3">
          {sortedComponents.map((comp) => {
            const Icon = getComponentIcon(comp.componentName);
            const percentage = totalEarnings > 0 ? (comp.outputValue / totalEarnings) * 100 : 0;
            const attainment = comp.inputs.attainment * 100;

            return (
              <div
                key={comp.componentId}
                className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => onViewDetails?.(comp.componentId)}
              >
                <div className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center text-white',
                  getComponentColor(comp.componentName)
                )}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-sm truncate">{comp.componentName}</div>
                    <div className="font-bold">{formatCurrency(comp.outputValue)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={attainment} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {attainment.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {percentage.toFixed(0)}% of total • {comp.componentType.replace('_', ' ')}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>

        {/* View Full Breakdown Link */}
        <div className="mt-4 pt-4 border-t">
          <Button variant="outline" className="w-full" onClick={() => onViewDetails?.('all')}>
            <Eye className="h-4 w-4 mr-2" />
            View Full Calculation Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
