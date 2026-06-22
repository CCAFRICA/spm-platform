'use client';

/**
 * Impact Rating Badge
 *
 * Visual impact rating using design system tokens.
 * Uses gradient from cool blue to intense magenta — NOT stoplight colors.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { getImpactColor } from '@/lib/design-system/tokens';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocale , isSpanishLocale} from '@/contexts/locale-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

// ============================================
// TYPES
// ============================================

interface ImpactDimension {
  name: string;
  nameEs: string;
  score: number;
}

interface ImpactRatingBadgeProps {
  rating: number; // 1-10
  dimensions?: ImpactDimension[];
  size?: 'sm' | 'md' | 'lg' | 'inline';
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

// ============================================
// SIZE CONFIG
// ============================================

const SIZE_CONFIG = {
  sm: { badge: 'h-5 min-w-[20px] text-xs', padding: 'px-1.5' },
  md: { badge: 'h-6 min-w-[24px] text-sm', padding: 'px-2' },
  lg: { badge: 'h-8 min-w-[32px] text-base', padding: 'px-3' },
  inline: { badge: 'h-5 min-w-[18px] text-xs', padding: 'px-1' },
};

// ============================================
// LABELS
// ============================================

function getImpactLabel(rating: number, isSpanish: boolean): string {
  if (rating <= 3) return isSpanish ? 'Bajo' : 'Low';
  if (rating <= 5) return isSpanish ? 'Moderado' : 'Moderate';
  if (rating <= 7) return isSpanish ? 'Alto' : 'High';
  return isSpanish ? 'Crítico' : 'Critical';
}

function getImpactDescription(rating: number, isSpanish: boolean): string {
  if (rating <= 3) {
    return isSpanish
      ? 'Impacto limitado, puede proceder con precauciones estándar'
      : 'Limited impact, can proceed with standard precautions';
  }
  if (rating <= 5) {
    return isSpanish
      ? 'Impacto moderado, se recomienda revisión'
      : 'Moderate impact, review recommended';
  }
  if (rating <= 7) {
    return isSpanish
      ? 'Alto impacto, requiere aprobación cuidadosa'
      : 'High impact, requires careful approval';
  }
  return isSpanish
    ? 'Impacto crítico, requiere aprobación ejecutiva'
    : 'Critical impact, requires executive approval';
}

// ============================================
// COMPONENT
// ============================================

export function ImpactRatingBadge({
  rating,
  dimensions,
  size = 'md',
  showLabel = false,
  animated = true,
  className,
}: ImpactRatingBadgeProps) {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const isVialuce = useIsVialuce(); // HF-316: rating numbers → DM Mono, tracks → line (impact gradient kept intentional)

  const clampedRating = Math.max(1, Math.min(10, Math.round(rating)));
  const color = getImpactColor(clampedRating);
  const label = getImpactLabel(clampedRating, isSpanish);
  const description = getImpactDescription(clampedRating, isSpanish);
  const sizeConfig = SIZE_CONFIG[size];

  const badgeContent = (
    <motion.div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold text-white',
        sizeConfig.badge,
        sizeConfig.padding,
        className
      )}
      style={{ backgroundColor: color, ...(isVialuce ? { fontFamily: 'var(--vl-font-mono)' } : {}) }}
      initial={animated ? { scale: 0.8, opacity: 0 } : false}
      animate={animated ? { scale: 1, opacity: 1 } : false}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {clampedRating}
    </motion.div>
  );

  // If dimensions provided, show tooltip with breakdown
  if (dimensions && dimensions.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5">
              {badgeContent}
              {showLabel && (
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {label}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px]">
            <div className="space-y-2">
              <div>
                <p className="font-medium">{isSpanish ? 'Puntuación de Impacto' : 'Impact Score'}: <span style={isVialuce ? { fontFamily: 'var(--vl-font-mono)' } : undefined}>{clampedRating}/10</span></p>
                <p className="text-xs text-slate-400">{description}</p>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
                <p className="text-xs font-medium mb-1.5">
                  {isSpanish ? 'Desglose de Dimensiones' : 'Dimension Breakdown'}
                </p>
                <div className="space-y-1">
                  {dimensions.map((dim) => (
                    <div key={dim.name} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {isSpanish ? dim.nameEs : dim.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <div
                          className={cn('w-16 h-1.5 rounded-full overflow-hidden', !isVialuce && 'bg-slate-200 dark:bg-slate-700')}
                          style={isVialuce ? { background: 'var(--vl-line)' } : undefined}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${dim.score * 10}%`,
                              backgroundColor: getImpactColor(dim.score),
                            }}
                          />
                        </div>
                        <span className="w-4 text-right" style={isVialuce ? { fontFamily: 'var(--vl-font-mono)' } : undefined}>{dim.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Simple tooltip without dimensions
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5">
            {badgeContent}
            {showLabel && (
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {label}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-slate-400 max-w-[200px]">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Impact rating bar - horizontal visualization
 */
