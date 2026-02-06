/**
 * Plan Approval Workflow Types
 *
 * Multi-stage approval workflow for compensation plans.
 */

export type ApprovalStage = 'draft' | 'manager_review' | 'finance_review' | 'executive_review' | 'approved' | 'rejected';

export type ReviewerRole = 'manager' | 'finance' | 'executive' | 'admin';

export interface PlanApprovalRequest {
  id: string;
  planId: string;
  planName: string;
  planVersion: number;
  tenantId: string;

  // Current state
  stage: ApprovalStage;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';

  // Requester info
  requesterId: string;
  requesterName: string;
  requestedAt: string;
  requestNotes?: string;

  // Workflow configuration
  requiredStages: ApprovalStage[];
  currentStageIndex: number;

  // Review history
  reviews: PlanReview[];

  // Resolution
  finalDecision?: 'approved' | 'rejected';
  finalDecisionBy?: string;
  finalDecisionByName?: string;
  finalDecisionAt?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface PlanReview {
  id: string;
  requestId: string;
  stage: ApprovalStage;

  // Reviewer info
  reviewerId: string;
  reviewerName: string;
  reviewerRole: ReviewerRole;

  // Decision
  decision: 'approve' | 'reject' | 'request_changes';
  comments?: string;

  // For request_changes
  changeRequests?: ChangeRequest[];

  // Timestamps
  reviewedAt: string;
}

export interface ChangeRequest {
  id: string;
  section: string;
  description: string;
  descriptionEs: string;
  priority: 'required' | 'recommended';
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ApprovalWorkflowConfig {
  id: string;
  tenantId: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  stages: WorkflowStage[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStage {
  stage: ApprovalStage;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  required: boolean;
  reviewerRoles: ReviewerRole[];
  autoApproveConditions?: AutoApproveCondition[];
}

export interface AutoApproveCondition {
  type: 'plan_type' | 'change_type' | 'value_threshold';
  operator: 'equals' | 'less_than' | 'greater_than' | 'contains';
  value: string | number;
}

// Stage metadata for UI
export const STAGE_CONFIG: Record<ApprovalStage, {
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  color: string;
  icon: string;
  order: number;
}> = {
  draft: {
    name: 'Draft',
    nameEs: 'Borrador',
    description: 'Plan is being prepared',
    descriptionEs: 'El plan se est\u00e1 preparando',
    color: 'gray',
    icon: 'FileEdit',
    order: 0,
  },
  manager_review: {
    name: 'Manager Review',
    nameEs: 'Revisi\u00f3n de Gerente',
    description: 'Awaiting manager approval',
    descriptionEs: 'Esperando aprobaci\u00f3n del gerente',
    color: 'blue',
    icon: 'UserCheck',
    order: 1,
  },
  finance_review: {
    name: 'Finance Review',
    nameEs: 'Revisi\u00f3n Financiera',
    description: 'Awaiting finance team review',
    descriptionEs: 'Esperando revisi\u00f3n del equipo financiero',
    color: 'purple',
    icon: 'Calculator',
    order: 2,
  },
  executive_review: {
    name: 'Executive Review',
    nameEs: 'Revisi\u00f3n Ejecutiva',
    description: 'Final executive approval',
    descriptionEs: 'Aprobaci\u00f3n ejecutiva final',
    color: 'amber',
    icon: 'Shield',
    order: 3,
  },
  approved: {
    name: 'Approved',
    nameEs: 'Aprobado',
    description: 'Plan has been approved',
    descriptionEs: 'El plan ha sido aprobado',
    color: 'green',
    icon: 'CheckCircle',
    order: 4,
  },
  rejected: {
    name: 'Rejected',
    nameEs: 'Rechazado',
    description: 'Plan was rejected',
    descriptionEs: 'El plan fue rechazado',
    color: 'red',
    icon: 'XCircle',
    order: 5,
  },
};

// Reviewer role metadata
export const REVIEWER_ROLES: Record<ReviewerRole, {
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
}> = {
  manager: {
    name: 'Manager',
    nameEs: 'Gerente',
    description: 'Team or department manager',
    descriptionEs: 'Gerente de equipo o departamento',
  },
  finance: {
    name: 'Finance',
    nameEs: 'Finanzas',
    description: 'Finance team member',
    descriptionEs: 'Miembro del equipo financiero',
  },
  executive: {
    name: 'Executive',
    nameEs: 'Ejecutivo',
    description: 'Senior leadership',
    descriptionEs: 'Liderazgo senior',
  },
  admin: {
    name: 'Administrator',
    nameEs: 'Administrador',
    description: 'System administrator',
    descriptionEs: 'Administrador del sistema',
  },
};

// Summary type for list views
export interface PlanApprovalSummary {
  id: string;
  planId: string;
  planName: string;
  stage: ApprovalStage;
  status: PlanApprovalRequest['status'];
  requesterName: string;
  requestedAt: string;
  currentReviewer?: string;
  daysInStage: number;
}
