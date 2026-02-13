/**
 * Forensics Types
 *
 * ALL fields that reference plan components use dynamic keys from the plan definition.
 * ZERO hardcoded references to specific customers, languages, or component names.
 * The Korean Test applies: every type works for any plan in any language.
 */

import type { ComponentType, MeasurementLevel } from '@/types/compensation-plan';

// =============================================================================
// CALCULATION TRACE — emitted per employee per run
// =============================================================================

export interface CalculationTrace {
  traceId: string;
  calculationRunId: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  storeId?: string;
  tenantId: string;
  timestamp: string;

  /** Variant selection trace */
  variant: VariantTrace;

  /** Dynamic — one per plan component, driven by plan definition */
  components: ComponentTrace[];

  totalIncentive: number;
  currency: string;

  /** Diagnostic flags collected during trace */
  flags: string[];
}

export interface VariantTrace {
  variantId: string;
  variantName: string;
  selectionReasoning: string;
  eligibilityFields: Record<string, unknown>;
}

export interface ComponentTrace {
  componentId: string;
  componentName: string;
  calculationType: ComponentType | string;
  measurementLevel: MeasurementLevel | string;
  enabled: boolean;

  /** Metric resolution details */
  metrics: MetricTrace[];

  /** Lookup path (varies by calculation type) */
  lookup: LookupTrace;

  /** Data provenance */
  dataProvenance: DataProvenance;

  /** Payout result */
  outputValue: number;
  calculationSentence: string;

  /** Component-level flags */
  flags: ComponentFlag[];
}

export interface MetricTrace {
  metricName: string;
  semanticType: string;
  resolvedValue: number;
  resolutionPath: string;
  sourceSheet: string;
  sourceField: string;
  confidence: number;
}

export interface LookupTrace {
  type: string;

  // Tier lookup
  tierIndex?: number;
  tierLabel?: string;
  tierBoundaries?: Array<{ min: number; max: number; label: string; value: number }>;

  // Matrix lookup
  rowMetric?: string;
  rowValue?: number;
  rowIndex?: number;
  rowLabel?: string;
  columnMetric?: string;
  columnValue?: number;
  columnIndex?: number;
  columnLabel?: string;
  matrixGrid?: number[][];

  // Percentage
  rate?: number;
  baseAmount?: number;

  // Conditional
  conditionMetric?: string;
  conditionValue?: number;
  matchedConditionLabel?: string;
  matchedConditionRate?: number;

  // Full lookup data for display
  lookupData?: unknown;
}

export interface DataProvenance {
  sourceSheet: string;
  topology: string;
  storeId?: string;

  periodResolution: {
    detectedPeriod: { month?: number; year?: number } | null;
    periodDetectionMethod: string;
    measurementPeriod: string;
    recordsInScope: number;
    periodKey: string;
  };

  /** All fields from source record — Carry Everything */
  allFields: Record<string, unknown>;

  stages: TransformationStage[];
}

export interface TransformationStage {
  stageName: string;
  values: Record<string, unknown>;
  transformationApplied?: string;
  mutationDetected: boolean;
}

export interface ComponentFlag {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

// =============================================================================
// RECONCILIATION SESSION
// =============================================================================

export interface ReconciliationSession {
  sessionId: string;
  tenantId: string;
  planId: string;
  calculationRunId: string;
  comparisonDataId?: string;
  createdAt: string;

  columnMapping?: ColumnMapping;
  aggregates: ReconciliationAggregates;
  population: PopulationSummary;
  employeeResults: EmployeeReconciliation[];
  pipelineHealth: PipelineHealthResult;
}

export interface ColumnMapping {
  mappings: ColumnMap[];
  aiConfidence: number;
  userApproved: boolean;
}

export interface ColumnMap {
  sourceColumn: string;
  mappedTo: string;
  confidence: number;
  aiReasoning: string;
  userOverride?: string;
}

export interface ReconciliationAggregates {
  vlTotal: number;
  gtTotal?: number;
  difference?: number;
  /** Dynamic from plan — one per component */
  componentTotals: ComponentAggregate[];
}

export interface ComponentAggregate {
  componentId: string;
  componentName: string;
  vlTotal: number;
  gtTotal?: number;
  difference?: number;
  employeesAffected?: number;
}

export interface PopulationSummary {
  totalEmployees: number;
  trueMatches: number;
  coincidentalMatches: number;
  mismatches: number;
  unmatchedVL: string[];
  unmatchedGT: string[];
}

export interface EmployeeReconciliation {
  employeeId: string;
  storeId?: string;
  variantId?: string;
  vlTotal: number;
  gtTotal: number;
  difference: number;
  matchClassification: 'true_match' | 'coincidental_match' | 'mismatch';
  /** Dynamic — keyed by componentId from plan */
  componentDiffs: Record<string, { vl: number; gt: number; diff: number }>;
  cancellationAmount?: number;
}

// =============================================================================
// PIPELINE HEALTH
// =============================================================================

export interface PipelineHealthResult {
  layers: {
    interpretation: PipelineLayer;
    metric: PipelineLayer & { sheetsWithPeriod: number; totalSheets: number };
    component: PipelineLayer & { coincidentalCount: number };
    population: PipelineLayer & { employees: number; duplicates: number; periods: number };
    outcome: PipelineLayer & { vlTotal: number; gtTotal?: number };
  };
  overallStatus: 'healthy' | 'warnings' | 'critical';
  generatedAt: string;
}

export interface PipelineLayer {
  status: 'pass' | 'warning' | 'fail';
  flagCount: number;
  flags: string[];
}
