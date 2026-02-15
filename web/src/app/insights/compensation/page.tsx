'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Target, Trophy, Utensils, Wine, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { getCheques, getMeseros, getFranquicias } from '@/lib/restaurant-service';
import { GoalProgressBar } from '@/components/charts/goal-progress-bar';
import { SalesHistoryChart } from '@/components/charts/sales-history-chart';
import { Leaderboard } from '@/components/charts/leaderboard';
import { CompensationPieChart } from '@/components/charts/CompensationPieChart';
import { CompensationTrendChart } from '@/components/charts/CompensationTrendChart';
import { Calendar, Download, Users, PieChart, ArrowUpRight } from 'lucide-react';
import type { Cheque, Franquicia, Mesero } from '@/types/cheques';

// Mock data for TechCorp (existing)
const techCorpStatsData = {
  currentPeriod: 525000,
  yearToDate: 1850000,
  avgPerRep: 46250,
  budgetUtilization: 87.5,
  periodChange: 12.3,
  ytdChange: 8.7,
};

const techCorpPieChartData = [
  { name: 'Accelerator Plan', value: 245000, color: '#6366f1' },
  { name: 'Tiered Plan', value: 185000, color: '#8b5cf6' },
  { name: 'Basic Plan', value: 52000, color: '#a855f7' },
  { name: 'Team-Based Plan', value: 35000, color: '#d946ef' },
  { name: 'Executive Plan', value: 8000, color: '#ec4899' },
];

const techCorpTrendData = [
  { month: 'Jan', actual: 380000, budget: 400000 },
  { month: 'Feb', actual: 420000, budget: 400000 },
  { month: 'Mar', actual: 395000, budget: 420000 },
  { month: 'Apr', actual: 450000, budget: 420000 },
  { month: 'May', actual: 480000, budget: 450000 },
  { month: 'Jun', actual: 465000, budget: 450000 },
  { month: 'Jul', actual: 490000, budget: 480000 },
  { month: 'Aug', actual: 510000, budget: 480000 },
  { month: 'Sep', actual: 495000, budget: 500000 },
  { month: 'Oct', actual: 520000, budget: 500000 },
  { month: 'Nov', actual: 545000, budget: 520000 },
  { month: 'Dec', actual: 525000, budget: 520000 },
];

