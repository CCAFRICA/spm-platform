/**
 * OB-02 Demo Data
 *
 * Demo data for OB-02 features: User Import, Hierarchy, Payroll, Calculation, Reconciliation, Shadow Payroll.
 */

import type { PayrollPeriod } from '@/types/payroll-period';
import type { ReconciliationSession, ReconciliationRule } from '@/types/reconciliation';
import type { CalculationScenario, ShadowPayrollRun } from '@/types/shadow-payroll';

// ============================================
// DEMO EMPLOYEES (for hierarchy demo)
// ============================================

export interface DemoEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeNumber: string;
  title: string;
  department: string;
  managerId?: string;
  hireDate: string;
  location: string;
  territory?: string;
  quota?: number;
}

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  // Executive Level
  {
    id: 'emp-001',
    firstName: 'Sarah',
    lastName: 'Chen',
    email: 'sarah.chen@acme.com',
    employeeNumber: 'E10001',
    title: 'VP of Sales',
    department: 'Sales',
    hireDate: '2020-01-15',
    location: 'San Francisco, CA',
    quota: 50000000,
  },
  // Regional Directors
  {
    id: 'emp-002',
    firstName: 'Michael',
    lastName: 'Torres',
    email: 'michael.torres@acme.com',
    employeeNumber: 'E10002',
    title: 'Regional Director - West',
    department: 'Sales',
    managerId: 'emp-001',
    hireDate: '2020-06-01',
    location: 'Los Angeles, CA',
    territory: 'US-West',
    quota: 20000000,
  },
  {
    id: 'emp-003',
    firstName: 'Jennifer',
    lastName: 'Williams',
    email: 'jennifer.williams@acme.com',
    employeeNumber: 'E10003',
    title: 'Regional Director - East',
    department: 'Sales',
    managerId: 'emp-001',
    hireDate: '2020-03-15',
    location: 'New York, NY',
    territory: 'US-East',
    quota: 25000000,
  },
  // Sales Managers
  {
    id: 'emp-004',
    firstName: 'David',
    lastName: 'Kim',
    email: 'david.kim@acme.com',
    employeeNumber: 'E10004',
    title: 'Sales Manager',
    department: 'Sales',
    managerId: 'emp-002',
    hireDate: '2021-02-01',
    location: 'San Diego, CA',
    territory: 'US-West-South',
    quota: 5000000,
  },
  {
    id: 'emp-005',
    firstName: 'Emily',
    lastName: 'Rodriguez',
    email: 'emily.rodriguez@acme.com',
    employeeNumber: 'E10005',
    title: 'Sales Manager',
    department: 'Sales',
    managerId: 'emp-002',
    hireDate: '2021-04-15',
    location: 'Seattle, WA',
    territory: 'US-West-North',
    quota: 5000000,
  },
  {
    id: 'emp-006',
    firstName: 'Robert',
    lastName: 'Johnson',
    email: 'robert.johnson@acme.com',
    employeeNumber: 'E10006',
    title: 'Sales Manager',
    department: 'Sales',
    managerId: 'emp-003',
    hireDate: '2020-09-01',
    location: 'Boston, MA',
    territory: 'US-East-North',
    quota: 6000000,
  },
  // Account Executives
  {
    id: 'emp-007',
    firstName: 'Amanda',
    lastName: 'Martinez',
    email: 'amanda.martinez@acme.com',
    employeeNumber: 'E10007',
    title: 'Senior Account Executive',
    department: 'Sales',
    managerId: 'emp-004',
    hireDate: '2022-01-10',
    location: 'San Diego, CA',
    territory: 'US-West-South',
    quota: 1200000,
  },
  {
    id: 'emp-008',
    firstName: 'James',
    lastName: 'Wilson',
    email: 'james.wilson@acme.com',
    employeeNumber: 'E10008',
    title: 'Account Executive',
    department: 'Sales',
    managerId: 'emp-004',
    hireDate: '2022-06-01',
    location: 'Phoenix, AZ',
    territory: 'US-West-South',
    quota: 800000,
  },
  {
    id: 'emp-009',
    firstName: 'Lisa',
    lastName: 'Thompson',
    email: 'lisa.thompson@acme.com',
    employeeNumber: 'E10009',
    title: 'Account Executive',
    department: 'Sales',
    managerId: 'emp-005',
    hireDate: '2022-03-15',
    location: 'Portland, OR',
    territory: 'US-West-North',
    quota: 900000,
  },
  {
    id: 'emp-010',
    firstName: 'Christopher',
    lastName: 'Brown',
    email: 'christopher.brown@acme.com',
    employeeNumber: 'E10010',
    title: 'Senior Account Executive',
    department: 'Sales',
    managerId: 'emp-006',
    hireDate: '2021-08-01',
    location: 'Boston, MA',
    territory: 'US-East-North',
    quota: 1500000,
  },
];

