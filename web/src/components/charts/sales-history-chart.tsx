'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrency, useTenant } from '@/contexts/tenant-context';

interface SalesHistoryData {
  period: string;
  label: string;
  alimentos: number;
  bebidas: number;
  total: number;
}

interface SalesHistoryChartProps {
  data: SalesHistoryData[];
  title?: string;
}

export function SalesHistoryChart({ data, title }: SalesHistoryChartProps) {
  const { format, symbol } = useCurrency();
  const { currentTenant } = useTenant();
  const isSpanish = currentTenant?.locale === 'es-MX';

  const defaultTitle = isSpanish ? 'Histórico de Ventas' : 'Sales History';
  const foodLabel = isSpanish ? 'Alimentos' : 'Food';
  const beverageLabel = isSpanish ? 'Bebidas' : 'Beverages';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || defaultTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(value) => `${symbol}${(value / 1000).toFixed(0)}k`}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number) => format(value)}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar
              dataKey="alimentos"
              name={foodLabel}
              fill="#3B82F6"
              stackId="a"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="bebidas"
              name={beverageLabel}
              fill="#10B981"
              stackId="a"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
