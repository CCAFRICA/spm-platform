'use client';

/**
 * LifecycleActionBar — Config-driven action buttons for lifecycle transitions
 *
 * Reads valid transitions from the pipeline config.
 * Each state has specific buttons based on config transitions (not hardcoded).
 * Enforces separation of duties for approval.
 *
 * Accepts an optional `pipelineConfig` prop. Falls back to PRODUCTION_CONFIG.
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
import type { CalculationState, CalculationCycle } from '@/lib/calculation/calculation-lifecycle-service';
import { getStateLabel, getStateColor } from '@/lib/calculation/calculation-lifecycle-service';
import {
  type LifecyclePipelineConfig,
  type GateKey,
  PRODUCTION_CONFIG,
  getAllowedTransitionsForConfig,
  getGateDefinition,
} from '@/lib/lifecycle/lifecycle-pipeline';

interface LifecycleActionBarProps {
  cycle: CalculationCycle;
  currentUserId?: string;
  onTransition: (toState: CalculationState, details?: string) => void;
  onExport?: () => void;
  isSubmitter?: boolean;
  pipelineConfig?: LifecyclePipelineConfig;
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

/** Icon map for each gate key */
const GATE_ICONS: Partial<Record<GateKey, React.ReactNode>> = {
  PREVIEW: <Eye className="h-4 w-4 mr-1.5" />,
  RECONCILE: <FileCheck className="h-4 w-4 mr-1.5" />,
  OFFICIAL: <FileCheck className="h-4 w-4 mr-1.5" />,
  PENDING_APPROVAL: <Send className="h-4 w-4 mr-1.5" />,
  APPROVED: <CheckCircle className="h-4 w-4 mr-1.5" />,
  REJECTED: <XCircle className="h-4 w-4 mr-1.5" />,
  POSTED: <Globe className="h-4 w-4 mr-1.5" />,
  CLOSED: <Lock className="h-4 w-4 mr-1.5" />,
  PAID: <DollarSign className="h-4 w-4 mr-1.5" />,
  PUBLISHED: <BookOpen className="h-4 w-4 mr-1.5" />,
};

/** Build actions from pipeline config transitions */
function getActionsFromConfig(
  config: LifecyclePipelineConfig,
  currentState: CalculationState,
  isSubmitter: boolean
): ActionButton[] {
  const transitions = getAllowedTransitionsForConfig(config, currentState as GateKey);
  const actions: ActionButton[] = [];

  for (const targetState of transitions) {
    // Skip SUPERSEDED — handled separately
    if (targetState === 'SUPERSEDED') continue;

    // Separation of duties: submitter sees no approval buttons
    if (currentState === 'PENDING_APPROVAL' && isSubmitter) continue;

    const gate = getGateDefinition(targetState);
    const isDestructive = targetState === 'REJECTED';
    const requiresConfirmation =
      gate.immutable ||
      targetState === 'POSTED' ||
      targetState === 'CLOSED' ||
      targetState === 'PAID' ||
      targetState === 'PUBLISHED';

    actions.push({
      state: targetState as CalculationState,
      label: gate.actionLabel || getStateLabel(targetState),
      icon: GATE_ICONS[targetState] || <Eye className="h-4 w-4 mr-1.5" />,
      variant: isDestructive ? 'destructive' : (targetState === 'DRAFT' ? 'outline' : 'default'),
      requiresConfirmation,
      confirmTitle: `${gate.label}?`,
      confirmDescription: gate.description,
      requiresReason: targetState === 'REJECTED',
    });
  }

  // Special: add re-run button at PREVIEW state
  if (currentState === 'PREVIEW' && transitions.length > 0) {
    actions.unshift({
      state: 'PREVIEW' as CalculationState,
      label: 'Re-run Preview',
      icon: <RefreshCw className="h-4 w-4 mr-1.5" />,
      variant: 'outline',
    });
  }

  return actions;
}

export function LifecycleActionBar({
  cycle,
  onTransition,
  onExport,
  isSubmitter = false,
  pipelineConfig = PRODUCTION_CONFIG,
}: LifecycleActionBarProps) {
  const [confirmDialog, setConfirmDialog] = useState<ActionButton | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const actions = getActionsFromConfig(pipelineConfig, cycle.state, isSubmitter);
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
