/**
 * Plan Approval Service
 *
 * Manages multi-stage plan approval workflows.
 */

import type {
  PlanApprovalRequest,
  PlanReview,
  ApprovalStage,
  ReviewerRole,
  ChangeRequest,
  PlanApprovalSummary,
} from '@/types/plan-approval';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STORAGE_KEY = 'plan_approval_requests';

// ============================================
// APPROVAL REQUEST CRUD
// ============================================

/**
 * Get all approval requests
 */
export function getAllApprovalRequests(): PlanApprovalRequest[] {
  return getDefaultApprovalRequests();
}

/**
 * Get approval requests for a tenant
 */
export function getApprovalRequests(tenantId: string): PlanApprovalRequest[] {
  return getAllApprovalRequests()
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Get approval request by ID
 */
export function getApprovalRequest(requestId: string): PlanApprovalRequest | null {
  const requests = getAllApprovalRequests();
  return requests.find((r) => r.id === requestId) || null;
}

/**
 * Get approval request for a specific plan
 */
export function getApprovalForPlan(ruleSetId: string): PlanApprovalRequest | null {
  const requests = getAllApprovalRequests();
  return requests.find((r) => r.ruleSetId === ruleSetId && r.status !== 'withdrawn') || null;
}

/**
 * Get pending approvals for a reviewer
 */
export function getPendingForReviewer(
  tenantId: string,
  reviewerRole: ReviewerRole
): PlanApprovalRequest[] {
  return getApprovalRequests(tenantId).filter((r) => {
    if (r.status !== 'pending' && r.status !== 'in_review') return false;

    const currentStage = r.requiredStages[r.currentStageIndex];
    return canReviewStage(currentStage, reviewerRole);
  });
}

/**
 * Get approvals by stage
 */
export function getApprovalsByStage(
  tenantId: string,
  stage: ApprovalStage
): PlanApprovalRequest[] {
  return getApprovalRequests(tenantId).filter((r) => r.stage === stage);
}

// ============================================
// WORKFLOW ACTIONS
// ============================================

/**
 * Submit a plan for approval
 */
export function submitForApproval(
  ruleSetId: string,
  ruleSetName: string,
  ruleSetVersion: number,
  tenantId: string,
  requesterId: string,
  requesterName: string,
  notes?: string
): PlanApprovalRequest {
  const now = new Date().toISOString();

  // Default workflow: manager -> finance -> executive
  const requiredStages: ApprovalStage[] = ['manager_review', 'finance_review', 'executive_review'];

  const request: PlanApprovalRequest = {
    id: `apr-${Date.now()}`,
    ruleSetId,
    ruleSetName,
    ruleSetVersion,
    tenantId,
    stage: 'manager_review',
    status: 'pending',
    requesterId,
    requesterName,
    requestedAt: now,
    requestNotes: notes,
    requiredStages,
    currentStageIndex: 0,
    reviews: [],
    createdAt: now,
    updatedAt: now,
  };

  const requests = getAllApprovalRequests();
  requests.push(request);
  saveRequests(requests);

  return request;
}

/**
 * Submit a review for an approval request
 */
export function submitReview(
  requestId: string,
  reviewerId: string,
  reviewerName: string,
  reviewerRole: ReviewerRole,
  decision: 'approve' | 'reject' | 'request_changes',
  comments?: string,
  changeRequests?: ChangeRequest[]
): PlanApprovalRequest | null {
  const requests = getAllApprovalRequests();
  const index = requests.findIndex((r) => r.id === requestId);

  if (index < 0) return null;

  const request = requests[index];
  const now = new Date().toISOString();

  // Create review record
  const review: PlanReview = {
    id: `rev-${Date.now()}`,
    requestId,
    stage: request.stage,
    reviewerId,
    reviewerName,
    reviewerRole,
    decision,
    comments,
    changeRequests,
    reviewedAt: now,
  };

  request.reviews.push(review);
  request.status = 'in_review';
  request.updatedAt = now;

  if (decision === 'approve') {
    // Move to next stage or complete
    if (request.currentStageIndex < request.requiredStages.length - 1) {
      request.currentStageIndex++;
      request.stage = request.requiredStages[request.currentStageIndex];
      request.status = 'pending';
    } else {
      // All stages complete
      request.stage = 'approved';
      request.status = 'approved';
      request.finalDecision = 'approved';
      request.finalDecisionBy = reviewerId;
      request.finalDecisionByName = reviewerName;
      request.finalDecisionAt = now;
    }
  } else if (decision === 'reject') {
    request.stage = 'rejected';
    request.status = 'rejected';
    request.finalDecision = 'rejected';
    request.finalDecisionBy = reviewerId;
    request.finalDecisionByName = reviewerName;
    request.finalDecisionAt = now;
  }
  // For 'request_changes', status stays 'in_review' and requester needs to address

  requests[index] = request;
  saveRequests(requests);

  return request;
}

/**
 * Withdraw an approval request
 */
export function withdrawRequest(requestId: string): PlanApprovalRequest | null {
  const requests = getAllApprovalRequests();
  const index = requests.findIndex((r) => r.id === requestId);

  if (index < 0) return null;

  const request = requests[index];
  if (request.status === 'approved' || request.status === 'rejected') {
    return null; // Cannot withdraw completed requests
  }

  request.status = 'withdrawn';
  request.updatedAt = new Date().toISOString();

  requests[index] = request;
  saveRequests(requests);

  return request;
}

/**
 * Resubmit after changes requested
 */
export function resubmitAfterChanges(
  requestId: string,
  notes?: string
): PlanApprovalRequest | null {
  const requests = getAllApprovalRequests();
  const index = requests.findIndex((r) => r.id === requestId);

  if (index < 0) return null;

  const request = requests[index];
  request.status = 'pending';
  request.requestNotes = notes;
  request.updatedAt = new Date().toISOString();

  // Mark all change requests as resolved
  request.reviews.forEach((review) => {
    if (review.changeRequests) {
      review.changeRequests.forEach((cr) => {
        cr.resolved = true;
        cr.resolvedAt = request.updatedAt;
      });
    }
  });

  requests[index] = request;
  saveRequests(requests);

  return request;
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get approval workflow statistics
 */
export function getApprovalStats(tenantId: string): {
  pending: number;
  inReview: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  avgDaysToApprove: number;
  byStage: Record<ApprovalStage, number>;
} {
  const requests = getApprovalRequests(tenantId);

  const byStage: Record<ApprovalStage, number> = {
    draft: 0,
    manager_review: 0,
    finance_review: 0,
    executive_review: 0,
    approved: 0,
    rejected: 0,
  };

  requests.forEach((r) => {
    byStage[r.stage]++;
  });

  // Calculate average days to approval
  const approvedRequests = requests.filter((r) => r.status === 'approved' && r.finalDecisionAt);
  let avgDays = 0;
  if (approvedRequests.length > 0) {
    const totalDays = approvedRequests.reduce((sum, r) => {
      const start = new Date(r.requestedAt).getTime();
      const end = new Date(r.finalDecisionAt!).getTime();
      return sum + (end - start) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDays = Math.round(totalDays / approvedRequests.length);
  }

  return {
    pending: requests.filter((r) => r.status === 'pending').length,
    inReview: requests.filter((r) => r.status === 'in_review').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    withdrawn: requests.filter((r) => r.status === 'withdrawn').length,
    avgDaysToApprove: avgDays,
    byStage,
  };
}

/**
 * Get approval summaries for list display
 */
export function getApprovalSummaries(tenantId: string): PlanApprovalSummary[] {
  const requests = getApprovalRequests(tenantId);
  const now = new Date();

  return requests.map((r) => {
    const stageStart = r.reviews.length > 0
      ? new Date(r.reviews[r.reviews.length - 1].reviewedAt)
      : new Date(r.requestedAt);
    const daysInStage = Math.floor((now.getTime() - stageStart.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: r.id,
      ruleSetId: r.ruleSetId,
      ruleSetName: r.ruleSetName,
      stage: r.stage,
      status: r.status,
      requesterName: r.requesterName,
      requestedAt: r.requestedAt,
      daysInStage,
    };
  });
}

// ============================================
// HELPERS
// ============================================

function canReviewStage(stage: ApprovalStage, role: ReviewerRole): boolean {
  const stageReviewers: Record<ApprovalStage, ReviewerRole[]> = {
    draft: [],
    manager_review: ['manager', 'admin'],
    finance_review: ['finance', 'admin'],
    executive_review: ['executive', 'admin'],
    approved: [],
    rejected: [],
  };

  return stageReviewers[stage].includes(role);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function saveRequests(_requests: PlanApprovalRequest[]): void {
  // no-op: localStorage removed
}

// ============================================
// DEMO DATA
// ============================================

function getDefaultApprovalRequests(): PlanApprovalRequest[] {
  return [];
}

/**
 * Initialize approval requests
 */
export function initializePlanApprovals(): void {
  // no-op: localStorage removed
}

/**
 * Reset to default state
 */
export function resetPlanApprovals(): void {
  // no-op: localStorage removed
}
