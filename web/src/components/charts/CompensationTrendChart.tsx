"use client";

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Area,
  ComposedChart,
} from "recharts";

interface TrendData {
  month: string;
  actual: number;
  budget: number;
}

interface CompensationTrendChartProps {
  data: TrendData[];
}

export function CompensationTrendChart({ data }: CompensationTrendChartProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-medium text-slate-900 dark:text-slate-100 mb-2">
            {label}
          </p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-500">{entry.name}:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          className="text-xs"
          tick={{ fill: '#64748b' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCurrency}
          className="text-xs"
          tick={{ fill: '#64748b' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: 20 }}
          formatter={(value: string) => (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {value}
            </span>
          )}
        />
        <Area
          type="monotone"
          dataKey="actual"
          stroke="#6366f1"
          fill="url(#actualGradient)"
          strokeWidth={0}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="Actual"
          stroke="#6366f1"
          strokeWidth={3}
          dot={{ fill: "#6366f1", strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="budget"
          name="Budget"
          stroke="#94a3b8"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
