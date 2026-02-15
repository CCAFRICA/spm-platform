'use client';

/**
 * Results Dashboard — Reads from Supabase calculation_results.
 *
 * Shows calculation results summary, component breakdown, and entity table.
 * All data comes from Supabase calculation_batches + calculation_results.
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import {
  listCalculationBatches,
  getCalculationResults,
} from '@/lib/supabase/calculation-service';
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
  Search, ArrowLeft, Scale,
} from 'lucide-react';

type CalcResultRow = Database['public']['Tables']['calculation_results']['Row'];

interface ComponentTotal {
  componentId: string;
  componentName: string;
  total: number;
  entityCount: number;
}

interface ResultRow {
  entityId: string;
  entityName: string;
  storeId: string;
  totalPayout: number;
  components: Array<{ componentId: string; componentName: string; outputValue: number }>;
}

export default function ResultsDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const [results, setResults] = useState<ResultRow[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [batchId, setBatchId] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  const hasAccess = user && isVLAdmin(user);
  const tenantId = currentTenant?.id || '';

  // Load results from Supabase
  useEffect(() => {
    if (!tenantId) return;

    const loadData = async () => {
      try {
        // Get latest batch
        const batches = await listCalculationBatches(tenantId);
        if (batches.length === 0) {
          setIsLoaded(true);
          return;
        }

        const batch = batches[0];
        setBatchId(batch.id);

        // Get results for this batch
        const calcResults = await getCalculationResults(tenantId, batch.id);

        // Map to display format
        const rows: ResultRow[] = calcResults.map((r: CalcResultRow) => {
          const comps = Array.isArray(r.components) ? r.components : [];
          return {
            entityId: r.entity_id,
            entityName: (r.metadata as Record<string, unknown>)?.entityName as string || r.entity_id,
            storeId: (r.metadata as Record<string, unknown>)?.storeId as string || '',
            totalPayout: r.total_payout || 0,
            components: comps.map((c: unknown) => {
              const comp = c as Record<string, unknown>;
              return {
                componentId: String(comp.componentId || comp.component_id || ''),
                componentName: String(comp.componentName || comp.component_name || ''),
                outputValue: Number(comp.outputValue || comp.output_value || 0),
              };
            }),
          };
        });

        setResults(rows);
        setTotalPayout(rows.reduce((sum, r) => sum + r.totalPayout, 0));
        setIsLoaded(true);
      } catch (err) {
        console.warn('[Results] Failed to load results:', err);
        setIsLoaded(true);
      }
    };

    loadData();
  }, [tenantId]);

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
        r.entityId.toLowerCase().includes(q) ||
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
            <p className="text-sm mt-1">Run a calculation first to see results here.</p>
            <Button className="mt-4" onClick={() => router.push('/operate/calculate')}>
              Go to Calculate
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const entityCount = results.length;
  const avgPayout = entityCount > 0 ? totalPayout / entityCount : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/operate')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Results Dashboard</h1>
          <p className="text-slate-500 text-sm">
            {entityCount} entities | Batch: {batchId.slice(0, 8)}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-emerald-100">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Payout</p>
                <p className="text-2xl font-bold">{formatCurrency(totalPayout)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Entities</p>
                <p className="text-2xl font-bold">{entityCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-100">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Average Payout</p>
                <p className="text-2xl font-bold">{formatCurrency(avgPayout)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-100">
                <Scale className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Components</p>
                <p className="text-2xl font-bold">{componentTotals.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => { setSortField('name'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                  >
                    Entity
                  </TableHead>
                  <TableHead>Store</TableHead>
                  {componentTotals.map(cc => (
                    <TableHead key={cc.componentId} className="text-right">
                      <span className="text-xs">{cc.componentName}</span>
                    </TableHead>
                  ))}
                  <TableHead
                    className="text-right cursor-pointer hover:bg-slate-50"
                    onClick={() => { setSortField('total'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                  >
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.slice(0, 100).map(row => (
                  <TableRow
                    key={row.entityId}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/investigate/trace/${row.entityId}?from=results`)}
                  >
                    <TableCell>
                      <div>
                        <span className="font-medium">{row.entityName}</span>
                        <p className="text-xs text-slate-400">{row.entityId}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.storeId || '-'}</TableCell>
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
                ))}
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
  );
}
