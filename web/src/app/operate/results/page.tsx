'use client';

/**
 * Results Dashboard — Five Layers of Proof (OB-102 Phase 4: Cognitive Fit)
 *
 * OB-72 Missions 1+2: Five Layers of Proof
 * OB-92: Batch-aware via OperateContext (Plan × Period × Batch selection)
 * OB-102 Phase 4: Cognitive Fit enforcement + reference frame + commentary
 *
 * Cognitive Fit Map:
 *   1. Total payout → AnimatedNumber (identification)
 *   2. Attainment distribution → DistributionChart (distribution)
 *   3. Component breakdown → BenchmarkBar (comparison)
 *   4. Anomaly summary → Severity-grouped cards (selection/triage)
 *   5. Entity drill-down → Expandable table (detail-on-demand)
 *
 * Layer 5 — Outcome: Total, mean, median, components, anomaly count + detail
 * Layer 4 — Population: Per-entity expandable rows with chevron toggle
 * Layer 3 — Component: Goal, actual, attainment, formula, rate per component
 * Layer 2 — Metric: Raw metric values from JSONB, per-component metrics
 *
 * All data comes from Supabase calculation_batches + calculation_results.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useOperate } from '@/contexts/operate-context';
import { isVLAdmin } from '@/types/auth';
import { RequireCapability } from '@/components/auth/RequireCapability';
import {
  getCalculationResults,
} from '@/lib/supabase/calculation-service';
import { detectAnomalies, type AnomalyReport, type Anomaly } from '@/lib/intelligence/anomaly-detection';
import { createClient } from '@/lib/supabase/client';
import { classifyRuleSetRegimes, type RegimeClassification } from '@/lib/results/performance-regime';
import { buildFieldBindingMap, resolveAttainmentPct, type FieldBinding } from '@/lib/results/field-identity';
import { AnomalyDrillThrough } from '@/components/results/AnomalyDrillThrough';
// OB-209: leverage the EXISTING canonical interaction-capture (writes through writeSignal); no new hook.
import { captureStreamSignal, flushPendingStreamSignals } from '@/lib/signals/stream-signals';
import { OperateSelector } from '@/components/operate/OperateSelector';
import type { Database } from '@/lib/supabase/database.types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart3, AlertTriangle,
  Search, ArrowLeft, ChevronDown, ChevronRight,
} from 'lucide-react';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { StatusPill } from '@/components/design-system/StatusPill';

type CalcResultRow = Database['public']['Tables']['calculation_results']['Row'];

interface ComponentTotal {
  componentId: string;
  componentName: string;
  total: number;
  entityCount: number;
}

interface ComponentDetail {
  componentId: string;
  componentName: string;
  componentType: string;
  outputValue: number;
  // L3: Component-level detail
  goal?: number;
  actual?: number;
  attainment?: number;
  formula?: string;
  rate?: number;
  // L2: Raw metric values
  metrics?: Record<string, unknown>;
}

interface ResultRow {
  entityId: string;
  externalId: string;
  entityName: string;
  storeId: string;
  totalPayout: number;
  overallAttainment: number | null;
  components: ComponentDetail[];
  rawMetrics: Record<string, unknown>;
}

function ResultsDashboardPageInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const { selectedBatchId, selectedBatch, isLoading: contextLoading } = useOperate();
  const [results, setResults] = useState<ResultRow[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [isLoaded, setIsLoaded] = useState(false);
  const [anomalyReport, setAnomalyReport] = useState<AnomalyReport | null>(null);
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [anomalyExpanded, setAnomalyExpanded] = useState(false);
  // OB-207 P2: per-component performance regimes (structural, from rule_sets grammar) + self-clearing resolves.
  const [regimes, setRegimes] = useState<Map<string, RegimeClassification>>(new Map());
  const [bindingMap, setBindingMap] = useState<Map<string, FieldBinding>>(new Map());
  const [resolvedAnomalies, setResolvedAnomalies] = useState<Set<string>>(new Set());
  const [drillAnomaly, setDrillAnomaly] = useState<{ claim: string; entityIds: string[]; claimedCount: number } | null>(null); // OB-208 D-2

  const hasAccess = user && isVLAdmin(user);
  const tenantId = currentTenant?.id || '';

  // OB-209: extend the EXISTING canonical capture (captureStreamSignal → writeSignal, signal_type
  // 'lifecycle:stream', HF-219 open vocabulary) to the Decide-Results surface. NO new hook/path.
  const captureResults = (elementId: string, action: 'drill' | 'act' | 'expand' | 'collapse', metadata?: Record<string, unknown>) => {
    if (!tenantId) return;
    captureStreamSignal({ persona: 'admin', elementId, action, tenantId, metadata: { actorId: user?.id, batchId: selectedBatchId, ...metadata } });
  };

  // OB-209 capture-and-react (L1, Observation IS Action): read THIS user's own prior interaction signals
  // for the anomaly section; if they habitually EXPAND it, default it expanded (the surface reacts to the
  // individual's captured history). Tenant-scoped read via the browser RLS client; per-user grain via the
  // open signalValue.actorId (classification_signals has no per-user column — leverage, not a schema add).
  useEffect(() => {
    if (!tenantId || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.from('classification_signals').select('signal_value').eq('tenant_id', tenantId).eq('signal_type', 'lifecycle:stream').limit(1000);
        let expand = 0, collapse = 0;
        for (const r of (data ?? [])) {
          const v = (r.signal_value ?? {}) as Record<string, unknown>;
          if (v.element_id !== 'results:anomaly_summary' || v.actorId !== user.id) continue;
          if (v.action === 'expand') expand++; else if (v.action === 'collapse') collapse++;
        }
        if (!cancelled && expand > collapse && expand >= 2) setAnomalyExpanded(true); // react: habitual expander
      } catch { /* react is best-effort; default (collapsed) stands */ }
    })();
    return () => { cancelled = true; };
  }, [tenantId, user?.id]);

  // OB-209: flush captured interaction signals on unmount (existing batched-flush API).
  useEffect(() => () => { flushPendingStreamSignals(); }, []);

  // OB-92: Load results for the batch selected in OperateContext
  useEffect(() => {
    if (!tenantId || !selectedBatchId) {
      setResults([]);
      setTotalPayout(0);
      setAnomalyReport(null);
      if (!contextLoading) setIsLoaded(true);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setIsLoaded(false);
      setResolvedAnomalies(new Set()); // OB-207 P2 fix: clear self-cleared anomalies when the batch changes
      setDrillAnomaly(null); // OB-208 fix: close any open drill-through on batch change
      try {
        const calcResults = await getCalculationResults(tenantId, selectedBatchId);
        if (cancelled) return;

        // OB-207 P2: classify each component's performance regime structurally from the plan grammar.
        // Read THIS batch's rule set (selectedBatch.ruleSetId) — not an arbitrary non-draft one.
        try {
          const sb = createClient();
          let rsQuery = sb.from('rule_sets').select('components, input_bindings').eq('tenant_id', tenantId);
          rsQuery = selectedBatch?.ruleSetId ? rsQuery.eq('id', selectedBatch.ruleSetId) : rsQuery.neq('status', 'draft');
          const { data: rs } = await rsQuery.limit(1);
          if (!cancelled) {
            setRegimes(classifyRuleSetRegimes(rs?.[0]?.components));
            setBindingMap(buildFieldBindingMap(rs?.[0]?.input_bindings)); // D-1 canonical field→column resolver
          }
        } catch { /* regime classification is best-effort; the surface degrades to relative/payout representation */ }

        // Map to display format — extract L3 (component detail) and L2 (metrics)
        const rows: ResultRow[] = calcResults.map((r: CalcResultRow) => {
          const comps = Array.isArray(r.components) ? r.components : [];
          const rawMetrics = (r.metrics && typeof r.metrics === 'object' ? r.metrics : {}) as Record<string, unknown>;
          const attainmentData = (r.attainment && typeof r.attainment === 'object' ? r.attainment : {}) as Record<string, unknown>;
          const overallAtt = typeof attainmentData.overall === 'number' ? attainmentData.overall : null;

          const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
          const externalId = (meta.externalId as string) || '';
          const entityName = (meta.entityName as string) || externalId || r.entity_id;

          return {
            entityId: r.entity_id,
            externalId,
            entityName,
            storeId: (meta.storeId as string) || '',
            totalPayout: r.total_payout || 0,
            overallAttainment: overallAtt,
            rawMetrics,
            components: comps.map((c: unknown) => {
              const comp = c as Record<string, unknown>;
              const details = (comp.details && typeof comp.details === 'object' ? comp.details : {}) as Record<string, unknown>;
              return {
                componentId: String(comp.componentId || comp.component_id || ''),
                componentName: String(comp.componentName || comp.component_name || ''),
                componentType: String(comp.componentType || ''),
                outputValue: Number(comp.outputValue || comp.output_value || comp.payout || 0),
                goal: typeof details.goal === 'number' ? details.goal : typeof comp.goal === 'number' ? comp.goal : undefined,
                actual: typeof details.actual === 'number' ? details.actual : typeof comp.actual === 'number' ? comp.actual : undefined,
                attainment: typeof details.attainment === 'number' ? details.attainment : typeof comp.attainment === 'number' ? comp.attainment : undefined,
                formula: typeof details.formula === 'string' ? details.formula : typeof comp.formula === 'string' ? comp.formula : undefined,
                rate: typeof details.rate === 'number' ? details.rate : typeof comp.rate === 'number' ? comp.rate : undefined,
                metrics: (details.metrics && typeof details.metrics === 'object' ? details.metrics : undefined) as Record<string, unknown> | undefined,
              };
            }),
          };
        });

        setResults(rows);
        setTotalPayout(rows.reduce((sum, r) => sum + r.totalPayout, 0));

        // L5: Auto-invoke anomaly detection
        const payoutRecords = rows.map(r => ({
          entityId: r.entityId,
          entityName: r.entityName,
          totalPayout: r.totalPayout,
        }));
        const report = detectAnomalies(payoutRecords);
        setAnomalyReport(report);

        setIsLoaded(true);
      } catch (err) {
        console.warn('[Results] Failed to load results:', err);
        if (!cancelled) setIsLoaded(true);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [tenantId, selectedBatchId, selectedBatch?.ruleSetId, contextLoading]);

  // Component totals
  const componentTotals = useMemo((): ComponentTotal[] => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of results) {
      for (const c of r.components) {
        const existing = map.get(c.componentId) || { name: c.componentName, total: 0, count: 0 };
        existing.total += c.outputValue;
        existing.count += 1;
        map.set(c.componentId, existing);
      }
    }
    return Array.from(map.entries()).map(([id, data]) => ({
      componentId: id,
      componentName: data.name,
      total: data.total,
      entityCount: data.count,
    }));
  }, [results]);

  // Filtered and sorted results
  const filteredResults = useMemo(() => {
    let filtered = results;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.externalId.toLowerCase().includes(q) ||
        r.entityName.toLowerCase().includes(q) ||
        r.storeId.toLowerCase().includes(q)
      );
    }
    if (storeFilter !== 'all') {
      filtered = filtered.filter(r => r.storeId === storeFilter);
    }
    return [...filtered].sort((a, b) => {
      if (sortField === 'total') {
        return sortDir === 'desc' ? b.totalPayout - a.totalPayout : a.totalPayout - b.totalPayout;
      }
      if (sortField === 'name') {
        return sortDir === 'desc'
          ? b.entityName.localeCompare(a.entityName)
          : a.entityName.localeCompare(b.entityName);
      }
      return 0;
    });
  }, [results, searchQuery, storeFilter, sortField, sortDir]);

  // Unique stores for filter
  const storeIds = useMemo(() => {
    const ids = Array.from(new Set(results.map(r => r.storeId || 'unknown')));
    return ids.sort();
  }, [results]);

  // OB-102: Attainment values for DistributionChart
  const attainmentValues = useMemo(() => {
    return results
      .map(r => r.overallAttainment)
      .filter((a): a is number => a !== null && a > 0);
  }, [results]);

  // OB-208 D-1: per regime-3 component, the population attainment (actual÷target) computed via the
  // canonical field binding (no name-matching). This is what makes the attainment VALUE renderable.
  const regimeAttainment = useMemo(() => {
    const out = new Map<string, { mean: number; values: number[] }>();
    for (const [name, cls] of Array.from(regimes.entries())) { // Array.from: downlevelIteration gotcha
      if (cls.regime !== 3 || !cls.attainmentFields) continue;
      const values: number[] = [];
      for (const r of results) {
        const pct = resolveAttainmentPct(cls.attainmentFields, bindingMap, r.rawMetrics);
        if (pct != null && Number.isFinite(pct)) values.push(pct);
      }
      if (values.length > 0) out.set(name, { mean: values.reduce((a, b) => a + b, 0) / values.length, values });
    }
    return out;
  }, [regimes, bindingMap, results]);

  // OB-102: Deterministic commentary
  const resultCommentary = useMemo(() => {
    const lines: string[] = [];
    if (results.length === 0) return lines;

    const total = results.reduce((s, r) => s + r.totalPayout, 0);
    const avg = total / results.length;

    // Attainment insight
    if (attainmentValues.length > 0) {
      const above100 = attainmentValues.filter(a => a >= 100).length;
      const pct = Math.round((above100 / attainmentValues.length) * 100);
      lines.push(`${pct}% of entities met or exceeded target.`);
    }

    // Anomaly insight
    if (anomalyReport) {
      if (anomalyReport.anomalies.length === 0) {
        lines.push('No anomalies detected.');
      } else {
        const affected = anomalyReport.anomalies.reduce((s, a) => s + a.entityCount, 0);
        lines.push(`${anomalyReport.anomalies.length} anomal${anomalyReport.anomalies.length === 1 ? 'y' : 'ies'} affecting ${affected} entit${affected === 1 ? 'y' : 'ies'}.`);
      }
    }

    // Spread insight
    if (results.length > 1) {
      const max = Math.max(...results.map(r => r.totalPayout));
      const min = Math.min(...results.map(r => r.totalPayout));
      if (avg > 0 && (max - min) / avg > 2) {
        lines.push('Wide payout spread — review outliers.');
      }
    }

    return lines;
  }, [results, attainmentValues, anomalyReport]);

  // OB-92: Generate batch label from context
  const batchLabel = useMemo(() => {
    if (!selectedBatch) return '';
    const tenantShort = (currentTenant?.name || 'BATCH')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6);
    const batchDate = new Date(selectedBatch.createdAt);
    const yyyy = batchDate.getFullYear();
    const mm = String(batchDate.getMonth() + 1).padStart(2, '0');
    return `${tenantShort}-${yyyy}${mm}`;
  }, [selectedBatch, currentTenant?.name]);

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>VL Admin access required.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">Return to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoaded && results.length === 0) {
    return (
      <div>
        <OperateSelector />
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/operate')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Results Dashboard</h1>
          </div>
          <Card>
            <CardContent className="py-12 text-center text-slate-400">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p className="text-lg font-medium">No calculation results available</p>
              <p className="text-sm mt-1">
                {!selectedBatchId
                  ? 'Select a batch above, or run a calculation first.'
                  : 'No results found for the selected batch.'}
              </p>
              <Button className="mt-4" onClick={() => router.push('/operate')}>
                Go to Operations Center
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const entityCount = results.length;
  const avgPayout = entityCount > 0 ? totalPayout / entityCount : 0;
  const stats = anomalyReport?.stats;
  // OB-207 P2: anomaly Action Cards — Investigate (expand the affected entity) + Resolve (audit_logs, self-clearing).
  const anomalyKey = (a: Anomaly) => `${a.type}:${a.description}`;
  const activeAnomalies = (anomalyReport?.anomalies ?? []).filter(a => !resolvedAnomalies.has(anomalyKey(a)));
  const anomalyCount = activeAnomalies.length;
  const investigateAnomaly = (a: Anomaly) => {
    captureResults('results:anomaly', 'act', { interaction: 'investigate', anomaly_type: a.type });
    const first = (a as { entities?: string[] }).entities?.[0];
    if (!first) return;
    // Clear filters so the affected entity is in the rendered set, then expand + scroll to it.
    setSearchQuery('');
    setStoreFilter('all');
    setExpandedEntity(first);
    if (typeof document !== 'undefined') {
      setTimeout(() => document.getElementById(`entity-row-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  };
  const resolveAnomaly = async (a: Anomaly) => {
    captureResults('results:anomaly', 'act', { interaction: 'resolve', anomaly_type: a.type });
    const key = anomalyKey(a);
    setResolvedAnomalies(prev => { const n = new Set(prev); n.add(key); return n; }); // optimistic self-clear
    try {
      const res = await fetch('/api/results/anomaly-resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, batchId: selectedBatchId, anomalyType: a.type, description: a.description, entityCount: a.entityCount }),
      });
      if (!res.ok) throw new Error(`resolve ${res.status}`);
    } catch {
      // revert the optimistic self-clear so the anomaly reappears for retry
      setResolvedAnomalies(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  return (
    <div>
      {/* OB-92: Shared selector bar */}
      <OperateSelector />

      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/operate')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Results Proof View</h1>
          <p className="text-slate-400 text-sm">
            {entityCount} entities | Batch: {batchLabel || (selectedBatchId ?? '').slice(0, 8)}
          </p>
        </div>
      </div>

      {/* Reference Frame — context banner */}
      <div className="rounded-xl px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          {selectedBatch && (
            <>
              <span>Batch: <span className="text-zinc-200 font-mono">{batchLabel || (selectedBatchId ?? '').slice(0, 8)}</span></span>
              <span className="text-zinc-600">|</span>
              <span>{entityCount} entities</span>
              <span className="text-zinc-600">|</span>
              <span>{componentTotals.length} components</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {anomalyCount === 0 ? (
            <StatusPill color="emerald">No anomalies</StatusPill>
          ) : (
            <StatusPill color="amber">{anomalyCount} anomal{anomalyCount === 1 ? 'y' : 'ies'}</StatusPill>
          )}
        </div>
      </div>

      {/* L5: Outcome Summary — Hero + Compact Stats + Distribution */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        {/* Hero: Total Payout */}
        <div className="lg:col-span-5 rounded-2xl p-6" style={{ background: 'linear-gradient(to bottom right, rgba(79, 70, 229, 0.8), rgba(109, 40, 217, 0.8))', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <p className="text-xs text-indigo-200/70 uppercase tracking-wider mb-1">Total Payout</p>
          <div className="text-3xl font-bold text-white">
            <AnimatedNumber value={totalPayout} prefix="$" decimals={0} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-indigo-200/50 uppercase">Entities</p>
              <p className="text-sm font-semibold text-white">{entityCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-indigo-200/50 uppercase">Mean</p>
              <p className="text-sm font-semibold text-white">{formatCurrency(avgPayout)}</p>
            </div>
            <div>
              <p className="text-[10px] text-indigo-200/50 uppercase">Median</p>
              <p className="text-sm font-semibold text-white">{stats ? formatCurrency(stats.median) : '-'}</p>
            </div>
          </div>
        </div>

        {/* OB-207 P2: regime-aware Performance Distribution (was the empty "Attainment Distribution").
            Per-component regime is structural (classifier); BCL is mixed (target-driven + volume-driven).
            For a population view we show payout-vs-mean (the correct regime-1/population representation —
            never empty), and a regime legend. Attainment-vs-target distribution renders only where the
            engine persists per-component attainment (R2). */}
        <div className="lg:col-span-4 rounded-2xl p-5" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
          {(() => {
            // OB-208 D-1: prefer a regime-3 ATTAINMENT distribution (actual÷target via the canonical
            // binding — now computable); fall back to payout-vs-mean for regime-1/population.
            const r3 = Array.from(regimeAttainment.entries())[0];
            const mean = stats?.mean ?? avgPayout;
            const vsMean = mean > 0 ? results.map(r => (r.totalPayout / mean) * 100) : [];
            const data = r3 ? r3[1].values : vsMean;
            const label = r3 ? 'Attainment Distribution' : 'Performance Distribution';
            const sub = r3 ? `${r3[0]} · ${r3[1].mean.toFixed(0)}% avg attainment` : 'payout relative to population mean';
            return (
              <>
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
                <p className="text-[10px] text-zinc-600 mb-3">{sub}</p>
                {data.length > 0
                  ? <DistributionChart data={data} benchmarkLine={100} />
                  : <div className="flex items-center justify-center h-32 text-xs text-zinc-500">No results</div>}
              </>
            );
          })()}
          {regimes.size > 0 && (() => {
            const vals = Array.from(regimes.values());
            const r3 = vals.filter(c => c.regime === 3).length;
            const r2 = vals.filter(c => c.regime === 2).length;
            const r1 = vals.filter(c => c.regime === 1).length;
            const parts = [r3 ? `${r3} target-driven` : '', r2 ? `${r2} tracked-target` : '', r1 ? `${r1} volume-driven` : ''].filter(Boolean);
            return <p className="text-[10px] text-zinc-500 mt-2">{parts.join(' · ')}</p>;
          })()}
        </div>

        {/* Deterministic Commentary */}
        <div className="lg:col-span-3 rounded-2xl p-5" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-3">Assessment</p>
          <div className="space-y-2 text-sm text-zinc-300 leading-relaxed">
            {resultCommentary.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      </div>

      {/* L5: Bloodwork Anomaly Display (Standing Rule 23) */}
      {anomalyReport && activeAnomalies.length > 0 && (() => {
        const SEVERITY_MAP: Record<string, 'critical' | 'warning' | 'info'> = {
          zero_payout: 'critical',
          missing_entity: 'critical',
          outlier_high: 'warning',
          outlier_low: 'warning',
          identical_values: 'info',
        };
        const SEVERITY_STYLE = {
          critical: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)', text: 'text-red-400', dot: 'bg-red-500' },
          warning: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)', text: 'text-amber-400', dot: 'bg-amber-500' },
          info: { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)', text: 'text-indigo-400', dot: 'bg-indigo-500' },
        };
        const grouped = { critical: [] as typeof activeAnomalies, warning: [] as typeof activeAnomalies, info: [] as typeof activeAnomalies };
        for (const a of activeAnomalies) {
          const sev = SEVERITY_MAP[a.type] ?? 'info';
          grouped[sev].push(a);
        }
        const topFinding = activeAnomalies[0];

        return (
          <Card className="border-amber-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Anomaly Summary
                </CardTitle>
                <button
                  onClick={() => { const next = !anomalyExpanded; setAnomalyExpanded(next); captureResults('results:anomaly_summary', next ? 'expand' : 'collapse'); }}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                >
                  {anomalyExpanded ? (
                    <><ChevronDown className="h-3.5 w-3.5" /> Collapse</>
                  ) : (
                    <><ChevronRight className="h-3.5 w-3.5" /> Expand</>
                  )}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Summary bar: severity counts */}
              <div className="flex items-center gap-4">
                {grouped.critical.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-red-400 font-medium">{grouped.critical.length} critical</span>
                  </span>
                )}
                {grouped.warning.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-amber-400 font-medium">{grouped.warning.length} warning</span>
                  </span>
                )}
                {grouped.info.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-indigo-400 font-medium">{grouped.info.length} info</span>
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 ml-auto">
                  {activeAnomalies.reduce((s, a) => s + a.entityCount, 0)} entities affected
                </span>
              </div>

              {/* Top finding (always visible) */}
              {topFinding && !anomalyExpanded && (
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: SEVERITY_STYLE[SEVERITY_MAP[topFinding.type] ?? 'info'].bg,
                    border: `1px solid ${SEVERITY_STYLE[SEVERITY_MAP[topFinding.type] ?? 'info'].border}`,
                  }}
                >
                  <span className={`text-xs font-medium ${SEVERITY_STYLE[SEVERITY_MAP[topFinding.type] ?? 'info'].text}`}>
                    {topFinding.description}
                  </span>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button onClick={() => { captureResults('results:anomaly', 'drill', { anomaly_type: topFinding.type }); setDrillAnomaly({ claim: topFinding.description, entityIds: (topFinding as { entities?: string[] }).entities ?? [], claimedCount: topFinding.entityCount }); }} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors">
                      Verify
                    </button>
                    <button onClick={() => investigateAnomaly(topFinding)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-zinc-800/70 hover:bg-zinc-800 text-slate-300 border border-zinc-700 transition-colors">
                      Investigate
                    </button>
                    <button onClick={() => resolveAnomaly(topFinding)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-zinc-800/70 hover:bg-zinc-800 text-slate-300 border border-zinc-700 transition-colors">
                      Resolve
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded: grouped detail */}
              {anomalyExpanded && (
                <div className="space-y-3">
                  {(['critical', 'warning', 'info'] as const).map(sev => {
                    if (grouped[sev].length === 0) return null;
                    const style = SEVERITY_STYLE[sev];
                    return (
                      <div key={sev} className="space-y-1.5">
                        <p className={`text-[10px] font-medium uppercase tracking-wider ${style.text}`}>{sev}</p>
                        {grouped[sev].map((a, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg"
                            style={{ backgroundColor: style.bg, border: `1px solid ${style.border}` }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: style.border }}>
                                  {a.type.replace(/_/g, ' ')}
                                </span>
                                <p className="text-sm text-slate-300 mt-1">{a.description}</p>
                              </div>
                              <span className="text-xs text-slate-400 whitespace-nowrap">{a.entityCount} ent</span>
                            </div>
                            {/* OB-207 P2 / OB-208 D-2: Action Proximity + claim verification */}
                            <div className="flex items-center gap-2 mt-2.5">
                              <button onClick={() => { captureResults('results:anomaly', 'drill', { anomaly_type: a.type }); setDrillAnomaly({ claim: a.description, entityIds: (a as { entities?: string[] }).entities ?? [], claimedCount: a.entityCount }); }} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors">
                                Verify
                              </button>
                              <button onClick={() => investigateAnomaly(a)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-zinc-800/70 hover:bg-zinc-800 text-slate-300 border border-zinc-700 transition-colors">
                                Investigate
                              </button>
                              <button onClick={() => resolveAnomaly(a)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-zinc-800/70 hover:bg-zinc-800 text-slate-300 border border-zinc-700 transition-colors">
                                Resolve
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* OB-208 D-2/D-3: claim verification — drill a claim to the Five-Elements synthesis of its entities */}
      {drillAnomaly && (
        <AnomalyDrillThrough
          claim={drillAnomaly.claim}
          entityIds={drillAnomaly.entityIds}
          claimedCount={drillAnomaly.claimedCount}
          results={results.map(r => ({ entityId: r.entityId, entityName: r.entityName, totalPayout: r.totalPayout }))}
          populationMean={stats?.mean ?? avgPayout}
          populationTotal={totalPayout}
          formatCurrency={formatCurrency}
          onClose={() => setDrillAnomaly(null)}
        />
      )}

      {/* Component Breakdown — BenchmarkBar (comparison) */}
      {componentTotals.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
          <p className="text-xs text-zinc-400 uppercase tracking-wider mb-4">Component Breakdown</p>
          <div className="space-y-3">
            {componentTotals.map(comp => {
              const avgPerEntity = comp.entityCount > 0 ? comp.total / comp.entityCount : 0;
              return (
                <BenchmarkBar
                  key={comp.componentId}
                  value={comp.total}
                  benchmark={avgPerEntity * entityCount}
                  max={Math.max(...componentTotals.map(c => c.total)) * 1.1}
                  label={comp.componentName}
                  sublabel={`${comp.entityCount} entities${(() => {
                    const r = regimes.get(comp.componentName)?.regime;
                    const tag = r ? ` · ${r === 3 ? 'target-driven' : r === 2 ? 'tracked-target' : 'volume-driven'}` : '';
                    const att = regimeAttainment.get(comp.componentName); // OB-208 D-1: attainment value
                    return tag + (att ? ` · ${att.mean.toFixed(0)}% attainment` : '');
                  })()}`}
                  rightLabel={formatCurrency(comp.total)}
                  color="#6366f1"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Entity Table */}
      <Card>
        <CardHeader>
          <CardTitle>Entity Results</CardTitle>
          <div className="flex gap-3 mt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search entity..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {storeIds.map(id => (
                  <SelectItem key={id} value={id}>{id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-slate-800/50"
                    onClick={() => { setSortField('name'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                  >
                    Employee ID
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Store</TableHead>
                  {componentTotals.map(cc => (
                    <TableHead key={cc.componentId} className="text-right">
                      <span className="text-xs">{cc.componentName}</span>
                    </TableHead>
                  ))}
                  <TableHead
                    className="text-right cursor-pointer hover:bg-slate-800/50"
                    onClick={() => { setSortField('total'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                  >
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.slice(0, 100).map(row => {
                  const isExpanded = expandedEntity === row.entityId;
                  return (
                    <React.Fragment key={row.entityId}>
                      <TableRow
                        id={`entity-row-${row.entityId}`}
                        className="cursor-pointer hover:bg-slate-800/50"
                        onClick={() => setExpandedEntity(isExpanded ? null : row.entityId)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                              : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                            <span className="font-medium font-mono text-sm">{row.externalId || row.entityId.slice(0, 8)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[180px]" title={row.entityName}>
                          {row.entityName !== row.externalId ? row.entityName : '-'}
                        </TableCell>
                        <TableCell className="text-sm">{row.storeId || '-'}</TableCell>
                        {componentTotals.map(cc => {
                          const comp = row.components.find(c => c.componentId === cc.componentId);
                          return (
                            <TableCell key={cc.componentId} className="text-right text-sm">
                              {comp ? formatCurrency(comp.outputValue) : '-'}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-bold">
                          {formatCurrency(row.totalPayout)}
                        </TableCell>
                      </TableRow>
                      {/* L4/L3/L2: Expanded entity detail — component + metric drill-down */}
                      {isExpanded && (
                        <TableRow className="bg-slate-900/50">
                          <TableCell colSpan={componentTotals.length + 4} className="p-0">
                            <div className="px-8 py-4 space-y-4">
                              {/* Header with attainment + trace link */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                    Proof Detail — {row.entityName}
                                  </p>
                                  {row.overallAttainment !== null && (
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                      row.overallAttainment >= 100 ? 'bg-emerald-500/10 text-emerald-400' :
                                      row.overallAttainment >= 80 ? 'bg-amber-500/10 text-amber-400' :
                                      'bg-red-500/10 text-red-400'
                                    }`}>
                                      {row.overallAttainment.toFixed(1)}% attainment
                                    </span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs"
                                  onClick={(e) => { e.stopPropagation(); router.push(`/investigate/trace/${row.entityId}?from=results`); }}
                                >
                                  Full Trace →
                                </Button>
                              </div>

                              {/* L3: Component detail cards */}
                              {row.components.length > 0 ? (
                                <div className="space-y-3">
                                  {row.components.map(c => {
                                    const pct = row.totalPayout > 0 ? (c.outputValue / row.totalPayout) * 100 : 0;
                                    const hasL3 = c.goal !== undefined || c.actual !== undefined || c.attainment !== undefined || c.formula;
                                    const hasL2 = c.metrics && Object.keys(c.metrics).length > 0;
                                    return (
                                      <div key={c.componentId} className="rounded-lg border border-slate-700/50 p-3 space-y-2">
                                        {/* Component bar */}
                                        <div className="flex items-center gap-3">
                                          <span className="text-sm font-medium w-40 truncate" title={c.componentName}>
                                            {c.componentName}
                                          </span>
                                          <div className="flex-1 bg-slate-800 rounded-full h-4 relative overflow-hidden">
                                            <div
                                              className="bg-blue-500/60 h-4 rounded-full transition-all"
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <span className="text-sm font-medium w-24 text-right">
                                            {formatCurrency(c.outputValue)}
                                          </span>
                                          <span className="text-xs text-slate-400 w-12 text-right">
                                            {pct.toFixed(0)}%
                                          </span>
                                        </div>

                                        {/* L3: Goal / Actual / Attainment / Formula */}
                                        {hasL3 && (
                                          <div className="flex flex-wrap gap-x-6 gap-y-1 pl-1 text-xs">
                                            {c.componentType && (
                                              <span className="text-slate-400">Type: <span className="text-slate-300">{c.componentType}</span></span>
                                            )}
                                            {c.goal !== undefined && (
                                              <span className="text-slate-400">Goal: <span className="text-slate-300 font-mono">{c.goal.toLocaleString()}</span></span>
                                            )}
                                            {c.actual !== undefined && (
                                              <span className="text-slate-400">Actual: <span className="text-slate-300 font-mono">{c.actual.toLocaleString()}</span></span>
                                            )}
                                            {c.attainment !== undefined && (
                                              <span className="text-slate-400">Attainment: <span className={`font-mono ${c.attainment >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{c.attainment.toFixed(1)}%</span></span>
                                            )}
                                            {c.rate !== undefined && (
                                              <span className="text-slate-400">Rate: <span className="text-slate-300 font-mono">{(c.rate * 100).toFixed(1)}%</span></span>
                                            )}
                                            {c.formula && (
                                              <span className="text-slate-400">Formula: <span className="text-slate-300 font-mono">{c.formula}</span></span>
                                            )}
                                          </div>
                                        )}

                                        {/* L2: Metric values */}
                                        {hasL2 && (
                                          <div className="pl-1 pt-1 border-t border-slate-700/30">
                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Metrics</p>
                                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                                              {Object.entries(c.metrics!).map(([key, val]) => (
                                                <span key={key} className="text-slate-400">
                                                  {key}: <span className="text-slate-300 font-mono">
                                                    {typeof val === 'number' ? val.toLocaleString() : String(val)}
                                                  </span>
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-400">No component details available.</p>
                              )}

                              {/* L2: Raw metrics from calculation_results.metrics JSONB */}
                              {Object.keys(row.rawMetrics).length > 0 && (
                                <div className="pt-2 border-t border-slate-700/30">
                                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Raw Metrics</p>
                                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                                    {Object.entries(row.rawMetrics).map(([key, val]) => (
                                      <span key={key} className="text-slate-400">
                                        {key}: <span className="text-slate-300 font-mono">
                                          {typeof val === 'number' ? val.toLocaleString() : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {filteredResults.length > 100 && (
              <p className="text-sm text-slate-400 mt-2 text-center">
                Showing 100 of {filteredResults.length} entities
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

export default function ResultsDashboardPage() {
  return (
    <RequireCapability capability="view.all_results">
      <ResultsDashboardPageInner />
    </RequireCapability>
  );
}
