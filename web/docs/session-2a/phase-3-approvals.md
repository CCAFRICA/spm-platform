# Session 2A - Phase 3: Approval Workflow
## Duration: 1 hour

### Objective
Create approval workflow system for compensation adjustments and sensitive changes.

---

## Task 3.1: Create Approval Service (25 min)

**File:** `src/lib/approval-service.ts`

```typescript
import { ApprovalRequest, ApprovalStatus, ApprovalTier } from '@/types/audit';
import { audit } from './audit-service';

interface CreateApprovalParams {
  requestType: string;
  tier: ApprovalTier;
  changeData: Record<string, any>;
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
    try {
      return JSON.parse(localStorage.getItem('approval_requests') || '[]');
    } catch {
      return [];
    }
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

  private saveRequests(requests: ApprovalRequest[]): void {
    localStorage.setItem('approval_requests', JSON.stringify(requests));
  }

  private getCurrentUser(): { id: string; name: string; role: string } {
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) return JSON.parse(stored);
    } catch {}
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
```

---

## Task 3.2: Create Approval Card Component (20 min)

**File:** `src/components/approvals/approval-card.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Check, X, Clock, User, Calendar, AlertCircle } from 'lucide-react';
import { ApprovalRequest, ApprovalStatus } from '@/types/audit';
import { approvalService } from '@/lib/approval-service';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  request: ApprovalRequest;
  canApprove?: boolean;
  onUpdate?: () => void;
}

export function ApprovalCard({ request, canApprove = false, onUpdate }: Props) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    approvalService.approve(request.id);
    setIsProcessing(false);
    onUpdate?.();
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setIsProcessing(true);
    approvalService.reject(request.id, rejectionReason);
    setShowRejectDialog(false);
    setRejectionReason('');
    setIsProcessing(false);
    onUpdate?.();
  };

  const getStatusBadge = (status: ApprovalStatus) => {
    const config: Record<ApprovalStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      draft: { variant: 'outline', icon: null },
      pending: { variant: 'secondary', icon: <Clock className="h-3 w-3 mr-1" /> },
      approved: { variant: 'default', icon: <Check className="h-3 w-3 mr-1" /> },
      rejected: { variant: 'destructive', icon: <X className="h-3 w-3 mr-1" /> },
      applied: { variant: 'outline', icon: <Check className="h-3 w-3 mr-1" /> },
    };
    const c = config[status];
    return (
      <Badge variant={c.variant} className="flex items-center w-fit">
        {c.icon}
        {status}
      </Badge>
    );
  };

  const getTierLabel = (tier: number) => {
    const labels: Record<number, string> = {
      1: 'Auto',
      2: 'Manager',
      3: 'VP',
      4: 'Admin',
    };
    return labels[tier] || `Tier ${tier}`;
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">
                {request.requestType.replace(/_/g, ' ')}
              </CardTitle>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {request.reason}
              </p>
            </div>
            {getStatusBadge(request.status)}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Metadata */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {request.requesterName}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}
            </div>
            <Badge variant="outline" className="text-xs">
              {getTierLabel(request.tier)} Approval
            </Badge>
          </div>

          {/* Change Data Preview */}
          {Object.keys(request.changeData).length > 0 && (
            <div className="bg-muted/50 rounded p-2 text-xs font-mono">
              {Object.entries(request.changeData).slice(0, 2).map(([key, val]) => (
                <div key={key} className="truncate">
                  <span className="text-muted-foreground">{key}:</span>{' '}
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </div>
              ))}
              {Object.keys(request.changeData).length > 2 && (
                <span className="text-muted-foreground">
                  +{Object.keys(request.changeData).length - 2} more
                </span>
              )}
            </div>
          )}

          {/* Rejection Reason */}
          {request.rejectionReason && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded p-2">
              <p className="text-sm text-red-700 dark:text-red-300 flex items-start gap-1">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                {request.rejectionReason}
              </p>
            </div>
          )}

          {/* Actions */}
          {canApprove && request.status === 'pending' && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={handleApprove}
                disabled={isProcessing}
              >
                <Check className="mr-1 h-4 w-4" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                onClick={() => setShowRejectDialog(true)}
                disabled={isProcessing}
              >
                <X className="mr-1 h-4 w-4" />
                Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for rejection. This will be visible to the requester.
            </p>
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectionReason.trim() || isProcessing}
            >
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

---

## Task 3.3: Create Approvals Page (15 min)

**File:** `src/app/performance/approvals/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import { ApprovalCard } from '@/components/approvals/approval-card';
import { approvalService } from '@/lib/approval-service';
import { ApprovalRequest } from '@/types/audit';

export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [myRequests, setMyRequests] = useState<ApprovalRequest[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setPendingApprovals(approvalService.getPendingForApprover());
    setMyRequests(approvalService.getMyRequests());
    const c = approvalService.getCounts();
    setCounts({
      pending: c.pending,
      approved: c.approved,
      rejected: c.rejected,
    });
  };

  // Demo: Create a sample request
  const createSampleRequest = () => {
    approvalService.createRequest({
      requestType: 'compensation_adjustment',
      tier: 2,
      changeData: {
        employeeId: 'user-1',
        employeeName: 'Sarah Chen',
        adjustmentAmount: 2500,
        reason: 'Q4 performance bonus',
      },
      reason: 'Exceptional performance in Q4 - exceeded quota by 150%',
    });
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Approvals</h1>
            <p className="text-muted-foreground text-sm">
              Manage approval requests and track status
            </p>
          </div>
        </div>
        <Button onClick={createSampleRequest}>
          <Plus className="mr-2 h-4 w-4" />
          New Request (Demo)
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{counts.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{counts.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            Pending Approval
            {counts.pending > 0 && (
              <Badge variant="secondary">{counts.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="my-requests">My Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingApprovals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle className="mx-auto h-12 w-12 mb-4 text-green-500" />
                <p className="font-medium">No pending approvals!</p>
                <p className="text-sm">You're all caught up.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingApprovals.map((req) => (
                <ApprovalCard
                  key={req.id}
                  request={req}
                  canApprove
                  onUpdate={loadData}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-requests" className="mt-4">
          {myRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <ClipboardCheck className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="font-medium">No requests yet</p>
                <p className="text-sm">Your submitted requests will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {myRequests.map((req) => (
                <ApprovalCard key={req.id} request={req} onUpdate={loadData} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## Verification

After completing Phase 3:

```bash
npm run build
npm run dev
```

**Test:**
1. Navigate to `/performance/approvals` → Page loads ✓
2. Click "New Request (Demo)" → Request created ✓
3. See request in "Pending Approval" tab ✓
4. Click "Approve" → Status changes to approved ✓
5. Create another, click "Reject" → Dialog opens ✓
6. Enter reason, submit → Status changes to rejected ✓
7. Check `/admin/audit` → Approval actions logged ✓

**If all tests pass, proceed to Phase 4.**
