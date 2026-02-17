'use client';

/**
 * Cycle Indicator Component
 *
 * Visual representation of the compensation cycle progress.
 * Shows: Import -> Calculate -> Reconcile -> Approve -> Pay
 *
 * Powered by CompensationClockService (OB-36):
 * - cycleState: current phase + progress from lifecycle state machine
 * - periodStates: multi-period timeline (most recent first)
 * - nextAction: contextual verb phrase for the active persona
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
import type { PeriodState } from '@/lib/navigation/compensation-clock-service';
import {
  Upload,
  Calculator,
  GitCompare,
  CheckCircle,
  Wallet,
  Lock,
  ChevronRight,
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
  const { cycleState, periodStates, nextAction, isSpanish } = useCycleState();
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  if (!cycleState) {
    return (
      <div className="px-3 py-4">
        <div className="animate-pulse">
          <div className="h-4 bg-zinc-700 rounded w-24 mb-2" />
          <div className="h-8 bg-zinc-700 rounded" />
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
        return 'bg-zinc-700 text-zinc-400';
    }
  };

  const getConnectorColor = (phase: CyclePhase): string => {
    const status = cycleState.phaseStatuses[phase];
    if (status.state === 'completed') return 'bg-green-500';
    if (status.state === 'in_progress') return 'bg-blue-500';
    return 'bg-zinc-700';
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
              className="w-full flex flex-col items-center py-3 px-2 hover:bg-zinc-800/50 rounded-lg transition-colors"
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
              {nextAction && (
                <p className="text-xs mt-1 font-medium text-blue-600">{nextAction}</p>
              )}
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
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
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
                        'hover:ring-2 hover:ring-offset-1 hover:ring-offset-zinc-950 hover:ring-blue-400/50'
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

      {/* Period and Next Action */}
      <div className="text-xs">
        <p className="font-medium text-zinc-300">{cycleState.periodLabel}</p>
        {nextAction ? (
          <p className="text-blue-400 font-medium flex items-center gap-1 mt-0.5">
            <ChevronRight className="h-3 w-3" />
            {nextAction}
          </p>
        ) : (
          <p className="text-zinc-500">
            {isSpanish
              ? cycleState.phaseStatuses[cycleState.currentPhase].detailEs
              : cycleState.phaseStatuses[cycleState.currentPhase].detail}
          </p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-zinc-500">{isSpanish ? 'Progreso' : 'Progress'}</span>
          <span className="font-medium text-zinc-300">{cycleState.completionPercentage}%</span>
        </div>
        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${cycleState.completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Multi-Period Timeline */}
      {periodStates && periodStates.length > 0 && (
        <PeriodTimeline periods={periodStates} isSpanish={isSpanish} />
      )}
    </div>
  );
}

// =============================================================================
// MULTI-PERIOD TIMELINE SUB-COMPONENT
// =============================================================================

interface PeriodTimelineProps {
  periods: PeriodState[];
  isSpanish: boolean;
}

const LIFECYCLE_STATE_LABELS: Record<string, { en: string; es: string }> = {
  AWAITING_DATA:    { en: 'Awaiting Data',    es: 'Esperando Datos' },
  DRAFT:            { en: 'Draft',            es: 'Borrador' },
  PREVIEW:          { en: 'Preview',          es: 'Vista Previa' },
  OFFICIAL:         { en: 'Official',         es: 'Oficial' },
  PENDING_APPROVAL: { en: 'Pending Approval', es: 'Pendiente de Aprobacion' },
  APPROVED:         { en: 'Approved',         es: 'Aprobado' },
  REJECTED:         { en: 'Rejected',         es: 'Rechazado' },
  PAID:             { en: 'Paid',             es: 'Pagado' },
};

function getLifecycleColor(state: string): string {
  switch (state) {
    case 'APPROVED':
    case 'PAID':
      return 'bg-green-500/15 text-green-400';
    case 'OFFICIAL':
    case 'PREVIEW':
      return 'bg-blue-500/15 text-blue-400';
    case 'PENDING_APPROVAL':
      return 'bg-amber-500/15 text-amber-400';
    case 'REJECTED':
      return 'bg-red-500/15 text-red-400';
    case 'DRAFT':
      return 'bg-zinc-700 text-zinc-400';
    case 'AWAITING_DATA':
    default:
      return 'bg-zinc-800 text-zinc-500';
  }
}

function PeriodTimeline({ periods, isSpanish }: PeriodTimelineProps) {
  if (periods.length <= 1) return null;

  // Show up to 4 most recent periods
  const displayPeriods = periods.slice(0, 4);

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800">
      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
        {isSpanish ? 'Periodos' : 'Periods'}
      </h4>
      <div className="space-y-1.5">
        {displayPeriods.map((period) => {
          const stateLabel = LIFECYCLE_STATE_LABELS[period.lifecycleState];
          return (
            <div
              key={period.period}
              className={cn(
                'flex items-center justify-between text-[11px] px-2 py-1 rounded',
                period.isActive ? 'bg-zinc-800/50' : ''
              )}
            >
              <span className={cn(
                'font-medium',
                period.isActive ? 'text-zinc-200' : 'text-zinc-500'
              )}>
                {period.periodLabel}
              </span>
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                getLifecycleColor(period.lifecycleState)
              )}>
                {stateLabel
                  ? (isSpanish ? stateLabel.es : stateLabel.en)
                  : period.lifecycleState}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
