'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/financial-service';

interface RegionData {
  region: string;
  revenue: number;
  target: number;
  attainment: number;
  repCount: number;
  deals: number;
}

interface RevenueByRegionProps {
  data: RegionData[];
}

export function RevenueByRegion({ data }: RevenueByRegionProps) {
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) => {
    if (active && payload && payload.length) {
      const region = data.find((d) => d.region === label);
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-medium text-sm mb-2">{label} Region</p>
          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <p>Revenue: {formatCurrency(region?.revenue || 0)}</p>
            <p>Target: {formatCurrency(region?.target || 0)}</p>
            <p>Attainment: {formatPercent(region?.attainment || 0)}</p>
            <p>Reps: {region?.repCount}</p>
            <p>Deals: {region?.deals}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Revenue by Region</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="region"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="target"
                name="Target"
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Region cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          {data.map((region) => (
            <div
              key={region.region}
              className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-center"
            >
              <p className="text-sm font-medium">{region.region}</p>
              <p
                className={`text-lg font-bold ${
                  region.attainment >= 100 ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {formatPercent(region.attainment)}
              </p>
              <p className="text-xs text-slate-500">Attainment</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
