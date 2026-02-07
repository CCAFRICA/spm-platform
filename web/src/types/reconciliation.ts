/**
 * Reconciliation Types
 *
 * Types for dual-mode reconciliation (migration vs operational).
 */

// ============================================
// RECONCILIATION MODE
// ============================================

export type ReconciliationMode = 'migration' | 'operational';

export type ReconciliationStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_review'
  | 'approved'
  | 'rejected'
  | 'completed';

// ============================================
// RECONCILIATION SESSION
// ============================================

export interface ReconciliationSession {
  id: string;
  tenantId: string;
  mode: ReconciliationMode;
  status: ReconciliationStatus;

  // Context
  periodId?: string;
  sourceSystem: string;
  targetSystem: string;

  // Scope
  startDate: string;
  endDate: string;
  employeeIds?: string[];
  departmentIds?: string[];

  // Results
  summary?: ReconciliationSummary;

  // Audit
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

// ============================================
// RECONCILIATION SUMMARY
// ============================================

export interface ReconciliationSummary {
  totalRecords: number;
  matchedRecords: number;
  unmatchedRecords: number;
  discrepancies: number;

  // By type
  byType: {
    matched: number;
    missingInSource: number;
    missingInTarget: number;
    amountDifference: number;
    fieldDifference: number;
  };

  // Amounts
  sourceTotal: number;
  targetTotal: number;
  difference: number;
  percentageDifference: number;

  // Confidence
  overallConfidence: number;
  autoReconciled: number;
  manualReviewRequired: number;
}

// ============================================
// RECONCILIATION ITEM
// ============================================

export type MatchStatus =
  | 'matched'
  | 'partial_match'
  | 'unmatched'
  | 'missing_source'
  | 'missing_target'
  | 'discrepancy';

export interface ReconciliationItem {
  id: string;
  sessionId: string;

  // Match info
  matchStatus: MatchStatus;
  matchConfidence: number; // 0-100
  matchMethod: 'exact' | 'fuzzy' | 'rule_based' | 'manual';

  // Source record
  sourceRecord?: {
    id: string;
    employeeId: string;
    amount: number;
    date: string;
    type: string;
    description?: string;
    rawData: Record<string, unknown>;
  };

  // Target record
  targetRecord?: {
    id: string;
    employeeId: string;
    amount: number;
    date: string;
    type: string;
    description?: string;
    rawData: Record<string, unknown>;
  };

  // Discrepancy details
  discrepancy?: {
    fields: DiscrepancyField[];
    amountDifference: number;
    severity: 'low' | 'medium' | 'high';
    suggestedResolution?: string;
  };

  // Resolution
  resolution?: {
    action: 'accept_source' | 'accept_target' | 'manual_override' | 'split' | 'exclude';
    resolvedValue?: unknown;
    resolvedBy: string;
    resolvedAt: string;
    notes?: string;
  };
}

export interface DiscrepancyField {
  field: string;
  sourceValue: unknown;
  targetValue: unknown;
  significance: 'critical' | 'important' | 'minor';
}

// ============================================
// RECONCILIATION RULE
// ============================================

export interface ReconciliationRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  priority: number;
  isActive: boolean;

  // Applicability
  mode?: ReconciliationMode;
  sourceSystem?: string;
  targetSystem?: string;

  // Matching criteria
  matchCriteria: MatchCriterion[];
  matchThreshold: number; // 0-100

  // Resolution
  autoResolve: boolean;
  resolutionAction?: 'accept_source' | 'accept_target' | 'average' | 'higher' | 'lower';

  // Tolerance
  amountTolerance?: {
    type: 'absolute' | 'percentage';
    value: number;
  };
  dateTolerance?: number; // Days

  // Audit
  createdBy: string;
  createdAt: string;
}

export interface MatchCriterion {
  sourceField: string;
  targetField: string;
  matchType: 'exact' | 'fuzzy' | 'contains' | 'numeric_range' | 'date_range';
  weight: number;
  required: boolean;
}

// ============================================
// MIGRATION RECONCILIATION
// ============================================

export interface MigrationReconciliation extends ReconciliationSession {
  mode: 'migration';

  // Legacy system info
  legacySystem: {
    name: string;
    extractDate: string;
    recordCount: number;
    totalAmount: number;
  };

  // New system info
  newSystem: {
    name: string;
    importDate: string;
    recordCount: number;
    totalAmount: number;
  };

  // Validation rules
  validationChecks: MigrationValidation[];
}

export interface MigrationValidation {
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  details?: string;
  expectedValue?: unknown;
  actualValue?: unknown;
}

// ============================================
// OPERATIONAL RECONCILIATION
// ============================================

export interface OperationalReconciliation extends ReconciliationSession {
  mode: 'operational';

  // Period info
  periodId: string;
  periodName: string;

  // Calculation reconciliation
  calculationReconciliation?: {
    calculatedTotal: number;
    approvedTotal: number;
    paidTotal: number;
    pendingTotal: number;
  };

  // External system reconciliation
  externalReconciliation?: {
    payrollSystemTotal: number;
    bankTotal: number;
    glTotal: number;
    variance: number;
  };
}

// ============================================
// RECONCILIATION REPORT
// ============================================

export interface ReconciliationReport {
  sessionId: string;
  generatedAt: string;
  generatedBy: string;

  // Summary
  summary: ReconciliationSummary;

  // Items by status
  itemsByStatus: Record<MatchStatus, number>;

  // Top discrepancies
  topDiscrepancies: Array<{
    itemId: string;
    amount: number;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;

  // By employee
  byEmployee: Array<{
    employeeId: string;
    employeeName: string;
    itemCount: number;
    matchedCount: number;
    discrepancyAmount: number;
  }>;

  // Trends (for operational mode)
  trends?: {
    previousPeriodDiscrepancies: number;
    discrepancyTrend: 'improving' | 'stable' | 'worsening';
    averageResolutionTime: number;
  };
}
