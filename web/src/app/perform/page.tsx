'use client';

/**
 * Perform Workspace Landing Page
 *
 * OB-38 Phase 7: Persona-aware rendering
 *   VL Admin  -> "Performance Observatory" (aggregate view)
 *   Manager   -> "Team Performance" (team-centric view)
 *   Sales Rep -> "My Performance" (personal view)
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePulse, useNavigation } from '@/contexts/navigation-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { formatMetricValue, getTrendArrow, getTrendColor } from '@/lib/navigation/pulse-service';
import { getPeriodResults } from '@/lib/orchestration/calculation-orchestrator';
import {
  getLatestRun,
  getCalculationResults,
  getCalculationRuns,
} from '@/lib/calculation/results-storage';
import {
  loadCycle,
  canViewResults,
} from '@/lib/calculation/calculation-lifecycle-service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Wallet,
  Receipt,
  TrendingUp,
  Users,
  HelpCircle,
  ArrowRight,
  Trophy,
  Target,
  AlertCircle,
  BarChart3,
  Eye,
  Clock,
} from 'lucide-react';
import type { CalculationResult } from '@/types/compensation-plan';

function extractEmployeeId(email: string | undefined): string | null {
  if (!email) return null;
  const match = email.match(/^(\d+)@/);
  if (match) return match[1];
  const nameMatch = email.match(/^([^@]+)@/);
  return nameMatch ? nameMatch[1] : null;
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function PerformPage() {
  const router = useRouter();
  const { metrics, isSpanish } = usePulse();
  const { userRole } = useNavigation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { format } = useCurrency();

  const [myResult, setMyResult] = useState<CalculationResult | null>(null);
  const [allResults, setAllResults] = useState<CalculationResult[]>([]);
  const [hasResults, setHasResults] = useState(false);
  // OB-39 Phase 8: Lifecycle-gated visibility
  const [lifecycleGated, setLifecycleGated] = useState(false);

  const displaySpanish = isSpanish;
  const currency = currentTenant?.currency || 'USD';

  const isVLAdmin = userRole === 'vl_admin';
  const isManager = userRole === 'manager' || userRole === 'admin';
  const isSalesRep = userRole === 'sales_rep';

  // Fetch calculation results
  useEffect(() => {
    if (!currentTenant) return;

    const period = getCurrentPeriod();
    let results: CalculationResult[] = [];

    results = getPeriodResults(currentTenant.id, period);

    if (results.length === 0) {
      results = getPeriodResults(currentTenant.id, '');
    }

    if (results.length === 0) {
      const run = getLatestRun(currentTenant.id, period);
      if (run) {
        results = getCalculationResults(run.id);
      }
    }

    if (results.length === 0) {
      const allRuns = getCalculationRuns(currentTenant.id);
      if (allRuns.length > 0) {
        const latestRun = allRuns.sort(
          (a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime()
        )[0];
        results = getCalculationResults(latestRun.id);
      }
    }

    // OB-39 Phase 8: Check lifecycle state for visibility gating
    const role = isVLAdmin ? 'vl_admin' as const
      : isManager ? 'manager' as const
      : 'sales_rep' as const;
    const cycle = loadCycle(currentTenant.id, period);
    if (cycle && !canViewResults(cycle.state, role)) {
      setLifecycleGated(true);
      setAllResults([]);
      setHasResults(false);
      setMyResult(null);
      return;
    }
    setLifecycleGated(false);

    setAllResults(results);
    setHasResults(results.length > 0);

    const employeeId = extractEmployeeId(user?.email);
    if (employeeId && results.length > 0) {
      const result = results.find((r) => r.employeeId === employeeId);
      setMyResult(result || null);
    }
  }, [currentTenant, user, isVLAdmin, isManager]);

  // Derive aggregate/team stats
  const stats = useMemo(() => {
    if (allResults.length === 0) return null;

    const sorted = [...allResults].sort((a, b) =>
      (b.totalIncentive || 0) - (a.totalIncentive || 0)
    );

    const totalPayout = allResults.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);
    const avgPayout = totalPayout / allResults.length;

    // Store distribution
    const storeMap = new Map<string, { count: number; total: number }>();
    for (const r of allResults) {
      const storeId = r.storeId || 'unknown';
      const existing = storeMap.get(storeId) || { count: 0, total: 0 };
      existing.count++;
      existing.total += r.totalIncentive || 0;
      storeMap.set(storeId, existing);
    }

    return {
      totalPayout,
      avgPayout,
      employeeCount: allResults.length,
      topPerformer: sorted[0],
      bottomPerformer: sorted[sorted.length - 1],
      storeCount: storeMap.size,
      topStores: Array.from(storeMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([id, data]) => ({ storeId: id, ...data })),
    };
  }, [allResults]);

  // Persona-specific title
  const pageTitle = isVLAdmin
    ? (displaySpanish ? 'Observatorio de Rendimiento' : 'Performance Observatory')
    : isManager
    ? (displaySpanish ? 'Rendimiento del Equipo' : 'Team Performance')
    : (displaySpanish ? 'Mi Rendimiento' : 'My Performance');

  const pageSubtitle = isVLAdmin
    ? (displaySpanish ? 'Vista agregada de todas las operaciones' : 'Aggregate view across all operations')
    : isManager
    ? (displaySpanish
        ? `Hola, ${user?.name?.split(' ')[0] || 'Gerente'}`
        : `Welcome back, ${user?.name?.split(' ')[0] || 'Manager'}`)
    : (displaySpanish
        ? `Hola, ${user?.name?.split(' ')[0] || 'Usuario'}`
        : `Welcome back, ${user?.name?.split(' ')[0] || 'User'}`);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="text-sm text-slate-500 mt-1">{pageSubtitle}</p>
        </div>
        {!isVLAdmin && (
          <Button onClick={() => router.push('/perform/compensation')}>
            <Wallet className="h-4 w-4 mr-2" />
            {displaySpanish ? 'Ver Compensacion' : 'View Compensation'}
          </Button>
        )}
      </div>

      {/* OB-39/OB-40: Lifecycle gate banner */}
      {lifecycleGated && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                {displaySpanish
                  ? `Tu compensacion para ${getCurrentPeriod()} esta siendo procesada`
                  : `Your compensation for ${getCurrentPeriod()} is being processed`}
              </p>
              <p className="text-xs text-blue-600">
                {displaySpanish
                  ? 'Los resultados estaran disponibles despues de su publicacion.'
                  : 'Results will be available after posting.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.slice(0, 4).map(metric => (
          <Card key={metric.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-500">
                  {displaySpanish ? metric.labelEs : metric.label}
                </p>
                {metric.trend && (
                  <span className={`text-xs font-medium ${getTrendColor(metric.trend)}`}>
                    {getTrendArrow(metric.trend)}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {formatMetricValue(metric.value, metric.format, currency)}
              </p>
              {metric.trendValue && (
                <p className={`text-xs mt-1 ${getTrendColor(metric.trend)}`}>
                  {displaySpanish ? metric.trendValueEs : metric.trendValue}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ============================================================ */}
      {/* VL ADMIN: Performance Observatory */}
      {/* ============================================================ */}
      {isVLAdmin && (
        <>
          <div className="grid grid-cols-3 gap-6">
            {/* Aggregate Summary */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  {displaySpanish ? 'Resumen Agregado' : 'Aggregate Summary'}
                </CardTitle>
                <CardDescription>
                  {displaySpanish
                    ? 'Vista consolidada de todos los resultados de calculo'
                    : 'Consolidated view of all calculation results'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!stats ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                    <p className="text-sm text-blue-700">
                      {displaySpanish
                        ? 'Ejecute calculos para ver los resultados agregados.'
                        : 'Run calculations to see aggregate results.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600">
                        {displaySpanish ? 'Empleados' : 'Employees'}
                      </p>
                      <p className="text-xl font-bold text-blue-800">{stats.employeeCount}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">
                        {displaySpanish ? 'Pago Total' : 'Total Payout'}
                      </p>
                      <p className="text-xl font-bold text-green-800">{format(stats.totalPayout)}</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600">
                        {displaySpanish ? 'Promedio' : 'Average'}
                      </p>
                      <p className="text-xl font-bold text-purple-800">{format(stats.avgPayout)}</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">
                        {displaySpanish ? 'Tiendas' : 'Stores'}
                      </p>
                      <p className="text-xl font-bold text-amber-800">{stats.storeCount}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>{displaySpanish ? 'Acciones' : 'Actions'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/operate/calculate')}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {displaySpanish ? 'Ejecutar Calculos' : 'Run Calculations'}
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/operate/reconcile')}>
                  <Eye className="h-4 w-4 mr-2" />
                  {displaySpanish ? 'Reconciliar' : 'Reconcile'}
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/investigate/calculations')}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {displaySpanish ? 'Investigar' : 'Investigate'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Top Performers */}
          {stats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  {displaySpanish ? 'Destacados' : 'Highlights'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-emerald-50 rounded-lg">
                    <p className="text-sm text-emerald-600 mb-1">
                      {displaySpanish ? 'Mayor Rendimiento' : 'Top Performer'}
                    </p>
                    <p className="font-bold text-emerald-800">{stats.topPerformer?.employeeName || 'N/A'}</p>
                    <p className="text-sm text-emerald-600">{format(stats.topPerformer?.totalIncentive || 0)}</p>
                  </div>
                  {stats.topStores.length > 0 && (
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600 mb-1">
                        {displaySpanish ? 'Tienda Principal' : 'Top Store'}
                      </p>
                      <p className="font-bold text-blue-800">{stats.topStores[0].storeId}</p>
                      <p className="text-sm text-blue-600">
                        {stats.topStores[0].count} {displaySpanish ? 'empleados' : 'employees'} | {format(stats.topStores[0].total)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* MANAGER: Team-centric view */}
      {/* ============================================================ */}
      {isManager && (
        <>
          <div className="grid grid-cols-3 gap-6">
            {/* Team Summary */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  {displaySpanish ? 'Resumen del Equipo' : 'Team Summary'}
                </CardTitle>
                <CardDescription>
                  {displaySpanish
                    ? 'Resultados del equipo para este periodo'
                    : 'Team results for this period'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!stats ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                    <p className="text-sm text-blue-700">
                      {displaySpanish
                        ? 'Los datos del equipo estaran disponibles despues de ejecutar los calculos.'
                        : 'Team data will be available after running calculations.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-600">
                          {displaySpanish ? 'Miembros del Equipo' : 'Team Members'}
                        </p>
                        <p className="text-2xl font-bold text-blue-800 mt-1">{stats.employeeCount}</p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-sm text-green-600">
                          {displaySpanish ? 'Mejor Rendimiento' : 'Top Performer'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Trophy className="h-5 w-5 text-amber-500" />
                          <p className="font-bold text-green-800 truncate">
                            {stats.topPerformer?.employeeName?.split(' ')[0] || 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-600">
                          {displaySpanish ? 'Pago Total' : 'Total Payout'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Target className="h-5 w-5 text-purple-500" />
                          <p className="font-bold text-purple-800">{format(stats.totalPayout)}</p>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full mt-4" onClick={() => router.push('/perform/team')}>
                      {displaySpanish ? 'Ver Detalles del Equipo' : 'View Team Details'}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>{displaySpanish ? 'Acciones Rapidas' : 'Quick Actions'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/perform/team')}>
                  <Users className="h-4 w-4 mr-2" />
                  {displaySpanish ? 'Ver Equipo' : 'View Team'}
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/perform/trends')}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {displaySpanish ? 'Ver Tendencias' : 'View Trends'}
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/perform/compensation')}>
                  <Wallet className="h-4 w-4 mr-2" />
                  {displaySpanish ? 'Mi Compensacion' : 'My Compensation'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* SALES REP: Personal view */}
      {/* ============================================================ */}
      {isSalesRep && (
        <div className="grid grid-cols-3 gap-6">
          {/* Compensation Summary */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" />
                {displaySpanish ? 'Resumen de Compensacion' : 'Compensation Summary'}
              </CardTitle>
              <CardDescription>
                {displaySpanish
                  ? 'Tu progreso hacia los objetivos de este periodo'
                  : 'Your progress toward this period\'s targets'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasResults ? (
                <div className="text-center py-6">
                  <AlertCircle className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                  <p className="text-sm text-blue-700">
                    {displaySpanish
                      ? 'Los resultados de compensacion aun no estan disponibles para este periodo.'
                      : 'Compensation results are not yet available for this period.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myResult ? (
                    <>
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                        <div>
                          <p className="font-medium text-green-800">
                            {displaySpanish ? 'Ganancias Actuales' : 'Current Earnings'}
                          </p>
                          <p className="text-sm text-green-600">
                            {myResult.planName || (displaySpanish ? 'Este periodo' : 'This period')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-800">
                            {format(myResult.totalIncentive || 0)}
                          </p>
                        </div>
                      </div>
                      {myResult.components && myResult.components.length > 0 && (
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-slate-800">
                              {displaySpanish ? 'Componentes' : 'Components'}
                            </p>
                            <p className="text-sm text-slate-600">
                              {myResult.components.length} {displaySpanish ? 'activos' : 'active'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-800">
                              {myResult.components.length}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-lg text-center">
                      <p className="text-sm text-slate-600">
                        {displaySpanish
                          ? 'No se encontraron resultados para tu cuenta.'
                          : 'No results found for your account.'}
                      </p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => router.push('/my-compensation')}>
                    {displaySpanish ? 'Ver Detalles Completos' : 'View Full Details'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>{displaySpanish ? 'Acciones Rapidas' : 'Quick Actions'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/perform/transactions')}>
                <Receipt className="h-4 w-4 mr-2" />
                {displaySpanish ? 'Mis Transacciones' : 'My Transactions'}
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/perform/trends')}>
                <TrendingUp className="h-4 w-4 mr-2" />
                {displaySpanish ? 'Ver Tendencias' : 'View Trends'}
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => router.push('/perform/inquiries/new')}>
                <HelpCircle className="h-4 w-4 mr-2" />
                {displaySpanish ? 'Enviar Consulta' : 'Submit Inquiry'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