const techCorpPaymentHistory = [
  { id: 1, date: '2024-12-15', employee: 'Sarah Chen', amount: 7500, ruleSetType: 'Accelerator', status: 'completed' },
  { id: 2, date: '2024-12-14', employee: 'Marcus Johnson', amount: 6200, ruleSetType: 'Accelerator', status: 'completed' },
  { id: 3, date: '2024-12-14', employee: 'Emily Rodriguez', amount: 2100, ruleSetType: 'Tiered', status: 'completed' },
  { id: 4, date: '2024-12-13', employee: 'David Kim', amount: 8900, ruleSetType: 'Accelerator', status: 'processing' },
  { id: 5, date: '2024-12-12', employee: 'Lisa Thompson', amount: 4500, ruleSetType: 'Tiered', status: 'completed' },
];

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
  const [dateRange, setDateRange] = useState('q4-2024');
  const [data, setData] = useState<HospitalityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isHospitality = currentTenant?.industry === 'Hospitality';

  // For demo, assume current user is mesero_id 5001 at CDMX Polanco
  const currentMeseroId = 5001;
  const currentFranquiciaId = 'MX-CDMX-001';

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
        { period: 'dic', label: 'Dic', alimentos: baseFood * 0.95, bebidas: baseBeverage * 0.95, total: (baseFood + baseBeverage) * 0.95 },
        { period: 'actual', label: 'Actual', alimentos: myFood, bebidas: myBeverage, total: myTotal },
        { period: 'lastyear', label: 'Dic 2023', alimentos: baseFood * 0.85, bebidas: baseBeverage * 0.85, total: (baseFood + baseBeverage) * 0.85 },
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

  // TechCorp view (existing)
  if (!isHospitality) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Compensation Overview
              </h1>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                Track compensation payouts, trends, and budget utilization
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[180px]">
                  <Calendar className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="q4-2024">Q4 2024</SelectItem>
                  <SelectItem value="q3-2024">Q3 2024</SelectItem>
                  <SelectItem value="q2-2024">Q2 2024</SelectItem>
                  <SelectItem value="q1-2024">Q1 2024</SelectItem>
                  <SelectItem value="2024">Full Year 2024</SelectItem>
                </SelectContent>
              </Select>
              <Button className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Current Period</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(techCorpStatsData.currentPeriod)}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-emerald-600 font-medium">
                        +{techCorpStatsData.periodChange}%
                      </span>
                      <span className="text-sm text-slate-500">vs last period</span>
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
                    <p className="text-sm font-medium text-slate-500">Year-to-Date</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(techCorpStatsData.yearToDate)}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-emerald-600 font-medium">
                        +{techCorpStatsData.ytdChange}%
                      </span>
                      <span className="text-sm text-slate-500">vs last year</span>
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-100 rounded-full dark:bg-emerald-900/30">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Average per Rep</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {format(techCorpStatsData.avgPerRep)}
                    </p>
                    <p className="text-sm text-slate-500 mt-2">40 active reps</p>
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
                    <p className="text-sm font-medium text-slate-500">Budget Utilization</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                      {techCorpStatsData.budgetUtilization}%
                    </p>
                    <div className="mt-2 h-2 w-24 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${techCorpStatsData.budgetUtilization}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-full dark:bg-amber-900/30">
                    <PieChart className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2 mb-8">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Commission by Plan Type</CardTitle>
                <CardDescription>Distribution of commissions across compensation plans</CardDescription>
              </CardHeader>
              <CardContent>
                <CompensationPieChart data={techCorpPieChartData} />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Monthly Compensation Trend</CardTitle>
                <CardDescription>Actual payouts vs budget over the last 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <CompensationTrendChart data={techCorpTrendData} />
              </CardContent>
            </Card>
          </div>

          {/* Payment History Table */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>Recent compensation payments and their status</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Employee</TableHead>
                      <TableHead className="font-semibold">Plan Type</TableHead>
                      <TableHead className="text-right font-semibold">Amount</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {techCorpPaymentHistory.map((payment) => (
                      <TableRow key={payment.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {new Date(payment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-50">{payment.employee}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={
                            payment.ruleSetType === 'Accelerator' ? 'bg-indigo-100 text-indigo-700' :
                            payment.ruleSetType === 'Tiered' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                          }>
                            {payment.ruleSetType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-50">
                          {format(payment.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={
                            payment.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            payment.status === 'processing' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                          }>
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" />
          Compensación - Mi Franquicia
        </h1>
        <p className="text-muted-foreground">
          {data.currentFranquicia?.nombre || currentFranquiciaId}
          {data.currentMesero && (
            <span className="ml-2 text-sm">• {data.currentMesero.nombre}</span>
          )}
        </p>
      </div>

      {/* Total Sales Hero Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Ventas Totales del Período</p>
              <p className="text-4xl font-bold mt-1">{format(data.myTotal)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {data.myCheckCount} cheques atendidos
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
                <p className="text-xs text-muted-foreground">Propinas</p>
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
                <p className="text-xs text-muted-foreground">Comisión ({((data.currentMesero?.commission_rate || 0.02) * 100).toFixed(1)}%)</p>
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
              Progreso a Meta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoalProgressBar
              current={data.myTotal}
              target={data.target}
              label="Meta del período"
              size="lg"
            />
            <div className="pt-4 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Faltan para la meta:</span>
                <span className="font-bold">
                  {data.myTotal >= data.target ? (
                    <span className="text-green-600">Meta alcanzada!</span>
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
              Mi Posición
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-6xl font-bold text-primary">#{data.myRank}</p>
              <p className="text-muted-foreground mt-2">
                de {data.totalFranquicias} franquicias
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
        title="Ranking de Franquicias"
        highlightId={currentFranquiciaId}
        showChange={false}
      />

      {/* Sales History Chart */}
      <SalesHistoryChart data={data.historyData} />
    </div>
  );
}
