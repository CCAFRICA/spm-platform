/**
 * Analytics Service
 *
 * Provides executive analytics data and reporting capabilities.
 */

import type {
  AnalyticsDashboard,
  KPIMetric,
  MetricTimeSeries,
  DimensionBreakdown,
  MetricType,
  TimeGranularity,
  SavedReport,
  ExportConfig,
} from '@/types/analytics';

const REPORTS_STORAGE_KEY = 'saved_reports';

// ============================================
// DASHBOARD DATA
// ============================================

/**
 * Get executive dashboard data
 */
export function getExecutiveDashboard(
  tenantId: string,
  startDate: string,
  endDate: string
): AnalyticsDashboard {
  const kpis = generateKPIs();
  const trends = generateTrends(startDate, endDate);
  const breakdowns = generateBreakdowns();

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    period: {
      start: startDate,
      end: endDate,
      label: formatPeriodLabel(startDate, endDate),
      labelEs: formatPeriodLabelEs(startDate, endDate),
    },
    kpis,
    trends,
    breakdowns,
  };
}

/**
 * Get specific metric time series with drill-down
 */
export function getMetricTimeSeries(
  _tenantId: string,
  metric: MetricType,
  granularity: TimeGranularity,
  startDate: string,
  endDate: string
): MetricTimeSeries {
  // Generate demo data based on metric and granularity
  const dataPoints = generateTimeSeriesData(metric, granularity, startDate, endDate);

  const values = dataPoints.map(d => d.value);
  const total = values.reduce((a, b) => a + b, 0);

  return {
    metricId: metric,
    metricName: getMetricName(metric),
    metricNameEs: getMetricNameEs(metric),
    granularity,
    data: dataPoints,
    summary: {
      total,
      average: total / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      trend: calculateTrend(values),
    },
  };
}

/**
 * Get dimension breakdown for a metric
 */
export function getDimensionBreakdown(
  tenantId: string,
  metric: MetricType,
  dimension: 'region' | 'team' | 'product' | 'rep'
): DimensionBreakdown {
  const breakdownData = getDimensionData(metric, dimension);

  return {
    dimension: getDimensionName(dimension),
    dimensionEs: getDimensionNameEs(dimension),
    segments: breakdownData,
  };
}

// ============================================
// SAVED REPORTS
// ============================================

/**
 * Get all saved reports
 */
export function getSavedReports(tenantId: string): SavedReport[] {
  if (typeof window === 'undefined') return getDefaultReports(tenantId);

  const stored = localStorage.getItem(REPORTS_STORAGE_KEY);
  if (!stored) {
    const defaults = getDefaultReports(tenantId);
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const all: SavedReport[] = JSON.parse(stored);
    return all.filter(r => r.tenantId === tenantId);
  } catch {
    return [];
  }
}

/**
 * Save a new report
 */
export function saveReport(
  tenantId: string,
  name: string,
  description: string,
  config: SavedReport['config'],
  createdBy: string
): SavedReport {
  const report: SavedReport = {
    id: `report-${Date.now()}`,
    tenantId,
    name,
    nameEs: name,
    description,
    descriptionEs: description,
    config,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const all = getAllReports();
  all.push(report);
  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(all));

  return report;
}

/**
 * Delete a saved report
 */
