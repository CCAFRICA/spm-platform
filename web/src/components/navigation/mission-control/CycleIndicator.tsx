'use client';

/**
 * Cycle Indicator Component
 *
 * Visual representation of the compensation cycle progress.
 * Shows: Import → Calculate → Reconcile → Approve → Pay
 */

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useCycleState } from '@/contexts/navigation-context';
import { getRouteForPhase } from '@/lib/navigation/cycle-service';
import { logCycleClick } from '@/lib/navigation/navigation-signals';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import type { CyclePhase, PhaseStatus } from '@/types/navigation';
import { CYCLE_PHASE_LABELS } from '@/types/navigation';
import {
  Upload,
  Calculator,
  GitCompare,
  CheckCircle,
  Wallet,
  Lock,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CycleIndicatorProps {
  collapsed?: boolean;
}

const PHASE_ICONS: Record<CyclePhase, React.ComponentType<{ className?: string }>> = {
  import: Upload,
  calculate: Calculator,
  reconcile: GitCompare,
  approve: CheckCircle,
  pay: Wallet,
  closed: Lock,
};

export function CycleIndicator({ collapsed = false }: CycleIndicatorProps) {
  const router = useRouter();
  const { cycleState, isSpanish } = useCycleState();
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  if (!cycleState) {
    return (
      <div className="px-3 py-4">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-24 mb-2" />
          <div className="h-8 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  const handlePhaseClick = (phase: CyclePhase) => {
    if (user && currentTenant) {
      logCycleClick(phase, user.id, currentTenant.id);
    }
    router.push(getRouteForPhase(phase));
  };

  const getPhaseColor = (status: PhaseStatus): string => {
    switch (status.state) {
      case 'completed':
        return 'bg-green-500 text-white';
      case 'in_progress':
        return 'bg-blue-500 text-white animate-pulse';
      case 'warning':
        return 'bg-amber-500 text-white';
      case 'blocked':
        return 'bg-red-500 text-white';
      case 'not_started':
      default:
        return 'bg-slate-200 text-slate-400';
    }
  };

  const getConnectorColor = (phase: CyclePhase): string => {
    const status = cycleState.phaseStatuses[phase];
    if (status.state === 'completed') return 'bg-green-500';
    if (status.state === 'in_progress') return 'bg-blue-500';
    return 'bg-slate-200';
  };

  // Collapsed view - show only current phase
  if (collapsed) {
    const currentPhase = cycleState.currentPhase;
    const Icon = PHASE_ICONS[currentPhase];
    const status = cycleState.phaseStatuses[currentPhase];

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => handlePhaseClick(currentPhase)}
              className="w-full flex flex-col items-center py-3 px-2 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <div className={cn('p-2 rounded-full', getPhaseColor(status))}>
                <Icon className="h-4 w-4" />
              </div>
              {status.actionCount && status.actionCount > 0 && (
                <span className="mt-1 text-[10px] font-medium text-amber-600">
                  {status.actionCount}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-sm">
              <p className="font-medium">
                {isSpanish ? CYCLE_PHASE_LABELS[currentPhase].es : CYCLE_PHASE_LABELS[currentPhase].en}
              </p>
              <p className="text-muted-foreground text-xs">
                {isSpanish ? status.detailEs : status.detail}
              </p>
              <p className="text-xs mt-1">{cycleState.periodLabel}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view - show all phases
  const displayPhases: CyclePhase[] = ['import', 'calculate', 'reconcile', 'approve', 'pay'];

  return (
    <div className="px-3 py-4">
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {isSpanish ? 'El Ciclo' : 'The Cycle'}
        </h3>
      </div>

      {/* Phase Pipeline */}
      <div className="flex items-center justify-between mb-3">
        {displayPhases.map((phase, index) => {
          const Icon = PHASE_ICONS[phase];
          const status = cycleState.phaseStatuses[phase];
          const isActive = cycleState.currentPhase === phase;

          return (
            <div key={phase} className="flex items-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handlePhaseClick(phase)}
                      className={cn(
                        'relative flex items-center justify-center rounded-full transition-all',
                        isActive ? 'w-10 h-10' : 'w-8 h-8',
                        getPhaseColor(status),
                        'hover:ring-2 hover:ring-offset-2 hover:ring-blue-300'
                      )}
                    >
                      <Icon className={cn('transition-all', isActive ? 'h-5 w-5' : 'h-4 w-4')} />
                      {status.actionCount && status.actionCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                          {status.actionCount}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-sm">
                      <p className="font-medium">
                        {isSpanish ? CYCLE_PHASE_LABELS[phase].es : CYCLE_PHASE_LABELS[phase].en}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {isSpanish ? status.detailEs : status.detail}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Connector line */}
              {index < displayPhases.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-3 mx-0.5',
                    getConnectorColor(phase)
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Period and Status */}
      <div className="text-xs">
        <p className="font-medium text-slate-700">{cycleState.periodLabel}</p>
        <p className="text-slate-500">
          {isSpanish
            ? cycleState.phaseStatuses[cycleState.currentPhase].detailEs
            : cycleState.phaseStatuses[cycleState.currentPhase].detail}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-500">{isSpanish ? 'Progreso' : 'Progress'}</span>
          <span className="font-medium text-slate-700">{cycleState.completionPercentage}%</span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${cycleState.completionPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
