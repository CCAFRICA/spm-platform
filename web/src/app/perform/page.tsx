'use client';

/**
 * Perform Workspace Landing Page
 *
 * The performance and compensation view for all users.
 * Shows personalized metrics, compensation summary, and quick actions.
 */

import { useRouter } from 'next/navigation';
import { usePulse, useNavigation } from '@/contexts/navigation-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import { formatMetricValue, getTrendArrow, getTrendColor } from '@/lib/navigation/pulse-service';
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
} from 'lucide-react';

export default function PerformPage() {
  const router = useRouter();
  const { metrics, isSpanish } = usePulse();
  const { userRole } = useNavigation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  const userIsCCAdmin = user && isCCAdmin(user);
  const displaySpanish = userIsCCAdmin ? false : isSpanish;
  const currency = currentTenant?.currency || 'USD';

  const isManager = userRole === 'manager' || userRole === 'admin' || userRole === 'cc_admin';

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
            <div className="space-y-4">
              {/* Progress bars would go here - placeholder for now */}
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div>
                  <p className="font-medium text-green-800">
                    {displaySpanish ? 'Cumplimiento de Meta' : 'Goal Attainment'}
                  </p>
                  <p className="text-sm text-green-600">
                    {displaySpanish ? '78% de la meta mensual' : '78% of monthly target'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-800">78%</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-800">
                    {displaySpanish ? 'Ganancias Actuales' : 'Current Earnings'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {displaySpanish ? 'Este período' : 'This period'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-800">
                    {currency === 'MXN' ? '$45,680' : '$3,240'}
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => router.push('/perform/compensation')}>
                {displaySpanish ? 'Ver Detalles Completos' : 'View Full Details'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
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

      {/* Manager Team Section */}
      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {displaySpanish ? 'Rendimiento del Equipo' : 'Team Performance'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">
                  {displaySpanish ? 'Cumplimiento del Equipo' : 'Team Attainment'}
                </p>
                <p className="text-2xl font-bold text-blue-800 mt-1">82%</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600">
                  {displaySpanish ? 'Mejor Rendimiento' : 'Top Performer'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <p className="font-bold text-green-800">Sarah C.</p>
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-purple-600">
                  {displaySpanish ? 'Hacia la Meta' : 'Toward Target'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Target className="h-5 w-5 text-purple-500" />
                  <p className="font-bold text-purple-800">+$24K</p>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
