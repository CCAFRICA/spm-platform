/**
 * Payroll Period Types
 *
 * Types for payroll period management, calculation windows, and jurisdictional rules.
 */

// ============================================
// PAYROLL PERIOD
// ============================================

/**
 * Payroll period frequency
 */
export type PayrollFrequency =
  | 'weekly'
  | 'biweekly'
  | 'semi-monthly'
  | 'monthly'
  | 'quarterly';

/**
 * Period status
 */
export type PeriodStatus =
  | 'draft' // Period created but not active
  | 'open' // Currently accepting data
  | 'processing' // Calculations in progress
  | 'pending_approval' // Awaiting approval
  | 'approved' // Approved for payout
  | 'paid' // Payments processed
  | 'closed' // Period finalized
  | 'locked'; // Cannot be modified

/**
 * A payroll period definition
 */
export interface PayrollPeriod {
  id: string;
  tenantId: string;
  name: string;

  // Time boundaries
  startDate: string; // ISO date
  endDate: string;
  cutoffDate: string; // Last date for transaction inclusion
  payDate: string; // When compensation is paid

  // Frequency
  frequency: PayrollFrequency;
  periodNumber: number; // Period number within the year
  fiscalYear: number;

  // Status
  status: PeriodStatus;
  statusHistory: PeriodStatusChange[];

  // Processing info
  processing?: {
    startedAt?: string;
    completedAt?: string;
    calculationsRun: number;
    employeesProcessed: number;
    totalPayout: number;
    currency: string;
  };

  // Audit
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
  lockedBy?: string;
}

export interface PeriodStatusChange {
  fromStatus: PeriodStatus;
  toStatus: PeriodStatus;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

// ============================================
// PAYROLL CALENDAR
// ============================================

/**
 * Payroll calendar with all periods for a year
 */
export interface PayrollCalendar {
  id: string;
  tenantId: string;
  name: string;
  year: number;
  frequency: PayrollFrequency;

  // Periods
  periods: PayrollPeriod[];

  // Settings
  settings: {
    autoAdvance: boolean; // Automatically advance to next period
    advanceDaysBefore: number; // Days before end date to advance
    defaultCutoffDays: number; // Days before end date for cutoff
    defaultPayDelay: number; // Days after end date for pay date
    workingDaysOnly: boolean; // Only count business days
    holidays: string[]; // Holiday dates to exclude
  };

  // Audit
  createdBy: string;
  createdAt: string;
}

// ============================================
// JURISDICTIONAL RULES
// ============================================

/**
 * Jurisdiction levels for rule hierarchy
 */
export type JurisdictionLevel =
  | 'federal'
  | 'state'
  | 'county'
  | 'city'
  | 'district'
  | 'company';

/**
 * Jurisdictional rule for payroll calculations
 */
export interface JurisdictionalRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;

  // Jurisdiction
  level: JurisdictionLevel;
  jurisdiction: string; // e.g., "US", "CA", "San Francisco"
  precedence: number; // Higher = overrides lower

  // Rule type
  type: JurisdictionalRuleType;

  // Effective dates
  effectiveFrom: string;
  effectiveTo?: string;

  // Rule configuration
  config: JurisdictionalRuleConfig;

  // Audit
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export type JurisdictionalRuleType =
  | 'minimum_wage'
  | 'overtime_threshold'
  | 'tax_rate'
  | 'bonus_treatment'
  | 'commission_timing'
  | 'clawback_limit'
  | 'payment_timing'
  | 'deduction_order'
  | 'garnishment_priority';

export interface JurisdictionalRuleConfig {
  // Minimum wage rules
  minimumWage?: {
    rate: number;
    unit: 'hourly' | 'daily' | 'weekly' | 'monthly';
    exemptions?: string[];
  };

  // Overtime rules
  overtime?: {
    dailyThreshold?: number;
    weeklyThreshold?: number;
    multiplier: number;
    doubleTimeThreshold?: number;
    doubleTimeMultiplier?: number;
  };

  // Tax rules
  tax?: {
    rate: number;
    brackets?: Array<{ min: number; max: number; rate: number }>;
    exemptionThreshold?: number;
  };

  // Commission timing rules
  commissionTiming?: {
    payOnEarned: boolean; // vs pay on collected
    deferralAllowed: boolean;
    maxDeferralDays?: number;
  };

  // Clawback rules
  clawback?: {
    allowed: boolean;
    maxMonths?: number;
    requiresNotice: boolean;
    noticeDays?: number;
  };

  // Payment timing rules
  paymentTiming?: {
    maxDaysAfterPeriodEnd: number;
    finalPaycheckDays: number; // Days to issue final paycheck after termination
  };
}

// ============================================
// RULE HIERARCHY
// ============================================

/**
 * Resolved rules for an employee based on their jurisdictions
 */
export interface ResolvedRules {
  employeeId: string;
  evaluatedAt: string;

  // Applicable jurisdictions
  jurisdictions: Array<{
    level: JurisdictionLevel;
    jurisdiction: string;
    ruleIds: string[];
  }>;

  // Resolved values (after applying precedence)
  resolvedValues: {
    minimumWage?: number;
    overtimeThreshold?: number;
    overtimeMultiplier?: number;
    commissionPayOnEarned?: boolean;
    clawbackAllowed?: boolean;
    clawbackMaxMonths?: number;
    maxPaymentDelay?: number;
  };

  // Conflicts detected
  conflicts: RuleConflict[];
}

export interface RuleConflict {
  ruleType: JurisdictionalRuleType;
  rules: Array<{
    ruleId: string;
    jurisdiction: string;
    value: unknown;
  }>;
  resolution: 'higher_precedence' | 'most_restrictive' | 'manual_required';
  resolvedValue?: unknown;
}

// ============================================
// PERIOD ACTIONS
// ============================================

export interface PeriodAction {
  type: 'advance' | 'lock' | 'unlock' | 'reopen' | 'approve' | 'reject';
  periodId: string;
  performedBy: string;
  performedAt: string;
  reason?: string;
  previousStatus: PeriodStatus;
  newStatus: PeriodStatus;
}

// ============================================
// PERIOD CALCULATION SUMMARY
// ============================================

export interface PeriodCalculationSummary {
  periodId: string;
  calculatedAt: string;

  // Employee counts
  totalEmployees: number;
  employeesWithPayouts: number;
  employeesWithZero: number;
  employeesWithErrors: number;

  // Payout summary
  totalGrossPayout: number;
  totalDeductions: number;
  totalNetPayout: number;
  currency: string;

  // By component
  byComponent: Array<{
    componentType: 'base' | 'commission' | 'bonus' | 'spiff' | 'adjustment' | 'clawback';
    count: number;
    totalAmount: number;
  }>;

  // By department
  byDepartment: Array<{
    department: string;
    employeeCount: number;
    totalPayout: number;
  }>;

  // Comparison to previous period
  comparison?: {
    previousPeriodId: string;
    payoutChange: number;
    payoutChangePercent: number;
    headcountChange: number;
  };
}

// ============================================
// PERIOD APPROVAL
// ============================================

export interface PeriodApproval {
  periodId: string;
  approvalId: string;
  status: 'pending' | 'approved' | 'rejected';

  // Approval chain
  requiredApprovers: string[];
  currentApproverIndex: number;
  approvals: Array<{
    approverId: string;
    approverName: string;
    status: 'pending' | 'approved' | 'rejected';
    decidedAt?: string;
    comments?: string;
  }>;

  // Amounts
  totalPayout: number;
  employeeCount: number;

  // Deadline
  deadline?: string;
  overdueNotificationSent?: boolean;
}
