'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Target, Trophy, Utensils, Wine, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context'; // OB-226 Korean Test
import { useAuth } from '@/contexts/auth-context'; // OB-226 isSpanish ternary
import { isVLAdmin } from '@/types/auth'; // OB-226 isSpanish ternary
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313
import { getCheques, getMeseros, getFranquicias } from '@/lib/restaurant-service';
import {
  getEntityResults,
  type EntityResult,
  type EntityScope,
} from '@/lib/drill-through'; // OB-226 real data
import { createClient } from '@/lib/supabase/client'; // OB-226 plan-distribution aggregation
import { GoalProgressBar } from '@/components/charts/goal-progress-bar';
import { SalesHistoryChart } from '@/components/charts/sales-history-chart';
import { Leaderboard } from '@/components/charts/leaderboard';
import { CompensationPieChart } from '@/components/charts/CompensationPieChart';
import { PeriodSelector, EntityTable } from '@/components/insights'; // OB-227
import { getCalculatedPeriods, type PeriodSummary } from '@/lib/insights'; // OB-227
import { Users, PieChart, ArrowUpRight } from 'lucide-react';
import type { Cheque, Franquicia, Mesero } from '@/types/cheques';

// OB-226: TechCorp mock removed — non-hospitality branch now reads real calculation_results.

// OB-226: scope for "all entities" (admin default; profile_scope is unpopulated — substrate §3.1).
const ALL_SCOPE: EntityScope = {
  visibleEntityIds: [],
  visibleRuleSetIds: [],
  visiblePeriodIds: [],
  scopeType: 'all',
};

// Single, deterministic palette for the plan-distribution pie (slices come from rule_sets, not mock).
const PLAN_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f59e0b', '#10b981'];

interface PlanSlice {
  name: string;
  value: number;
  color: string;
}

interface HospitalityData {
  myTotal: number;
  myFood: number;
  myBeverage: number;
  myTips: number;
  myCommission: number;
  myCheckCount: number;
  target: number;
  myRank: number;
  totalFranquicias: number;
  franchiseRanking: Array<{ id: string; rank: number; name: string; value: number }>;
  historyData: Array<{ period: string; label: string; alimentos: number; bebidas: number; total: number }>;
  currentMesero: Mesero | null;
  currentFranquicia: Franquicia | null;
}

