/**
 * Shadow Payroll Types
 *
 * Types for parallel calculation and shadow payroll comparison.
 */

// ============================================
// CALCULATION SCENARIO
// ============================================

export type ScenarioType = 'shadow' | 'what_if' | 'retroactive' | 'forecast';

export type ScenarioStatus =
  | 'draft'
  | 'running'
  | 'completed'
  | 'failed'
  | 'approved'
  | 'applied';

export interface CalculationScenario {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: ScenarioType;
  status: ScenarioStatus;

  // Base configuration
  basePeriodId: string;
  comparisonPeriodId?: string;

  // Scenario parameters
  parameters: ScenarioParameters;

  // Results
  results?: ScenarioResults;

  // Audit
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ScenarioParameters {
  // Scope
  entityIds?: string[];
  departmentIds?: string[];
  planIds?: string[];

  // Modifications (for what-if)
  modifications?: ScenarioModification[];

  // Shadow configuration
  shadowConfig?: {
    legacySystemId: string;
    newSystemId: string;
    tolerancePercentage: number;
    toleranceAbsolute: number;
  };

  // Forecast configuration
  forecastConfig?: {
    periods: number;
    growthRate?: number;
    seasonalityFactors?: Record<string, number>;
  };
}

export interface ScenarioModification {
  type: 'rate_change' | 'quota_change' | 'territory_change' | 'plan_change' | 'rule_change';
  target: string; // ID of the entity being modified
  field: string;
  oldValue: unknown;
  newValue: unknown;
  effectiveDate?: string;
}

// ============================================
// SCENARIO RESULTS
// ============================================

export interface ScenarioResults {
  // Summary
  summary: ScenarioSummary;

  // Employee-level results
  employeeResults: EmployeeScenarioResult[];

  // Comparison (for shadow/what-if)
  comparison?: ComparisonResults;

  // Validation
  validation: ScenarioValidation;
}

export interface ScenarioSummary {
  entitiesProcessed: number;
  totalBasePayout: number;
  totalScenarioPayout: number;
  totalDifference: number;
  percentageDifference: number;

  // Breakdown
  byType: {
    increased: number;
    decreased: number;
    unchanged: number;
    newPayouts: number;
    removedPayouts: number;
  };

  // Impact metrics
  averageImpact: number;
  medianImpact: number;
  maxPositiveImpact: number;
  maxNegativeImpact: number;
}

export interface EmployeeScenarioResult {
  entityId: string;
  entityName?: string;

  // Base calculation
  basePayout: number;
  baseBreakdown: PayoutBreakdown;

  // Scenario calculation
  scenarioPayout: number;
  scenarioBreakdown: PayoutBreakdown;

  // Comparison
  difference: number;
  percentageDifference: number;
  impact: 'positive' | 'negative' | 'neutral';

  // Details
  componentDifferences: ComponentDifference[];
  appliedModifications: string[];

  // Confidence
  confidence: number;
  warnings: string[];
}

export interface PayoutBreakdown {
  commission: number;
  bonus: number;
  spiff: number;
  accelerator: number;
  adjustment: number;
  clawback: number;
  total: number;
}

export interface ComponentDifference {
  component: string;
  componentType: string;
  baseAmount: number;
  scenarioAmount: number;
  difference: number;
  reason?: string;
}

// ============================================
// COMPARISON RESULTS
// ============================================

export interface ComparisonResults {
  // Match statistics
  matchedCount: number;
  unmatchedCount: number;
  discrepancyCount: number;

  // Amount comparison
  totalBase: number;
  totalScenario: number;
  totalVariance: number;
  variancePercentage: number;

  // Within tolerance
  withinTolerance: number;
  outsideTolerance: number;
  toleranceBreaches: ToleranceBreach[];

