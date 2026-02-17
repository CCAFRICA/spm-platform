'use client';

/**
 * KPI Card Component
 *
 * Displays a single KPI metric with trend and target information.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Target,
  Wallet,
  Users,
  CheckCircle,
  BarChart3,
  Heart,
} from 'lucide-react';
import type { KPIMetric, MetricType } from '@/types/analytics';
import { useLocale } from '@/contexts/locale-context';
import { useCurrency } from '@/contexts/tenant-context';

interface KPICardProps {
  metric: KPIMetric;
  onClick?: () => void;
}

const ICON_MAP: Record<MetricType, React.ElementType> = {
  revenue: DollarSign,
  quota_attainment: Target,
  commission_paid: Wallet,
  headcount: Users,
  avg_deal_size: TrendingUp,
  win_rate: CheckCircle,
  pipeline_value: BarChart3,
  customer_retention: Heart,
};

const COLOR_MAP: Record<MetricType, string> = {
  revenue: 'text-emerald-600 bg-emerald-50',
  quota_attainment: 'text-blue-600 bg-blue-50',
  commission_paid: 'text-violet-600 bg-violet-50',
  headcount: 'text-amber-600 bg-amber-50',
  avg_deal_size: 'text-cyan-600 bg-cyan-50',
  win_rate: 'text-green-600 bg-green-50',
  pipeline_value: 'text-indigo-600 bg-indigo-50',
  customer_retention: 'text-rose-600 bg-rose-50',
};

export function KPICard({ metric, onClick }: KPICardProps) {
  const { locale } = useLocale();
  const { format: formatCurrency } = useCurrency();
  const isSpanish = locale === 'es-MX';

  const Icon = ICON_MAP[metric.id] || BarChart3;
  const colorClass = COLOR_MAP[metric.id] || 'text-zinc-400 bg-zinc-800/50';

  const formatValue = (value: number, format: string) => {
    if (format === 'currency') {
      return formatCurrency(value);
    }
    if (format === 'percent') {
      return `${value.toFixed(1)}%`;
    }
    return new Intl.NumberFormat(locale).format(value);
  };

  const TrendIcon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    metric.trend === 'up'
      ? 'text-green-600'
      : metric.trend === 'down'
        ? 'text-red-600'
        : 'text-gray-500';

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${onClick ? 'hover:border-primary' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span>{metric.changePercent > 0 ? '+' : ''}{metric.changePercent.toFixed(1)}%</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {isSpanish ? metric.nameEs : metric.name}
          </p>
          <p className="text-2xl font-bold">
            {formatValue(metric.value, metric.format)}
          </p>
        </div>

        {metric.target && metric.targetAttainment !== undefined && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{isSpanish ? 'vs Objetivo' : 'vs Target'}</span>
              <span>{metric.targetAttainment.toFixed(1)}%</span>
            </div>
            <Progress value={Math.min(metric.targetAttainment, 100)} className="h-1.5" />
          </div>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          {isSpanish ? 'Anterior' : 'Previous'}: {formatValue(metric.previousValue, metric.format)}
        </div>
      </CardContent>
    </Card>
  );
}
