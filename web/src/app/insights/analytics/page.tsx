'use client';

/**
 * Advanced Analytics Dashboard Page
 *
 * Executive summary with KPIs, drill-down analytics, and export capabilities.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  RefreshCw,
  Calendar,
  ChevronLeft,
  BarChart3,
  PieChart,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { KPICard } from '@/components/analytics/KPICard';
import { MetricTrendChart } from '@/components/analytics/MetricTrendChart';
import { BreakdownChart } from '@/components/analytics/BreakdownChart';
import { ExportDialog } from '@/components/analytics/ExportDialog';
import { SavedReportsList } from '@/components/analytics/SavedReportsList';
import {
  getExecutiveDashboard,
  getMetricTimeSeries,
  getSavedReports,
  deleteReport,
  exportAnalytics,
} from '@/lib/analytics/analytics-service';
import type {
  AnalyticsDashboard,
  MetricType,
  TimeGranularity,
  MetricTimeSeries,
  DrillDownPath,
  SavedReport,
} from '@/types/analytics';
import { TIME_GRANULARITIES } from '@/types/analytics';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';

type TimeRange = '7d' | '30d' | '90d' | 'ytd' | '1y';

const TIME_RANGES: Record<TimeRange, { en: string; es: string }> = {
  '7d': { en: 'Last 7 Days', es: 'Últimos 7 Días' },
  '30d': { en: 'Last 30 Days', es: 'Últimos 30 Días' },
  '90d': { en: 'Last 90 Days', es: 'Últimos 90 Días' },
  ytd: { en: 'Year to Date', es: 'Año a la Fecha' },
  '1y': { en: 'Last Year', es: 'Último Año' },
};

function getDateRange(range: TimeRange): { start: string; end: string } {
  const end = new Date();
  let start = new Date();

  switch (range) {
    case '7d':
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      start.setDate(end.getDate() - 30);
      break;
    case '90d':
      start.setDate(end.getDate() - 90);
      break;
    case 'ytd':
      start = new Date(end.getFullYear(), 0, 1);
      break;
    case '1y':
      start.setFullYear(end.getFullYear() - 1);
      break;
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function AnalyticsDashboardPage() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const isSpanish = locale === 'es-MX';
  const tenantId = currentTenant?.id;

  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [granularity, setGranularity] = useState<TimeGranularity>('weekly');
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>(null);
  const [metricDetail, setMetricDetail] = useState<MetricTimeSeries | null>(null);
  const [drillPath, setDrillPath] = useState<DrillDownPath[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [isLoading, setIsLoading] = useState(false);

  const dateRange = getDateRange(timeRange);

  useEffect(() => {
    if (!tenantId) return;
    // Load dashboard data
    setIsLoading(true);
    const timer = setTimeout(() => {
      const data = getExecutiveDashboard(tenantId, dateRange.start, dateRange.end);
      setDashboard(data);
      setIsLoading(false);
    }, 300);

    // Load saved reports
    const reports = getSavedReports(tenantId);
    setSavedReports(reports);

    return () => clearTimeout(timer);
  }, [timeRange, tenantId, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (!tenantId) return;
    if (selectedMetric) {
      const detail = getMetricTimeSeries(
        tenantId,
        selectedMetric,
        granularity,
        dateRange.start,
        dateRange.end
      );
      setMetricDetail(detail);
    }
  }, [selectedMetric, granularity, tenantId, dateRange.start, dateRange.end]);

  const loadDashboard = () => {
    if (!tenantId) return;
    setIsLoading(true);
    setTimeout(() => {
      const data = getExecutiveDashboard(tenantId, dateRange.start, dateRange.end);
      setDashboard(data);
      setIsLoading(false);
    }, 300);
  };

  const loadSavedReports = () => {
    if (!tenantId) return;
    const reports = getSavedReports(tenantId);
    setSavedReports(reports);
  };

  const handleMetricClick = (metric: MetricType) => {
    setSelectedMetric(metric);
    setActiveTab('detail');
  };

  const handleDrillDown = (segmentId: string, segmentName: string) => {
    setDrillPath((prev) => [
      ...prev,
      {
        level: prev.length + 1,
        dimension: 'segment',
        dimensionEs: 'segmento',
        filterId: segmentId,
        filterName: segmentName,
      },
    ]);
  };

  const handleBackFromDetail = () => {
    if (drillPath.length > 0) {
      setDrillPath((prev) => prev.slice(0, -1));
    } else {
      setSelectedMetric(null);
      setMetricDetail(null);
      setActiveTab('overview');
    }
  };

  const handleExport = (config: Parameters<typeof exportAnalytics>[1]) => {
    if (!tenantId) return;
    const result = exportAnalytics(tenantId, config);

    // Trigger download
    const blob = new Blob([result.data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunReport = (report: SavedReport) => {
    // Apply report config
    setSelectedMetric(report.config.metrics[0] || null);
    setGranularity(report.config.granularity);
    setActiveTab('detail');
  };

  const handleDeleteReport = (reportId: string) => {
    deleteReport(reportId);
    loadSavedReports();
  };

  const handleDuplicateReport = (report: SavedReport) => {
    // Would open save dialog with pre-filled data
    console.log('Duplicate report:', report.name);
  };

  if (!dashboard) {
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {(selectedMetric || drillPath.length > 0) && (
            <Button variant="ghost" size="sm" onClick={handleBackFromDetail}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {isSpanish ? 'Volver' : 'Back'}
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">
              {isSpanish ? 'Panel de Análisis' : 'Analytics Dashboard'}
            </h1>
            <p className="text-muted-foreground">
              {isSpanish ? dashboard.period.labelEs : dashboard.period.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TIME_RANGES) as TimeRange[]).map((range) => (
                <SelectItem key={range} value={range}>
                  {isSpanish ? TIME_RANGES[range].es : TIME_RANGES[range].en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={loadDashboard} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button onClick={() => setShowExport(true)}>
            <Download className="h-4 w-4 mr-2" />
            {isSpanish ? 'Exportar' : 'Export'}
          </Button>
        </div>
      </div>

      {/* Drill Path Breadcrumb */}
      {drillPath.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {isSpanish ? 'Filtros' : 'Filters'}:
          </span>
          {drillPath.map((path, index) => (
            <span key={index} className="flex items-center gap-2">
              <span className="px-2 py-1 bg-primary/10 rounded text-primary">
                {path.filterName}
              </span>
              {index < drillPath.length - 1 && (
                <span className="text-muted-foreground">→</span>
              )}
            </span>
          ))}
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
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {dashboard.kpis.map((kpi) => (
              <KPICard
                key={kpi.id}
                metric={kpi}
                onClick={() => handleMetricClick(kpi.id)}
              />
            ))}
          </div>

          {/* Trends and Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Main Trend Chart */}
            {dashboard.trends[0] && (
              <MetricTrendChart
                series={dashboard.trends[0]}
                showComparison
                chartType="area"
                height={300}
              />
            )}

            {/* Region Breakdown */}
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
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={chartType === 'pie' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartType('pie')}
                  >
                    <PieChart className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {dashboard.breakdowns[0] && (
                <BreakdownChart
                  breakdown={dashboard.breakdowns[0]}
                  chartType={chartType}
                  onDrillDown={handleDrillDown}
                  height={300}
                />
              )}
            </div>
          </div>

          {/* Additional Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dashboard.breakdowns.slice(1).map((breakdown) => (
              <BreakdownChart
                key={breakdown.dimension}
                breakdown={breakdown}
                chartType="bar"
                onDrillDown={handleDrillDown}
                height={250}
              />
            ))}
          </div>
        </TabsContent>

        {/* Detail Tab */}
        <TabsContent value="detail" className="space-y-6">
          {selectedMetric && metricDetail ? (
            <>
              {/* Granularity Selector */}
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {isSpanish ? 'Granularidad' : 'Granularity'}:
                </span>
                <Select
                  value={granularity}
                  onValueChange={(v) => setGranularity(v as TimeGranularity)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIME_GRANULARITIES) as TimeGranularity[]).map((g) => (
                      <SelectItem key={g} value={g}>
                        {isSpanish
                          ? TIME_GRANULARITIES[g].nameEs
                          : TIME_GRANULARITIES[g].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Detail Chart */}
              <MetricTrendChart
                series={metricDetail}
                showComparison
                showTarget={selectedMetric === 'revenue'}
                chartType="line"
                height={400}
              />

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Total' : 'Total'}
                    </p>
                    <p className="text-xl font-bold">
                      {metricDetail.summary.total.toLocaleString(locale)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Promedio' : 'Average'}
                    </p>
                    <p className="text-xl font-bold">
                      {metricDetail.summary.average.toLocaleString(locale, {
                        maximumFractionDigits: 1,
                      })}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Mínimo' : 'Min'}
                    </p>
                    <p className="text-xl font-bold">
                      {metricDetail.summary.min.toLocaleString(locale)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Máximo' : 'Max'}
                    </p>
                    <p className="text-xl font-bold">
                      {metricDetail.summary.max.toLocaleString(locale)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Tendencia' : 'Trend'}
                    </p>
                    <p className={`text-xl font-bold ${metricDetail.summary.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {metricDetail.summary.trend >= 0 ? '+' : ''}
                      {metricDetail.summary.trend.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Breakdown for selected metric */}
              {dashboard.breakdowns[0] && (
                <BreakdownChart
                  breakdown={dashboard.breakdowns[0]}
                  chartType="bar"
                  onDrillDown={handleDrillDown}
                  height={300}
                />
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {isSpanish
                    ? 'Seleccione una métrica del resumen para ver detalles'
                    : 'Select a metric from the overview to see details'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <SavedReportsList
            reports={savedReports}
            onRun={handleRunReport}
            onDelete={handleDeleteReport}
            onDuplicate={handleDuplicateReport}
          />
        </TabsContent>
      </Tabs>

      {/* Export Dialog */}
      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        onExport={handleExport}
        dateRange={dateRange}
      />
    </div>
  );
}
