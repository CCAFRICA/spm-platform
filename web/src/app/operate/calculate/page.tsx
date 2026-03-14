'use client';

// Calculate — Plan-centric calculation + DS-007 results experience
// OB-145 Phase 6 — Five Layers of Proof results page
//
// Plan cards grid at top. When a plan is selected AND has results,
// shows DS-007: Hero + Heatmap + PopulationHealth + EntityTable + NarrativeSpine.

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useOperate } from '@/contexts/operate-context';
import { isVLAdmin } from '@/types/auth';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { OperateSelector } from '@/components/operate/OperateSelector';
import { PlanCard, type PlanReadiness } from '@/components/calculate/PlanCard';
import { loadResultsPageData, type ResultsPageData } from '@/lib/data/results-loader';
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
  Download,
  BarChart3,
} from 'lucide-react';

// DS-007 result components
import { ResultsHero } from '@/components/results/ResultsHero';
import { StoreHeatmap } from '@/components/results/StoreHeatmap';
import { PopulationHealth } from '@/components/results/PopulationHealth';
import { EntityTable } from '@/components/results/EntityTable';

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
    refreshPeriods,
    isLoading: contextLoading,
  } = useOperate();

  const [planReadiness, setPlanReadiness] = useState<PlanReadiness[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [resultsData, setResultsData] = useState<ResultsPageData | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [isCalculatingAll, setIsCalculatingAll] = useState(false);
  const [calcAllError, setCalcAllError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [isCreatingPeriods, setIsCreatingPeriods] = useState(false);
  const [periodCreateError, setPeriodCreateError] = useState<string | null>(null);

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

  // Load DS-007 results when a plan is selected
  useEffect(() => {
    if (!selectedPlanId || !tenantId || !selectedPeriodId) {
      setResultsData(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setResultsLoading(true);
      try {
        const data = await loadResultsPageData(tenantId, selectedPeriodId, selectedPlanId);
        if (!cancelled) setResultsData(data);
      } catch {
        if (!cancelled) setResultsData(null);
      } finally {
        if (!cancelled) setResultsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedPlanId, tenantId, selectedPeriodId, batches]);

  // Refresh readiness after calculation
  const handleCalculateComplete = useCallback(async () => {
    await refreshBatches();
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

  // Export CSV
  const handleExportCSV = useCallback(() => {
    if (!resultsData) return;

    const compNames = resultsData.componentDefinitions.map(cd => cd.name);
    const headers = ['External ID', 'Name', 'Store', 'Attainment', ...compNames, 'Total Payout'];

    const rows = resultsData.entities.map(e => {
      const compAmounts = resultsData.componentDefinitions.map(cd => {
        const cp = e.componentPayouts.find(c => c.componentId === cd.id || c.componentName === cd.name);
        return cp ? cp.payout.toFixed(2) : '0.00';
      });
      return [
        e.externalId,
        e.displayName,
        e.store,
        e.attainment !== null ? e.attainment.toFixed(1) : '',
        ...compAmounts,
        e.totalPayout.toFixed(2),
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results_${resultsData.periodLabel.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resultsData]);

  // OB-153: Create periods from committed_data source dates
  const handleCreatePeriods = useCallback(async () => {
    if (!tenantId) return;
    setIsCreatingPeriods(true);
    setPeriodCreateError(null);
    try {
      const res = await fetch('/api/periods/create-from-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPeriodCreateError(data.error || 'Failed to create periods');
      } else {
        await refreshPeriods();
      }
    } catch (err) {
      setPeriodCreateError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setIsCreatingPeriods(false);
    }
  }, [tenantId, refreshPeriods]);

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

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
          {periods.length > 0 ? (
            <Select value={selectedPeriodId || ''} onValueChange={(v) => { selectPeriod(v); setStoreFilter(null); }}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.label || p.canonicalKey}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Button
              onClick={handleCreatePeriods}
              disabled={isCreatingPeriods}
              variant="outline"
              size="sm"
            >
              {isCreatingPeriods ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Detecting periods...
                </>
              ) : (
                'Create periods from data'
              )}
            </Button>
          )}

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

        {periodCreateError && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-sm text-red-400">
            {periodCreateError}
          </div>
        )}

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

        {/* ═══════════════════════════════════════════════ */}
        {/* DS-007 RESULTS VIEW */}
        {/* ═══════════════════════════════════════════════ */}
        {selectedPlanId && (
          <div className="space-y-5">
            {resultsLoading ? (
              <ResultsSkeleton />
            ) : resultsData ? (
              <>
                {/* Action bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                      {resultsData.periodLabel}
                    </span>
                    <span className="text-[10px] text-zinc-700">&middot;</span>
                    <span className="text-[10px] text-zinc-600 font-mono">
                      {resultsData.lifecycleState}
                    </span>
                    <span className="text-[10px] text-zinc-700">&middot;</span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(resultsData.batchDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleExportCSV}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => router.push('/operate/reconciliation')}
                    >
                      Reconcile
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-zinc-400"
                      onClick={() => { setSelectedPlanId(null); setStoreFilter(null); }}
                    >
                      Close
                    </Button>
                  </div>
                </div>

                {/* L5: Hero */}
                <ResultsHero
                  totalPayout={resultsData.totalPayout}
                  resultCount={resultsData.resultCount}
                  componentTotals={resultsData.componentTotals}
                  componentDefinitions={resultsData.componentDefinitions}
                  planName={resultsData.planName}
                  formatCurrency={formatCurrency}
                />

                {/* L4: Heatmap */}
                <StoreHeatmap
                  storeComponentMatrix={resultsData.storeComponentMatrix}
                  stores={resultsData.stores}
                  componentDefinitions={resultsData.componentDefinitions}
                  entities={resultsData.entities}
                  formatCurrency={formatCurrency}
                  onStoreFilter={setStoreFilter}
                />

                {/* L4: Population health */}
                <PopulationHealth entities={resultsData.entities} />

                {/* L4: Entity table with L3 NarrativeSpine expansion */}
                <EntityTable
                  entities={resultsData.entities}
                  componentDefinitions={resultsData.componentDefinitions}
                  formatCurrency={formatCurrency}
                  storeFilter={storeFilter}
                  onStoreFilter={setStoreFilter}
                />

                {/* Footer */}
                <div className="text-center py-4">
                  <p className="text-[10px] text-zinc-700">
                    Batch {resultsData.batchId.substring(0, 8)} &middot; {resultsData.resultCount.toLocaleString()} results &middot; {resultsData.componentDefinitions.length} components
                  </p>
                </div>
              </>
            ) : (
              /* Empty state — no results */
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 text-zinc-500" />
                  <p className="text-sm text-zinc-400">No results for this plan and period.</p>
                  <p className="text-xs text-zinc-600 mt-1">Run a calculation to see results.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Skeleton loading state
// ──────────────────────────────────────────────

function ResultsSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Hero skeleton */}
      <div className="rounded-2xl border border-zinc-800/60 p-8">
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="h-3 w-20 bg-zinc-800 rounded" />
            <div className="h-12 w-48 bg-zinc-800 rounded" />
            <div className="h-4 w-32 bg-zinc-800/50 rounded" />
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="h-16 bg-zinc-800/30 rounded-lg" />
              <div className="h-16 bg-zinc-800/30 rounded-lg" />
              <div className="h-16 bg-zinc-800/30 rounded-lg" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-3 w-32 bg-zinc-800 rounded" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 bg-zinc-800/30 rounded" />
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap skeleton */}
      <div className="rounded-xl border border-zinc-800/60 p-6">
        <div className="h-3 w-40 bg-zinc-800 rounded mb-4" />
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: 48 }).map((_, i) => (
            <div key={i} className="h-7 bg-zinc-800/20 rounded" />
          ))}
        </div>
      </div>

      {/* Health strip skeleton */}
      <div className="rounded-xl border border-zinc-800/60 p-4">
        <div className="h-3 bg-zinc-800 rounded-full" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-zinc-800/60">
        <div className="p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 bg-zinc-800/20 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CalculatePage() {
  return (
    <RequireCapability capability="data.calculate">
      <CalculatePageInner />
    </RequireCapability>
  );
}
