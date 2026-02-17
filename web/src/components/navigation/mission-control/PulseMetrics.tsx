'use client';

/**
 * Pulse Metrics Component
 *
 * Displays role-aware key metrics in Mission Control.
 */

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePulse, useCycleState } from '@/contexts/navigation-context';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { formatMetricValue, getTrendArrow, getTrendColor, getPrimaryMetric } from '@/lib/navigation/pulse-service';
import { logPulseClick } from '@/lib/navigation/navigation-signals';
import type { PulseMetric } from '@/types/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface PulseMetricsProps {
  collapsed?: boolean;
}

export function PulseMetrics({ collapsed = false }: PulseMetricsProps) {
  const router = useRouter();
  const { metrics, isSpanish } = usePulse();
  const { cycleState } = useCycleState();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const currency = currentTenant?.currency || 'USD';

  const handleMetricClick = (metric: PulseMetric) => {
    if (!metric.route) return;

    if (user && currentTenant) {
      logPulseClick(metric.id, user.id, currentTenant.id);
    }
    router.push(metric.route);
  };

  const TrendIcon = ({ trend }: { trend?: 'up' | 'down' | 'flat' }) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3 w-3" />;
      case 'down':
        return <TrendingDown className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  // Empty state - no metrics available (clock service returned none)
  if (metrics.length === 0) {
    // If we have cycle state, we know the system is loaded but no metrics exist yet
    if (cycleState) {
      return (
        <div className="px-3 py-4">
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {isSpanish ? 'El Pulso' : 'The Pulse'}
            </h3>
          </div>
          <div className="text-center py-4">
            <Activity className="h-6 w-6 mx-auto mb-2 text-zinc-500" />
            <p className="text-xs text-zinc-400">
              {isSpanish ? 'Sin metricas aun' : 'No metrics yet'}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">
              {isSpanish ? 'Ejecute calculos para ver metricas' : 'Run calculations to see metrics'}
            </p>
          </div>
        </div>
      );
    }
    // Still loading - show skeleton
    return (
      <div className="px-3 py-4">
        <div className="animate-pulse space-y-3">
          <div className="h-3 bg-zinc-700 rounded w-16" />
          <div className="h-12 bg-zinc-700 rounded" />
          <div className="h-12 bg-zinc-700 rounded" />
        </div>
      </div>
    );
  }

  // Collapsed view - show primary metric only
  if (collapsed) {
    const primary = getPrimaryMetric(metrics);
    if (!primary) return null;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => handleMetricClick(primary)}
              className="w-full flex flex-col items-center py-3 px-2 hover:bg-zinc-800/50 rounded-lg transition-colors"
            >
              <span className="text-lg font-bold text-zinc-200">
                {formatMetricValue(primary.value, primary.format, currency)}
              </span>
              {primary.trend && (
                <span className={cn('text-[10px]', getTrendColor(primary.trend))}>
                  {getTrendArrow(primary.trend)}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-sm">
              <p className="font-medium">{isSpanish ? primary.labelEs : primary.label}</p>
              {primary.trend && (
                <p className={cn('text-xs', getTrendColor(primary.trend))}>
                  {isSpanish ? primary.trendValueEs : primary.trendValue}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view - show all metrics
  return (
    <div className="px-3 py-4">
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {isSpanish ? 'El Pulso' : 'The Pulse'}
        </h3>
      </div>

      <div className="space-y-2">
        {metrics.map(metric => (
          <button
            key={metric.id}
            onClick={() => handleMetricClick(metric)}
            disabled={!metric.route}
            className={cn(
              'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left',
              metric.route ? 'hover:bg-zinc-800/50 cursor-pointer' : 'cursor-default'
            )}
          >
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 truncate">
                {isSpanish ? metric.labelEs : metric.label}
              </p>
              <p className="text-lg font-semibold text-zinc-200">
                {formatMetricValue(metric.value, metric.format, currency)}
              </p>
            </div>

            {metric.trend && (
              <div className={cn('flex items-center gap-1', getTrendColor(metric.trend))}>
                <TrendIcon trend={metric.trend} />
                <span className="text-[10px] whitespace-nowrap">
                  {isSpanish ? metric.trendValueEs : metric.trendValue}
                </span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
