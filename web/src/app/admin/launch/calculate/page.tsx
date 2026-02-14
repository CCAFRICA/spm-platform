'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import {
  runPeriodCalculation,
  previewPeriodCalculation,
  getPeriodRuns,
  type CalculationRun,
  type OrchestrationResult,
} from '@/lib/orchestration/calculation-orchestrator';
import { getPeriodProcessor } from '@/lib/payroll/period-processor';
import {
  getPlansWithStatus,
  activatePlan,
  ensureTenantPlans,
  resetToDefaultPlans,
} from '@/lib/compensation/plan-storage';
import type { CalculationStep } from '@/types/compensation-plan';
import { ReconciliationTracePanel } from '@/components/reconciliation/ReconciliationTracePanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Calculator,
  Play,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Users,
  DollarSign,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  Info,
  Scale,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  loadCycle,
  createCycle,
  transitionCycle,
  getStateLabel,
  getStateColor,
  type CalculationCycle,
  type OfficialSnapshot,
} from '@/lib/calculation/calculation-lifecycle-service';
import {
  detectAvailablePeriods,
  assessDataCompleteness,
  type DataCompleteness,
} from '@/lib/data-architecture/data-package';
import { createApprovalItem } from '@/lib/governance/approval-service';
import {
  buildCalculationSummary,
  saveSummary,
} from '@/lib/calculation/calculation-summary-service';

// Bilingual labels
const labels = {
  'en-US': {
    title: 'Run Calculations',
    subtitle: 'Run compensation calculations for a period',
    selectPeriod: 'Select Period',
    noPeriods: 'No periods available',
    createPeriod: 'Create a period first to run calculations',
    runPreview: 'Run Preview',
    runOfficial: 'Run Official Calculation',
    running: 'Running...',
    results: 'Results',
    summary: 'Summary',
    employeesProcessed: 'Employees Processed',
    totalCompensation: 'Total Compensation',
    averagePayout: 'Average Payout',
    warnings: 'Warnings',
    errors: 'Errors',
    employeeBreakdown: 'Employee Breakdown',
    employee: 'Employee',
    role: 'Role',
    store: 'Store',
    payout: 'Payout',
    components: 'Components',
    viewDetails: 'View Details',
    calculationChain: 'Calculation Chain',
    recentRuns: 'Recent Runs',
    noRuns: 'No calculation runs yet',
    runType: 'Type',
    status: 'Status',
    startedAt: 'Started',
    duration: 'Duration',
    back: 'Back',
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'You must be a VL Admin to access this page.',
    preview: 'Preview',
    official: 'Official',
    adjustment: 'Adjustment',
    pending: 'Pending',
    completed: 'Completed',
    completedWithErrors: 'Completed with Errors',
    failed: 'Failed',
  },
  'es-MX': {
    title: 'Ejecutar Cálculos',
    subtitle: 'Ejecutar cálculos de compensación para un período',
    selectPeriod: 'Seleccionar Período',
    noPeriods: 'No hay períodos disponibles',
    createPeriod: 'Cree un período primero para ejecutar cálculos',
    runPreview: 'Vista Previa',
    runOfficial: 'Cálculo Oficial',
    running: 'Ejecutando...',
    results: 'Resultados',
    summary: 'Resumen',
    employeesProcessed: 'Empleados Procesados',
    totalCompensation: 'Compensación Total',
    averagePayout: 'Pago Promedio',
    warnings: 'Advertencias',
    errors: 'Errores',
    employeeBreakdown: 'Desglose por Empleado',
    employee: 'Empleado',
    role: 'Rol',
    store: 'Tienda',
    payout: 'Pago',
    components: 'Componentes',
    viewDetails: 'Ver Detalles',
    calculationChain: 'Cadena de Cálculo',
    recentRuns: 'Ejecuciones Recientes',
    noRuns: 'Sin ejecuciones de cálculo aún',
    runType: 'Tipo',
    status: 'Estado',
    startedAt: 'Iniciado',
    duration: 'Duración',
    back: 'Volver',
    accessDenied: 'Acceso Denegado',
    accessDeniedDesc: 'Debe ser un VL Admin para acceder a esta página.',
    preview: 'Vista Previa',
    official: 'Oficial',
    adjustment: 'Ajuste',
    pending: 'Pendiente',
    completed: 'Completado',
    completedWithErrors: 'Completado con Errores',
    failed: 'Fallido',
  },
};

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface PlanStatus {
  hasPlans: boolean;
  hasActivePlan: boolean;
  activePlanName: string | null;
  draftPlans: Array<{ id: string; name: string }>;
}

