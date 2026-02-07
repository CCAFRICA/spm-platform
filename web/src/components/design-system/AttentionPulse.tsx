'use client';

/**
 * Attention Pulse
 *
 * Subtle attention indicator for items requiring action.
 * Can wrap any component to add pulsing attention effect.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { STATE_TOKENS, type ActionLevel } from '@/lib/design-system/tokens';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface AttentionPulseProps {
  children: React.ReactNode;
  level?: ActionLevel;
  className?: string;
  pulseColor?: string;
  disabled?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function AttentionPulse({
  children,
  level = 'required',
  className,
  pulseColor,
  disabled = false,
}: AttentionPulseProps) {
  const config = STATE_TOKENS.actionNeeded[level];

  // Don't pulse if disabled or level doesn't require it
  if (disabled || !config.pulse) {
    return <div className={className}>{children}</div>;
  }

  // Default pulse color based on intensity
  const defaultColor = config.intensity >= 4
    ? 'rgba(239, 68, 68, 0.3)' // Red-ish for urgent
    : 'rgba(245, 158, 11, 0.3)'; // Amber for required

  const color = pulseColor || defaultColor;

  return (
    <div className={cn('relative', className)}>
      {/* Pulse ring */}
      <motion.div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          boxShadow: `0 0 0 0 ${color}`,
        }}
        animate={{
          boxShadow: [
            `0 0 0 0 ${color}`,
            `0 0 0 4px ${color}`,
            `0 0 0 8px transparent`,
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      {/* Content */}
      {children}
    </div>
  );
}

/**
 * Attention dot - small pulsing indicator
 */
export function AttentionDot({
  level = 'required',
  size = 'md',
  className,
}: {
  level?: ActionLevel;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const config = STATE_TOKENS.actionNeeded[level];

  if (!config.pulse) {
    return null;
  }

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const colorClasses = config.intensity >= 4
    ? 'bg-red-500'
    : 'bg-amber-500';

  return (
    <span className={cn('relative flex', sizeClasses[size], className)}>
      <motion.span
        className={cn(
          'absolute inline-flex h-full w-full rounded-full opacity-75',
          colorClasses
        )}
        animate={{ scale: [1, 1.5, 1], opacity: [0.75, 0, 0.75] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className={cn('relative inline-flex rounded-full', sizeClasses[size], colorClasses)} />
    </span>
  );
}

/**
 * Attention badge - for counts
 */
export function AttentionBadge({
  count,
  level = 'required',
  className,
}: {
  count: number;
  level?: ActionLevel;
  className?: string;
}) {
  const config = STATE_TOKENS.actionNeeded[level];

  if (count === 0) return null;

  const colorClasses = config.intensity >= 4
    ? 'bg-red-500 text-white'
    : config.intensity >= 3
    ? 'bg-amber-500 text-white'
    : 'bg-slate-500 text-white';

  return (
    <motion.span
      className={cn(
        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium rounded-full',
        colorClasses,
        className
      )}
      animate={config.pulse ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      {count > 99 ? '99+' : count}
    </motion.span>
  );
}

/**
 * Attention border - adds pulsing border to any element
 */
export function AttentionBorder({
  children,
  level = 'required',
  className,
  borderWidth = 2,
}: {
  children: React.ReactNode;
  level?: ActionLevel;
  className?: string;
  borderWidth?: number;
}) {
  const config = STATE_TOKENS.actionNeeded[level];

  if (!config.pulse) {
    return <div className={className}>{children}</div>;
  }

  const borderColor = config.intensity >= 4
    ? 'border-red-400'
    : 'border-amber-400';

  return (
    <motion.div
      className={cn(
        'rounded-lg',
        borderColor,
        className
      )}
      style={{ borderWidth }}
      animate={{ borderColor: ['rgba(245, 158, 11, 0.5)', 'rgba(245, 158, 11, 1)', 'rgba(245, 158, 11, 0.5)'] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
