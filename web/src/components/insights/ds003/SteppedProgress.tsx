'use client';

/**
 * DS-003 §1.6 — SteppedProgress. Decision task: PLANNING (rep goal-gradient). Discrete tier steps (not
 * a continuous bar), current position marked with persona accent, and a specific gap-to-next as an
 * actionable number (the reference frame). Goal-Gradient framing: near goal → gap framing.
 */

import { usePersonaTheme } from './persona-theme';
import { SECTION_LABEL_CLASS, TEXT } from './ds003-tokens';

export interface ProgressTier {
  label: string;
  /** the value at which this tier is reached. */
  threshold: number;
  /** optional descriptor, e.g. "1.2x" or "Base". */
  note?: string;
}

export interface SteppedProgressProps {
  title?: string;
  tiers: ProgressTier[];
  currentValue: number;
  format?: (n: number) => string;
}

export function SteppedProgress({ title, tiers, currentValue, format }: SteppedProgressProps) {
  const theme = usePersonaTheme();
  const fmt = format ?? ((n: number) => n.toLocaleString());
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  const currentIdx = sorted.reduce((acc, t, i) => (currentValue >= t.threshold ? i : acc), -1);
  const next = sorted[currentIdx + 1];
  const gap = next ? next.threshold - currentValue : 0;

  return (
    <div>
      {title && <div className={`mb-3 ${SECTION_LABEL_CLASS}`}>{title}</div>}
      <div className="flex items-stretch gap-2">
        {sorted.map((tier, i) => {
          const reached = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div
              key={tier.label}
              className="flex-1 rounded-lg border p-2.5 text-center"
              style={{
                borderColor: isCurrent ? theme.accent : reached ? theme.accentBorder : 'var(--vl-line, #E8EAF3)',
                backgroundColor: isCurrent ? theme.accentSoft : 'transparent',
                boxShadow: isCurrent ? `0 0 0 3px ${theme.accentSoft}` : undefined,
              }}
            >
              <div className={`text-xs font-semibold ${reached ? 'text-foreground' : TEXT.disabled}`}>{tier.label}</div>
              {tier.note && <div className={`text-[10px] ${reached ? TEXT.body : TEXT.disabled}`}>{tier.note}</div>}
              <div className={`mt-1 text-[10px] tabular-nums ${TEXT.muted}`}>{fmt(tier.threshold)}</div>
              {isCurrent && <div className="mt-0.5 text-[10px] font-medium" style={{ color: theme.accent }}>You</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 text-sm">
        {next ? (
          <span className={TEXT.body}>
            <span className="font-semibold text-foreground">{fmt(gap)}</span> more to <span style={{ color: theme.accent }}>{next.label}</span>
          </span>
        ) : (
          <span style={{ color: theme.accent }} className="font-medium">Top tier reached.</span>
        )}
      </div>
    </div>
  );
}
