'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Users,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { PayoutBatch, PayoutStatus } from '@/lib/payout-service';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PayoutBatchCardProps {
  batch: PayoutBatch;
  onApprove?: (batchId: string, comment?: string) => void;
  onReject?: (batchId: string, reason: string) => void;
  showActions?: boolean;
  isProcessing?: boolean;
}

export function PayoutBatchCard({
  batch,
  onApprove,
  onReject,
  showActions = true,
  isProcessing = false,
}: PayoutBatchCardProps) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const getStatusBadge = (status: PayoutStatus) => {
    const config: Record<PayoutStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }> = {
      draft: { variant: 'outline', label: 'Draft', icon: <FileText className="h-3 w-3" /> },
      pending_approval: { variant: 'secondary', label: 'Pending Approval', icon: <Clock className="h-3 w-3" /> },
      approved: { variant: 'default', label: 'Approved', icon: <CheckCircle className="h-3 w-3" /> },
      rejected: { variant: 'destructive', label: 'Rejected', icon: <XCircle className="h-3 w-3" /> },
      processing: { variant: 'secondary', label: 'Processing', icon: <Clock className="h-3 w-3 animate-spin" /> },
      completed: { variant: 'default', label: 'Completed', icon: <CheckCircle className="h-3 w-3" /> },
    };
    const c = config[status];
    return (
      <Badge variant={c.variant} className="flex items-center gap-1">
        {c.icon}
        {c.label}
      </Badge>
    );
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      setRejectionError('Please provide a reason for rejection');
      return;
    }
    if (rejectionReason.trim().length < 10) {
      setRejectionError('Reason must be at least 10 characters');
      return;
    }
    onReject?.(batch.id, rejectionReason);
    setShowRejectDialog(false);
    setRejectionReason('');
  };

  const hasDisputes = batch.employees.some(e => e.disputes > 0);
  const totalDisputes = batch.employees.reduce((sum, e) => sum + e.disputes, 0);

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{batch.periodLabel} Payout</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {batch.id} • Created {formatDistanceToNow(new Date(batch.createdAt), { addSuffix: true })}
              </p>
            </div>
            {getStatusBadge(batch.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <DollarSign className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <div className="text-lg font-bold text-green-600">{formatCurrency(batch.totalAmount)}</div>
              <div className="text-xs text-muted-foreground">Total Payout</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <Users className="h-5 w-5 mx-auto text-blue-600 mb-1" />
              <div className="text-lg font-bold">{batch.employeeCount}</div>
              <div className="text-xs text-muted-foreground">Employees</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <Calendar className="h-5 w-5 mx-auto text-purple-600 mb-1" />
              <div className="text-lg font-bold">{formatCurrency(batch.totalAmount / batch.employeeCount)}</div>
              <div className="text-xs text-muted-foreground">Avg. Payout</div>
            </div>
          </div>

          {/* Warnings */}
          {hasDisputes && batch.status === 'pending_approval' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  {totalDisputes} pending dispute{totalDisputes > 1 ? 's' : ''}
                </span>
                <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
                  Review disputes before approving this batch
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          {batch.notes && (
            <div className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
              {batch.notes}
            </div>
          )}

          {/* Rejection Reason */}
          {batch.rejectionReason && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <div className="text-sm">
                <span className="font-medium text-red-800 dark:text-red-200">
                  Rejected by {batch.rejectedBy}
                </span>
                <p className="text-red-700 dark:text-red-300 text-xs mt-0.5">
                  {batch.rejectionReason}
                </p>
              </div>
            </div>
          )}

          {/* Approval Info */}
          {batch.approvedAt && (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              Approved by {batch.approvedBy} on {new Date(batch.approvedAt).toLocaleDateString()}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" asChild className="flex-1">
              <Link href={`/performance/approvals/payouts/${batch.id}`}>
                View Details
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>

            {showActions && batch.status === 'pending_approval' && (
              <>
                <Button
                  size="sm"
                  onClick={() => onApprove?.(batch.id)}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reject Payout Batch
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to reject the {batch.periodLabel} payout?
              This will prevent {batch.employeeCount} employees from receiving their incentives.
            </p>

            <div className="space-y-2">
              <Label htmlFor="rejection-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rejection-reason"
                placeholder="Enter reason for rejection..."
                value={rejectionReason}
                onChange={(e) => {
                  setRejectionReason(e.target.value);
                  if (rejectionError) setRejectionError('');
                }}
                rows={3}
                className={cn(rejectionError && 'border-destructive')}
              />
              {rejectionError && (
                <p className="text-sm text-destructive">{rejectionError}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectionReason('');
                setRejectionError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              <XCircle className="h-4 w-4 mr-2" />
              Reject Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
