'use client';

/**
 * Confidence Ring
 *
 * Reusable confidence visualization used in hierarchy nodes, import records, approval cards.
 * SVG ring that fills proportionally to confidence score.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { getConfidenceLevel, STATE_TOKENS } from '@/lib/design-system/tokens';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocale } from '@/contexts/locale-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

// HF-316: design-spec ring fill — indigo ramp for high, gold for medium, slate for low/unknown.
const VIALUCE_RING_COLOR: Record<'high' | 'medium' | 'low' | 'unknown', string> = {
  high: 'var(--vl-raw-indigo)',
  medium: 'var(--vl-raw-gold)',
  low: 'var(--vl-raw-slate)',
  unknown: 'var(--vl-line)',
};

// ============================================
// TYPES
// ============================================

interface ConfidenceRingProps {
  score: number; // 0-100
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showScore?: boolean;
  animated?: boolean;
  className?: string;
}

// ============================================
// SIZE CONFIG
// ============================================

const SIZE_CONFIG = {
  sm: { dimension: 16, stroke: 2, fontSize: 'text-[8px]' },
  md: { dimension: 24, stroke: 3, fontSize: 'text-[10px]' },
  lg: { dimension: 32, stroke: 4, fontSize: 'text-xs' },
  xl: { dimension: 48, stroke: 5, fontSize: 'text-sm' },
};

// ============================================
// COMPONENT
// ============================================

export function ConfidenceRing({
  score,
  size = 'md',
  showScore = false,
  animated = true,
  className,
}: ConfidenceRingProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const isVialuce = useIsVialuce(); // HF-316: indigo/gold ring ramp + line track + DM Mono score under Vialuce

  const sizeConfig = SIZE_CONFIG[size];
  const clampedScore = Math.max(0, Math.min(100, score));
  const fillPercent = clampedScore / 100;

  const level = getConfidenceLevel(clampedScore);
  const levelConfig = STATE_TOKENS.confidence[level];
  const label = isSpanish ? levelConfig.labelEs : levelConfig.label;

  const radius = (sizeConfig.dimension - sizeConfig.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fillPercent);

  // Color based on confidence level
  const ringColors = {
    high: 'text-emerald-500 dark:text-emerald-400',
    medium: 'text-amber-500 dark:text-amber-400',
    low: 'text-slate-400 dark:text-slate-500',
    unknown: 'text-slate-300 dark:text-slate-600',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn('relative inline-flex items-center justify-center', className)}
            style={{ width: sizeConfig.dimension, height: sizeConfig.dimension }}
          >
            <svg
              width={sizeConfig.dimension}
              height={sizeConfig.dimension}
              className="transform -rotate-90"
              role="img"
              aria-label={`${clampedScore}% confidence - ${label}`}
            >
              {/* Background ring */}
              <circle
                cx={sizeConfig.dimension / 2}
                cy={sizeConfig.dimension / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={sizeConfig.stroke}
                className={isVialuce ? '' : 'text-slate-200 dark:text-slate-700'}
                style={isVialuce ? { color: 'var(--vl-line)' } : undefined}
              />
              {/* Filled ring */}
              {animated ? (
                <motion.circle
                  cx={sizeConfig.dimension / 2}
                  cy={sizeConfig.dimension / 2}
                  r={radius}
                  fill="none"
                  stroke={isVialuce ? VIALUCE_RING_COLOR[level] : 'currentColor'}
                  strokeWidth={sizeConfig.stroke}
                  strokeDasharray={circumference}
                  strokeLinecap="round"
                  className={isVialuce ? undefined : ringColors[level]}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: dashOffset }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              ) : (
                <circle
                  cx={sizeConfig.dimension / 2}
                  cy={sizeConfig.dimension / 2}
                  r={radius}
                  fill="none"
                  stroke={isVialuce ? VIALUCE_RING_COLOR[level] : 'currentColor'}
                  strokeWidth={sizeConfig.stroke}
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className={isVialuce ? undefined : ringColors[level]}
                />
              )}
            </svg>
            {/* Score in center */}
            {showScore && size !== 'sm' && (
              <span
                className={cn(
                  'absolute font-medium',
                  !isVialuce && 'text-slate-700 dark:text-slate-300',
                  sizeConfig.fontSize
                )}
                style={isVialuce ? { fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text)' } : undefined}
              >
                {clampedScore}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{clampedScore}% {isSpanish ? 'confianza' : 'confidence'}</p>
          <p className="text-xs text-slate-400">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Confidence ring with label
 */
export function ConfidenceRingWithLabel({
  score,
  size = 'md',
  className,
}: Omit<ConfidenceRingProps, 'showScore'>) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const isVialuce = useIsVialuce(); // HF-316: DM Mono score under Vialuce

  const level = getConfidenceLevel(score);
  const levelConfig = STATE_TOKENS.confidence[level];
  const label = isSpanish ? levelConfig.labelEs : levelConfig.label;

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <ConfidenceRing score={score} size={size} />
      <div className="flex flex-col">
        <span
          className={cn('text-sm font-medium', !isVialuce && 'text-slate-900 dark:text-slate-100')}
          style={isVialuce ? { fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text)' } : undefined}
        >
          {score}%
        </span>
        <span
          className={cn('text-xs', !isVialuce && 'text-slate-500 dark:text-slate-400')}
          style={isVialuce ? { color: 'var(--vl-text-muted)' } : undefined}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
