'use client';

import {
  LIFECYCLE_STATES,
  LIFECYCLE_DISPLAY,
  getNextAction,
  getPreviousAction,
  isDashboardState,
  toDashboardState,
} from '@/lib/lifecycle/lifecycle-service';

interface LifecycleStepperProps {
  currentState: string;
  onAdvance?: (nextState: string) => void;
  onGoBack?: (prevState: string) => void;
  canGoBack?: boolean;
}

export function LifecycleStepper({
  currentState,
  onAdvance,
  onGoBack,
  canGoBack = false,
}: LifecycleStepperProps) {
  const dashState = isDashboardState(currentState) ? currentState : toDashboardState(currentState);
  const currentIdx = LIFECYCLE_STATES.indexOf(dashState);
  const nextAction = getNextAction(dashState);
  const prevAction = canGoBack ? getPreviousAction(dashState) : null;

  return (
    <div className="space-y-4">
      {/* Stepper track */}
      <div className="flex items-center gap-0 flex-wrap pb-2">
        {LIFECYCLE_STATES.map((state, i) => {
          const display = LIFECYCLE_DISPLAY[state];
          const isCompleted = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isFuture = i > currentIdx;

          return (
            <div key={state} className="flex items-center">
              {/* Step */}
              <div className="flex flex-col items-center" style={{ minWidth: '56px' }}>
                <div
                  className={`
                    w-5 h-5 rounded-full flex items-center justify-center transition-all
                    ${isCompleted ? 'bg-emerald-500' : ''}
                    ${isCurrent ? `${display.dotColor} ring-2 ring-offset-2 ring-offset-zinc-900 ring-current animate-pulse` : ''}
                    ${isFuture ? 'border border-zinc-600 bg-zinc-800/50' : ''}
                  `}
                >
                  {isCompleted && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`mt-1.5 text-[10px] whitespace-nowrap ${isCurrent ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>
                  {display.label}
                </span>
              </div>
              {/* Connector line */}
              {i < LIFECYCLE_STATES.length - 1 && (
                <div className={`h-px w-6 flex-shrink-0 ${i < currentIdx ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        {prevAction && onGoBack && (
          <button
            onClick={() => onGoBack(prevAction.prevState)}
            className="px-3 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            &larr; {prevAction.label}
          </button>
        )}
        {nextAction && onAdvance && (
          <button
            onClick={() => onAdvance(nextAction.nextState)}
            className="px-4 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg hover:from-indigo-600 hover:to-violet-600 transition-all"
          >
            {nextAction.label} &rarr;
          </button>
        )}
        {!nextAction && (
          <span className="text-xs text-zinc-400">Cycle complete</span>
        )}
      </div>
    </div>
  );
}
