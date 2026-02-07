'use client';

/**
 * State Indicator
 *
 * Universal state communication component.
 * Works in tables, cards, org-chart nodes, list items, map markers.
 * NEVER uses red/yellow/green stoplight encoding.
 */

import React from 'react';
import { STATE_TOKENS, type ConfidenceLevel, type ActionLevel, type ProgressLevel } from '@/lib/design-system/tokens';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocale } from '@/contexts/locale-context';

// ============================================
// TYPES
// ============================================

interface BaseProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface ConfidenceProps extends BaseProps {
  type: 'confidence';
  level: ConfidenceLevel;
}

interface ActionProps extends BaseProps {
  type: 'action';
  level: ActionLevel;
}

interface ProgressProps extends BaseProps {
  type: 'progress';
  value: number; // 0-1
}

type StateIndicatorProps = ConfidenceProps | ActionProps | ProgressProps;

// ============================================
// SIZE CONFIG
// ============================================

const SIZE_CONFIG = {
  sm: { ring: 16, stroke: 2, text: 'text-xs' },
  md: { ring: 24, stroke: 3, text: 'text-sm' },
  lg: { ring: 32, stroke: 4, text: 'text-base' },
};

// ============================================
// COMPONENT
// ============================================

export function StateIndicator(props: StateIndicatorProps) {
  const { type, className, showLabel = false, size = 'md' } = props;
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  if (type === 'confidence') {
    return (
      <ConfidenceIndicator
        level={props.level}
        className={className}
        showLabel={showLabel}
        size={size}
        isSpanish={isSpanish}
      />
    );
  }

  if (type === 'action') {
    return (
      <ActionIndicator
        level={props.level}
        className={className}
        showLabel={showLabel}
        size={size}
        isSpanish={isSpanish}
      />
    );
  }

  if (type === 'progress') {
    return (
      <ProgressIndicator
        value={props.value}
        className={className}
        showLabel={showLabel}
        size={size}
        isSpanish={isSpanish}
      />
    );
  }

  return null;
}

// ============================================
// CONFIDENCE INDICATOR
// ============================================

interface ConfidenceIndicatorProps {
  level: ConfidenceLevel;
  className?: string;
  showLabel?: boolean;
  size: 'sm' | 'md' | 'lg';
  isSpanish: boolean;
}

function ConfidenceIndicator({ level, className, showLabel, size, isSpanish }: ConfidenceIndicatorProps) {
  const config = STATE_TOKENS.confidence[level];
  const sizeConfig = SIZE_CONFIG[size];

  const label = isSpanish ? config.labelEs : config.label;

  // Ring fill percentages
  const fillPercentages: Record<typeof config.ring, number> = {
    full: 100,
    'three-quarter': 75,
    half: 50,
    quarter: 25,
  };

  const fillPercent = fillPercentages[config.ring];
  const radius = (sizeConfig.ring - sizeConfig.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fillPercent / 100);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('inline-flex items-center gap-1.5', className)}>
            {/* Ring visualization */}
            <svg
              width={sizeConfig.ring}
              height={sizeConfig.ring}
              className="transform -rotate-90"
              role="img"
              aria-label={label}
            >
              {/* Background ring */}
              <circle
                cx={sizeConfig.ring / 2}
                cy={sizeConfig.ring / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={sizeConfig.stroke}
                className="text-slate-200 dark:text-slate-700"
              />
              {/* Filled ring */}
              <circle
                cx={sizeConfig.ring / 2}
                cy={sizeConfig.ring / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={sizeConfig.stroke}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className="text-slate-700 dark:text-slate-300 transition-all duration-300"
                style={{ opacity: config.opacity }}
              />
            </svg>
            {/* Optional label */}
            {showLabel && (
              <span className={cn(sizeConfig.text, 'text-slate-600 dark:text-slate-400')}>
                {label}
              </span>
            )}
            {/* Shape cue for accessibility (not just color) */}
            <span className="sr-only">{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================
// ACTION INDICATOR
// ============================================

interface ActionIndicatorProps {
  level: ActionLevel;
  className?: string;
  showLabel?: boolean;
  size: 'sm' | 'md' | 'lg';
  isSpanish: boolean;
}

function ActionIndicator({ level, className, showLabel, size, isSpanish }: ActionIndicatorProps) {
  const config = STATE_TOKENS.actionNeeded[level];
  const sizeConfig = SIZE_CONFIG[size];

  const labels: Record<ActionLevel, { en: string; es: string }> = {
    none: { en: 'No action needed', es: 'Sin acción requerida' },
    optional: { en: 'Optional action', es: 'Acción opcional' },
    recommended: { en: 'Recommended', es: 'Recomendado' },
    required: { en: 'Action required', es: 'Acción requerida' },
    urgent: { en: 'Urgent action', es: 'Acción urgente' },
  };

  const label = isSpanish ? labels[level].es : labels[level].en;

  // Elevation styles
  const elevationStyles: Record<typeof config.elevation, string> = {
    flat: '',
    subtle: 'shadow-sm',
    raised: 'shadow-md',
    prominent: 'shadow-lg ring-2 ring-amber-400/50',
  };

  // Intensity indicator (dots)
  const dots = Array.from({ length: 4 }, (_, i) => i < config.intensity);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-full',
              elevationStyles[config.elevation],
              config.pulse && 'animate-pulse',
              className
            )}
          >
            {/* Intensity dots */}
            <div className="flex gap-0.5">
              {dots.map((filled, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-full',
                    size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-2.5 h-2.5',
                    filled
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : 'bg-slate-200 dark:bg-slate-700'
                  )}
                />
              ))}
            </div>
            {showLabel && (
              <span className={cn(sizeConfig.text, 'text-slate-600 dark:text-slate-400')}>
                {label}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================
// PROGRESS INDICATOR
// ============================================

interface ProgressIndicatorProps {
  value: number;
  className?: string;
  showLabel?: boolean;
  size: 'sm' | 'md' | 'lg';
  isSpanish: boolean;
}

function ProgressIndicator({ value, className, showLabel, size, isSpanish }: ProgressIndicatorProps) {
  const sizeConfig = SIZE_CONFIG[size];
  const clampedValue = Math.max(0, Math.min(1, value));
  const percent = Math.round(clampedValue * 100);

  // Determine progress level
  let level: ProgressLevel = 'notStarted';
  if (clampedValue >= 1) level = 'complete';
  else if (clampedValue >= 0.85) level = 'nearComplete';
  else if (clampedValue > 0) level = 'inProgress';

  const config = STATE_TOKENS.progress[level];
  const label = isSpanish ? config.labelEs : config.label;

  const radius = (sizeConfig.ring - sizeConfig.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampedValue);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('inline-flex items-center gap-1.5', className)}>
            <svg
              width={sizeConfig.ring}
              height={sizeConfig.ring}
              className="transform -rotate-90"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {/* Background ring */}
              <circle
                cx={sizeConfig.ring / 2}
                cy={sizeConfig.ring / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={sizeConfig.stroke}
                className="text-slate-200 dark:text-slate-700"
              />
              {/* Progress ring */}
              <circle
                cx={sizeConfig.ring / 2}
                cy={sizeConfig.ring / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={sizeConfig.stroke}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className="text-sky-500 dark:text-sky-400 transition-all duration-500"
              />
            </svg>
            {showLabel && (
              <span className={cn(sizeConfig.text, 'text-slate-600 dark:text-slate-400')}>
                {percent}% - {label}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{percent}% - {label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
