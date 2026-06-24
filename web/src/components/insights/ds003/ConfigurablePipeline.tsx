'use client';

/**
 * DS-003 §1.6 — ConfigurablePipeline. Decision task: PLANNING (lifecycle). A horizontal stepper of
 * states with the current position marked (persona accent glow) and the NEXT action + SLA beneath it
 * (the thermostat). The position-in-sequence + "next" IS the reference frame. Honest actions: a
 * disabled next-action renders muted.
 */

import { Check } from 'lucide-react';
import { usePersonaTheme } from './persona-theme';
import { SECTION_LABEL_CLASS, TEXT } from './ds003-tokens';

export type StageStatus = 'done' | 'current' | 'future';

export interface PipelineStage {
  label: string;
  status: StageStatus;
}

export interface PipelineAction {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

export interface ConfigurablePipelineProps {
  title?: string;
  stages: PipelineStage[];
  /** the "Next: …" thermostat action beneath the current stage. */
  action?: PipelineAction;
  /** SLA / timing reference, e.g. "Required by Feb 20" or "3 days remaining". */
  slaNote?: string;
}

export function ConfigurablePipeline({ title, stages, action, slaNote }: ConfigurablePipelineProps) {
  const theme = usePersonaTheme();
  const currentLabel = stages.find((s) => s.status === 'current')?.label;

  return (
    <div>
      {title && <div className={`mb-3 ${SECTION_LABEL_CLASS}`}>{title}</div>}
      <div className="flex items-center">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1;
          const done = stage.status === 'done';
          const current = stage.status === 'current';
          return (
            <div key={stage.label} className="flex min-w-0 flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold"
                  style={{
                    borderColor: done || current ? theme.accent : 'var(--vl-line, #E8EAF3)',
                    backgroundColor: done ? theme.accent : current ? theme.accentSoft : 'transparent',
                    color: done ? '#ffffff' : current ? theme.accent : 'var(--vl-text-soft, #8A90A6)',
                    boxShadow: current ? `0 0 0 4px ${theme.accentSoft}` : undefined,
                  }}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={`max-w-[72px] truncate text-center text-[10px] uppercase tracking-wide ${
                    current ? 'text-foreground' : done ? TEXT.body : TEXT.disabled
                  }`}
                  title={stage.label}
                >
                  {stage.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className="mx-1 h-0.5 flex-1"
                  style={{ backgroundColor: done ? theme.accent : 'var(--vl-line, #E8EAF3)' }}
                />
              )}
            </div>
          );
        })}
      </div>
      {(currentLabel || action || slaNote) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {currentLabel && <span className={TEXT.body}>You are here: <span className="font-medium text-foreground">{currentLabel}</span></span>}
          {action &&
            (action.disabled ? (
              <span className={`rounded-md border border-border px-2.5 py-1 text-xs ${TEXT.disabled}`} title="Coming soon">
                Next: {action.label}
              </span>
            ) : action.href ? (
              <a href={action.href} className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
                Next: {action.label}
              </a>
            ) : (
              <button type="button" onClick={action.onClick} className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
                Next: {action.label}
              </button>
            ))}
          {slaNote && <span className={`ml-auto text-xs ${TEXT.muted}`}>{slaNote}</span>}
        </div>
      )}
    </div>
  );
}
