'use client';

/**
 * Period Close / Calculation Page
 *
 * All data from Supabase: rule_sets, calculation_batches, calculation_results.
 * No localStorage.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import {
  getRuleSets,
  activateRuleSet,
} from '@/lib/supabase/rule-set-service';
import {
  listCalculationBatches,
  getActiveBatch,
  getCalculationResults,
  transitionBatchLifecycle,
} from '@/lib/supabase/calculation-service';
import {
  getStateLabel,
  getStateColor,
  LIFECYCLE_STATES_ORDERED,
  type CalculationState,
} from '@/lib/calculation/lifecycle-utils';
import type { Database, LifecycleState } from '@/lib/supabase/database.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Calculator, Play, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, Clock, Users, DollarSign, TrendingUp,
  ArrowLeft, ArrowRight, Scale, Search, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CalcBatchRow = Database['public']['Tables']['calculation_batches']['Row'];
type CalcResultRow = Database['public']['Tables']['calculation_results']['Row'];

const labels = {
  'en-US': {
    title: 'Period Close',
    subtitle: 'Close compensation period -- calculate, reconcile, approve, post',
    selectPeriod: 'Select Period',
    noPeriods: 'No periods available',
    entitiesProcessed: 'Entities Processed',
    totalCompensation: 'Total Compensation',
    averagePayout: 'Average Payout',
    recentRuns: 'Recent Batches',
    noRuns: 'No calculation batches yet',
    status: 'Status',
    startedAt: 'Created',
    back: 'Back',
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'You need administrator access to view this page.',
  },
  'es-MX': {
    title: 'Cierre de Periodo',
    subtitle: 'Cierre de periodo de compensacion -- calcular, conciliar, aprobar, publicar',
    selectPeriod: 'Seleccionar Periodo',
    noPeriods: 'No hay periodos disponibles',
    entitiesProcessed: 'Entidades Procesadas',
    totalCompensation: 'Compensacion Total',
    averagePayout: 'Pago Promedio',
    recentRuns: 'Lotes Recientes',
    noRuns: 'Sin lotes de calculo aun',
    status: 'Estado',
    startedAt: 'Creado',
    back: 'Volver',
    accessDenied: 'Acceso Denegado',
    accessDeniedDesc: 'Necesita acceso de administrador para ver esta pagina.',
  },
};

interface RuleSetStatus {
  hasPlans: boolean;
  hasActivePlan: boolean;
  activePlanName: string | null;
  activeRuleSetId: string | null;
  draftPlans: Array<{ id: string; name: string }>;
}

export default function CalculatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [planStatus, setPlanStatus] = useState<RuleSetStatus>({
    hasPlans: false, hasActivePlan: false, activePlanName: null,
    activeRuleSetId: null, draftPlans: [],
  });
  const [isActivating, setIsActivating] = useState(false);
  const [recentBatches, setRecentBatches] = useState<CalcBatchRow[]>([]);
  const [activeBatch, setActiveBatch] = useState<CalcBatchRow | null>(null);
  const [batchResults, setBatchResults] = useState<CalcResultRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { locale } = useAdminLocale();
  const t = labels[locale];
  const hasAccess = user && (isVLAdmin(user) || user.role === 'admin');

  // Load rule sets and batches from Supabase
  useEffect(() => {
    if (!currentTenant) return;

    const loadData = async () => {
      try {
        // Load rule sets
        const ruleSets = await getRuleSets(currentTenant.id);
        const activeRS = ruleSets.find(rs => rs.status === 'active');
        const draftRS = ruleSets
          .filter(rs => rs.status === 'draft')
          .map(rs => ({ id: rs.id, name: rs.name }));

        setPlanStatus({
          hasPlans: ruleSets.length > 0,
          hasActivePlan: !!activeRS,
          activePlanName: activeRS?.name || null,
          activeRuleSetId: activeRS?.id || null,
          draftPlans: draftRS,
        });

        // Load recent batches
        const batches = await listCalculationBatches(currentTenant.id);
        setRecentBatches(batches.slice(0, 10));

        // Derive available periods from batches
        if (batches.length > 0 && !selectedPeriod) {
          setSelectedPeriod(batches[0].period_id);
        }
      } catch (err) {
        console.warn('[Calculate] Failed to load data:', err);
      }
    };

    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant]);

  // Load active batch + results when period changes
  useEffect(() => {
    if (!currentTenant || !selectedPeriod) return;

    const loadBatch = async () => {
      try {
        const batch = await getActiveBatch(currentTenant.id, selectedPeriod);
        setActiveBatch(batch);

        if (batch) {
          const results = await getCalculationResults(currentTenant.id, batch.id);
          setBatchResults(results);
        } else {
          setBatchResults([]);
        }
      } catch (err) {
        console.warn('[Calculate] Failed to load batch:', err);
      }
    };

    loadBatch();
  }, [currentTenant, selectedPeriod]);

  // Lifecycle transition
  const handleLifecycleTransition = async (targetState: CalculationState) => {
    if (!activeBatch || !currentTenant || !user) return;
    try {
      const updated = await transitionBatchLifecycle(
        currentTenant.id,
        activeBatch.id,
        targetState as LifecycleState,
      );
      if (updated) {
        setActiveBatch(updated);
        // Refresh batches list
        const batches = await listCalculationBatches(currentTenant.id);
        setRecentBatches(batches.slice(0, 10));
      } else {
        alert(`Invalid transition to ${targetState}`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : `Failed to transition to ${targetState}`);
    }
  };

  // Activate a draft rule set
  const handleActivateRuleSet = async (ruleSetId: string) => {
    if (!user || !currentTenant) return;
    setIsActivating(true);
    try {
      await activateRuleSet(currentTenant.id, ruleSetId);
      // Refresh
      const ruleSets = await getRuleSets(currentTenant.id);
      const activeRS = ruleSets.find(rs => rs.status === 'active');
      setPlanStatus({
        hasPlans: ruleSets.length > 0,
        hasActivePlan: !!activeRS,
        activePlanName: activeRS?.name || null,
        activeRuleSetId: activeRS?.id || null,
        draftPlans: ruleSets.filter(rs => rs.status === 'draft').map(rs => ({ id: rs.id, name: rs.name })),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to activate rule set');
    } finally {
      setIsActivating(false);
    }
  };

  // Export payroll CSV from batch results
  const handleExportPayroll = () => {
    if (!activeBatch || batchResults.length === 0) return;

    const rows: string[][] = [];
    rows.push(['Entity ID', 'Total Payout', 'Period', 'Batch ID']);

    for (const r of batchResults) {
      rows.push([
        r.entity_id,
        String(r.total_payout || 0),
        activeBatch.period_id,
        activeBatch.id,
      ]);
    }

    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Total Entities', String(batchResults.length)]);
    rows.push(['Total Payout', String(batchResults.reduce((sum, r) => sum + (r.total_payout || 0), 0))]);
    rows.push(['Period', activeBatch.period_id]);
    rows.push(['State', activeBatch.lifecycle_state]);
    rows.push(['Exported At', new Date().toISOString()]);

    const csvContent = rows.map(row =>
      row.map(cell => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll_${activeBatch.period_id}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Available periods from batches
  const availablePeriods = Array.from(new Set(recentBatches.map(b => b.period_id))).sort().reverse();

  // Add current month if no periods
  if (availablePeriods.length === 0) {
    const now = new Date();
    availablePeriods.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }

  // Filtered results for table
  const filteredResults = batchResults.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.entity_id.toLowerCase().includes(q);
  });
  const totalPages = Math.ceil(filteredResults.length / pageSize);
  const paginatedResults = filteredResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalPayout = batchResults.reduce((sum, r) => sum + (r.total_payout || 0), 0);
  const entityCount = batchResults.length;

  // Access denied
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <CardTitle>{t.accessDenied}</CardTitle>
            <CardDescription>{t.accessDeniedDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">Return to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const batchState = (activeBatch?.lifecycle_state || 'DRAFT') as CalculationState;

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/operate" className="hover:text-foreground">Operate</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">
          {t.title}{selectedPeriod ? `: ${selectedPeriod}` : ''}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/operate')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            {t.title}{selectedPeriod ? `: ${selectedPeriod}` : ''}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{t.subtitle}</p>
        </div>
      </div>

      {/* Rule Set Status */}
      {!planStatus.hasActivePlan && planStatus.draftPlans.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              {locale === 'es-MX' ? 'Plan Pendiente de Activacion' : 'Rule Set Pending Activation'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {planStatus.draftPlans.map((plan) => (
                <Button
                  key={plan.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleActivateRuleSet(plan.id)}
                  disabled={isActivating}
                  className="bg-white"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {locale === 'es-MX' ? 'Activar' : 'Activate'}: {plan.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {planStatus.hasActivePlan && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                {locale === 'es-MX' ? 'Plan Activo' : 'Active Rule Set'}:
              </span>
              <span>{planStatus.activePlanName}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {t.selectPeriod}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder={t.selectPeriod} />
                </SelectTrigger>
                <SelectContent>
                  {availablePeriods.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lifecycle Action Bar */}
      {activeBatch && selectedPeriod && (
        <Card>
          <CardContent className="py-4 space-y-4">
            {/* State subway */}
            <div className="flex items-center gap-0.5 overflow-x-auto">
              {LIFECYCLE_STATES_ORDERED.map((state, idx, arr) => {
                const isCurrent = batchState === state;
                const isRejected = batchState === 'REJECTED' && state === 'PENDING_APPROVAL';
                const currentIdx = LIFECYCLE_STATES_ORDERED.indexOf(
                  batchState === 'REJECTED' ? 'PENDING_APPROVAL' : batchState
                );
                const isPast = currentIdx > idx;
                return (
                  <div key={state} className="flex items-center flex-1 min-w-0">
                    <div className={cn(
                      'flex items-center justify-center w-full py-1 px-1 text-[10px] font-medium rounded-md transition-colors truncate',
                      isCurrent ? getStateColor(batchState) + ' ring-2 ring-offset-1 ring-blue-300' :
                      isRejected ? 'bg-red-100 text-red-700' :
                      isPast ? 'bg-slate-200 text-slate-600' :
                      'bg-slate-50 text-slate-400'
                    )}>
                      {getStateLabel(state)}
                    </div>
                    {idx < arr.length - 1 && (
                      <ArrowRight className={cn('h-2.5 w-2.5 mx-0.5 flex-shrink-0',
                        isPast ? 'text-slate-400' : 'text-slate-200'
                      )} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Current state + actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-slate-500" />
                <Badge className={getStateColor(batchState)}>
                  {getStateLabel(batchState)}
                </Badge>
                <span className="text-xs text-slate-500">
                  {entityCount} entities | {formatCurrency(totalPayout)}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {batchState === 'OFFICIAL' && (
                  <Button size="sm" onClick={() => handleLifecycleTransition('PENDING_APPROVAL')}>
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Submit for Approval
                  </Button>
                )}
                {batchState === 'PENDING_APPROVAL' && (
                  <>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleLifecycleTransition('APPROVED')}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive"
                      onClick={() => handleLifecycleTransition('REJECTED')}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </>
                )}
                {batchState === 'APPROVED' && (
                  <>
                    <Button size="sm" onClick={() => handleLifecycleTransition('POSTED')}>
                      <ArrowRight className="h-4 w-4 mr-1" />
                      Post Results
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExportPayroll}>
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </>
                )}
                {batchState === 'POSTED' && (
                  <>
                    <Badge className="bg-teal-100 text-teal-700">Results visible to all roles</Badge>
                    <Button size="sm" onClick={() => handleLifecycleTransition('CLOSED')}>
                      Close Period
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExportPayroll}>
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </>
                )}
                {batchState === 'CLOSED' && (
                  <Button size="sm" onClick={() => handleLifecycleTransition('PAID')}>
                    Mark as Paid
                  </Button>
                )}
                {batchState === 'PAID' && (
                  <Button size="sm" onClick={() => handleLifecycleTransition('PUBLISHED')}>
                    Publish
                  </Button>
                )}
                {batchState === 'PUBLISHED' && (
                  <Badge className="bg-sky-100 text-sky-700">Period Complete</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results from Supabase */}
      {batchResults.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-100">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.entitiesProcessed}</p>
                    <p className="text-2xl font-bold">{entityCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-emerald-100">
                    <DollarSign className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.totalCompensation}</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalPayout)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-purple-100">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.averagePayout}</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(entityCount > 0 ? Math.round(totalPayout / entityCount) : 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Entity Results Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Entity Results</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search entity..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Rule Set</TableHead>
                    <TableHead className="text-right">Total Payout</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedResults.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => router.push(`/investigate/trace/${r.entity_id}?from=calculate`)}
                    >
                      <TableCell className="font-mono text-sm">{r.entity_id}</TableCell>
                      <TableCell className="text-sm">{r.rule_set_id || '-'}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {formatCurrency(r.total_payout || 0)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-slate-500">
                    Showing {(currentPage - 1) * pageSize + 1}--{Math.min(currentPage * pageSize, filteredResults.length)} of {filteredResults.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => p - 1)}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium">{currentPage} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* No results state */}
      {!activeBatch && selectedPeriod && (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <Calculator className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">No calculation batch for this period</p>
            <p className="text-sm mt-1">Import data and run calculations to see results here.</p>
          </CardContent>
        </Card>
      )}

      {/* Recent Batches */}
      <Collapsible defaultOpen={false}>
        <Card>
          <CardHeader className="cursor-pointer">
            <CollapsibleTrigger className="flex items-center gap-2 w-full">
              <Clock className="h-5 w-5" />
              <span className="font-semibold">{t.recentRuns}</span>
              <Badge variant="outline" className="ml-2">{recentBatches.length}</Badge>
              <ChevronDown className="h-4 w-4 ml-auto transition-transform" />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {recentBatches.length === 0 ? (
                <p className="text-center text-slate-500 py-8">{t.noRuns}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>{t.status}</TableHead>
                      <TableHead>Entities</TableHead>
                      <TableHead>{t.startedAt}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBatches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell>{batch.period_id}</TableCell>
                        <TableCell>
                          <Badge className={getStateColor(batch.lifecycle_state)}>
                            {getStateLabel(batch.lifecycle_state)}
                          </Badge>
                        </TableCell>
                        <TableCell>{batch.entity_count || 0}</TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {new Date(batch.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
