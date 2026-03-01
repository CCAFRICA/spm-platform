'use client';

// PlanResults — Outcome summary + entity table + component drill-down for a single plan
// OB-130 Phase 3 — Zero domain vocabulary. Korean Test applies.

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Search,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Users,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/lib/supabase/database.types';

type CalcResultRow = Database['public']['Tables']['calculation_results']['Row'];

interface ComponentDetail {
  componentId: string;
  componentName: string;
  componentType: string;
  outputValue: number;
  goal?: number;
  actual?: number;
  attainment?: number;
  formula?: string;
  rate?: number;
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
}

interface ComponentTotal {
  componentId: string;
  componentName: string;
  total: number;
  entityCount: number;
}

interface PlanResultsProps {
  planName: string;
  results: CalcResultRow[];
  formatCurrency: (value: number) => string;
  lifecycleState?: string;
  batchDate?: string;
  onClose: () => void;
}

function mapResults(results: CalcResultRow[]): ResultRow[] {
  return results.map((r) => {
    const comps = Array.isArray(r.components) ? r.components : [];
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
}

export function PlanResults({
  planName,
  results,
  formatCurrency,
  lifecycleState,
  batchDate,
  onClose,
}: PlanResultsProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'total'>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const rows = useMemo(() => mapResults(results), [results]);

  const totalPayout = useMemo(() => rows.reduce((sum, r) => sum + r.totalPayout, 0), [rows]);
  const entityCount = rows.length;
  const avgPayout = entityCount > 0 ? totalPayout / entityCount : 0;

  // Component totals
  const componentTotals = useMemo((): ComponentTotal[] => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const r of rows) {
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
  }, [rows]);

  // Filter + sort
  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.externalId.toLowerCase().includes(q) ||
        r.entityName.toLowerCase().includes(q) ||
        r.storeId.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => {
      if (sortField === 'total') {
        return sortDir === 'desc' ? b.totalPayout - a.totalPayout : a.totalPayout - b.totalPayout;
      }
      return sortDir === 'desc'
        ? b.entityName.localeCompare(a.entityName)
        : a.entityName.localeCompare(b.entityName);
    });
  }, [rows, searchQuery, sortField, sortDir]);

  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 text-zinc-500" />
          <p className="text-sm text-zinc-400">No results yet for this plan.</p>
          <p className="text-xs text-zinc-600 mt-1">Select a period and calculate to see results.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200">{planName}</h2>
          <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
            <span>{entityCount} entities</span>
            <span className="text-zinc-700">&middot;</span>
            <span>{componentTotals.length} components</span>
            {lifecycleState && (
              <>
                <span className="text-zinc-700">&middot;</span>
                <Badge variant="outline" className="text-[10px]">{lifecycleState}</Badge>
              </>
            )}
            {batchDate && (
              <>
                <span className="text-zinc-700">&middot;</span>
                <span>{new Date(batchDate).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
          Close
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 bg-zinc-800/50 border border-zinc-700/50">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Entities</p>
          <p className="text-xl font-bold text-zinc-200 mt-1">{entityCount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl p-4 bg-zinc-800/50 border border-zinc-700/50">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(totalPayout)}</p>
        </div>
        <div className="rounded-xl p-4 bg-zinc-800/50 border border-zinc-700/50">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Average</p>
          <p className="text-xl font-bold text-zinc-200 mt-1">{formatCurrency(avgPayout)}</p>
        </div>
      </div>

      {/* Component breakdown */}
      {componentTotals.length > 0 && (
        <div className="rounded-xl p-4 bg-zinc-800/30 border border-zinc-700/50">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Component Breakdown</p>
          <div className="space-y-2">
            {componentTotals.map(comp => {
              const pct = totalPayout > 0 ? (comp.total / totalPayout) * 100 : 0;
              return (
                <div key={comp.componentId} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-32 truncate" title={comp.componentName}>
                    {comp.componentName}
                  </span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-500/60 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-300 w-24 text-right font-mono">
                    {formatCurrency(comp.total)}
                  </span>
                  <span className="text-[10px] text-zinc-600 w-10 text-right">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entity table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Entity Results
            </CardTitle>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-zinc-800/50 text-xs"
                    onClick={() => { setSortField('name'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                  >
                    ID
                  </TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  {componentTotals.map(cc => (
                    <TableHead key={cc.componentId} className="text-right text-xs">
                      {cc.componentName}
                    </TableHead>
                  ))}
                  <TableHead
                    className="text-right cursor-pointer hover:bg-zinc-800/50 text-xs"
                    onClick={() => { setSortField('total'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                  >
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map(row => {
                  const isExpanded = expandedEntity === row.entityId;
                  return (
                    <React.Fragment key={row.entityId}>
                      <TableRow
                        className="cursor-pointer hover:bg-zinc-800/50"
                        onClick={() => setExpandedEntity(isExpanded ? null : row.entityId)}
                      >
                        <TableCell className="w-8 px-2">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                            : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono font-medium">
                            {row.externalId || row.entityId.slice(0, 8)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 truncate max-w-[160px]" title={row.entityName}>
                          {row.entityName !== row.externalId ? row.entityName : '-'}
                        </TableCell>
                        {componentTotals.map(cc => {
                          const comp = row.components.find(c => c.componentId === cc.componentId);
                          return (
                            <TableCell key={cc.componentId} className="text-right text-xs">
                              {comp ? formatCurrency(comp.outputValue) : '-'}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right text-xs font-bold">
                          {formatCurrency(row.totalPayout)}
                        </TableCell>
                      </TableRow>

                      {/* Expanded: component drill-down */}
                      {isExpanded && (
                        <TableRow className="bg-zinc-900/50">
                          <TableCell colSpan={componentTotals.length + 4} className="p-0">
                            <div className="px-8 py-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Detail — {row.entityName}
                                  </p>
                                  {row.overallAttainment !== null && (
                                    <span className={cn(
                                      'text-xs font-medium px-2 py-0.5 rounded',
                                      row.overallAttainment >= 100
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : row.overallAttainment >= 80
                                          ? 'bg-amber-500/10 text-amber-400'
                                          : 'bg-red-500/10 text-red-400'
                                    )}>
                                      {row.overallAttainment.toFixed(1)}% attainment
                                    </span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs"
                                  onClick={(e) => { e.stopPropagation(); router.push(`/investigate/trace/${row.entityId}?from=calculate`); }}
                                >
                                  Full Trace &rarr;
                                </Button>
                              </div>

                              {row.components.length > 0 ? (
                                <div className="space-y-2">
                                  {row.components.map(c => {
                                    const pct = row.totalPayout > 0 ? (c.outputValue / row.totalPayout) * 100 : 0;
                                    const hasDetail = c.goal !== undefined || c.actual !== undefined || c.attainment !== undefined || c.formula;
                                    const hasMetrics = c.metrics && Object.keys(c.metrics).length > 0;
                                    return (
                                      <div key={c.componentId} className="rounded-lg border border-zinc-700/50 p-3 space-y-2">
                                        <div className="flex items-center gap-3">
                                          <span className="text-xs font-medium w-32 truncate" title={c.componentName}>
                                            {c.componentName}
                                          </span>
                                          <div className="flex-1 bg-zinc-800 rounded-full h-3 overflow-hidden">
                                            <div
                                              className="bg-indigo-500/60 h-3 rounded-full transition-all"
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-medium w-20 text-right">
                                            {formatCurrency(c.outputValue)}
                                          </span>
                                          <span className="text-[10px] text-zinc-500 w-10 text-right">
                                            {pct.toFixed(0)}%
                                          </span>
                                        </div>

                                        {hasDetail && (
                                          <div className="flex flex-wrap gap-x-5 gap-y-1 pl-1 text-xs">
                                            {c.componentType && (
                                              <span className="text-zinc-500">Type: <span className="text-zinc-300">{c.componentType}</span></span>
                                            )}
                                            {c.goal !== undefined && (
                                              <span className="text-zinc-500">Goal: <span className="text-zinc-300 font-mono">{c.goal.toLocaleString()}</span></span>
                                            )}
                                            {c.actual !== undefined && (
                                              <span className="text-zinc-500">Actual: <span className="text-zinc-300 font-mono">{c.actual.toLocaleString()}</span></span>
                                            )}
                                            {c.attainment !== undefined && (
                                              <span className="text-zinc-500">Attainment: <span className={cn('font-mono', c.attainment >= 100 ? 'text-emerald-400' : 'text-amber-400')}>{c.attainment.toFixed(1)}%</span></span>
                                            )}
                                            {c.rate !== undefined && (
                                              <span className="text-zinc-500">Rate: <span className="text-zinc-300 font-mono">{(c.rate * 100).toFixed(1)}%</span></span>
                                            )}
                                            {c.formula && (
                                              <span className="text-zinc-500">Formula: <span className="text-zinc-300 font-mono">{c.formula}</span></span>
                                            )}
                                          </div>
                                        )}

                                        {hasMetrics && (
                                          <div className="pl-1 pt-1 border-t border-zinc-700/30">
                                            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Metrics</p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                              {Object.entries(c.metrics!).map(([key, val]) => (
                                                <span key={key} className="text-zinc-500">
                                                  {key}: <span className="text-zinc-300 font-mono">
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
                                <p className="text-xs text-zinc-500">No component details available.</p>
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
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <p className="text-xs text-zinc-500">
                {(currentPage - 1) * pageSize + 1}&ndash;{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="h-7 w-7 p-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-zinc-400">{currentPage}/{totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="h-7 w-7 p-0"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
