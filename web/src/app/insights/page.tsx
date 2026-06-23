"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  TrendingUp,
  DollarSign,
  Target,
  Award,
  BarChart3,
} from "lucide-react";
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import {
  getCalculatedPeriods,
  getComponentTotals,
  ALL_INSIGHTS_SCOPE,
  type PeriodSummary,
  type ComponentTotal,
} from '@/lib/insights';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { PeriodCards, ComponentBars } from '@/components/insights';

// OB-322: Overview is now period-aware. Previously it loaded only batches[0] (often an empty
// PREVIEW batch → "Total Period Outcome $0") and built the component chart from the top
// performer's `outputValue` — a field that does not exist on the components JSONB (the real key
// is `payout`), so "Earnings by Component" was always a flat zero line. It now selects a period
// (PeriodCards) and renders Earnings by Component from getComponentTotals (aggregated across all
// entities, proven to conserve to the period total). See OB-322 dimension-proof.

export default function InsightsPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const isVialuce = useIsVialuce(); // HF-313: Vialuce page-template adoption (else-branch unchanged)

  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [rows, setRows] = useState<EntityResult[]>([]);
  const [componentTotals, setComponentTotals] = useState<ComponentTotal[]>([]);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load the calculated periods once (canonical getCalculatedPeriods, start_date DESC).
  useEffect(() => {
    if (!currentTenant) return;
    let cancelled = false;
    getCalculatedPeriods(currentTenant.id)
      .then((ps) => {
        if (cancelled) return;
        setPeriods(ps);
        setSelectedPeriodId(ps[0]?.period_id ?? '');
        setPeriodsLoaded(true);
        if (ps.length === 0) setIsLoading(false);
      })
      .catch((err) => { console.warn('[Insights] periods load failed:', err); setPeriodsLoaded(true); setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant]);

  // Load the selected period's outcomes + component totals.
  useEffect(() => {
    if (!currentTenant || !selectedPeriodId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      getEntityResults(currentTenant.id, ALL_INSIGHTS_SCOPE, { periodId: selectedPeriodId }),
      getComponentTotals(currentTenant.id, selectedPeriodId),
    ])
      .then(([rs, ct]) => { if (cancelled) return; setRows(rs); setComponentTotals(ct); setIsLoading(false); })
      .catch((err) => { console.warn('[Insights] period data load failed:', err); if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant, selectedPeriodId]);

  const insights = useMemo(() => {
    if (rows.length === 0) return null;
    const totalPayout = rows.reduce((sum, r) => sum + (r.totalPayout || 0), 0);
    const avgPayout = totalPayout / rows.length;
    const topPerformers = [...rows].sort((a, b) => (b.totalPayout || 0) - (a.totalPayout || 0)).slice(0, 5);
    return { totalPayout, avgPayout, entityCount: rows.length, topPerformers };
  }, [rows]);

  if (isLoading && !periodsLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading insights...</p>
        </div>
      </div>
    );
  }

  // No calculated periods at all → onboarding empty state.
  if (periodsLoaded && periods.length === 0) {
    if (isVialuce) {
      return (
        <div className="page">
          <div className="phead">
            <div>
              <h1>Overview</h1>
              <div className="sub">Earnings analytics</div>
            </div>
          </div>
          <div className="empty">
            <div className="ic"><BarChart3 className="h-7 w-7" /></div>
            <b>No Calculation Data Available</b>
            <p>
              Insights will appear here once calculations have been run.
              Run a calculation to see performance metrics, top performers, and trends.
            </p>
            <Link
              href="/admin/launch/calculate"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mt-2"
            >
              <Target className="h-4 w-4" />
              Run Calculation
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Overview</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">Earnings analytics</p>
          </div>
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
            <CardContent className="py-12">
              <div className="text-center">
                <BarChart3 className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">No Calculation Data Available</h3>
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

  // Shared content body (period strip + cards), wrapped per-theme below.
  const body = (
    <>
      {/* Period selector — horizontal cards (OB-322) */}
      {periods.length > 0 && (
        <PeriodCards periods={periods} selectedPeriodId={selectedPeriodId} onPeriodChange={setSelectedPeriodId} className="mb-2" />
      )}

      {isLoading || !insights ? (
        <Card className="border-0 shadow-md">
          <CardContent className="py-16 text-center text-muted-foreground">
            {isLoading ? 'Loading period…' : 'No outcomes for this period.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Total Period Outcome */}
          <Card className="lg:col-span-1 border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardHeader className="pb-2">
              <CardDescription className="text-indigo-100">Total Period Outcome</CardDescription>
              <CardTitle className="text-4xl font-bold">{format(insights.totalPayout)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-4 w-4 text-emerald-300" />
                <span className="text-sm text-indigo-100">Based on {insights.entityCount} entities</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">Average Outcome</span>
                  <span className="font-medium">{format(insights.avgPayout)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-200">Top Performer</span>
                  <span className="font-medium">{format(insights.topPerformers[0]?.totalPayout || 0)}</span>
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
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Entities Paid</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{insights.entityCount}</p>
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
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Average Earnings</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">{format(insights.avgPayout)}</p>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
                    <DollarSign className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Earnings by Component — aggregated across all entities (OB-322: real, non-zero) */}
          {componentTotals.length > 0 && (
            <Card className="lg:col-span-2 border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Earnings by Component</CardTitle>
                <CardDescription>Total payout per plan component, this period</CardDescription>
              </CardHeader>
              <CardContent>
                <ComponentBars components={componentTotals} />
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
                  const initials = (performer.displayName || 'EMP')
                    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <div
                      key={performer.entityId}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        idx < 3 ? "bg-gradient-to-r from-amber-500/10 to-transparent" : "hover:bg-muted/50"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                          idx === 0 ? "bg-amber-400 text-amber-950"
                            : idx === 1 ? "bg-slate-300 text-slate-700"
                            : idx === 2 ? "bg-amber-600 text-amber-50"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                          {performer.displayName || performer.entityId}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{performer.externalId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{format(performer.totalPayout || 0)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );

  if (isVialuce) {
    return (
      <div className="page">
        <div className="phead">
          <div>
            <h1>Overview</h1>
            <div className="sub">Earnings analytics{insights ? ` • ${insights.entityCount} entities` : ''}</div>
          </div>
        </div>
        <div className="space-y-6">{body}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Overview</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Earnings analytics{insights ? ` • ${insights.entityCount} entities` : ''}
          </p>
        </div>
        <div className="space-y-6">{body}</div>
      </div>
    </div>
  );
}
