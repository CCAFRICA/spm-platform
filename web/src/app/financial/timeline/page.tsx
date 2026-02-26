'use client';

/**
 * Revenue Timeline Page
 *
 * Configurable time-series chart with:
 * - Granularity controls (day/week/month)
 * - Metric selector (revenue, checks, avgCheck, tips)
 * - Scope filter (all, by brand, by location)
 * - Multi-line comparison mode
 *
 * Uses seed data when no real data exists.
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Percent,
  Activity,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { loadTimelineData, type TimelinePageData, type TimelinePoint, type FinancialScope } from '@/lib/financial/financial-data-service';

type Granularity = 'day' | 'week' | 'month';
type Metric = 'revenue' | 'checks' | 'avgCheck' | 'tips';
type Scope = 'all' | 'brand';

const COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
};

export default function RevenueTimelinePage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { scope: personaScope } = usePersona();

  const financialScope: FinancialScope | undefined = useMemo(() => {
    if (personaScope.canSeeAll) return undefined;
    if (personaScope.entityIds.length > 0) return { scopeEntityIds: personaScope.entityIds };
    return undefined;
  }, [personaScope]);

  const [granularity, setGranularity] = useState<Granularity>('week');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [scope, setScope] = useState<Scope>('all');
  const [loading, setLoading] = useState(true);
  const [timelineData, setTimelineData] = useState<TimelinePageData | null>(null);
  const { format, symbol } = useCurrency();

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    loadTimelineData(tenantId, granularity, financialScope)
      .then(result => { if (!cancelled) setTimelineData(result); })
      .catch(err => console.error('Failed to load timeline data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, granularity, financialScope]);

  const METRIC_CONFIG = {
    revenue: { label: 'Revenue', format: (v: number) => format(v), icon: DollarSign },
    checks: { label: 'Checks Served', format: (v: number) => v.toLocaleString(), icon: Receipt },
    avgCheck: { label: 'Avg Check', format: (v: number) => format(v), icon: TrendingUp },
    tips: { label: 'Tips', format: (v: number) => format(v), icon: Percent },
  };

  const chartData: TimelinePoint[] = timelineData?.data ?? [];

  // Calculate summary stats
  const stats = useMemo(() => {
    if (chartData.length === 0) return { total: 0, change: 0, avg: 0 };
    const total = chartData.reduce((sum, d) => sum + d[metric], 0);
    const first = chartData[0][metric];
    const last = chartData[chartData.length - 1][metric];
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { total, change, avg: total / chartData.length };
  }, [chartData, metric]);

  const metricConfig = METRIC_CONFIG[metric];

  // Brand comparison data
  const brandChartData = useMemo(() => {
    if (scope !== 'brand' || !timelineData) return [];
    return timelineData.brandData;
  }, [scope, timelineData]);

  const brandNames = timelineData?.brandNames ?? [];
  const brandColors = timelineData?.brandColors ?? {};

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!timelineData) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Data</h2>
            <p className="text-muted-foreground">Import POS data to see revenue timeline.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Deterministic commentary (PG-44)
  const commentaryLines: string[] = [];
  if (chartData.length > 0) {
    commentaryLines.push(
      `Total ${metricConfig.label}: ${metric === 'avgCheck' ? metricConfig.format(stats.avg) : metricConfig.format(stats.total)} over ${chartData.length} ${granularity === 'day' ? 'days' : granularity === 'week' ? 'weeks' : 'months'}.`
    );
    if (stats.change !== 0) {
      commentaryLines.push(
        `Period change: ${stats.change > 0 ? '+' : ''}${stats.change.toFixed(1)}% from first to last ${granularity}.`
      );
    }
    if (chartData.length >= 2) {
      const peak = chartData.reduce((best, d) => d[metric] > best[metric] ? d : best, chartData[0]);
      commentaryLines.push(`Peak ${granularity}: ${peak.label} (${metricConfig.format(peak[metric])}).`);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Revenue Timeline</h1>
        <p className="text-zinc-400">Track financial performance over time</p>
      </div>

      {/* Commentary (PG-44) */}
      {commentaryLines.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Observations</p>
            <div className="space-y-1">
              {commentaryLines.map((line, i) => (
                <p key={i} className={`text-sm ${i === 0 ? 'text-zinc-200' : 'text-zinc-400'}`}>
                  {i > 0 && <span className="text-zinc-600 mr-1">{'\u00B7'}</span>}
                  {line}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <metricConfig.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">
                  Total {metricConfig.label} ({granularity === 'day' ? 'Week' : granularity === 'week' ? 'Month' : '6 Months'})
                </p>
                <p className="text-2xl font-bold">
                  {metric === 'avgCheck'
                    ? format(stats.avg)
                    : metricConfig.format(stats.total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.change >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                {stats.change >= 0
                  ? <TrendingUp className="w-5 h-5 text-green-600" />
                  : <TrendingDown className="w-5 h-5 text-red-600" />
                }
              </div>
              <div>
                <p className="text-sm text-zinc-400">Period Change</p>
                <p className={`text-2xl font-bold ${stats.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Average per {granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month'}</p>
                <p className="text-2xl font-bold">{metricConfig.format(stats.avg)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle>Performance Trend</CardTitle>
            <div className="flex items-center gap-4">
              {/* Granularity */}
              <Tabs value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
                <TabsList>
                  <TabsTrigger value="day">Daily</TabsTrigger>
                  <TabsTrigger value="week">Weekly</TabsTrigger>
                  <TabsTrigger value="month">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Metric */}
              <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="checks">Checks Served</SelectItem>
                  <SelectItem value="avgCheck">Avg Check</SelectItem>
                  <SelectItem value="tips">Tips</SelectItem>
                </SelectContent>
              </Select>

              {/* Scope */}
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Network</SelectItem>
                  <SelectItem value="brand">By Brand</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {scope === 'all' ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis
                    stroke="#6b7280"
                    tickFormatter={(v) => metric === 'revenue' || metric === 'tips'
                      ? `${symbol}${(v / 1000).toFixed(0)}K`
                      : v.toLocaleString()
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => [metricConfig.format(value), metricConfig.label]}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke={COLORS.primary}
                    fill={COLORS.primary}
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              ) : (
                <LineChart data={brandChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis
                    stroke="#6b7280"
                    tickFormatter={(v) => metric === 'revenue' || metric === 'tips'
                      ? `${symbol}${(v / 1000).toFixed(0)}K`
                      : v.toLocaleString()
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => [metricConfig.format(value), '']}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  {brandNames.map((name, i) => {
                    const color = brandColors[name] || ['#ef4444', '#22c55e', '#3b82f6'][i % 3];
                    return (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ fill: color }}
                      />
                    );
                  })}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Period Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-zinc-400">Period</th>
                  <th className="text-right py-2 font-medium text-zinc-400">Revenue</th>
                  <th className="text-right py-2 font-medium text-zinc-400">Checks</th>
                  <th className="text-right py-2 font-medium text-zinc-400">Avg Check</th>
                  <th className="text-right py-2 font-medium text-zinc-400">Tips</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="py-2 text-right">{format(row.revenue)}</td>
                    <td className="py-2 text-right">{row.checks}</td>
                    <td className="py-2 text-right">{format(row.avgCheck)}</td>
                    <td className="py-2 text-right">{format(row.tips)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
