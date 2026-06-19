'use client';

import { useIsVialuce } from '@/hooks/use-is-vialuce';

/** @cognitiveFit monitoring — "What is the trajectory?" */

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  data,
  color = '#6366f1',
  width = 80,
  height = 24,
}: SparklineProps) {
  const isVialuce = useIsVialuce(); // HF-316: series → indigo ramp under Vialuce
  // Default series color follows the design-spec indigo when the caller did not override.
  const strokeColor = isVialuce && color === '#6366f1' ? 'var(--vl-raw-indigo)' : color;
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (() => {
        const lastX = padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2);
        const lastY = padding + (1 - (data[data.length - 1] - min) / range) * (height - padding * 2);
        return <circle cx={lastX} cy={lastY} r="2" fill={strokeColor} />;
      })()}
    </svg>
  );
}
