'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/financial-service';
import { useCurrency } from '@/contexts/tenant-context';

interface PeriodData {
  period: string;
  revenue: number;
  deals: number;
  avgDealSize: number;
  target?: number;
  attainment?: number;
}

interface RevenueByPeriodProps {
  monthlyData: PeriodData[];
  quarterlyData: PeriodData[];
}

export function RevenueByPeriod({ monthlyData, quarterlyData }: RevenueByPeriodProps) {
  const { symbol } = useCurrency();
  const [view, setView] = useState<'monthly' | 'quarterly'>('monthly');
  const data = view === 'monthly' ? monthlyData : quarterlyData;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm text-slate-600 dark:text-slate-300">
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Revenue by Period</CardTitle>
        <Tabs value={view} onValueChange={(v) => setView(v as 'monthly' | 'quarterly')}>
          <TabsList className="h-8">
            <TabsTrigger value="monthly" className="text-xs px-3">Monthly</TabsTrigger>
            <TabsTrigger value="quarterly" className="text-xs px-3">Quarterly</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                tickFormatter={(value) => `${symbol}${(value / 1000).toFixed(0)}K`}
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
              {view === 'quarterly' && (
                <Bar
                  dataKey="target"
                  name="Target"
                  fill="#94a3b8"
                  radius={[4, 4, 0, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </CardContent>
    </Card>
  );
}
