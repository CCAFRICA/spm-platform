'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  ArrowUpRight,
  ArrowDownRight,
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
import { getCheques, getFranquicias, getFinancialSummary, getSalesByFranquicia } from '@/lib/restaurant-service';
import { Leaderboard } from '@/components/charts/leaderboard';
import type { Cheque, Franquicia } from '@/types/cheques';

// TechCorp mock data
const techCorpSummaryStats = {
  teamScore: 94.2,
  goalAchievement: 108.5,
  avgPerEntity: 215000,
  growthRate: 12.3,
};

const techCorpTopPerformers = [
  { rank: 1, name: 'Sarah Chen', role: 'Senior AE', sales: 700000, achievement: 140, trend: 'up', trendValue: 15 },
  { rank: 2, name: 'Marcus Johnson', role: 'Enterprise AE', sales: 650000, achievement: 130, trend: 'up', trendValue: 8 },
  { rank: 3, name: 'David Kim', role: 'Senior AE', sales: 620000, achievement: 124, trend: 'up', trendValue: 12 },
  { rank: 4, name: 'Amanda Foster', role: 'Enterprise AE', sales: 580000, achievement: 116, trend: 'stable', trendValue: 2 },
  { rank: 5, name: 'Lisa Thompson', role: 'Mid-Market AE', sales: 545000, achievement: 109, trend: 'up', trendValue: 5 },
];

const techCorpPerformanceDistribution = [
  { tier: 'Exceeding', count: 12, color: '#10b981' },
  { tier: 'Meeting', count: 15, color: '#3b82f6' },
  { tier: 'Approaching', count: 8, color: '#f59e0b' },
  { tier: 'Missing', count: 5, color: '#ef4444' },
];

const techCorpRegionalData = [
  { region: 'West', sales: 2450000, color: '#6366f1' },
  { region: 'East', sales: 2280000, color: '#8b5cf6' },
  { region: 'South', sales: 2150000, color: '#a855f7' },
  { region: 'North', sales: 1870000, color: '#d946ef' },
];

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
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isHospitality = currentTenant?.industry === 'Hospitality';

  useEffect(() => {
    if (isHospitality) {
      loadHospitalityData();
    } else {
      setIsLoading(false);
    }
  }, [isHospitality]);

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

  // TechCorp view
  if (!isHospitality) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-6 py-8">
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
                      {techCorpSummaryStats.teamScore}
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
                    <p className="text-sm font-medium text-slate-500">Goal Achievement Rate</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {techCorpSummaryStats.goalAchievement}%
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
                    <p className="text-sm font-medium text-slate-500">Average per Entity</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(techCorpSummaryStats.avgPerEntity)}
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
                      +{techCorpSummaryStats.growthRate}%
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

          <div className="grid gap-6 lg:grid-cols-2 mb-6">
            {/* Top Performers Leaderboard */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Medal className="h-5 w-5 text-amber-500" />
                  Top Performers
                </CardTitle>
                <CardDescription>Q4 2024 Leaderboard</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {techCorpTopPerformers.map((performer) => (
                    <div
                      key={performer.rank}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        performer.rank <= 3
                          ? 'bg-gradient-to-r from-amber-950/20 to-transparent'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          performer.rank === 1 ? 'bg-amber-400 text-amber-950' :
                          performer.rank === 2 ? 'bg-slate-300 text-slate-700' :
                          performer.rank === 3 ? 'bg-amber-600 text-amber-50' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {performer.rank}
                      </div>
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={`/avatars/${performer.name.toLowerCase().replace(' ', '-')}.jpg`} />
                        <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
                          {performer.name.split(' ').map((n) => n[0]).join('')}
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
                          {format(performer.sales)}
                        </p>
                        <div className="flex items-center justify-end gap-1">
                          {performer.trend === 'up' ? (
                            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                          ) : performer.trend === 'down' ? (
                            <ArrowDownRight className="h-3 w-3 text-red-500" />
                          ) : null}
                          <span className={`text-xs ${
                            performer.trend === 'up' ? 'text-emerald-600' :
                            performer.trend === 'down' ? 'text-red-600' : 'text-slate-500'
                          }`}>
                            {performer.achievement}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* Performance Distribution */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Performance Distribution</CardTitle>
                  <CardDescription>Number of entities in each tier</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={techCorpPerformanceDistribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="tier" tickLine={false} axisLine={false} width={90} />
                      <Tooltip
                        formatter={(value: number) => [`${value} entities`, 'Count']}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {techCorpPerformanceDistribution.map((entry, index) => (
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
                  <CardDescription>Total volume by region</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={techCorpRegionalData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value) => `${symbol}${(value / 1000000).toFixed(1)}M`} />
                      <YAxis type="category" dataKey="region" tickLine={false} axisLine={false} width={60} />
                      <Tooltip
                        formatter={(value: number) => [format(value), 'Volume']}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      />
                      <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                        {techCorpRegionalData.map((entry, index) => (
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Executive View - National
        </h1>
        <p className="text-muted-foreground">
          Performance summary across all franchises
        </p>
      </div>

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
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
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
