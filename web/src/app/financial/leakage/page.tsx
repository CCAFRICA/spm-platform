'use client';

/**
 * Leakage Monitor Page
 *
 * Analytics view (NOT approval queue) showing:
 * - 4 Summary cards (total leakage, threshold status, trend, top offender)
 * - Threshold monitoring with visual indicators
 * - Leakage by category breakdown
 * - Location leakage rankings
 * - Time-series trend
 *
 * Uses seed data when no real data exists.
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  MapPin,
  ShieldAlert,
  CheckCircle,
  Activity,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { loadLeakageData, type LeakagePageData } from '@/lib/financial/financial-data-service';

const STATUS_CONFIG = {
  ok: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  warning: { color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  critical: { color: 'bg-red-100 text-red-700', icon: ShieldAlert },
};

const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

export default function LeakageMonitorPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const [periodFilter, setPeriodFilter] = useState<string>('full');
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<LeakagePageData | null>(null);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    loadLeakageData(tenantId)
      .then(result => { if (!cancelled) setPageData(result); })
      .catch(err => console.error('Failed to load leakage data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const categories = pageData?.categories ?? [];
  const locations = pageData?.locations ?? [];
  const trendData = pageData?.trend ?? [];

  // Summary stats
  const stats = useMemo(() => {
    const totalLeakage = categories.reduce((sum, c) => sum + c.amount, 0);
    const aboveThreshold = locations.filter(l => l.status !== 'ok').length;
    const topOffender = [...locations].sort((a, b) => b.leakageRate - a.leakageRate)[0];
    const avgRate = locations.length > 0 ? locations.reduce((sum, l) => sum + l.leakageRate, 0) / locations.length : 0;
    const prevRate = trendData.length > 1 ? trendData[trendData.length - 2]?.rate || 2.6 : 2.6;
    const currentRate = trendData.length > 0 ? trendData[trendData.length - 1]?.rate || avgRate : avgRate;
    const trendChange = prevRate > 0 ? ((currentRate - prevRate) / prevRate) * 100 : 0;

    return { totalLeakage, aboveThreshold, topOffender, avgRate, trendChange };
  }, [categories, locations, trendData]);

  // Pie chart data
  const pieData = categories.map(c => ({
    name: c.category,
    value: c.amount,
  }));

  const { format } = useCurrency();

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Financial Data</h2>
            <p className="text-muted-foreground">Import POS data to see leakage analytics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Leakage Monitor</h1>
          <p className="text-zinc-400">Revenue leakage analytics and threshold monitoring</p>
        </div>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">Full Period</SelectItem>
            <SelectItem value="w1">Week 1</SelectItem>
            <SelectItem value="w2">Week 2</SelectItem>
            <SelectItem value="w3">Week 3</SelectItem>
            <SelectItem value="w4">Week 4</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Leakage */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Total Leakage</p>
                <p className="text-2xl font-bold text-red-600">
                  {format(stats.totalLeakage)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Threshold Status */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.aboveThreshold > 0 ? 'bg-amber-100' : 'bg-green-100'}`}>
                <AlertTriangle className={`w-5 h-5 ${stats.aboveThreshold > 0 ? 'text-amber-600' : 'text-green-600'}`} />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Above Threshold</p>
                <p className="text-2xl font-bold">
                  {stats.aboveThreshold} of {locations.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trend */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.trendChange <= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                {stats.trendChange <= 0
                  ? <TrendingDown className="w-5 h-5 text-green-600" />
                  : <TrendingUp className="w-5 h-5 text-red-600" />
                }
              </div>
              <div>
                <p className="text-sm text-zinc-400">Rate Trend</p>
                <p className={`text-2xl font-bold ${stats.trendChange <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.trendChange <= 0 ? '' : '+'}{stats.trendChange.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Offender */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Highest Rate</p>
                <p className="text-lg font-bold">{stats.topOffender?.name ?? '—'}</p>
                <p className="text-sm text-red-600">{stats.topOffender?.leakageRate.toFixed(1) ?? '0.0'}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leakage by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Leakage by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [format(value), 'Amount']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {categories.map((cat, i) => (
                  <div key={cat.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[i] }}
                      />
                      <span className="text-sm">{cat.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{format(cat.amount)}</span>
                      <span className={`text-xs ${cat.trend <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {cat.trend <= 0 ? '' : '+'}{cat.trend.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Leakage Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="period" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" tickFormatter={(v) => format(v)} />
                  <Tooltip
                    formatter={(value: number) => [format(value), 'Leakage']}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location Rankings */}
      <Card>
        <CardHeader>
          <CardTitle>Location Leakage Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...locations]
              .sort((a, b) => b.leakageRate - a.leakageRate)
              .map((loc) => {
                const StatusIcon = STATUS_CONFIG[loc.status].icon;
                const trendData = loc.weeklyTrend.map((v, i) => ({ week: i, value: v }));
                const improving = loc.weeklyTrend[3] < loc.weeklyTrend[0];

                return (
                  <div
                    key={loc.id}
                    className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${STATUS_CONFIG[loc.status].color}`}>
                        <StatusIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium">{loc.name}</div>
                        <div className="text-sm text-zinc-500">{loc.brand}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Leakage Amount */}
                      <div className="text-right">
                        <div className="text-sm text-zinc-500">Amount</div>
                        <div className="font-medium">{format(loc.leakageAmount)}</div>
                      </div>

                      {/* Rate vs Threshold */}
                      <div className="text-right w-24">
                        <div className="text-sm text-zinc-500">Rate / Threshold</div>
                        <div className="flex items-center gap-1">
                          <span className={`font-medium ${
                            loc.leakageRate > loc.threshold ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {loc.leakageRate.toFixed(1)}%
                          </span>
                          <span className="text-zinc-500">/</span>
                          <span className="text-zinc-400">{loc.threshold}%</span>
                        </div>
                      </div>

                      {/* Mini Trend */}
                      <div className="w-20 h-8">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke={improving ? '#22c55e' : '#ef4444'}
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Status Badge */}
                      <Badge className={STATUS_CONFIG[loc.status].color}>
                        {loc.status === 'ok' ? 'On Target' :
                         loc.status === 'warning' ? 'Warning' : 'Critical'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
