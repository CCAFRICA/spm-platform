'use client';

/**
 * Approval Center Page
 *
 * Central hub for all approval requests across the platform.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  ClipboardCheck,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUp,
  Search,
  Filter,
  AlertTriangle,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { ApprovalRequestCard } from '@/components/approvals/approval-request-card';
import {
  getMyApprovals,
  getApprovals,
  getApprovalStats,
  processDecision,
  escalateRequest,
} from '@/lib/approval-routing/approval-service';
import type { ApprovalRequest, ApprovalDomain, ApprovalStatus } from '@/lib/approval-routing/types';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';

const DOMAIN_LABELS: Record<ApprovalDomain, { en: string; es: string }> = {
  import_batch: { en: 'Import Batch', es: 'Lote de Importación' },
  rollback: { en: 'Rollback', es: 'Reversión' },
  compensation_plan: { en: 'Compensation Plan', es: 'Plan de Compensación' },
  period_operation: { en: 'Period Operation', es: 'Operación de Período' },
  hierarchy_change: { en: 'Hierarchy Change', es: 'Cambio de Jerarquía' },
  manual_adjustment: { en: 'Manual Adjustment', es: 'Ajuste Manual' },
  personnel_change: { en: 'Personnel Change', es: 'Cambio de Personal' },
  configuration_change: { en: 'Configuration', es: 'Configuración' },
};

export default function ApprovalCenterPage() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const userIsVLAdmin = user && isVLAdmin(user);
  const isSpanish = userIsVLAdmin ? false : (locale === 'es-MX' || currentTenant?.locale === 'es-MX');

  const [activeTab, setActiveTab] = useState('pending');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof getApprovalStats> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const tenantId = currentTenant?.id || 'default';
  const userId = user?.id || 'admin';
  const userRole = user?.role || 'admin';

  const loadData = () => {
    // Load stats
    setStats(getApprovalStats(tenantId));

    // Load requests based on tab
    let loadedRequests: ApprovalRequest[];

    if (activeTab === 'pending') {
      loadedRequests = getMyApprovals(userId, tenantId, userRole);
    } else {
      const statusFilter: ApprovalStatus | undefined =
        activeTab === 'approved' ? 'approved' :
        activeTab === 'rejected' ? 'rejected' :
        activeTab === 'escalated' ? 'escalated' :
        undefined;

      loadedRequests = getApprovals(tenantId, {
        status: statusFilter,
        domain: domainFilter !== 'all' ? (domainFilter as ApprovalDomain) : undefined,
      });
    }

    // Apply domain filter for pending tab too
    if (domainFilter !== 'all') {
      loadedRequests = loadedRequests.filter((r) => r.domain === domainFilter);
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      loadedRequests = loadedRequests.filter(
        (r) =>
          r.summary.title.toLowerCase().includes(query) ||
          r.summary.description.toLowerCase().includes(query) ||
          r.id.toLowerCase().includes(query)
      );
    }

    setRequests(loadedRequests);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeTab, domainFilter, userId, userRole]);

  const handleApprove = async (requestId: string, notes?: string) => {
    setIsProcessing(true);
    try {
      processDecision(requestId, 'approved', userId, notes);
      loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (requestId: string, notes?: string) => {
    setIsProcessing(true);
    try {
      processDecision(requestId, 'rejected', userId, notes);
      loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEscalate = async (requestId: string, reason?: string) => {
    setIsProcessing(true);
    try {
      escalateRequest(requestId, reason || 'Escalated by user', userId);
      loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isSpanish ? 'Centro de Aprobaciones' : 'Approval Center'}
            </h1>
            <p className="text-muted-foreground">
              {isSpanish
                ? 'Gestione solicitudes de aprobación en toda la plataforma'
                : 'Manage approval requests across the platform'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Pendientes' : 'Pending'}
                  </p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
              {stats.overdueSla > 0 && (
                <div className="mt-2 flex items-center gap-1 text-red-600 text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  {stats.overdueSla} {isSpanish ? 'vencidos' : 'overdue'}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Aprobados' : 'Approved'}
                  </p>
                  <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Rechazados' : 'Rejected'}
                  </p>
                  <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Escalados' : 'Escalated'}
                  </p>
                  <p className="text-2xl font-bold text-orange-600">{stats.escalated}</p>
                </div>
                <ArrowUp className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Tiempo Prom.' : 'Avg. Time'}
                  </p>
                  <p className="text-2xl font-bold">{stats.avgResolutionTimeHours}h</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isSpanish ? 'Buscar solicitudes...' : 'Search requests...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder={isSpanish ? 'Filtrar por tipo' : 'Filter by type'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {isSpanish ? 'Todos los tipos' : 'All types'}
            </SelectItem>
            {Object.entries(DOMAIN_LABELS).map(([domain, labels]) => (
              <SelectItem key={domain} value={domain}>
                {isSpanish ? labels.es : labels.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs and Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            {isSpanish ? 'Pendientes' : 'Pending'}
            {stats && stats.pending > 0 && (
              <Badge variant="secondary">{stats.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            {isSpanish ? 'Aprobados' : 'Approved'}
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            <XCircle className="h-4 w-4" />
            {isSpanish ? 'Rechazados' : 'Rejected'}
          </TabsTrigger>
          <TabsTrigger value="escalated" className="gap-2">
            <ArrowUp className="h-4 w-4" />
            {isSpanish ? 'Escalados' : 'Escalated'}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            {isSpanish ? 'Historial' : 'History'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {requests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {isSpanish ? 'No hay solicitudes' : 'No requests found'}
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  {activeTab === 'pending'
                    ? isSpanish
                      ? 'No tiene solicitudes de aprobación pendientes.'
                      : 'You have no pending approval requests.'
                    : isSpanish
                      ? 'No hay solicitudes que coincidan con los filtros seleccionados.'
                      : 'No requests match the selected filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <ApprovalRequestCard
                  key={request.id}
                  request={request}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onEscalate={handleEscalate}
                  isProcessing={isProcessing}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Domain Distribution */}
      {stats && Object.keys(stats.byDomain).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {isSpanish ? 'Distribución por Tipo' : 'Distribution by Type'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.byDomain).map(([domain, count]) => (
                <Button
                  key={domain}
                  variant="outline"
                  size="sm"
                  onClick={() => setDomainFilter(domain)}
                  className="gap-2"
                >
                  {isSpanish
                    ? DOMAIN_LABELS[domain as ApprovalDomain]?.es
                    : DOMAIN_LABELS[domain as ApprovalDomain]?.en}
                  <Badge variant="secondary">{count}</Badge>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
