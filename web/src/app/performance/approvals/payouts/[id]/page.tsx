'use client';

import { useState, useEffect, use } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Wallet,
  Calendar,
  Users,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Download,
  Printer,
} from 'lucide-react';
import { PayoutEmployeeTable } from '@/components/approvals/PayoutEmployeeTable';
import { payoutService, PayoutBatch, PayoutStatus } from '@/lib/payout-service';
import { toast } from 'sonner';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PayoutBatchDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [batch, setBatch] = useState<PayoutBatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    payoutService.initialize();
    const batchData = payoutService.getBatchById(id);
    setBatch(batchData);
    setIsLoading(false);
  }, [id]);

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
      <Badge variant={c.variant} className="flex items-center gap-1 text-sm px-3 py-1">
        {c.icon}
        {c.label}
      </Badge>
    );
  };

  const handleApprove = async () => {
    setIsProcessing(true);

    await new Promise(r => setTimeout(r, 1000));

    const updated = payoutService.approveBatch(id, 'Mike Chen', approvalComment);

    if (updated) {
      toast.success('Payout Approved', {
        description: `${updated.periodLabel} payout has been approved and is now processing`,
      });
      setShowApproveDialog(false);
      setBatch(updated);

      // Reload after processing completes
      setTimeout(() => {
        setBatch(payoutService.getBatchById(id));
      }, 2500);
    }

    setIsProcessing(false);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setRejectionError('Please provide a reason for rejection');
      return;
    }
    if (rejectionReason.trim().length < 10) {
      setRejectionError('Reason must be at least 10 characters');
      return;
    }

    setIsProcessing(true);

    await new Promise(r => setTimeout(r, 800));

    const updated = payoutService.rejectBatch(id, 'Mike Chen', rejectionReason);

    if (updated) {
      toast.error('Payout Rejected', {
        description: `${updated.periodLabel} payout has been rejected`,
      });
      setShowRejectDialog(false);
      setBatch(updated);
    }

    setIsProcessing(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading batch details...</p>
        </div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Batch Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The payout batch you are looking for does not exist
            </p>
            <Button asChild>
              <Link href="/performance/approvals/payouts">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Payouts
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasDisputes = batch.employees.some(e => e.disputes > 0);
  const totalDisputes = batch.employees.reduce((sum, e) => sum + e.disputes, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/performance/approvals/payouts">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6 text-primary" />
                {batch.periodLabel} Payout
              </h1>
              {getStatusBadge(batch.status)}
            </div>
            <p className="text-muted-foreground">
              {batch.id} • Created by {batch.createdBy} on{' '}
              {new Date(batch.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(batch.totalAmount)}
                </div>
                <div className="text-sm text-muted-foreground">Total Payout</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{batch.employeeCount}</div>
                <div className="text-sm text-muted-foreground">Employees</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {formatCurrency(batch.totalAmount / batch.employeeCount)}
                </div>
                <div className="text-sm text-muted-foreground">Avg. Payout</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <div className="text-lg font-bold">
                  {new Date(batch.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' - '}
                  {new Date(batch.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="text-sm text-muted-foreground">Period</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings & Notes */}
      {hasDisputes && batch.status === 'pending_approval' && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-800 dark:text-amber-200">
                  {totalDisputes} Pending Dispute{totalDisputes > 1 ? 's' : ''}
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Some employees have pending disputes that may affect their payout amounts.
                  Consider reviewing disputes before approving this batch.
                </p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link href="/transactions/disputes">
                    Review Disputes
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Info */}
      {batch.status === 'approved' && batch.approvedAt && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <span className="font-medium text-green-800 dark:text-green-200">
                  Approved by {batch.approvedBy}
                </span>
                <span className="text-green-700 dark:text-green-300 text-sm ml-2">
                  on {new Date(batch.approvedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {batch.status === 'completed' && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <span className="font-medium text-green-800 dark:text-green-200">
                  Payout Completed
                </span>
                <span className="text-green-700 dark:text-green-300 text-sm ml-2">
                  All {batch.employeeCount} employees have been paid
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {batch.status === 'rejected' && batch.rejectionReason && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800 dark:text-red-200">
                  Rejected by {batch.rejectedBy}
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {batch.rejectionReason}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Breakdown</CardTitle>
          <CardDescription>
            Individual payout details for all {batch.employeeCount} employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutEmployeeTable employees={batch.employees} />
        </CardContent>
      </Card>

      {/* Notes */}
      {batch.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{batch.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {batch.status === 'pending_approval' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Ready to process this payout?</h4>
                <p className="text-sm text-muted-foreground">
                  Approving will initiate payment processing for all {batch.employeeCount} employees
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={() => setShowApproveDialog(true)}
                  disabled={isProcessing}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Payout
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Approve Payout Batch
            </DialogTitle>
            <DialogDescription>
              You are about to approve the {batch.periodLabel} payout for {batch.employeeCount} employees
              totaling {formatCurrency(batch.totalAmount)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Amount:</span>
                  <div className="font-bold text-lg text-green-600">
                    {formatCurrency(batch.totalAmount)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Employees:</span>
                  <div className="font-bold text-lg">{batch.employeeCount}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="approval-comment">Comment (optional)</Label>
              <Textarea
                id="approval-comment"
                placeholder="Add an optional comment..."
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApproveDialog(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Payout
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reject Payout Batch
            </DialogTitle>
            <DialogDescription>
              Rejecting will prevent all {batch.employeeCount} employees from receiving their incentive payouts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Batch
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
