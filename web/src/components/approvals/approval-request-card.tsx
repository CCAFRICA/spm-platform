'use client';

/**
 * Approval Request Card Component
 *
 * Self-contained approval card with all context needed for decision.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  Check,
  X,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  Users,
  Banknote,
  Calendar,
  Bot,
} from 'lucide-react';
import { ImpactRatingBadge } from './impact-rating-badge';
import type { ApprovalRequest, ApprovalDomain } from '@/lib/approval-routing/types';
import { useLocale } from '@/contexts/locale-context';
import { cn } from '@/lib/utils';

interface ApprovalRequestCardProps {
  request: ApprovalRequest;
  onApprove?: (requestId: string, notes?: string) => void;
  onReject?: (requestId: string, notes?: string) => void;
  onEscalate?: (requestId: string, reason?: string) => void;
  isProcessing?: boolean;
}

const DOMAIN_ICONS: Record<ApprovalDomain, React.ElementType> = {
  import_batch: FileText,
  rollback: Clock,
  compensation_plan: Banknote,
  period_operation: Calendar,
  hierarchy_change: Users,
  manual_adjustment: FileText,
  personnel_change: Users,
  configuration_change: FileText,
};

export function ApprovalRequestCard({
  request,
  onApprove,
  onReject,
  onEscalate,
  isProcessing = false,
}: ApprovalRequestCardProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [isExpanded, setIsExpanded] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [notes, setNotes] = useState('');

  const DomainIcon = DOMAIN_ICONS[request.domain] || FileText;

  const getStatusBadge = () => {
    switch (request.status) {
      case 'pending':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-700">
            <Clock className="h-3 w-3 mr-1" />
            {isSpanish ? 'Pendiente' : 'Pending'}
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="border-green-500 text-green-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            {isSpanish ? 'Aprobado' : 'Approved'}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="border-red-500 text-red-700">
            <XCircle className="h-3 w-3 mr-1" />
            {isSpanish ? 'Rechazado' : 'Rejected'}
          </Badge>
        );
      case 'escalated':
        return (
          <Badge variant="outline" className="border-orange-500 text-orange-700">
            <ArrowUp className="h-3 w-3 mr-1" />
            {isSpanish ? 'Escalado' : 'Escalated'}
          </Badge>
        );
      default:
        return null;
    }
  };

  const getRecommendationColor = () => {
    switch (request.recommendation.action) {
      case 'approve':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'review':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'escalate':
        return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'reject':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-muted';
    }
  };

  const handleApprove = () => {
    onApprove?.(request.id, notes);
    setShowApproveDialog(false);
    setNotes('');
  };

  const handleReject = () => {
    onReject?.(request.id, notes);
    setShowRejectDialog(false);
    setNotes('');
  };

  const isOverdue = request.dueBy && new Date(request.dueBy) < new Date();

  return (
    <>
      <Card className={cn('transition-shadow hover:shadow-md', isOverdue && 'border-red-300')}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <DomainIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold leading-tight">
                  {isSpanish ? request.summary.titleEs : request.summary.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? request.summary.descriptionEs : request.summary.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ImpactRatingBadge rating={request.impactRating} size="md" />
              {getStatusBadge()}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Quick Impact Summary */}
          <div className="flex flex-wrap gap-2">
            {request.impactDetails.slice(0, 3).map((detail) => (
              <Badge
                key={detail.dimension}
                variant="secondary"
                className={cn(
                  detail.severity === 'critical' && 'bg-red-100 text-red-800',
                  detail.severity === 'high' && 'bg-orange-100 text-orange-800',
                  detail.severity === 'medium' && 'bg-yellow-100 text-yellow-800',
                  detail.severity === 'low' && 'bg-gray-100 text-gray-800'
                )}
              >
                {detail.value}
              </Badge>
            ))}
          </div>

          {/* System Recommendation */}
          <div className={cn('p-3 rounded-lg border', getRecommendationColor())}>
            <div className="flex items-start gap-2">
              <Bot className="h-4 w-4 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {isSpanish ? 'Recomendación' : 'Recommendation'}:
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {request.recommendation.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    ({request.recommendation.confidence}% {isSpanish ? 'confianza' : 'confidence'})
                  </span>
                </div>
                <p className="text-sm mt-1">
                  {isSpanish
                    ? request.recommendation.reasoningEs
                    : request.recommendation.reasoning}
                </p>
              </div>
            </div>
          </div>

          {/* SLA Warning */}
          {isOverdue && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {isSpanish ? 'Vencido — Requiere acción inmediata' : 'Overdue — Immediate action required'}
              </span>
            </div>
          )}

          {/* Expandable Details */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full">
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    {isSpanish ? 'Ocultar detalles' : 'Hide details'}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    {isSpanish ? 'Ver detalles' : 'View details'}
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {/* Full Impact Details */}
              <div>
                <h4 className="text-sm font-medium mb-2">
                  {isSpanish ? 'Análisis de Impacto' : 'Impact Analysis'}
                </h4>
                <div className="space-y-2">
                  {request.impactDetails.map((detail) => (
                    <div
                      key={detail.dimension}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          {isSpanish ? detail.labelEs : detail.label}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {isSpanish ? detail.descriptionEs : detail.description}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          detail.severity === 'critical' && 'border-red-500 text-red-700',
                          detail.severity === 'high' && 'border-orange-500 text-orange-700',
                          detail.severity === 'medium' && 'border-yellow-500 text-yellow-700',
                          detail.severity === 'low' && 'border-gray-500 text-gray-700'
                        )}
                      >
                        {detail.value}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Historical Context */}
              {request.recommendation.historicalContext && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">
                      {isSpanish ? 'Contexto histórico: ' : 'Historical context: '}
                    </span>
                    {isSpanish
                      ? request.recommendation.historicalContextEs
                      : request.recommendation.historicalContext}
                  </p>
                </div>
              )}

              {/* Approval Chain */}
              <div>
                <h4 className="text-sm font-medium mb-2">
                  {isSpanish ? 'Cadena de Aprobación' : 'Approval Chain'}
                </h4>
                <div className="flex items-center gap-2">
                  {request.chain.steps.map((step, index) => (
                    <div key={step.stepNumber} className="flex items-center">
                      <div
                        className={cn(
                          'flex items-center justify-center h-8 w-8 rounded-full border-2',
                          step.status === 'approved' && 'border-green-500 bg-green-900/30',
                          step.status === 'rejected' && 'border-red-500 bg-red-900/30',
                          step.status === 'pending' &&
                            index === request.chain.currentStep &&
                            'border-blue-500 bg-blue-900/30',
                          step.status === 'pending' &&
                            index !== request.chain.currentStep &&
                            'border-zinc-600 bg-zinc-800/50'
                        )}
                      >
                        {step.status === 'approved' && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                        {step.status === 'rejected' && (
                          <X className="h-4 w-4 text-red-600" />
                        )}
                        {step.status === 'pending' && (
                          <span className="text-xs font-medium">{step.stepNumber}</span>
                        )}
                      </div>
                      {index < request.chain.steps.length - 1 && (
                        <div
                          className={cn(
                            'h-0.5 w-8',
                            step.status === 'approved' ? 'bg-green-500' : 'bg-gray-300'
                          )}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {isSpanish ? 'Paso actual: ' : 'Current step: '}
                  {request.chain.steps[request.chain.currentStep]?.approverRole ||
                    request.chain.steps[request.chain.currentStep]?.approverId ||
                    'N/A'}
                </div>
              </div>

              {/* Request Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {isSpanish ? 'Solicitado por' : 'Requested by'}:
                  </span>
                  <p className="font-medium">{request.requestedBy}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {isSpanish ? 'Fecha' : 'Date'}:
                  </span>
                  <p className="font-medium">
                    {new Date(request.requestedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Action Buttons */}
          {request.status === 'pending' && (
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEscalate?.(request.id)}
                disabled={isProcessing}
              >
                <ArrowUp className="h-4 w-4 mr-1" />
                {isSpanish ? 'Escalar' : 'Escalate'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRejectDialog(true)}
                disabled={isProcessing}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-4 w-4 mr-1" />
                {isSpanish ? 'Rechazar' : 'Reject'}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowApproveDialog(true)}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-1" />
                {isSpanish ? 'Aprobar' : 'Approve'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isSpanish ? 'Confirmar Aprobación' : 'Confirm Approval'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSpanish
                ? '¿Está seguro de aprobar esta solicitud?'
                : 'Are you sure you want to approve this request?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder={isSpanish ? 'Notas opcionales...' : 'Optional notes...'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{isSpanish ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSpanish ? 'Aprobar' : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isSpanish ? 'Confirmar Rechazo' : 'Confirm Rejection'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSpanish
                ? 'Por favor proporcione una razón para el rechazo.'
                : 'Please provide a reason for rejection.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder={isSpanish ? 'Razón del rechazo...' : 'Reason for rejection...'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{isSpanish ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSpanish ? 'Rechazar' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
