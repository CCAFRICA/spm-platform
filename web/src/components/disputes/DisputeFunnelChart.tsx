'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FunnelStep {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

interface DisputeFunnelChartProps {
  steps: FunnelStep[];
  title?: string;
  description?: string;
}

export function DisputeFunnelChart({
  steps,
  title = 'Dispute Resolution Funnel',
  description = 'How disputes flow through the self-service system',
}: DisputeFunnelChartProps) {
  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{step.label}</span>
                <span className="text-muted-foreground">
                  {step.count} ({step.percentage.toFixed(0)}%)
                </span>
              </div>
              <div className="relative h-10 bg-muted rounded-lg overflow-hidden">
                <div
                  className={cn('h-full rounded-lg transition-all duration-500', step.color)}
                  style={{ width: `${(step.count / maxCount) * 100}%` }}
                />
                {index < steps.length - 1 && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {steps[index + 1] && steps[index].count > 0
                      ? `${(((steps[index].count - steps[index + 1].count) / steps[index].count) * 100).toFixed(0)}% resolved`
                      : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-green-500" />
              <span className="text-muted-foreground">Self-Resolved (No manager action needed)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-blue-500" />
              <span className="text-muted-foreground">Escalated to Manager</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
