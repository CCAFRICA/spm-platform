'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  Trophy,
  Target,
  TrendingUp,
  Users,
  Medal,
  Building2,
  MapPin,
  CreditCard,
  Banknote,
  Utensils,
  Wine,
  AlertTriangle,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale , isSpanishLocale} from '@/contexts/locale-context'; // OB-226C: Korean Test
import { useAuth } from '@/contexts/auth-context'; // OB-226C: Korean Test
import { isVLAdmin } from '@/types/auth'; // OB-226C: Korean Test
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313
import { getCheques, getFranquicias, getFinancialSummary, getSalesByFranquicia } from '@/lib/restaurant-service';
import { getEntityResults, getPeriodsWithResults, type EntityResult } from '@/lib/drill-through'; // OB-226C: real entity payouts
import { Leaderboard } from '@/components/charts/leaderboard';
import type { Cheque, Franquicia } from '@/types/cheques';

// OB-226C: TechCorp mock data removed — non-hospitality branch now derives leaderboard,
// summary stats, and distribution from real calculation_results via getEntityResults().

// OB-226C: a real payout-tier band derived from totalPayout (no per-entity attainment %
// exists across tenants — attainment is a {bonus,total,commission} object — so the
// distribution histogram buckets the actual payout amount).
interface DistBand {
  tier: string;
  count: number;
  color: string;
}

interface ExecutiveData {
  totalRevenue: number;
  totalChecks: number;
  avgTicket: number;
  totalTips: number;
  totalTax: number;
  foodRevenue: number;
  beverageRevenue: number;
  foodPct: number;
  beveragePct: number;
  cashTotal: number;
  cardTotal: number;
  cashPct: number;
  cardPct: number;
  cancelledCount: number;
  regionStats: Array<{ region: string; sales: number; checkCount: number; color: string }>;
  topFranchises: Array<{ id: string; rank: number; name: string; value: number; subtitle?: string; change?: number }>;
  bottomFranchises: Array<{ id: string; rank: number; name: string; value: number; subtitle?: string; change?: number }>;
}