export default function CalculatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [runType, setRunType] = useState<'preview' | 'official'>('preview');
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [recentRuns, setRecentRuns] = useState<CalculationRun[]>([]);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [planStatus, setPlanStatus] = useState<PlanStatus>({
    hasPlans: false,
    hasActivePlan: false,
    activePlanName: null,
    draftPlans: [],
  });
  const [isActivating, setIsActivating] = useState(false);
  // OB-20 Phase 10: Search functionality for results
  const [searchQuery, setSearchQuery] = useState('');
  // OB-34: Calculation lifecycle state
  const [cycle, setCycle] = useState<CalculationCycle | null>(null);
  // OB-34: Data package -- detected periods and completeness
  const [detectedPeriods, setDetectedPeriods] = useState<string[]>([]);
  const [dataCompleteness, setDataCompleteness] = useState<DataCompleteness[]>([]);

  // VL Admin always sees English, tenant users see tenant locale
  const { locale } = useAdminLocale();
  const t = labels[locale];

  // Check VL Admin access
  const hasAccess = user && isVLAdmin(user);

  // Load periods and check plans
  useEffect(() => {
    if (!currentTenant) return;

    // Ensure tenant has plans seeded
    ensureTenantPlans(currentTenant.id);

    // Check plan status
    const plansWithStatus = getPlansWithStatus(currentTenant.id);
    const activePlan = plansWithStatus.find((p) => p.isActive);
    const draftPlans = plansWithStatus
      .filter((p) => p.canActivate)
      .map((p) => ({ id: p.plan.id, name: p.plan.name }));

    setPlanStatus({
      hasPlans: plansWithStatus.length > 0,
      hasActivePlan: !!activePlan,
      activePlanName: activePlan?.plan.name || null,
      draftPlans,
    });

    // Get periods from period processor
    try {
      const processor = getPeriodProcessor(currentTenant.id);
      const allPeriods = processor.getPeriods();
      setPeriods(
        allPeriods.map((p) => ({
          id: p.id,
          name: p.name,
          startDate: p.startDate,
          endDate: p.endDate,
          status: p.status,
        }))
      );
    } catch {
      // Create demo periods if none exist
      const now = new Date();
      const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      setPeriods([
        {
          id: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          name: currentMonth,
          startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
          status: 'open',
        },
      ]);
    }

    // Load recent runs
    const runs = getPeriodRuns(currentTenant.id);
    setRecentRuns(runs.slice(0, 5));

    // OB-34: Detect periods from committed data
    const detected = detectAvailablePeriods(currentTenant.id);
    setDetectedPeriods(detected);
  }, [currentTenant]);

  // OB-34: Load lifecycle cycle and completeness when period changes
  useEffect(() => {
    if (!currentTenant || !selectedPeriod) return;
    const existing = loadCycle(currentTenant.id, selectedPeriod);
    setCycle(existing);
    // OB-34: Assess data completeness for selected period
    const plans = getPlansWithStatus(currentTenant.id);
    const active = plans.find(p => p.isActive);
    if (active) {
      const completeness = assessDataCompleteness(currentTenant.id, active.plan.id, selectedPeriod);
      setDataCompleteness(completeness);
    }
  }, [currentTenant, selectedPeriod]);

  // Run calculation
  const handleRunCalculation = async () => {
    if (!selectedPeriod || !currentTenant || !user) return;

    setIsRunning(true);
    setResult(null);
    setProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      let orchestrationResult: OrchestrationResult;

      if (runType === 'preview') {
        orchestrationResult = await previewPeriodCalculation(
          currentTenant.id,
          selectedPeriod,
          user.name
        );
      } else {
        orchestrationResult = await runPeriodCalculation(
          currentTenant.id,
          selectedPeriod,
          user.name
        );
      }

      setProgress(100);
      setResult(orchestrationResult);

      // OB-34: Update lifecycle state
      try {
        const planId = planStatus.activePlanName || 'active';
        let currentCycle = loadCycle(currentTenant.id, selectedPeriod);
        if (!currentCycle) {
          currentCycle = createCycle(currentTenant.id, planId, selectedPeriod);
        }
        if (runType === 'preview') {
          currentCycle = transitionCycle(currentCycle, 'PREVIEW', user.name, 'Preview calculation completed', {
            runId: orchestrationResult.run.id,
          });
        } else {
          // Official run: transition to PREVIEW first if needed, then to OFFICIAL
          if (currentCycle.state === 'DRAFT') {
            currentCycle = transitionCycle(currentCycle, 'PREVIEW', user.name, 'Preview before official');
          }
          const snapshot: OfficialSnapshot = {
            timestamp: new Date().toISOString(),
            runId: orchestrationResult.run.id,
            totalPayout: orchestrationResult.summary.totalPayout,
            employeeCount: orchestrationResult.summary.employeesProcessed,
            componentTotals: Object.fromEntries(
              Object.entries(orchestrationResult.summary.byPlan || {}).map(([k, v]) => [k, v.total])
            ),
            immutable: true,
          };
          currentCycle = transitionCycle(currentCycle, 'OFFICIAL', user.name, 'Official calculation completed', { snapshot });

          // Build and save calculation summary for Results Dashboard
          try {
            // Map CalculationResult[] to lightweight trace shape for summary builder
            const tracelike = orchestrationResult.results.map(r => ({
              employeeId: r.employeeId,
              employeeName: r.employeeName,
              storeId: r.storeId || '',
              variant: { variantName: r.variantName || 'Default' },
              totalIncentive: r.totalIncentive,
              components: r.components.map(c => ({
                componentId: c.componentId,
                componentName: c.componentName,
                outputValue: c.outputValue,
              })),
            }));
            const summary = buildCalculationSummary(
              tracelike as Parameters<typeof buildCalculationSummary>[0],
              orchestrationResult.run.id,
              currentTenant.id,
              selectedPeriod
            );
            saveSummary(summary);
          } catch (sumErr) {
            console.warn('[Summary] Failed to build summary (non-fatal):', sumErr);
          }
        }
        setCycle(currentCycle);
      } catch (lcError) {
        console.warn('[Lifecycle] State transition failed (non-fatal):', lcError);
      }

      // Refresh recent runs
      const runs = getPeriodRuns(currentTenant.id);
      setRecentRuns(runs.slice(0, 5));
    } catch (error) {
      console.error('Calculation error:', error);
    } finally {
      clearInterval(progressInterval);
      setIsRunning(false);
    }
  };

  // OB-34: Handle Submit for Approval
  const handleSubmitForApproval = () => {
    if (!cycle || !user || !currentTenant) return;
    try {
      const updated = transitionCycle(cycle, 'PENDING_APPROVAL', user.name, 'Submitted for approval');
      setCycle(updated);

      // Create approval item from official snapshot
      const snapshot = cycle.officialSnapshot;
      if (snapshot) {
        createApprovalItem(
          currentTenant.id,
          cycle.cycleId,
          cycle.period,
          user.name,
          {
            totalPayout: snapshot.totalPayout,
            employeeCount: snapshot.employeeCount,
            componentTotals: snapshot.componentTotals,
          }
        );
      }
    } catch (e) {
      console.error('Submit for approval failed:', e);
      alert(e instanceof Error ? e.message : 'Failed to submit for approval');
    }
  };

  // Activate a draft plan
  const handleActivatePlan = async (planId: string) => {
    if (!user || !currentTenant) return;

    setIsActivating(true);
    try {
      const activated = activatePlan(planId, user.name);
      if (activated) {
        // Refresh plan status
        const plansWithStatus = getPlansWithStatus(currentTenant.id);
        const activePlan = plansWithStatus.find((p) => p.isActive);
        const draftPlans = plansWithStatus
          .filter((p) => p.canActivate)
          .map((p) => ({ id: p.plan.id, name: p.plan.name }));

        setPlanStatus({
          hasPlans: plansWithStatus.length > 0,
          hasActivePlan: !!activePlan,
          activePlanName: activePlan?.plan.name || null,
          draftPlans,
        });
      }
    } catch (error) {
      console.error('Error activating plan:', error);
    } finally {
      setIsActivating(false);
    }
  };

  // Toggle employee expansion
  const toggleEmployee = (employeeId: string) => {
    setExpandedEmployee(expandedEmployee === employeeId ? null : employeeId);
  };

  // Get status badge
  // Derive display status from run data (accounts for error counts)
  const getDisplayStatus = (run: CalculationRun): 'completed' | 'completedWithErrors' | 'failed' | 'running' | 'pending' => {
    if (run.status === 'running') return 'running';
    if (run.status !== 'completed') return run.status as 'pending' | 'failed';

    // For completed runs, check error ratio
    if (run.errorCount > 0) {
      if (run.errorCount >= run.totalEmployees) {
        return 'failed'; // All employees errored
      }
      return 'completedWithErrors'; // Some succeeded, some failed
    }
    return 'completed';
  };

  const getStatusBadge = (run: CalculationRun) => {
    const displayStatus = getDisplayStatus(run);
    switch (displayStatus) {
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-800">{t.completed}</Badge>;
      case 'completedWithErrors':
        return <Badge className="bg-amber-100 text-amber-800">{t.completedWithErrors}</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">{t.failed}</Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800">{t.running}</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800">{t.pending}</Badge>;
    }
  };

  // Get run type badge
  const getRunTypeBadge = (type: CalculationRun['runType']) => {
    switch (type) {
      case 'official':
        return <Badge variant="default">{t.official}</Badge>;
      case 'adjustment':
        return <Badge variant="secondary">{t.adjustment}</Badge>;
      default:
        return <Badge variant="outline">{t.preview}</Badge>;
    }
  };

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
            <Button onClick={() => router.push('/')} className="w-full">
              Return to Dashboard
            </Button>
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
        <Link href="/admin/launch" className="hover:text-foreground">Launch</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">{t.title}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/launch')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            {t.title}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{t.subtitle}</p>
        </div>
      </div>

      {/* Plan Status */}
      {!planStatus.hasActivePlan && planStatus.draftPlans.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5" />
              {locale === 'es-MX' ? 'Plan Pendiente de Activacion' : 'Plan Pending Activation'}
            </CardTitle>
            <CardDescription className="text-amber-700 dark:text-amber-300">
              {locale === 'es-MX'
                ? 'Los siguientes planes estan en borrador. Active uno para ejecutar calculos.'
                : 'The following plans are in draft status. Activate one to run calculations.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {planStatus.draftPlans.map((plan) => (
                <Button
                  key={plan.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleActivatePlan(plan.id)}
                  disabled={isActivating}
                  className="bg-white dark:bg-slate-800"
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
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  {locale === 'es-MX' ? 'Plan Activo' : 'Active Plan'}:
                </span>
                <span>{planStatus.activePlanName}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const count = resetToDefaultPlans(currentTenant!.id);
                  if (count > 0) {
                    // Refresh plan status
                    const plansWithStatus = getPlansWithStatus(currentTenant!.id);
                    const activePlan = plansWithStatus.find((p) => p.isActive);
                    setPlanStatus({
                      hasPlans: plansWithStatus.length > 0,
                      hasActivePlan: !!activePlan,
                      activePlanName: activePlan?.plan.name || null,
                      draftPlans: plansWithStatus
                        .filter((p) => p.plan.status === 'draft')
                        .map((p) => ({ id: p.plan.id, name: p.plan.name })),
                    });
                    alert(`Reset ${count} plan(s) to validated defaults.`);
                  }
                }}
              >
                Reset to Default Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period Selection & Run */}
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
                  {periods.length === 0 ? (
                    <div className="px-2 py-4 text-center text-slate-500">
                      {t.noPeriods}
                    </div>
                  ) : (
                    periods.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.name} ({period.status})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRunType('preview');
                  handleRunCalculation();
                }}
                disabled={!selectedPeriod || isRunning || !planStatus.hasActivePlan}
              >
                <Eye className="h-4 w-4 mr-2" />
                {t.runPreview}
              </Button>
              <Button
                onClick={() => {
                  setRunType('official');
                  handleRunCalculation();
                }}
                disabled={!selectedPeriod || isRunning || !planStatus.hasActivePlan}
              >
                <Play className="h-4 w-4 mr-2" />
                {t.runOfficial}
              </Button>
            </div>
          </div>

          {/* Progress */}
          {isRunning && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-500">{t.running}</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          {/* OB-34: Detected periods from committed data */}
          {detectedPeriods.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">
                <Info className="h-4 w-4 inline mr-1" />
                Detected Periods from Committed Data:
              </p>
              <div className="flex flex-wrap gap-2">
                {detectedPeriods.map(p => (
                  <Badge
                    key={p}
                    variant={p === selectedPeriod ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setSelectedPeriod(p)}
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* OB-34: Data completeness per component */}
          {dataCompleteness.length > 0 && selectedPeriod && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Data Completeness for {selectedPeriod}:</p>
              <div className="grid gap-2 md:grid-cols-3">
                {dataCompleteness.map(dc => (
                  <div key={dc.componentId} className="flex items-center gap-2 text-sm">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      dc.coverage >= 0.8 ? 'bg-green-500' : dc.coverage > 0 ? 'bg-amber-500' : 'bg-red-400'
                    )} />
                    <span className="truncate" title={dc.componentName}>{dc.componentName}</span>
                    <span className="text-slate-400 ml-auto">{Math.round(dc.coverage * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OB-39: Lifecycle Action Bar */}
      {cycle && selectedPeriod && (
        <Card>
          <CardContent className="py-4 space-y-4">
            {/* State progress indicator */}
            <div className="flex items-center gap-1">
              {(['DRAFT', 'PREVIEW', 'OFFICIAL', 'PENDING_APPROVAL', 'APPROVED', 'PAID'] as const).map((state, idx, arr) => {
                const isCurrent = cycle.state === state;
                const isRejected = cycle.state === 'REJECTED' && state === 'PENDING_APPROVAL';
                const isPast = arr.indexOf(cycle.state === 'REJECTED' ? 'PREVIEW' : cycle.state) > idx;
                return (
                  <div key={state} className="flex items-center flex-1">
                    <div className={cn(
                      'flex items-center justify-center w-full py-1.5 px-2 text-[11px] font-medium rounded-md transition-colors',
                      isCurrent ? getStateColor(cycle.state) + ' ring-2 ring-offset-1 ring-blue-300' :
                      isRejected ? 'bg-red-100 text-red-700' :
                      isPast ? 'bg-slate-200 text-slate-600' :
                      'bg-slate-50 text-slate-400'
                    )}>
                      {getStateLabel(state)}
                    </div>
                    {idx < arr.length - 1 && (
                      <ArrowRight className={cn('h-3 w-3 mx-0.5 flex-shrink-0',
                        isPast ? 'text-slate-400' : 'text-slate-200'
                      )} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Current state info + actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-slate-500" />
                <Badge className={getStateColor(cycle.state)}>
                  {getStateLabel(cycle.state)}
                </Badge>
                {cycle.officialSnapshot && (
                  <span className="text-xs text-slate-500">
                    Official: {formatCurrency(cycle.officialSnapshot.totalPayout)} ({cycle.officialSnapshot.employeeCount} employees)
                  </span>
                )}
                {cycle.state === 'REJECTED' && cycle.rejectionReason && (
                  <span className="text-xs text-red-600">
                    Rejected: {cycle.rejectionReason}
                  </span>
                )}
                {cycle.state === 'APPROVED' && cycle.approvalComments && (
                  <span className="text-xs text-green-600">
                    {cycle.approvalComments}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {cycle.state === 'OFFICIAL' && (
                  <Button size="sm" onClick={handleSubmitForApproval}>
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Submit for Approval
                  </Button>
                )}
                {cycle.state === 'PENDING_APPROVAL' && (
                  <Badge className="bg-yellow-100 text-yellow-700">Awaiting Approver Action</Badge>
                )}
                {cycle.state === 'APPROVED' && (
                  <Badge className="bg-green-100 text-green-700">Results visible to all roles</Badge>
                )}
              </div>
            </div>

            {/* Audit trail (collapsible) */}
            {cycle.auditTrail.length > 1 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                  <ChevronRight className="h-3 w-3" />
                  {cycle.auditTrail.length} audit entries
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {[...cycle.auditTrail].reverse().map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="text-slate-400 w-32 flex-shrink-0">
                          {new Date(entry.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1">
                          {entry.toState}
                        </Badge>
                        <span className="truncate">{entry.details}</span>
                        <span className="text-slate-400 ml-auto flex-shrink-0">by {entry.actor}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.employeesProcessed}</p>
                    <p className="text-2xl font-bold">{result.summary.employeesProcessed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <DollarSign className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.totalCompensation}</p>
                    <p className="text-2xl font-bold">{formatCurrency(result.summary.totalPayout)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.averagePayout}</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(result.summary.employeesProcessed > 0
                        ? Math.round(result.summary.totalPayout / result.summary.employeesProcessed)
                        : 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'p-3 rounded-full',
                    result.run.errorCount > 0
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : 'bg-emerald-100 dark:bg-emerald-900/30'
                  )}>
                    {result.run.errorCount > 0 ? (
                      <XCircle className="h-6 w-6 text-red-600" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.errors}</p>
                    <p className="text-2xl font-bold">{result.run.errorCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Employee Breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t.employeeBreakdown}</CardTitle>
                  <CardDescription>
                    {result.results.length} {locale === 'es-MX' ? 'resultados' : 'results'}
                  </CardDescription>
                </div>
                {/* OB-20 Phase 10: Search input */}
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={locale === 'es-MX' ? 'Buscar empleado...' : 'Search employee...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>{t.employee}</TableHead>
                    <TableHead>{t.role}</TableHead>
                    <TableHead>{t.store}</TableHead>
                    <TableHead className="text-right">{t.payout}</TableHead>
                    <TableHead>{t.components}</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* OB-20 Phase 10: Filter results based on search query */}
                  {result.results
                    .filter((r) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        r.employeeName?.toLowerCase().includes(q) ||
                        r.employeeId?.toLowerCase().includes(q) ||
                        r.employeeRole?.toLowerCase().includes(q) ||
                        r.storeName?.toLowerCase().includes(q)
                      );
                    })
                    .map((employeeResult) => (
                    <Collapsible
                      key={employeeResult.employeeId}
                      open={expandedEmployee === employeeResult.employeeId}
                      onOpenChange={() => toggleEmployee(employeeResult.employeeId)}
                      asChild
                    >
                      <>
                        <TableRow className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                {expandedEmployee === employeeResult.employeeId ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="font-medium">
                            {employeeResult.employeeName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{employeeResult.employeeRole}</Badge>
                          </TableCell>
                          <TableCell>{employeeResult.storeName || '-'}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600">
                            {formatCurrency(employeeResult.totalIncentive)}
                          </TableCell>
                          <TableCell>
                            {employeeResult.components.length} {t.components.toLowerCase()}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/transactions/disputes?employeeId=${employeeResult.employeeId}&employeeName=${encodeURIComponent(employeeResult.employeeName)}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="outline" size="sm" className="text-xs">
                                Dispute
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-slate-50 dark:bg-slate-800/30">
                            <TableCell colSpan={7} className="p-0">
                              <div className="p-4 border-l-4 border-blue-500">
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                  <Info className="h-4 w-4" />
                                  {t.calculationChain}
                                </h4>
                                <div className="space-y-2">
                                  {employeeResult.components.map((step: CalculationStep, index: number) => (
                                    <div
                                      key={step.componentId}
                                      className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-medium">
                                          {index + 1}
                                        </span>
                                        <div>
                                          <p className="font-medium">{step.componentName}</p>
                                          <p className="text-sm text-slate-500">{step.calculation}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className={cn(
                                          'font-semibold',
                                          step.outputValue >= 0 ? 'text-emerald-600' : 'text-red-600'
                                        )}>
                                          {step.outputValue >= 0 ? '+' : ''}{formatCurrency(step.outputValue)}
                                        </p>
                                        <Badge variant="outline" className="text-xs">
                                          {step.componentType}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* Reconciliation Trace */}
                                <ReconciliationTracePanel
                                  tenantId={currentTenant?.id || ''}
                                  employeeId={employeeResult.employeeId}
                                  employeeName={employeeResult.employeeName}
                                  engineTotal={employeeResult.totalIncentive}
                                  formatCurrency={formatCurrency}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Errors */}
          {result.run.errors && result.run.errors.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  {t.errors}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.run.errors.map((error, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>{error.employeeId}:</strong> {error.error}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Next Steps */}
          <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-5 w-5" />
                {locale === 'es-MX' ? 'Próximos Pasos' : 'Next Steps'}
              </CardTitle>
              <CardDescription className="text-emerald-700 dark:text-emerald-300">
                {locale === 'es-MX'
                  ? 'El cálculo se completó. Elija qué hacer a continuación.'
                  : 'Calculation complete. Choose what to do next.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <Button
                  onClick={() => router.push('/operate/reconcile')}
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    {locale === 'es-MX' ? 'Conciliar Resultados' : 'Reconcile Results'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/investigate/calculations')}
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    {locale === 'es-MX' ? 'Ver Detalles de Cálculo' : 'View Calculation Details'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Recent Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t.recentRuns}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-center text-slate-500 py-8">{t.noRuns}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.runType}</TableHead>
                  <TableHead>{locale === 'es-MX' ? 'Período' : 'Period'}</TableHead>
                  <TableHead>{t.status}</TableHead>
                  <TableHead>{t.employeesProcessed}</TableHead>
                  <TableHead className="text-right">{t.totalCompensation}</TableHead>
                  <TableHead>{t.startedAt}</TableHead>
                  <TableHead>{t.duration}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{getRunTypeBadge(run.runType)}</TableCell>
                    <TableCell>{run.periodId}</TableCell>
                    <TableCell>{getStatusBadge(run)}</TableCell>
                    <TableCell>{run.processedEmployees}/{run.totalEmployees}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(run.totalPayout || 0)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {new Date(run.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