export function ImpactRatingBar({
  rating,
  showScale = false,
  className,
}: {
  rating: number;
  showScale?: boolean;
  className?: string;
}) {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const isVialuce = useIsVialuce(); // HF-316: track → line, rating number → DM Mono under Vialuce

  const clampedRating = Math.max(1, Math.min(10, rating));
  const label = getImpactLabel(clampedRating, isSpanish);

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{isSpanish ? 'Impacto' : 'Impact'}</span>
        <span className="font-medium">{label} <span style={isVialuce ? { fontFamily: 'var(--vl-font-mono)' } : undefined}>({clampedRating}/10)</span></span>
      </div>
      <div
        className={cn('h-2 rounded-full overflow-hidden', !isVialuce && 'bg-slate-200 dark:bg-slate-700')}
        style={isVialuce ? { background: 'var(--vl-line)' } : undefined}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: getImpactColor(clampedRating) }}
          initial={{ width: 0 }}
          animate={{ width: `${clampedRating * 10}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      {showScale && (
        <div className="flex justify-between text-[10px] text-slate-400" style={isVialuce ? { fontFamily: 'var(--vl-font-mono)' } : undefined}>
          <span>1</span>
          <span>5</span>
          <span>10</span>
        </div>
      )}
    </div>
  );
}

/**
 * Impact rating summary card
 */
export function ImpactRatingSummary({
  rating,
  dimensions,
  className,
}: {
  rating: number;
  dimensions: ImpactDimension[];
  className?: string;
}) {
  const { locale } = useLocale();
  const isSpanish = isSpanishLocale(locale);
  const isVialuce = useIsVialuce(); // HF-316: design-spec .card + DM Mono dim scores + line tracks under Vialuce

  const clampedRating = Math.max(1, Math.min(10, Math.round(rating)));
  const label = getImpactLabel(clampedRating, isSpanish);
  const description = getImpactDescription(clampedRating, isSpanish);

  if (isVialuce) {
    return (
      <div className={cn('card', className)} style={{ marginTop: 0 }}>
        <div className="flex items-start gap-4">
          <ImpactRatingBadge rating={rating} size="lg" />
          <div className="flex-1">
            <h4 style={{ fontWeight: 500, color: 'var(--vl-text)' }}>{label}</h4>
            <p style={{ fontSize: '13px', color: 'var(--vl-text-muted)' }}>{description}</p>
          </div>
        </div>
        {dimensions.length > 0 && (
          <div className="mt-4 pt-4 grid grid-cols-2 gap-3" style={{ borderTop: '1px solid var(--vl-line)' }}>
            {dimensions.map((dim) => (
              <div key={dim.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: 'var(--vl-text-muted)' }}>{isSpanish ? dim.nameEs : dim.name}</span>
                  <span style={{ fontWeight: 500, fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text)' }}>{dim.score}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--vl-line)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${dim.score * 10}%`,
                      backgroundColor: getImpactColor(dim.score),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('p-4 rounded-lg border border-slate-200 dark:border-slate-700', className)}>
      <div className="flex items-start gap-4">
        <ImpactRatingBadge rating={rating} size="lg" />
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 dark:text-slate-100">{label}</h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {dimensions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3">
          {dimensions.map((dim) => (
            <div key={dim.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">{isSpanish ? dim.nameEs : dim.name}</span>
                <span className="font-medium">{dim.score}</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${dim.score * 10}%`,
                    backgroundColor: getImpactColor(dim.score),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
