'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useCurrency } from '@/contexts/tenant-context';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import { isVLAdmin } from '@/types/auth';
import { RequireRole } from '@/components/auth/RequireRole';
import {
  getCustomerLaunches,
  createCustomerLaunch,
  loadCustomerLaunch,
  type CustomerLaunch,
  type LaunchStep,
  type LaunchStage,
} from '@/lib/launch/customer-launch-flow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  ChevronRight,
  Plus,
  Rocket,
  Building2,
  FileText,
  Database,
  CheckSquare,
  Calculator,
  Eye,
  Play,
  AlertTriangle,
  RefreshCw,
  Scale,
  Upload,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// Bilingual labels
const labels = {
  'en-US': {
    title: 'Customer Launch Dashboard',
    subtitle: 'Onboard new customers through the launch pipeline',
    newLaunch: 'New Launch',
    activeLaunches: 'Active Launches',
    completedLaunches: 'Completed Launches',
    noLaunches: 'No launches yet',
    noLaunchesDesc: 'Create a new customer launch to get started',
    createLaunch: 'Create Launch',
    customerId: 'Customer ID',
    customerName: 'Customer Name',
    cancel: 'Cancel',
    create: 'Create',
    progress: 'Progress',
    stage: 'Stage',
    steps: 'Steps',
    viewDetails: 'View Details',
    lastUpdated: 'Last Updated',
    createdBy: 'Created By',
    goLiveDate: 'Go-Live Date',
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'You must be a VL Admin to access this page.',
    refreshing: 'Refreshing...',
    refresh: 'Refresh',
    // Step names
    stepTenantSetup: 'Tenant Setup',
    stepPlanConfig: 'Plan Configuration',
    stepDataImport: 'Data Import',
    stepValidation: 'Validation',
    stepTestCalc: 'Test Calculation',
    stepReview: 'Customer Review',
    stepGoLive: 'Go Live',
    // Stages
    stageNotStarted: 'Not Started',
    stageTenantSetup: 'Tenant Setup',
    stagePlanConfig: 'Plan Configuration',
    stageDataImport: 'Data Import',
    stageValidation: 'Validation',
    stageTestCalc: 'Test Calculation',
    stageReview: 'Review',
    stageGoLive: 'Go Live',
    stageCompleted: 'Completed',
    stageFailed: 'Failed',
    // Status
    statusPending: 'Pending',
    statusInProgress: 'In Progress',
    statusCompleted: 'Completed',
    statusFailed: 'Failed',
    statusSkipped: 'Skipped',
  },
  'es-MX': {
    title: 'Panel de Lanzamiento de Clientes',
    subtitle: 'Incorpore nuevos clientes a través del proceso de lanzamiento',
    newLaunch: 'Nuevo Lanzamiento',
    activeLaunches: 'Lanzamientos Activos',
    completedLaunches: 'Lanzamientos Completados',
    noLaunches: 'Sin lanzamientos aún',
    noLaunchesDesc: 'Cree un nuevo lanzamiento de cliente para comenzar',
    createLaunch: 'Crear Lanzamiento',
    customerId: 'ID del Cliente',
    customerName: 'Nombre del Cliente',
    cancel: 'Cancelar',
    create: 'Crear',
    progress: 'Progreso',
    stage: 'Etapa',
    steps: 'Pasos',
    viewDetails: 'Ver Detalles',
    lastUpdated: 'Última Actualización',
    createdBy: 'Creado Por',
    goLiveDate: 'Fecha de Lanzamiento',
    accessDenied: 'Acceso Denegado',
    accessDeniedDesc: 'Debe ser un VL Admin para acceder a esta página.',
    refreshing: 'Actualizando...',
    refresh: 'Actualizar',
    // Step names
    stepTenantSetup: 'Configuración del Inquilino',
    stepPlanConfig: 'Configuración del Plan',
    stepDataImport: 'Importación de Datos',
    stepValidation: 'Validación',
    stepTestCalc: 'Cálculo de Prueba',
    stepReview: 'Revisión del Cliente',
    stepGoLive: 'Puesta en Producción',
    // Stages
    stageNotStarted: 'No Iniciado',
    stageTenantSetup: 'Configuración del Inquilino',
    stagePlanConfig: 'Configuración del Plan',
    stageDataImport: 'Importación de Datos',
    stageValidation: 'Validación',
    stageTestCalc: 'Cálculo de Prueba',
    stageReview: 'Revisión',
    stageGoLive: 'Puesta en Producción',
    stageCompleted: 'Completado',
    stageFailed: 'Fallido',
    // Status
    statusPending: 'Pendiente',
    statusInProgress: 'En Progreso',
    statusCompleted: 'Completado',
    statusFailed: 'Fallido',
    statusSkipped: 'Omitido',
  },
};

const stepIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'tenant-setup': Building2,
  'plan-config': FileText,
  'data-import': Database,
  'validation': CheckSquare,
  'test-calc': Calculator,
  'review': Eye,
  'go-live': Rocket,
};

function getStageColor(stage: LaunchStage): string {
  switch (stage) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'not_started':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

function getStatusIcon(status: LaunchStep['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case 'in_progress':
      return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'skipped':
      return <Circle className="h-5 w-5 text-slate-300" />;
    default:
      return <Circle className="h-5 w-5 text-slate-300" />;
  }
}

function CustomerLaunchDashboardInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { format: fmt } = useCurrency();
  const [launches, setLaunches] = useState<CustomerLaunch[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newLaunch, setNewLaunch] = useState({ customerId: '', customerName: '' });
  const [selectedLaunch, setSelectedLaunch] = useState<CustomerLaunch | null>(null);

  // VL Admin always sees English, tenant users see tenant locale
  const { locale } = useAdminLocale();
  const t = labels[locale];

  // Check VL Admin access
  const hasAccess = user && isVLAdmin(user);

  // Load launches
  const loadLaunches = () => {
    setIsRefreshing(true);
    try {
      const allLaunches = getCustomerLaunches();
      setLaunches(allLaunches);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (hasAccess) {
      loadLaunches();
    }
  }, [hasAccess]);

  // Create new launch
  const handleCreate = () => {
    if (!user || !newLaunch.customerId || !newLaunch.customerName) return;

    const flow = createCustomerLaunch(
      newLaunch.customerId,
      newLaunch.customerName,
      user.name
    );

    setLaunches((prev) => [flow.getLaunch(), ...prev]);
    setNewLaunch({ customerId: '', customerName: '' });
    setIsCreateOpen(false);
  };

  // View launch details
  const handleViewDetails = (launch: CustomerLaunch) => {
    setSelectedLaunch(launch);
  };

  // Execute step
  const handleExecuteStep = async (launchId: string, stepId: string) => {
    const flow = loadCustomerLaunch(launchId);
    if (!flow) return;

    // For now, just start the step (actual execution would need more context)
    flow.startStep(stepId);
    loadLaunches();

    // Refresh selected launch
    const updatedFlow = loadCustomerLaunch(launchId);
    if (updatedFlow) {
      setSelectedLaunch(updatedFlow.getLaunch());
    }
  };

  // Get stage label
  const getStageLabel = (stage: LaunchStage): string => {
    const stageLabels: Record<LaunchStage, keyof typeof t> = {
      not_started: 'stageNotStarted',
      tenant_setup: 'stageTenantSetup',
      plan_configuration: 'stagePlanConfig',
      data_import: 'stageDataImport',
      validation: 'stageValidation',
      test_calculation: 'stageTestCalc',
      review: 'stageReview',
      go_live: 'stageGoLive',
      completed: 'stageCompleted',
      failed: 'stageFailed',
    };
    return t[stageLabels[stage]] as string;
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

  const activeLaunches = launches.filter((l) => l.stage !== 'completed' && l.stage !== 'failed');
  const completedLaunches = launches.filter((l) => l.stage === 'completed');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            {t.title}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLaunches}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
            {isRefreshing ? t.refreshing : t.refresh}
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t.newLaunch}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.createLaunch}</DialogTitle>
                <DialogDescription>
                  {locale === 'es-MX'
                    ? 'Ingrese los detalles del nuevo cliente para iniciar el proceso de lanzamiento.'
                    : 'Enter the new customer details to start the launch process.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="customerId">{t.customerId}</Label>
                  <Input
                    id="customerId"
                    value={newLaunch.customerId}
                    onChange={(e) =>
                      setNewLaunch((prev) => ({ ...prev, customerId: e.target.value }))
                    }
                    placeholder="CUST-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerName">{t.customerName}</Label>
                  <Input
                    id="customerName"
                    value={newLaunch.customerName}
                    onChange={(e) =>
                      setNewLaunch((prev) => ({ ...prev, customerName: e.target.value }))
                    }
                    placeholder="Acme Corporation"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    {t.cancel}
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!newLaunch.customerId || !newLaunch.customerName}
                  >
                    {t.create}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            {locale === 'es-MX' ? 'Proceso de Lanzamiento' : 'Launch Pipeline'}
          </CardTitle>
          <CardDescription>
            {locale === 'es-MX'
              ? '7 pasos secuenciales para el lanzamiento de clientes'
              : '7 sequential steps for customer go-live'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {[
              { id: 'tenant-setup', label: 'O1', name: t.stepTenantSetup },
              { id: 'plan-config', label: 'O2', name: t.stepPlanConfig },
              { id: 'data-import', label: 'O3', name: t.stepDataImport },
              { id: 'validation', label: 'O4', name: t.stepValidation },
              { id: 'test-calc', label: 'O5', name: t.stepTestCalc },
              { id: 'review', label: 'O6', name: t.stepReview },
              { id: 'go-live', label: 'O7', name: t.stepGoLive },
            ].map((step, index) => {
              const Icon = stepIcons[step.id];
              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                      <Icon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                    </div>
                    <span className="mt-2 text-xs font-medium text-slate-500">{step.label}</span>
                    <span className="text-[10px] text-slate-400 text-center max-w-[80px]">
                      {step.name}
                    </span>
                  </div>
                  {index < 6 && (
                    <ChevronRight className="h-5 w-5 text-slate-300 mx-2" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Tools */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/launch/plan-import">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Upload className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">
                    {locale === 'es-MX' ? 'Importar Plan' : 'Plan Import'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {locale === 'es-MX'
                      ? 'Subir y detectar estructura del plan'
                      : 'Upload and detect plan structure'}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/launch/calculate">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Calculator className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">
                    {locale === 'es-MX' ? 'Ejecutar Cálculos' : 'Run Calculations'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {locale === 'es-MX'
                      ? 'Calcular compensación para un período'
                      : 'Calculate compensation for a period'}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/launch/reconciliation">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <Scale className="h-6 w-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">
                    {locale === 'es-MX' ? 'Reconciliación' : 'Reconciliation'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {locale === 'es-MX'
                      ? 'Comparar con datos de benchmark'
                      : 'Compare against benchmark data'}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Active Launches */}
      <div>
        <h2 className="text-lg font-semibold text-slate-50 mb-4">
          {t.activeLaunches} ({activeLaunches.length})
        </h2>
        {activeLaunches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Rocket className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-slate-600 dark:text-slate-400">{t.noLaunches}</p>
              <p className="text-sm text-slate-500">{t.noLaunchesDesc}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeLaunches.map((launch) => (
              <Card key={launch.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{launch.customerName}</CardTitle>
                      <CardDescription>{launch.customerId}</CardDescription>
                    </div>
                    <Badge className={getStageColor(launch.stage)}>
                      {getStageLabel(launch.stage)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-500">{t.progress}</span>
                        <span className="font-medium">{launch.overallProgress}%</span>
                      </div>
                      <Progress value={launch.overallProgress} className="h-2" />
                    </div>

                    {/* Step indicators */}
                    <div className="flex items-center justify-between">
                      {launch.steps.map((step) => {
                        const StepIcon = stepIcons[step.id];
                        return (
                          <div
                            key={step.id}
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-full',
                              step.status === 'completed'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                : step.status === 'in_progress'
                                ? 'bg-blue-100 dark:bg-blue-900/30'
                                : step.status === 'failed'
                                ? 'bg-red-100 dark:bg-red-900/30'
                                : 'bg-slate-100 dark:bg-slate-800'
                            )}
                            title={step.name}
                          >
                            {step.status === 'completed' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : step.status === 'in_progress' ? (
                              <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                            ) : step.status === 'failed' ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <StepIcon className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-slate-500">
                        {t.createdBy}: {launch.createdBy}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(launch)}
                      >
                        {t.viewDetails}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Launches */}
      {completedLaunches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-50 mb-4">
            {t.completedLaunches} ({completedLaunches.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completedLaunches.map((launch) => (
              <Card key={launch.id} className="opacity-80">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{launch.customerName}</CardTitle>
                      <CardDescription>{launch.customerId}</CardDescription>
                    </div>
                    <Badge className={getStageColor(launch.stage)}>
                      {getStageLabel(launch.stage)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t.goLiveDate}:</span>
                      <span className="font-medium">
                        {launch.goLiveDate
                          ? new Date(launch.goLiveDate).toLocaleDateString()
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t.createdBy}:</span>
                      <span>{launch.createdBy}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Launch Details Dialog */}
      <Dialog open={!!selectedLaunch} onOpenChange={() => setSelectedLaunch(null)}>
        <DialogContent className="max-w-2xl">
          {selectedLaunch && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedLaunch.customerName}
                </DialogTitle>
                <DialogDescription>
                  {selectedLaunch.customerId} • {getStageLabel(selectedLaunch.stage)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{t.progress}</span>
                  <span className="text-sm font-medium">{selectedLaunch.overallProgress}%</span>
                </div>
                <Progress value={selectedLaunch.overallProgress} className="h-2" />

                <div className="space-y-2 pt-4">
                  <h3 className="font-medium">{t.steps}</h3>
                  {selectedLaunch.steps.map((step, index) => {
                    const canExecute =
                      step.status === 'pending' &&
                      (!step.dependsOn ||
                        step.dependsOn.every((depId) => {
                          const dep = selectedLaunch.steps.find((s) => s.id === depId);
                          return dep && (dep.status === 'completed' || dep.status === 'skipped');
                        }));

                    return (
                      <div
                        key={step.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border',
                          step.status === 'completed'
                            ? 'bg-emerald-900/10 border-emerald-800'
                            : step.status === 'in_progress'
                            ? 'bg-blue-900/10 border-blue-800'
                            : step.status === 'failed'
                            ? 'bg-red-900/10 border-red-800'
                            : 'bg-slate-800/50 border-slate-700'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(step.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{step.name}</span>
                              <span className="text-xs text-slate-400">O{index + 1}</span>
                            </div>
                            <p className="text-xs text-slate-500">{step.description}</p>
                            {step.result?.message && (
                              <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
                                {step.result.message}
                              </p>
                            )}
                          </div>
                        </div>
                        {canExecute && (
                          <Button
                            size="sm"
                            onClick={() => handleExecuteStep(selectedLaunch.id, step.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Start
                          </Button>
                        )}
                        {step.status === 'completed' && step.completedAt && (
                          <span className="text-xs text-slate-400">
                            {new Date(step.completedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Validation Results */}
                {selectedLaunch.validationResults && (
                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-2">
                      {locale === 'es-MX' ? 'Resultados de Validación' : 'Validation Results'}
                    </h3>
                    <div className="flex items-center gap-4 mb-2">
                      <Badge
                        className={
                          selectedLaunch.validationResults.isValid
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }
                      >
                        {selectedLaunch.validationResults.isValid
                          ? locale === 'es-MX'
                            ? 'Válido'
                            : 'Valid'
                          : locale === 'es-MX'
                          ? 'Inválido'
                          : 'Invalid'}
                      </Badge>
                      <span className="text-sm">
                        Score: {selectedLaunch.validationResults.score}%
                      </span>
                    </div>
                    {selectedLaunch.validationResults.blockers.length > 0 && (
                      <div className="text-sm text-red-600 dark:text-red-400">
                        <strong>Blockers:</strong>
                        <ul className="list-disc list-inside">
                          {selectedLaunch.validationResults.blockers.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Test Calculation Results */}
                {selectedLaunch.testCalculationResult && (
                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-2">
                      {locale === 'es-MX' ? 'Resultados del Cálculo de Prueba' : 'Test Calculation Results'}
                    </h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-slate-800 rounded-lg">
                        <p className="text-2xl font-bold text-slate-50">
                          {selectedLaunch.testCalculationResult.entitiesProcessed}
                        </p>
                        <p className="text-xs text-slate-500">
                          {locale === 'es-MX' ? 'Empleados' : 'Employees'}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-800 rounded-lg">
                        <p className="text-2xl font-bold text-emerald-600">
                          {fmt(selectedLaunch.testCalculationResult.totalPayout)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {locale === 'es-MX' ? 'Total' : 'Total Payout'}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-800 rounded-lg">
                        <p
                          className={cn(
                            'text-2xl font-bold',
                            selectedLaunch.testCalculationResult.errors > 0
                              ? 'text-red-600'
                              : 'text-emerald-600'
                          )}
                        >
                          {selectedLaunch.testCalculationResult.errors}
                        </p>
                        <p className="text-xs text-slate-500">
                          {locale === 'es-MX' ? 'Errores' : 'Errors'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CustomerLaunchDashboard() {
  return (
    <RequireRole roles={['vl_admin']}>
      <CustomerLaunchDashboardInner />
    </RequireRole>
  );
}
