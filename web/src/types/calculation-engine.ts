/**
 * Batch Calculation Engine Types
 *
 * Types for the compliance-configurable calculation ledger and batch processing.
 */

// ============================================
// CALCULATION BATCH
// ============================================

export type BatchStatus =
  | 'pending'
  | 'validating'
  | 'calculating'
  | 'reconciling'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface CalculationBatch {
  id: string;
  tenantId: string;
  periodId: string;
  ruleSetId?: string;

  // Batch info
  name: string;
  description?: string;
  status: BatchStatus;

  // Processing
  startedAt?: string;
  completedAt?: string;
  progress: {
    phase: string;
    current: number;
    total: number;
    percentage: number;
  };

  // Results
  results?: {
    entityCount?: number;
    entitiesProcessed: number;
    calculationsPerformed: number;
    totalPayout: number;
    errors: number;
    warnings: number;
  };

  // Audit
  createdBy: string;
  createdAt: string;
}

// ============================================
// CALCULATION LEDGER
// ============================================

export type LedgerEntryType =
  | 'base_salary'
  | 'variable_payout'
  | 'bonus'
  | 'spiff'
  | 'adjustment'
  | 'clawback'
  | 'draw'
  | 'guarantee'
  | 'override'
  | 'accelerator';

export interface LedgerEntry {
  id: string;
  batchId: string;
  entityId: string;
  periodId: string;

  // Entry details
  type: LedgerEntryType;
  description: string;
  amount: number;
  currency: string;

  // Calculation source
  sourceType: 'transaction' | 'plan' | 'manual' | 'rule';
  sourceId?: string;
  ruleSetId?: string;
  componentId?: string;

  // Compliance
  jurisdictionalRules?: string[];
  taxTreatment?: 'regular' | 'supplemental' | 'bonus';

  // Status
  status: 'pending' | 'approved' | 'paid' | 'reversed';
  reversedEntryId?: string;

  // Audit
  calculatedAt: string;
  calculatedBy: string;
  approvedAt?: string;
  approvedBy?: string;
}

// ============================================
// CALCULATION RULE
// ============================================

export type RuleOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with';

export interface CalculationRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  priority: number; // Higher = evaluated first

  // Conditions
  conditions: RuleCondition[];
  conditionLogic: 'and' | 'or';

  // Actions
  actions: RuleAction[];

  // Effective dates
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;

  // Audit
  createdBy: string;
  createdAt: string;
}

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: unknown;
  valueType: 'string' | 'number' | 'date' | 'boolean' | 'array';
}

export interface RuleAction {
  type: 'set_rate' | 'apply_multiplier' | 'add_amount' | 'set_tier' | 'exclude' | 'flag';
  target: string;
  value: unknown;
  reason?: string;
}

// ============================================
// CALCULATION RESULT
// ============================================

export interface EntityCalculationResult {
  entityId: string;
  batchId: string;
  periodId: string;

  // Summary
  grossPayout: number;
  deductions: number;
  netPayout: number;
  currency: string;

  // Breakdown
  byType: Record<LedgerEntryType, number>;
  entries: LedgerEntry[];

  // Compliance
  rulesApplied: string[];
  jurisdictionsEvaluated: string[];

  // Validation
  errors: CalculationError[];
  warnings: CalculationWarning[];

  // Status
  status: 'success' | 'partial' | 'failed';
  calculatedAt: string;
}

export interface CalculationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'critical';
}

export interface CalculationWarning {
  code: string;
  message: string;
  field?: string;
}

// ============================================
// TIER CALCULATION
// ============================================

export interface TierDefinition {
  id: string;
  name: string;
  tiers: Tier[];
}

export interface Tier {
  min: number;
  max: number;
  rate: number;
  rateType: 'percentage' | 'fixed' | 'per_unit';
  marginal: boolean; // If true, rate applies only to amount within tier
}

export interface TierResult {
  tierId: string;
  tierIndex: number;
  baseAmount: number;
  tierAmount: number;
  rate: number;
  earnedAmount: number;
}

// ============================================
// QUOTA ATTAINMENT
// ============================================

export interface QuotaAttainment {
  entityId: string;
  periodId: string;
  quotaId: string;

  // Quota info
  quotaAmount: number;
  attainedAmount: number;
  attainmentPercentage: number;

  // Components
  components: Array<{
    sourceId: string;
    sourceType: 'transaction' | 'credit' | 'adjustment';
    amount: number;
    creditDate: string;
  }>;

  // Period-to-date
  ptdQuota: number;
  ptdAttained: number;
  ptdPercentage: number;

  // Year-to-date
  ytdQuota: number;
  ytdAttained: number;
  ytdPercentage: number;
}

// ============================================
// ACCELERATOR
// ============================================

export interface Accelerator {
  id: string;
  name: string;
  description?: string;

  // Trigger
  triggerType: 'attainment' | 'date' | 'event' | 'manual';
  triggerThreshold?: number;
  triggerDate?: string;

  // Effect
  multiplier: number;
  appliesTo: LedgerEntryType[];
  retroactive: boolean;
  retroactivePeriods?: number;

  // Limits
  maxEarnings?: number;
  maxMultiplier?: number;
}

export interface AcceleratorApplication {
  acceleratorId: string;
  entityId: string;
  periodId: string;
  triggeredAt: string;
  multiplier: number;
  baseAmount: number;
  acceleratedAmount: number;
  capped: boolean;
  capAmount?: number;
}
