'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  TrendingDown,
  TrendingUp,
  Clock,
  CheckCircle,
  Users,
  Target,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCard {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  icon: React.ReactNode;
  color: string;
}

interface DisputeMetricsCardsProps {
  metrics: {
    totalDisputes: number;
    selfResolutionRate: number;
    avgResolutionTime: number; // in hours
    managerWorkloadReduction: number;
    pendingCount: number;
    resolvedThisMonth: number;
  };
}

export function DisputeMetricsCards({ metrics }: DisputeMetricsCardsProps) {
  const cards: MetricCard[] = [
    {
      title: 'Self-Resolution Rate',
      value: `${metrics.selfResolutionRate.toFixed(0)}%`,
      subtitle: 'Resolved without manager',
      trend: {
        value: 12,
        label: 'vs last month',
        isPositive: true,
      },
      icon: <Target className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Manager Time Saved',
      value: `${metrics.managerWorkloadReduction}%`,
      subtitle: 'Workload reduction',
      trend: {
        value: 8,
        label: 'vs last month',
        isPositive: true,
      },
      icon: <TrendingDown className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Avg Resolution Time',
      value: metrics.avgResolutionTime < 24
        ? `${metrics.avgResolutionTime.toFixed(0)}h`
        : `${(metrics.avgResolutionTime / 24).toFixed(1)}d`,
      subtitle: 'From submission to resolution',
      trend: {
        value: 15,
        label: 'faster than before',
        isPositive: true,
      },
      icon: <Clock className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Pending Review',
      value: metrics.pendingCount,
      subtitle: 'Awaiting manager action',
      icon: <Users className="h-5 w-5" />,
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    },
    {
      title: 'Resolved This Month',
      value: metrics.resolvedThisMonth,
      subtitle: 'Total resolutions',
      trend: {
        value: 5,
        label: 'vs last month',
        isPositive: true,
      },
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      title: 'Total Disputes',
      value: metrics.totalDisputes,
      subtitle: 'All time',
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-slate-600 bg-slate-100 dark:bg-slate-900/30',
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-3xl font-bold">{card.value}</p>
                {card.subtitle && (
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                )}
                {card.trend && (
                  <div
                    className={cn(
                      'flex items-center gap-1 text-xs font-medium',
                      card.trend.isPositive ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {card.trend.isPositive ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {card.trend.value}% {card.trend.label}
                  </div>
                )}
              </div>
              <div className={cn('p-3 rounded-lg', card.color)}>
                {card.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
