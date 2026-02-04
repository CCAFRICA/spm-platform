"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";
import {
  Trophy,
  Target,
  TrendingUp,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Medal,
} from "lucide-react";

// Mock data
const summaryStats = {
  teamScore: 94.2,
  goalAttainment: 108.5,
  avgSalesPerRep: 215000,
  growthRate: 12.3,
};

const topPerformers = [
  { rank: 1, name: "Sarah Chen", role: "Senior AE", sales: 700000, attainment: 140, trend: "up", trendValue: 15 },
  { rank: 2, name: "Marcus Johnson", role: "Enterprise AE", sales: 650000, attainment: 130, trend: "up", trendValue: 8 },
  { rank: 3, name: "David Kim", role: "Senior AE", sales: 620000, attainment: 124, trend: "up", trendValue: 12 },
  { rank: 4, name: "Amanda Foster", role: "Enterprise AE", sales: 580000, attainment: 116, trend: "stable", trendValue: 2 },
  { rank: 5, name: "Lisa Thompson", role: "Mid-Market AE", sales: 545000, attainment: 109, trend: "up", trendValue: 5 },
  { rank: 6, name: "Emily Rodriguez", role: "SMB AE", sales: 520000, attainment: 104, trend: "down", trendValue: -3 },
  { rank: 7, name: "Michael Brown", role: "Mid-Market AE", sales: 498000, attainment: 99.6, trend: "up", trendValue: 7 },
  { rank: 8, name: "James Wilson", role: "SMB AE", sales: 475000, attainment: 95, trend: "stable", trendValue: 1 },
  { rank: 9, name: "Rachel Martinez", role: "SMB AE", sales: 450000, attainment: 90, trend: "down", trendValue: -5 },
  { rank: 10, name: "Christopher Lee", role: "Mid-Market AE", sales: 435000, attainment: 87, trend: "up", trendValue: 4 },
];

const performanceDistribution = [
  { tier: "Exceeding", count: 12, color: "#10b981" },
  { tier: "Meeting", count: 15, color: "#3b82f6" },
  { tier: "Approaching", count: 8, color: "#f59e0b" },
  { tier: "Missing", count: 5, color: "#ef4444" },
];

const regionalData = [
  { region: "West", sales: 2450000, color: "#6366f1" },
  { region: "East", sales: 2280000, color: "#8b5cf6" },
  { region: "South", sales: 2150000, color: "#a855f7" },
  { region: "North", sales: 1870000, color: "#d946ef" },
];

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
}

export default function InsightsPerformancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Performance Overview
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Team performance metrics and leaderboard
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Team Performance Score</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {summaryStats.teamScore}
                  </p>
                  <Badge className="mt-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Excellent
                  </Badge>
                </div>
                <div className="p-3 bg-indigo-100 rounded-full">
                  <Trophy className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Goal Attainment Rate</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {summaryStats.goalAttainment}%
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600">+8.5%</span>
                  </div>
                </div>
                <div className="p-3 bg-emerald-100 rounded-full">
                  <Target className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Avg Sales per Rep</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {formatCurrency(summaryStats.avgSalesPerRep)}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">This quarter</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Growth Rate (MoM)</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    +{summaryStats.growthRate}%
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600">Trending up</span>
                  </div>
                </div>
                <div className="p-3 bg-amber-100 rounded-full">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Top Performers Leaderboard */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Medal className="h-5 w-5 text-amber-500" />
                Top Performers
              </CardTitle>
              <CardDescription>Q4 2024 Sales Leaderboard</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topPerformers.map((performer) => (
                  <div
                    key={performer.rank}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      performer.rank <= 3
                        ? "bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-950/20"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                        performer.rank === 1
                          ? "bg-amber-400 text-amber-950"
                          : performer.rank === 2
                          ? "bg-slate-300 text-slate-700"
                          : performer.rank === 3
                          ? "bg-amber-600 text-amber-50"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {performer.rank}
                    </div>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={`/avatars/${performer.name.toLowerCase().replace(' ', '-')}.jpg`} />
                      <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
                        {performer.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                        {performer.name}
                      </p>
                      <p className="text-xs text-slate-500">{performer.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {formatCurrency(performer.sales)}
                      </p>
                      <div className="flex items-center justify-end gap-1">
                        {performer.trend === "up" ? (
                          <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                        ) : performer.trend === "down" ? (
                          <ArrowDownRight className="h-3 w-3 text-red-500" />
                        ) : null}
                        <span
                          className={`text-xs ${
                            performer.trend === "up"
                              ? "text-emerald-600"
                              : performer.trend === "down"
                              ? "text-red-600"
                              : "text-slate-500"
                          }`}
                        >
                          {performer.attainment}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Performance Distribution & Regional Comparison */}
          <div className="space-y-6">
            {/* Performance Distribution */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Performance Distribution</CardTitle>
                <CardDescription>Number of reps in each tier</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={performanceDistribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="tier"
                      tickLine={false}
                      axisLine={false}
                      width={90}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value} reps`, "Count"]}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {performanceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Regional Comparison */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Regional Performance</CardTitle>
                <CardDescription>Total sales by region</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={regionalData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                    />
                    <YAxis
                      type="category"
                      dataKey="region"
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "Sales"]}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                      {regionalData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
