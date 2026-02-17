'use client';

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/financial-service';
import { useCurrency } from '@/contexts/tenant-context';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface ExpenseData {
  period: string;
  revenue: number;
  commission: number;
  rate: number;
  budget: number;
}

interface CommissionExpenseProps {
  data: ExpenseData[];
  summary: {
    totalRevenue: number;
    totalCommission: number;
    averageRate: number;
    totalBudget: number;
    budgetVariance: number;
  };
}

export function CommissionExpense({ data, summary }: CommissionExpenseProps) {
  const { symbol } = useCurrency();
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string; color: string }[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-700">
          <p className="font-medium text-sm mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            {payload.map((entry, index) => (
              <p key={index} style={{ color: entry.color }}>
                {entry.dataKey === 'rate'
                  ? `Commission Rate: ${entry.value.toFixed(1)}%`
                  : `${entry.dataKey.charAt(0).toUpperCase() + entry.dataKey.slice(1)}: ${formatCurrency(entry.value)}`}
              </p>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Commission Expense</CardTitle>
          <Badge
            variant="outline"
            className={
              summary.budgetVariance <= 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }
          >
            {summary.budgetVariance <= 0 ? (
              <TrendingDown className="h-3 w-3 mr-1" />
            ) : (
              <TrendingUp className="h-3 w-3 mr-1" />
            )}
            {formatCurrency(Math.abs(summary.budgetVariance))} {summary.budgetVariance <= 0 ? 'under' : 'over'} budget
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(value) => `${symbol}${(value / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                domain={[7, 9]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar
                yAxisId="left"
                dataKey="commission"
                name="Commission"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey="budget"
                name="Budget"
                fill="#e2e8f0"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rate"
                name="Commission Rate"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800">
          <div className="text-center">
            <p className="text-xs text-slate-500">Total Revenue</p>
            <p className="text-lg font-bold text-slate-50">
              {formatCurrency(summary.totalRevenue)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">Total Commission</p>
            <p className="text-lg font-bold text-purple-600">
              {formatCurrency(summary.totalCommission)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">Avg Rate</p>
            <p className="text-lg font-bold text-amber-600">
              {formatPercent(summary.averageRate)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">Total Budget</p>
            <p className="text-lg font-bold text-slate-600">
              {formatCurrency(summary.totalBudget)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
