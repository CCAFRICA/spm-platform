'use client';

/**
 * Period Close / Calculation Page
 *
 * All data from Supabase: rule_sets, calculation_batches, calculation_results.
 * No localStorage.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import { RequireRole } from '@/components/auth/RequireRole';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import {
  getRuleSets,
  activateRuleSet,
} from '@/lib/supabase/rule-set-service';
import {
  listCalculationBatches,
  getActiveBatch,
  getCalculationResults,
} from '@/lib/supabase/calculation-service';
import {
  getStateLabel,
  getStateColor,
  type CalculationState,
} from '@/lib/calculation/lifecycle-utils';
import { runCalculation } from '@/lib/calculation/run-calculation';
import {
  type CalculationCycle,
  performLifecycleTransition,
  batchToCycle,
  generatePayrollCSV,
} from '@/lib/calculation/calculation-lifecycle-service';
import { LifecycleSubway } from '@/components/lifecycle/LifecycleSubway';
import { LifecycleActionBar } from '@/components/lifecycle/LifecycleActionBar';
import { getPipelineConfig, type LifecyclePipelineConfig } from '@/lib/lifecycle/lifecycle-pipeline';
import { loadTenantPeriods } from '@/lib/data/page-loaders';
import type { Database } from '@/lib/supabase/database.types';
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
  Calculator, Play, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, Clock, Users, DollarSign, TrendingUp,
  ArrowLeft, ArrowRight, Search, Layers,
} from 'lucide-react';
import { ExecutionTraceView } from '@/components/forensics/ExecutionTraceView';

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
    recentRuns: 'Recent Calculation Runs',
    noRuns: 'No calculation runs yet',
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
    recentRuns: 'Ejecuciones Recientes',
    noRuns: 'Sin ejecuciones de calculo aun',
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

function CalculatePageInner() {
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
  const [activeCycle, setActiveCycle] = useState<CalculationCycle | null>(null);
  const [batchResults, setBatchResults] = useState<CalcResultRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isCalculating, setIsCalculating] = useState(false);
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const [dbPeriods, setDbPeriods] = useState<Array<{ id: string; canonical_key: string; label?: string }>>([]);

  const { locale } = useAdminLocale();
  const t = labels[locale];
  const hasAccess = user && (isVLAdmin(user) || user.role === 'admin');

  // Derive pipeline config from tenant features (default: production)
  const pipelineConfig: LifecyclePipelineConfig = getPipelineConfig(
    currentTenant?.features?.lifecyclePipeline || 'production'
  );

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

        // Load recent batches + periods from page loader
        const [batches, periods] = await Promise.all([
          listCalculationBatches(currentTenant.id),
          loadTenantPeriods(currentTenant.id),
        ]);
        setRecentBatches(batches.slice(0, 10));
        setDbPeriods(periods);

        // Default to first period (from DB or from batches)
        if (!selectedPeriod) {
          const firstPeriod = periods[0];
          if (firstPeriod) {
            setSelectedPeriod(firstPeriod.id);
          } else if (batches.length > 0) {
            setSelectedPeriod(batches[0].period_id);
          }
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
          const [results, cycle] = await Promise.all([
            getCalculationResults(currentTenant.id, batch.id),
            batchToCycle(batch, currentTenant.id),
          ]);
          setBatchResults(results);
          setActiveCycle(cycle);
        } else {
          setBatchResults([]);
          setActiveCycle(null);
        }
      } catch (err) {
        console.warn('[Calculate] Failed to load batch:', err);
      }
    };

    loadBatch();
  }, [currentTenant, selectedPeriod]);

  // Lifecycle transition with full audit trail
  const handleLifecycleTransition = async (targetState: CalculationState, details?: string) => {
    if (!activeBatch || !currentTenant || !user) return;
    try {
      const updatedCycle = await performLifecycleTransition(
        currentTenant.id,
        activeBatch.id,
        targetState,
        { profileId: user.id, name: user.name },
        { details, rejectionReason: details },
      );
      if (updatedCycle) {
        setActiveCycle(updatedCycle);
        // Refresh batch and batches list
        const batch = await getActiveBatch(currentTenant.id, selectedPeriod);
        setActiveBatch(batch);
        const batches = await listCalculationBatches(currentTenant.id);
        setRecentBatches(batches.slice(0, 10));
      } else {
        alert(`Invalid transition to ${targetState}`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : `Failed to transition to ${targetState}`);
    }
  };

  // Run calculation
  const handleRunCalculation = async () => {
    if (!currentTenant || !selectedPeriod || !planStatus.activeRuleSetId || !user) return;
    setIsCalculating(true);
    try {
      const result = await runCalculation({
        tenantId: currentTenant.id,
        periodId: selectedPeriod,
        ruleSetId: planStatus.activeRuleSetId,
        userId: user.id,
      });

      if (!result.success) {
        alert(`Calculation failed: ${result.error}`);
        return;
      }

      // Refresh batches and results
      const batches = await listCalculationBatches(currentTenant.id);
      setRecentBatches(batches.slice(0, 10));

      // Load the new batch
      const batch = await getActiveBatch(currentTenant.id, selectedPeriod);
      setActiveBatch(batch);
      if (batch) {
        const [results, cycle] = await Promise.all([
          getCalculationResults(currentTenant.id, batch.id),
          batchToCycle(batch, currentTenant.id),
        ]);
        setBatchResults(results);
        setActiveCycle(cycle);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setIsCalculating(false);
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

  // Export payroll CSV using lifecycle service
  const handleExportPayroll = () => {
    if (!activeBatch || batchResults.length === 0) return;

    const resultsForExport = batchResults.map(r => {
      const comps = Array.isArray(r.components) ? r.components : [];
      const meta = r.metadata as Record<string, unknown> | null;
      return {
        entityId: r.entity_id,
        entityName: (meta?.entityName as string) || r.entity_id,
        totalPayout: r.total_payout || 0,
        components: comps.map((c: unknown) => {
          const comp = c as Record<string, unknown>;
          return {
            componentName: String(comp.componentName || comp.component_name || ''),
            outputValue: Number(comp.outputValue || comp.output_value || 0),
          };
        }),
      };
    });

    const csvContent = generatePayrollCSV(resultsForExport, {
      tenantName: currentTenant?.name || currentTenant?.displayName || 'Tenant',
      periodId: activeBatch.period_id,
      batchState: activeBatch.lifecycle_state,
      currency: currentTenant?.currency || 'USD',
      locale: currentTenant?.locale || 'en-US',
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const tenantName = (currentTenant?.name || 'Tenant').replace(/\s+/g, '_');
    link.download = `${tenantName}_${activeBatch.period_id}_Results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Merge periods from DB and from batches
  const periodMap = new Map<string, string>();
  for (const p of dbPeriods) {
    periodMap.set(p.id, p.label || p.canonical_key);
  }
  for (const b of recentBatches) {
    if (!periodMap.has(b.period_id)) {
      periodMap.set(b.period_id, b.period_id);
    }
  }
  const availablePeriods = Array.from(periodMap.entries()).map(([id, key]) => ({ id, key }));

  // Filtered results for table — search by external ID, name, or entity UUID
  const filteredResults = batchResults.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const meta = r.metadata as Record<string, unknown> | null;
    const externalId = String(meta?.externalId || '').toLowerCase();
    const entityName = String(meta?.entityName || '').toLowerCase();
    return r.entity_id.toLowerCase().includes(q)
      || externalId.includes(q)
      || entityName.includes(q);
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

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/operate" className="hover:text-foreground">Operate</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">
          {t.title}{selectedPeriod ? `: ${periodMap.get(selectedPeriod) || selectedPeriod}` : ''}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/operate')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            {t.title}{selectedPeriod ? `: ${periodMap.get(selectedPeriod) || selectedPeriod}` : ''}
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
                  className="bg-zinc-900"
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
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder={t.selectPeriod} />
                </SelectTrigger>
                <SelectContent>
                  {availablePeriods.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleRunCalculation}
              disabled={isCalculating || !planStatus.hasActivePlan || !selectedPeriod}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isCalculating ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  {locale === 'es-MX' ? 'Calculando...' : 'Calculating...'}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  {locale === 'es-MX' ? 'Ejecutar Calculo' : 'Run Calculation'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lifecycle Subway + Action Bar */}
      {activeCycle && selectedPeriod && (
        <Card>
          <CardContent className="py-4 space-y-4">
            <LifecycleSubway cycle={activeCycle} pipelineConfig={pipelineConfig} />
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{entityCount} entities</span>
              <span>|</span>
              <span>{formatCurrency(totalPayout)}</span>
            </div>
            <LifecycleActionBar
              cycle={activeCycle}
              currentUserId={user?.id || ''}
              onTransition={handleLifecycleTransition}
              onExport={handleExportPayroll}
              isSubmitter={activeCycle.submittedBy === user?.name}
              pipelineConfig={pipelineConfig}
            />
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
                    <p className="text-sm text-slate-400">{t.entitiesProcessed}</p>
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
                    <p className="text-sm text-slate-400">{t.totalCompensation}</p>
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
                    <p className="text-sm text-slate-400">{t.averagePayout}</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(entityCount > 0 ? Math.round(totalPayout / entityCount) : 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Zero-Payout Warning (F-58) */}
          {entityCount > 0 && totalPayout === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">
                  {locale === 'es-MX' ? 'Cálculo Completo — Atención Requerida' : 'Calculation Complete — Attention Required'}
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  {entityCount} {locale === 'es-MX' ? 'entidades procesadas' : 'entities processed'}. {locale === 'es-MX' ? 'Pago total' : 'Total payout'}: {formatCurrency(0)}.
                  {' '}
                  {locale === 'es-MX'
                    ? 'Esto típicamente significa que los campos de datos no están mapeados a los componentes del plan.'
                    : 'This typically means data fields are not mapped to plan components.'}
                </p>
                <Link
                  href="/operate/import/enhanced"
                  className="text-sm text-amber-800 underline hover:text-amber-900 mt-1 inline-block"
                >
                  {locale === 'es-MX' ? 'Revisar mapeo de campos →' : 'Review field mappings →'}
                </Link>
              </div>
            </div>
          )}

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
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Total Payout</TableHead>
                    <TableHead>Components</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedResults.map((r) => {
                    const meta = r.metadata as Record<string, unknown> | null;
                    const externalId = String(meta?.externalId || '');
                    const entityName = String(meta?.entityName || r.entity_id.slice(0, 8));
                    const comps = Array.isArray(r.components) ? r.components as Array<Record<string, unknown>> : [];
                    const intentTraces = (meta?.intentTraces ?? []) as Array<Record<string, unknown>>;
                    const intentMatch = meta?.intentMatch as boolean | undefined;
                    const isExpanded = expandedEntityId === r.entity_id;
                    const componentNames = comps.map(c => String(c.componentName || ''));
                    return (
                    <React.Fragment key={r.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-zinc-800/50"
                      onClick={() => setExpandedEntityId(isExpanded ? null : r.entity_id)}
                    >
                      <TableCell className="w-8 px-2">
                        {intentTraces.length > 0 ? (
                          isExpanded
                            ? <ChevronDown className="h-4 w-4 text-slate-400" />
                            : <ChevronRight className="h-4 w-4 text-slate-400" />
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium font-mono">{externalId || r.entity_id.slice(0, 8)}</span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">{entityName}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {formatCurrency(r.total_payout || 0)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        <div className="flex items-center gap-2 flex-wrap">
                          {comps.length > 0 ? comps.map((c, ci) => {
                            const payout = Number(c.payout || 0);
                            return (
                              <span key={ci} className={payout > 0 ? 'text-emerald-500' : 'text-zinc-500'}>
                                {String(c.componentName || `C${ci + 1}`)}: {formatCurrency(payout)}
                              </span>
                            );
                          }) : '-'}
                          {intentTraces.length > 0 && (
                            <Layers className="h-3 w-3 text-blue-400" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && intentTraces.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-zinc-900/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                              Intent Execution Trace
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/investigate/trace/${r.entity_id}?from=calculate`);
                              }}
                            >
                              Full Trace →
                            </Button>
                          </div>
                          <ExecutionTraceView
                            traces={intentTraces as never[]}
                            componentNames={componentNames}
                            totalPayout={r.total_payout || 0}
                            intentMatch={intentMatch}
                            compact
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-slate-400">
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
          <CardContent className="py-12 text-center text-slate-400">
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
                <p className="text-center text-slate-400 py-8">{t.noRuns}</p>
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
                        <TableCell className="text-sm text-slate-400">
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

export default function CalculatePage() {
  return (
    <RequireRole roles={['vl_admin', 'admin']}>
      <CalculatePageInner />
    </RequireRole>
  );
}
