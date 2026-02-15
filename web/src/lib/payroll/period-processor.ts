/**
 * Period Batch Processor
 *
 * Manages payroll period lifecycle and triggers calculations on status transitions.
 * Implements state machine for period statuses with validation at each transition.
 */

import {
  runPeriodCalculation,
  previewPeriodCalculation,
  type OrchestrationResult,
} from '@/lib/orchestration/calculation-orchestrator';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  PERIODS: 'vialuce_payroll_periods',
  PERIOD_HISTORY: 'vialuce_period_history',
} as const;

// ============================================
// PERIOD TYPES
// ============================================

export type PeriodStatus =
  | 'draft'
  | 'open'
  | 'data_collection'
  | 'calculation_pending'
  | 'calculated'
  | 'review'
  | 'approved'
  | 'finalized'
  | 'paid'
  | 'closed';

export interface PayrollPeriod {
  id: string;
  tenantId: string;
  name: string;
  periodType: 'monthly' | 'semi_monthly' | 'bi_weekly' | 'weekly' | 'quarterly';
  startDate: string;
  endDate: string;
  payDate: string;
  status: PeriodStatus;

  // Data collection
  dataCollectionDeadline?: string;
  dataCollectionComplete: boolean;

  // Calculation
  lastCalculationRun?: string;
  calculationCount: number;

  // Approval
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;

  // Finalization
  finalizedBy?: string;
  finalizedAt?: string;

  // Summary (populated after calculation)
  summary?: PeriodSummary;

  // Audit
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface PeriodSummary {
  totalEmployees: number;
  totalPayout: number;
  averagePayout: number;
  minPayout: number;
  maxPayout: number;
  byPlan: Record<string, { count: number; total: number }>;
  byDepartment: Record<string, { count: number; total: number }>;
  calculatedAt: string;
}

export interface PeriodTransition {
  id: string;
  periodId: string;
  fromStatus: PeriodStatus;
  toStatus: PeriodStatus;
  triggeredBy: string;
  triggeredAt: string;
  notes?: string;
  automaticAction?: string;
  actionResult?: {
    success: boolean;
    details?: string;
    runId?: string;
  };
}

// ============================================
// STATUS TRANSITIONS
// ============================================

const VALID_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  draft: ['open'],
  open: ['data_collection', 'draft'],
  data_collection: ['calculation_pending', 'open'],
  calculation_pending: ['calculated', 'data_collection'],
  calculated: ['review', 'calculation_pending'],
  review: ['approved', 'calculated', 'calculation_pending'],
  approved: ['finalized', 'review'],
  finalized: ['paid', 'approved'],
  paid: ['closed'],
  closed: [], // Terminal state
};

const AUTO_ACTIONS: Partial<Record<PeriodStatus, string>> = {
  calculation_pending: 'run_calculation',
  calculated: 'generate_summary',
};

// ============================================
// PERIOD PROCESSOR CLASS
// ============================================

