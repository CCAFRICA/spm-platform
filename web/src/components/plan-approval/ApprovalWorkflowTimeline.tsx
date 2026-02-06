'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/contexts/locale-context';
import {
  CheckCircle,
  Circle,
  Clock,
  XCircle,
  AlertCircle,
  FileEdit,
  UserCheck,
  Calculator,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanApprovalRequest, ApprovalStage } from '@/types/plan-approval';
import { STAGE_CONFIG } from '@/types/plan-approval';

interface ApprovalWorkflowTimelineProps {
  request: PlanApprovalRequest;
  compact?: boolean;
}

const STAGE_ICONS: Record<ApprovalStage, React.ElementType> = {
  draft: FileEdit,
  manager_review: UserCheck,
  finance_review: Calculator,
  executive_review: Shield,
  approved: CheckCircle,
  rejected: XCircle,
};

export function ApprovalWorkflowTimeline({
  request,
  compact = false,
}: ApprovalWorkflowTimelineProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const getStageStatus = (stage: ApprovalStage): 'completed' | 'current' | 'pending' | 'rejected' => {
    if (request.status === 'rejected' && request.stage === 'rejected') {
      // Find which stage rejected
      const rejectReview = request.reviews.find((r) => r.decision === 'reject');
      if (rejectReview?.stage === stage) return 'rejected';
    }

    const stageIndex = request.requiredStages.indexOf(stage);
    if (stageIndex < 0) return 'pending';

    if (stageIndex < request.currentStageIndex) return 'completed';
    if (stageIndex === request.currentStageIndex) {
      if (request.status === 'approved' && stage === request.requiredStages[request.requiredStages.length - 1]) {
        return 'completed';
      }
      return 'current';
    }
    return 'pending';
  };

  const getReviewForStage = (stage: ApprovalStage) => {
    return request.reviews.find((r) => r.stage === stage);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {request.requiredStages.map((stage, index) => {
          const status = getStageStatus(stage);
          const config = STAGE_CONFIG[stage];

          return (
            <div key={stage} className="flex items-center">
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center',
                  status === 'completed' && 'bg-green-100 text-green-600 dark:bg-green-900/30',
                  status === 'current' && 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
                  status === 'pending' && 'bg-gray-100 text-gray-400 dark:bg-gray-800',
                  status === 'rejected' && 'bg-red-100 text-red-600 dark:bg-red-900/30'
                )}
                title={isSpanish ? config.nameEs : config.name}
              >
                {status === 'completed' ? (
                  <CheckCircle className="h-4 w-4" />
                ) : status === 'rejected' ? (
                  <XCircle className="h-4 w-4" />
                ) : status === 'current' ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              {index < request.requiredStages.length - 1 && (
                <div
                  className={cn(
                    'w-4 h-0.5',
                    status === 'completed' ? 'bg-green-300' : 'bg-gray-200 dark:bg-gray-700'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {isSpanish ? 'Flujo de Aprobaci\u00f3n' : 'Approval Workflow'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {request.requiredStages.map((stage, index) => {
            const status = getStageStatus(stage);
            const config = STAGE_CONFIG[stage];
            const Icon = STAGE_ICONS[stage];
            const review = getReviewForStage(stage);

            return (
              <div key={stage} className="relative flex gap-4 pb-6 last:pb-0">
                {/* Connector line */}
                {index < request.requiredStages.length - 1 && (
                  <div
                    className={cn(
                      'absolute left-4 top-8 w-0.5 h-full -ml-px',
                      status === 'completed' ? 'bg-green-300' : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  />
                )}

                {/* Icon */}
                <div
                  className={cn(
                    'relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                    status === 'completed' && 'bg-green-100 text-green-600 dark:bg-green-900/30',
                    status === 'current' && 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 ring-2 ring-blue-500 ring-offset-2',
                    status === 'pending' && 'bg-gray-100 text-gray-400 dark:bg-gray-800',
                    status === 'rejected' && 'bg-red-100 text-red-600 dark:bg-red-900/30'
                  )}
                >
                  {status === 'completed' ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : status === 'rejected' ? (
                    <XCircle className="h-5 w-5" />
                  ) : status === 'current' ? (
                    <Clock className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      {isSpanish ? config.nameEs : config.name}
                    </h4>
                    {status === 'current' && (
                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                        {isSpanish ? 'En Curso' : 'In Progress'}
                      </Badge>
                    )}
                    {status === 'completed' && review && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(review.reviewedAt)}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mt-0.5">
                    {isSpanish ? config.descriptionEs : config.description}
                  </p>

                  {/* Review details */}
                  {review && (
                    <div className="mt-2 p-2 bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{review.reviewerName}</span>
                        {review.decision === 'approve' && (
                          <Badge variant="default" className="bg-green-500">
                            {isSpanish ? 'Aprobado' : 'Approved'}
                          </Badge>
                        )}
                        {review.decision === 'reject' && (
                          <Badge variant="destructive">
                            {isSpanish ? 'Rechazado' : 'Rejected'}
                          </Badge>
                        )}
                        {review.decision === 'request_changes' && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            {isSpanish ? 'Cambios Solicitados' : 'Changes Requested'}
                          </Badge>
                        )}
                      </div>
                      {review.comments && (
                        <p className="text-sm mt-1 text-muted-foreground">{review.comments}</p>
                      )}
                      {review.changeRequests && review.changeRequests.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {review.changeRequests.map((cr) => (
                            <div
                              key={cr.id}
                              className="flex items-start gap-2 text-sm"
                            >
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                              <span className={cn(cr.resolved && 'line-through text-muted-foreground')}>
                                {isSpanish ? cr.descriptionEs : cr.description}
                              </span>
                              {cr.priority === 'required' && !cr.resolved && (
                                <Badge variant="destructive" className="text-xs">
                                  {isSpanish ? 'Requerido' : 'Required'}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Final status */}
          {(request.status === 'approved' || request.status === 'rejected') && (
            <div className="relative flex gap-4 pt-2">
              <div
                className={cn(
                  'relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                  request.status === 'approved' && 'bg-green-500 text-white',
                  request.status === 'rejected' && 'bg-red-500 text-white'
                )}
              >
                {request.status === 'approved' ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <h4 className="font-medium">
                  {request.status === 'approved'
                    ? isSpanish
                      ? 'Plan Aprobado'
                      : 'Plan Approved'
                    : isSpanish
                      ? 'Plan Rechazado'
                      : 'Plan Rejected'}
                </h4>
                {request.finalDecisionAt && (
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Por' : 'By'} {request.finalDecisionByName} - {formatDate(request.finalDecisionAt)}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
