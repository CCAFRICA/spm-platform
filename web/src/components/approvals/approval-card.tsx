'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Check, X, Clock, User, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import { ApprovalRequest, ApprovalStatus } from '@/types/audit';
import { approvalService } from '@/lib/approval-service';
import { formatDistanceToNow } from 'date-fns';
import { LoadingButton } from '@/components/ui/loading-button';
import { modalVariants } from '@/lib/animations';

interface Props {
  request: ApprovalRequest;
  canApprove?: boolean;
  onUpdate?: () => void;
}

export function ApprovalCard({ request, canApprove = false, onUpdate }: Props) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAction, setSuccessAction] = useState<'approved' | 'rejected'>('approved');

  const handleApprove = async () => {
    setIsApproving(true);
    await new Promise(r => setTimeout(r, 800));

    approvalService.approve(request.id);
    setIsApproving(false);
    setSuccessAction('approved');
    setShowSuccess(true);

    toast.success('Request Approved', {
      description: `${request.requestType.replace(/_/g, ' ')} has been approved`
    });

    setTimeout(() => {
      setShowSuccess(false);
      onUpdate?.();
    }, 1500);
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

    setIsRejecting(true);
    await new Promise(r => setTimeout(r, 800));

    approvalService.reject(request.id, rejectionReason);
    setShowRejectDialog(false);
    setRejectionReason('');
    setRejectionError('');
    setIsRejecting(false);
    setSuccessAction('rejected');
    setShowSuccess(true);

    toast.error('Request Rejected', {
      description: 'The requester has been notified'
    });

    setTimeout(() => {
      setShowSuccess(false);
      onUpdate?.();
    }, 1500);
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
      <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden">
        <AnimatePresence mode="wait">
          {showSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                {successAction === 'approved' ? (
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
                ) : (
                  <X className="mx-auto h-12 w-12 text-red-500 mb-2" />
                )}
              </motion.div>
              <p className="font-semibold capitalize">{successAction}!</p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CardHeader className="pb-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className="text-base capitalize truncate">
                      {request.requestType.replace(/_/g, ' ')}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {request.reason}
                    </p>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
              </CardHeader>

              <CardContent className="space-y-3 p-4 pt-0">
                {/* Metadata */}
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{request.requesterName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getTierLabel(request.tier)}
                  </Badge>
                </div>

                {/* Change Data Preview */}
                {Object.keys(request.changeData).length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-muted/50 rounded p-2 text-xs font-mono"
                  >
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
                  </motion.div>
                )}

                {/* Rejection Reason */}
                {request.rejectionReason && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded p-2"
                  >
                    <p className="text-sm text-red-700 dark:text-red-300 flex items-start gap-1">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{request.rejectionReason}</span>
                    </p>
                  </motion.div>
                )}

                {/* Actions */}
                {canApprove && request.status === 'pending' && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex gap-2 pt-2"
                  >
                    <LoadingButton
                      size="sm"
                      className="flex-1"
                      onClick={handleApprove}
                      loading={isApproving}
                      loadingText="Approving..."
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Approve
                    </LoadingButton>
                    <LoadingButton
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => setShowRejectDialog(true)}
                      disabled={isApproving}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Reject
                    </LoadingButton>
                  </motion.div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Reject Request
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  Please provide a reason for rejection. This will be visible to the requester.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">
                    Reason <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Enter rejection reason..."
                    value={rejectionReason}
                    onChange={(e) => {
                      setRejectionReason(e.target.value);
                      if (rejectionError) setRejectionError('');
                    }}
                    rows={3}
                    className={rejectionError ? 'border-destructive' : ''}
                  />
                  <div className="flex justify-between items-center">
                    <AnimatePresence>
                      {rejectionError && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-sm text-destructive flex items-center gap-1"
                        >
                          <AlertCircle className="h-3 w-3" />
                          {rejectionError}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <p className="text-xs text-muted-foreground ml-auto">
                      {rejectionReason.length} characters
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6 gap-2 sm:gap-0">
                <LoadingButton
                  variant="outline"
                  onClick={() => {
                    setShowRejectDialog(false);
                    setRejectionReason('');
                    setRejectionError('');
                  }}
                  disabled={isRejecting}
                >
                  Cancel
                </LoadingButton>
                <LoadingButton
                  variant="destructive"
                  onClick={handleReject}
                  loading={isRejecting}
                  loadingText="Rejecting..."
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject Request
                </LoadingButton>
              </DialogFooter>
            </motion.div>
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
