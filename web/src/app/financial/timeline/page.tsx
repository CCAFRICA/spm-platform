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

import { useState, useMemo } from 'react';
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
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useCurrency } from '@/contexts/tenant-context';

// Types
type Granularity = 'day' | 'week' | 'month';
type Metric = 'revenue' | 'checks' | 'avgCheck' | 'tips';
type Scope = 'all' | 'brand' | 'location';

interface DataPoint {
  label: string;
  revenue: number;
  checks: number;
  avgCheck: number;
  tips: number;
}

interface BrandDataPoint extends DataPoint {
  brand: string;
}

// Seed data generators
function generateDailyData(): DataPoint[] {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((day, i) => {
    const base = 12000 + (i >= 4 ? 8000 : 0); // Weekend boost
    const variance = Math.sin(i * 0.7) * 2000;
    const revenue = base + variance;
    const checks = Math.floor(revenue / 95);
    return {
      label: day,
      revenue: Math.round(revenue),
      checks,
      avgCheck: revenue / checks,
      tips: Math.round(revenue * 0.15),
    };
  });
}

function generateWeeklyData(): DataPoint[] {
  const weeks = ['W1', 'W2', 'W3', 'W4'];
  return weeks.map((week, i) => {
    const trend = 1 + i * 0.03; // 3% growth each week
    const base = 85000 * trend;
    const variance = Math.sin(i * 1.2) * 5000;
    const revenue = base + variance;
    const checks = Math.floor(revenue / 98);
    return {
      label: week,
      revenue: Math.round(revenue),
      checks,
      avgCheck: revenue / checks,
      tips: Math.round(revenue * 0.148),
    };
  });
}

function generateMonthlyData(): DataPoint[] {
  const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
  return months.map((month, i) => {
    const seasonality = 1 + Math.sin((i - 2) * 0.5) * 0.15; // Peak in Dec
    const base = 345000 * seasonality;
    const revenue = base;
    const checks = Math.floor(revenue / 102);
    return {
      label: month,
      revenue: Math.round(revenue),
      checks,
      avgCheck: revenue / checks,
      tips: Math.round(revenue * 0.145),
    };
  });
}

function generateBrandData(granularity: Granularity): BrandDataPoint[] {
  const baseData = granularity === 'day' ? generateDailyData() :
                   granularity === 'week' ? generateWeeklyData() :
                   generateMonthlyData();

  const brands = ['Taco Loco', 'El Ranchero'];
  const brandMultipliers = [0.6, 0.4]; // 60/40 split

  const result: BrandDataPoint[] = [];

  brands.forEach((brand, bi) => {
    baseData.forEach(point => {
      result.push({
        ...point,
        brand,
        revenue: Math.round(point.revenue * brandMultipliers[bi]),
        checks: Math.round(point.checks * brandMultipliers[bi]),
        avgCheck: point.avgCheck * (bi === 0 ? 1.1 : 0.9), // Taco Loco higher avg
        tips: Math.round(point.tips * brandMultipliers[bi]),
      });
    });
  });

  return result;
}

const COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  tertiary: '#f59e0b',
  brands: {
    'Taco Loco': '#ef4444',
    'El Ranchero': '#22c55e',
  },
};

const METRIC_CONFIG = {
  revenue: { label: 'Revenue', format: (v: number) => `$${(v / 1000).toFixed(0)}K`, icon: DollarSign },
  checks: { label: 'Checks Served', format: (v: number) => v.toLocaleString(), icon: Receipt },
  avgCheck: { label: 'Avg Check', format: (v: number) => `$${v.toFixed(2)}`, icon: TrendingUp },
  tips: { label: 'Tips', format: (v: number) => `$${(v / 1000).toFixed(1)}K`, icon: Percent },
};

export default function RevenueTimelinePage() {
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [scope, setScope] = useState<Scope>('all');
  const { format } = useCurrency();

  // Generate data based on selections
  const chartData = useMemo(() => {
    if (scope === 'all') {
      switch (granularity) {
        case 'day': return generateDailyData();
        case 'week': return generateWeeklyData();
        case 'month': return generateMonthlyData();
      }
    }
    return generateBrandData(granularity);
  }, [granularity, scope]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const baseData = granularity === 'day' ? generateDailyData() :
                     granularity === 'week' ? generateWeeklyData() :
                     generateMonthlyData();

    const total = baseData.reduce((sum, d) => sum + d[metric], 0);
    const first = baseData[0][metric];
    const last = baseData[baseData.length - 1][metric];
    const change = ((last - first) / first) * 100;

    return { total, change, avg: total / baseData.length };
  }, [granularity, metric]);

  const metricConfig = METRIC_CONFIG[metric];

  // Prepare data for multi-line brand comparison
  const brandChartData = useMemo(() => {
    if (scope !== 'brand') return [];

    const brandData = generateBrandData(granularity);
    const labels = Array.from(new Set(brandData.map(d => d.label)));

    return labels.map(label => {
      const points = brandData.filter(d => d.label === label);
      const result: Record<string, number | string> = { label };
      points.forEach(p => {
        result[p.brand] = p[metric];
      });
      return result;
    });
  }, [granularity, metric, scope]);

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/financial" className="hover:text-foreground">Financial</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">Timeline</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Revenue Timeline</h1>
        <p className="text-gray-600">Track financial performance over time</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <metricConfig.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  Total {metricConfig.label} ({granularity === 'day' ? 'Week' : granularity === 'week' ? 'Month' : '6 Months'})
                </p>
                <p className="text-2xl font-bold">
                  {metric === 'avgCheck'
                    ? `$${stats.avg.toFixed(2)}`
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
                <p className="text-sm text-gray-600">Period Change</p>
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
                <p className="text-sm text-gray-600">Average per {granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month'}</p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis
                    stroke="#6b7280"
                    tickFormatter={(v) => metric === 'revenue' || metric === 'tips'
                      ? `$${(v / 1000).toFixed(0)}K`
                      : v.toLocaleString()
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => [metricConfig.format(value), metricConfig.label]}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis
                    stroke="#6b7280"
                    tickFormatter={(v) => metric === 'revenue' || metric === 'tips'
                      ? `$${(v / 1000).toFixed(0)}K`
                      : v.toLocaleString()
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => [metricConfig.format(value), '']}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Taco Loco"
                    stroke={COLORS.brands['Taco Loco']}
                    strokeWidth={2}
                    dot={{ fill: COLORS.brands['Taco Loco'] }}
                  />
                  <Line
                    type="monotone"
                    dataKey="El Ranchero"
                    stroke={COLORS.brands['El Ranchero']}
                    strokeWidth={2}
                    dot={{ fill: COLORS.brands['El Ranchero'] }}
                  />
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
                  <th className="text-left py-2 font-medium text-gray-600">Period</th>
                  <th className="text-right py-2 font-medium text-gray-600">Revenue</th>
                  <th className="text-right py-2 font-medium text-gray-600">Checks</th>
                  <th className="text-right py-2 font-medium text-gray-600">Avg Check</th>
                  <th className="text-right py-2 font-medium text-gray-600">Tips</th>
                </tr>
              </thead>
              <tbody>
                {(scope === 'all' ? chartData : generateDailyData()).map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{(row as DataPoint).label}</td>
                    <td className="py-2 text-right">{format((row as DataPoint).revenue)}</td>
                    <td className="py-2 text-right">{(row as DataPoint).checks}</td>
                    <td className="py-2 text-right">{format((row as DataPoint).avgCheck)}</td>
                    <td className="py-2 text-right">{format((row as DataPoint).tips)}</td>
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
