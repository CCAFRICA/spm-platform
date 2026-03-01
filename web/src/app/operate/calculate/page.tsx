'use client';

// Calculate — Plan-centric calculation experience
// OB-130 Phase 4 — Zero domain vocabulary. Korean Test applies.
//
// Plan cards grid + results panel. Each plan shows readiness + single-plan calculate.
// Resolves CLT-126 F-126-08 (no single-plan recalculation) and F-126-09 (no plan filter).

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useOperate } from '@/contexts/operate-context';
import { isVLAdmin } from '@/types/auth';
import { RequireRole } from '@/components/auth/RequireRole';
import { OperateSelector } from '@/components/operate/OperateSelector';
import { PlanCard, type PlanReadiness } from '@/components/calculate/PlanCard';
import { PlanResults } from '@/components/calculate/PlanResults';
import { getCalculationResults } from '@/lib/supabase/calculation-service';
import type { Database } from '@/lib/supabase/database.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Calculator,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Play,
} from 'lucide-react';

type CalcResultRow = Database['public']['Tables']['calculation_results']['Row'];

function CalculatePageInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const {
    plans,
    periods,
    selectedPeriodId,
    selectPeriod,
    batches,
    refreshBatches,
    isLoading: contextLoading,
  } = useOperate();

  const [planReadiness, setPlanReadiness] = useState<PlanReadiness[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planResults, setPlanResults] = useState<CalcResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [isCalculatingAll, setIsCalculatingAll] = useState(false);
  const [calcAllError, setCalcAllError] = useState<string | null>(null);

  const hasAccess = user && (isVLAdmin(user) || user.role === 'admin');
  const tenantId = currentTenant?.id || '';
  const activePlans = plans.filter(p => p.status === 'active');

  // Load plan readiness
  useEffect(() => {
    if (!tenantId) {
      setPlanReadiness([]);
      setReadinessLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setReadinessLoading(true);
      try {
        const resp = await fetch(`/api/plan-readiness?tenantId=${tenantId}`);
        if (resp.ok && !cancelled) {
          const data = await resp.json();
          setPlanReadiness(data.plans || []);
        }
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Load results when a plan is selected
  useEffect(() => {
    if (!selectedPlanId || !tenantId || !selectedPeriodId) {
      setPlanResults([]);
      return;
    }

    let cancelled = false;

    const loadResults = async () => {
      setResultsLoading(true);
      try {
        // Find the batch for this plan + period
        const planBatch = batches.find(b => b.ruleSetId === selectedPlanId);
        if (planBatch) {
          const results = await getCalculationResults(tenantId, planBatch.id);
          if (!cancelled) setPlanResults(results);
        } else {
          if (!cancelled) setPlanResults([]);
        }
      } catch {
        if (!cancelled) setPlanResults([]);
      } finally {
        if (!cancelled) setResultsLoading(false);
      }
    };

    loadResults();
    return () => { cancelled = true; };
  }, [selectedPlanId, tenantId, selectedPeriodId, batches]);

  // Refresh readiness after calculation
  const handleCalculateComplete = useCallback(async () => {
    await refreshBatches();
    // Refresh readiness
    try {
      const resp = await fetch(`/api/plan-readiness?tenantId=${tenantId}`);
      if (resp.ok) {
        const data = await resp.json();
        setPlanReadiness(data.plans || []);
      }
    } catch {
      // Non-critical
    }
  }, [tenantId, refreshBatches]);

  // Calculate all plans
  const handleCalculateAll = useCallback(async () => {
    if (!tenantId || !selectedPeriodId || activePlans.length === 0) return;

    setIsCalculatingAll(true);
    setCalcAllError(null);

    const errors: string[] = [];
    for (const plan of activePlans) {
      try {
        const response = await fetch('/api/calculation/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            periodId: selectedPeriodId,
            ruleSetId: plan.id,
          }),
        });
        const result = await response.json();
        if (!response.ok || result.error) {
          errors.push(`${plan.name}: ${result.error || 'Failed'}`);
        }
      } catch (err) {
        errors.push(`${plan.name}: ${err instanceof Error ? err.message : 'Failed'}`);
      }
    }

    if (errors.length > 0) {
      setCalcAllError(errors.join('; '));
    }

    await handleCalculateComplete();
    setIsCalculatingAll(false);
  }, [tenantId, selectedPeriodId, activePlans, handleCalculateComplete]);

  // Get the selected plan's batch info
  const selectedPlanBatch = batches.find(b => b.ruleSetId === selectedPlanId);

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <p className="font-medium">Access required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <OperateSelector />

      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/operate')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-100">Calculate</h1>
            <p className="text-sm text-zinc-500">Select a plan and period, then calculate.</p>
          </div>
        </div>

        {/* Period selector (inline) */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">Period:</span>
          <Select value={selectedPeriodId || ''} onValueChange={selectPeriod}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.label || p.canonicalKey}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activePlans.length > 1 && selectedPeriodId && (
            <Button
              onClick={handleCalculateAll}
              disabled={isCalculatingAll}
              className="bg-emerald-600 hover:bg-emerald-500 text-white ml-auto"
            >
              {isCalculatingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Calculating All...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Calculate All {activePlans.length} Plans
                </>
              )}
            </Button>
          )}
        </div>

        {calcAllError && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-sm text-red-400">
            {calcAllError}
          </div>
        )}

        {/* Loading state */}
        {(contextLoading || readinessLoading) && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
          </div>
        )}

        {/* No plans */}
        {!contextLoading && !readinessLoading && activePlans.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Calculator className="h-10 w-10 mx-auto mb-3 text-zinc-500" />
              <p className="text-sm text-zinc-400">No active plans.</p>
              <p className="text-xs text-zinc-600 mt-1">Import and activate a plan to get started.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => router.push('/operate/import')}
              >
                Import Data
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Plan cards grid */}
        {!contextLoading && !readinessLoading && activePlans.length > 0 && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {activePlans.map(plan => {
              // Match readiness data or build minimal fallback
              const readiness = planReadiness.find(r => r.planId === plan.id) || {
                planId: plan.id,
                planName: plan.name,
                entityCount: 0,
                hasBindings: false,
                dataRowCount: 0,
                lastBatchDate: null,
                lastTotal: null,
              };

              return (
                <PlanCard
                  key={plan.id}
                  plan={readiness}
                  periodId={selectedPeriodId}
                  tenantId={tenantId}
                  formatCurrency={formatCurrency}
                  isSelected={selectedPlanId === plan.id}
                  onSelect={setSelectedPlanId}
                  onCalculateComplete={handleCalculateComplete}
                />
              );
            })}
          </div>
        )}

        {/* Results panel for selected plan */}
        {selectedPlanId && (
          <div className="mt-2">
            {resultsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
              </div>
            ) : (
              <PlanResults
                planName={activePlans.find(p => p.id === selectedPlanId)?.name || 'Plan'}
                results={planResults}
                formatCurrency={formatCurrency}
                lifecycleState={selectedPlanBatch?.lifecycleState}
                batchDate={selectedPlanBatch?.createdAt}
                onClose={() => setSelectedPlanId(null)}
              />
            )}
          </div>
        )}
      </div>
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
