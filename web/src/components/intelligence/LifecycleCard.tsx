'use client';

/**
 * LifecycleCard — Admin lifecycle stepper
 *
 * Horizontal stepper showing lifecycle progression.
 * Done stages: filled dot. Active stage: accent glow. Pending: hollow dot.
 *
 * OB-165: Intelligence Stream Foundation
 */

import { Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IntelligenceCard } from './IntelligenceCard';

interface LifecycleStage {
  label: string;
  status: 'done' | 'active' | 'pending';
}

interface LifecycleCardProps {
  accentColor: string;
  stages: LifecycleStage[];
  currentState: string;
  nextAction: { label: string; route: string } | null;
  onAction?: () => void;
  onView?: () => void;
}

export function LifecycleCard({
  accentColor,
  stages,
  currentState,
  nextAction,
  onAction,
  onView,
}: LifecycleCardProps) {
  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Lifecycle"
      elementId="lifecycle-stepper"
      fullWidth
      onView={onView}
    >
      {/* Stepper */}
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center">
            {/* Stage dot + label */}
            <div className="flex flex-col items-center min-w-[64px]">
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                  stage.status === 'done' && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
                  stage.status === 'active' && 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/60 shadow-[0_0_10px_rgba(99,102,241,0.3)]',
                  stage.status === 'pending' && 'bg-transparent text-slate-600 border border-zinc-700',
                )}
              >
                {stage.status === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </div>
              <span
                className={cn(
                  'mt-1.5 text-[10px] uppercase tracking-wider font-medium text-center leading-tight',
                  stage.status === 'done' && 'text-emerald-400/70',
                  stage.status === 'active' && 'text-slate-200',
                  stage.status === 'pending' && 'text-slate-600',
                )}
              >
                {stage.label}
              </span>
            </div>

            {/* Connector line */}
            {i < stages.length - 1 && (
              <div
                className={cn(
                  'h-px w-4 sm:w-6 flex-shrink-0 mt-[-16px]',
                  stage.status === 'done' ? 'bg-emerald-500/40' : 'bg-zinc-700',
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current state + next action */}
      <div className="mt-4 flex items-center justify-between border-t border-zinc-800/60 pt-3">
        <p className="text-xs text-slate-500">
          Current: <span className="text-slate-300 font-medium">{currentState}</span>
        </p>
        {nextAction && (
          <button
            onClick={onAction}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md',
              'bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors',
            )}
          >
            {nextAction.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </IntelligenceCard>
  );
}
