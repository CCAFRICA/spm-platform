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
import { useIsVialuce } from '@/hooks/use-is-vialuce';

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
  const isVialuce = useIsVialuce(); // HF-316: required-level attention pulse uses the Vialuce gold signal
  const config = STATE_TOKENS.actionNeeded[level];

  // Don't pulse if disabled or level doesn't require it
  if (disabled || !config.pulse) {
    return <div className={className}>{children}</div>;
  }

  // Default pulse color based on intensity (Vialuce: gold signal for required, danger for urgent)
  const defaultColor = config.intensity >= 4
    ? (isVialuce ? 'rgba(220, 84, 84, 0.3)' : 'rgba(239, 68, 68, 0.3)') // Danger/red for urgent
    : (isVialuce ? 'rgba(232, 168, 56, 0.3)' : 'rgba(245, 158, 11, 0.3)'); // Gold/amber for required

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
  const isVialuce = useIsVialuce(); // HF-316: gold signal dot for required, danger for urgent under Vialuce
  const config = STATE_TOKENS.actionNeeded[level];

  if (!config.pulse) {
    return null;
  }

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const colorClasses = !isVialuce && (config.intensity >= 4
    ? 'bg-red-500'
    : 'bg-amber-500');
  const dotStyle = isVialuce
    ? { background: config.intensity >= 4 ? 'var(--vl-danger)' : 'var(--vl-raw-gold)' }
    : undefined;

  return (
    <span className={cn('relative flex', sizeClasses[size], className)}>
      <motion.span
        className={cn(
          'absolute inline-flex h-full w-full rounded-full opacity-75',
          colorClasses
        )}
        style={dotStyle}
        animate={{ scale: [1, 1.5, 1], opacity: [0.75, 0, 0.75] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className={cn('relative inline-flex rounded-full', sizeClasses[size], colorClasses)} style={dotStyle} />
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
  const isVialuce = useIsVialuce(); // HF-316: token chip + DM Mono count under Vialuce
  const config = STATE_TOKENS.actionNeeded[level];

  if (count === 0) return null;

  const colorClasses = !isVialuce && (config.intensity >= 4
    ? 'bg-red-500 text-white'
    : config.intensity >= 3
    ? 'bg-amber-500 text-white'
    : 'bg-slate-500 text-white');
  const badgeStyle = isVialuce
    ? {
        color: '#fff',
        fontFamily: 'var(--vl-font-mono)',
        background: config.intensity >= 4 ? 'var(--vl-danger)' : config.intensity >= 3 ? 'var(--vl-raw-gold)' : 'var(--vl-raw-slate)',
      }
    : undefined;

  return (
    <motion.span
      className={cn(
        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium rounded-full',
        colorClasses,
        className
      )}
      style={badgeStyle}
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
  const isVialuce = useIsVialuce(); // HF-316: gold/danger attention border under Vialuce
  const config = STATE_TOKENS.actionNeeded[level];

  if (!config.pulse) {
    return <div className={className}>{children}</div>;
  }

  const borderColor = !isVialuce && (config.intensity >= 4
    ? 'border-red-400'
    : 'border-amber-400');

  // Vialuce: required-level border pulses the gold signal; urgent pulses danger.
  const vialuceBorderAnim = config.intensity >= 4
    ? ['rgba(220, 84, 84, 0.5)', 'rgba(220, 84, 84, 1)', 'rgba(220, 84, 84, 0.5)']
    : ['rgba(232, 168, 56, 0.5)', 'rgba(232, 168, 56, 1)', 'rgba(232, 168, 56, 0.5)'];

  return (
    <motion.div
      className={cn(
        'rounded-lg',
        borderColor,
        className
      )}
      style={{ borderWidth }}
      animate={{ borderColor: isVialuce ? vialuceBorderAnim : ['rgba(245, 158, 11, 0.5)', 'rgba(245, 158, 11, 1)', 'rgba(245, 158, 11, 0.5)'] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
