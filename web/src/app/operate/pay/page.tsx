'use client';

/**
 * Operate > Pay - Payroll Overview
 *
 * Shows payroll status and finalization for the current cycle.
 * Reads from Supabase calculation_batches and calculation_results.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCycleState } from '@/contexts/navigation-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { getStateLabel, getStateColor } from '@/lib/calculation/lifecycle-utils';
import {
  listCalculationBatches,
  getCalculationResults,
} from '@/lib/supabase/calculation-service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Wallet, Calendar, CheckCircle, Clock, Users,
  DollarSign, FileText, ArrowRight, Scale,
} from 'lucide-react';

interface BatchInfo {
  id: string;
  lifecycle_state: string;
  period_id: string;
  entity_count: number;
  summary: Record<string, unknown> | null;
}

export default function PayPage() {
  const router = useRouter();
  const { cycleState, isSpanish } = useCycleState();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();

  const displaySpanish = isSpanish;

  const [latestBatch, setLatestBatch] = useState<BatchInfo | null>(null);
  const [entityCount, setEntityCount] = useState(0);
  const [totalPayout, setTotalPayout] = useState(0);
  const [componentCount, setComponentCount] = useState(0);

  // Load latest batch from Supabase
  useEffect(() => {
    if (!currentTenant) return;

    const loadData = async () => {
      try {
        const approvedStates = ['APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED'];
        const batches = await listCalculationBatches(currentTenant.id);
        const batch = batches.find(b => approvedStates.includes(b.lifecycle_state)) || batches[0] || null;

        if (batch) {
          setLatestBatch({
            id: batch.id,
            lifecycle_state: batch.lifecycle_state,
            period_id: batch.period_id,
            entity_count: batch.entity_count || 0,
            summary: batch.summary as Record<string, unknown> | null,
          });

          // Try to get result details
          const results = await getCalculationResults(currentTenant.id, batch.id);
          if (results.length > 0) {
            setEntityCount(results.length);
            setTotalPayout(results.reduce((sum, r) => sum + (r.total_payout || 0), 0));
            // Count unique components across results
            const compSet = new Set<string>();
            for (const r of results) {
              const comps = r.components;
              if (Array.isArray(comps)) {
                for (const c of comps) {
                  if (c && typeof c === 'object' && 'componentName' in c) {
                    compSet.add(String(c.componentName));
                  }
                }
              }
            }
            setComponentCount(compSet.size);
          } else {
            setEntityCount(batch.entity_count || 0);
          }
        }
      } catch (err) {
        console.warn('[Pay] Failed to load batches:', err);
      }
    };

    loadData();
  }, [currentTenant]);

  const payStatus = cycleState?.phaseStatuses.pay;
  const approveStatus = cycleState?.phaseStatuses.approve;
  const pendingApprovals = approveStatus?.actionCount || 0;
  const isReadyForPay = approveStatus?.state === 'completed';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            {displaySpanish ? 'Nomina' : 'Outcomes'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {displaySpanish
              ? 'Finalizar y procesar la nomina del periodo'
              : 'Finalize and process period outcomes'}
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
            {displaySpanish ? 'Estado de Nomina' : 'Outcome Status'}
          </CardTitle>
          <CardDescription>
            {cycleState?.periodLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Approval Gate */}
          {!isReadyForPay && (
            <div className="p-4 bg-amber-900/30 border border-amber-800 rounded-lg">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-300">
                    {displaySpanish ? 'Aprobaciones Pendientes' : 'Pending Approvals'}
                  </p>
                  <p className="text-sm text-amber-600">
                    {displaySpanish
                      ? `${pendingApprovals} aprobaciones deben completarse antes de procesar la nomina`
                      : `${pendingApprovals} approvals must be completed before processing outcomes`}
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
            <div className="p-4 bg-green-900/30 border border-green-800 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-300">
                    {displaySpanish ? 'Listo para Procesar' : 'Ready to Process'}
                  </p>
                  <p className="text-sm text-green-600">
                    {displaySpanish
                      ? 'Todas las aprobaciones completadas. Puede finalizar la nomina.'
                      : 'All approvals completed. You can finalize outcomes.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Lifecycle state indicator */}
          {latestBatch && (
            <div className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg">
              <Scale className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-600">
                {displaySpanish ? 'Estado del Ciclo' : 'Cycle State'}:
              </span>
              <Badge className={getStateColor(latestBatch.lifecycle_state)}>
                {getStateLabel(latestBatch.lifecycle_state)}
              </Badge>
              <span className="text-xs text-slate-400">{latestBatch.period_id}</span>
            </div>
          )}

          {/* Payroll Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-zinc-900/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{entityCount}</p>
                    <p className="text-sm text-slate-500">
                      {displaySpanish ? 'Entidades' : 'Entities'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{formatCurrency(totalPayout)}</p>
                    <p className="text-sm text-slate-500">
                      {displaySpanish ? 'Total Nomina' : 'Total Outcome'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50">
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
        <Card
          className="cursor-pointer hover:bg-zinc-800/50 transition-colors"
          onClick={() => router.push('/admin/launch/calculate')}
        >
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-900/30 rounded-lg">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-zinc-100">
                {displaySpanish ? 'Cierre de Periodo' : 'Period Close'}
              </p>
              <p className="text-sm text-slate-400">
                {displaySpanish ? 'Calcular y cerrar periodo' : 'Calculate and close period'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-zinc-800/50 transition-colors"
          onClick={() => router.push('/govern/calculation-approvals')}
        >
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-900/30 rounded-lg">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-zinc-100">
                {displaySpanish ? 'Aprobaciones' : 'Approvals'}
              </p>
              <p className="text-sm text-slate-400">
                {displaySpanish ? 'Revisar aprobaciones pendientes' : 'Review pending approvals'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
