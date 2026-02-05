export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'approve'
  | 'reject'
  | 'login'
  | 'logout'
  | 'permission_denied';

export type EntityType =
  | 'user'
  | 'transaction'
  | 'payment'
  | 'plan'
  | 'config'
  | 'approval'
  | 'inquiry'
  | 'role';

export interface AuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string;
  entityName?: string;
  changes?: AuditChange[];
  reason?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

// Approval types (used in Phase 3)
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'applied';
export type ApprovalTier = 1 | 2 | 3 | 4;

export interface ApprovalRequest {
  id: string;
  requestType: string;
  requesterId: string;
  requesterName?: string;
  approverId: string;
  approverName?: string;
  status: ApprovalStatus;
  tier: ApprovalTier;
  requestedAt: string;
  respondedAt?: string;
  changeData: Record<string, unknown>;
  reason: string;
  rejectionReason?: string;
}
