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
  activateRuleSetAdditive,
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
  activePlans: Array<{ id: string; name: string }>;
  draftPlans: Array<{ id: string; name: string }>;
}

// OB-125: Plan readiness — tells user what's ready and what's missing
interface PlanReadiness {
  planId: string;
  planName: string;
  entityCount: number;
  hasBindings: boolean;
  dataRowCount: number;
  lastBatchDate: string | null;
  lastTotal: number | null;
}

// OB-125: Inline error — replaces browser alert()
interface PageError {
  title: string;
  message: string;
  action?: string;
}

function CalculatePageInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [planStatus, setPlanStatus] = useState<RuleSetStatus>({
    hasPlans: false, hasActivePlan: false, activePlanName: null,
    activeRuleSetId: null, activePlans: [], draftPlans: [],
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
  const [wiringReady, setWiringReady] = useState<boolean | null>(null); // null = loading
  const [isWiring, setIsWiring] = useState(false);
  const [wiringReport, setWiringReport] = useState<Record<string, unknown> | null>(null);
  const [planReadiness, setPlanReadiness] = useState<PlanReadiness[]>([]); // OB-125: F-47
  const [pageError, setPageError] = useState<PageError | null>(null); // OB-125: F-44

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
        // Load rule sets (OB-103: support multiple active plans)
        const ruleSets = await getRuleSets(currentTenant.id);
        const activeRSList = ruleSets.filter(rs => rs.status === 'active');
        const firstActive = activeRSList[0] || null;
        const draftRS = ruleSets
          .filter(rs => rs.status === 'draft')
          .map(rs => ({ id: rs.id, name: rs.name }));

        setPlanStatus({
          hasPlans: ruleSets.length > 0,
          hasActivePlan: activeRSList.length > 0,
          activePlanName: activeRSList.length > 1
            ? `${activeRSList.length} plans active`
            : firstActive?.name || null,
          activeRuleSetId: firstActive?.id || null,
          activePlans: activeRSList.map(rs => ({ id: rs.id, name: rs.name })),
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

        // OB-123: Check wiring readiness
        // If there are already calculation batches, wiring was done previously
        if (batches.length > 0) {
          setWiringReady(true);
        } else if (ruleSets.length > 0) {
          // Plans exist but no calculations yet — check if assignments exist
          try {
            const resp = await fetch(`/api/rule-set-assignments?tenantId=${currentTenant.id}`);
            const assignData = await resp.json();
            setWiringReady((assignData.assignments || []).length > 0);
          } catch {
            setWiringReady(false);
          }
        } else {
          setWiringReady(true); // No plans = nothing to wire
        }

        // OB-125: Fetch plan readiness for each active plan
        if (activeRSList.length > 0) {
          try {
            const resp = await fetch(`/api/plan-readiness?tenantId=${currentTenant.id}`);
            if (resp.ok) {
              const readinessData = await resp.json();
              setPlanReadiness(readinessData.plans || []);
            }
          } catch {
            // Non-critical — readiness cards just won't show
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
  // OB-125: F-48 — block advancement to OFFICIAL when total payout is $0
  const handleLifecycleTransition = async (targetState: CalculationState, details?: string) => {
    if (!activeBatch || !currentTenant || !user) return;

    // F-48: Prevent marking Official on $0 results
    if (targetState === 'OFFICIAL' && totalPayout === 0 && entityCount > 0) {
      setPageError({
        title: 'Cannot Mark Official',
        message: `Total payout is ${formatCurrency(0)} across ${entityCount} entities. This typically means data fields are not mapped to plan components.`,
        action: 'Review field mappings in the import page, or re-run the wire API to fix data bindings.',
      });
      return;
    }

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
        setPageError(null);
        // Refresh batch and batches list
        const batch = await getActiveBatch(currentTenant.id, selectedPeriod);
        setActiveBatch(batch);
        const batches = await listCalculationBatches(currentTenant.id);
        setRecentBatches(batches.slice(0, 10));
      } else {
        setPageError({ title: 'Transition Failed', message: `Cannot transition to ${targetState} from current state.` });
      }
    } catch (e) {
      setPageError({ title: 'Transition Error', message: e instanceof Error ? e.message : `Failed to transition to ${targetState}` });
    }
  };

  // Run calculation — OB-103: multi-plan support
  // HF-079: Call API route (service role) instead of client-side runCalculation()
  // Eliminates dual code path (AP-17) and ensures DELETE-before-INSERT works via service role
  const handleRunCalculation = async () => {
    if (!currentTenant || !selectedPeriod || !user) return;
    const plansToRun = planStatus.activePlans.length > 0
      ? planStatus.activePlans
      : planStatus.activeRuleSetId ? [{ id: planStatus.activeRuleSetId, name: planStatus.activePlanName || '' }] : [];

    if (plansToRun.length === 0) return;

    setIsCalculating(true);
    try {
      // Run each plan sequentially via API route (server-side, service role client)
      const errors: string[] = [];
      for (const plan of plansToRun) {
        console.log(`[Calculate] Running plan: ${plan.name} (${plan.id})`);
        const response = await fetch('/api/calculation/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: currentTenant.id,
            periodId: selectedPeriod,
            ruleSetId: plan.id,
          }),
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          errors.push(`${plan.name}: ${result.error || 'Unknown error'}`);
        }
      }

      if (errors.length > 0) {
        setPageError({ title: 'Calculation Errors', message: errors.join('; '), action: 'Check plan assignments and data bindings, then retry.' });
      } else {
        setPageError(null);
      }

      // Refresh batches and results
      const batches = await listCalculationBatches(currentTenant.id);
      setRecentBatches(batches.slice(0, 10));

      // Load the latest batch
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
      setPageError({ title: 'Calculation Failed', message: err instanceof Error ? err.message : 'Calculation failed', action: 'Check server logs and retry.' });
    } finally {
      setIsCalculating(false);
    }
  };

  // Activate a draft rule set (OB-103: additive — doesn't deactivate others)
  const handleActivateRuleSet = async (ruleSetId: string) => {
    if (!user || !currentTenant) return;
    setIsActivating(true);
    try {
      await activateRuleSetAdditive(currentTenant.id, ruleSetId);
      // Refresh
      const ruleSets = await getRuleSets(currentTenant.id);
      const activeRSList = ruleSets.filter(rs => rs.status === 'active');
      const firstActive = activeRSList[0] || null;
      setPlanStatus({
        hasPlans: ruleSets.length > 0,
        hasActivePlan: activeRSList.length > 0,
        activePlanName: activeRSList.length > 1
          ? `${activeRSList.length} plans active`
          : firstActive?.name || null,
        activeRuleSetId: firstActive?.id || null,
        activePlans: activeRSList.map(rs => ({ id: rs.id, name: rs.name })),
        draftPlans: ruleSets.filter(rs => rs.status === 'draft').map(rs => ({ id: rs.id, name: rs.name })),
      });
    } catch (error) {
      setPageError({ title: 'Activation Failed', message: error instanceof Error ? error.message : 'Failed to activate rule set' });
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

  // OB-123: Prepare for calculation — wire the data intelligence pipeline
  const handlePrepareForCalculation = async () => {
    if (!currentTenant) return;
    setIsWiring(true);
    setWiringReport(null);
    try {
      const response = await fetch('/api/intelligence/wire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: currentTenant.id }),
      });
      const result = await response.json();
      if (result.success) {
        setWiringReport(result.report);
        setWiringReady(true);
        setPageError(null);
        // Refresh rule sets to pick up activated plans
        const ruleSets = await getRuleSets(currentTenant.id);
        const activeRSList = ruleSets.filter(rs => rs.status === 'active');
        const firstActive = activeRSList[0] || null;
        setPlanStatus({
          hasPlans: ruleSets.length > 0,
          hasActivePlan: activeRSList.length > 0,
          activePlanName: activeRSList.length > 1
            ? `${activeRSList.length} plans active`
            : firstActive?.name || null,
          activeRuleSetId: firstActive?.id || null,
          activePlans: activeRSList.map(rs => ({ id: rs.id, name: rs.name })),
          draftPlans: ruleSets.filter(rs => rs.status === 'draft').map(rs => ({ id: rs.id, name: rs.name })),
        });
      } else {
        setPageError({ title: 'Wiring Failed', message: result.error || 'Failed to wire data pipeline', action: 'Check that plans and data are imported correctly.' });
      }
    } catch (err) {
      setPageError({ title: 'Wiring Error', message: err instanceof Error ? err.message : 'Wiring failed' });
    } finally {
      setIsWiring(false);
    }
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
                {locale === 'es-MX' ? 'Planes Activos' : 'Active Plans'}:
              </span>
              {planStatus.activePlans.length <= 1 ? (
                <span>{planStatus.activePlanName}</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {planStatus.activePlans.map(p => (
                    <Badge key={p.id} variant="secondary" className="bg-emerald-900/50 text-emerald-300 border-emerald-600">
                      {p.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OB-123: Prepare for Calculation — wiring needed */}
      {wiringReady === false && planStatus.hasPlans && (
        <Card className="border-amber-500/50 bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              {locale === 'es-MX' ? 'Preparación Requerida' : 'Preparation Required'}
            </CardTitle>
            <CardDescription className="text-amber-300/70">
              {locale === 'es-MX'
                ? 'Los datos importados necesitan ser conectados a los planes antes de calcular.'
                : 'Imported data needs to be wired to plans before calculation.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handlePrepareForCalculation}
              disabled={isWiring}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isWiring ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  {locale === 'es-MX' ? 'Preparando...' : 'Preparing...'}
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4 mr-2" />
                  {locale === 'es-MX' ? 'Preparar para Cálculo' : 'Prepare for Calculation'}
                </>
              )}
            </Button>
            {wiringReport && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-sm text-emerald-300">
                <p className="font-medium mb-1">Wiring Complete</p>
                <ul className="space-y-0.5 text-xs text-emerald-400/80">
                  {(wiringReport.steps as Array<{ step: string; detail: string }>)?.map((s, i) => (
                    <li key={i}>{s.step}: {s.detail}</li>
                  ))}
                </ul>
              </div>
            )}
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
                  {planStatus.activePlans.length > 1
                    ? (locale === 'es-MX' ? `Calcular ${planStatus.activePlans.length} Planes` : `Calculate All ${planStatus.activePlans.length} Plans`)
                    : (locale === 'es-MX' ? 'Ejecutar Calculo' : 'Run Calculation')}
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

      {/* OB-125: Inline error display — replaces browser alert() */}
      {pageError && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-400">{pageError.title}</p>
              <p className="text-sm text-red-300 mt-1">{pageError.message}</p>
              {pageError.action && (
                <p className="text-sm text-zinc-400 mt-2">{pageError.action}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200" onClick={() => setPageError(null)}>
              ×
            </Button>
          </div>
        </div>
      )}

      {/* OB-125: Plan readiness cards — contextual empty state (F-41, F-47) */}
      {!activeBatch && selectedPeriod && (
        <>
          {!planStatus.hasPlans ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-400">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium">
                  {locale === 'es-MX' ? 'Sin planes configurados' : 'No plans configured'}
                </p>
                <p className="text-sm mt-1">
                  {locale === 'es-MX'
                    ? 'Importe un documento de plan para comenzar.'
                    : 'Import a plan document to get started.'}
                </p>
                <Link href="/admin/launch/plan-import">
                  <Button variant="outline" size="sm" className="mt-4">
                    {locale === 'es-MX' ? 'Importar Plan →' : 'Import Plan →'}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : planReadiness.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                {locale === 'es-MX' ? 'Estado de Planes' : 'Plan Readiness'}
              </h3>
              {planReadiness.map(plan => {
                const isReady = plan.entityCount > 0 && plan.hasBindings && plan.dataRowCount > 0;
                return (
                  <Card key={plan.planId} className={isReady ? 'border-emerald-700/50' : 'border-amber-700/50'}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isReady ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-400" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{plan.planName}</p>
                            <p className="text-xs text-slate-400">
                              {plan.entityCount} {locale === 'es-MX' ? 'entidades' : 'entities'}
                              {' · '}
                              {plan.hasBindings
                                ? (locale === 'es-MX' ? 'Vinculaciones completas' : 'Bindings complete')
                                : (locale === 'es-MX' ? 'Sin vinculaciones' : 'No bindings')}
                              {' · '}
                              {plan.dataRowCount.toLocaleString()} {locale === 'es-MX' ? 'filas de datos' : 'data rows'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {plan.lastBatchDate ? (
                            <div className="text-xs text-slate-400">
                              <p>{locale === 'es-MX' ? 'Último cálculo' : 'Last calculated'}: {new Date(plan.lastBatchDate).toLocaleDateString()}</p>
                              {plan.lastTotal !== null && (
                                <p className="font-medium text-emerald-400">{formatCurrency(plan.lastTotal)}</p>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className={isReady ? 'text-emerald-400 border-emerald-600' : 'text-amber-400 border-amber-600'}>
                              {isReady
                                ? (locale === 'es-MX' ? 'Listo' : 'Ready')
                                : (locale === 'es-MX' ? 'Parcial' : 'Partial')}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {!isReady && (
                        <div className="mt-2 text-xs text-amber-400/70">
                          {plan.entityCount === 0 && (locale === 'es-MX' ? 'Sin entidades asignadas. ' : 'No entities assigned. ')}
                          {!plan.hasBindings && (locale === 'es-MX' ? 'Sin vinculaciones de datos. ' : 'No data bindings. ')}
                          {plan.dataRowCount === 0 && (locale === 'es-MX' ? 'Sin datos importados.' : 'No data imported.')}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-slate-400">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium">
                  {locale === 'es-MX' ? 'Sin cálculos para este período' : 'No calculations for this period'}
                </p>
                <p className="text-sm mt-1">
                  {locale === 'es-MX'
                    ? 'Seleccione un período y ejecute el cálculo.'
                    : 'Select a period and run calculation.'}
                </p>
              </CardContent>
            </Card>
          )}
        </>
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
                        <TableCell>{periodMap.get(batch.period_id) || batch.period_id.slice(0, 8)}</TableCell>
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
