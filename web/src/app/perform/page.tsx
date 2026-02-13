'use client';

/**
 * Perform Workspace Landing Page
 *
 * OB-29 Phase 10: Wired to real calculation results
 * Shows personalized metrics, compensation summary, and quick actions.
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
} from 'lucide-react';
import type { CalculationResult } from '@/types/compensation-plan';

/**
 * Extract employee ID from user email
 */
function extractEmployeeId(email: string | undefined): string | null {
  if (!email) return null;
  const match = email.match(/^(\d+)@/);
  if (match) return match[1];
  const nameMatch = email.match(/^([^@]+)@/);
  return nameMatch ? nameMatch[1] : null;
}

/**
 * Get current period as YYYY-MM
 */
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

  const displaySpanish = isSpanish;
  const currency = currentTenant?.currency || 'USD';

  const isManager = userRole === 'manager' || userRole === 'admin' || userRole === 'vl_admin';

  // HF-018: Fetch real calculation results from both storage systems
  useEffect(() => {
    if (!currentTenant) return;

    const period = getCurrentPeriod();
    let results: CalculationResult[] = [];

    // Priority 1: Results storage (OB-29 chunked system — same as landing page)
    const run = getLatestRun(currentTenant.id, period);
    if (run) {
      results = getCalculationResults(run.id);
    }

    // Priority 2: Search all runs for this tenant (data may be from a different period)
    if (results.length === 0) {
      const allRuns = getCalculationRuns(currentTenant.id);
      if (allRuns.length > 0) {
        // Use most recent run regardless of period
        const latestRun = allRuns.sort(
          (a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime()
        )[0];
        results = getCalculationResults(latestRun.id);
      }
    }

    // Priority 3: Orchestrator storage (legacy vialuce_calculations keys)
    if (results.length === 0) {
      results = getPeriodResults(currentTenant.id, period);
    }

    setAllResults(results);
    setHasResults(results.length > 0);

    // Find current user's result
    const employeeId = extractEmployeeId(user?.email);
    if (employeeId && results.length > 0) {
      const result = results.find((r) => r.employeeId === employeeId);
      setMyResult(result || null);
    }
  }, [currentTenant, user]);

  // Derive team stats from real results
  const teamStats = useMemo(() => {
    if (allResults.length === 0) return null;

    // Sort by total incentive to find top performer
    const sorted = [...allResults].sort((a, b) =>
      (b.totalIncentive || 0) - (a.totalIncentive || 0)
    );

    const topPerformer = sorted[0];
    const totalPayout = allResults.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);
    const avgPayout = totalPayout / allResults.length;

    return {
      totalPayout,
      avgPayout,
      employeeCount: allResults.length,
      topPerformer,
    };
  }, [allResults]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {displaySpanish ? 'Mi Rendimiento' : 'My Performance'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {displaySpanish
              ? `Hola, ${user?.name?.split(' ')[0] || 'Usuario'}`
              : `Welcome back, ${user?.name?.split(' ')[0] || 'User'}`}
          </p>
        </div>
        <Button onClick={() => router.push('/perform/compensation')}>
          <Wallet className="h-4 w-4 mr-2" />
          {displaySpanish ? 'Ver Compensación' : 'View Compensation'}
        </Button>
      </div>

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

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Compensation Summary */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-600" />
              {displaySpanish ? 'Resumen de Compensación' : 'Compensation Summary'}
            </CardTitle>
            <CardDescription>
              {displaySpanish
                ? 'Tu progreso hacia los objetivos de este período'
                : 'Your progress toward this period\'s targets'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* OB-29: Show real data or empty state */}
            {!hasResults ? (
              <div className="text-center py-6">
                <AlertCircle className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {displaySpanish
                    ? 'Los resultados de compensación aún no están disponibles para este período.'
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
                          {myResult.planName || (displaySpanish ? 'Este período' : 'This period')}
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
            <CardTitle>{displaySpanish ? 'Acciones Rápidas' : 'Quick Actions'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/perform/transactions')}
            >
              <Receipt className="h-4 w-4 mr-2" />
              {displaySpanish ? 'Mis Transacciones' : 'My Transactions'}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/perform/trends')}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              {displaySpanish ? 'Ver Tendencias' : 'View Trends'}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/perform/inquiries/new')}
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              {displaySpanish ? 'Enviar Consulta' : 'Submit Inquiry'}
            </Button>
            {isManager && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push('/perform/team')}
              >
                <Users className="h-4 w-4 mr-2" />
                {displaySpanish ? 'Ver Equipo' : 'View Team'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manager Team Section - OB-29: Wired to real data */}
      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {displaySpanish ? 'Rendimiento del Equipo' : 'Team Performance'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!teamStats ? (
              <div className="text-center py-6">
                <AlertCircle className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {displaySpanish
                    ? 'Los datos del equipo estarán disponibles después de ejecutar los cálculos.'
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
                    <p className="text-2xl font-bold text-blue-800 mt-1">{teamStats.employeeCount}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600">
                      {displaySpanish ? 'Mejor Rendimiento' : 'Top Performer'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Trophy className="h-5 w-5 text-amber-500" />
                      <p className="font-bold text-green-800 truncate">
                        {teamStats.topPerformer?.employeeName?.split(' ')[0] || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-purple-600">
                      {displaySpanish ? 'Pago Total' : 'Total Payout'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Target className="h-5 w-5 text-purple-500" />
                      <p className="font-bold text-purple-800">{format(teamStats.totalPayout)}</p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => router.push('/perform/team')}
                >
                  {displaySpanish ? 'Ver Detalles del Equipo' : 'View Team Details'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
