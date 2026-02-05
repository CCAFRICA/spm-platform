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
