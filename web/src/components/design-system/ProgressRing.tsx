'use client';

import { useEffect, useState, type ReactNode } from 'react';

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
          className="text-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
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
