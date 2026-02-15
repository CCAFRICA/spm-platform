'use client';

/**
 * Impact Rating Badge Component
 *
 * Reusable component for displaying Impact Rating across the platform.
 */

import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ImpactRating } from '@/lib/approval-routing/types';
import { useLocale } from '@/contexts/locale-context';

interface ImpactRatingBadgeProps {
  rating: ImpactRating | number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string;
}

export function ImpactRatingBadge({
  rating,
  size = 'md',
  showLabel = true,
  showTooltip = true,
  className,
}: ImpactRatingBadgeProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const value = typeof rating === 'number' ? rating : rating.overall;
  const dimensions = typeof rating === 'number' ? null : rating.dimensions;

  const getColorClass = (score: number): string => {
    if (score >= 9) return 'bg-red-600 text-white';
    if (score >= 7) return 'bg-orange-500 text-white';
    if (score >= 4) return 'bg-yellow-500 text-black';
    return 'bg-green-500 text-white';
  };

  const getLabel = (score: number): string => {
    if (score >= 9) return isSpanish ? 'Crítico' : 'Critical';
    if (score >= 7) return isSpanish ? 'Alto' : 'High';
    if (score >= 4) return isSpanish ? 'Medio' : 'Medium';
    return isSpanish ? 'Bajo' : 'Low';
  };

  const sizeClasses = {
    sm: 'h-5 w-5 text-xs',
    md: 'h-7 w-7 text-sm',
    lg: 'h-9 w-9 text-base',
  };

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const badge = (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-bold',
          getColorClass(value),
          sizeClasses[size]
        )}
      >
        {value.toFixed(0)}
      </div>
      {showLabel && (
        <span
          className={cn('font-medium text-muted-foreground', labelSizeClasses[size])}
        >
          {getLabel(value)}
        </span>
      )}
    </div>
  );

  if (!showTooltip || !dimensions) {
    return badge;
  }

  const dimensionLabels = {
    financial: isSpanish ? 'Financiero' : 'Financial',
    entityCount: isSpanish ? 'Empleados' : 'Employees',
    periodStatus: isSpanish ? 'Estado del Período' : 'Period Status',
    cascadeScope: isSpanish ? 'Alcance Derivado' : 'Cascade Scope',
    timelineSensitivity: isSpanish ? 'Urgencia' : 'Timeline',
    regulatoryRisk: isSpanish ? 'Riesgo Regulatorio' : 'Regulatory Risk',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="p-3">
          <div className="space-y-2">
            <div className="font-semibold">
              {isSpanish ? 'Desglose de Impacto' : 'Impact Breakdown'}
            </div>
            <div className="space-y-1">
              {Object.entries(dimensions).map(([key, score]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">
                    {dimensionLabels[key as keyof typeof dimensionLabels]}
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', getColorClass(score))}
                        style={{ width: `${(score / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-4">{score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Mini version for inline use
 */
export function ImpactRatingDot({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  const getColorClass = (score: number): string => {
    if (score >= 9) return 'bg-red-600';
    if (score >= 7) return 'bg-orange-500';
    if (score >= 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div
      className={cn('h-2.5 w-2.5 rounded-full', getColorClass(rating), className)}
      title={`Impact: ${rating.toFixed(1)}`}
    />
  );
}
