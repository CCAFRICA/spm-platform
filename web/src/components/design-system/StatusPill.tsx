'use client';

/** @cognitiveFit identification — "What state is this?" */

import type { ReactNode } from 'react';
import { PILL_COLORS, type PillColor } from '@/lib/design/tokens';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface StatusPillProps {
  children: ReactNode;
  color: PillColor;
}

// HF-315: map the dark-theme PillColor to the design-spec .pill variant set (success/danger/open/neutral).
const VIALUCE_PILL: Record<PillColor, string> = {
  emerald: 'success', rose: 'danger', indigo: 'open', amber: 'neutral', gold: 'neutral', zinc: 'neutral',
};

export function StatusPill({ children, color }: StatusPillProps) {
  const isVialuce = useIsVialuce();
  if (isVialuce) {
    return <span className={`pill ${VIALUCE_PILL[color]}`}>{children}</span>;
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PILL_COLORS[color]}`}>
      {children}
    </span>
  );
}
