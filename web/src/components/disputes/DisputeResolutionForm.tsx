'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle, XCircle, MinusCircle, Loader2, AlertTriangle } from 'lucide-react';
import type { Dispute, DisputeOutcome } from '@/types/dispute';
import type { AnalysisResult } from './SystemAnalyzer';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/tenant-context';

interface DisputeResolutionFormProps {
  dispute: Dispute;
  analysis: AnalysisResult | null;
  onResolve: (outcome: DisputeOutcome, amount: number, explanation: string) => Promise<void>;
  onCancel: () => void;
  formatCurrency?: (value: number) => string;
}

export function DisputeResolutionForm({
  dispute,
  analysis,
  onResolve,
  onCancel,
  formatCurrency: formatCurrencyProp,
}: DisputeResolutionFormProps) {
  const [outcome, setOutcome] = useState<DisputeOutcome>(
    analysis?.recommendation === 'approve'
      ? 'approved'
      : analysis?.recommendation === 'partial'
      ? 'partial'
      : analysis?.recommendation === 'deny'
      ? 'denied'
      : 'approved'
  );
  const [amount, setAmount] = useState(
    analysis?.suggestedAmount?.toString() || dispute.expectedAmount?.toString() || '0'
  );
  const [explanation, setExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { format: formatCurrencyHook } = useCurrency();

  // Use provided formatter or tenant-aware default
  const formatCurrency = formatCurrencyProp || formatCurrencyHook;

  const handleSubmit = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);

    try {
      await onResolve(outcome, parseFloat(amount) || 0, explanation);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOutcomeDescription = () => {
    switch (outcome) {
      case 'approved':
        return `Full approval of ${formatCurrency(parseFloat(amount) || 0)} will be added to ${dispute.employeeName}'s next pay period.`;
      case 'partial':
        return `Partial approval of ${formatCurrency(parseFloat(amount) || 0)} will be added to ${dispute.employeeName}'s next pay period.`;
      case 'denied':
        return `The dispute will be closed with no adjustment to ${dispute.employeeName}'s compensation.`;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Resolution Decision</CardTitle>
          <CardDescription>
            Select an outcome and provide your decision rationale
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Outcome Selection */}
          <div className="space-y-3">
            <Label>Decision</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as DisputeOutcome)}
              className="grid grid-cols-3 gap-4"
            >
              <Label
                htmlFor="approve"
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                  outcome === 'approved'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-muted hover:border-green-300'
                )}
              >
                <RadioGroupItem value="approved" id="approve" className="sr-only" />
                <CheckCircle
                  className={cn(
                    'h-8 w-8',
                    outcome === 'approved' ? 'text-green-600' : 'text-muted-foreground'
                  )}
                />
                <span
                  className={cn(
                    'font-medium',
                    outcome === 'approved' ? 'text-green-700 dark:text-green-400' : ''
                  )}
                >
                  Approve
                </span>
                <span className="text-xs text-center text-muted-foreground">
                  Full claim amount
                </span>
              </Label>

              <Label
                htmlFor="partial"
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                  outcome === 'partial'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-muted hover:border-amber-300'
                )}
              >
                <RadioGroupItem value="partial" id="partial" className="sr-only" />
                <MinusCircle
                  className={cn(
                    'h-8 w-8',
                    outcome === 'partial' ? 'text-amber-600' : 'text-muted-foreground'
                  )}
                />
                <span
                  className={cn(
                    'font-medium',
                    outcome === 'partial' ? 'text-amber-700 dark:text-amber-400' : ''
                  )}
                >
                  Partial
                </span>
                <span className="text-xs text-center text-muted-foreground">
                  Adjusted amount
                </span>
              </Label>

              <Label
                htmlFor="deny"
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                  outcome === 'denied'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-muted hover:border-red-300'
                )}
              >
                <RadioGroupItem value="denied" id="deny" className="sr-only" />
                <XCircle
                  className={cn(
                    'h-8 w-8',
                    outcome === 'denied' ? 'text-red-600' : 'text-muted-foreground'
                  )}
                />
                <span
                  className={cn(
                    'font-medium',
                    outcome === 'denied' ? 'text-red-700 dark:text-red-400' : ''
                  )}
                >
                  Deny
                </span>
                <span className="text-xs text-center text-muted-foreground">
                  No adjustment
                </span>
              </Label>
            </RadioGroup>
          </div>

          {/* Amount Input (for approve/partial) */}
          {outcome !== 'denied' && (
            <div className="space-y-2">
              <Label htmlFor="amount">Adjustment Amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="max-w-[200px]"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {analysis?.suggestedAmount && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(analysis.suggestedAmount.toString())}
                  >
                    Use Suggested ({formatCurrency(analysis.suggestedAmount)})
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(dispute.expectedAmount.toString())}
                >
                  Use Claimed ({formatCurrency(dispute.expectedAmount)})
                </Button>
              </div>
            </div>
          )}

          {/* Explanation */}
          <div className="space-y-2">
            <Label htmlFor="explanation">Explanation / Notes</Label>
            <Textarea
              id="explanation"
              placeholder="Provide rationale for your decision..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              This will be visible to the employee and recorded in the audit log.
            </p>
          </div>

          {/* Summary */}
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <strong>Summary:</strong> {getOutcomeDescription()}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !explanation.trim()}
              className={cn(
                outcome === 'approved' && 'bg-green-600 hover:bg-green-700',
                outcome === 'partial' && 'bg-amber-600 hover:bg-amber-700',
                outcome === 'denied' && 'bg-red-600 hover:bg-red-700'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Submit Resolution
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Resolution</AlertDialogTitle>
            <AlertDialogDescription>
              {getOutcomeDescription()}
              <br /><br />
              This action will be recorded in the audit log and the employee will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                outcome === 'approved' && 'bg-green-600 hover:bg-green-700',
                outcome === 'partial' && 'bg-amber-600 hover:bg-amber-700',
                outcome === 'denied' && 'bg-red-600 hover:bg-red-700'
              )}
            >
              Confirm Resolution
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
