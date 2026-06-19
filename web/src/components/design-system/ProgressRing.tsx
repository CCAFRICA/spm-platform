'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

/** @cognitiveFit monitoring — "How full is this?" */

interface ProgressRingProps {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}

export function ProgressRing({
  pct,
  size = 80,
  stroke = 6,
  color = '#6366f1',
  children,
}: ProgressRingProps) {
  const isVialuce = useIsVialuce(); // HF-316: ring → indigo ramp, track → line under Vialuce
  // Default ring color follows the design-spec indigo when the caller did not override.
  const ringColor = isVialuce && color === '#6366f1' ? 'var(--vl-raw-indigo)' : color;
  const [animatedPct, setAnimatedPct] = useState(0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedPct / 100) * circumference;

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setAnimatedPct(Math.min(Math.max(pct, 0), 100));
    });
    return () => cancelAnimationFrame(timer);
  }, [pct]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={isVialuce ? '' : 'text-zinc-800'}
          style={isVialuce ? { color: 'var(--vl-line)' } : undefined}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
