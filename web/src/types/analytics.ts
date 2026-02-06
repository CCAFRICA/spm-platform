/**
 * Analytics Types
 *
 * Types for executive analytics dashboard and reporting.
 */

export type MetricType =
  | 'revenue'
  | 'quota_attainment'
  | 'commission_paid'
  | 'headcount'
  | 'avg_deal_size'
  | 'win_rate'
  | 'pipeline_value'
  | 'customer_retention';

export type TimeGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type ComparisonType = 'previous_period' | 'year_over_year' | 'budget' | 'forecast';

export interface KPIMetric {
  id: MetricType;
  name: string;
  nameEs: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  format: 'currency' | 'percent' | 'number';
  target?: number;
  targetAttainment?: number;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  previousValue?: number;
  target?: number;
}

export interface MetricTimeSeries {
  metricId: MetricType;
  metricName: string;
  metricNameEs: string;
  granularity: TimeGranularity;
  data: TimeSeriesDataPoint[];
  summary: {
    total: number;
    average: number;
    min: number;
    max: number;
    trend: number;
  };
}

export interface DimensionBreakdown {
  dimension: string;
  dimensionEs: string;
  segments: {
    id: string;
    name: string;
    nameEs: string;
    value: number;
    percent: number;
    change: number;
  }[];
}

export interface DrillDownPath {
  level: number;
  dimension: string;
  dimensionEs: string;
  filterId: string;
  filterName: string;
}

export interface AnalyticsDashboard {
  tenantId: string;
  generatedAt: string;
  period: {
    start: string;
    end: string;
    label: string;
    labelEs: string;
  };
  kpis: KPIMetric[];
  trends: MetricTimeSeries[];
  breakdowns: DimensionBreakdown[];
}

export interface ExportConfig {
  format: 'csv' | 'xlsx' | 'pdf';
  metrics: MetricType[];
  dateRange: {
    start: string;
    end: string;
  };
  includeCharts: boolean;
  includeBreakdowns: boolean;
}

export interface SavedReport {
  id: string;
  tenantId: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  config: {
    metrics: MetricType[];
    granularity: TimeGranularity;
    comparison: ComparisonType;
    breakdowns: string[];
  };
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    nextRun: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Metric metadata
export const METRIC_CONFIG: Record<MetricType, {
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  format: 'currency' | 'percent' | 'number';
  icon: string;
  color: string;
}> = {
  revenue: {
    name: 'Revenue',
    nameEs: 'Ingresos',
    description: 'Total revenue generated',
    descriptionEs: 'Ingresos totales generados',
    format: 'currency',
    icon: 'DollarSign',
    color: 'emerald',
  },
  quota_attainment: {
    name: 'Quota Attainment',
    nameEs: 'Cumplimiento de Cuota',
    description: 'Average quota attainment across team',
    descriptionEs: 'Promedio de cumplimiento de cuota del equipo',
    format: 'percent',
    icon: 'Target',
    color: 'blue',
  },
  commission_paid: {
    name: 'Commission Paid',
    nameEs: 'Comisiones Pagadas',
    description: 'Total commissions paid out',
    descriptionEs: 'Total de comisiones pagadas',
    format: 'currency',
    icon: 'Wallet',
    color: 'violet',
  },
  headcount: {
    name: 'Headcount',
    nameEs: 'Personal',
    description: 'Number of active sales reps',
    descriptionEs: 'Número de representantes activos',
    format: 'number',
    icon: 'Users',
    color: 'amber',
  },
  avg_deal_size: {
    name: 'Avg Deal Size',
    nameEs: 'Tamaño Promedio de Venta',
    description: 'Average closed deal value',
    descriptionEs: 'Valor promedio de ventas cerradas',
    format: 'currency',
    icon: 'TrendingUp',
    color: 'cyan',
  },
  win_rate: {
    name: 'Win Rate',
    nameEs: 'Tasa de Cierre',
    description: 'Percentage of deals won',
    descriptionEs: 'Porcentaje de ventas ganadas',
    format: 'percent',
    icon: 'CheckCircle',
    color: 'green',
  },
  pipeline_value: {
    name: 'Pipeline Value',
    nameEs: 'Valor del Pipeline',
    description: 'Total value of open opportunities',
    descriptionEs: 'Valor total de oportunidades abiertas',
    format: 'currency',
    icon: 'BarChart3',
    color: 'indigo',
  },
  customer_retention: {
    name: 'Customer Retention',
    nameEs: 'Retención de Clientes',
    description: 'Customer retention rate',
    descriptionEs: 'Tasa de retención de clientes',
    format: 'percent',
    icon: 'Heart',
    color: 'rose',
  },
};

export const TIME_GRANULARITIES: Record<TimeGranularity, {
  name: string;
  nameEs: string;
}> = {
  daily: { name: 'Daily', nameEs: 'Diario' },
  weekly: { name: 'Weekly', nameEs: 'Semanal' },
  monthly: { name: 'Monthly', nameEs: 'Mensual' },
  quarterly: { name: 'Quarterly', nameEs: 'Trimestral' },
  yearly: { name: 'Yearly', nameEs: 'Anual' },
};

export const COMPARISON_TYPES: Record<ComparisonType, {
  name: string;
  nameEs: string;
}> = {
  previous_period: { name: 'Previous Period', nameEs: 'Período Anterior' },
  year_over_year: { name: 'Year over Year', nameEs: 'Año contra Año' },
  budget: { name: 'vs Budget', nameEs: 'vs Presupuesto' },
  forecast: { name: 'vs Forecast', nameEs: 'vs Pronóstico' },
};