export function deleteReport(reportId: string): boolean {
  const all = getAllReports();
  const filtered = all.filter(r => r.id !== reportId);

  if (filtered.length === all.length) return false;

  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

// ============================================
// EXPORT
// ============================================

/**
 * Export analytics data
 */
export function exportAnalytics(
  tenantId: string,
  config: ExportConfig
): { filename: string; data: string } {
  const dashboard = getExecutiveDashboard(tenantId, config.dateRange.start, config.dateRange.end);

  const filteredKPIs = dashboard.kpis.filter(k => config.metrics.includes(k.id));

  if (config.format === 'csv') {
    const headers = ['Metric', 'Value', 'Previous', 'Change', 'Change %'];
    const rows = filteredKPIs.map(k => [
      k.name,
      k.value.toString(),
      k.previousValue.toString(),
      k.change.toString(),
      `${k.changePercent}%`,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    return {
      filename: `analytics-export-${new Date().toISOString().split('T')[0]}.csv`,
      data: csv,
    };
  }

  // For other formats, return JSON representation
  return {
    filename: `analytics-export-${new Date().toISOString().split('T')[0]}.json`,
    data: JSON.stringify({ kpis: filteredKPIs, breakdowns: config.includeBreakdowns ? dashboard.breakdowns : [] }, null, 2),
  };
}

// ============================================
// HELPERS
// ============================================

function getAllReports(): SavedReport[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(REPORTS_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function generateKPIs(): KPIMetric[] {
  return [
    {
      id: 'revenue',
      name: 'Revenue',
      nameEs: 'Ingresos',
      value: 2847500,
      previousValue: 2456000,
      change: 391500,
      changePercent: 15.9,
      trend: 'up',
      format: 'currency',
      target: 3000000,
      targetAttainment: 94.9,
    },
    {
      id: 'quota_attainment',
      name: 'Quota Attainment',
      nameEs: 'Cumplimiento de Cuota',
      value: 87.3,
      previousValue: 82.1,
      change: 5.2,
      changePercent: 6.3,
      trend: 'up',
      format: 'percent',
      target: 100,
      targetAttainment: 87.3,
    },
    {
      id: 'commission_paid',
      name: 'Commission Paid',
      nameEs: 'Comisiones Pagadas',
      value: 284750,
      previousValue: 245600,
      change: 39150,
      changePercent: 15.9,
      trend: 'up',
      format: 'currency',
    },
    {
      id: 'headcount',
      name: 'Headcount',
      nameEs: 'Personal',
      value: 47,
      previousValue: 45,
      change: 2,
      changePercent: 4.4,
      trend: 'up',
      format: 'number',
    },
    {
      id: 'avg_deal_size',
      name: 'Avg Deal Size',
      nameEs: 'Tamaño Promedio de Venta',
      value: 12850,
      previousValue: 11200,
      change: 1650,
      changePercent: 14.7,
      trend: 'up',
      format: 'currency',
    },
    {
      id: 'win_rate',
      name: 'Win Rate',
      nameEs: 'Tasa de Cierre',
      value: 34.2,
      previousValue: 31.8,
      change: 2.4,
      changePercent: 7.5,
      trend: 'up',
      format: 'percent',
    },
    {
      id: 'pipeline_value',
      name: 'Pipeline Value',
      nameEs: 'Valor del Pipeline',
      value: 8450000,
      previousValue: 7200000,
      change: 1250000,
      changePercent: 17.4,
      trend: 'up',
      format: 'currency',
    },
    {
      id: 'customer_retention',
      name: 'Customer Retention',
      nameEs: 'Retención de Clientes',
      value: 92.1,
      previousValue: 93.5,
      change: -1.4,
      changePercent: -1.5,
      trend: 'down',
      format: 'percent',
      target: 95,
      targetAttainment: 96.9,
    },
  ];
}

function generateTrends(startDate: string, endDate: string): MetricTimeSeries[] {
  const metrics: MetricType[] = ['revenue', 'quota_attainment', 'commission_paid'];

  return metrics.map(metric => ({
    metricId: metric,
    metricName: getMetricName(metric),
    metricNameEs: getMetricNameEs(metric),
    granularity: 'monthly' as TimeGranularity,
    data: generateTimeSeriesData(metric, 'monthly', startDate, endDate),
    summary: {
      total: 0,
      average: 0,
      min: 0,
      max: 0,
      trend: 5.2,
    },
  }));
}

function generateTimeSeriesData(
  metric: MetricType,
  granularity: TimeGranularity,
  startDate: string,
  endDate: string
): { date: string; value: number; previousValue?: number; target?: number }[] {
  const data: { date: string; value: number; previousValue?: number; target?: number }[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const current = new Date(start);
  let baseValue = getBaseValue(metric);

  while (current <= end) {
    const variance = (Math.random() - 0.3) * 0.2; // Slight upward bias
    const value = baseValue * (1 + variance);
    const previousValue = baseValue * (1 + (Math.random() - 0.5) * 0.15);

    data.push({
      date: current.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
      previousValue: Math.round(previousValue * 100) / 100,
      target: metric === 'revenue' ? baseValue * 1.1 : undefined,
    });

    // Increment based on granularity
    switch (granularity) {
      case 'daily':
        current.setDate(current.getDate() + 1);
        break;
      case 'weekly':
        current.setDate(current.getDate() + 7);
        break;
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'quarterly':
        current.setMonth(current.getMonth() + 3);
        break;
      case 'yearly':
        current.setFullYear(current.getFullYear() + 1);
        break;
    }

    baseValue *= 1.02; // Slight growth
  }

  return data;
}

function getBaseValue(metric: MetricType): number {
  const bases: Record<MetricType, number> = {
    revenue: 250000,
    quota_attainment: 85,
    commission_paid: 25000,
    headcount: 45,
    avg_deal_size: 12000,
    win_rate: 32,
    pipeline_value: 700000,
    customer_retention: 92,
  };
  return bases[metric];
}

function generateBreakdowns(): DimensionBreakdown[] {
  return [
    {
      dimension: 'Region',
      dimensionEs: 'Región',
      segments: [
        { id: 'west', name: 'West', nameEs: 'Oeste', value: 985000, percent: 34.6, change: 12.3 },
        { id: 'east', name: 'East', nameEs: 'Este', value: 842000, percent: 29.6, change: 8.7 },
        { id: 'central', name: 'Central', nameEs: 'Centro', value: 621000, percent: 21.8, change: 15.2 },
        { id: 'south', name: 'South', nameEs: 'Sur', value: 399500, percent: 14.0, change: -2.1 },
      ],
    },
    {
      dimension: 'Product',
      dimensionEs: 'Producto',
      segments: [
        { id: 'enterprise', name: 'Enterprise', nameEs: 'Empresarial', value: 1423750, percent: 50.0, change: 18.5 },
        { id: 'professional', name: 'Professional', nameEs: 'Profesional', value: 854250, percent: 30.0, change: 12.1 },
        { id: 'starter', name: 'Starter', nameEs: 'Inicial', value: 569500, percent: 20.0, change: 8.3 },
      ],
    },
    {
      dimension: 'Team',
      dimensionEs: 'Equipo',
      segments: [
        { id: 'team-a', name: 'Team Alpha', nameEs: 'Equipo Alfa', value: 712000, percent: 25.0, change: 22.1 },
        { id: 'team-b', name: 'Team Beta', nameEs: 'Equipo Beta', value: 684000, percent: 24.0, change: 15.3 },
        { id: 'team-c', name: 'Team Gamma', nameEs: 'Equipo Gamma', value: 627000, percent: 22.0, change: 11.8 },
        { id: 'team-d', name: 'Team Delta', nameEs: 'Equipo Delta', value: 540000, percent: 19.0, change: 9.2 },
        { id: 'team-e', name: 'Team Epsilon', nameEs: 'Equipo Epsilon', value: 284500, percent: 10.0, change: 5.7 },
      ],
    },
  ];
}

function getDimensionData(
  metric: MetricType,
  dimension: string
): DimensionBreakdown['segments'] {
  // Return appropriate demo data based on dimension
  const breakdowns = generateBreakdowns();
  const found = breakdowns.find(b => b.dimension.toLowerCase() === dimension);
  return found?.segments || [];
}

function getMetricName(metric: MetricType): string {
  const names: Record<MetricType, string> = {
    revenue: 'Revenue',
    quota_attainment: 'Quota Attainment',
    commission_paid: 'Commission Paid',
    headcount: 'Headcount',
    avg_deal_size: 'Avg Deal Size',
    win_rate: 'Win Rate',
    pipeline_value: 'Pipeline Value',
    customer_retention: 'Customer Retention',
  };
  return names[metric];
}

function getMetricNameEs(metric: MetricType): string {
  const names: Record<MetricType, string> = {
    revenue: 'Ingresos',
    quota_attainment: 'Cumplimiento de Cuota',
    commission_paid: 'Comisiones Pagadas',
    headcount: 'Personal',
    avg_deal_size: 'Tamaño Promedio de Venta',
    win_rate: 'Tasa de Cierre',
    pipeline_value: 'Valor del Pipeline',
    customer_retention: 'Retención de Clientes',
  };
  return names[metric];
}

function getDimensionName(dimension: string): string {
  const names: Record<string, string> = {
    region: 'Region',
    team: 'Team',
    product: 'Product',
    rep: 'Sales Rep',
  };
  return names[dimension] || dimension;
}

function getDimensionNameEs(dimension: string): string {
  const names: Record<string, string> = {
    region: 'Región',
    team: 'Equipo',
    product: 'Producto',
    rep: 'Representante',
  };
  return names[dimension] || dimension;
}

function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values.slice(0, Math.floor(values.length / 2));
  const second = values.slice(Math.floor(values.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
  return ((avgSecond - avgFirst) / avgFirst) * 100;
}

function formatPeriodLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}

function formatPeriodLabelEs(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })} - ${e.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`;
}

function getDefaultReports(tenantId: string): SavedReport[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'report-exec-summary',
      tenantId,
      name: 'Executive Summary',
      nameEs: 'Resumen Ejecutivo',
      description: 'Weekly executive summary with key metrics',
      descriptionEs: 'Resumen ejecutivo semanal con métricas clave',
      config: {
        metrics: ['revenue', 'quota_attainment', 'commission_paid', 'win_rate'],
        granularity: 'weekly',
        comparison: 'previous_period',
        breakdowns: ['region', 'team'],
      },
      schedule: {
        frequency: 'weekly',
        recipients: ['exec@company.com'],
        nextRun: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'report-monthly-performance',
      tenantId,
      name: 'Monthly Performance',
      nameEs: 'Rendimiento Mensual',
      description: 'Monthly performance review by team',
      descriptionEs: 'Revisión de rendimiento mensual por equipo',
      config: {
        metrics: ['revenue', 'quota_attainment', 'avg_deal_size', 'pipeline_value'],
        granularity: 'monthly',
        comparison: 'year_over_year',
        breakdowns: ['team', 'product'],
      },
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * Initialize analytics
 */
export function initializeAnalytics(tenantId: string): void {
  if (typeof window === 'undefined') return;

  const existing = localStorage.getItem(REPORTS_STORAGE_KEY);
  if (!existing) {
    const defaults = getDefaultReports(tenantId);
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(defaults));
  }
}
