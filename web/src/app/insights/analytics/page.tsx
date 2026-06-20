'use client';

/**
 * Advanced Analytics Dashboard Page
 *
 * Executive summary with KPIs and a real period-over-period payout trend.
 *
 * OB-226 Objective C: this page previously rendered 100% synthetic data from
 * analytics-service (generateKPIs / generateTrends / generateBreakdowns — West/East/
 * Enterprise/Team Alpha, Math.random series). It now derives every rendered number
 * from real calculation_results via the OB-224 drill-through layer
 * (getEntityResults / getPeriodsWithResults). Dimensions the platform does NOT collect
 * (regional/segment/team budgets) are HONEST EMPTY STATES — never fabricated.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  RefreshCw,
  ChevronLeft,
  BarChart3,
  PieChart,
  TrendingUp,
  FileText,
  Layers,
} from 'lucide-react';
import { KPICard } from '@/components/analytics/KPICard';
import { MetricTrendChart } from '@/components/analytics/MetricTrendChart';
import { ExportDialog } from '@/components/analytics/ExportDialog';
import { getEntityResults, getPeriodsWithResults } from '@/lib/drill-through';
import type { EntityResult, EntityScope } from '@/lib/drill-through';
import type { KPIMetric, MetricTimeSeries, MetricType, ExportConfig } from '@/types/analytics';
import { useLocale } from '@/contexts/locale-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313

const ALL_SCOPE: EntityScope = {
  visibleEntityIds: [],
  visibleRuleSetIds: [],
  visiblePeriodIds: [],
  scopeType: 'all',
};

/** One period's real aggregate, derived from calculation_results (drill-through layer). */
interface PeriodAggregate {
  periodId: string;
  periodLabel: string;
  totalPayout: number;
  entityCount: number;
  avgPayout: number;
  topPerformer: EntityResult | null;
}

