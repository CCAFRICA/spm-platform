'use client';

/**
 * DS-015 — IntelligenceElement. The Five-Elements intelligence card: every field of an intelligence
 * observation, explicit and labelled, so G2 is provable on the surface:
 *   1. value      — the number/state
 *   2. context    — why it matters / what it means
 *   3. comparison — the reference frame (delta, benchmark, quartile)
 *   4. action     — the thermostat (real link/handler OR an honest stub)
 *   5. impact     — what acting (or not) changes
 *
 * Persona accent for the environment; semantic tone for the comparison state.
 */

import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { usePersonaTheme } from './persona-theme';
import { CARD, TEXT, toneColor, type SemanticTone } from './ds003-tokens';

export interface ElementAction {
  label: string;
  onClick?: () => void;
  href?: string;
  /** honest stub — renders disabled with no handler. */
  disabled?: boolean;
}

export interface IntelligenceElementProps {
  /** 1. value */
  value: string;
  /** the headline label for the value */
  label: string;
  icon?: LucideIcon;
  /** 2. context — what it means */
  context: string;
  /** 3. comparison — the reference frame */
  comparison: string;
  comparisonTone?: SemanticTone;
  /** 4. action — the thermostat */
  action: ElementAction;
  /** 5. impact — what changes if acted on */
  impact: string;
  className?: string;
}

export function IntelligenceElement({
  value,
  label,
  icon: Icon,
  context,
  comparison,
  comparisonTone,
  action,
  impact,
  className,
}: IntelligenceElementProps) {
  const theme = usePersonaTheme();
  return (
    <div className={`${CARD} p-4 ${className ?? ''}`} style={{ borderColor: theme.accentBorder }}>
      {/* 1. value + label */}
      <div className={`flex items-center gap-2 ${TEXT.body}`}>
        {Icon && <Icon className="h-4 w-4" style={{ color: theme.accent }} />}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TEXT.headline}`}>{value}</div>
      {/* 3. comparison (reference frame) */}
      <div className="mt-1 text-sm font-medium" style={{ color: toneColor(comparisonTone) }}>{comparison}</div>
      {/* 2. context */}
      <p className={`mt-2 text-sm ${TEXT.body}`}>{context}</p>
      {/* 5. impact */}
      <p className={`mt-1 text-xs ${TEXT.muted}`}>↳ {impact}</p>
      {/* 4. action (thermostat) */}
      <div className="mt-3">
        {action.disabled ? (
          <span className={`inline-flex items-center gap-1 rounded-md border border-dashed border-slate-700/70 px-2.5 py-1 text-xs ${TEXT.disabled}`} title="Coming soon">
            {action.label} · soon
          </span>
        ) : action.href ? (
          <a href={action.href} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
            {action.label} <ArrowRight className="h-3 w-3" />
          </a>
        ) : (
          <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
            {action.label} <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
