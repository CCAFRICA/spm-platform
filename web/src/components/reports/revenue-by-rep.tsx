'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/financial-service';
import { useCurrency } from '@/contexts/tenant-context';

interface RepData {
  repId: string;
  name: string;
  region: string;
  revenue: number;
  deals: number;
  quota: number;
  attainment: number;
}

interface RevenueByRepProps {
  data: RepData[];
}

export function RevenueByRep({ data }: RevenueByRepProps) {
  const { symbol } = useCurrency();
  const sortedData = [...data].sort((a, b) => b.revenue - a.revenue);

  const getBarColor = (attainment: number) => {
    if (attainment >= 110) return '#10b981'; // emerald
    if (attainment >= 100) return '#0ea5e9'; // sky
    if (attainment >= 90) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: RepData }[] }) => {
    if (active && payload && payload.length) {
      const rep = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-medium text-sm mb-2">{rep.name}</p>
          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <p>Revenue: {formatCurrency(rep.revenue)}</p>
            <p>Quota: {formatCurrency(rep.quota)}</p>
            <p>Attainment: {formatPercent(rep.attainment)}</p>
            <p>Deals: {rep.deals}</p>
            <p>Region: {rep.region}</p>
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
          <CardTitle className="text-lg">Revenue by Sales Rep</CardTitle>
          <Badge variant="outline">Top {data.length} Performers</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sortedData}
              layout="vertical"
              margin={{ top: 10, right: 20, left: 80, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value) => `${symbol}${(value / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                width={75}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {sortedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.attainment)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-500" />
            <span className="text-xs text-slate-500">110%+</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-sky-500" />
            <span className="text-xs text-slate-500">100-109%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-amber-500" />
            <span className="text-xs text-slate-500">90-99%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span className="text-xs text-slate-500">&lt;90%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