export class PeriodProcessor {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Create a new payroll period
   */
  createPeriod(
    data: Omit<PayrollPeriod, 'id' | 'tenantId' | 'status' | 'createdAt' | 'calculationCount' | 'dataCollectionComplete'>
  ): PayrollPeriod {
    const period: PayrollPeriod = {
      ...data,
      id: `period-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      tenantId: this.tenantId,
      status: 'draft',
      calculationCount: 0,
      dataCollectionComplete: false,
      createdAt: new Date().toISOString(),
    };

    this.savePeriod(period);
    return period;
  }

  /**
   * Transition period to a new status
   */
  async transitionStatus(
    periodId: string,
    toStatus: PeriodStatus,
    userId: string,
    notes?: string
  ): Promise<{ success: boolean; period?: PayrollPeriod; error?: string; actionResult?: OrchestrationResult }> {
    const period = this.getPeriod(periodId);

    if (!period) {
      return { success: false, error: 'Period not found' };
    }

    // Validate transition
    const validTargets = VALID_TRANSITIONS[period.status];
    if (!validTargets.includes(toStatus)) {
      return {
        success: false,
        error: `Cannot transition from ${period.status} to ${toStatus}. Valid targets: ${validTargets.join(', ')}`,
      };
    }

    // Validate pre-conditions
    const preConditionCheck = this.validatePreConditions(period, toStatus);
    if (!preConditionCheck.valid) {
      return { success: false, error: preConditionCheck.error };
    }

    // Record transition
    const transition: PeriodTransition = {
      id: `trans-${Date.now()}`,
      periodId,
      fromStatus: period.status,
      toStatus,
      triggeredBy: userId,
      triggeredAt: new Date().toISOString(),
      notes,
    };

    // Execute automatic action if defined
    let actionResult: OrchestrationResult | undefined;
    const autoAction = AUTO_ACTIONS[toStatus];

    if (autoAction) {
      transition.automaticAction = autoAction;
      const result = await this.executeAutoAction(period, toStatus, userId);

      if (!result.success) {
        transition.actionResult = { success: false, details: result.error };
        this.saveTransition(transition);
        return { success: false, error: `Automatic action failed: ${result.error}` };
      }

      transition.actionResult = {
        success: true,
        details: result.message,
        runId: result.runId,
      };
      actionResult = result.orchestrationResult;
    }

    // Update period
    const updatedPeriod: PayrollPeriod = {
      ...period,
      status: toStatus,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    };

    // Set status-specific fields
    if (toStatus === 'approved') {
      updatedPeriod.approvedBy = userId;
      updatedPeriod.approvedAt = new Date().toISOString();
      updatedPeriod.approvalNotes = notes;
    }

    if (toStatus === 'finalized') {
      updatedPeriod.finalizedBy = userId;
      updatedPeriod.finalizedAt = new Date().toISOString();
    }

    if (toStatus === 'calculated' && actionResult) {
      updatedPeriod.lastCalculationRun = actionResult.run.id;
      updatedPeriod.calculationCount++;
      updatedPeriod.summary = {
        totalEmployees: actionResult.summary.entitiesProcessed,
        totalPayout: actionResult.summary.totalPayout,
        averagePayout:
          actionResult.summary.entitiesProcessed > 0
            ? actionResult.summary.totalPayout / actionResult.summary.entitiesProcessed
            : 0,
        minPayout: Math.min(...actionResult.results.map((r) => r.totalIncentive)),
        maxPayout: Math.max(...actionResult.results.map((r) => r.totalIncentive)),
        byPlan: actionResult.summary.byPlan,
        byDepartment: actionResult.summary.byDepartment,
        calculatedAt: new Date().toISOString(),
      };
    }

    this.savePeriod(updatedPeriod);
    this.saveTransition(transition);

    return { success: true, period: updatedPeriod, actionResult };
  }

  /**
   * Validate pre-conditions for a status transition
   */
  private validatePreConditions(
    period: PayrollPeriod,
    toStatus: PeriodStatus
  ): { valid: boolean; error?: string } {
    switch (toStatus) {
      case 'calculation_pending':
        // Must have data collection complete or deadline passed
        if (!period.dataCollectionComplete) {
          const deadline = period.dataCollectionDeadline
            ? new Date(period.dataCollectionDeadline)
            : null;
          const now = new Date();

          if (deadline && now < deadline) {
            return {
              valid: false,
              error: `Data collection deadline not reached: ${period.dataCollectionDeadline}`,
            };
          }
        }
        break;

      case 'approved':
        // Must have calculation run
        if (!period.lastCalculationRun) {
          return {
            valid: false,
            error: 'Cannot approve period without calculation run',
          };
        }
        break;

      case 'finalized':
        // Must be approved
        if (!period.approvedBy) {
          return {
            valid: false,
            error: 'Period must be approved before finalization',
          };
        }
        break;

      case 'paid':
        // Must be finalized and pay date reached
        if (!period.finalizedBy) {
          return {
            valid: false,
            error: 'Period must be finalized before marking as paid',
          };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Execute automatic action for status transition
   */
  private async executeAutoAction(
    period: PayrollPeriod,
    status: PeriodStatus,
    userId: string
  ): Promise<{ success: boolean; error?: string; message?: string; runId?: string; orchestrationResult?: OrchestrationResult }> {
    const action = AUTO_ACTIONS[status];

    switch (action) {
      case 'run_calculation':
        try {
          const result = await runPeriodCalculation(this.tenantId, period.id, userId);

          if (!result.success) {
            return {
              success: false,
              error: result.run.errors?.[0]?.error || 'Calculation failed',
            };
          }

          return {
            success: true,
            message: `Calculated ${result.summary.entitiesProcessed} employees, total payout: $${result.summary.totalPayout.toLocaleString()}`,
            runId: result.run.id,
            orchestrationResult: result,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }

      case 'generate_summary':
        // Summary is generated as part of calculation result
        return { success: true, message: 'Summary generated' };

      default:
        return { success: true };
    }
  }

  /**
   * Preview calculation for a period
   */
  async previewCalculation(periodId: string, userId: string): Promise<OrchestrationResult> {
    return previewPeriodCalculation(this.tenantId, periodId, userId);
  }

  /**
   * Force recalculation for a period (if in calculated/review status)
   */
  async recalculate(periodId: string, userId: string): Promise<OrchestrationResult> {
    const period = this.getPeriod(periodId);

    if (!period) {
      throw new Error('Period not found');
    }

    if (!['calculated', 'review'].includes(period.status)) {
      throw new Error(`Cannot recalculate period in ${period.status} status`);
    }

    const result = await runPeriodCalculation(this.tenantId, periodId, userId, {
      forceRecalculate: true,
    });

    if (result.success && result.summary) {
      const updatedPeriod: PayrollPeriod = {
        ...period,
        lastCalculationRun: result.run.id,
        calculationCount: period.calculationCount + 1,
        summary: {
          totalEmployees: result.summary.entitiesProcessed,
          totalPayout: result.summary.totalPayout,
          averagePayout:
            result.summary.entitiesProcessed > 0
              ? result.summary.totalPayout / result.summary.entitiesProcessed
              : 0,
          minPayout: Math.min(...result.results.map((r) => r.totalIncentive)),
          maxPayout: Math.max(...result.results.map((r) => r.totalIncentive)),
          byPlan: result.summary.byPlan,
          byDepartment: result.summary.byDepartment,
          calculatedAt: new Date().toISOString(),
        },
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      this.savePeriod(updatedPeriod);
    }

    return result;
  }

  /**
   * Mark data collection as complete
   */
  markDataCollectionComplete(periodId: string, userId: string): PayrollPeriod | null {
    const period = this.getPeriod(periodId);

    if (!period || period.status !== 'data_collection') {
      return null;
    }

    const updated: PayrollPeriod = {
      ...period,
      dataCollectionComplete: true,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    };

    this.savePeriod(updated);
    return updated;
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  getPeriod(periodId: string): PayrollPeriod | null {
    const periods = this.getAllPeriods();
    return periods.find((p) => p.id === periodId) || null;
  }

  getPeriods(status?: PeriodStatus): PayrollPeriod[] {
    let periods = this.getAllPeriods().filter((p) => p.tenantId === this.tenantId);

    if (status) {
      periods = periods.filter((p) => p.status === status);
    }

    return periods.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  getCurrentPeriod(): PayrollPeriod | null {
    const now = new Date();
    const periods = this.getPeriods();

    return (
      periods.find((p) => {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        return now >= start && now <= end;
      }) || null
    );
  }

  getOpenPeriods(): PayrollPeriod[] {
    return this.getPeriods().filter((p) =>
      ['open', 'data_collection', 'calculation_pending', 'calculated', 'review'].includes(p.status)
    );
  }

  getPeriodHistory(periodId: string): PeriodTransition[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.PERIOD_HISTORY);
    if (!stored) return [];

    try {
      const transitions: PeriodTransition[] = JSON.parse(stored);
      return transitions
        .filter((t) => t.periodId === periodId)
        .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
    } catch {
      return [];
    }
  }

  // ============================================
  // STORAGE HELPERS
  // ============================================

  private getAllPeriods(): PayrollPeriod[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.PERIODS);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  private savePeriod(period: PayrollPeriod): void {
    if (typeof window === 'undefined') return;

    const periods = this.getAllPeriods();
    const index = periods.findIndex((p) => p.id === period.id);

    if (index >= 0) {
      periods[index] = period;
    } else {
      periods.push(period);
    }

    localStorage.setItem(STORAGE_KEYS.PERIODS, JSON.stringify(periods));
  }

  private saveTransition(transition: PeriodTransition): void {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(STORAGE_KEYS.PERIOD_HISTORY);
    const transitions: PeriodTransition[] = stored ? JSON.parse(stored) : [];

    transitions.push(transition);

    localStorage.setItem(STORAGE_KEYS.PERIOD_HISTORY, JSON.stringify(transitions));
  }

  deletePeriod(periodId: string): boolean {
    const period = this.getPeriod(periodId);

    if (!period || period.status !== 'draft') {
      return false;
    }

    const periods = this.getAllPeriods().filter((p) => p.id !== periodId);
    localStorage.setItem(STORAGE_KEYS.PERIODS, JSON.stringify(periods));

    return true;
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Generate periods for a year
   */
  generateYearPeriods(
    year: number,
    periodType: PayrollPeriod['periodType'],
    userId: string
  ): PayrollPeriod[] {
    const periods: PayrollPeriod[] = [];

    if (periodType === 'monthly') {
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);
        const payDate = new Date(year, month + 1, 15);

        periods.push(
          this.createPeriod({
            name: `${startDate.toLocaleString('default', { month: 'long' })} ${year}`,
            periodType: 'monthly',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            payDate: payDate.toISOString().split('T')[0],
            createdBy: userId,
          })
        );
      }
    } else if (periodType === 'quarterly') {
      for (let quarter = 0; quarter < 4; quarter++) {
        const startMonth = quarter * 3;
        const startDate = new Date(year, startMonth, 1);
        const endDate = new Date(year, startMonth + 3, 0);
        const payDate = new Date(year, startMonth + 3, 15);

        periods.push(
          this.createPeriod({
            name: `Q${quarter + 1} ${year}`,
            periodType: 'quarterly',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            payDate: payDate.toISOString().split('T')[0],
            createdBy: userId,
          })
        );
      }
    }

    return periods;
  }
}

// ============================================
// SINGLETON & CONVENIENCE FUNCTIONS
// ============================================

const processors: Map<string, PeriodProcessor> = new Map();

export function getPeriodProcessor(tenantId: string): PeriodProcessor {
  if (!processors.has(tenantId)) {
    processors.set(tenantId, new PeriodProcessor(tenantId));
  }
  return processors.get(tenantId)!;
}

/**
 * Get current open period for a tenant
 */
export function getCurrentPeriod(tenantId: string): PayrollPeriod | null {
  return getPeriodProcessor(tenantId).getCurrentPeriod();
}

/**
 * Get all periods for a tenant
 */
export function getPeriods(tenantId: string, status?: PeriodStatus): PayrollPeriod[] {
  return getPeriodProcessor(tenantId).getPeriods(status);
}

/**
 * Transition period status
 */
export async function transitionPeriodStatus(
  tenantId: string,
  periodId: string,
  toStatus: PeriodStatus,
  userId: string,
  notes?: string
) {
  return getPeriodProcessor(tenantId).transitionStatus(periodId, toStatus, userId, notes);
}

/**
 * Get valid next statuses for a period
 */
export function getValidTransitions(currentStatus: PeriodStatus): PeriodStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}
