'use client';

import { useEffect, useRef, useState } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

/** @cognitiveFit identification — "What is this value?" */

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  duration = 800,
  decimals = 0,
}: AnimatedNumberProps) {
  const isVialuce = useIsVialuce(); // HF-315: numbers always DM Mono under Vialuce
  const [display, setDisplay] = useState(0);
  const startRef = useRef(0);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = display;
    startTimeRef.current = performance.now();

    function animate(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = startRef.current + (value - startRef.current) * eased;

      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString();

  return (
    <span className="tabular-nums" style={isVialuce ? { fontFamily: 'var(--vl-font-mono)' } : undefined}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
