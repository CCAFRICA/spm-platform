/**
 * CompensationClockService -- The Circadian Clock
 *
 * ONE unified service that powers Cycle, Queue, and Pulse.
 * Modeled on the mammalian circadian clock:
 *
 *   THE CYCLE  = central pacemaker (SCN) -- drives the compensation rhythm
 *   THE QUEUE  = peripheral oscillators -- persona-specific action items
 *   THE PULSE  = feedback loops -- detect deviation, amplify health signals
 *
 * All three read from the same source of truth and update atomically:
 *   - Calculation Lifecycle State Machine (OB-34)
 *   - Data Layer (localStorage)
 *   - Calculation Results
 *
 * When the lifecycle transitions, ALL THREE reflect the new state.
 */

import type { CycleState, CyclePhase, QueueItem, PulseMetric } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import {
  listCycles,
  type CalculationState,
} from '@/lib/calculation/calculation-lifecycle-service';
import { getCycleState as getBaseCycleState } from '@/lib/navigation/cycle-service';
import { getQueueItems as getBaseQueueItems } from '@/lib/navigation/queue-service';
import { getPulseMetrics as getBasePulseMetrics } from '@/lib/navigation/pulse-service';

// =============================================================================
// TYPES
// =============================================================================

export type PersonaType = 'vl_admin' | 'platform_admin' | 'manager' | 'sales_rep';

export interface PeriodState {
  period: string;           // 'YYYY-MM'
  periodLabel: string;      // 'Jan 2025'
  lifecycleState: CalculationState | 'AWAITING_DATA';
  phase: CyclePhase;
  progress: number;         // 0-100
  isActive: boolean;        // Is this the current working period?
}

export interface ClockSnapshot {
  cycle: CycleState;
  periods: PeriodState[];
  nextAction: string;
  queue: QueueItem[];
  pulse: PulseMetric[];
  timestamp: string;
}

// =============================================================================
// LIFECYCLE STATE -> CYCLE PHASE MAPPING
// =============================================================================

const STATE_TO_PHASE: Record<CalculationState | 'AWAITING_DATA', { phase: CyclePhase; progress: number }> = {
  AWAITING_DATA:     { phase: 'import',    progress: 0 },
  DRAFT:             { phase: 'import',    progress: 10 },
  PREVIEW:           { phase: 'calculate', progress: 40 },
  OFFICIAL:          { phase: 'reconcile', progress: 60 },
  PENDING_APPROVAL:  { phase: 'approve',   progress: 80 },
  APPROVED:          { phase: 'pay',       progress: 100 },
  REJECTED:          { phase: 'calculate', progress: 30 },
  PAID:              { phase: 'closed',    progress: 100 },
};

// =============================================================================
// PERSONA -> ROLE MAPPING
// =============================================================================

function personaToRole(persona: PersonaType): UserRole {
  switch (persona) {
    case 'vl_admin': return 'vl_admin';
    case 'platform_admin': return 'admin';
    case 'manager': return 'manager';
    case 'sales_rep': return 'sales_rep';
  }
}

// =============================================================================
// THE COMPENSATION CLOCK SERVICE
// =============================================================================

/**
 * Get the current cycle state for the active period.
 * Reads from the lifecycle state machine when available, falls back to
 * the base cycle-service heuristics.
 */
export function getCycleState(tenantId: string): CycleState {
  // Try lifecycle state machine first (OB-34)
  const cycles = listCycles(tenantId);
  if (cycles.length > 0) {
    const activeCycle = cycles[0]; // Most recent
    const mapping = STATE_TO_PHASE[activeCycle.state];
    const baseCycle = getBaseCycleState(tenantId);

    // Overlay lifecycle state onto the base cycle for richer phase details
    return {
      ...baseCycle,
      currentPhase: mapping.phase,
      completionPercentage: mapping.progress,
    };
  }

  // Fall back to existing heuristic-based cycle state
  return getBaseCycleState(tenantId);
}

/**
 * Get all periods with calculation data, sorted most recent first.
 * Scans localStorage for lifecycle cycles and calculation runs.
 */