export default function InsightsPerformancePage() {
  const { currentTenant } = useTenant();
  const { format, symbol } = useCurrency();
  const { locale } = useLocale(); // OB-226C
  const { user } = useAuth(); // OB-226C
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isVialuce = useIsVialuce(); // HF-313: Vialuce page-template adoption (else-branch unchanged)

  const isHospitality = currentTenant?.industry === 'Hospitality';
  const tenantId = currentTenant?.id ?? '';
  // Korean Test (codebase standard): VL admins see English; tenant users follow locale.
  const isSpanish = (user && isVLAdmin(user)) ? false : isSpanishLocale(locale);

  // OB-226C: real entity payouts for the non-hospitality branch (replaces techCorp* mock).
  const [entityResults, setEntityResults] = useState<EntityResult[] | null>(null);
  const [entityLoading, setEntityLoading] = useState(true);

  useEffect(() => {
    if (isHospitality) {
      loadHospitalityData();
    } else {
      setIsLoading(false);
    }
  }, [isHospitality]);

  // OB-226C: load real calculation_results (latest period) for the non-hospitality branch.
  useEffect(() => {
    if (isHospitality || !tenantId) {
      setEntityLoading(false);
      return;
    }
    let cancelled = false;
    setEntityLoading(true);
    (async () => {
      try {
        const periods = await getPeriodsWithResults(tenantId);
        const latestPeriodId = periods[0]?.id;
        const results = await getEntityResults(
          tenantId,
          { visibleEntityIds: [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'all' },
          latestPeriodId ? { periodId: latestPeriodId } : undefined,
        );
        if (cancelled) return;
        setEntityResults(results);
      } catch (error) {
        console.error('Error loading performance entity results:', error);
        if (!cancelled) setEntityResults([]);
      } finally {
        if (!cancelled) setEntityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHospitality, tenantId]);

  const loadHospitalityData = async () => {
    setIsLoading(true);
    try {
      const [cheques, franquicias, summary, salesByFranquicia] = await Promise.all([
        getCheques(),
        getFranquicias(),
        getFinancialSummary(),
        getSalesByFranquicia(),
      ]);

      // Calculate payment method breakdown
      const validCheques = cheques.filter((c: Cheque) => c.pagado === 1 && c.cancelado === 0);
      const cashTotal = validCheques.reduce((sum: number, c: Cheque) => sum + c.efectivo, 0);
      const cardTotal = validCheques.reduce((sum: number, c: Cheque) => sum + c.tarjeta, 0);
      const totalPayments = cashTotal + cardTotal;
      const cashPct = totalPayments > 0 ? (cashTotal / totalPayments) * 100 : 0;
      const cardPct = totalPayments > 0 ? (cardTotal / totalPayments) * 100 : 0;

      // Region stats
      const regionColors: Record<string, string> = {
        West: '#6366f1',
        North: '#8b5cf6',
        Central: '#a855f7',
        South: '#d946ef',
        East: '#ec4899',
      };

      const regionMap = new Map<string, { sales: number; checkCount: number }>();
      franquicias.forEach((f: Franquicia) => {
        if (!regionMap.has(f.region)) {
          regionMap.set(f.region, { sales: 0, checkCount: 0 });
        }
      });

      salesByFranquicia.forEach((f) => {
        const region = f.franquicia.region;
        const current = regionMap.get(region) || { sales: 0, checkCount: 0 };
        regionMap.set(region, {
          sales: current.sales + f.totalSales,
          checkCount: current.checkCount + f.checkCount,
        });
      });

      const regionStats = Array.from(regionMap.entries())
        .map(([region, data]) => ({
          region,
          sales: data.sales,
          checkCount: data.checkCount,
          color: regionColors[region] || '#94a3b8',
        }))
        .sort((a, b) => b.sales - a.sales);

      // Top and bottom franchises
      const franchiseRankings = salesByFranquicia.map((f, i) => ({
        id: f.franquicia.numero_franquicia,
        rank: i + 1,
        name: f.franquicia.nombre,
        value: f.totalSales,
        subtitle: f.franquicia.ciudad,
        change: f.vsTarget,
      }));

      const topFranchises = franchiseRankings.slice(0, 5);
      const bottomFranchises = franchiseRankings.slice(-5).reverse().map((f, i) => ({
        ...f,
        rank: franchiseRankings.length - 4 + i,
      }));

      setData({
        totalRevenue: summary.totalRevenue,
        totalChecks: summary.totalTransactions,
        avgTicket: summary.avgTicket,
        totalTips: summary.totalTips,
        totalTax: summary.totalTax,
        foodRevenue: summary.foodRevenue,
        beverageRevenue: summary.beverageRevenue,
        foodPct: summary.foodPct,
        beveragePct: summary.beveragePct,
        cashTotal,
        cardTotal,
        cashPct,
        cardPct,
        cancelledCount: summary.cancelledCount,
        regionStats,
        topFranchises,
        bottomFranchises,
      });
    } catch (error) {
      console.error('Error loading executive data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // OB-226C: Non-hospitality view — real entity payouts (calculation_results) replace techCorp mock.
  if (!isHospitality) {
    const results = entityResults ?? [];
    const periodLabel = results[0]?.periodLabel ?? '';
    const totalPayout = results.reduce((sum, r) => sum + r.totalPayout, 0);
    const entityCount = results.length;
    const avgPayout = entityCount > 0 ? totalPayout / entityCount : 0;
    const topPayout = results.reduce((max, r) => Math.max(max, r.totalPayout), 0);
    const leaderboard = results.slice(0, 5); // already sorted desc by getEntityResults

    // Distribution histogram: bucket the real payout amount into quartiles of the observed
    // range (no per-entity attainment % exists across tenants, so payout is the honest axis).
    const distBands: DistBand[] = [];
    if (entityCount > 0 && topPayout > 0) {
      const bandDefs = [
        { lo: 0.75, color: '#10b981' },
        { lo: 0.5, color: '#3b82f6' },
        { lo: 0.25, color: '#f59e0b' },
        { lo: 0, color: '#ef4444' },
      ];
      for (const def of bandDefs) {
        const hi = def.lo === 0.75 ? Infinity : def.lo + 0.25;
        const loAmt = def.lo * topPayout;
        const hiAmt = hi === Infinity ? Infinity : hi * topPayout;
        const count = results.filter((r) => r.totalPayout >= loAmt && (hi === Infinity ? true : r.totalPayout < hiAmt)).length;
        const tier = hi === Infinity
          ? `${symbol}${Math.round(loAmt / 1000)}k+`
          : `${symbol}${Math.round(loAmt / 1000)}k–${Math.round(hiAmt / 1000)}k`;
        distBands.push({ tier, count, color: def.color });
      }
    }

    const noResults = !entityLoading && entityCount === 0;

    return (
      // HF-313: Vialuce page frame (.page) replaces gradient/container; else byte-identical.
      <div className={isVialuce ? 'page' : 'min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900'}>
        <div className={isVialuce ? '' : 'container mx-auto px-6 py-8'}>
          {isVialuce ? (
            <div className="phead">
              <div>
                <h1>{isSpanish ? 'Cumplimiento' : 'Attainment'}</h1>
                <div className="sub">
                  {isSpanish ? 'Pagos por entidad' : 'Per-entity payouts'}
                  {periodLabel ? ` · ${periodLabel}` : ''}
                </div>
              </div>
            </div>
          ) : (
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {isSpanish ? 'Cumplimiento' : 'Attainment'}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              {isSpanish ? 'Pagos por entidad' : 'Per-entity payouts'}
              {periodLabel ? ` · ${periodLabel}` : ''}
            </p>
          </div>
          )}

          {entityLoading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : noResults ? (
            // HALT-4 honest empty state: this tenant has no calculation results yet.
            isVialuce ? (
              <div className="empty">
                <div className="ic"><Trophy className="h-7 w-7" /></div>
                <b>{isSpanish ? 'Sin datos de rendimiento' : 'No performance data yet'}</b>
                <p>
                  {isSpanish
                    ? 'Los pagos por entidad aparecerán aquí una vez que se ejecuten los cálculos.'
                    : 'Per-entity payouts will appear here once calculations have been run.'}
                </p>
              </div>
            ) : (
              <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
                <CardContent className="py-12">
                  <div className="text-center">
                    <Trophy className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      {isSpanish ? 'Sin datos de rendimiento' : 'No performance data yet'}
                    </h3>
                    <p className="text-blue-700 dark:text-blue-300 max-w-lg mx-auto">
                      {isSpanish
                        ? 'Los pagos por entidad aparecerán aquí una vez que se ejecuten los cálculos.'
                        : 'Per-entity payouts will appear here once calculations have been run.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          ) : (
          <>
          {/* Summary Stats (derived from real calculation_results) */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">{isSpanish ? 'Pago Total del Equipo' : 'Total Team Payout'}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(totalPayout)}
                    </p>
                    <p className="text-sm text-slate-400 mt-2">{periodLabel}</p>
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
                    <p className="text-sm font-medium text-slate-400">{isSpanish ? 'Entidades con Resultados' : 'Entities with Results'}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {entityCount}
                    </p>
                    <p className="text-sm text-slate-400 mt-2">{periodLabel}</p>
                  </div>
                  <div className="p-3 bg-emerald-100 rounded-full">
                    <Users className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">{isSpanish ? 'Pago Promedio' : 'Average Payout'}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(avgPayout)}
                    </p>
                    <p className="text-sm text-slate-400 mt-2">{isSpanish ? 'Por entidad' : 'Per entity'}</p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <Target className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">{isSpanish ? 'Pago Más Alto' : 'Top Payout'}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(topPayout)}
                    </p>
                    <p className="text-sm text-slate-400 mt-2 truncate">{leaderboard[0]?.displayName ?? ''}</p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-full">
                    <TrendingUp className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 mb-6">
            {/* Top Performers Leaderboard (real entities) */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Medal className="h-5 w-5 text-amber-500" />
                  {isSpanish ? 'Mejores Resultados' : 'Top Performers'}
                </CardTitle>
                <CardDescription>{periodLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderboard.map((performer, idx) => {
                    const rank = idx + 1;
                    return (
                    <div
                      key={performer.entityId}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        rank <= 3
                          ? 'bg-gradient-to-r from-amber-950/20 to-transparent'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          rank === 1 ? 'bg-amber-400 text-amber-950' :
                          rank === 2 ? 'bg-slate-300 text-slate-700' :
                          rank === 3 ? 'bg-amber-600 text-amber-50' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {rank}
                      </div>
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
                          {performer.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                          {performer.displayName}
                        </p>
                        <p className="text-xs text-slate-400">{performer.externalId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {format(performer.totalPayout)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {performer.componentCount} {isSpanish ? 'componentes' : 'components'}
                        </p>
                      </div>
                    </div>
                  );})}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* Payout Distribution (real histogram over totalPayout) */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>{isSpanish ? 'Distribución de Pagos' : 'Payout Distribution'}</CardTitle>
                  <CardDescription>{isSpanish ? 'Número de entidades por rango de pago' : 'Number of entities by payout range'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distBands} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="tier" tickLine={false} axisLine={false} width={90} />
                      <Tooltip
                        formatter={(value: number) => [`${value} ${isSpanish ? 'entidades' : 'entities'}`, isSpanish ? 'Conteo' : 'Count']}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {distBands.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Regional Comparison — HALT-4 honest empty state: the platform has no region
                  dimension on entities for these tenants, so nothing is fabricated. */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>{isSpanish ? 'Rendimiento Regional' : 'Regional Performance'}</CardTitle>
                  <CardDescription>{isSpanish ? 'Volumen total por región' : 'Total volume by region'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center text-center py-10">
                    <MapPin className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {isSpanish ? 'Sin datos regionales configurados' : 'No regional data configured'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      {isSpanish
                        ? 'Las entidades de este tenant no tienen una dimensión regional. Asigna regiones a las entidades para ver este desglose.'
                        : 'Entities for this tenant have no region dimension. Assign regions to entities to see this breakdown.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    );
  }

  // Hospitality / RestaurantMX Executive View
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando datos ejecutivos...</p>
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

  const productData = [
    { name: 'Alimentos', value: data.foodRevenue, color: '#3B82F6' },
    { name: 'Bebidas', value: data.beverageRevenue, color: '#10B981' },
  ];

  const paymentData = [
    { name: 'Efectivo', value: data.cashTotal, color: '#F59E0B' },
    { name: 'Tarjeta', value: data.cardTotal, color: '#8B5CF6' },
  ];

  return (
    // HF-313: Vialuce page frame (.page) + .phead header; else (dark/bliss) byte-identical.
    <div className={isVialuce ? 'page space-y-6' : 'p-6 space-y-6'}>
      {/* Header */}
      {isVialuce ? (
        <div className="phead">
          <div>
            <h1>Executive View - National</h1>
            <div className="sub">Performance summary across all franchises</div>
          </div>
        </div>
      ) : (
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Executive View - National
        </h1>
        <p className="text-muted-foreground">
          Performance summary across all franchises
        </p>
      </div>
      )}

      {/* Top Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{format(data.totalRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.totalChecks} cheques</p>
              </div>
              <TrendingUp className="h-10 w-10 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Ticket</p>
                <p className="text-2xl font-bold">{format(data.avgTicket)}</p>
              </div>
              <Target className="h-10 w-10 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tips</p>
                <p className="text-2xl font-bold text-green-600">{format(data.totalTips)}</p>
              </div>
              <Trophy className="h-10 w-10 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxes</p>
                <p className="text-2xl font-bold">{format(data.totalTax)}</p>
              </div>
              <Users className="h-10 w-10 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Regional Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Performance by Region
          </CardTitle>
          <CardDescription>Total sales by geographic region</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.regionStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${symbol}${(value / 1000).toFixed(0)}k`}
              />
              <YAxis type="category" dataKey="region" tickLine={false} axisLine={false} width={80} />
              <Tooltip
                formatter={(value: number) => [format(value), 'Sales']}
                contentStyle={{ backgroundColor: 'oklch(var(--background))', border: '1px solid oklch(var(--border))', borderRadius: '8px' }}
              />
              <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                {data.regionStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top and Bottom Franchises */}
      <div className="grid md:grid-cols-2 gap-6">
        <Leaderboard
          items={data.topFranchises}
          title="Top 5 Franchises"
          showChange={true}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Franchises Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.bottomFranchises.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-amber-100 text-amber-700">
                      {f.rank}
                    </span>
                    <div>
                      <p className="font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.subtitle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-amber-600">{format(f.value)}</span>
                    {f.change !== undefined && (
                      <p className={`text-xs ${f.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {f.change >= 0 ? '+' : ''}{f.change.toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product and Payment Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Product Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5" />
              Product Breakdown
            </CardTitle>
            <CardDescription>Food vs Beverages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={productData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {productData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => format(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-blue-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Utensils className="h-4 w-4" /> Food
                    </p>
                    <p className="text-lg font-bold">{format(data.foodRevenue)}</p>
                    <p className="text-xs text-muted-foreground">{data.foodPct.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-green-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Wine className="h-4 w-4" /> Beverages
                    </p>
                    <p className="text-lg font-bold">{format(data.beverageRevenue)}</p>
                    <p className="text-xs text-muted-foreground">{data.beveragePct.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Methods
            </CardTitle>
            <CardDescription>Cash vs Card</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {paymentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => format(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-amber-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Banknote className="h-4 w-4" /> Cash
                    </p>
                    <p className="text-lg font-bold">{format(data.cashTotal)}</p>
                    <p className="text-xs text-muted-foreground">{data.cashPct.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-purple-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4" /> Card
                    </p>
                    <p className="text-lg font-bold">{format(data.cardTotal)}</p>
                    <p className="text-xs text-muted-foreground">{data.cardPct.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancellations Alert */}
      {data.cancelledCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {data.cancelledCount} cancelled checks this period
                </p>
                <p className="text-sm text-amber-600">
                  Review cancellation policies and operational processes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
