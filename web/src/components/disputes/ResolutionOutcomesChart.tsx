'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle, XCircle, MinusCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/tenant-context';

interface OutcomeData {
  outcome: 'approved' | 'partial' | 'denied' | 'self_resolved';
  count: number;
  percentage: number;
  totalAmount: number;
}

interface ResolutionOutcomesChartProps {
  data: OutcomeData[];
  title?: string;
  description?: string;
}

const OUTCOME_CONFIG = {
  approved: {
    label: 'Approved',
    description: 'Full claim amount paid',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    barColor: 'bg-green-500',
  },
  partial: {
    label: 'Partial',
    description: 'Adjusted amount paid',
    icon: MinusCircle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    barColor: 'bg-amber-500',
  },
  denied: {
    label: 'Denied',
    description: 'No adjustment made',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    barColor: 'bg-red-500',
  },
  self_resolved: {
    label: 'Self-Resolved',
    description: 'Employee understood after explanation',
    icon: Sparkles,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    barColor: 'bg-blue-500',
  },
};

export function ResolutionOutcomesChart({
  data,
  title = 'Resolution Outcomes',
  description = 'How disputes were resolved',
}: ResolutionOutcomesChartProps) {
  const { format: formatCurrency } = useCurrency();
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const totalPaid = data.reduce((sum, d) => sum + d.totalAmount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Donut-style visualization using bars */}
        <div className="flex gap-1 h-4 rounded-full overflow-hidden mb-6">
          {data.map((item) => {
            const config = OUTCOME_CONFIG[item.outcome];
            return (
              <div
                key={item.outcome}
                className={cn('transition-all', config.barColor)}
                style={{ width: `${item.percentage}%` }}
                title={`${config.label}: ${item.count} (${item.percentage.toFixed(0)}%)`}
              />
            );
          })}
        </div>

        {/* Outcome Cards */}
        <div className="grid grid-cols-2 gap-3">
          {data.map((item) => {
            const config = OUTCOME_CONFIG[item.outcome];
            const Icon = config.icon;

            return (
              <div
                key={item.outcome}
                className={cn(
                  'p-4 rounded-lg border transition-colors hover:border-primary/50',
                  config.bgColor
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn('h-5 w-5', config.color)} />
                  <span className="font-medium">{config.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{item.count}</span>
                  <span className="text-sm text-muted-foreground">
                    ({item.percentage.toFixed(0)}%)
                  </span>
                </div>
                {item.totalAmount > 0 && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(item.totalAmount)} paid
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Total Resolved</div>
            <div className="text-xl font-bold">{total}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Total Adjustments</div>
            <div className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
