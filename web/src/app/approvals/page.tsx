'use client';

/**
 * Approval Center Page
 *
 * Central hub for all approval requests across the platform.
 */

import { useState, useEffect } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313: Vialuce page-template adoption
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// OB-224: real source of approvable work = calculation_batches in a pre-approval lifecycle state.
import { listCalculationBatches } from '@/lib/supabase/calculation-service';
import { getPeriodsWithResults } from '@/lib/drill-through';
import { DrillThroughPanel } from '@/components/drill-through';
import { RequireCapability } from '@/components/auth/RequireCapability'; // OB-246: approver gate
import { ChevronRight, ChevronDown } from 'lucide-react';
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
import { useLocale , isSpanishLocale} from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';

const DOMAIN_LABELS: Record<ApprovalDomain, { en: string; es: string }> = {
  import_batch: { en: 'Import Batch', es: 'Lote de Importación' },
  rollback: { en: 'Rollback', es: 'Reversión' },
  compensation_plan: { en: 'Rule Set', es: 'Plan de Compensación' },
  period_operation: { en: 'Period Operation', es: 'Operación de Período' },
  hierarchy_change: { en: 'Hierarchy Change', es: 'Cambio de Jerarquía' },
  manual_adjustment: { en: 'Manual Adjustment', es: 'Ajuste Manual' },
  personnel_change: { en: 'Personnel Change', es: 'Cambio de Personal' },
  configuration_change: { en: 'Configuration', es: 'Configuración' },
};

function ApprovalCenterPageInner() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const isSpanish = isSpanishLocale(locale);
  const isVialuce = useIsVialuce(); // HF-313: Vialuce page-template adoption (else-branch unchanged)

  const [activeTab, setActiveTab] = useState('pending');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof getApprovalStats> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const tenantId = currentTenant?.id || 'default';
  const userId = user?.id || 'admin';
  const userRole = user?.role || 'admin';

  // OB-224: real "Pending Calculations" — calculation_batches awaiting approval.
  // Real lifecycle_state values observed in data: PREVIEW (pre-approval) and APPROVED.
  // We treat the pre-APPROVED states as "pending"; PREVIEW is the live one, the rest are
  // defensive against batches that have advanced toward approval.
  const PENDING_BATCH_STATES = ['PREVIEW', 'OFFICIAL', 'PENDING_APPROVAL'] as const;
  type PendingBatch = {
    id: string;
    periodId: string | null;
    periodLabel: string;
    entityCount: number;
    totalPayout: number;
    ruleSetName: string | null;
    lifecycleState: string;
  };
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const realTenantId = currentTenant?.id;
    if (!realTenantId) {
      setPendingBatches([]);
      return;
    }
    (async () => {
      setPendingLoading(true);
      try {
        const [periodOptions, ...stateBatches] = await Promise.all([
          getPeriodsWithResults(realTenantId),
          ...PENDING_BATCH_STATES.map((state) =>
            listCalculationBatches(realTenantId, { lifecycleState: state as never }).catch(() => []),
          ),
        ]);
        if (cancelled) return;
        const periodLabelById = new Map(periodOptions.map((p) => [p.id, p.label]));
        const rows: PendingBatch[] = stateBatches.flat().map((b) => {
          const summary = (b.summary ?? {}) as Record<string, unknown>;
          const periodId = (b.period_id as string | null) ?? null;
          return {
            id: b.id as string,
            periodId,
            periodLabel: (periodId && periodLabelById.get(periodId)) || (periodId ?? '—'),
            entityCount:
              (typeof summary.entity_count === 'number' ? summary.entity_count : undefined) ??
              (typeof b.entity_count === 'number' ? b.entity_count : 0),
            totalPayout: typeof summary.total_payout === 'number' ? summary.total_payout : 0,
            ruleSetName:
              typeof summary.rule_set_name === 'string' ? summary.rule_set_name : null,
            lifecycleState: (b.lifecycle_state as string) ?? '',
          };
        });
        // newest first (listCalculationBatches already orders by created_at desc per state)
        setPendingBatches(rows);
      } finally {
        if (!cancelled) setPendingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant?.id]);

  // OB-246: approver drill-through reads all results in the batch (approver is data.approve_results-gated).
  const allScope = { type: 'all' as const };

  const currencyFmt = new Intl.NumberFormat(isSpanish ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency: currentTenant?.currency || 'USD',
    maximumFractionDigits: 0,
  });

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
    // HF-313: Vialuce page frame (.page padding/max-width/center) + .phead header; else unchanged.
    <div className={isVialuce ? 'page space-y-6' : 'container mx-auto p-6 space-y-6'}>
      {/* Header */}
      {isVialuce ? (
        <div className="phead">
          <div>
            <h1>{isSpanish ? 'Centro de Aprobaciones' : 'Approval Center'}</h1>
            <div className="sub">
              {isSpanish
                ? 'Gestione solicitudes de aprobación en toda la plataforma'
                : 'Manage approval requests across the platform'}
            </div>
          </div>
        </div>
      ) : (
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
      )}

      {/* OB-224: Pending Calculations — REAL approvable work from calculation_batches.
          Additive section; the legacy (in-memory) approval UI below is left intact. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {isSpanish ? 'Cálculos Pendientes' : 'Pending Calculations'}
            {pendingBatches.length > 0 && (
              <Badge variant="secondary">{pendingBatches.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <p className="text-sm text-muted-foreground py-4">
              {isSpanish ? 'Cargando…' : 'Loading…'}
            </p>
          ) : pendingBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {isSpanish
                ? 'No hay cálculos pendientes de aprobación.'
                : 'No calculations are pending approval.'}
            </p>
          ) : (
            <div className="space-y-2">
              {pendingBatches.map((batch) => {
                const expanded = expandedBatchId === batch.id;
                return (
                  <div key={batch.id} className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBatchId(expanded ? null : batch.id)
                      }
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {batch.ruleSetName ||
                              (isSpanish ? 'Plan de Compensación' : 'Rule Set')}
                          </span>
                          <Badge variant="outline" className="shrink-0">
                            {batch.lifecycleState}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {isSpanish ? 'Período' : 'Period'}: {batch.periodLabel}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">
                          {currencyFmt.format(batch.totalPayout)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {batch.entityCount} {isSpanish ? 'entidades' : 'entities'}
                        </p>
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t p-3 space-y-3">
                        <DrillThroughPanel
                          tenantId={tenantId}
                          scope={allScope}
                          batchId={batch.id}
                          showExport
                          emptyMessage={
                            isSpanish
                              ? 'No hay resultados para revisar en este lote.'
                              : 'No results to review in this batch.'
                          }
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" disabled>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {isSpanish ? 'Aprobar' : 'Approve'}
                          </Button>
                          <Button size="sm" variant="outline" disabled>
                            <XCircle className="h-4 w-4 mr-1" />
                            {isSpanish ? 'Rechazar' : 'Reject'}
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {isSpanish
                              ? 'Las transiciones de estado del lote llegarán en un seguimiento (revisión y reconciliación primero).'
                              : 'Batch state transitions land in a follow-up (review & reconcile first).'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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

// OB-246: /approvals (and its /operate/approve + /govern/approvals re-exports) renders tenant-wide
// pending-batch entity results via DrillThroughPanel — gate it to approvers (data.approve_results),
// matching /govern/calculation-approvals. Was ungated at both middleware and page level (review finding).
export default function ApprovalCenterPage() {
  return (
    <RequireCapability capability="data.approve_results">
      <ApprovalCenterPageInner />
    </RequireCapability>
  );
}
