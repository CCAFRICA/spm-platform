'use client';

/**
 * Operate > Pay - Payroll Overview
 *
 * Shows payroll status and finalization for the current cycle.
 * Re-exports the operations payroll page with workspace context.
 */

import { useRouter } from 'next/navigation';
import { useCycleState } from '@/contexts/navigation-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import {
  listCycles,
  getStateLabel,
  getStateColor,
} from '@/lib/calculation/calculation-lifecycle-service';
import { getLatestRun, getCalculationResults } from '@/lib/calculation/results-storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Wallet,
  Calendar,
  CheckCircle,
  Clock,
  Users,
  DollarSign,
  FileText,
  ArrowRight,
  Scale,
} from 'lucide-react';

export default function PayPage() {
  const router = useRouter();
  const { cycleState, isSpanish } = useCycleState();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();

  const displaySpanish = isSpanish;

  // OB-41 Phase 7: Get latest APPROVED+ lifecycle cycle for payroll data
  const approvedStates = ['APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED'];
  const allCycles = currentTenant ? listCycles(currentTenant.id) : [];
  const latestCycle = allCycles.find(c => approvedStates.includes(c.state)) || allCycles[0] || null;
  const snapshot = latestCycle?.officialSnapshot;

  // Fallback: if no snapshot, try to derive from latest calculation run
  const fallbackData = (() => {
    if (snapshot) return null;
    if (!currentTenant) return null;
    const period = latestCycle?.period;
    const run = period ? getLatestRun(currentTenant.id, period) : null;
    if (!run) return null;
    const results = getCalculationResults(run.id);
    if (results.length === 0) return null;
    const totalPayout = results.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);
    const componentSet = new Set<string>();
    for (const r of results) {
      for (const c of r.components || []) {
        componentSet.add(c.componentName || c.componentId);
      }
    }
    return { employeeCount: results.length, totalPayout, componentCount: componentSet.size };
  })();

  const employeeCount = snapshot?.employeeCount || fallbackData?.employeeCount || 0;
  const totalPayout = snapshot?.totalPayout || fallbackData?.totalPayout || 0;
  const componentCount = snapshot ? Object.keys(snapshot.componentTotals).length : fallbackData?.componentCount || 0;

  const payStatus = cycleState?.phaseStatuses.pay;
  const approveStatus = cycleState?.phaseStatuses.approve;
  const pendingApprovals = approveStatus?.actionCount || 0;
  const isReadyForPay = approveStatus?.state === 'completed';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {displaySpanish ? 'Nómina' : 'Payroll'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {displaySpanish
              ? 'Finalizar y procesar la nómina del período'
              : 'Finalize and process period payroll'}
          </p>
        </div>
        <Badge variant={payStatus?.state === 'completed' ? 'default' : 'secondary'}>
          {payStatus?.state === 'completed'
            ? (displaySpanish ? 'Finalizado' : 'Finalized')
            : (displaySpanish ? 'Pendiente' : 'Pending')}
        </Badge>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-purple-600" />
            {displaySpanish ? 'Estado de Nómina' : 'Payroll Status'}
          </CardTitle>
          <CardDescription>
            {cycleState?.periodLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Approval Gate */}
          {!isReadyForPay && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {displaySpanish ? 'Aprobaciones Pendientes' : 'Pending Approvals'}
                  </p>
                  <p className="text-sm text-amber-600">
                    {displaySpanish
                      ? `${pendingApprovals} aprobaciones deben completarse antes de procesar la nómina`
                      : `${pendingApprovals} approvals must be completed before processing payroll`}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => router.push('/operate/approve')}
              >
                {displaySpanish ? 'Ver Aprobaciones' : 'View Approvals'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Ready for Pay */}
          {isReadyForPay && payStatus?.state !== 'completed' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    {displaySpanish ? 'Listo para Procesar' : 'Ready to Process'}
                  </p>
                  <p className="text-sm text-green-600">
                    {displaySpanish
                      ? 'Todas las aprobaciones completadas. Puede finalizar la nómina.'
                      : 'All approvals completed. You can finalize payroll.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* OB-39: Lifecycle state indicator */}
          {latestCycle && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Scale className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-600">
                {displaySpanish ? 'Estado del Ciclo' : 'Cycle State'}:
              </span>
              <Badge className={getStateColor(latestCycle.state)}>
                {getStateLabel(latestCycle.state)}
              </Badge>
              <span className="text-xs text-slate-400">{latestCycle.period}</span>
            </div>
          )}

          {/* Payroll Summary - wired to real snapshot data */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-slate-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{employeeCount}</p>
                    <p className="text-sm text-slate-500">
                      {displaySpanish ? 'Empleados' : 'Employees'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{formatCurrency(totalPayout)}</p>
                    <p className="text-sm text-slate-500">
                      {displaySpanish ? 'Total Nómina' : 'Total Payroll'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold">{componentCount}</p>
                    <p className="text-sm text-slate-500">
                      {displaySpanish ? 'Componentes' : 'Components'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-500">
                {displaySpanish ? 'Progreso del Ciclo' : 'Cycle Progress'}
              </span>
              <span className="font-medium">{cycleState?.completionPercentage || 0}%</span>
            </div>
            <Progress value={cycleState?.completionPercentage || 0} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="opacity-60">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {displaySpanish ? 'Calendario de Nómina' : 'Payroll Calendar'}
              </p>
              <p className="text-sm text-slate-400">
                {displaySpanish ? 'Próximamente' : 'Coming Soon'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {displaySpanish ? 'Historial de Pagos' : 'Payment History'}
              </p>
              <p className="text-sm text-slate-400">
                {displaySpanish ? 'Próximamente' : 'Coming Soon'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
