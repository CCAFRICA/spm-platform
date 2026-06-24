'use client';

/**
 * DS-003 / directive §0.4 — StubAction. The HONEST disabled affordance for features whose backend is
 * NOT built (Simulate, Coach/Schedule, AI plan-health diagnostics, correlation analysis). Structurally
 * present so the layout accommodates the future capability, but visually disabled with an honest label
 * — never a fabricated click or fake response. Zero fabricated actions.
 */

import type { LucideIcon } from 'lucide-react';
import { Lock } from 'lucide-react';
import { TEXT } from './ds003-tokens';

export interface StubActionProps {
  label: string;
  /** honest description of what's coming, e.g. "Simulation engine coming soon". */
  description?: string;
  icon?: LucideIcon;
  /** compact = inline disabled chip; default = a bordered placeholder card. */
  variant?: 'card' | 'chip';
  className?: string;
}

export function StubAction({ label, description, icon: Icon, variant = 'card', className }: StubActionProps) {
  if (variant === 'chip') {
    return (
      <span
        aria-disabled
        title={description ?? 'Coming soon'}
        className={`inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-slate-700/70 px-2.5 py-1 text-xs ${TEXT.disabled} ${className ?? ''}`}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : <Lock className="h-3 w-3" />}
        {label}
        <span className="text-[10px] uppercase tracking-wide">soon</span>
      </span>
    );
  }
  return (
    <div
      aria-disabled
      className={`flex cursor-not-allowed flex-col items-start gap-1 rounded-lg border border-dashed border-slate-700/70 bg-slate-900/30 p-3 ${className ?? ''}`}
    >
      <div className={`flex items-center gap-2 text-sm font-medium ${TEXT.body}`}>
        {Icon ? <Icon className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
        {label}
        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Coming soon
        </span>
      </div>
      {description && <p className={`text-xs ${TEXT.muted}`}>{description}</p>}
    </div>
  );
}
