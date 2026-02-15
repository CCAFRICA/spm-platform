"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DollarSign,
  Target,
  Award,
  BarChart3,
} from "lucide-react";
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import {
  listCalculationBatches,
  getCalculationResults,
} from '@/lib/supabase/calculation-service';
import type { CalculationResult } from '@/types/compensation-plan';

const chartConfig = {
  commissions: {
    label: "Earnings",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export default function InsightsPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const [results, setResults] = useState<CalculationResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant) return;

    const loadResults = async () => {
      try {
        const batches = await listCalculationBatches(currentTenant.id);
        if (batches.length === 0) { setIsLoading(false); return; }
        const batch = batches[0];
        const calcResults = await getCalculationResults(currentTenant.id, batch.id);
        const mapped = calcResults.map(r => {
          const meta = (r.metadata as Record<string, unknown>) || {};
          const comps = Array.isArray(r.components) ? r.components : [];
          return {
            entityId: r.entity_id,
            entityName: (meta.entityName as string) || r.entity_id,
            entityRole: (meta.entityRole as string) || '',
            ruleSetId: '', ruleSetName: '', ruleSetVersion: 1, ruleSetType: 'standard' as const,
            period: batch.period_id, periodStart: '', periodEnd: '',
            totalIncentive: r.total_payout || 0,
            currency: currentTenant.currency || 'USD',
            calculatedAt: r.created_at,
            storeId: (meta.storeId as string) || '',
            components: comps.map((c: unknown) => {
              const comp = c as Record<string, unknown>;
              return {
                componentId: String(comp.componentId || ''),
                componentName: String(comp.componentName || ''),
                outputValue: Number(comp.outputValue || 0),
              } as CalculationResult['components'][0];
            }),
          };
        });
        setResults(mapped as unknown as CalculationResult[]);
      } catch (err) {
        console.warn('[Insights] Failed to load:', err);
      }
      setIsLoading(false);
    };
    loadResults();
  }, [currentTenant]);

  // Derive insights from real data
  const insights = useMemo(() => {
    if (results.length === 0) return null;

    // Calculate summary stats
    const totalPayout = results.reduce((sum, r) => sum + (r.totalIncentive || 0), 0);
    const avgPayout = totalPayout / results.length;

    // Top performers (by total incentive)
    const topPerformers = [...results]
      .sort((a, b) => (b.totalIncentive || 0) - (a.totalIncentive || 0))
      .slice(0, 5);

    // Build trend data from component breakdown
    const trendData = topPerformers[0]?.components?.map((comp, i) => ({
      component: comp.componentName || `Component ${i + 1}`,
      earnings: comp.outputValue || 0,
    })) || [];

    return {
      totalPayout,
      avgPayout,
      entityCount: results.length,
      topPerformers,
      trendData,
    };
  }, [results]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading insights...</p>
        </div>
      </div>
    );
  }

  // OB-29: No results state
  if (!insights) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Insights Dashboard
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Performance analytics
            </p>
          </div>

          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
            <CardContent className="py-12">
              <div className="text-center">
                <BarChart3 className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  No Calculation Data Available
                </h3>
                <p className="text-blue-700 dark:text-blue-300 max-w-lg mx-auto mb-6">
                  Insights will appear here once calculations have been run.
                  Run a calculation to see performance metrics, top performers, and trends.
                </p>
                <Link
                  href="/admin/launch/calculate"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Target className="h-4 w-4" />
                  Run Calculation
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Insights Dashboard
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Performance analytics • {insights.entityCount} entities
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Total Payout Card */}
          <Card className="lg:col-span-1 border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardHeader className="pb-2">
              <CardDescription className="text-indigo-100">
                Total Period Outcome
              </CardDescription>
              <CardTitle className="text-4xl font-bold">
                {format(insights.totalPayout)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-4 w-4 text-emerald-300" />
                <span className="text-sm text-indigo-100">
                  Based on {insights.entityCount} entities
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">Average Outcome</span>
                  <span className="font-medium">
                    {format(insights.avgPayout)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">Top Performer</span>
                  <span className="font-medium">
                    {format(insights.topPerformers[0]?.totalIncentive || 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Metrics */}
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
            <Card className="border-0 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Entities Paid
                    </p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {insights.entityCount}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
                    <Target className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Average Earnings
                    </p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(insights.avgPayout)}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
                    <DollarSign className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Component Breakdown Chart */}
          {insights.trendData.length > 0 && (
            <Card className="lg:col-span-2 border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  Earnings by Component
                </CardTitle>
                <CardDescription>
                  Top performer breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={insights.trendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis
                        dataKey="component"
                        tickLine={false}
                        axisLine={false}
                        className="text-xs"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        className="text-xs"
                        tickFormatter={(value) => format(value)}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="earnings"
                        stroke="hsl(var(--chart-1))"
                        strokeWidth={3}
                        dot={{ fill: "hsl(var(--chart-1))", strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Top Performers Leaderboard */}
          <Card className="lg:col-span-1 border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                Top Performers
              </CardTitle>
              <CardDescription>By total incentive earnings</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <div className="space-y-1">
                {insights.topPerformers.map((performer, idx) => {
                  const initials = (performer.entityName || 'EMP')
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <div
                      key={performer.entityId}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        idx < 3
                          ? "bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-950/20"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                            ? "bg-slate-300 text-slate-700"
                            : idx === 2
                            ? "bg-amber-600 text-amber-50"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                          {performer.entityName || performer.entityId}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {performer.storeName || performer.entityRole || 'Entity'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {format(performer.totalIncentive || 0)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
