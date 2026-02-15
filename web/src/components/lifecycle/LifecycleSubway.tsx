'use client';

/**
 * LifecycleSubway — Enhanced subway visualization for the 10-state lifecycle
 *
 * Each state node is a clickable button (not just a visual indicator).
 * Current state is highlighted. Next valid action pulses.
 * Completed states show checkmark. Each state shows timestamp.
 * Hover shows who performed the action, when, and notes.
 */

import { memo } from 'react';
import { Check, Circle, Clock, AlertTriangle } from 'lucide-react';
import {
  type CalculationState,
  type CalculationCycle,
  LIFECYCLE_STATES_ORDERED,
  getStateLabel,
  getAllowedTransitions,
} from '@/lib/calculation/calculation-lifecycle-service';

interface LifecycleSubwayProps {
  cycle: CalculationCycle;
  onStateClick?: (state: CalculationState) => void;
  compact?: boolean;
}

function getStateIndex(state: CalculationState): number {
  return LIFECYCLE_STATES_ORDERED.indexOf(state);
}

function LifecycleSubwayComponent({ cycle, onStateClick, compact = false }: LifecycleSubwayProps) {
  const currentIndex = getStateIndex(cycle.state);
  const nextStates = getAllowedTransitions(cycle.state);
  const isRejected = cycle.state === 'REJECTED';

  return (
    <div className="w-full">
      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-0'} overflow-x-auto`}>
        {LIFECYCLE_STATES_ORDERED.map((state, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = state === cycle.state;
          const isNext = nextStates.includes(state);
          const isReachable = index <= currentIndex + 2;

          // Find audit entry for this state
          const audit = cycle.auditTrail.find(a => a.toState === state && a.fromState !== state);

          return (
            <div key={state} className="flex items-center flex-shrink-0">
              {/* Node */}
              <button
                onClick={() => onStateClick?.(state)}
                className={`
                  relative flex flex-col items-center group
                  ${compact ? 'px-1' : 'px-2'}
                  ${isCurrent || isNext ? 'cursor-pointer' : 'cursor-default'}
                `}
                title={audit ? `${audit.actor} - ${new Date(audit.timestamp).toLocaleString()}` : getStateLabel(state)}
              >
                {/* Circle */}
                <div
                  className={`
                    rounded-full flex items-center justify-center transition-all
                    ${compact ? 'h-6 w-6' : 'h-8 w-8'}
                    ${isCompleted ? 'bg-primary text-primary-foreground' : ''}
                    ${isCurrent ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2' : ''}
                    ${isNext ? 'border-2 border-primary/60 text-primary animate-pulse' : ''}
                    ${!isCompleted && !isCurrent && !isNext ? 'border border-muted-foreground/30 text-muted-foreground/40' : ''}
                  `}
                >
                  {isCompleted ? (
                    <Check className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
                  ) : isCurrent ? (
                    <Circle className={compact ? 'h-3 w-3' : 'h-4 w-4'} fill="currentColor" />
                  ) : (
                    <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-mono`}>
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Label */}
                {!compact && (
                  <span
                    className={`
                      text-[9px] mt-1 whitespace-nowrap
                      ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}
                      ${isCompleted ? 'text-primary' : ''}
                    `}
                  >
                    {getStateLabel(state)}
                  </span>
                )}

                {/* Timestamp */}
                {!compact && audit && (
                  <span className="text-[8px] text-muted-foreground/60">
                    {new Date(audit.timestamp).toLocaleDateString()}
                  </span>
                )}

                {/* Hover tooltip */}
                {audit && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border rounded-md shadow-lg p-2 text-xs whitespace-nowrap z-50 pointer-events-none">
                    <div className="font-medium">{getStateLabel(state)}</div>
                    <div className="text-muted-foreground">{audit.actor}</div>
                    <div className="text-muted-foreground">
                      {new Date(audit.timestamp).toLocaleString()}
                    </div>
                    {audit.details && (
                      <div className="text-muted-foreground mt-1 text-[10px]">{audit.details}</div>
                    )}
                  </div>
                )}
              </button>

              {/* Connector line */}
              {index < LIFECYCLE_STATES_ORDERED.length - 1 && (
                <div
                  className={`
                    ${compact ? 'w-3 h-0.5' : 'w-6 h-0.5'}
                    ${index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/20'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Rejected indicator */}
      {isRejected && (
        <div className="flex items-center gap-2 mt-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Rejected: {cycle.rejectionReason || 'No reason provided'}</span>
        </div>
      )}
    </div>
  );
}

export const LifecycleSubway = memo(LifecycleSubwayComponent);
