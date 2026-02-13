'use client';

/**
 * Breakdown Chart Component
 *
 * Displays dimension breakdowns with drill-down capability.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import type { DimensionBreakdown } from '@/types/analytics';
import { useLocale } from '@/contexts/locale-context';
import { useCurrency } from '@/contexts/tenant-context';

interface BreakdownChartProps {
  breakdown: DimensionBreakdown;
  chartType?: 'bar' | 'pie';
  onDrillDown?: (segmentId: string, segmentName: string) => void;
  height?: number;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function BreakdownChart({
  breakdown,
  chartType = 'bar',
  onDrillDown,
  height = 300,
}: BreakdownChartProps) {
  const { locale } = useLocale();
  const { symbol } = useCurrency();
  const isSpanish = locale === 'es-MX';

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${symbol}${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${symbol}${(value / 1000).toFixed(0)}K`;
    }
    return `${symbol}${value}`;
  };

  const data = breakdown.segments.map((segment, index) => ({
    id: segment.id,
    name: isSpanish ? segment.nameEs : segment.name,
    value: segment.value,
    percent: segment.percent,
    change: segment.change,
    fill: COLORS[index % COLORS.length],
  }));

  const handleBarClick = (entry: { id: string; name: string }) => {
    if (onDrillDown) {
      onDrillDown(entry.id, entry.name);
    }
  };

  if (chartType === 'pie') {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isSpanish ? breakdown.dimensionEs : breakdown.dimension}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                onClick={(_, index) => handleBarClick(data[index])}
                cursor={onDrillDown ? 'pointer' : 'default'}
              >
                {data.map((entry, index) => (
                  <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), '']}
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {isSpanish ? breakdown.dimensionEs : breakdown.dimension}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={formatCurrency}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), '']}
              contentStyle={{
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              onClick={(entry) => handleBarClick(entry)}
              cursor={onDrillDown ? 'pointer' : 'default'}
            >
              {data.map((entry, index) => (
                <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Segment details */}
        <div className="mt-4 space-y-2">
          {breakdown.segments.map((segment, index) => (
            <div
              key={segment.id}
              className={`flex items-center justify-between p-2 rounded-lg bg-muted/50 ${onDrillDown ? 'cursor-pointer hover:bg-muted' : ''}`}
              onClick={() => onDrillDown?.(segment.id, isSpanish ? segment.nameEs : segment.name)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="font-medium">
                  {isSpanish ? segment.nameEs : segment.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({segment.percent.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 text-sm ${segment.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {segment.change >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{segment.change >= 0 ? '+' : ''}{segment.change.toFixed(1)}%</span>
                </div>
                <span className="font-medium">{formatCurrency(segment.value)}</span>
                {onDrillDown && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
