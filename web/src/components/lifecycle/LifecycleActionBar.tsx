'use client';

/**
 * LifecycleActionBar — Shows valid actions for the current lifecycle state
 *
 * Each state has specific buttons. Only valid transitions are shown.
 * Enforces separation of duties for approval.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Play,
  Eye,
  FileCheck,
  Send,
  CheckCircle,
  XCircle,
  Globe,
  Lock,
  DollarSign,
  BookOpen,
  Download,
  RefreshCw,
  Clock,
} from 'lucide-react';
import {
  type CalculationState,
  type CalculationCycle,
  getStateLabel,
  getStateColor,
} from '@/lib/calculation/calculation-lifecycle-service';

interface LifecycleActionBarProps {
  cycle: CalculationCycle;
  currentUserId: string;
  onTransition: (toState: CalculationState, details?: string) => void;
  onExport?: () => void;
  isSubmitter?: boolean;
}

interface ActionButton {
  state: CalculationState;
  label: string;
  icon: React.ReactNode;
  variant: 'default' | 'outline' | 'secondary' | 'destructive';
  requiresConfirmation?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  requiresReason?: boolean;
}

function getActionsForState(
  state: CalculationState,
  isSubmitter: boolean
): ActionButton[] {
  switch (state) {
    case 'DRAFT':
      return [
        { state: 'PREVIEW', label: 'Run Preview', icon: <Eye className="h-4 w-4 mr-1.5" />, variant: 'default' },
      ];
    case 'PREVIEW':
      return [
        { state: 'PREVIEW', label: 'Re-run Preview', icon: <RefreshCw className="h-4 w-4 mr-1.5" />, variant: 'outline' },
        { state: 'OFFICIAL', label: 'Run Official', icon: <FileCheck className="h-4 w-4 mr-1.5" />, variant: 'default', requiresConfirmation: true, confirmTitle: 'Run Official Calculation?', confirmDescription: 'This will lock the calculation results as the official record for this period.' },
      ];
    case 'OFFICIAL':
      return [
        { state: 'PENDING_APPROVAL', label: 'Submit for Approval', icon: <Send className="h-4 w-4 mr-1.5" />, variant: 'default' },
        { state: 'PREVIEW', label: 'Re-Run (new batch)', icon: <RefreshCw className="h-4 w-4 mr-1.5" />, variant: 'outline' },
      ];
    case 'PENDING_APPROVAL':
      if (isSubmitter) {
        return []; // Submitter sees no buttons during approval
      }
      return [
        { state: 'APPROVED', label: 'Approve', icon: <CheckCircle className="h-4 w-4 mr-1.5" />, variant: 'default', requiresConfirmation: true, confirmTitle: 'Approve Results?', confirmDescription: 'This approves the official calculation results.' },
        { state: 'REJECTED', label: 'Reject', icon: <XCircle className="h-4 w-4 mr-1.5" />, variant: 'destructive', requiresReason: true, confirmTitle: 'Reject Results?', confirmDescription: 'Please provide a reason for rejection.' },
      ];
    case 'REJECTED':
      return [
        { state: 'OFFICIAL', label: 'Return to Official', icon: <RefreshCw className="h-4 w-4 mr-1.5" />, variant: 'outline' },
      ];
    case 'APPROVED':
      return [
        { state: 'POSTED', label: 'Post Results', icon: <Globe className="h-4 w-4 mr-1.5" />, variant: 'default', requiresConfirmation: true, confirmTitle: 'Post Results?', confirmDescription: 'This will make results visible to all users in Perform.' },
      ];
    case 'POSTED':
      return [
        { state: 'CLOSED', label: 'Close Period', icon: <Lock className="h-4 w-4 mr-1.5" />, variant: 'default', requiresConfirmation: true, confirmTitle: 'Close Period?', confirmDescription: 'This prevents further changes to this period\'s data.' },
      ];
    case 'CLOSED':
      return [
        { state: 'PAID', label: 'Mark as Paid', icon: <DollarSign className="h-4 w-4 mr-1.5" />, variant: 'default', requiresConfirmation: true, confirmTitle: 'Mark as Paid?', confirmDescription: 'Record that payment has been processed.' },
      ];
    case 'PAID':
      return [
        { state: 'PUBLISHED', label: 'Publish', icon: <BookOpen className="h-4 w-4 mr-1.5" />, variant: 'default', requiresConfirmation: true, confirmTitle: 'Publish?', confirmDescription: 'This seals the full audit trail. Terminal state.' },
      ];
    case 'PUBLISHED':
      return [];
    default:
      return [];
  }
}

export function LifecycleActionBar({
  cycle,
  currentUserId,
  onTransition,
  onExport,
  isSubmitter = false,
}: LifecycleActionBarProps) {
  const [confirmDialog, setConfirmDialog] = useState<ActionButton | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const actions = getActionsForState(cycle.state, isSubmitter);
  const showExport = ['APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED'].includes(cycle.state);

  const handleAction = (action: ActionButton) => {
    if (action.requiresConfirmation || action.requiresReason) {
      setConfirmDialog(action);
      return;
    }
    onTransition(action.state);
  };

  const handleConfirm = () => {
    if (!confirmDialog) return;
    const details = confirmDialog.requiresReason ? rejectionReason : undefined;
    onTransition(confirmDialog.state, details);
    setConfirmDialog(null);
    setRejectionReason('');
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Current state badge */}
        <Badge className={getStateColor(cycle.state)}>
          <Clock className="h-3 w-3 mr-1" />
          {getStateLabel(cycle.state)}
        </Badge>

        {/* Awaiting message for submitter during approval */}
        {cycle.state === 'PENDING_APPROVAL' && isSubmitter && (
          <span className="text-sm text-muted-foreground">
            Awaiting approval{cycle.approvedBy ? ` by ${cycle.approvedBy}` : ''}
          </span>
        )}

        {/* Published complete message */}
        {cycle.state === 'PUBLISHED' && (
          <span className="text-sm text-muted-foreground">
            Period complete.
          </span>
        )}

        {/* Action buttons */}
        {actions.map(action => (
          <Button
            key={action.state + action.label}
            variant={action.variant}
            size="sm"
            onClick={() => handleAction(action)}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}

        {/* Export button */}
        {showExport && onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDialog?.confirmDescription}</DialogDescription>
          </DialogHeader>

          {confirmDialog?.requiresReason && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Provide a reason for rejection..."
                className="w-full border rounded-md p-2 text-sm bg-background min-h-[80px]"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              variant={confirmDialog?.variant === 'destructive' ? 'destructive' : 'default'}
              disabled={confirmDialog?.requiresReason && !rejectionReason.trim()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
