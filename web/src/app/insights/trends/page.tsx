'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  BarChart,
  Bar,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from 'lucide-react';
import { useLocale } from '@/contexts/locale-context';
import { useCurrency } from '@/contexts/tenant-context';

// Enhanced mock data with more detail
const yoyData = [
  { month: 'Jan', monthEs: 'Ene', current: 380000, previous: 320000, target: 350000 },
  { month: 'Feb', monthEs: 'Feb', current: 420000, previous: 350000, target: 380000 },
  { month: 'Mar', monthEs: 'Mar', current: 395000, previous: 380000, target: 400000 },
  { month: 'Apr', monthEs: 'Abr', current: 450000, previous: 410000, target: 420000 },
  { month: 'May', monthEs: 'May', current: 480000, previous: 420000, target: 440000 },
  { month: 'Jun', monthEs: 'Jun', current: 465000, previous: 455000, target: 460000 },
  { month: 'Jul', monthEs: 'Jul', current: 490000, previous: 470000, target: 480000 },
  { month: 'Aug', monthEs: 'Ago', current: 510000, previous: 485000, target: 490000 },
  { month: 'Sep', monthEs: 'Sep', current: 495000, previous: 490000, target: 500000 },
  { month: 'Oct', monthEs: 'Oct', current: 520000, previous: 505000, target: 510000 },
  { month: 'Nov', monthEs: 'Nov', current: 545000, previous: 510000, target: 520000 },
  { month: 'Dec', monthEs: 'Dic', current: 525000, previous: 520000, target: 530000 },
];

const componentBreakdown = [
  { name: 'Base', nameEs: 'Ventas Base', value: 2400000, change: 12 },
  { name: 'Optical', nameEs: '\u00d3ptica', value: 1800000, change: 8 },
  { name: 'Services', nameEs: 'Servicios', value: 950000, change: 15 },
  { name: 'Insurance', nameEs: 'Seguros', value: 520000, change: -3 },
];

const regionData = [
  { region: 'North', regionEs: 'Norte', current: 1450000, previous: 1320000 },
  { region: 'Central', regionEs: 'Centro', current: 1680000, previous: 1520000 },
  { region: 'South', regionEs: 'Sur', current: 1245000, previous: 1180000 },
  { region: 'West', regionEs: 'Oeste', current: 1300000, previous: 1250000 },
];

const quarterlyData = [
  { quarter: 'Q1', value: 1195000, target: 1130000 },
  { quarter: 'Q2', value: 1395000, target: 1320000 },
  { quarter: 'Q3', value: 1495000, target: 1470000 },
  { quarter: 'Q4', value: 1590000, target: 1560000 },
];

const projectionData = [
  { month: 'Oct', monthEs: 'Oct', actual: 520000, projected: null },
  { month: 'Nov', monthEs: 'Nov', actual: 545000, projected: null },
  { month: 'Dec', monthEs: 'Dic', actual: 525000, projected: null },
  { month: 'Jan', monthEs: 'Ene', actual: null, projected: 540000 },
  { month: 'Feb', monthEs: 'Feb', actual: null, projected: 560000 },
  { month: 'Mar', monthEs: 'Mar', actual: null, projected: 575000 },
];

