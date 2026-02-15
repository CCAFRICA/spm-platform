/**
 * Cycle Service
 *
 * Determines the current phase of the compensation cycle based on real Supabase state.
 * Provides the data needed for the Cycle Indicator in Mission Control.
 *
 * OB-43A: Supabase cutover — all data reads from Supabase, no localStorage.
 */

import type { CycleState, CyclePhase, PhaseStatus } from '@/types/navigation';
import {
  listCalculationBatches,
} from '@/lib/supabase/calculation-service';
import { getRuleSets } from '@/lib/supabase/rule-set-service';
import { getStateLabel } from '@/lib/calculation/lifecycle-utils';

// =============================================================================
// CYCLE STATE DETERMINATION (async — reads from Supabase)
// =============================================================================

/**
 * Get the current cycle state for a tenant
 */
export async function getCycleState(tenantId: string, isSpanish: boolean = false): Promise<CycleState> {
  const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthNamesEs = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const names = isSpanish ? monthNamesEs : monthNamesEn;

  // Detect working period from Supabase batches
  const detectedPeriod = await detectWorkingPeriod(tenantId);

  let periodId: string;
  let periodLabel: string;

  if (detectedPeriod) {
    periodId = detectedPeriod;
    const parts = detectedPeriod.split('-');
    const monthIndex = parseInt(parts[1], 10) - 1;
    periodLabel = (monthIndex >= 0 && monthIndex < 12)
      ? `${names[monthIndex]} ${parts[0]}`
      : detectedPeriod;
  } else {
    const now = new Date();
    periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    periodLabel = `${names[now.getMonth()]} ${now.getFullYear()}`;
  }

  // Determine phase statuses from Supabase
  const phaseStatuses = await determinePhaseStatuses(tenantId, periodId);
  const currentPhase = determineCurrentPhase(phaseStatuses);
  const completionPercentage = calculateCompletionPercentage(phaseStatuses);
  const pendingActions = countPendingActions(phaseStatuses);

  return {
    currentPhase,
    periodLabel,
    periodId,
    phaseStatuses,
    pendingActions,
    completionPercentage,
  };
}

/**
 * Determine the status of each phase based on Supabase data
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function determinePhaseStatuses(tenantId: string, _periodId: string): Promise<Record<CyclePhase, PhaseStatus>> {
  try {
    const ruleSets = await getRuleSets(tenantId);
    const hasPlans = ruleSets.length > 0;

    const batches = await listCalculationBatches(tenantId);
    const hasCalculations = batches.length > 0;

    const activeBatch = batches.find(b => !b.superseded_by) || batches[0] || null;
    const lifecycleState = activeBatch?.lifecycle_state || null;

    const hasImportData = hasPlans; // If we have plans, import is done
    const isApproved = lifecycleState && ['APPROVED', 'POSTED', 'CLOSED'].includes(lifecycleState);
    const isPending = lifecycleState === 'PENDING_APPROVAL';
    const isPosted = lifecycleState && ['POSTED', 'CLOSED'].includes(lifecycleState);
    const isClosed = lifecycleState === 'CLOSED';

    const stateLabel = lifecycleState ? getStateLabel(lifecycleState) : '';

    return {
      import: {
        state: hasImportData ? 'completed' : 'in_progress',
        detail: hasImportData ? 'Data imported' : 'Awaiting data import',
        detailEs: hasImportData ? 'Datos importados' : 'Esperando importacion de datos',
        actionCount: hasImportData ? 0 : 1,
      },
      calculate: {
        state: hasCalculations ? 'completed' : (hasImportData ? 'in_progress' : 'not_started'),
        detail: hasCalculations
          ? `Calculations complete${stateLabel ? ` [${stateLabel}]` : ''}`
          : (hasImportData ? 'Ready to calculate' : 'Waiting for import'),
        detailEs: hasCalculations
          ? `Calculos completos${stateLabel ? ` [${stateLabel}]` : ''}`
          : (hasImportData ? 'Listo para calcular' : 'Esperando importacion'),
        actionCount: hasCalculations ? 0 : (hasImportData ? 1 : 0),
      },
      reconcile: {
        state: hasCalculations ? 'completed' : 'not_started',
        detail: hasCalculations ? 'Review available' : 'Waiting for calculations',
        detailEs: hasCalculations ? 'Revision disponible' : 'Esperando calculos',
        actionCount: 0,
      },
      approve: {
        state: isApproved ? 'completed' : (isPending ? 'in_progress' : 'not_started'),
        detail: isApproved ? 'Approved' : (isPending ? 'Awaiting approver action' : 'Waiting for reconciliation'),
        detailEs: isApproved ? 'Aprobado' : (isPending ? 'Esperando accion del aprobador' : 'Esperando conciliacion'),
        actionCount: isPending ? 1 : 0,
      },
      pay: {
        state: isClosed ? 'completed' : (isPosted ? 'in_progress' : 'not_started'),
        detail: isClosed ? 'Period closed' : (isPosted ? 'Results posted - ready for payroll' : 'Awaiting approval'),
        detailEs: isClosed ? 'Periodo cerrado' : (isPosted ? 'Resultados publicados - listo para nomina' : 'Esperando aprobacion'),
        actionCount: isPosted && !isClosed ? 1 : 0,
      },
      closed: {
        state: isClosed ? 'completed' : 'not_started',
        detail: isClosed ? 'Period closed' : 'Period open',
        detailEs: isClosed ? 'Periodo cerrado' : 'Periodo abierto',
        actionCount: 0,
      },
    };
  } catch {
    return getDefaultPhaseStatuses();
  }
}

/**
 * Detect the working period from Supabase batches
 */
