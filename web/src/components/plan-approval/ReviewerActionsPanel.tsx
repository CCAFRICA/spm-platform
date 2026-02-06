'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { CheckCircle, XCircle, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { PlanApprovalRequest, ChangeRequest, ReviewerRole } from '@/types/plan-approval';
import { STAGE_CONFIG, REVIEWER_ROLES } from '@/types/plan-approval';
import { submitReview } from '@/lib/plan-approval/plan-approval-service';

interface ReviewerActionsPanelProps {
  request: PlanApprovalRequest;
  reviewerRole: ReviewerRole;
  onReviewSubmitted: () => void;
}

export function ReviewerActionsPanel({
  request,
  reviewerRole,
  onReviewSubmitted,
}: ReviewerActionsPanelProps) {
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX';

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [comments, setComments] = useState('');
  const [changeRequests, setChangeRequests] = useState<Omit<ChangeRequest, 'id' | 'resolved'>[]>([]);
  const [newChangeSection, setNewChangeSection] = useState('');
  const [newChangeDescription, setNewChangeDescription] = useState('');
  const [newChangePriority, setNewChangePriority] = useState<'required' | 'recommended'>('required');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stageConfig = STAGE_CONFIG[request.stage];
  const roleConfig = REVIEWER_ROLES[reviewerRole];

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      submitReview(
        request.id,
        user?.id || 'admin',
        user?.name || 'Admin',
        reviewerRole,
        'approve',
        comments || undefined
      );
      toast.success(isSpanish ? 'Plan aprobado' : 'Plan approved');
      onReviewSubmitted();
    } catch (error) {
      console.error('Error approving:', error);
      toast.error(isSpanish ? 'Error al aprobar' : 'Error approving');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!comments.trim()) {
      toast.error(isSpanish ? 'Por favor proporcione un motivo' : 'Please provide a reason');
      return;
    }

    setIsSubmitting(true);
    try {
      submitReview(
        request.id,
        user?.id || 'admin',
        user?.name || 'Admin',
        reviewerRole,
        'reject',
        comments
      );
      toast.success(isSpanish ? 'Plan rechazado' : 'Plan rejected');
      setShowRejectDialog(false);
      onReviewSubmitted();
    } catch (error) {
      console.error('Error rejecting:', error);
      toast.error(isSpanish ? 'Error al rechazar' : 'Error rejecting');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (changeRequests.length === 0) {
      toast.error(isSpanish ? 'Agregue al menos un cambio requerido' : 'Add at least one change request');
      return;
    }

    setIsSubmitting(true);
    try {
      const fullChangeRequests: ChangeRequest[] = changeRequests.map((cr, index) => ({
        id: `cr-${Date.now()}-${index}`,
        section: cr.section,
        description: cr.description,
        descriptionEs: cr.descriptionEs,
        priority: cr.priority,
        resolved: false,
      }));

      submitReview(
        request.id,
        user?.id || 'admin',
        user?.name || 'Admin',
        reviewerRole,
        'request_changes',
        comments || undefined,
        fullChangeRequests
      );
      toast.success(isSpanish ? 'Cambios solicitados' : 'Changes requested');
      setShowChangesDialog(false);
      onReviewSubmitted();
    } catch (error) {
      console.error('Error requesting changes:', error);
      toast.error(isSpanish ? 'Error al solicitar cambios' : 'Error requesting changes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addChangeRequest = () => {
    if (!newChangeSection.trim() || !newChangeDescription.trim()) {
      toast.error(isSpanish ? 'Complete todos los campos' : 'Fill in all fields');
      return;
    }

    setChangeRequests([
      ...changeRequests,
      {
        section: newChangeSection,
        description: newChangeDescription,
        descriptionEs: newChangeDescription, // In real app, would have translation
        priority: newChangePriority,
      },
    ]);

    setNewChangeSection('');
    setNewChangeDescription('');
  };

  const removeChangeRequest = (index: number) => {
    setChangeRequests(changeRequests.filter((_, i) => i !== index));
  };

  return (
    <>
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {isSpanish ? 'Acciones de Revisión' : 'Review Actions'}
              </CardTitle>
              <CardDescription>
                {isSpanish ? stageConfig.descriptionEs : stageConfig.description}
              </CardDescription>
            </div>
            <Badge variant="outline">
              {isSpanish ? roleConfig.nameEs : roleConfig.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{isSpanish ? 'Comentarios (opcional)' : 'Comments (optional)'}</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={isSpanish ? 'Agregue comentarios sobre esta revisión...' : 'Add comments about this review...'}
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {isSpanish ? 'Aprobar' : 'Approve'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowChangesDialog(true)}
              disabled={isSubmitting}
              className="flex-1"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {isSpanish ? 'Solicitar Cambios' : 'Request Changes'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowRejectDialog(true)}
              disabled={isSubmitting}
              className="flex-1"
            >
              <XCircle className="h-4 w-4 mr-2" />
              {isSpanish ? 'Rechazar' : 'Reject'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSpanish ? 'Rechazar Plan' : 'Reject Plan'}</DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Por favor proporcione un motivo para el rechazo.'
                : 'Please provide a reason for rejection.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>{isSpanish ? 'Motivo de Rechazo' : 'Rejection Reason'}</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={isSpanish ? 'Explique por qué este plan no puede ser aprobado...' : 'Explain why this plan cannot be approved...'}
              className="mt-1"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isSubmitting || !comments.trim()}
            >
              {isSpanish ? 'Confirmar Rechazo' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes Dialog */}
      <Dialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isSpanish ? 'Solicitar Cambios' : 'Request Changes'}</DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Especifique los cambios necesarios antes de la aprobación.'
                : 'Specify changes needed before approval.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* Existing change requests */}
            {changeRequests.length > 0 && (
              <div className="space-y-2">
                <Label>{isSpanish ? 'Cambios Requeridos' : 'Required Changes'}</Label>
                {changeRequests.map((cr, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-2 bg-muted rounded-md"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{cr.section}</span>
                        <Badge
                          variant={cr.priority === 'required' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {cr.priority === 'required'
                            ? isSpanish
                              ? 'Requerido'
                              : 'Required'
                            : isSpanish
                              ? 'Recomendado'
                              : 'Recommended'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{cr.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeChangeRequest(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new change request */}
            <div className="space-y-3 p-3 border rounded-md">
              <h4 className="font-medium text-sm">
                {isSpanish ? 'Agregar Cambio' : 'Add Change'}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{isSpanish ? 'Sección' : 'Section'}</Label>
                  <Input
                    value={newChangeSection}
                    onChange={(e) => setNewChangeSection(e.target.value)}
                    placeholder={isSpanish ? 'ej. Estructura de Niveles' : 'e.g., Tier Structure'}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">{isSpanish ? 'Prioridad' : 'Priority'}</Label>
                  <Select value={newChangePriority} onValueChange={(v) => setNewChangePriority(v as 'required' | 'recommended')}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="required">{isSpanish ? 'Requerido' : 'Required'}</SelectItem>
                      <SelectItem value="recommended">{isSpanish ? 'Recomendado' : 'Recommended'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">{isSpanish ? 'Descripción' : 'Description'}</Label>
                <Textarea
                  value={newChangeDescription}
                  onChange={(e) => setNewChangeDescription(e.target.value)}
                  placeholder={isSpanish ? 'Describa el cambio necesario...' : 'Describe the required change...'}
                  className="mt-1"
                  rows={2}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addChangeRequest}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {isSpanish ? 'Agregar' : 'Add'}
              </Button>
            </div>

            {/* Optional comments */}
            <div>
              <Label>{isSpanish ? 'Comentarios Adicionales' : 'Additional Comments'}</Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={isSpanish ? 'Comentarios opcionales...' : 'Optional comments...'}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangesDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              onClick={handleRequestChanges}
              disabled={isSubmitting || changeRequests.length === 0}
            >
              {isSpanish ? 'Enviar Solicitud' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
