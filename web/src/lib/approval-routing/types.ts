/**
 * Approval Routing Types
 *
 * Universal approval system for all sensitive platform actions.
 * Uses Impact Rating for dynamic routing decisions.
 */

export type ApprovalDomain =
  | 'import_batch'
  | 'rollback'
  | 'compensation_plan'
  | 'period_operation'
  | 'hierarchy_change'
  | 'manual_adjustment'
  | 'personnel_change'
  | 'configuration_change';

export type ApprovalChainType = 'single' | 'sequential' | 'parallel' | 'conditional';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired' | 'delegated';

// ============================================
// APPROVAL REQUEST
// ============================================

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  domain: ApprovalDomain;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalStatus;

  // Self-contained context — approver sees everything here
  summary: ApprovalSummary;

  // Impact analysis
  impactRating: ImpactRating;
  impactDetails: ImpactDetail[];

  // System recommendation
  recommendation: ApprovalRecommendation;

  // Approval chain
  chain: ApprovalChain;

  // Resolution
  resolution?: ApprovalResolution;

  // Audit
  auditTrail: ApprovalAuditEntry[];

  // Expiration / SLA
  dueBy?: string;
  escalateAfter?: string;
  escalateTo?: string;

  // Reference to source entity
  sourceEntityId?: string;
  sourceEntityType?: string;
}

export interface ApprovalSummary {
  title: string;
  titleEs: string;
  description: string;
  descriptionEs: string;
  actionType: string; // Human-readable action
  actionTypeEs: string;
}

export interface ApprovalResolution {
  decidedBy: string;
  decidedAt: string;
  decision: 'approved' | 'rejected' | 'escalated';
  notes?: string;
  notesEs?: string;
}

export interface ApprovalAuditEntry {
  timestamp: string;
  action: string;
  userId: string;
  userName?: string;
  details: string;
}

// ============================================
// IMPACT RATING
// ============================================

export interface ImpactRating {
  overall: number; // 1-10 composite score
  dimensions: ImpactDimensions;
}

export interface ImpactDimensions {
  financial: number; // 0-10: $ value affected
  entityCount: number; // 0-10: people affected
  periodStatus: number; // 0-10: touching approved/paid periods?
  cascadeScope: number; // 0-10: downstream recalculations
  timelineSensitivity: number; // 0-10: urgency
  regulatoryRisk: number; // 0-10: compliance implications
}

export interface ImpactDetail {
  dimension: keyof ImpactDimensions | string;
  label: string;
  labelEs: string;
  description: string;
  descriptionEs: string;
  value: string; // Human-readable (e.g., "$12,400", "47 employees", "3 periods")
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================
// RECOMMENDATION
// ============================================

export interface ApprovalRecommendation {
  action: 'approve' | 'review' | 'escalate' | 'reject';
  confidence: number; // 0-100
  reasoning: string;
  reasoningEs: string;
  historicalContext?: string;
  historicalContextEs?: string;
}

// ============================================
// APPROVAL CHAIN
// ============================================

export interface ApprovalChain {
  type: ApprovalChainType;
  steps: ApprovalChainStep[];
  currentStep: number;
}

export interface ApprovalChainStep {
  stepNumber: number;
  approverId?: string; // Specific person
  approverRole?: string; // Role-based (first available person with this role)
  approverDynamic?: string; // Context-aware: 'payroll_lead', 'compliance_officer'
  approverName?: string;
  status: ApprovalStatus;
  decidedAt?: string;
  decidedBy?: string;
  notes?: string;
}

// ============================================
// APPROVAL RULES
// ============================================

export interface ApprovalRule {
  id: string;
  tenantId: string;
  domain: ApprovalDomain;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  conditions: ApprovalCondition[]; // When this rule triggers
  chainDefinition: ChainDefinition;
  sla: ApprovalSLA;
  active: boolean;
  priority: number; // Higher = evaluated first
}

export interface ApprovalCondition {
  field: string; // e.g., 'impactRating.overall', 'impactRating.dimensions.financial'
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'in' | 'between';
  value: number | number[] | string | string[];
}

export interface ChainDefinition {
  type: ApprovalChainType;
  steps: Omit<ApprovalChainStep, 'status' | 'decidedAt' | 'decidedBy' | 'notes'>[];
}

export interface ApprovalSLA {
  dueInHours: number;
  escalateAfterHours: number;
  escalateTo: string;
}

// ============================================
// CONTEXT FOR CREATING REQUESTS
// ============================================

export interface ApprovalContext {
  domain: ApprovalDomain;
  tenantId: string;
  requestedBy: string;
  summary: ApprovalSummary;
  sourceEntityId?: string;
  sourceEntityType?: string;

  // For impact calculation
  financialAmount?: number;
  currency?: string;
  affectedEmployees?: number;
  affectedPeriods?: string[];
  periodStatus?: 'open' | 'pending_review' | 'approved' | 'paid';
  cascadeCount?: number;
  isUrgent?: boolean;
  hasRegulatoryImplications?: boolean;

  // Additional context
  metadata?: Record<string, unknown>;
}

// ============================================
// FILTERS & QUERIES
// ============================================

export interface ApprovalFilters {
  domain?: ApprovalDomain | ApprovalDomain[];
  status?: ApprovalStatus | ApprovalStatus[];
  requestedBy?: string;
  approverId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  minImpactRating?: number;
  maxImpactRating?: number;
}

// ============================================
// STATISTICS
// ============================================

export interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  escalated: number;
  avgResolutionTimeHours: number;
  byDomain: Record<ApprovalDomain, number>;
  overdueSla: number;
}
