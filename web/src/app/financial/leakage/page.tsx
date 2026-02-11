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

import { useState, useMemo } from 'react';
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
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useCurrency } from '@/contexts/tenant-context';

// Types
interface LeakageCategory {
  category: string;
  amount: number;
  count: number;
  trend: number;
}

interface LocationLeakage {
  id: string;
  name: string;
  brand: string;
  leakageAmount: number;
  leakageRate: number;
  threshold: number;
  status: 'ok' | 'warning' | 'critical';
  weeklyTrend: number[];
}

interface TrendPoint {
  period: string;
  amount: number;
  rate: number;
}

// Seed data
function generateLeakageCategories(): LeakageCategory[] {
  return [
    { category: 'Voids', amount: 4250, count: 42, trend: -8.5 },
    { category: 'Comps', amount: 3180, count: 28, trend: 2.1 },
    { category: 'Discounts', amount: 2890, count: 156, trend: -3.2 },
    { category: 'Refunds', amount: 1420, count: 18, trend: 12.4 },
    { category: 'Walkouts', amount: 680, count: 4, trend: -25.0 },
  ];
}

function generateLocationLeakage(): LocationLeakage[] {
  return [
    {
      id: 'LOC001',
      name: 'Polanco',
      brand: 'Taco Loco',
      leakageAmount: 2850,
      leakageRate: 2.1,
      threshold: 2.5,
      status: 'ok',
      weeklyTrend: [2.3, 2.2, 2.0, 2.1],
    },
    {
      id: 'LOC002',
      name: 'Condesa',
      brand: 'El Ranchero',
      leakageAmount: 3420,
      leakageRate: 2.8,
      threshold: 2.5,
      status: 'warning',
      weeklyTrend: [2.2, 2.4, 2.6, 2.8],
    },
    {
      id: 'LOC003',
      name: 'Roma Norte',
      brand: 'Taco Loco',
      leakageAmount: 1890,
      leakageRate: 1.8,
      threshold: 2.5,
      status: 'ok',
      weeklyTrend: [2.0, 1.9, 1.8, 1.8],
    },
    {
      id: 'LOC004',
      name: 'Santa Fe',
      brand: 'El Ranchero',
      leakageAmount: 4120,
      leakageRate: 3.4,
      threshold: 2.5,
      status: 'critical',
      weeklyTrend: [2.8, 3.0, 3.2, 3.4],
    },
    {
      id: 'LOC005',
      name: 'Coyoacan',
      brand: 'Taco Loco',
      leakageAmount: 2140,
      leakageRate: 2.3,
      threshold: 2.5,
      status: 'ok',
      weeklyTrend: [2.5, 2.4, 2.3, 2.3],
    },
  ];
}

function generateTrendData(): TrendPoint[] {
  return [
    { period: 'W1', amount: 11200, rate: 2.4 },
    { period: 'W2', amount: 12800, rate: 2.6 },
    { period: 'W3', amount: 11900, rate: 2.5 },
    { period: 'W4', amount: 12420, rate: 2.5 },
  ];
}

const STATUS_CONFIG = {
  ok: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  warning: { color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  critical: { color: 'bg-red-100 text-red-700', icon: ShieldAlert },
};

const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

export default function LeakageMonitorPage() {
  const [periodFilter, setPeriodFilter] = useState<string>('month');

  // Seed data
  const categories = useMemo(() => generateLeakageCategories(), []);
  const locations = useMemo(() => generateLocationLeakage(), []);
  const trendData = useMemo(() => generateTrendData(), []);

  // Summary stats
  const stats = useMemo(() => {
    const totalLeakage = categories.reduce((sum, c) => sum + c.amount, 0);
    const aboveThreshold = locations.filter(l => l.status !== 'ok').length;
    const topOffender = [...locations].sort((a, b) => b.leakageRate - a.leakageRate)[0];
    const avgRate = locations.reduce((sum, l) => sum + l.leakageRate, 0) / locations.length;
    const prevRate = 2.6; // Previous period
    const trendChange = ((avgRate - prevRate) / prevRate) * 100;

    return { totalLeakage, aboveThreshold, topOffender, avgRate, trendChange };
  }, [categories, locations]);

  // Pie chart data
  const pieData = categories.map(c => ({
    name: c.category,
    value: c.amount,
  }));

  const { format } = useCurrency();

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/financial" className="hover:text-foreground">Financial</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">Leakage</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leakage Monitor</h1>
          <p className="text-gray-600">Revenue leakage analytics and threshold monitoring</p>
        </div>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">This Quarter</SelectItem>
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
                <p className="text-sm text-gray-600">Total Leakage</p>
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
                <p className="text-sm text-gray-600">Above Threshold</p>
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
                <p className="text-sm text-gray-600">Rate Trend</p>
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
                <p className="text-sm text-gray-600">Highest Rate</p>
                <p className="text-lg font-bold">{stats.topOffender.name}</p>
                <p className="text-sm text-red-600">{stats.topOffender.leakageRate.toFixed(1)}%</p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="period" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" tickFormatter={(v) => format(v)} />
                  <Tooltip
                    formatter={(value: number) => [format(value), 'Leakage']}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
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
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${STATUS_CONFIG[loc.status].color}`}>
                        <StatusIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium">{loc.name}</div>
                        <div className="text-sm text-gray-500">{loc.brand}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Leakage Amount */}
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Amount</div>
                        <div className="font-medium">{format(loc.leakageAmount)}</div>
                      </div>

                      {/* Rate vs Threshold */}
                      <div className="text-right w-24">
                        <div className="text-sm text-gray-500">Rate / Threshold</div>
                        <div className="flex items-center gap-1">
                          <span className={`font-medium ${
                            loc.leakageRate > loc.threshold ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {loc.leakageRate.toFixed(1)}%
                          </span>
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-600">{loc.threshold}%</span>
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
