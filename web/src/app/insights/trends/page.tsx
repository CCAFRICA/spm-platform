"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

// Mock data for trends
const yoyData = [
  { month: "Jan", current: 380000, previous: 320000 },
  { month: "Feb", current: 420000, previous: 350000 },
  { month: "Mar", current: 395000, previous: 380000 },
  { month: "Apr", current: 450000, previous: 410000 },
  { month: "May", current: 480000, previous: 420000 },
  { month: "Jun", current: 465000, previous: 455000 },
  { month: "Jul", current: 490000, previous: 470000 },
  { month: "Aug", current: 510000, previous: 485000 },
  { month: "Sep", current: 495000, previous: 490000 },
  { month: "Oct", current: 520000, previous: 505000 },
  { month: "Nov", current: 545000, previous: 510000 },
  { month: "Dec", current: 525000, previous: 520000 },
];

const growthMetrics = [
  { label: "QoQ Growth", value: 12.3, trend: "up" },
  { label: "YoY Growth", value: 8.7, trend: "up" },
  { label: "CAGR (3yr)", value: 15.2, trend: "up" },
];

const quarterlyData = [
  { quarter: "Q1", value: 1195000 },
  { quarter: "Q2", value: 1395000 },
  { quarter: "Q3", value: 1495000 },
  { quarter: "Q4", value: 1590000 },
];

const projectionData = [
  { month: "Oct", actual: 520000, projected: null },
  { month: "Nov", actual: 545000, projected: null },
  { month: "Dec", actual: 525000, projected: null },
  { month: "Jan", actual: null, projected: 540000 },
  { month: "Feb", actual: null, projected: 560000 },
  { month: "Mar", actual: null, projected: 575000 },
];

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
}

export default function TrendsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Trends Analysis
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Historical trends, growth metrics, and projections
          </p>
        </div>

        {/* Growth Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          {growthMetrics.map((metric) => (
            <Card key={metric.label} className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {metric.trend === "up" ? "+" : "-"}{metric.value}%
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      {metric.trend === "up" ? (
                        <>
                          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm text-emerald-600">Positive trend</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-red-600">Declining</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`p-3 rounded-full ${
                    metric.trend === "up"
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : "bg-red-100 dark:bg-red-900/30"
                  }`}>
                    {metric.trend === "up" ? (
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Year-over-Year Comparison */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Year-over-Year Comparison</CardTitle>
                <CardDescription>
                  2024 vs 2023 monthly compensation
                </CardDescription>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-500" />
                  <span className="text-sm text-slate-500">2024</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-300" />
                  <span className="text-sm text-slate-500">2023</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={yoyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCurrency}
                  tick={{ fill: '#64748b' }}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), ""]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="2024"
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ fill: "#6366f1", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="2023"
                  stroke="#cbd5e1"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: "#cbd5e1", strokeWidth: 2, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bottom Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quarterly Performance */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-400" />
                Quarterly Performance
              </CardTitle>
              <CardDescription>2024 quarterly totals</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={quarterlyData}>
                  <defs>
                    <linearGradient id="quarterGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                  <XAxis dataKey="quarter" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Total"]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#quarterGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Trend Projection */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-slate-400" />
                Trend Projection
              </CardTitle>
              <CardDescription>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                  Projected
                </Badge>
                <span className="ml-2">Q1 2025 forecast</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={projectionData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), ""]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    name="Projected"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: "#f59e0b", strokeWidth: 2, r: 4 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-sm text-amber-800">
                  <strong>Projection:</strong> Based on current trends, Q1 2025 is estimated
                  to reach $1.67M in total compensation, representing 11% growth.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