// ============================================
// PAYROLL PERIODS
// ============================================

export const DEMO_PAYROLL_PERIODS: PayrollPeriod[] = [
  {
    id: 'period-2026-01',
    tenantId: 'demo-tenant',
    name: 'January 2026',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    cutoffDate: '2026-01-28',
    payDate: '2026-02-15',
    frequency: 'monthly',
    periodNumber: 1,
    fiscalYear: 2026,
    status: 'closed',
    statusHistory: [
      { fromStatus: 'draft', toStatus: 'open', changedBy: 'system', changedAt: '2026-01-01T00:00:00Z' },
      { fromStatus: 'open', toStatus: 'processing', changedBy: 'system', changedAt: '2026-02-01T00:00:00Z' },
      { fromStatus: 'processing', toStatus: 'approved', changedBy: 'admin-001', changedAt: '2026-02-05T00:00:00Z' },
      { fromStatus: 'approved', toStatus: 'closed', changedBy: 'system', changedAt: '2026-02-15T00:00:00Z' },
    ],
    createdBy: 'system',
    createdAt: '2025-12-15T00:00:00Z',
    updatedAt: '2026-02-15T00:00:00Z',
    lockedAt: '2026-02-15T00:00:00Z',
    lockedBy: 'system',
  },
  {
    id: 'period-2026-02',
    tenantId: 'demo-tenant',
    name: 'February 2026',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    cutoffDate: '2026-02-25',
    payDate: '2026-03-15',
    frequency: 'monthly',
    periodNumber: 2,
    fiscalYear: 2026,
    status: 'approved',
    statusHistory: [
      { fromStatus: 'draft', toStatus: 'open', changedBy: 'system', changedAt: '2026-02-01T00:00:00Z' },
      { fromStatus: 'open', toStatus: 'processing', changedBy: 'system', changedAt: '2026-03-01T00:00:00Z' },
      { fromStatus: 'processing', toStatus: 'approved', changedBy: 'admin-001', changedAt: '2026-03-05T00:00:00Z' },
    ],
    createdBy: 'system',
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-03-05T00:00:00Z',
  },
  {
    id: 'period-2026-03',
    tenantId: 'demo-tenant',
    name: 'March 2026',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    cutoffDate: '2026-03-28',
    payDate: '2026-04-15',
    frequency: 'monthly',
    periodNumber: 3,
    fiscalYear: 2026,
    status: 'open',
    statusHistory: [
      { fromStatus: 'draft', toStatus: 'open', changedBy: 'system', changedAt: '2026-03-01T00:00:00Z' },
    ],
    createdBy: 'system',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
];

// ============================================
// RECONCILIATION SESSIONS
// ============================================

export const DEMO_RECONCILIATION_SESSIONS: ReconciliationSession[] = [
  {
    id: 'recon-001',
    tenantId: 'demo-tenant',
    mode: 'migration',
    status: 'completed',
    periodId: 'period-2026-01',
    sourceSystem: 'LegacySPM',
    targetSystem: 'ClearComp',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    summary: {
      totalRecords: 156,
      matchedRecords: 148,
      unmatchedRecords: 4,
      discrepancies: 4,
      byType: {
        matched: 148,
        missingInSource: 2,
        missingInTarget: 1,
        amountDifference: 3,
        fieldDifference: 2,
      },
      sourceTotal: 2456789.50,
      targetTotal: 2456234.75,
      difference: 554.75,
      percentageDifference: 0.02,
      overallConfidence: 94,
      autoReconciled: 142,
      manualReviewRequired: 14,
    },
    createdBy: 'admin-001',
    createdAt: '2026-02-01T08:00:00Z',
    completedAt: '2026-02-01T14:30:00Z',
    approvedBy: 'admin-002',
    approvedAt: '2026-02-02T09:00:00Z',
  },
  {
    id: 'recon-002',
    tenantId: 'demo-tenant',
    mode: 'operational',
    status: 'awaiting_review',
    periodId: 'period-2026-02',
    sourceSystem: 'ClearComp',
    targetSystem: 'PayrollSystem',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    summary: {
      totalRecords: 162,
      matchedRecords: 158,
      unmatchedRecords: 2,
      discrepancies: 2,
      byType: {
        matched: 158,
        missingInSource: 1,
        missingInTarget: 1,
        amountDifference: 2,
        fieldDifference: 0,
      },
      sourceTotal: 2678432.00,
      targetTotal: 2678189.50,
      difference: 242.50,
      percentageDifference: 0.01,
      overallConfidence: 97,
      autoReconciled: 156,
      manualReviewRequired: 6,
    },
    createdBy: 'admin-001',
    createdAt: '2026-02-05T10:00:00Z',
  },
];

// ============================================
// RECONCILIATION RULES
// ============================================

export const DEMO_RECONCILIATION_RULES: ReconciliationRule[] = [
  {
    id: 'rule-001',
    tenantId: 'demo-tenant',
    name: 'Exact Employee Match',
    description: 'Match records by employee ID and exact amount',
    priority: 100,
    isActive: true,
    matchCriteria: [
      { sourceField: 'employeeId', targetField: 'employeeId', matchType: 'exact', weight: 40, required: true },
      { sourceField: 'amount', targetField: 'amount', matchType: 'exact', weight: 40, required: true },
      { sourceField: 'date', targetField: 'date', matchType: 'exact', weight: 20, required: false },
    ],
    matchThreshold: 95,
    autoResolve: true,
    resolutionAction: 'accept_source',
    createdBy: 'admin-001',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-002',
    tenantId: 'demo-tenant',
    name: 'Fuzzy Amount Match',
    description: 'Match with tolerance for rounding differences',
    priority: 80,
    isActive: true,
    matchCriteria: [
      { sourceField: 'employeeId', targetField: 'employeeId', matchType: 'exact', weight: 50, required: true },
      { sourceField: 'amount', targetField: 'amount', matchType: 'numeric_range', weight: 35, required: true },
      { sourceField: 'type', targetField: 'type', matchType: 'exact', weight: 15, required: false },
    ],
    matchThreshold: 85,
    autoResolve: true,
    resolutionAction: 'accept_target',
    amountTolerance: { type: 'absolute', value: 1.00 },
    dateTolerance: 1,
    createdBy: 'admin-001',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-003',
    tenantId: 'demo-tenant',
    name: 'Date Range Match',
    description: 'Match allowing date variance for timing differences',
    priority: 60,
    isActive: true,
    matchCriteria: [
      { sourceField: 'employeeId', targetField: 'employeeId', matchType: 'exact', weight: 45, required: true },
      { sourceField: 'amount', targetField: 'amount', matchType: 'numeric_range', weight: 35, required: true },
      { sourceField: 'date', targetField: 'date', matchType: 'date_range', weight: 20, required: false },
    ],
    matchThreshold: 80,
    autoResolve: false,
    amountTolerance: { type: 'percentage', value: 0.5 },
    dateTolerance: 3,
    createdBy: 'admin-001',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

// ============================================
// SHADOW PAYROLL RUNS
// ============================================

export const DEMO_SHADOW_PAYROLL_RUNS: ShadowPayrollRun[] = [
  {
    id: 'shadow-001',
    tenantId: 'demo-tenant',
    periodId: 'period-2026-01',
    status: 'completed',
    legacySystem: {
      name: 'LegacySPM',
      runDate: '2026-02-01T08:00:00Z',
      totalAmount: 2456789.50,
      recordCount: 156,
    },
    newSystem: {
      name: 'ClearComp',
      runDate: '2026-02-01T08:15:00Z',
      totalAmount: 2456234.75,
      recordCount: 156,
    },
    comparison: {
      totalLegacy: 2456789.50,
      totalNew: 2456234.75,
      variance: -554.75,
      variancePercentage: -0.02,
      exactMatches: 142,
      withinTolerance: 10,
      outsideTolerance: 4,
      onlyInLegacy: 0,
      onlyInNew: 0,
      overallConfidence: 94,
      readyForCutover: false,
      employeeComparisons: DEMO_EMPLOYEES.slice(0, 5).map((emp, idx) => ({
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        legacyAmount: 15000 + idx * 1000,
        newAmount: 15000 + idx * 1000 + (idx === 2 ? -50 : 0),
        variance: idx === 2 ? -50 : 0,
        variancePercentage: idx === 2 ? -0.29 : 0,
        status: idx === 2 ? 'outside_tolerance' as const : 'exact_match' as const,
        componentComparisons: [
          { component: 'commission', legacyAmount: 12000 + idx * 800, newAmount: 12000 + idx * 800, variance: 0, withinTolerance: true },
          { component: 'bonus', legacyAmount: 3000 + idx * 200, newAmount: 3000 + idx * 200 + (idx === 2 ? -50 : 0), variance: idx === 2 ? -50 : 0, withinTolerance: idx !== 2 },
        ],
        investigationRequired: idx === 2,
      })),
    },
    tolerances: {
      percentageTolerance: 0.5,
      absoluteTolerance: 10,
    },
    createdBy: 'admin-001',
    createdAt: '2026-02-01T07:45:00Z',
    completedAt: '2026-02-01T08:30:00Z',
  },
  {
    id: 'shadow-002',
    tenantId: 'demo-tenant',
    periodId: 'period-2026-02',
    status: 'completed',
    legacySystem: {
      name: 'LegacySPM',
      runDate: '2026-02-05T08:00:00Z',
      totalAmount: 2678432.00,
      recordCount: 162,
    },
    newSystem: {
      name: 'ClearComp',
      runDate: '2026-02-05T08:10:00Z',
      totalAmount: 2678189.50,
      recordCount: 162,
    },
    comparison: {
      totalLegacy: 2678432.00,
      totalNew: 2678189.50,
      variance: -242.50,
      variancePercentage: -0.01,
      exactMatches: 155,
      withinTolerance: 5,
      outsideTolerance: 2,
      onlyInLegacy: 0,
      onlyInNew: 0,
      overallConfidence: 97,
      readyForCutover: true,
      employeeComparisons: DEMO_EMPLOYEES.map((emp, idx) => ({
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        legacyAmount: 16000 + idx * 1100,
        newAmount: 16000 + idx * 1100,
        variance: 0,
        variancePercentage: 0,
        status: 'exact_match' as const,
        componentComparisons: [
          { component: 'commission', legacyAmount: 13000 + idx * 900, newAmount: 13000 + idx * 900, variance: 0, withinTolerance: true },
          { component: 'bonus', legacyAmount: 3000 + idx * 200, newAmount: 3000 + idx * 200, variance: 0, withinTolerance: true },
        ],
        investigationRequired: false,
      })),
    },
    tolerances: {
      percentageTolerance: 0.5,
      absoluteTolerance: 10,
    },
    createdBy: 'admin-001',
    createdAt: '2026-02-05T07:45:00Z',
    completedAt: '2026-02-05T08:25:00Z',
  },
];

// ============================================
// CALCULATION SCENARIOS
// ============================================

export const DEMO_CALCULATION_SCENARIOS: CalculationScenario[] = [
  {
    id: 'scenario-001',
    tenantId: 'demo-tenant',
    name: 'Q1 Rate Increase Analysis',
    description: 'What-if analysis for proposed 5% rate increase',
    type: 'what_if',
    status: 'completed',
    basePeriodId: 'period-2026-01',
    parameters: {
      modifications: [
        {
          type: 'rate_change',
          target: 'all',
          field: 'commission_rate',
          oldValue: 0.08,
          newValue: 0.084,
          effectiveDate: '2026-04-01',
        },
      ],
    },
    results: {
      summary: {
        employeesProcessed: 10,
        totalBasePayout: 2456789.50,
        totalScenarioPayout: 2579628.98,
        totalDifference: 122839.48,
        percentageDifference: 5.0,
        byType: {
          increased: 10,
          decreased: 0,
          unchanged: 0,
          newPayouts: 0,
          removedPayouts: 0,
        },
        averageImpact: 12283.95,
        medianImpact: 11500.00,
        maxPositiveImpact: 25000.00,
        maxNegativeImpact: 0,
      },
      employeeResults: [],
      validation: {
        isValid: true,
        confidence: 95,
        checks: [
          { name: 'Variance Check', description: 'Verify variance is acceptable', status: 'passed' },
          { name: 'Data Completeness', description: 'All employees calculated', status: 'passed' },
        ],
        errors: [],
        warnings: [],
      },
    },
    createdBy: 'admin-001',
    createdAt: '2026-02-01T10:00:00Z',
    completedAt: '2026-02-01T10:15:00Z',
  },
  {
    id: 'scenario-002',
    tenantId: 'demo-tenant',
    name: 'Territory Rebalancing Impact',
    description: 'Analysis of proposed territory changes for Q2',
    type: 'what_if',
    status: 'completed',
    basePeriodId: 'period-2026-02',
    parameters: {
      departmentIds: ['sales'],
      modifications: [
        {
          type: 'territory_change',
          target: 'emp-007',
          field: 'territory',
          oldValue: 'US-West-South',
          newValue: 'US-West-Central',
        },
        {
          type: 'quota_change',
          target: 'emp-007',
          field: 'quota',
          oldValue: 1200000,
          newValue: 1400000,
        },
      ],
    },
    results: {
      summary: {
        employeesProcessed: 10,
        totalBasePayout: 2678432.00,
        totalScenarioPayout: 2712456.00,
        totalDifference: 34024.00,
        percentageDifference: 1.27,
        byType: {
          increased: 3,
          decreased: 2,
          unchanged: 5,
          newPayouts: 0,
          removedPayouts: 0,
        },
        averageImpact: 3402.40,
        medianImpact: 0,
        maxPositiveImpact: 15000.00,
        maxNegativeImpact: -8000.00,
      },
      employeeResults: [],
      validation: {
        isValid: true,
        confidence: 92,
        checks: [
          { name: 'Variance Check', description: 'Verify variance is acceptable', status: 'passed' },
          { name: 'Impact Distribution', description: 'Check for outliers', status: 'warning', details: 'Some employees significantly impacted' },
        ],
        errors: [],
        warnings: [{ code: 'HIGH_INDIVIDUAL_IMPACT', message: '2 employees have impact > 10%', severity: 'warning' }],
      },
    },
    createdBy: 'admin-001',
    createdAt: '2026-02-03T14:00:00Z',
    completedAt: '2026-02-03T14:20:00Z',
  },
];

// ============================================
// DEMO INITIALIZATION
// ============================================

const STORAGE_KEYS = {
  employees: 'ob02_demo_employees',
  payrollPeriods: 'ob02_demo_payroll_periods',
  reconciliationSessions: 'ob02_demo_reconciliation_sessions',
  reconciliationRules: 'ob02_demo_reconciliation_rules',
  shadowPayrollRuns: 'ob02_demo_shadow_payroll_runs',
  calculationScenarios: 'ob02_demo_calculation_scenarios',
};

/**
 * Initialize OB-02 demo data in localStorage
 */
export function initializeOB02DemoData(): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(STORAGE_KEYS.employees, JSON.stringify(DEMO_EMPLOYEES));
  localStorage.setItem(STORAGE_KEYS.payrollPeriods, JSON.stringify(DEMO_PAYROLL_PERIODS));
  localStorage.setItem(STORAGE_KEYS.reconciliationSessions, JSON.stringify(DEMO_RECONCILIATION_SESSIONS));
  localStorage.setItem(STORAGE_KEYS.reconciliationRules, JSON.stringify(DEMO_RECONCILIATION_RULES));
  localStorage.setItem(STORAGE_KEYS.shadowPayrollRuns, JSON.stringify(DEMO_SHADOW_PAYROLL_RUNS));
  localStorage.setItem(STORAGE_KEYS.calculationScenarios, JSON.stringify(DEMO_CALCULATION_SCENARIOS));
}

/**
 * Get OB-02 demo data from localStorage
 */
export function getOB02DemoData(): {
  employees: DemoEmployee[];
  payrollPeriods: PayrollPeriod[];
  reconciliationSessions: ReconciliationSession[];
  reconciliationRules: ReconciliationRule[];
  shadowPayrollRuns: ShadowPayrollRun[];
  calculationScenarios: CalculationScenario[];
} {
  if (typeof window === 'undefined') {
    return {
      employees: DEMO_EMPLOYEES,
      payrollPeriods: DEMO_PAYROLL_PERIODS,
      reconciliationSessions: DEMO_RECONCILIATION_SESSIONS,
      reconciliationRules: DEMO_RECONCILIATION_RULES,
      shadowPayrollRuns: DEMO_SHADOW_PAYROLL_RUNS,
      calculationScenarios: DEMO_CALCULATION_SCENARIOS,
    };
  }

  return {
    employees: JSON.parse(localStorage.getItem(STORAGE_KEYS.employees) || JSON.stringify(DEMO_EMPLOYEES)),
    payrollPeriods: JSON.parse(localStorage.getItem(STORAGE_KEYS.payrollPeriods) || JSON.stringify(DEMO_PAYROLL_PERIODS)),
    reconciliationSessions: JSON.parse(localStorage.getItem(STORAGE_KEYS.reconciliationSessions) || JSON.stringify(DEMO_RECONCILIATION_SESSIONS)),
    reconciliationRules: JSON.parse(localStorage.getItem(STORAGE_KEYS.reconciliationRules) || JSON.stringify(DEMO_RECONCILIATION_RULES)),
    shadowPayrollRuns: JSON.parse(localStorage.getItem(STORAGE_KEYS.shadowPayrollRuns) || JSON.stringify(DEMO_SHADOW_PAYROLL_RUNS)),
    calculationScenarios: JSON.parse(localStorage.getItem(STORAGE_KEYS.calculationScenarios) || JSON.stringify(DEMO_CALCULATION_SCENARIOS)),
  };
}

/**
 * Reset OB-02 demo data to defaults
 */
export function resetOB02DemoData(): void {
  if (typeof window === 'undefined') return;

  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });

  initializeOB02DemoData();
}