export default function CompensationPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { locale } = useLocale(); // OB-226 Korean Test
  const { user } = useAuth(); // OB-226 isSpanish ternary
  const [data, setData] = useState<HospitalityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isVialuce = useIsVialuce(); // HF-313: Vialuce page-template adoption (else-branch unchanged)

  // OB-226: VL admins always see English; tenant users localize (codebase isSpanish standard).
  const isSpanish = user && isVLAdmin(user) ? false : locale === 'es-MX';

  const isHospitality = currentTenant?.industry === 'Hospitality';
  const tenantId = currentTenant?.id ?? '';

  // For demo, assume current user is mesero_id 5001 at CDMX Polanco
  const currentMeseroId = 5001;
  const currentFranquiciaId = 'MX-CDMX-001';

  // OB-226: real per-entity outcomes + plan distribution for the non-hospitality branch.
  const [entityResults, setEntityResults] = useState<EntityResult[]>([]);
  const [latestPeriodLabel, setLatestPeriodLabel] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PeriodSummary[]>([]); // OB-227 period selector
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [planDistribution, setPlanDistribution] = useState<PlanSlice[]>([]);
  const [compLoading, setCompLoading] = useState(true);

  useEffect(() => {
    if (isHospitality) {
      loadHospitalityData();
    } else {
      setIsLoading(false);
    }
  }, [isHospitality]);

  // OB-227: load the calculated periods once (canonical getCalculatedPeriods, start_date DESC).
  useEffect(() => {
    if (isHospitality || !tenantId) return;
    let cancelled = false;
    getCalculatedPeriods(tenantId)
      .then(ps => { if (cancelled) return; setPeriods(ps); setSelectedPeriodId(prev => prev || ps[0]?.period_id || ''); })
      .catch(() => { /* honest empty state below */ });
    return () => { cancelled = true; };
  }, [isHospitality, tenantId]);

  // OB-226/OB-227: load real calculation_results-derived comp data for the SELECTED period.
  useEffect(() => {
    if (isHospitality || !tenantId) {
      setCompLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCompLoading(true);
      try {
        const periodId = selectedPeriodId || undefined;
        const [results, distribution] = await Promise.all([
          getEntityResults(tenantId, ALL_SCOPE, periodId ? { periodId } : undefined),
          loadPlanDistribution(tenantId, periodId),
        ]);
        if (cancelled) return;
        setLatestPeriodLabel(periods.find(p => p.period_id === selectedPeriodId)?.label ?? null);
        setEntityResults(results);
        setPlanDistribution(distribution);
      } catch (error) {
        console.error('Error loading compensation data:', error);
      } finally {
        if (!cancelled) setCompLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHospitality, tenantId, selectedPeriodId, periods]);

  // OB-226: plan distribution = sum(total_payout) grouped by rule_set_id, joined to rule_sets.name.
  // For BCL this is a single plan ("Plan de Comisiones — Banca Minorista 2025-2026") → one honest slice.
  const loadPlanDistribution = async (
    tid: string,
    periodId?: string,
  ): Promise<PlanSlice[]> => {
    const sb = createClient();
    let q = sb
      .from('calculation_results')
      .select('rule_set_id, total_payout')
      .eq('tenant_id', tid);
    if (periodId) q = q.eq('period_id', periodId);
    const { data: rows } = await q;
    if (!rows || rows.length === 0) return [];

    const sumByRuleSet = new Map<string, number>();
    for (const r of rows) {
      const ruleSetId = (r.rule_set_id as string | null) ?? 'unassigned';
      const payout = typeof r.total_payout === 'number' ? r.total_payout : Number(r.total_payout) || 0;
      sumByRuleSet.set(ruleSetId, (sumByRuleSet.get(ruleSetId) ?? 0) + payout);
    }

    const ruleSetIds = Array.from(sumByRuleSet.keys()).filter(id => id !== 'unassigned');
    const nameById = new Map<string, string>();
    if (ruleSetIds.length) {
      const { data: ruleSets } = await sb.from('rule_sets').select('id, name').in('id', ruleSetIds);
      for (const rs of ruleSets ?? []) nameById.set(rs.id as string, (rs.name as string) ?? (rs.id as string));
    }

    return Array.from(sumByRuleSet.entries())
      .map(([ruleSetId, value], i) => ({
        name:
          ruleSetId === 'unassigned'
            ? isSpanish
              ? 'Sin plan asignado'
              : 'Unassigned'
            : nameById.get(ruleSetId) ?? ruleSetId.slice(0, 8),
        value,
        color: PLAN_COLORS[i % PLAN_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  };

  const loadHospitalityData = async () => {
    setIsLoading(true);
    try {
      const [cheques, meseros, franquicias] = await Promise.all([
        getCheques(),
        getMeseros(),
        getFranquicias(),
      ]);

      // Get current mesero and franchise
      const currentMesero = meseros.find(m => m.mesero_id === currentMeseroId) || null;
      const currentFranquicia = franquicias.find(f => f.numero_franquicia === currentFranquiciaId) || null;

      // Calculate my sales (from my franchise)
      const franchiseCheques = cheques.filter(
        (c: Cheque) => c.numero_franquicia === currentFranquiciaId && c.pagado === 1 && c.cancelado === 0
      );
      const myCheques = franchiseCheques.filter((c: Cheque) => c.mesero_id === currentMeseroId);

      const myTotal = myCheques.reduce((sum: number, c: Cheque) => sum + c.total, 0);
      const myFood = myCheques.reduce((sum: number, c: Cheque) => sum + c.total_alimentos, 0);
      const myBeverage = myCheques.reduce((sum: number, c: Cheque) => sum + c.total_bebidas, 0);
      const myTips = myCheques.reduce((sum: number, c: Cheque) => sum + c.propina, 0);
      const myCommission = myTotal * (currentMesero?.commission_rate || 0.02);
      const myCheckCount = myCheques.length;

      // Franchise target (simplified: avg ticket target * 500 checks per period)
      const target = (currentFranquicia?.target_avg_ticket || 300) * 500;

      // Franchise ranking by total sales
      const franchiseRanking = franquicias
        .map((f: Franquicia) => {
          const fCheques = cheques.filter(
            (c: Cheque) => c.numero_franquicia === f.numero_franquicia && c.pagado === 1 && c.cancelado === 0
          );
          return {
            id: f.numero_franquicia,
            name: f.nombre,
            total: fCheques.reduce((s: number, c: Cheque) => s + c.total, 0),
          };
        })
        .sort((a, b) => b.total - a.total)
        .map((f, i) => ({ ...f, rank: i + 1, value: f.total }));

      const myRank = franchiseRanking.findIndex(f => f.id === currentFranquiciaId) + 1;

      // History data (simulate based on current data with some variation)
      const baseFood = myFood || 50000;
      const baseBeverage = myBeverage || 20000;
      const historyData = [
        { period: 'oct', label: 'Oct', alimentos: baseFood * 0.8, bebidas: baseBeverage * 0.8, total: (baseFood + baseBeverage) * 0.8 },
        { period: 'nov', label: 'Nov', alimentos: baseFood * 0.9, bebidas: baseBeverage * 0.9, total: (baseFood + baseBeverage) * 0.9 },
        { period: 'dic', label: 'Dec', alimentos: baseFood * 0.95, bebidas: baseBeverage * 0.95, total: (baseFood + baseBeverage) * 0.95 },
        { period: 'actual', label: 'Current', alimentos: myFood, bebidas: myBeverage, total: myTotal },
        { period: 'lastyear', label: 'Dec 2023', alimentos: baseFood * 0.85, bebidas: baseBeverage * 0.85, total: (baseFood + baseBeverage) * 0.85 },
      ];

      setData({
        myTotal,
        myFood,
        myBeverage,
        myTips,
        myCommission,
        myCheckCount,
        target,
        myRank,
        totalFranquicias: franquicias.length,
        franchiseRanking,
        historyData,
        currentMesero,
        currentFranquicia,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // OB-226: Non-hospitality view — REAL calculation_results-derived compensation.
  if (!isHospitality) {
    // Derived stats from real per-entity outcomes (the proof anchor: BCL March 2026 sum = $58,406).
    const currentPeriodTotal = entityResults.reduce((sum, r) => sum + r.totalPayout, 0);
    const activeEntities = entityResults.length;
    const avgPerEntity = activeEntities > 0 ? currentPeriodTotal / activeEntities : 0;
    const planCount = planDistribution.length;

    // i18n strings (codebase isSpanish standard; VL admins always English).
    const t = {
      heading: isSpanish ? 'Resumen de Resultados' : 'Outcome Overview',
      sub: isSpanish
        ? 'Pagos por entidad y distribución por plan'
        : 'Per-entity payouts and plan distribution',
      currentPeriod: isSpanish ? 'Periodo actual' : 'Current Period',
      avgPerEntity: isSpanish ? 'Promedio por entidad' : 'Average per Entity',
      activePlans: isSpanish ? 'Planes activos' : 'Active Plans',
      entitiesPaid: isSpanish ? 'entidades pagadas' : 'entities paid',
      planLabel: isSpanish ? 'plan' : 'plan',
      plansLabel: isSpanish ? 'planes' : 'plans',
      distTitle: isSpanish ? 'Resultados por Plan' : 'Outcome by Plan',
      distDesc: isSpanish
        ? 'Distribución de pagos por plan de comisiones'
        : 'Payout distribution across commission plans',
      payTitle: isSpanish ? 'Pagos por Entidad' : 'Payments by Entity',
      payDesc: isSpanish
        ? 'Pagos de comisiones calculados por entidad'
        : 'Calculated commission payouts per entity',
      colPeriod: isSpanish ? 'Periodo' : 'Period',
      colEntity: isSpanish ? 'Entidad' : 'Entity',
      colComponents: isSpanish ? 'Componentes' : 'Components',
      colAmount: isSpanish ? 'Monto' : 'Amount',
      noResults: isSpanish ? 'Sin resultados de cálculo' : 'No calculation results yet',
      noResultsBody: isSpanish
        ? 'Los pagos de comisiones aparecerán aquí una vez que se ejecuten los cálculos para este inquilino.'
        : 'Commission payouts will appear here once calculations have been run for this tenant.',
      noDist: isSpanish ? 'Sin distribución por plan' : 'No plan distribution',
    };

    const periodLabelDisplay = latestPeriodLabel ?? '—';
    const hasResults = entityResults.length > 0;

    // Honest empty state when this tenant has no calculation results at all.
    const emptyState = isVialuce ? (
      <div className="empty">
        <div className="ic"><DollarSign className="h-7 w-7" /></div>
        <b>{t.noResults}</b>
        <p>{t.noResultsBody}</p>
      </div>
    ) : (
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
        <CardContent className="py-12">
          <div className="text-center">
            <DollarSign className="h-16 w-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">{t.noResults}</h3>
            <p className="text-blue-700 dark:text-blue-300 max-w-lg mx-auto">{t.noResultsBody}</p>
          </div>
        </CardContent>
      </Card>
    );

    return (
      // HF-313: Vialuce page frame (.page) replaces gradient/container; else byte-identical.
      <div className={isVialuce ? 'page' : 'min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900'}>
        <div className={isVialuce ? '' : 'container mx-auto px-6 py-8'}>
          {/* Header */}
          {isVialuce ? (
            <div className="phead">
              <div>
                <h1>{t.heading}</h1>
                <div className="sub">
                  {t.sub}
                  {latestPeriodLabel && <span className="ml-2">• {periodLabelDisplay}</span>}
                </div>
              </div>
              {/* OB-227: period selector (canonical getCalculatedPeriods source) */}
              {periods.length > 0 && (
                <div className="pactions">
                  <PeriodSelector periods={periods} selectedPeriodId={selectedPeriodId} onPeriodChange={setSelectedPeriodId} />
                </div>
              )}
            </div>
          ) : (
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-50">
                {t.heading}
              </h1>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                {t.sub}
                {latestPeriodLabel && <span className="ml-2">• {periodLabelDisplay}</span>}
              </p>
            </div>
            {periods.length > 0 && (
              <PeriodSelector periods={periods} selectedPeriodId={selectedPeriodId} onPeriodChange={setSelectedPeriodId} />
            )}
          </div>
          )}

          {compLoading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !hasResults ? (
            emptyState
          ) : (
          <>
          {/* Stats Cards — derived from real per-entity outcomes. Budget/YTD omitted: no budget
              or multi-period rollup exists for these tenants (HALT-4: no fabricated numbers). */}
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">{t.currentPeriod}</p>
                    <p className="text-2xl font-bold text-slate-50 mt-1">
                      {format(currentPeriodTotal)}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-slate-400">
                        {activeEntities} {t.entitiesPaid}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-indigo-100 rounded-full dark:bg-indigo-900/30">
                    <DollarSign className="h-5 w-5 text-indigo-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">{t.avgPerEntity}</p>
                    <p className="text-2xl font-bold text-slate-50 mt-1">
                      {format(avgPerEntity)}
                    </p>
                    <p className="text-sm text-slate-400 mt-2">
                      {activeEntities} {t.entitiesPaid}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full dark:bg-purple-900/30">
                    <Users className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">{t.activePlans}</p>
                    <p className="text-2xl font-bold text-slate-50 mt-1">
                      {planCount}
                    </p>
                    <p className="text-sm text-slate-400 mt-2">
                      {planCount === 1 ? t.planLabel : t.plansLabel}
                    </p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-full dark:bg-amber-900/30">
                    <PieChart className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Plan Distribution — sum(total_payout) grouped by rule_set_id → rule_sets.name.
              A single-plan tenant (BCL) renders one honest slice; no invented plans. */}
          <Card className="border-0 shadow-lg mb-8">
            <CardHeader>
              <CardTitle>{t.distTitle}</CardTitle>
              <CardDescription>{t.distDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {planDistribution.length > 0 ? (
                <CompensationPieChart data={planDistribution} />
              ) : (
                <p className="text-center py-12 text-slate-400">{t.noDist}</p>
              )}
            </CardContent>
          </Card>

          {/* Payments by Entity — real entity displayName + totalPayout (the per-entity comp). */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>{t.payTitle}</CardTitle>
              <CardDescription>{t.payDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* OB-227: replaces the flat unsearchable table (with the useless "Components: N"
                  column) with search / sort / Δ-prior / top-component / pagination + inline
                  OB-224 drill-through. */}
              <EntityTable tenantId={tenantId} periodId={selectedPeriodId} periodLabel={latestPeriodLabel ?? undefined} />
            </CardContent>
          </Card>
          </>
          )}
        </div>
      </div>
    );
  }

  // Hospitality / RestaurantMX Rep View
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">No hay datos disponibles</p>
      </div>
    );
  }

  return (
    // HF-313: Vialuce page frame (.page) + .phead header; else (dark/bliss) byte-identical.
    <div className={isVialuce ? 'page space-y-6' : 'p-6 space-y-6'}>
      {/* Header */}
      {isVialuce ? (
        <div className="phead">
          <div>
            <h1>Compensation - My Franchise</h1>
            <div className="sub">
              {data.currentFranquicia?.nombre || currentFranquiciaId}
              {data.currentMesero && (
                <span className="ml-2">• {data.currentMesero.nombre}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" />
          Compensation - My Franchise
        </h1>
        <p className="text-muted-foreground">
          {data.currentFranquicia?.nombre || currentFranquiciaId}
          {data.currentMesero && (
            <span className="ml-2 text-sm">• {data.currentMesero.nombre}</span>
          )}
        </p>
      </div>
      )}

      {/* Total Sales Hero Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Total Period Sales</p>
              <p className="text-4xl font-bold mt-1">{format(data.myTotal)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {data.myCheckCount} checks served
              </p>
            </div>
            <div className="p-4 bg-primary/10 rounded-full">
              <TrendingUp className="h-12 w-12 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
                <Utensils className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Alimentos</p>
                <p className="text-lg font-bold">{format(data.myFood)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/30">
                <Wine className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bebidas</p>
                <p className="text-lg font-bold">{format(data.myBeverage)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg dark:bg-yellow-900/30">
                <Coins className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tips</p>
                <p className="text-lg font-bold text-green-600">{format(data.myTips)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg dark:bg-purple-900/30">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Commission ({((data.currentMesero?.commission_rate || 0.02) * 100).toFixed(1)}%)</p>
                <p className="text-lg font-bold text-purple-600">{format(data.myCommission)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Goal Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Goal Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoalProgressBar
              current={data.myTotal}
              target={data.target}
              label="Period goal"
              size="lg"
            />
            <div className="pt-4 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Faltan para la meta:</span>
                <span className="font-bold">
                  {data.myTotal >= data.target ? (
                    <span className="text-green-600">Goal reached!</span>
                  ) : (
                    format(data.target - data.myTotal)
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Position */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              My Ranking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-6xl font-bold text-primary">#{data.myRank}</p>
              <p className="text-muted-foreground mt-2">
                of {data.totalFranquicias} franchises
              </p>
              {data.myRank <= 3 && (
                <Badge className="mt-3 bg-yellow-100 text-yellow-700">
                  Top 3
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Leaderboard
        items={data.franchiseRanking.slice(0, 7)}
        title="Franchise Ranking"
        highlightId={currentFranquiciaId}
        showChange={false}
      />

      {/* Sales History Chart */}
      <SalesHistoryChart data={data.historyData} />
    </div>
  );
}