export function getAllPeriods(tenantId: string): PeriodState[] {
  const periods: PeriodState[] = [];
  const seenPeriods = new Set<string>();

  // Source 1: Lifecycle cycles (OB-34)
  const cycles = listCycles(tenantId);
  for (const cycle of cycles) {
    if (seenPeriods.has(cycle.period)) continue;
    seenPeriods.add(cycle.period);

    const mapping = STATE_TO_PHASE[cycle.state];
    periods.push({
      period: cycle.period,
      periodLabel: formatPeriodLabel(cycle.period),
      lifecycleState: cycle.state,
      phase: mapping.phase,
      progress: mapping.progress,
      isActive: false, // Will set the first one as active below
    });
  }

  // Source 2: Calculation runs (for periods without lifecycle entries)
  if (typeof window !== 'undefined') {
    try {
      const runsStr = localStorage.getItem('vialuce_calculation_runs');
      if (runsStr) {
        const runs: Array<{ tenantId: string; periodId: string; status: string }> = JSON.parse(runsStr);
        const tenantRuns = runs.filter(r => r.tenantId === tenantId);
        for (const run of tenantRuns) {
          if (seenPeriods.has(run.periodId)) continue;
          seenPeriods.add(run.periodId);

          const state: CalculationState = run.status === 'completed' ? 'PREVIEW' : 'DRAFT';
          const mapping = STATE_TO_PHASE[state];
          periods.push({
            period: run.periodId,
            periodLabel: formatPeriodLabel(run.periodId),
            lifecycleState: state,
            phase: mapping.phase,
            progress: mapping.progress,
            isActive: false,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // Sort by period descending (most recent first)
  periods.sort((a, b) => b.period.localeCompare(a.period));

  // Mark the first one as active
  if (periods.length > 0) {
    periods[0].isActive = true;
  }

  return periods;
}

/**
 * Get the next recommended action for a persona in the current cycle.
 * Returns a verb phrase that describes what the user should do next.
 */
export function getNextAction(tenantId: string, persona: PersonaType): string {
  const cycle = getCycleState(tenantId);
  const phase = cycle.currentPhase;

  switch (persona) {
    case 'vl_admin':
    case 'platform_admin':
      return getAdminNextAction(phase, tenantId);
    case 'manager':
      return getManagerNextAction(phase);
    case 'sales_rep':
      return getRepNextAction(phase);
  }
}

/**
 * Get queue items filtered by persona.
 * Wraps the base queue service with persona-type mapping.
 */
export function getQueueItems(tenantId: string, persona: PersonaType, userId: string = 'system'): QueueItem[] {
  const role = personaToRole(persona);
  return getBaseQueueItems(userId, tenantId, role);
}

/**
 * Get pulse metrics filtered by persona.
 * Wraps the base pulse service with persona-type mapping.
 */
export function getPulseMetrics(tenantId: string, persona: PersonaType, userId: string = 'system'): PulseMetric[] {
  const role = personaToRole(persona);
  return getBasePulseMetrics(userId, tenantId, role);
}

/**
 * Get a full atomic snapshot of all three expressions.
 * Guarantees Cycle, Queue, and Pulse are consistent.
 */
export function getClockSnapshot(
  tenantId: string,
  persona: PersonaType,
  userId: string = 'system'
): ClockSnapshot {
  return {
    cycle: getCycleState(tenantId),
    periods: getAllPeriods(tenantId),
    nextAction: getNextAction(tenantId, persona),
    queue: getQueueItems(tenantId, persona, userId),
    pulse: getPulseMetrics(tenantId, persona, userId),
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// NEXT ACTION HELPERS
// =============================================================================

function getAdminNextAction(phase: CyclePhase, tenantId: string): string {
  // Check actual system state for more specific actions
  if (typeof window !== 'undefined') {
    const hasPlans = checkHasPlans(tenantId);
    if (!hasPlans) return 'Import Commission Plan';

    const hasData = checkHasData(tenantId);
    if (!hasData) return 'Import Performance Data';
  }

  switch (phase) {
    case 'import': return 'Import Data';
    case 'calculate': return 'Run Preview';
    case 'reconcile': return 'Review Results';
    case 'approve': return 'Submit for Approval';
    case 'pay': return 'Process Payroll';
    case 'closed': return 'Start Next Period';
    default: return 'Review Dashboard';
  }
}

function getManagerNextAction(phase: CyclePhase): string {
  switch (phase) {
    case 'approve': return 'Review Team Results';
    case 'pay': return 'Confirm Team Payouts';
    case 'closed': return 'View Team Summary';
    default: return 'Monitor Team Performance';
  }
}

function getRepNextAction(phase: CyclePhase): string {
  switch (phase) {
    case 'pay':
    case 'closed': return 'View Statement';
    default: return 'Check Performance';
  }
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function formatPeriodLabel(period: string): string {
  // 'YYYY-MM' -> 'Jan 2025'
  const parts = period.split('-');
  if (parts.length !== 2) return period;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(parts[1], 10) - 1;

  if (monthIndex >= 0 && monthIndex < 12) {
    return `${monthNames[monthIndex]} ${parts[0]}`;
  }
  return period;
}

function checkHasPlans(tenantId: string): boolean {
  try {
    const stored = localStorage.getItem('vialuce_plans');
    if (!stored) return false;
    const plans = JSON.parse(stored);
    return plans.some((p: { tenantId: string }) => p.tenantId === tenantId);
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function checkHasData(_tenantId: string): boolean {
  try {
    const batchesData = localStorage.getItem('data_layer_batches');
    if (!batchesData) return false;
    const batches: [string, { status: string }][] = JSON.parse(batchesData);
    return batches.some(([, b]) => b.status === 'committed');
  } catch {
    return false;
  }
}
