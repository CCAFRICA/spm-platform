'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import { toast } from 'sonner';
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Users,
  Calculator,
  Shield,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import {
  getApprovalRequests,
  getApprovalStats,
  initializePlanApprovals,
} from '@/lib/plan-approval/plan-approval-service';
import { ApprovalWorkflowTimeline } from '@/components/plan-approval/ApprovalWorkflowTimeline';
import { ReviewerActionsPanel } from '@/components/plan-approval/ReviewerActionsPanel';
import type { PlanApprovalRequest, ReviewerRole } from '@/types/plan-approval';
import { STAGE_CONFIG } from '@/types/plan-approval';

export default function PlanApprovalsPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { user } = useAuth();
  const userIsVLAdmin = user && isVLAdmin(user);
  const isSpanish = userIsVLAdmin ? false : (locale === 'es-MX' || currentTenant?.locale === 'es-MX');
  const tenantId = currentTenant?.id || 'retailco';

  const [requests, setRequests] = useState<PlanApprovalRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PlanApprovalRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    inReview: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
    avgDaysToApprove: 0,
    byStage: {} as Record<string, number>,
  });

  // Determine reviewer role based on user
  const getReviewerRole = (): ReviewerRole => {
    if (user?.role === 'vl_admin' || user?.role === 'admin') return 'admin';
    if (user?.role === 'manager') return 'manager';
    return 'admin'; // Default for demo
  };

  const loadData = useCallback(() => {
    try {
      initializePlanApprovals();
      const approvals = getApprovalRequests(tenantId);
      const approvalStats = getApprovalStats(tenantId);
      setRequests(approvals);
      setStats(approvalStats);
    } catch (error) {
      console.error('Error loading approvals:', error);
      toast.error(isSpanish ? 'Error al cargar aprobaciones' : 'Error loading approvals');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, isSpanish]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsLoading(true);
    loadData();
    toast.success(isSpanish ? 'Actualizado' : 'Refreshed');
  };

  const pendingRequests = requests.filter(
    (r) => r.status === 'pending' || r.status === 'in_review'
  );
  const completedRequests = requests.filter(
    (r) => r.status === 'approved' || r.status === 'rejected' || r.status === 'withdrawn'
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'manager_review':
        return Users;
      case 'finance_review':
        return Calculator;
      case 'executive_review':
        return Shield;
      case 'approved':
        return CheckCircle;
      case 'rejected':
        return XCircle;
      default:
        return FileText;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isSpanish ? 'Cargando aprobaciones...' : 'Loading approvals...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/performance/approvals">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {isSpanish ? 'Volver' : 'Back'}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              {isSpanish ? 'Aprobaciones de Planes' : 'Plan Approvals'}
            </h1>
            <p className="text-muted-foreground">
              {isSpanish
                ? 'Revisa y aprueba planes de compensaci\u00f3n'
                : 'Review and approve compensation plans'}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {isSpanish ? 'Actualizar' : 'Refresh'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-900/30">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending + stats.inReview}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Pendientes' : 'Pending'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Aprobados' : 'Approved'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900/30">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Rechazados' : 'Rejected'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgDaysToApprove}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'D\u00edas Promedio' : 'Avg Days'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Approval List */}
        <div>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                <Clock className="h-4 w-4" />
                {isSpanish ? 'Pendientes' : 'Pending'}
                {pendingRequests.length > 0 && (
                  <Badge variant="secondary">{pendingRequests.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                {isSpanish ? 'Completados' : 'Completed'}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4 space-y-3">
              {pendingRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-muted-foreground">
                      {isSpanish
                        ? 'No hay aprobaciones pendientes'
                        : 'No pending approvals'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                pendingRequests.map((request) => {
                  const StageIcon = getStageIcon(request.stage);
                  const stageConfig = STAGE_CONFIG[request.stage];

                  return (
                    <Card
                      key={request.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedRequest?.id === request.id
                          ? 'ring-2 ring-primary'
                          : ''
                      }`}
                      onClick={() => setSelectedRequest(request)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{request.planName}</h3>
                              <Badge variant="outline">v{request.planVersion}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {isSpanish ? 'Por' : 'By'} {request.requesterName} &bull;{' '}
                              {formatDate(request.requestedAt)}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge
                                variant="secondary"
                                className="flex items-center gap-1"
                              >
                                <StageIcon className="h-3 w-3" />
                                {isSpanish ? stageConfig.nameEs : stageConfig.name}
                              </Badge>
                              {request.status === 'in_review' && (
                                <Badge variant="outline" className="text-amber-600">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {isSpanish ? 'Cambios Solicitados' : 'Changes Requested'}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <ApprovalWorkflowTimeline request={request} compact />
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-4 space-y-3">
              {completedRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {isSpanish
                        ? 'No hay aprobaciones completadas'
                        : 'No completed approvals'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                completedRequests.map((request) => (
                  <Card
                    key={request.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedRequest?.id === request.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedRequest(request)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{request.planName}</h3>
                            <Badge
                              variant={
                                request.status === 'approved'
                                  ? 'default'
                                  : request.status === 'rejected'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {request.status === 'approved'
                                ? isSpanish
                                  ? 'Aprobado'
                                  : 'Approved'
                                : request.status === 'rejected'
                                  ? isSpanish
                                    ? 'Rechazado'
                                    : 'Rejected'
                                  : isSpanish
                                    ? 'Retirado'
                                    : 'Withdrawn'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {request.finalDecisionByName} &bull;{' '}
                            {request.finalDecisionAt && formatDate(request.finalDecisionAt)}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Detail Panel */}
        <div>
          {selectedRequest ? (
            <div className="space-y-4">
              <ApprovalWorkflowTimeline request={selectedRequest} />

              {(selectedRequest.status === 'pending' || selectedRequest.status === 'in_review') && (
                <ReviewerActionsPanel
                  request={selectedRequest}
                  reviewerRole={getReviewerRole()}
                  onReviewSubmitted={() => {
                    loadData();
                    setSelectedRequest(null);
                  }}
                />
              )}

              {selectedRequest.requestNotes && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {isSpanish ? 'Notas del Solicitante' : 'Requester Notes'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {selectedRequest.requestNotes}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="h-full min-h-[300px] flex items-center justify-center">
              <CardContent className="text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">
                  {isSpanish
                    ? 'Selecciona una solicitud para ver detalles'
                    : 'Select a request to view details'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
