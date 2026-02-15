/**
 * CompensationClockService -- The Circadian Clock
 *
 * ONE unified service that powers Cycle, Queue, and Pulse.
 *
 * OB-43A: Supabase cutover — all data reads from Supabase, no localStorage.
 * All three sub-services are now async.
 */

import type { CycleState, CyclePhase, QueueItem, PulseMetric } from '@/types/navigation';
import type { UserRole } from '@/types/auth';
import { listCalculationBatches } from '@/lib/supabase/calculation-service';
import { getRuleSets } from '@/lib/supabase/rule-set-service';
import { getCycleState as getBaseCycleState } from '@/lib/navigation/cycle-service';
import { getQueueItems as getBaseQueueItems } from '@/lib/navigation/queue-service';
import { getPulseMetrics as getBasePulseMetrics } from '@/lib/navigation/pulse-service';

// =============================================================================
// TYPES
// =============================================================================

export type PersonaType = 'vl_admin' | 'platform_admin' | 'manager' | 'sales_rep';

export interface PeriodState {
  period: string;
  periodLabel: string;
  lifecycleState: string;
  phase: CyclePhase;
  progress: number;
  isActive: boolean;
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

const STATE_TO_PHASE: Record<string, { phase: CyclePhase; progress: number }> = {
  AWAITING_DATA:     { phase: 'import',    progress: 0 },
  DRAFT:             { phase: 'import',    progress: 10 },
  PREVIEW:           { phase: 'calculate', progress: 30 },
  RECONCILE:         { phase: 'reconcile', progress: 45 },
  OFFICIAL:          { phase: 'reconcile', progress: 55 },
  PENDING_APPROVAL:  { phase: 'approve',   progress: 65 },
  REJECTED:          { phase: 'calculate', progress: 25 },
  APPROVED:          { phase: 'approve',   progress: 75 },
  POSTED:            { phase: 'pay',       progress: 82 },
  CLOSED:            { phase: 'closed',    progress: 100 },
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
// THE COMPENSATION CLOCK SERVICE (async — Supabase)
// =============================================================================

/**
 * Get the current cycle state for the active period.
 */
export async function getCycleState(tenantId: string, isSpanish: boolean = false): Promise<CycleState> {
  try {
    const batches = await listCalculationBatches(tenantId);
    const activeBatch = batches.find(b => !b.superseded_by) || batches[0] || null;
    if (activeBatch) {
      const mapping = STATE_TO_PHASE[activeBatch.lifecycle_state] || STATE_TO_PHASE['DRAFT'];
      const baseCycle = await getBaseCycleState(tenantId, isSpanish);

      return {
        ...baseCycle,
        currentPhase: mapping.phase,
        completionPercentage: mapping.progress,
      };
    }
  } catch {
    // Fall through to base cycle state
  }

  return getBaseCycleState(tenantId, isSpanish);
}

/**
 * Get all periods with calculation data, sorted most recent first.
 */
export async function getAllPeriods(tenantId: string, isSpanish: boolean = false): Promise<PeriodState[]> {
  const periods: PeriodState[] = [];
  const seenPeriods = new Set<string>();

  try {
    const batches = await listCalculationBatches(tenantId);
    for (const batch of batches) {
      const period = batch.period_id;
      if (!period || seenPeriods.has(period)) continue;
      seenPeriods.add(period);

      const state = batch.lifecycle_state || 'DRAFT';
      const mapping = STATE_TO_PHASE[state] || STATE_TO_PHASE['DRAFT'];

      periods.push({
        period,
        periodLabel: formatPeriodLabel(period, isSpanish),
        lifecycleState: state,
        phase: mapping.phase,
        progress: mapping.progress,
        isActive: false,
      });
    }
  } catch {
    // Supabase unavailable
  }

  periods.sort((a, b) => b.period.localeCompare(a.period));

  if (periods.length > 0) {
    periods[0].isActive = true;
  }

  return periods;
}

/**
 * Get the next recommended action for a persona in the current cycle.
 */
export async function getNextAction(tenantId: string, persona: PersonaType, isSpanish: boolean = false): Promise<string> {
  const cycle = await getCycleState(tenantId, isSpanish);
  const phase = cycle.currentPhase;

  switch (persona) {
    case 'vl_admin':
    case 'platform_admin':
      return await getAdminNextAction(phase, tenantId, isSpanish);
    case 'manager':
      return getManagerNextAction(phase, isSpanish);
    case 'sales_rep':
      return getRepNextAction(phase, isSpanish);
  }
}

/**
 * Get queue items filtered by persona.
 */
export async function getQueueItems(tenantId: string, persona: PersonaType, userId: string = 'system'): Promise<QueueItem[]> {
  const role = personaToRole(persona);
  return getBaseQueueItems(userId, tenantId, role);
}

/**
 * Get pulse metrics filtered by persona.
 */
export async function getPulseMetrics(tenantId: string, persona: PersonaType, userId: string = 'system'): Promise<PulseMetric[]> {
  const role = personaToRole(persona);
  return getBasePulseMetrics(userId, tenantId, role);
}

/**
 * Get a full atomic snapshot of all three expressions.
 */
export async function getClockSnapshot(
  tenantId: string,
  persona: PersonaType,
  userId: string = 'system'
): Promise<ClockSnapshot> {
  const [cycle, periods, nextAction, queue, pulse] = await Promise.all([
    getCycleState(tenantId),
    getAllPeriods(tenantId),
    getNextAction(tenantId, persona),
    getQueueItems(tenantId, persona, userId),
    getPulseMetrics(tenantId, persona, userId),
  ]);

  return {
    cycle,
    periods,
    nextAction,
    queue,
    pulse,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// NEXT ACTION HELPERS
// =============================================================================

async function getAdminNextAction(phase: CyclePhase, tenantId: string, isSpanish: boolean): Promise<string> {
  try {
    const ruleSets = await getRuleSets(tenantId);
    if (ruleSets.length === 0) return isSpanish ? 'Importar Plan de Comisiones' : 'Import Commission Plan';

    const batches = await listCalculationBatches(tenantId);
    if (batches.length === 0) return isSpanish ? 'Importar Datos de Rendimiento' : 'Import Performance Data';
  } catch {
    // Fall through to phase-based action
  }

  switch (phase) {
    case 'import': return isSpanish ? 'Importar Datos' : 'Import Data';
    case 'calculate': return isSpanish ? 'Ejecutar Vista Previa' : 'Run Preview';
    case 'reconcile': return isSpanish ? 'Revisar Resultados' : 'Review Results';
    case 'approve': return isSpanish ? 'Enviar para Aprobacion' : 'Submit for Approval';
    case 'pay': return isSpanish ? 'Procesar Nomina' : 'Process Payroll';
    case 'closed': return isSpanish ? 'Iniciar Siguiente Periodo' : 'Start Next Period';
    default: return isSpanish ? 'Revisar Tablero' : 'Review Dashboard';
  }
}

function getManagerNextAction(phase: CyclePhase, isSpanish: boolean): string {
  switch (phase) {
    case 'approve': return isSpanish ? 'Revisar Resultados del Equipo' : 'Review Team Results';
    case 'pay': return isSpanish ? 'Confirmar Pagos del Equipo' : 'Confirm Team Payouts';
    case 'closed': return isSpanish ? 'Ver Resumen del Equipo' : 'View Team Summary';
    default: return isSpanish ? 'Monitorear Rendimiento del Equipo' : 'Monitor Team Performance';
  }
}

function getRepNextAction(phase: CyclePhase, isSpanish: boolean): string {
  switch (phase) {
    case 'pay':
    case 'closed': return isSpanish ? 'Ver Estado de Cuenta' : 'View Statement';
    default: return isSpanish ? 'Revisar Rendimiento' : 'Check Performance';
  }
}

// =============================================================================
// INTERNAL HELPERS (pure functions — no localStorage)
// =============================================================================

function formatPeriodLabel(period: string, isSpanish: boolean = false): string {
  const parts = period.split('-');
  if (parts.length !== 2) return period;

  const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNamesEs = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthIndex = parseInt(parts[1], 10) - 1;

  if (monthIndex >= 0 && monthIndex < 12) {
    const names = isSpanish ? monthNamesEs : monthNamesEn;
    return `${names[monthIndex]} ${parts[0]}`;
  }
  return period;
}
