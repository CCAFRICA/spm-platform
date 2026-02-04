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
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Users,
  Award,
} from "lucide-react";

// Mock Data
const compensationData = {
  currentPeriod: "$127,450",
  previousPeriod: "$118,200",
  percentChange: 7.8,
  breakdown: {
    baseSalary: "$85,000",
    commissions: "$32,450",
    bonuses: "$10,000",
  },
};

const performanceMetrics = [
  {
    label: "Quota Attainment",
    value: "112%",
    trend: 8.2,
    icon: Target,
  },
  {
    label: "Deals Closed",
    value: "24",
    trend: 12.5,
    icon: Award,
  },
  {
    label: "Pipeline Value",
    value: "$2.4M",
    trend: -3.1,
    icon: DollarSign,
  },
  {
    label: "Team Rank",
    value: "#3",
    trend: 2,
    icon: Users,
  },
];

const commissionTrends = [
  { month: "Jul", commissions: 18500, quota: 20000 },
  { month: "Aug", commissions: 22300, quota: 20000 },
  { month: "Sep", commissions: 19800, quota: 22000 },
  { month: "Oct", commissions: 28400, quota: 22000 },
  { month: "Nov", commissions: 31200, quota: 25000 },
  { month: "Dec", commissions: 32450, quota: 25000 },
];

const topPerformers = [
  {
    rank: 1,
    name: "Sarah Chen",
    role: "Senior AE",
    attainment: 142,
    commissions: "$45,200",
    avatar: "/avatars/sarah.jpg",
  },
  {
    rank: 2,
    name: "Marcus Johnson",
    role: "Enterprise AE",
    attainment: 128,
    commissions: "$38,750",
    avatar: "/avatars/marcus.jpg",
  },
  {
    rank: 3,
    name: "Emily Rodriguez",
    role: "Senior AE",
    attainment: 118,
    commissions: "$32,450",
    avatar: "/avatars/emily.jpg",
  },
  {
    rank: 4,
    name: "David Kim",
    role: "AE",
    attainment: 108,
    commissions: "$28,900",
    avatar: "/avatars/david.jpg",
  },
  {
    rank: 5,
    name: "Lisa Thompson",
    role: "AE",
    attainment: 102,
    commissions: "$26,100",
    avatar: "/avatars/lisa.jpg",
  },
];

const chartConfig = {
  commissions: {
    label: "Commissions",
    color: "hsl(var(--chart-1))",
  },
  quota: {
    label: "Quota",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export default function InsightsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Insights Dashboard
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Your compensation and performance at a glance
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Compensation Summary Card */}
          <Card className="lg:col-span-1 border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardHeader className="pb-2">
              <CardDescription className="text-indigo-100">
                Current Period Total
              </CardDescription>
              <CardTitle className="text-4xl font-bold">
                {compensationData.currentPeriod}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-6">
                {compensationData.percentChange > 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-300" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-300" />
                )}
                <span className="text-sm text-indigo-100">
                  <span
                    className={
                      compensationData.percentChange > 0
                        ? "text-emerald-300"
                        : "text-red-300"
                    }
                  >
                    {compensationData.percentChange > 0 ? "+" : ""}
                    {compensationData.percentChange}%
                  </span>{" "}
                  vs last period
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">Base Salary</span>
                  <span className="font-medium">
                    {compensationData.breakdown.baseSalary}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">Commissions</span>
                  <span className="font-medium">
                    {compensationData.breakdown.commissions}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">Bonuses</span>
                  <span className="font-medium">
                    {compensationData.breakdown.bonuses}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics Grid */}
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
            {performanceMetrics.map((metric) => (
              <Card
                key={metric.label}
                className="border-0 shadow-md hover:shadow-lg transition-shadow"
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {metric.label}
                      </p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                        {metric.value}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
                        <metric.icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      </div>
                      <Badge
                        variant={metric.trend > 0 ? "default" : "destructive"}
                        className={`text-xs ${
                          metric.trend > 0
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : "bg-red-100 text-red-700 hover:bg-red-100"
                        }`}
                      >
                        {metric.trend > 0 ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {Math.abs(metric.trend)}%
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Commission Trends Chart */}
          <Card className="lg:col-span-2 border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Commission Trends
              </CardTitle>
              <CardDescription>
                6-month commission performance vs quota
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={commissionTrends}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      className="text-xs"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      className="text-xs"
                      tickFormatter={(value) => `$${value / 1000}k`}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="commissions"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={3}
                      dot={{ fill: "hsl(var(--chart-1))", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="quota"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Top Performers Leaderboard */}
          <Card className="lg:col-span-1 border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                Top Performers
              </CardTitle>
              <CardDescription>This quarter&apos;s leaderboard</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <div className="space-y-1">
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
                      className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
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
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={performer.avatar} />
                      <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
                        {performer.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                        {performer.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {performer.role}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {performer.attainment}%
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {performer.commissions}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
