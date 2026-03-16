'use client';

/**
 * IntelligenceCard — Base container for all Intelligence Stream cards
 *
 * Five Elements Protocol: every card built on this base must include
 * Value, Context, Comparison, Action, and Impact.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface IntelligenceCardProps {
  accentColor: string; // tailwind class like 'border-indigo-500'
  label: string;
  elementId: string; // for signal capture
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  onView?: () => void;
  /** OB-173B: Visual tier — status (muted), information (standard), action (accent) */
  tier?: 'status' | 'information' | 'action';
}

export function IntelligenceCard({
  accentColor,
  label,
  elementId,
  children,
  className,
  fullWidth,
  onView,
  tier = 'information',
}: IntelligenceCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Signal capture: fire onView when element enters viewport
  useEffect(() => {
    if (!onView || !ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onView();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [onView]);

  return (
    <div
      ref={ref}
      data-element-id={elementId}
      className={cn(
        'relative rounded-lg p-5',
        tier === 'status' && 'bg-zinc-900/30 border border-zinc-800/40',
        tier === 'information' && cn('bg-zinc-900/50 border border-zinc-800/60 border-l-[3px]', accentColor),
        tier === 'action' && cn('bg-zinc-900/60 border border-zinc-800/60 border-l-4', accentColor),
        fullWidth ? 'col-span-full' : '',
        className,
      )}
    >
      <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-3">
        {label}
      </p>
      {children}
    </div>
  );
}