export default function AnalyticsDashboardPage() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const isSpanish = locale === 'es-MX';
  const tenantId = currentTenant?.id;
  const isVialuce = useIsVialuce(); // HF-313: Vialuce page-template adoption (else-branch unchanged)

  // Real per-period aggregates (most-recent first). Empty until calculations exist.
  const [aggregates, setAggregates] = useState<PeriodAggregate[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [showExport, setShowExport] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const periodList = await getPeriodsWithResults(tenantId);

      // Build a real period-over-period series by aggregating calculation_results per period.
      const perPeriod = await Promise.all(
        periodList.map(async (p) => {
          const rows = await getEntityResults(tenantId, ALL_SCOPE, { periodId: p.id });
          const totalPayout = rows.reduce((sum, r) => sum + (r.totalPayout || 0), 0);
          const entityCount = rows.length;
          const topPerformer = rows.length
            ? rows.reduce((best, r) => (r.totalPayout > (best?.totalPayout ?? -Infinity) ? r : best), rows[0])
            : null;
          return {
            periodId: p.id,
            periodLabel: p.label,
            totalPayout,
            entityCount,
            avgPayout: entityCount ? totalPayout / entityCount : 0,
            topPerformer,
          } as PeriodAggregate;
        })
      );
      setAggregates(perPeriod);
    } catch (err) {
      console.warn('[Analytics] Failed to load:', err);
      setAggregates([]);
    }
    setIsLoading(false);
    setLoaded(true);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    loadDashboard();
  }, [tenantId, loadDashboard]);

  // Latest period = first (getPeriodsWithResults returns most-recent first).
  const latest = aggregates[0] ?? null;
  // The immediately-prior period, for an honest period-over-period delta on total payout.
  const prior = aggregates[1] ?? null;

  const periodLabel = latest
    ? latest.periodLabel
    : isSpanish
      ? 'Sin datos'
      : 'No data';

  // Real KPIs derived strictly from calculation_results. We only surface the dimensions
  // the platform actually computes: total payout, entities paid, average payout. Change %
  // is a real period-over-period delta when a prior period exists (0 otherwise — never faked).
  const kpis: KPIMetric[] = useMemo(() => {
    if (!latest) return [];
    const payoutChange = prior ? latest.totalPayout - prior.totalPayout : 0;
    const payoutChangePct =
      prior && prior.totalPayout !== 0 ? (payoutChange / prior.totalPayout) * 100 : 0;
    const countChange = prior ? latest.entityCount - prior.entityCount : 0;
    const countChangePct =
      prior && prior.entityCount !== 0 ? (countChange / prior.entityCount) * 100 : 0;
    const avgChange = prior ? latest.avgPayout - prior.avgPayout : 0;
    const avgChangePct =
      prior && prior.avgPayout !== 0 ? (avgChange / prior.avgPayout) * 100 : 0;
    const trendOf = (n: number): KPIMetric['trend'] => (n > 0 ? 'up' : n < 0 ? 'down' : 'stable');

    return [
      {
        id: 'commission_paid',
        name: 'Total Payout',
        nameEs: 'Pago Total',
        value: latest.totalPayout,
        previousValue: prior?.totalPayout ?? 0,
        change: payoutChange,
        changePercent: payoutChangePct,
        trend: trendOf(payoutChange),
        format: 'currency',
      },
      {
        id: 'headcount',
        name: 'Entities Paid',
        nameEs: 'Entidades Pagadas',
        value: latest.entityCount,
        previousValue: prior?.entityCount ?? 0,
        change: countChange,
        changePercent: countChangePct,
        trend: trendOf(countChange),
        format: 'number',
      },
      {
        id: 'avg_deal_size',
        name: 'Average Payout',
        nameEs: 'Pago Promedio',
        value: latest.avgPayout,
        previousValue: prior?.avgPayout ?? 0,
        change: avgChange,
        changePercent: avgChangePct,
        trend: trendOf(avgChange),
        format: 'currency',
      },
    ];
  }, [latest, prior]);

  // Real period-over-period total-payout trend (chronological), built from aggregates.
  const payoutTrend: MetricTimeSeries | null = useMemo(() => {
    if (aggregates.length === 0) return null;
    const chronological = [...aggregates].reverse(); // oldest → newest for the time axis
    const values = chronological.map((a) => a.totalPayout);
    const total = values.reduce((a, b) => a + b, 0);
    return {
      metricId: 'commission_paid',
      metricName: isSpanish ? 'Pago Total por Período' : 'Total Payout by Period',
      metricNameEs: 'Pago Total por Período',
      granularity: 'monthly',
      data: chronological.map((a) => ({ date: a.periodLabel, value: a.totalPayout })),
      summary: {
        total,
        average: values.length ? total / values.length : 0,
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        trend:
          values.length >= 2 && values[0] !== 0
            ? ((values[values.length - 1] - values[0]) / values[0]) * 100
            : 0,
      },
    };
  }, [aggregates, isSpanish]);

  // The MetricTrendChart formats the x-axis as a date; period labels are not dates, so we
  // pass them as the data `date` field — the chart renders them verbatim as category ticks.

  const handleMetricClick = (metric: MetricType) => {
    setSelectedMetric(metric);
    setActiveTab('detail');
  };

  const handleBackFromDetail = () => {
    setSelectedMetric(null);
    setActiveTab('overview');
  };

  // Export a CSV built ONLY from the real KPIs rendered on this page — no mock generators.
  const handleExport = (config: ExportConfig) => {
    const headers = isSpanish
      ? ['Métrica', 'Valor', 'Anterior', 'Cambio', 'Cambio %']
      : ['Metric', 'Value', 'Previous', 'Change', 'Change %'];
    const rows = kpis
      .filter((k) => config.metrics.length === 0 || config.metrics.includes(k.id))
      .map((k) => [
        isSpanish ? k.nameEs : k.name,
        String(k.value),
        String(k.previousValue),
        String(k.change),
        `${k.changePercent.toFixed(1)}%`,
      ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const filename = `analytics-${periodLabel.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateRange = { start: '', end: periodLabel };

  // Loading skeleton (first load).
  if (!loaded && isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Honest empty state: no calculations run yet for this tenant → nothing to analyze.
  if (loaded && aggregates.length === 0) {
    if (isVialuce) {
      return (
        <div className="page">
          <div className="phead">
            <div>
              <h1>{isSpanish ? 'Panel de Análisis' : 'Analytics Dashboard'}</h1>
              <div className="sub">{isSpanish ? 'Sin datos' : 'No data'}</div>
            </div>
          </div>
          <div className="empty">
            <div className="ic"><BarChart3 className="h-7 w-7" /></div>
            <b>{isSpanish ? 'No hay datos de cálculo' : 'No Calculation Data'}</b>
            <p>
              {isSpanish
                ? 'Las métricas aparecerán aquí una vez que se ejecuten cálculos de comisiones.'
                : 'Metrics will appear here once commission calculations have been run.'}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {isSpanish ? 'No hay datos de cálculo' : 'No Calculation Data'}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {isSpanish
                ? 'Las métricas aparecerán aquí una vez que se ejecuten cálculos de comisiones.'
                : 'Metrics will appear here once commission calculations have been run.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    // HF-313: Vialuce page frame (.page) + .phead header; else (dark/bliss) byte-identical.
    <div className={isVialuce ? 'page space-y-6' : 'p-6 space-y-6'}>
      {/* Header */}
      {isVialuce ? (
        <div className="phead">
          <div className="flex items-center gap-4">
            {selectedMetric && (
              <Button variant="ghost" size="sm" onClick={handleBackFromDetail}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {isSpanish ? 'Volver' : 'Back'}
              </Button>
            )}
            <div>
              <h1>{isSpanish ? 'Panel de Análisis' : 'Analytics Dashboard'}</h1>
              <div className="sub">{periodLabel}</div>
            </div>
          </div>
          <div className="pactions">
            <Button variant="outline" size="icon" onClick={loadDashboard} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            <Button onClick={() => setShowExport(true)}>
              <Download className="h-4 w-4 mr-2" />
              {isSpanish ? 'Exportar' : 'Export'}
            </Button>
          </div>
        </div>
      ) : (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedMetric && (
            <Button variant="ghost" size="sm" onClick={handleBackFromDetail}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {isSpanish ? 'Volver' : 'Back'}
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">
              {isSpanish ? 'Panel de Análisis' : 'Analytics Dashboard'}
            </h1>
            <p className="text-muted-foreground">{periodLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={loadDashboard} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button onClick={() => setShowExport(true)}>
            <Download className="h-4 w-4 mr-2" />
            {isSpanish ? 'Exportar' : 'Export'}
          </Button>
        </div>
      </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            {isSpanish ? 'Resumen' : 'Overview'}
          </TabsTrigger>
          <TabsTrigger value="detail">
            <TrendingUp className="h-4 w-4 mr-2" />
            {isSpanish ? 'Detalle' : 'Detail'}
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="h-4 w-4 mr-2" />
            {isSpanish ? 'Reportes' : 'Reports'}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Grid — real values from calculation_results */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {kpis.map((kpi) => (
              <KPICard
                key={kpi.id}
                metric={kpi}
                onClick={() => handleMetricClick(kpi.id)}
              />
            ))}
          </div>

          {/* Trends and Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Real period-over-period total-payout trend */}
            {payoutTrend && payoutTrend.data.length > 1 ? (
              <MetricTrendChart
                series={payoutTrend}
                showComparison={false}
                chartType="area"
                height={300}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium mb-1">
                    {isSpanish ? 'Tendencia no disponible' : 'Trend Unavailable'}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    {isSpanish
                      ? 'Se necesitan al menos dos períodos calculados para mostrar una tendencia.'
                      : 'At least two calculated periods are required to show a trend.'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Dimension Breakdown — HONEST EMPTY STATE: the platform does not collect
                regional / segment / team dimensions for commission outcomes. */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">
                  {isSpanish ? 'Desglose por Dimensión' : 'Dimension Breakdown'}
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant={chartType === 'bar' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartType('bar')}
                    disabled
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartType === 'pie' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartType('pie')}
                    disabled
                  >
                    <PieChart className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Card>
                <CardContent className="py-12 text-center">
                  <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium mb-1">
                    {isSpanish ? 'Sin dimensión de segmento' : 'No Segment Dimension'}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {isSpanish
                      ? 'Los datos de cálculo no incluyen dimensiones de región, equipo o producto. Los desgloses por segmento no están disponibles para este inquilino.'
                      : 'The calculation data does not carry region, team, or product dimensions. Segment breakdowns are not available for this tenant.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Detail Tab */}
        <TabsContent value="detail" className="space-y-6">
          {selectedMetric && payoutTrend && payoutTrend.data.length > 1 ? (
            <>
              {/* Detail Chart — real per-period series */}
              <MetricTrendChart
                series={payoutTrend}
                showComparison={false}
                chartType="line"
                height={400}
              />

              {/* Summary Stats — derived from the real series */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Total' : 'Total'}
                    </p>
                    <p className="text-xl font-bold">{format(payoutTrend.summary.total)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Promedio' : 'Average'}
                    </p>
                    <p className="text-xl font-bold">{format(payoutTrend.summary.average)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Mínimo' : 'Min'}
                    </p>
                    <p className="text-xl font-bold">{format(payoutTrend.summary.min)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Máximo' : 'Max'}
                    </p>
                    <p className="text-xl font-bold">{format(payoutTrend.summary.max)}</p>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {selectedMetric
                    ? isSpanish
                      ? 'Se necesitan al menos dos períodos calculados para ver el detalle.'
                      : 'At least two calculated periods are required to see detail.'
                    : isSpanish
                      ? 'Seleccione una métrica del resumen para ver detalles'
                      : 'Select a metric from the overview to see details'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reports Tab — HONEST EMPTY STATE: saved-report scheduling is not persisted
            for this tenant (no report store). */}
        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium mb-1">
                {isSpanish ? 'Sin reportes guardados' : 'No Saved Reports'}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {isSpanish
                  ? 'Aún no hay reportes guardados. Use Exportar para descargar las métricas del período actual.'
                  : 'No saved reports yet. Use Export to download the current period’s metrics.'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export Dialog — exports real KPIs to CSV */}
      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        onExport={handleExport}
        dateRange={dateRange}
      />
    </div>
  );
}
