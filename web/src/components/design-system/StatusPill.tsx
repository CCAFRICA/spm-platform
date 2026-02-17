'use client';

import type { ReactNode } from 'react';
import { PILL_COLORS, type PillColor } from '@/lib/design/tokens';

interface StatusPillProps {
  children: ReactNode;
  color: PillColor;
}

export function StatusPill({ children, color }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PILL_COLORS[color]}`}>
      {children}
    </span>
  );
}
