'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import {
  getLatestSummary,
  buildCalculationSummary,
  saveSummary,
  generateAIBriefing,
  type CalculationSummary,
} from '@/lib/calculation/calculation-summary-service';
import { getTraces } from '@/lib/forensics/forensics-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart3, Users, DollarSign, TrendingUp, AlertTriangle,
  Search, Sparkles, ArrowLeft, Scale,
} from 'lucide-react';

export default function ResultsDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const [summary, setSummary] = useState<CalculationSummary | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const hasAccess = user && isVLAdmin(user);
  const tenantId = currentTenant?.id || '';

  // Load or build summary
  useEffect(() => {
    if (!tenantId) return;

    let loaded = getLatestSummary(tenantId);
    if (!loaded) {
      // Try building from traces
      const traces = getTraces(tenantId);
      if (traces.length > 0) {
        const runId = traces[0]?.calculationRunId || 'unknown';
        loaded = buildCalculationSummary(traces, runId, tenantId, 'current');
        saveSummary(loaded);
      }
    }
    if (loaded) {
      setSummary(loaded);
      if (loaded.aiBriefing) {
        setBriefing(loaded.aiBriefing);
      }
    }
  }, [tenantId]);

  // Generate AI briefing on demand
  const handleGenerateBriefing = async () => {
    if (!summary || !tenantId) return;
    setBriefingLoading(true);
    try {
      const text = await generateAIBriefing(summary, tenantId);
      setBriefing(text);
      if (text) {
        const updated = { ...summary, aiBriefing: text, aiBriefingAvailable: true };
        setSummary(updated);
        saveSummary(updated);
      }
    } catch {
      // Graceful degradation
    } finally {
      setBriefingLoading(false);
    }
  };

  // Build employee rows from traces for the table (dynamic columns from summary)
  const traces = useMemo(() => {
    if (!tenantId) return [];
    return getTraces(tenantId);
  }, [tenantId]);

  const filteredTraces = useMemo(() => {
    let filtered = traces;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.employeeId.toLowerCase().includes(q) ||
        t.employeeName.toLowerCase().includes(q) ||
        (t.storeId || '').toLowerCase().includes(q)
      );
    }
    if (storeFilter !== 'all') {
      filtered = filtered.filter(t => t.storeId === storeFilter);
    }
    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (sortField === 'total') {
        return sortDir === 'desc' ? b.totalIncentive - a.totalIncentive : a.totalIncentive - b.totalIncentive;
      }
      if (sortField === 'name') {
        return sortDir === 'desc'
          ? b.employeeName.localeCompare(a.employeeName)
          : a.employeeName.localeCompare(b.employeeName);
      }
      return 0;
    });
    return filtered;
  }, [traces, searchQuery, storeFilter, sortField, sortDir]);

  // Unique stores for filter
  const storeIds = useMemo(() => {
    const ids = Array.from(new Set(traces.map(t => t.storeId || 'unknown')));
    return ids.sort();
  }, [traces]);

  // Component columns (dynamic from summary)
  const componentColumns = summary?.componentTotals || [];

  // Outlier IDs for highlighting
  const outlierIds = useMemo(() => {
    if (!summary) return new Set<string>();
    return new Set(summary.outliers.map(o => o.employeeId));
  }, [summary]);

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

  if (!summary) {
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
            {summary.employeeCount} employees | Run: {summary.runId.slice(0, 8)}
          </p>
        </div>
      </div>

      {/* Section 1: AI Briefing Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Sparkles className="h-5 w-5" />
            AI Briefing
          </CardTitle>
        </CardHeader>
        <CardContent>
          {briefing ? (
            <p className="text-sm text-blue-900 whitespace-pre-line">{briefing}</p>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-blue-700">
                {briefingLoading ? 'Generating analysis...' : 'AI analysis unavailable.'}
              </p>
              {!briefingLoading && (
                <Button size="sm" variant="outline" onClick={handleGenerateBriefing}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Generate
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-emerald-100">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Payout</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.totalPayout)}</p>
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
                <p className="text-sm text-slate-500">Employees</p>
                <p className="text-2xl font-bold">{summary.employeeCount}</p>
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
                <p className="text-2xl font-bold">{formatCurrency(summary.averagePayout)}</p>
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
                <p className="text-2xl font-bold">{componentColumns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Component Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Component Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {componentColumns.map(comp => {
              const maxTotal = Math.max(...componentColumns.map(c => c.total), 1);
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
                    {comp.employeeCount} emp
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Store Breakdown (top 20) */}
      <Card>
        <CardHeader>
          <CardTitle>Store Breakdown (Top 20)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {summary.storeTotals.slice(0, 20).map(store => {
              const maxStore = Math.max(...summary.storeTotals.slice(0, 20).map(s => s.total), 1);
              const widthPct = (store.total / maxStore) * 100;
              return (
                <div
                  key={store.storeId}
                  className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded p-1"
                  onClick={() => setStoreFilter(store.storeId)}
                >
                  <span className="text-sm font-mono w-20">{store.storeId}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
                    <div
                      className="bg-purple-500 h-5 rounded-full"
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium">
                      {formatCurrency(store.total)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 w-12 text-right">{store.employeeCount}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Variant Distribution */}
      {summary.variantDistribution.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Variant Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {summary.variantDistribution.map(v => (
                <div key={v.variant} className="border rounded-lg p-4">
                  <p className="font-medium">{v.variant}</p>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                    <div>
                      <p className="text-slate-500">Count</p>
                      <p className="font-bold">{v.count}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Total</p>
                      <p className="font-bold">{formatCurrency(v.totalPayout)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Avg</p>
                      <p className="font-bold">{formatCurrency(v.avgPayout)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 7: Outlier Alert */}
      {summary.outliers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">
                {summary.outliers.length} employee{summary.outliers.length > 1 ? 's' : ''} with payouts more than 3 standard deviations from the mean. Review before approval.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 6: Employee Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Results</CardTitle>
          <div className="flex gap-3 mt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search employee..."
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
                    Employee
                  </TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Variant</TableHead>
                  {/* Dynamic component columns */}
                  {componentColumns.map(cc => (
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
                {filteredTraces.slice(0, 100).map(trace => {
                  const isOutlier = outlierIds.has(trace.employeeId);
                  return (
                    <TableRow
                      key={trace.traceId}
                      className={`cursor-pointer hover:bg-slate-50 ${isOutlier ? 'bg-amber-50' : ''}`}
                      onClick={() => router.push(`/investigate/trace/${trace.employeeId}`)}
                    >
                      <TableCell>
                        <div>
                          <span className="font-medium">{trace.employeeName}</span>
                          {isOutlier && <Badge className="ml-2 bg-amber-100 text-amber-700 text-xs">Outlier</Badge>}
                          <p className="text-xs text-slate-400">{trace.employeeId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{trace.storeId || '-'}</TableCell>
                      <TableCell className="text-sm">{trace.variant?.variantName || '-'}</TableCell>
                      {componentColumns.map(cc => {
                        const comp = trace.components.find(c => c.componentId === cc.componentId);
                        return (
                          <TableCell key={cc.componentId} className="text-right text-sm">
                            {comp ? formatCurrency(comp.outputValue) : '-'}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-bold">
                        {formatCurrency(trace.totalIncentive)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredTraces.length > 100 && (
              <p className="text-sm text-slate-400 mt-2 text-center">
                Showing 100 of {filteredTraces.length} employees
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
