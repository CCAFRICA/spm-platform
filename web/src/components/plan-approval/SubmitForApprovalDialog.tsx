'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { toast } from 'sonner';
import { Send, CheckCircle, Users, Calculator, Shield } from 'lucide-react';
import { submitForApproval } from '@/lib/plan-approval/plan-approval-service';
import { STAGE_CONFIG } from '@/types/plan-approval';

interface SubmitForApprovalDialogProps {
  ruleSetId: string;
  ruleSetName: string;
  ruleSetVersion: number;
  onSubmitted?: () => void;
  trigger?: React.ReactNode;
}

export function SubmitForApprovalDialog({
  ruleSetId,
  ruleSetName,
  ruleSetVersion,
  onSubmitted,
  trigger,
}: SubmitForApprovalDialogProps) {
  const { locale } = useLocale();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const isSpanish = locale === 'es-MX';

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      submitForApproval(
        ruleSetId,
        ruleSetName,
        ruleSetVersion,
        currentTenant?.id || 'retailco',
        user?.id || 'admin',
        user?.name || 'Admin',
        notes || undefined
      );
      toast.success(
        isSpanish
          ? 'Plan enviado para aprobaci\u00f3n'
          : 'Plan submitted for approval'
      );
      setOpen(false);
      setNotes('');
      onSubmitted?.();
    } catch (error) {
      console.error('Error submitting:', error);
      toast.error(
        isSpanish
          ? 'Error al enviar para aprobaci\u00f3n'
          : 'Error submitting for approval'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const workflowStages = ['manager_review', 'finance_review', 'executive_review'] as const;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Send className="h-4 w-4 mr-2" />
            {isSpanish ? 'Enviar para Aprobaci\u00f3n' : 'Submit for Approval'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSpanish ? 'Enviar Plan para Aprobaci\u00f3n' : 'Submit Plan for Approval'}
          </DialogTitle>
          <DialogDescription>
            {isSpanish
              ? 'El plan pasar\u00e1 por el flujo de aprobaci\u00f3n est\u00e1ndar.'
              : 'The plan will go through the standard approval workflow.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Plan info */}
          <div className="p-3 bg-muted rounded-md">
            <div className="font-medium">{ruleSetName}</div>
            <div className="text-sm text-muted-foreground">
              {isSpanish ? 'Versi\u00f3n' : 'Version'} {ruleSetVersion}
            </div>
          </div>

          {/* Workflow preview */}
          <div className="space-y-2">
            <Label className="text-sm">
              {isSpanish ? 'Flujo de Aprobaci\u00f3n' : 'Approval Workflow'}
            </Label>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              {workflowStages.map((stage, index) => {
                const config = STAGE_CONFIG[stage];
                const Icon = stage === 'manager_review'
                  ? Users
                  : stage === 'finance_review'
                    ? Calculator
                    : Shield;

                return (
                  <div key={stage} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-xs mt-1 text-center max-w-16">
                        {isSpanish ? config.nameEs : config.name}
                      </span>
                    </div>
                    {index < workflowStages.length - 1 && (
                      <div className="w-8 h-0.5 bg-gray-200 dark:bg-gray-700 mx-1" />
                    )}
                  </div>
                );
              })}
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-xs mt-1">
                  {isSpanish ? 'Aprobado' : 'Approved'}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>{isSpanish ? 'Notas (opcional)' : 'Notes (optional)'}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isSpanish
                  ? 'Agregue contexto o notas para los revisores...'
                  : 'Add context or notes for reviewers...'
              }
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {isSpanish ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            <Send className="h-4 w-4 mr-2" />
            {isSubmitting
              ? isSpanish
                ? 'Enviando...'
                : 'Submitting...'
              : isSpanish
                ? 'Enviar'
                : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
