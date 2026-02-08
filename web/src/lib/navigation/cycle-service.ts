/**
 * Cycle Service
 *
 * Determines the current phase of the compensation cycle based on real system state.
 * Provides the data needed for the Cycle Indicator in Mission Control.
 */

import type { CycleState, CyclePhase, PhaseStatus } from '@/types/navigation';

// =============================================================================
// CYCLE STATE DETERMINATION
// =============================================================================

/**
 * Get the current cycle state for a tenant
 */
export function getCycleState(tenantId: string): CycleState {
  // Get current period info
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const periodLabel = `${monthNames[month]} ${year}`;
  const periodId = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Check system state from localStorage to determine phases
  const phaseStatuses = determinePhaseStatuses(tenantId, periodId);

  // Determine current phase
  const currentPhase = determineCurrentPhase(phaseStatuses);

  // Calculate completion percentage
  const completionPercentage = calculateCompletionPercentage(phaseStatuses);

  // Count pending actions
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
 * Determine the status of each phase based on system data
 */
function determinePhaseStatuses(tenantId: string, periodId: string): Record<CyclePhase, PhaseStatus> {
  if (typeof window === 'undefined') {
    return getDefaultPhaseStatuses();
  }

  // Check for import data
  const hasImportData = checkHasImportData(tenantId, periodId);

  // Check for calculation results
  const hasCalculations = checkHasCalculations(tenantId, periodId);

  // Check for reconciliation
  const hasReconciliation = checkHasReconciliation(tenantId, periodId);

  // Check for pending approvals
  const pendingApprovals = checkPendingApprovals(tenantId, periodId);

  // Check for payroll status
  const payrollStatus = checkPayrollStatus(tenantId, periodId);

  return {
    import: {
      state: hasImportData ? 'completed' : 'in_progress',
      detail: hasImportData ? 'Data imported successfully' : 'Awaiting data import',
      detailEs: hasImportData ? 'Datos importados correctamente' : 'Esperando importación de datos',
      actionCount: hasImportData ? 0 : 1,
    },
    calculate: {
      state: hasCalculations ? 'completed' : (hasImportData ? 'in_progress' : 'not_started'),
      detail: hasCalculations ? 'Calculations complete' : (hasImportData ? 'Ready to calculate' : 'Waiting for import'),
      detailEs: hasCalculations ? 'Cálculos completos' : (hasImportData ? 'Listo para calcular' : 'Esperando importación'),
      actionCount: hasCalculations ? 0 : (hasImportData ? 1 : 0),
    },
    reconcile: {
      state: hasReconciliation ? 'completed' : (hasCalculations ? 'in_progress' : 'not_started'),
      detail: hasReconciliation ? 'Reconciliation complete' : (hasCalculations ? 'Review mismatches' : 'Waiting for calculations'),
      detailEs: hasReconciliation ? 'Conciliación completa' : (hasCalculations ? 'Revisar diferencias' : 'Esperando cálculos'),
      actionCount: hasReconciliation ? 0 : 3, // Mock: 3 mismatches to review
    },
    approve: {
      state: pendingApprovals === 0 && hasReconciliation ? 'completed' : (hasReconciliation ? 'in_progress' : 'not_started'),
      detail: pendingApprovals > 0 ? `${pendingApprovals} pending approvals` : 'All approved',
      detailEs: pendingApprovals > 0 ? `${pendingApprovals} aprobaciones pendientes` : 'Todo aprobado',
      actionCount: pendingApprovals,
    },
    pay: {
      state: payrollStatus === 'finalized' ? 'completed' : (payrollStatus === 'processing' ? 'in_progress' : 'not_started'),
      detail: payrollStatus === 'finalized' ? 'Payroll finalized' : 'Awaiting approval completion',
      detailEs: payrollStatus === 'finalized' ? 'Nómina finalizada' : 'Esperando completar aprobaciones',
      actionCount: 0,
    },
    closed: {
      state: payrollStatus === 'finalized' ? 'completed' : 'not_started',
      detail: payrollStatus === 'finalized' ? 'Period closed' : 'Period open',
      detailEs: payrollStatus === 'finalized' ? 'Período cerrado' : 'Período abierto',
      actionCount: 0,
    },
  };
}

/**
 * Get default phase statuses when no data is available
 */
function getDefaultPhaseStatuses(): Record<CyclePhase, PhaseStatus> {
  return {
    import: { state: 'in_progress', detail: 'Ready to import data', detailEs: 'Listo para importar datos', actionCount: 1 },
    calculate: { state: 'not_started', detail: 'Waiting for import', detailEs: 'Esperando importación' },
    reconcile: { state: 'not_started', detail: 'Waiting for calculations', detailEs: 'Esperando cálculos' },
    approve: { state: 'not_started', detail: 'Waiting for reconciliation', detailEs: 'Esperando conciliación' },
    pay: { state: 'not_started', detail: 'Waiting for approvals', detailEs: 'Esperando aprobaciones' },
    closed: { state: 'not_started', detail: 'Period open', detailEs: 'Período abierto' },
  };
}

/**
 * Determine the current active phase
 */
function determineCurrentPhase(statuses: Record<CyclePhase, PhaseStatus>): CyclePhase {
  const phaseOrder: CyclePhase[] = ['import', 'calculate', 'reconcile', 'approve', 'pay', 'closed'];

  for (const phase of phaseOrder) {
    if (statuses[phase].state === 'in_progress' || statuses[phase].state === 'warning' || statuses[phase].state === 'blocked') {
      return phase;
    }
  }

  // If all complete, return closed; otherwise return first incomplete
  for (const phase of phaseOrder) {
    if (statuses[phase].state !== 'completed') {
      return phase;
    }
  }

  return 'closed';
}

/**
 * Calculate overall completion percentage
 */
function calculateCompletionPercentage(statuses: Record<CyclePhase, PhaseStatus>): number {
  const phases: CyclePhase[] = ['import', 'calculate', 'reconcile', 'approve', 'pay'];
  const completedCount = phases.filter(p => statuses[p].state === 'completed').length;
  return Math.round((completedCount / phases.length) * 100);
}

/**
 * Count total pending actions across phases
 */
function countPendingActions(statuses: Record<CyclePhase, PhaseStatus>): number {
  return Object.values(statuses).reduce((sum, status) => sum + (status.actionCount || 0), 0);
}

// =============================================================================
// DATA CHECKING FUNCTIONS
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function checkHasImportData(tenantId: string, periodId: string): boolean {
  try {
    // Check if any transactions exist for the period
    const transactionsKey = `${tenantId}_transactions`;
    const transactions = localStorage.getItem(transactionsKey);
    if (transactions) {
      const parsed = JSON.parse(transactions);
      return Array.isArray(parsed) && parsed.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

function checkHasCalculations(tenantId: string, periodId: string): boolean {
  try {
    // Check for calculation results
    const calcKey = `${tenantId}_calculations_${periodId}`;
    const calculations = localStorage.getItem(calcKey);
    return !!calculations;
  } catch {
    return false;
  }
}

function checkHasReconciliation(tenantId: string, periodId: string): boolean {
  try {
    // Check for reconciliation results
    const reconKey = `${tenantId}_reconciliation_${periodId}`;
    const reconciliation = localStorage.getItem(reconKey);
    return !!reconciliation;
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function checkPendingApprovals(tenantId: string, periodId: string): number {
  try {
    // Check pending approvals from the approval routing service
    const approvalsKey = `${tenantId}_pending_approvals`;
    const approvals = localStorage.getItem(approvalsKey);
    if (approvals) {
      const parsed = JSON.parse(approvals);
      return Array.isArray(parsed) ? parsed.filter((a: { status: string }) => a.status === 'pending').length : 0;
    }
    // Return mock number for demo
    return 5;
  } catch {
    return 5; // Mock pending approvals
  }
}

function checkPayrollStatus(tenantId: string, periodId: string): 'not_started' | 'processing' | 'finalized' {
  try {
    const payrollKey = `${tenantId}_payroll_${periodId}`;
    const payroll = localStorage.getItem(payrollKey);
    if (payroll) {
      const parsed = JSON.parse(payroll);
      return parsed.status || 'not_started';
    }
    return 'not_started';
  } catch {
    return 'not_started';
  }
}

// =============================================================================
// CYCLE NAVIGATION
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
