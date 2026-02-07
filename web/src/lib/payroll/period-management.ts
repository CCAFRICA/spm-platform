/**
 * Payroll Period Management
 *
 * Period lifecycle management, status transitions, and calendar operations.
 */

import type {
  PayrollPeriod,
  PayrollCalendar,
  PayrollFrequency,
  PeriodStatus,
  PeriodStatusChange,
} from '@/types/payroll-period';

// ============================================
// STATUS TRANSITIONS
// ============================================

/**
 * Valid status transitions for payroll periods.
 * Map of current status to allowed next statuses.
 */
const VALID_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  draft: ['open'],
  open: ['processing', 'draft'],
  processing: ['pending_approval', 'open'],
  pending_approval: ['approved', 'processing'],
  approved: ['paid', 'pending_approval'],
  paid: ['closed'],
  closed: ['locked'],
  locked: [], // Cannot transition from locked
};

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  fromStatus: PeriodStatus,
  toStatus: PeriodStatus
): boolean {
  return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

/**
 * Get allowed next statuses for a period
 */
export function getAllowedTransitions(status: PeriodStatus): PeriodStatus[] {
  return VALID_TRANSITIONS[status] || [];
}

/**
 * Create a status change record
 */
export function createStatusChange(
  fromStatus: PeriodStatus,
  toStatus: PeriodStatus,
  userId: string,
  reason?: string
): PeriodStatusChange {
  return {
    fromStatus,
    toStatus,
    changedBy: userId,
    changedAt: new Date().toISOString(),
    reason,
  };
}

// ============================================
// PERIOD GENERATION
// ============================================

/**
 * Generate periods for a calendar year
 */
export function generatePeriodsForYear(
  tenantId: string,
  year: number,
  frequency: PayrollFrequency,
  settings: PayrollCalendar['settings'],
  createdBy: string
): PayrollPeriod[] {
  const periods: PayrollPeriod[] = [];
  const periodCount = getPeriodsPerYear(frequency);

  for (let i = 0; i < periodCount; i++) {
    const { startDate, endDate } = getPeriodDates(year, i, frequency);
    const cutoffDate = calculateCutoffDate(endDate, settings.defaultCutoffDays, settings);
    const payDate = calculatePayDate(endDate, settings.defaultPayDelay, settings);

    periods.push({
      id: `${tenantId}-${year}-${String(i + 1).padStart(2, '0')}`,
      tenantId,
      name: getPeriodName(year, i + 1, frequency),
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      cutoffDate: cutoffDate.toISOString().split('T')[0],
      payDate: payDate.toISOString().split('T')[0],
      frequency,
      periodNumber: i + 1,
      fiscalYear: year,
      status: 'draft',
      statusHistory: [],
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return periods;
}

/**
 * Get number of periods per year for a frequency
 */
function getPeriodsPerYear(frequency: PayrollFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'semi-monthly':
      return 24;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    default:
      return 12;
  }
}

/**
 * Get start and end dates for a period
 */
function getPeriodDates(
  year: number,
  periodIndex: number,
  frequency: PayrollFrequency
): { startDate: Date; endDate: Date } {
  switch (frequency) {
    case 'weekly': {
      const startDate = new Date(year, 0, 1 + periodIndex * 7);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      return { startDate, endDate };
    }

    case 'biweekly': {
      const startDate = new Date(year, 0, 1 + periodIndex * 14);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 13);
      return { startDate, endDate };
    }

    case 'semi-monthly': {
      const month = Math.floor(periodIndex / 2);
      const isSecondHalf = periodIndex % 2 === 1;
      if (isSecondHalf) {
        const startDate = new Date(year, month, 16);
        const endDate = new Date(year, month + 1, 0); // Last day of month
        return { startDate, endDate };
      } else {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month, 15);
        return { startDate, endDate };
      }
    }

    case 'monthly': {
      const startDate = new Date(year, periodIndex, 1);
      const endDate = new Date(year, periodIndex + 1, 0); // Last day of month
      return { startDate, endDate };
    }

    case 'quarterly': {
      const startMonth = periodIndex * 3;
      const startDate = new Date(year, startMonth, 1);
      const endDate = new Date(year, startMonth + 3, 0);
      return { startDate, endDate };
    }

    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
}

/**
 * Get human-readable period name
 */
function getPeriodName(
  year: number,
  periodNumber: number,
  frequency: PayrollFrequency
): string {
  switch (frequency) {
    case 'weekly':
      return `Week ${periodNumber}, ${year}`;
    case 'biweekly':
      return `Period ${periodNumber}, ${year}`;
    case 'semi-monthly':
      const month = Math.ceil(periodNumber / 2);
      const half = periodNumber % 2 === 1 ? '1st' : '2nd';
      return `${getMonthName(month - 1)} ${half} Half, ${year}`;
    case 'monthly':
      return `${getMonthName(periodNumber - 1)} ${year}`;
    case 'quarterly':
      return `Q${periodNumber} ${year}`;
    default:
      return `Period ${periodNumber}, ${year}`;
  }
}

function getMonthName(monthIndex: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[monthIndex];
}

/**
 * Calculate cutoff date based on end date and settings
 */
function calculateCutoffDate(
  endDate: Date,
  daysBefore: number,
  settings: PayrollCalendar['settings']
): Date {
  let cutoff = new Date(endDate);
  cutoff.setDate(cutoff.getDate() - daysBefore);

  if (settings.workingDaysOnly) {
    cutoff = adjustForWorkingDays(cutoff, settings.holidays, -daysBefore);
  }

  return cutoff;
}

/**
 * Calculate pay date based on end date and settings
 */
function calculatePayDate(
  endDate: Date,
  daysAfter: number,
  settings: PayrollCalendar['settings']
): Date {
  let payDate = new Date(endDate);
  payDate.setDate(payDate.getDate() + daysAfter);

  if (settings.workingDaysOnly) {
    payDate = adjustForWorkingDays(payDate, settings.holidays, daysAfter);
  }

  return payDate;
}

/**
 * Adjust a date for working days, skipping weekends and holidays
 */
function adjustForWorkingDays(
  date: Date,
  holidays: string[],
  direction: number
): Date {
  const result = new Date(date);
  const step = direction >= 0 ? 1 : -1;
  let remaining = Math.abs(direction);

  while (remaining > 0) {
    result.setDate(result.getDate() + step);

    // Skip weekends
    if (result.getDay() === 0 || result.getDay() === 6) {
      continue;
    }

    // Skip holidays
    const dateStr = result.toISOString().split('T')[0];
    if (holidays.includes(dateStr)) {
      continue;
    }

    remaining--;
  }

  // If landed on weekend/holiday, move to next working day
  while (
    result.getDay() === 0 ||
    result.getDay() === 6 ||
    holidays.includes(result.toISOString().split('T')[0])
  ) {
    result.setDate(result.getDate() + step);
  }

  return result;
}

// ============================================
// PERIOD QUERIES
// ============================================

/**
 * Find the current active period
 */
export function findCurrentPeriod(periods: PayrollPeriod[]): PayrollPeriod | undefined {
  const today = new Date().toISOString().split('T')[0];

  return periods.find((p) => p.startDate <= today && p.endDate >= today && p.status !== 'draft');
}

/**
 * Find the next upcoming period
 */
export function findNextPeriod(periods: PayrollPeriod[]): PayrollPeriod | undefined {
  const today = new Date().toISOString().split('T')[0];

  const futurePeriods = periods
    .filter((p) => p.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return futurePeriods[0];
}

/**
 * Get periods that need attention (pending approval, processing, etc.)
 */
export function getPeriodsNeedingAttention(periods: PayrollPeriod[]): PayrollPeriod[] {
  const attentionStatuses: PeriodStatus[] = ['processing', 'pending_approval'];
  return periods.filter((p) => attentionStatuses.includes(p.status));
}

/**
 * Check if a period can be modified
 */
export function canModifyPeriod(period: PayrollPeriod): boolean {
  const immutableStatuses: PeriodStatus[] = ['paid', 'closed', 'locked'];
  return !immutableStatuses.includes(period.status);
}

/**
 * Check if a period can accept new transactions
 */
export function canAcceptTransactions(period: PayrollPeriod): boolean {
  return period.status === 'open' || period.status === 'draft';
}
