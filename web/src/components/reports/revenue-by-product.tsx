'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/financial-service';

interface ProductData {
  productId: string;
  name: string;
  revenue: number;
  deals: number;
  percentage: number;
}

interface RevenueByProductProps {
  data: ProductData[];
}

const COLORS = [
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

export function RevenueByProduct({ data }: RevenueByProductProps) {
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: ProductData }[] }) => {
    if (active && payload && payload.length) {
      const product = payload[0].payload;
      return (
        <div className="bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-700">
          <p className="font-medium text-sm mb-2">{product.name}</p>
          <div className="space-y-1 text-sm text-slate-300">
            <p>Revenue: {formatCurrency(product.revenue)}</p>
            <p>Share: {formatPercent(product.percentage)}</p>
            <p>Deals: {product.deals}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }: {
    cx: number;
    cy: number;
    midAngle: number;
    innerRadius: number;
    outerRadius: number;
    percent: number;
  }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Revenue by Product</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={110}
                innerRadius={60}
                dataKey="revenue"
                nameKey="name"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Product list */}
        <div className="mt-4 space-y-2">
          {data.slice(0, 5).map((product, index) => (
            <div
              key={product.productId}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-slate-300 truncate max-w-[150px]">
                  {product.name}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium">{formatCurrency(product.revenue)}</span>
                <span className="text-slate-400 w-12 text-right">
                  {formatPercent(product.percentage)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
