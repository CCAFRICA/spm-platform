'use client';

import { LIFECYCLE_DISPLAY, isDashboardState, type DashboardLifecycleState } from '@/lib/lifecycle/lifecycle-service';

export interface PeriodInfo {
  periodId: string;
  periodKey: string;
  label: string;
  status: string;
  lifecycleState: string | null;
  startDate: string;
  endDate: string;
  needsAttention: boolean;
  entityCount?: number;
}

interface PeriodRibbonProps {
  periods: PeriodInfo[];
  activeKey: string;
  onSelect: (periodKey: string) => void;
}

function getLifecycleLabel(state: string | null): string {
  if (!state) return '';
  if (isDashboardState(state)) {
    return LIFECYCLE_DISPLAY[state as DashboardLifecycleState].labelEs;
  }
  return state;
}

function getLifecycleDot(state: string | null): string {
  if (!state) return 'bg-zinc-600';
  if (isDashboardState(state)) {
    return LIFECYCLE_DISPLAY[state as DashboardLifecycleState].dotColor;
  }
  return 'bg-zinc-500';
}

export function PeriodRibbon({ periods, activeKey, onSelect }: PeriodRibbonProps) {
  if (periods.length === 0) {
    // Don't show the banner at all — no periods is handled by dashboard empty state
    return null;
  }

  return (
    <div className="px-6 py-3 border-b border-zinc-800/60 bg-zinc-950/60 overflow-x-auto">
      <div className="flex items-center gap-2">
        {periods.map((period) => {
          const isActive = period.periodKey === activeKey;
          const isCompleted = period.status === 'paid' || period.status === 'closed';
          const hasBatch = !!period.lifecycleState;

          return (
            <button
              key={period.periodKey}
              onClick={() => onSelect(period.periodKey)}
              className={`
                flex flex-col items-start gap-1 px-4 py-2.5 rounded-lg whitespace-nowrap transition-all
                ${isActive
                  ? 'bg-violet-600/20 border-2 border-violet-500/60 shadow-md shadow-violet-500/10'
                  : 'border border-transparent hover:bg-zinc-800/50 hover:border-zinc-700/40'
                }
                ${isCompleted && !isActive ? 'opacity-60' : ''}
                ${!hasBatch && !isActive ? 'opacity-40' : ''}
                ${period.needsAttention ? 'ring-2 ring-amber-500/40 animate-pulse' : ''}
              `}
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getLifecycleDot(period.lifecycleState)}`} />
                <span className={`text-sm ${isActive ? 'text-white font-semibold' : 'text-zinc-400 font-medium'}`}>
                  {period.label || period.periodKey}
                </span>
                {isCompleted && (
                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex items-center gap-2 pl-4">
                {period.entityCount != null && period.entityCount > 0 && (
                  <span className={`text-xs ${isActive ? 'text-zinc-300' : 'text-zinc-500'}`}>{period.entityCount} emp</span>
                )}
                {hasBatch && (
                  <span className={`text-xs font-medium ${isActive ? 'text-violet-300' : 'text-zinc-500'}`}>
                    {getLifecycleLabel(period.lifecycleState)}
                  </span>
                )}
                {!hasBatch && (
                  <span className="text-xs text-zinc-600">No calc</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
