'use client';

import { useIsVialuce } from '@/hooks/use-is-vialuce';

/** @cognitiveFit monitoring — "Is this going up or down?" */

interface TrendArrowProps {
  /** Percentage change (positive = up, negative = down, zero = flat) */
  delta: number;
  /** Optional label to show after the arrow (e.g., "vs prior period") */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

export function TrendArrow({ delta, label, size = 'md' }: TrendArrowProps) {
  const isVialuce = useIsVialuce(); // HF-316: DM Mono + success/danger tokens under Vialuce
  const isUp = delta > 0;
  const isDown = delta < 0;
  const isFlat = delta === 0;

  const color = isVialuce
    ? isUp ? 'var(--vl-success)' : isDown ? 'var(--vl-danger)' : 'var(--vl-text-soft)'
    : isUp ? '#34d399' : isDown ? '#f87171' : '#a1a1aa';
  const arrow = isUp ? '\u2191' : isDown ? '\u2193' : '\u2192';
  const textSize = size === 'sm' ? '11px' : '13px';

  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums font-medium"
      style={{ color, fontSize: textSize, ...(isVialuce ? { fontFamily: 'var(--vl-font-mono)' } : {}) }}
    >
      <span>{arrow}</span>
      <span>{isFlat ? '0%' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}</span>
      {label && (
        <span style={{ color: isVialuce ? 'var(--vl-text-soft)' : '#71717a', fontWeight: 400, fontSize: size === 'sm' ? '10px' : '11px', ...(isVialuce ? { fontFamily: 'var(--vl-font-sans)' } : {}) }}>
          {label}
        </span>
      )}
    </span>
  );
}