  // By category
  byCategory: Array<{
    category: string;
    baseAmount: number;
    scenarioAmount: number;
    variance: number;
  }>;
}

export interface ToleranceBreach {
  entityId: string;
  entityName?: string;
  component: string;
  baseAmount: number;
  scenarioAmount: number;
  variance: number;
  variancePercentage: number;
  breachType: 'percentage' | 'absolute' | 'both';
}

// ============================================
// SCENARIO VALIDATION
// ============================================

export interface ScenarioValidation {
  isValid: boolean;
  confidence: number;

  // Checks performed
  checks: ValidationCheck[];

  // Issues
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationCheck {
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  details?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  affectedEmployees?: string[];
  suggestedAction?: string;
}

// ============================================
// SHADOW PAYROLL RUN
// ============================================

export interface ShadowPayrollRun {
  id: string;
  tenantId: string;
  periodId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';

  // Systems being compared
  legacySystem: {
    name: string;
    runDate: string;
    totalAmount: number;
    recordCount: number;
  };

  newSystem: {
    name: string;
    runDate: string;
    totalAmount: number;
    recordCount: number;
  };

  // Results
  comparison?: ShadowComparison;

  // Configuration
  tolerances: {
    percentageTolerance: number;
    absoluteTolerance: number;
    ignoredComponents?: string[];
  };

  // Audit
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface ShadowComparison {
  // Summary
  totalLegacy: number;
  totalNew: number;
  variance: number;
  variancePercentage: number;

  // Match statistics
  exactMatches: number;
  withinTolerance: number;
  outsideTolerance: number;
  onlyInLegacy: number;
  onlyInNew: number;

  // Confidence
  overallConfidence: number;
  readyForCutover: boolean;

  // Employee-level details
  employeeComparisons: EmployeeShadowComparison[];
}

export interface EmployeeShadowComparison {
  entityId: string;
  entityName?: string;

  // Amounts
  legacyAmount: number;
  newAmount: number;
  variance: number;
  variancePercentage: number;

  // Status
  status: 'exact_match' | 'within_tolerance' | 'outside_tolerance' | 'legacy_only' | 'new_only';

  // Component-level comparison
  componentComparisons: Array<{
    component: string;
    legacyAmount: number;
    newAmount: number;
    variance: number;
    withinTolerance: boolean;
  }>;

  // Investigation notes
  investigationRequired: boolean;
  investigationNotes?: string;
  investigatedBy?: string;
  investigatedAt?: string;
}

// ============================================
// PARALLEL EXECUTION
// ============================================

export interface ParallelExecution {
  id: string;
  tenantId: string;
  periodId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';

  // Executions
  executions: ExecutionInstance[];

  // Comparison
  comparisonReady: boolean;
  comparisonResults?: ParallelComparisonResults;

  // Audit
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface ExecutionInstance {
  id: string;
  name: string;
  description?: string;
  configuration: Record<string, unknown>;

  // Status
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;

  // Results
  results?: {
    entitiesProcessed: number;
    totalPayout: number;
    errors: number;
  };
}

export interface ParallelComparisonResults {
  // All executions
  executionCount: number;

  // Variance analysis
  maxVariance: number;
  minVariance: number;
  averageVariance: number;

  // Convergence
  allConverged: boolean;
  convergenceThreshold: number;

  // Per-employee variance
  employeeVariances: Array<{
    entityId: string;
    amounts: Record<string, number>; // execution ID -> amount
    variance: number;
    converged: boolean;
  }>;
}

// ============================================
// CUTOVER READINESS
// ============================================

export interface CutoverReadiness {
  periodId: string;
  assessedAt: string;
  assessedBy: string;

  // Overall status
  isReady: boolean;
  confidenceScore: number;

  // Criteria
  criteria: CutoverCriterion[];

  // Recommendations
  recommendations: string[];
  blockers: string[];
}

export interface CutoverCriterion {
  name: string;
  description: string;
  weight: number;
  status: 'passed' | 'failed' | 'warning' | 'not_evaluated';
  score: number; // 0-100
  details?: string;
}