async function detectWorkingPeriod(tenantId: string): Promise<string | null> {
  try {
    const batches = await listCalculationBatches(tenantId);
    if (batches.length > 0 && batches[0].period_id) {
      return batches[0].period_id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get default phase statuses when no data is available
 */
function getDefaultPhaseStatuses(): Record<CyclePhase, PhaseStatus> {
  return {
    import: { state: 'in_progress', detail: 'Ready to import data', detailEs: 'Listo para importar datos', actionCount: 1 },
    calculate: { state: 'not_started', detail: 'Waiting for import', detailEs: 'Esperando importacion' },
    reconcile: { state: 'not_started', detail: 'Waiting for calculations', detailEs: 'Esperando calculos' },
    approve: { state: 'not_started', detail: 'Waiting for reconciliation', detailEs: 'Esperando conciliacion' },
    pay: { state: 'not_started', detail: 'Waiting for approvals', detailEs: 'Esperando aprobaciones' },
    closed: { state: 'not_started', detail: 'Period open', detailEs: 'Periodo abierto' },
  };
}

function determineCurrentPhase(statuses: Record<CyclePhase, PhaseStatus>): CyclePhase {
  const phaseOrder: CyclePhase[] = ['import', 'calculate', 'reconcile', 'approve', 'pay', 'closed'];

  for (const phase of phaseOrder) {
    if (statuses[phase].state === 'in_progress' || statuses[phase].state === 'warning' || statuses[phase].state === 'blocked') {
      return phase;
    }
  }

  for (const phase of phaseOrder) {
    if (statuses[phase].state !== 'completed') {
      return phase;
    }
  }

  return 'closed';
}

function calculateCompletionPercentage(statuses: Record<CyclePhase, PhaseStatus>): number {
  const phases: CyclePhase[] = ['import', 'calculate', 'reconcile', 'approve', 'pay'];
  const completedCount = phases.filter(p => statuses[p].state === 'completed').length;
  return Math.round((completedCount / phases.length) * 100);
}

function countPendingActions(statuses: Record<CyclePhase, PhaseStatus>): number {
  return Object.values(statuses).reduce((sum, status) => sum + (status.actionCount || 0), 0);
}

// =============================================================================
// CYCLE NAVIGATION (pure functions — no localStorage)
// =============================================================================

/**
 * Get the route to navigate to for a specific cycle phase
 */
export function getRouteForPhase(phase: CyclePhase): string {
  const phaseRoutes: Record<CyclePhase, string> = {
    import: '/operate/import',
    calculate: '/operate/calculate',
    reconcile: '/operate/reconcile',
    approve: '/operate/approve',
    pay: '/operate/pay',
    closed: '/operate',
  };

  return phaseRoutes[phase];
}

/**
 * Get import details — stub for Supabase (batch metadata)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getImportDetails(_tenantId: string): { count: number; lastImport?: string } {
  return { count: 0 };
}

/**
 * Get reconciliation mismatch count — stub
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getReconciliationMismatches(_tenantId: string, _periodId: string): number {
  return 0;
}
