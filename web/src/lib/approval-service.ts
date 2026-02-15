import { ApprovalRequest, ApprovalStatus, ApprovalTier } from '@/types/audit';
import { audit } from './audit-service';

interface CreateApprovalParams {
  requestType: string;
  tier: ApprovalTier;
  changeData: Record<string, unknown>;
  reason: string;
}

class ApprovalService {
  /**
   * Create a new approval request
   */
  createRequest(params: CreateApprovalParams): ApprovalRequest {
    const currentUser = this.getCurrentUser();
    const approver = this.getApproverForTier(params.tier);

    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      requestType: params.requestType,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      approverId: approver.id,
      approverName: approver.name,
      status: 'pending',
      tier: params.tier,
      requestedAt: new Date().toISOString(),
      changeData: params.changeData,
      reason: params.reason,
    };

    // Store
    const requests = this.getAllRequests();
    requests.push(request);
    this.saveRequests(requests);

    // Audit log
    audit.log({
      action: 'create',
      entityType: 'approval',
      entityId: request.id,
      metadata: { requestType: params.requestType, tier: params.tier },
    });

    return request;
  }

  /**
   * Approve a request
   */
  approve(requestId: string, comment?: string): ApprovalRequest | null {
    const requests = this.getAllRequests();
    const request = requests.find((r) => r.id === requestId);

    if (!request || request.status !== 'pending') {
      return null;
    }

    request.status = 'approved';
    request.respondedAt = new Date().toISOString();

    this.saveRequests(requests);

    audit.log({
      action: 'approve',
      entityType: 'approval',
      entityId: request.id,
      reason: comment,
    });

    return request;
  }

  /**
   * Reject a request
   */
  reject(requestId: string, rejectionReason: string): ApprovalRequest | null {
    const requests = this.getAllRequests();
    const request = requests.find((r) => r.id === requestId);

    if (!request || request.status !== 'pending') {
      return null;
    }

    request.status = 'rejected';
    request.respondedAt = new Date().toISOString();
    request.rejectionReason = rejectionReason;

    this.saveRequests(requests);

    audit.log({
      action: 'reject',
      entityType: 'approval',
      entityId: request.id,
      reason: rejectionReason,
    });

    return request;
  }

  /**
   * Get all requests
   */
  getAllRequests(): ApprovalRequest[] {
    return [];
  }

  /**
   * Get pending requests for current user as approver
   */
  getPendingForApprover(): ApprovalRequest[] {
    const user = this.getCurrentUser();
    return this.getAllRequests().filter(
      (r) => r.status === 'pending' &&
             (r.approverId === user.id || user.role === 'Admin')
    );
  }

  /**
   * Get requests created by current user
   */
  getMyRequests(): ApprovalRequest[] {
    const user = this.getCurrentUser();
    return this.getAllRequests().filter((r) => r.requesterId === user.id);
  }

  /**
   * Get counts by status
   */
  getCounts(): Record<ApprovalStatus, number> {
    const all = this.getAllRequests();
    return {
      draft: all.filter((r) => r.status === 'draft').length,
      pending: all.filter((r) => r.status === 'pending').length,
      approved: all.filter((r) => r.status === 'approved').length,
      rejected: all.filter((r) => r.status === 'rejected').length,
      applied: all.filter((r) => r.status === 'applied').length,
    };
  }

  // Private helpers

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private saveRequests(_requests: ApprovalRequest[]): void {
    // No-op: localStorage removed
  }

  private getCurrentUser(): { id: string; name: string; role: string } {
    return { id: 'user-1', name: 'Sarah Chen', role: 'Sales Rep' };
  }

  private getApproverForTier(tier: ApprovalTier): { id: string; name: string } {
    // Maps tier to approver
    const approvers: Record<ApprovalTier, { id: string; name: string }> = {
      1: { id: 'system', name: 'Auto-approved' },
      2: { id: 'user-mike', name: 'Mike Chen' },
      3: { id: 'user-lisa', name: 'Lisa Park' },
      4: { id: 'user-admin', name: 'Admin Team' },
    };
    return approvers[tier];
  }
}

export const approvalService = new ApprovalService();
