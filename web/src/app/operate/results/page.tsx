'use client';

/**
 * Results Dashboard — Five Layers of Proof
 *
 * OB-72 Missions 1+2: Five Layers of Proof
 * OB-92: Batch-aware via OperateContext (Plan × Period × Batch selection)
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
import { RequireRole } from '@/components/auth/RequireRole';
import {
  getCalculationResults,
} from '@/lib/supabase/calculation-service';
import { detectAnomalies, type AnomalyReport } from '@/lib/intelligence/anomaly-detection';
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
  BarChart3, Users, DollarSign, TrendingUp, AlertTriangle,
  Search, ArrowLeft, Scale, ChevronDown, ChevronRight, Activity,
} from 'lucide-react';

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

  const hasAccess = user && isVLAdmin(user);
  const tenantId = currentTenant?.id || '';

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
      try {
        const calcResults = await getCalculationResults(tenantId, selectedBatchId);
        if (cancelled) return;

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
                componentType: String(comp.componentType || comp.component_type || ''),
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
  }, [tenantId, selectedBatchId, contextLoading]);

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
            <CardContent className="py-12 text-center text-slate-500">
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
  const anomalyCount = anomalyReport?.anomalies.length ?? 0;

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
          <p className="text-slate-500 text-sm">
            {entityCount} entities | Batch: {batchLabel || (selectedBatchId ?? '').slice(0, 8)}
          </p>
        </div>
      </div>

      {/* L5: Outcome Summary — aggregate stats */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-emerald-100">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-lg font-bold">{formatCurrency(totalPayout)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Entities</p>
                <p className="text-lg font-bold">{entityCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-100">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Mean</p>
                <p className="text-lg font-bold">{formatCurrency(avgPayout)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-indigo-100">
                <Activity className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Median</p>
                <p className="text-lg font-bold">{stats ? formatCurrency(stats.median) : '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-100">
                <Scale className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Components</p>
                <p className="text-lg font-bold">{componentTotals.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={anomalyCount > 0 ? 'border-amber-500/50' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${anomalyCount > 0 ? 'bg-amber-100' : 'bg-green-100'}`}>
                <AlertTriangle className={`h-5 w-5 ${anomalyCount > 0 ? 'text-amber-600' : 'text-green-600'}`} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Anomalies</p>
                <p className="text-lg font-bold">{anomalyCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* L5: Anomaly Detail (if any) */}
      {anomalyReport && anomalyReport.anomalies.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Anomalies Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {anomalyReport.anomalies.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 whitespace-nowrap">
                    {a.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-slate-300">{a.description}</span>
                  <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">{a.entityCount} ent</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Component Breakdown */}
      {componentTotals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Component Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {componentTotals.map(comp => {
                const maxTotal = Math.max(...componentTotals.map(c => c.total), 1);
                const widthPct = (comp.total / maxTotal) * 100;
                return (
                  <div key={comp.componentId} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-40 truncate" title={comp.componentName}>
                      {comp.componentName}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-blue-500 h-6 rounded-full transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium">
                        {formatCurrency(comp.total)}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 w-16 text-right">
                      {comp.entityCount} ent
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
                                          <span className="text-xs text-slate-500 w-12 text-right">
                                            {pct.toFixed(0)}%
                                          </span>
                                        </div>

                                        {/* L3: Goal / Actual / Attainment / Formula */}
                                        {hasL3 && (
                                          <div className="flex flex-wrap gap-x-6 gap-y-1 pl-1 text-xs">
                                            {c.componentType && (
                                              <span className="text-slate-500">Type: <span className="text-slate-300">{c.componentType}</span></span>
                                            )}
                                            {c.goal !== undefined && (
                                              <span className="text-slate-500">Goal: <span className="text-slate-300 font-mono">{c.goal.toLocaleString()}</span></span>
                                            )}
                                            {c.actual !== undefined && (
                                              <span className="text-slate-500">Actual: <span className="text-slate-300 font-mono">{c.actual.toLocaleString()}</span></span>
                                            )}
                                            {c.attainment !== undefined && (
                                              <span className="text-slate-500">Attainment: <span className={`font-mono ${c.attainment >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{c.attainment.toFixed(1)}%</span></span>
                                            )}
                                            {c.rate !== undefined && (
                                              <span className="text-slate-500">Rate: <span className="text-slate-300 font-mono">{(c.rate * 100).toFixed(1)}%</span></span>
                                            )}
                                            {c.formula && (
                                              <span className="text-slate-500">Formula: <span className="text-slate-300 font-mono">{c.formula}</span></span>
                                            )}
                                          </div>
                                        )}

                                        {/* L2: Metric values */}
                                        {hasL2 && (
                                          <div className="pl-1 pt-1 border-t border-slate-700/30">
                                            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Metrics</p>
                                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                                              {Object.entries(c.metrics!).map(([key, val]) => (
                                                <span key={key} className="text-slate-500">
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
                                <p className="text-sm text-slate-500">No component details available.</p>
                              )}

                              {/* L2: Raw metrics from calculation_results.metrics JSONB */}
                              {Object.keys(row.rawMetrics).length > 0 && (
                                <div className="pt-2 border-t border-slate-700/30">
                                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Raw Metrics</p>
                                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                                    {Object.entries(row.rawMetrics).map(([key, val]) => (
                                      <span key={key} className="text-slate-500">
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
    <RequireRole roles={['vl_admin', 'admin']}>
      <ResultsDashboardPageInner />
    </RequireRole>
  );
}
