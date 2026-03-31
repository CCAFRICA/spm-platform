'use client';

// Calculate — Plan-centric calculation + DS-007 results experience
// OB-145 Phase 6 — Five Layers of Proof results page
//
// Plan cards grid at top. When a plan is selected AND has results,
// shows DS-007: Hero + Heatmap + PopulationHealth + EntityTable + NarrativeSpine.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useOperate } from '@/contexts/operate-context';
import { isVLAdmin } from '@/types/auth';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { PlanCard, type PlanReadiness } from '@/components/calculate/PlanCard';
import { loadResultsPageData, type ResultsPageData } from '@/lib/data/results-loader';
import { createClient } from '@/lib/supabase/client';
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
  Calendar,
  Zap,
  CheckCircle2,
  Circle,
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
  // OB-187 + OB-188: Period detection panel state
  const [showDetectionPanel, setShowDetectionPanel] = useState(false);
  const [detectionLoading, setDetectionLoading] = useState(false);
  const [detectedPeriods, setDetectedPeriods] = useState<Array<{
    label: string; period_type: string; start_date: string; end_date: string;
    canonical_key: string; exists: boolean; transaction_count: number;
    matching_plans: string[]; selected: boolean;
  }>>([]);
  const [planCadences, setPlanCadences] = useState<Array<{
    plan_id: string; plan_name: string; cadence: string;
  }>>([]);
  const [detectionCommentary, setDetectionCommentary] = useState<string[]>([]);
  const [priorPeriodTotals, setPriorPeriodTotals] = useState<Record<string, number>>({});
  const [dataStatus, setDataStatus] = useState<{ hasData: boolean; sourceDateRange?: { min: string; max: string } } | null>(null);

  const hasAccess = user && (isVLAdmin(user) || user.role === 'admin');
  const tenantId = currentTenant?.id || '';
  // OB-184: Include both active AND draft plans. Draft plans are calculable
  // (DRAFT → PREVIEW lifecycle: calculate first, then review).
  const activePlans = useMemo(() => plans.filter(p => p.status === 'active' || p.status === 'draft'), [plans]);

  // OB-186: Filter periods by selected plan's cadence_config
  // If a plan has cadence_config.period_type, only show matching periods.
  // If cadence_config is empty, show all periods (backward compatible).
  const selectedPlanCadence = useMemo(() => {
    if (!selectedPlanId) return null;
    const plan = activePlans.find(p => p.id === selectedPlanId);
    const cc = plan?.cadence_config as Record<string, unknown> | null;
    return cc?.period_type ? String(cc.period_type) : null;
  }, [selectedPlanId, activePlans]);

  const filteredPeriods = useMemo(() => {
    if (!selectedPlanCadence) return periods;
    return periods.filter(p => p.period_type === selectedPlanCadence);
  }, [periods, selectedPlanCadence]);

  // OB-189: Filter plan cards by selected period's cadence type
  const selectedPeriodType = useMemo(() => {
    if (!selectedPeriodId) return null;
    const period = periods.find(p => p.id === selectedPeriodId);
    return period?.period_type ?? null;
  }, [selectedPeriodId, periods]);

  const cadenceFilteredPlans = useMemo(() => {
    if (!selectedPeriodType) return activePlans;
    return activePlans.filter(plan => {
      const cc = plan.cadence_config as Record<string, unknown> | null;
      const planCadence = cc?.period_type ? String(cc.period_type) : null;
      if (!planCadence) return true; // No cadence set → show for all period types
      return planCadence === selectedPeriodType;
    });
  }, [activePlans, selectedPeriodType]);

  // OB-184: Check data status (has committed_data? source date range?)
  useEffect(() => {
    if (!tenantId) { setDataStatus(null); return; }
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      if (cancelled) return;
      if (!count || count === 0) {
        setDataStatus({ hasData: false });
        return;
      }
      // Get source date range
      const { data: minRow } = await supabase
        .from('committed_data')
        .select('source_date')
        .eq('tenant_id', tenantId)
        .not('source_date', 'is', null)
        .order('source_date', { ascending: true })
        .limit(1);
      const { data: maxRow } = await supabase
        .from('committed_data')
        .select('source_date')
        .eq('tenant_id', tenantId)
        .not('source_date', 'is', null)
        .order('source_date', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const minDate = minRow?.[0]?.source_date;
      const maxDate = maxRow?.[0]?.source_date;
      setDataStatus({
        hasData: true,
        sourceDateRange: minDate && maxDate ? { min: minDate, max: maxDate } : undefined,
      });
    };
    load();
    return () => { cancelled = true; };
  }, [tenantId]);

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

  // Calculate all plans (respects cadence filter)
  const handleCalculateAll = useCallback(async () => {
    if (!tenantId || !selectedPeriodId || cadenceFilteredPlans.length === 0) return;

    setIsCalculatingAll(true);
    setCalcAllError(null);

    const errors: string[] = [];
    for (const plan of cadenceFilteredPlans) {
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
  }, [tenantId, selectedPeriodId, cadenceFilteredPlans, handleCalculateComplete]);

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

  // Load prior period totals for period comparison
  useEffect(() => {
    if (!tenantId || !selectedPeriodId || periods.length < 2) {
      setPriorPeriodTotals({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const sorted = [...periods].sort((a, b) =>
        (a.startDate || a.canonicalKey || '').localeCompare(b.startDate || b.canonicalKey || '')
      );
      const currentIdx = sorted.findIndex(p => p.id === selectedPeriodId);
      if (currentIdx <= 0) {
        setPriorPeriodTotals({});
        return;
      }
      const priorPeriodId = sorted[currentIdx - 1].id;
      const planIds = activePlans.map(p => p.id);
      if (planIds.length === 0) return;

      const supabase = createClient();
      const { data: batches } = await supabase
        .from('calculation_batches')
        .select('rule_set_id, summary')
        .eq('tenant_id', tenantId)
        .eq('period_id', priorPeriodId)
        .in('rule_set_id', planIds)
        .is('superseded_by', null)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      const totals: Record<string, number> = {};
      const seen = new Set<string>();
      for (const b of (batches || [])) {
        if (!b.rule_set_id || seen.has(b.rule_set_id)) continue;
        seen.add(b.rule_set_id);
        const summary = b.summary as Record<string, unknown> | null;
        if (summary?.total_payout != null) {
          totals[b.rule_set_id] = Number(summary.total_payout);
        }
      }
      setPriorPeriodTotals(totals);
    };

    load();
    return () => { cancelled = true; };
  }, [tenantId, selectedPeriodId, periods, activePlans]);

  // OB-153: Create periods from committed_data source dates
  // OB-187 + OB-188: Intelligent period detection
  const handleDetectPeriods = async () => {
    if (!tenantId) return;
    setShowDetectionPanel(true);
    setDetectionLoading(true);
    setPeriodCreateError(null);
    try {
      const res = await fetch('/api/periods/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (data.suggested_periods) {
        setDetectedPeriods(data.suggested_periods.map((d: Record<string, unknown>) => ({ ...d, selected: !d.exists })));
      }
      if (data.plan_cadences) setPlanCadences(data.plan_cadences);
      if (data.commentary) setDetectionCommentary(data.commentary);
    } catch (err) {
      setPeriodCreateError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setDetectionLoading(false);
    }
  };

  // OB-188: Inline cadence update
  const handleCadenceChange = async (planId: string, newCadence: string) => {
    if (!tenantId) return;
    try {
      const res = await fetch('/api/rule-sets/update-cadence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleSetId: planId, tenantId, cadence: newCadence }),
      });
      if (res.ok) {
        // Re-run detection to update suggestions
        handleDetectPeriods();
      }
    } catch { /* non-blocking */ }
  };

  const handleCreateDetectedPeriods = async () => {
    const toCreate = detectedPeriods.filter(p => p.selected && !p.exists);
    if (toCreate.length === 0) return;
    setIsCreatingPeriods(true);
    try {
      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          periods: toCreate.map(p => ({
            label: p.label,
            period_type: p.period_type,
            start_date: p.start_date,
            end_date: p.end_date,
            canonical_key: p.canonical_key,
            status: 'open',
            metadata: { source: 'ob187_detect' },
          })),
        }),
      });
      if (res.ok) {
        setShowDetectionPanel(false);
        setDetectedPeriods([]);
        await refreshPeriods();
      } else {
        const err = await res.json();
        setPeriodCreateError(err.error || 'Creation failed');
      }
    } catch (err) {
      setPeriodCreateError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setIsCreatingPeriods(false);
    }
  };

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
      {/* OB-192: OperateSelector removed — Calculate page uses body period selector as sole control.
          Plan cards are the plan selector. Period dropdown is inline below. */}

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

        {/* Period selector (inline) — B2.3: enhanced readability */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-300">Period:</span>
          {/* OB-186: Use filteredPeriods (cadence-aware) instead of all periods */}
          {filteredPeriods.length > 0 ? (
            <Select value={selectedPeriodId || ''} onValueChange={(v) => { selectPeriod(v); setStoreFilter(null); setResultsData(null); setSelectedPlanId(null); }}>
              <SelectTrigger className="w-64 h-10 text-sm font-semibold text-zinc-100">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {filteredPeriods.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-sm font-medium">{p.label || p.canonicalKey}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex flex-col gap-3">
              {/* HF-175: Prominent Create Periods card — not a subtle text link */}
              <Card className="border-indigo-500/30 bg-indigo-500/5">
                <CardContent className="py-4 flex items-center gap-4">
                  <Calendar className="w-8 h-8 text-indigo-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-200">No periods created yet</p>
                    {dataStatus?.sourceDateRange ? (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Your data spans {dataStatus.sourceDateRange.min} to {dataStatus.sourceDateRange.max}. Create periods to start calculating.
                      </p>
                    ) : dataStatus !== null && !dataStatus.hasData ? (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        No data imported yet.{' '}
                        <button onClick={() => router.push('/operate/import')} className="text-indigo-400 hover:text-indigo-300 underline">Import data</button>
                        {' '}first, or create periods manually.
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-400 mt-0.5">Detect periods from imported data or create them manually.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      onClick={handleDetectPeriods}
                      disabled={detectionLoading || (dataStatus !== null && !dataStatus.hasData)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      {detectionLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          Detecting...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-1" />
                          Detect Periods from Data
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push('/configure/periods')}
                    >
                      Create Manually
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {/* OB-188: Enhanced Period Detection Panel */}
              {showDetectionPanel && (
                <Card className="border-zinc-700 mt-3">
                  <CardContent className="py-4">
                    {detectionLoading ? (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing data and plan cadences...
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Header + Dismiss */}
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-zinc-200">{detectedPeriods.length} periods suggested</p>
                          <button onClick={() => setShowDetectionPanel(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Dismiss</button>
                        </div>

                        {/* Plan Cadences — inline editable */}
                        {planCadences.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Plan Cadences</p>
                            {planCadences.map(pc => (
                              <div key={pc.plan_id} className="flex items-center gap-2 py-1">
                                <span className="text-xs text-zinc-300 flex-1 truncate">{pc.plan_name}</span>
                                <select
                                  value={pc.cadence}
                                  onChange={(e) => handleCadenceChange(pc.plan_id, e.target.value)}
                                  className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300 cursor-pointer"
                                >
                                  <option value="monthly">monthly</option>
                                  <option value="biweekly">biweekly</option>
                                  <option value="weekly">weekly</option>
                                  <option value="quarterly">quarterly</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Suggested Periods */}
                        {detectedPeriods.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Periods</p>
                            {detectedPeriods.map((p, i) => (
                              <div key={p.canonical_key} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-zinc-800/50">
                                {p.exists ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <button
                                    onClick={() => setDetectedPeriods(prev => prev.map((dp, j) => j === i ? { ...dp, selected: !dp.selected } : dp))}
                                    className="flex-shrink-0"
                                  >
                                    {p.selected ? <CheckCircle2 className="w-4 h-4 text-indigo-400" /> : <Circle className="w-4 h-4 text-zinc-600" />}
                                  </button>
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm text-zinc-200">{p.label}</span>
                                  <span className="text-xs text-zinc-500 ml-2">({p.period_type})</span>
                                </div>
                                <span className="text-xs text-zinc-500 tabular-nums">{p.transaction_count} txns</span>
                                {p.exists ? (
                                  <span className="text-xs text-green-500/80">Exists</span>
                                ) : (
                                  <span className="text-xs text-indigo-400">NEW</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Commentary */}
                        {detectionCommentary.length > 0 && (
                          <div className="space-y-1 border-t border-zinc-800 pt-3">
                            {detectionCommentary.map((c, i) => (
                              <p key={i} className={`text-xs ${c.startsWith('⚠') ? 'text-amber-400' : 'text-zinc-500'}`}>{c}</p>
                            ))}
                          </div>
                        )}

                        {/* Create button */}
                        {detectedPeriods.some(p => !p.exists) ? (
                          <Button
                            onClick={handleCreateDetectedPeriods}
                            disabled={isCreatingPeriods || detectedPeriods.filter(p => p.selected && !p.exists).length === 0}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
                          >
                            {isCreatingPeriods ? (
                              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Creating...</>
                            ) : (
                              <>Create {detectedPeriods.filter(p => p.selected && !p.exists).length} New Periods</>
                            )}
                          </Button>
                        ) : detectedPeriods.length > 0 ? (
                          <p className="text-xs text-green-500/80 text-center">All periods already exist</p>
                        ) : null}

                        {periodCreateError && <p className="text-xs text-red-400 mt-2">{periodCreateError}</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {cadenceFilteredPlans.length > 1 && selectedPeriodId && (
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
                  Calculate All {cadenceFilteredPlans.length} Plans
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

        {/* No plans — OB-184: self-guiding with navigation */}
        {!contextLoading && !readinessLoading && cadenceFilteredPlans.length === 0 && activePlans.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Calculator className="h-10 w-10 mx-auto mb-3 text-zinc-500" />
              <p className="text-sm text-zinc-400">No plans imported yet.</p>
              <p className="text-xs text-zinc-600 mt-1">Import a plan document to define calculation rules, then return here to calculate.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => router.push('/operate/import')}
              >
                Import Plan
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Cadence mismatch hint — plans exist but filtered out by period cadence */}
        {!contextLoading && !readinessLoading && cadenceFilteredPlans.length === 0 && activePlans.length > 0 && selectedPeriodId && (
          <Card>
            <CardContent className="py-8 text-center">
              <Calendar className="h-10 w-10 mx-auto mb-3 text-zinc-500" />
              <p className="text-sm text-zinc-400">No plans match this period&apos;s cadence ({selectedPeriodType}).</p>
              <p className="text-xs text-zinc-600 mt-1">Select a different period, or update plan cadences in the detection panel.</p>
            </CardContent>
          </Card>
        )}

        {/* Plan cards grid */}
        {!contextLoading && !readinessLoading && cadenceFilteredPlans.length > 0 && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {cadenceFilteredPlans.map(plan => {
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
                  priorPeriodTotal={priorPeriodTotals[plan.id] ?? null}
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
                {/* OB-173: Enhanced action bar with lifecycle status + transition */}
                <div className="space-y-3">
                  {/* Status + metadata row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                        resultsData.lifecycleState === 'POSTED' || resultsData.lifecycleState === 'APPROVED'
                          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                          : resultsData.lifecycleState === 'OFFICIAL' || resultsData.lifecycleState === 'PENDING_APPROVAL'
                            ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                            : 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                      }`}>
                        {resultsData.lifecycleState}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                        {resultsData.periodLabel}
                      </span>
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
                  {/* Lifecycle action row */}
                  {resultsData.lifecycleState === 'PREVIEW' && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                      <p className="text-xs text-zinc-400">Results calculated. Advance to make official for approval.</p>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={() => router.push('/operate/lifecycle')}
                      >
                        Advance to Official &rarr;
                      </Button>
                    </div>
                  )}
                  {resultsData.lifecycleState === 'OFFICIAL' && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <p className="text-xs text-zinc-400">Results verified. Submit for approval.</p>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={() => router.push('/operate/lifecycle')}
                      >
                        Submit for Approval &rarr;
                      </Button>
                    </div>
                  )}
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
