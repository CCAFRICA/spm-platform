/**
 * Rule Set Types - ViaLuce SPM Platform
 *
 * Supports two rule set types:
 * 1. additive_lookup - matrix + tier lookups
 * 2. weighted_kpi - KPI weights + multiplier curves
 */

// ============================================
// RULE SET METADATA
// ============================================

export type RuleSetType = 'weighted_kpi' | 'additive_lookup';
export type RuleSetStatus = 'draft' | 'pending_approval' | 'active' | 'archived';

export interface RuleSetConfig {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  ruleSetType: RuleSetType;
  status: RuleSetStatus;
  effectiveDate: string;
  endDate: string | null;
  eligibleRoles: string[];
  version: number;
  previousVersionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  configuration: AdditiveLookupConfig | WeightedKPIConfig;
}

// ============================================
// ADDITIVE LOOKUP CONFIGURATION
// ============================================

export interface AdditiveLookupConfig {
  type: 'additive_lookup';
  variants: PlanVariant[];
}

export interface PlanVariant {
  variantId: string;
  variantName: string;
  description?: string;
  eligibilityCriteria?: Record<string, unknown>;
  components: PlanComponent[];
}

// OB-196 Phase 1.7: foundational primitive vocabulary only.
// Legacy strings (matrix_lookup, tier_lookup, percentage, conditional_percentage)
// removed. F-005 platform-wide closure invariant.
export type ComponentType =
  | 'bounded_lookup_1d'
  | 'bounded_lookup_2d'
  | 'scalar_multiply'
  | 'conditional_gate'
  | 'linear_function'
  | 'piecewise_linear'
  | 'scope_aggregate'
  | 'aggregate'
  | 'ratio'
  | 'constant'
  | 'weighted_blend'
  | 'temporal_window';
export type MeasurementLevel = 'store' | 'individual' | 'team' | 'region';

export interface PlanComponent {
  id: string;
  name: string;
  description: string;
  order: number;
  enabled: boolean;
  componentType: ComponentType;
  measurementLevel: MeasurementLevel;
  /** OB-31: Period aggregation mode for metric data.
   * 'current' (default) = use period-specific data for this calculation period
   * 'cumulative' = use all-periods cumulative data (e.g., Collections) */
  measurementPeriod?: 'current' | 'cumulative';
  /** OB-77: AI-produced structural intent for domain-agnostic execution.
   * intent-executor reads this directly. */
  calculationIntent?: Record<string, unknown>;
  /** HF-156: AI metadata including intent for foundational primitive types */
  metadata?: Record<string, unknown>;
}

// OB-196 Phase 2: LegacyShapedPlanComponent transitional type + legacy SHAPE interfaces
// (MatrixConfig, TierConfig, PercentageConfig, ConditionalConfig, Band, Tier, ConditionalRate)
// deleted post-E2 structured-failure cleanup. Foundational shape lives in metadata.intent
// (Decision 151) — no parallel-authority SHAPE fields persist on PlanComponent.

// ============================================
// WEIGHTED KPI CONFIGURATION
// ============================================

export interface WeightedKPIConfig {
  type: 'weighted_kpi';
  targetBonusType: 'fixed' | 'salary_multiplier';
  targetBonusValue: number;
  bonusPeriodMonths: number;
  kpis: KPIConfig[];
  multiplierCurve: CurveConfig;
}

export interface KPIConfig {
  id: string;
  name: string;
  description?: string;
  weight: number; // 0-100, all must sum to 100
  measurementLevel: 'bu' | 'individual' | 'blended';
  blendRatio?: { bu: number; individual: number }; // must sum to 100
  metricSource: string;
  target: number;
  floor?: number;
  cap?: number;
}

export type CurveType = 'linear' | 'stepped' | 'custom';

export interface CurveConfig {
  curveType: CurveType;
  floor: number; // Minimum attainment to earn anything
  cap: number; // Maximum payout multiplier
  points: CurvePoint[];
}

export interface CurvePoint {
  attainment: number; // e.g., 0.8 for 80%
  payout: number; // e.g., 0.5 for 50% payout
}

// ============================================
// CALCULATION RESULT TYPES
// ============================================

export interface CalculationStep {
  order: number;
  componentId: string;
  componentName: string;
  componentType: ComponentType;
  description: string;
  inputs: {
    actual: number;
    target: number;
    attainment: number;
    additionalFactors?: Record<string, number>;
  };
  lookupDetails?: {
    tableType: 'matrix' | 'tier';
    rowBand?: string;
    colBand?: string;
    tierLabel?: string;
    foundValue: number;
  };
  multiplierDetails?: {
    curveUsed: string;
    inputAttainment: number;
    outputMultiplier: number;
  };
  // Audit trail - source data tracking
  sourceData?: {
    sheetName: string;           // Which data sheet the metrics came from
    columns: Record<string, string>; // metric name -> column name used
    rowIdentifier?: string;      // How the entity row was matched
  };
  // OB-27: Component trace for diagnosing calculation chain failures
  componentTrace?: {
    step1_aiContext: string | null;       // AI import mapping used
    step2_sheetClassification: string | null; // Sheet matched for this component
    step3_metricsExtracted: string[];     // Metrics found for this component
    step4_calcTypeResolved: boolean;      // Was component type recognized?
    step5_lookupSuccess: boolean;         // Did tier/matrix lookup succeed?
    step6_resultValue: number;            // Final output
    failureReason?: string;               // If $0, why?
  };
  calculation: string; // Human-readable calculation string
  outputValue: number;
  currency: string;
}

export interface CalculationResult {
  entityId: string;
  entityName: string;
  entityRole: string;
  ruleSetId: string;
  ruleSetName: string;
  totalOutcome?: number;
  departmentId?: string;
  departmentName?: string;
  storeId?: string;
  storeName?: string;
  managerId?: string;
  hireDate?: string;
  ruleSetVersion: number;
  ruleSetType: RuleSetType;
  variantId?: string;
  variantName?: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  components: CalculationStep[];
  totalIncentive: number;
  currency: string;
  calculatedAt: string;
  warnings?: string[];
}

// ============================================
// RULE SET HISTORY & AUDIT
// ============================================

export interface RuleSetChangeRecord {
  id: string;
  ruleSetId: string;
  previousVersion: number;
  newVersion: number;
  changeType: 'created' | 'modified' | 'status_changed' | 'approved' | 'archived';
  changes: RuleSetChange[];
  changedBy: string;
  changedAt: string;
  notes?: string;
}

export interface RuleSetChange {
  path: string;
  componentId?: string;
  componentName?: string;
  previousValue: unknown;
  newValue: unknown;
  description: string;
}

// ============================================
// HELPER TYPES
// ============================================

export interface RuleSetSummary {
  id: string;
  name: string;
  ruleSetType: RuleSetType;
  status: RuleSetStatus;
  effectiveDate: string;
  endDate: string | null;
  eligibleRoles: string[];
  version: number;
}

export function isAdditiveLookupConfig(config: AdditiveLookupConfig | WeightedKPIConfig): config is AdditiveLookupConfig {
  return config.type === 'additive_lookup';
}

export function isWeightedKPIConfig(config: AdditiveLookupConfig | WeightedKPIConfig): config is WeightedKPIConfig {
  return config.type === 'weighted_kpi';
}
