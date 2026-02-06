'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DisputeCategory } from '@/types/dispute';
import { DISPUTE_CATEGORIES } from '@/types/dispute';
import { cn } from '@/lib/utils';

interface CategoryData {
  category: DisputeCategory;
  count: number;
  percentage: number;
  resolved: number;
  pending: number;
}

interface DisputeCategoryChartProps {
  data: CategoryData[];
  title?: string;
  description?: string;
}

const CATEGORY_COLORS: Record<DisputeCategory, string> = {
  wrong_attribution: 'bg-orange-500',
  missing_transaction: 'bg-blue-500',
  incorrect_amount: 'bg-purple-500',
  wrong_rate: 'bg-pink-500',
  split_error: 'bg-cyan-500',
  timing_issue: 'bg-amber-500',
  other: 'bg-gray-500',
};

export function DisputeCategoryChart({
  data,
  title = 'Disputes by Category',
  description = 'Distribution of dispute types',
}: DisputeCategoryChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const sortedData = [...data].sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Stacked Bar */}
        <div className="h-8 rounded-lg overflow-hidden flex mb-6">
          {sortedData.map((item) => (
            <div
              key={item.category}
              className={cn('transition-all', CATEGORY_COLORS[item.category])}
              style={{ width: `${item.percentage}%` }}
              title={`${DISPUTE_CATEGORIES[item.category].label}: ${item.count}`}
            />
          ))}
        </div>

        {/* Legend & Details */}
        <div className="space-y-3">
          {sortedData.map((item) => (
            <div
              key={item.category}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn('h-4 w-4 rounded', CATEGORY_COLORS[item.category])} />
                <div>
                  <div className="font-medium text-sm">
                    {DISPUTE_CATEGORIES[item.category].label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {DISPUTE_CATEGORIES[item.category].description}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-bold">{item.count}</div>
                  <div className="text-xs text-muted-foreground">{item.percentage.toFixed(0)}%</div>
                </div>
                <div className="flex gap-1">
                  {item.resolved > 0 && (
                    <Badge variant="outline" className="text-green-600 border-green-300">
                      {item.resolved} resolved
                    </Badge>
                  )}
                  {item.pending > 0 && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      {item.pending} pending
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="mt-4 pt-4 border-t flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Disputes</span>
          <span className="text-xl font-bold">{total}</span>
        </div>
      </CardContent>
    </Card>
  );
}
