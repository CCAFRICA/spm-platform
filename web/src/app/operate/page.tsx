'use client';

/**
 * Operate Workspace Landing Page
 *
 * The operations center for running the compensation cycle.
 * Shows current cycle status, pending actions, and quick access to cycle phases.
 */

import { useRouter } from 'next/navigation';
import { useCycleState, useQueue } from '@/contexts/navigation-context';
import { useTenant } from '@/contexts/tenant-context';
import { CYCLE_PHASE_LABELS } from '@/types/navigation';
import { getRouteForPhase } from '@/lib/navigation/cycle-service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  Calculator,
  GitCompare,
  CheckCircle,
  Wallet,
  AlertTriangle,
  ArrowRight,
  Activity,
  Database,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { CyclePhase } from '@/types/navigation';

const PHASE_ICONS: Record<CyclePhase, React.ComponentType<{ className?: string }>> = {
  import: Upload,
  calculate: Calculator,
  reconcile: GitCompare,
  approve: CheckCircle,
  pay: Wallet,
  closed: CheckCircle,
};

export default function OperatePage() {
  const router = useRouter();
  const { cycleState, nextAction, isSpanish } = useCycleState();
  const { items } = useQueue();
  const { currentTenant } = useTenant();

  const displaySpanish = isSpanish;
  const hasFinancial = currentTenant?.features?.financial === true;

  // Cycle phases to display
  const cyclePhases: CyclePhase[] = ['import', 'calculate', 'reconcile', 'approve', 'pay'];

  // Critical/high urgency items
  const urgentItems = items.filter(i => i.urgency === 'critical' || i.urgency === 'high');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {displaySpanish ? 'Centro de Operaciones' : 'Operations Center'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {displaySpanish
              ? 'Gestionar el ciclo de compensación actual'
              : 'Manage the current compensation cycle'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-700">
            {cycleState?.periodLabel || 'Loading...'}
          </p>
          <Badge variant={cycleState?.completionPercentage === 100 ? 'default' : 'secondary'}>
            {cycleState?.completionPercentage || 0}% {displaySpanish ? 'completo' : 'complete'}
          </Badge>
          {nextAction && (
            <p className="text-xs text-blue-600 mt-1 font-medium">
              {displaySpanish ? 'Siguiente' : 'Next'}: {nextAction}
            </p>
          )}
        </div>
      </div>

      {/* Cycle Progress */}
      <Card>
        <CardHeader>
          <CardTitle>{displaySpanish ? 'El Ciclo' : 'The Cycle'}</CardTitle>
          <CardDescription>
            {displaySpanish
              ? 'Progreso a través de las fases del ciclo de compensación'
              : 'Progress through the compensation cycle phases'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Progress bar */}
            <Progress value={cycleState?.completionPercentage || 0} className="h-2" />

            {/* Phase cards */}
            <div className="grid grid-cols-5 gap-4">
              {cyclePhases.map((phase) => {
                const Icon = PHASE_ICONS[phase];
                const status = cycleState?.phaseStatuses[phase];
                const isActive = cycleState?.currentPhase === phase;
                const isCompleted = status?.state === 'completed';

                return (
                  <button
                    key={phase}
                    onClick={() => router.push(getRouteForPhase(phase))}
                    className={`
                      relative p-4 rounded-lg border transition-all text-left
                      ${isActive ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : ''}
                      ${isCompleted ? 'border-green-500 bg-green-50' : 'border-slate-200'}
                      ${!isActive && !isCompleted ? 'hover:border-slate-300 hover:bg-slate-50' : ''}
                    `}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`
                        p-1.5 rounded-full
                        ${isCompleted ? 'bg-green-500 text-white' : ''}
                        ${isActive ? 'bg-blue-500 text-white' : ''}
                        ${!isActive && !isCompleted ? 'bg-slate-200 text-slate-500' : ''}
                      `}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {status?.actionCount && status.actionCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {status.actionCount}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm text-slate-900">
                      {displaySpanish
                        ? CYCLE_PHASE_LABELS[phase].es
                        : CYCLE_PHASE_LABELS[phase].en}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {displaySpanish ? status?.detailEs : status?.detail}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Urgent Actions */}
      {urgentItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              {displaySpanish ? 'Acciones Urgentes' : 'Urgent Actions'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {urgentItems.slice(0, 3).map(item => (
                <button
                  key={item.id}
                  onClick={() => router.push(item.route)}
                  className="w-full flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200 hover:bg-amber-50 transition-colors"
                >
                  <div className="text-left">
                    <p className="font-medium text-slate-900">
                      {displaySpanish ? item.titleEs : item.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {displaySpanish ? item.descriptionEs : item.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className={`grid gap-4 ${hasFinancial ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <Card className="hover:border-slate-300 transition-colors cursor-pointer" onClick={() => router.push('/operate/monitor/operations')}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {displaySpanish ? 'Operaciones Diarias' : 'Daily Operations'}
              </p>
              <p className="text-sm text-slate-500">
                {displaySpanish ? 'Ver estado del sistema' : 'View system status'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors cursor-pointer" onClick={() => router.push('/operate/monitor/readiness')}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Database className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {displaySpanish ? 'Preparacion de Datos' : 'Data Readiness'}
              </p>
              <p className="text-sm text-slate-500">
                {displaySpanish ? 'Verificar datos' : 'Check data status'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors cursor-pointer" onClick={() => router.push('/operate/monitor/quality')}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <ShieldCheck className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {displaySpanish ? 'Calidad de Datos' : 'Data Quality'}
              </p>
              <p className="text-sm text-slate-500">
                {displaySpanish ? 'Revisar problemas' : 'Review issues'}
              </p>
            </div>
          </CardContent>
        </Card>

        {hasFinancial && (
          <Card className="hover:border-orange-300 border-orange-200 transition-colors cursor-pointer" onClick={() => router.push('/financial')}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">
                  {displaySpanish ? 'Modulo Financiero' : 'Financial Module'}
                </p>
                <p className="text-sm text-slate-500">
                  {displaySpanish ? 'Datos POS y rendimiento' : 'POS data & performance'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
