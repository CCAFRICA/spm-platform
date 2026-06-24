'use client';

/**
 * DS-003 §1.1 — HeroMetric. Decision task: IDENTIFICATION ("what is this value right now?").
 * The dominant element on a surface: large value + icon + a REQUIRED reference frame (trend arrow +
 * delta, or a benchmark note). Persona accent supplies the focal glow (environment); semantic color
 * is used only for the trend (state).
 */

import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { usePersonaTheme } from './persona-theme';
import { CARD, TEXT, directionColor } from './ds003-tokens';

export interface HeroContext {
  /** trend direction — the reference frame (required: "is that good or bad at a glance?"). */
  direction: 'up' | 'down' | 'flat';
  /** the comparison text, e.g. "12% vs last period" or "vs MX$52,100 target". */
  label: string;
}

export interface HeroMetricProps {
  label: string;
  value: string | number;
  /** the reference frame — trend + comparison. Not optional (DS-003 Rule 3). */
  context: HeroContext;
  icon?: LucideIcon;
  subtitle?: string;
  /** money formatter (surfaces pass useCurrency().format); applied when value is a number. */
  format?: (n: number) => string;
  className?: string;
}

export function HeroMetric({ label, value, context, icon: Icon, subtitle, format, className }: HeroMetricProps) {
  const theme = usePersonaTheme();
  const display = typeof value === 'number' ? (format ? format(value) : value.toLocaleString()) : value;
  const trendColor = directionColor(context.direction);
  const TrendIcon = context.direction === 'up' ? ArrowUpRight : context.direction === 'down' ? ArrowDownRight : Minus;

  return (
    <div
      className={`relative overflow-hidden ${CARD} p-5 ${className ?? ''}`}
      style={{ borderColor: theme.accentBorder }}
    >
      {/* focal glow — persona environment */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8"
        style={{ background: `radial-gradient(ellipse at top left, ${theme.accentGlow} 0%, transparent 60%)` }}
      />
      <div className="relative">
        <div className={`flex items-center gap-2 ${TEXT.body}`}>
          {Icon && <Icon className="h-4 w-4" style={{ color: theme.accent }} />}
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        </div>
        <div className={`mt-2 text-4xl font-bold tabular-nums ${TEXT.headline}`}>{display}</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium" style={{ color: trendColor }}>
          <TrendIcon className="h-4 w-4" />
          <span>{context.label}</span>
        </div>
        {subtitle && <div className={`mt-1 text-sm ${TEXT.muted}`}>{subtitle}</div>}
      </div>
    </div>
  );
}
