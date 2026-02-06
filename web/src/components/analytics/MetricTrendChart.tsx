'use client';

/**
 * Metric Trend Chart Component
 *
 * Displays a time series chart for a metric with comparison data.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from 'recharts';
import type { MetricTimeSeries } from '@/types/analytics';
import { useLocale } from '@/contexts/locale-context';

interface MetricTrendChartProps {
  series: MetricTimeSeries;
  showComparison?: boolean;
  showTarget?: boolean;
  chartType?: 'line' | 'area';
  height?: number;
}

export function MetricTrendChart({
  series,
  showComparison = true,
  showTarget = false,
  chartType = 'area',
  height = 300,
}: MetricTrendChartProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  };

  const formatValue = (value: number) => {
    if (series.metricId === 'quota_attainment' || series.metricId === 'win_rate' || series.metricId === 'customer_retention') {
      return `${value.toFixed(1)}%`;
    }
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return value.toFixed(0);
  };

  const data = series.data.map(point => ({
    date: formatDate(point.date),
    value: point.value,
    previous: point.previousValue,
    target: point.target,
  }));

  const ChartComponent = chartType === 'area' ? AreaChart : LineChart;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {isSpanish ? series.metricNameEs : series.metricName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <ChartComponent data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatValue}
            />
            <Tooltip
              formatter={(value: number) => [formatValue(value), '']}
              labelStyle={{ color: 'var(--foreground)' }}
              contentStyle={{
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}
            />
            <Legend />
            {chartType === 'area' ? (
              <>
                <Area
                  type="monotone"
                  dataKey="value"
                  name={isSpanish ? 'Actual' : 'Current'}
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                {showComparison && (
                  <Area
                    type="monotone"
                    dataKey="previous"
                    name={isSpanish ? 'Anterior' : 'Previous'}
                    stroke="hsl(var(--muted-foreground))"
                    fill="hsl(var(--muted-foreground))"
                    fillOpacity={0.1}
                    strokeWidth={1}
                    strokeDasharray="5 5"
                  />
                )}
              </>
            ) : (
              <>
                <Line
                  type="monotone"
                  dataKey="value"
                  name={isSpanish ? 'Actual' : 'Current'}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                {showComparison && (
                  <Line
                    type="monotone"
                    dataKey="previous"
                    name={isSpanish ? 'Anterior' : 'Previous'}
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                )}
              </>
            )}
            {showTarget && (
              <Line
                type="monotone"
                dataKey="target"
                name={isSpanish ? 'Objetivo' : 'Target'}
                stroke="hsl(var(--destructive))"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
              />
            )}
          </ChartComponent>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