export default function TrendsPage() {
  const { locale } = useLocale();
  const { symbol } = useCurrency();
  const isSpanish = locale === 'es-MX';

  // Compact formatter for chart axes (e.g. $1.2M, $450K)
  const formatCompact = (amount: number): string => {
    if (amount >= 1000000) {
      return `${symbol}${(amount / 1000000).toFixed(1)}M`;
    }
    return `${symbol}${(amount / 1000).toFixed(0)}K`;
  };

  const [timeRange, setTimeRange] = useState('ytd');

  const growthMetrics = [
    {
      label: isSpanish ? 'Crecimiento QoQ' : 'QoQ Growth',
      value: 12.3,
      trend: 'up',
      description: isSpanish ? 'vs trimestre anterior' : 'vs previous quarter',
    },
    {
      label: isSpanish ? 'Crecimiento YoY' : 'YoY Growth',
      value: 8.7,
      trend: 'up',
      description: isSpanish ? 'vs a\u00f1o anterior' : 'vs previous year',
    },
    {
      label: isSpanish ? 'CAGR (3 a\u00f1os)' : 'CAGR (3yr)',
      value: 15.2,
      trend: 'up',
      description: isSpanish ? 'tasa compuesta anual' : 'compound annual rate',
    },
  ];

  const handleExport = () => {
    // In real implementation, would generate CSV/Excel
    alert(isSpanish ? 'Exportando datos...' : 'Exporting data...');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {isSpanish ? 'An\u00e1lisis de Tendencias' : 'Trends Analysis'}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              {isSpanish
                ? 'Tendencias hist\u00f3ricas, m\u00e9tricas de crecimiento y proyecciones'
                : 'Historical trends, growth metrics, and projections'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ytd">{isSpanish ? 'A\u00f1o actual' : 'YTD'}</SelectItem>
                <SelectItem value="12m">{isSpanish ? '\u00daltimos 12m' : 'Last 12m'}</SelectItem>
                <SelectItem value="24m">{isSpanish ? '\u00daltimos 24m' : 'Last 24m'}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {isSpanish ? 'Exportar' : 'Export'}
            </Button>
          </div>
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
                      {metric.trend === 'up' ? '+' : '-'}{metric.value}%
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      {metric.trend === 'up' ? (
                        <>
                          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm text-emerald-600">{metric.description}</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-red-600">{metric.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`p-3 rounded-full ${
                    metric.trend === 'up'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30'
                      : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    {metric.trend === 'up' ? (
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

        {/* Main Analysis Tabs */}
        <Tabs defaultValue="comparison" className="space-y-6">
          <TabsList>
            <TabsTrigger value="comparison">
              {isSpanish ? 'Comparaci\u00f3n' : 'Comparison'}
            </TabsTrigger>
            <TabsTrigger value="breakdown">
              {isSpanish ? 'Desglose' : 'Breakdown'}
            </TabsTrigger>
            <TabsTrigger value="regions">
              {isSpanish ? 'Regiones' : 'Regions'}
            </TabsTrigger>
            <TabsTrigger value="forecast">
              {isSpanish ? 'Proyecci\u00f3n' : 'Forecast'}
            </TabsTrigger>
          </TabsList>

          {/* Year-over-Year Comparison Tab */}
          <TabsContent value="comparison">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {isSpanish ? 'Comparaci\u00f3n A\u00f1o contra A\u00f1o' : 'Year-over-Year Comparison'}
                    </CardTitle>
                    <CardDescription>
                      {isSpanish
                        ? 'Compensaci\u00f3n mensual 2024 vs 2023'
                        : '2024 vs 2023 monthly outcomes'}
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
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <span className="text-sm text-slate-500">{isSpanish ? 'Meta' : 'Target'}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={yoyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis
                      dataKey={isSpanish ? 'monthEs' : 'month'}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748b' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatCompact(v)}
                      tick={{ fill: '#64748b' }}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCompact(value), '']}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="current"
                      name="2024"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={{ fill: '#6366f1', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="previous"
                      name="2023"
                      stroke="#cbd5e1"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: '#cbd5e1', strokeWidth: 2, r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="target"
                      name={isSpanish ? 'Meta' : 'Target'}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Component Breakdown Tab */}
          <TabsContent value="breakdown">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>
                    {isSpanish ? 'Desglose por Componente' : 'Component Breakdown'}
                  </CardTitle>
                  <CardDescription>
                    {isSpanish ? 'Contribuci\u00f3n por tipo de compensaci\u00f3n' : 'Contribution by outcome type'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={componentBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => formatCompact(v)}
                        tick={{ fill: '#64748b' }}
                      />
                      <YAxis
                        type="category"
                        dataKey={isSpanish ? 'nameEs' : 'name'}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#64748b' }}
                        width={100}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCompact(value), '']}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar
                        dataKey="value"
                        fill="#6366f1"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>
                    {isSpanish ? 'Cambio por Componente' : 'Component Change'}
                  </CardTitle>
                  <CardDescription>
                    {isSpanish ? 'Crecimiento vs per\u00edodo anterior' : 'Growth vs previous period'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {componentBreakdown.map((comp) => (
                      <div key={comp.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium">{isSpanish ? comp.nameEs : comp.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCompact(comp.value)}
                          </p>
                        </div>
                        <div className={`flex items-center gap-1 ${
                          comp.change >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {comp.change >= 0 ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4" />
                          )}
                          <span className="font-semibold">
                            {comp.change >= 0 ? '+' : ''}{comp.change}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Regions Tab */}
          <TabsContent value="regions">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>
                  {isSpanish ? 'Rendimiento Regional' : 'Regional Performance'}
                </CardTitle>
                <CardDescription>
                  {isSpanish ? 'Comparaci\u00f3n de compensaci\u00f3n por regi\u00f3n' : 'Outcome comparison by region'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={regionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey={isSpanish ? 'regionEs' : 'region'}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => formatCompact(v)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCompact(value), '']}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="current"
                      name={isSpanish ? 'A\u00f1o Actual' : 'Current Year'}
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="previous"
                      name={isSpanish ? 'A\u00f1o Anterior' : 'Previous Year'}
                      fill="#cbd5e1"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Quarterly Performance */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-slate-400" />
                    {isSpanish ? 'Rendimiento Trimestral' : 'Quarterly Performance'}
                  </CardTitle>
                  <CardDescription>
                    {isSpanish ? 'Totales trimestrales 2024' : '2024 quarterly totals'}
                  </CardDescription>
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
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatCompact(v)}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCompact(value), '']}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name={isSpanish ? 'Real' : 'Actual'}
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#quarterGradient)"
                      />
                      <Line
                        type="monotone"
                        dataKey="target"
                        name={isSpanish ? 'Meta' : 'Target'}
                        stroke="#f59e0b"
                        strokeDasharray="5 5"
                        dot={false}
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
                    {isSpanish ? 'Proyecci\u00f3n de Tendencia' : 'Trend Projection'}
                  </CardTitle>
                  <CardDescription>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                      {isSpanish ? 'Proyectado' : 'Projected'}
                    </Badge>
                    <span className="ml-2">
                      {isSpanish ? 'Pron\u00f3stico Q1 2025' : 'Q1 2025 forecast'}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={projectionData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                      <XAxis
                        dataKey={isSpanish ? 'monthEs' : 'month'}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatCompact(v)}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCompact(value), '']}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name={isSpanish ? 'Real' : 'Actual'}
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="projected"
                        name={isSpanish ? 'Proyectado' : 'Projected'}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-sm text-amber-800">
                      <strong>{isSpanish ? 'Proyecci\u00f3n:' : 'Projection:'}</strong>{' '}
                      {isSpanish
                        ? 'Basado en tendencias actuales, Q1 2025 se estima en $1.67M en compensaci\u00f3n total, representando 11% de crecimiento.'
                        : 'Based on current trends, Q1 2025 is estimated to reach $1.67M in total outcomes, representing 11% growth.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
