'use client';

/**
 * Operational Patterns Page
 *
 * Hourly heatmap + day-of-week analysis from POS cheque timestamps.
 * Shows when locations are busiest and how patterns vary across the week.
 */

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Clock,
  Activity,
  TrendingUp,
  Users,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { loadPatternsData, type PatternsPageData } from '@/lib/financial/financial-data-service';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`
);

export default function OperationalPatternsPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PatternsPageData | null>(null);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    loadPatternsData(tenantId)
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => console.error('Failed to load patterns data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  // Compute heatmap max for color scaling
  const maxRevenue = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.heatmap.map(c => c.revenue), 1);
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Data</h2>
            <p className="text-muted-foreground">Import POS data to see operational patterns.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build heatmap grid lookup
  const heatmapGrid: Record<string, { revenue: number; checks: number; avgCheck: number }> = {};
  for (const cell of data.heatmap) {
    heatmapGrid[`${cell.day}-${cell.hour}`] = cell;
  }

  function heatColor(revenue: number): string {
    if (revenue === 0) return 'bg-zinc-900';
    const intensity = Math.min(revenue / maxRevenue, 1);
    if (intensity > 0.75) return 'bg-amber-500';
    if (intensity > 0.5) return 'bg-amber-600/80';
    if (intensity > 0.25) return 'bg-amber-700/60';
    return 'bg-amber-800/40';
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/financial" className="hover:text-foreground">Financial</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">Patterns</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          Operational Patterns
        </h1>
        <p className="text-zinc-400">Hourly and day-of-week revenue patterns</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Peak Hour</p>
                <p className="text-2xl font-bold">{HOUR_LABELS[data.peakHour]}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Peak Day</p>
                <p className="text-2xl font-bold">{data.peakDay}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Activity className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Avg Daily Revenue</p>
                <p className="text-2xl font-bold">{format(data.avgDailyRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Avg Daily Checks</p>
                <p className="text-2xl font-bold">{data.avgDailyChecks.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Heatmap — Hour × Day of Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Hour headers */}
              <div className="flex gap-0.5 mb-1 ml-12">
                {HOUR_LABELS.map((label, h) => (
                  <div key={h} className="w-8 text-center text-[10px] text-zinc-500">{h % 3 === 0 ? label : ''}</div>
                ))}
              </div>
              {/* Day rows */}
              {DAY_LABELS.map((day, d) => (
                <div key={d} className="flex items-center gap-0.5 mb-0.5">
                  <span className="w-10 text-right text-xs text-zinc-400 pr-2">{day}</span>
                  {Array.from({ length: 24 }, (_, h) => {
                    const cell = heatmapGrid[`${d}-${h}`];
                    const rev = cell?.revenue || 0;
                    return (
                      <div
                        key={h}
                        className={`w-8 h-7 rounded-sm ${heatColor(rev)} transition-colors cursor-default`}
                        title={`${day} ${HOUR_LABELS[h]}: ${format(rev)} (${cell?.checks || 0} checks)`}
                      />
                    );
                  })}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 ml-12 text-xs text-zinc-500">
                <span>Low</span>
                <div className="flex gap-0.5">
                  <div className="w-6 h-3 rounded-sm bg-amber-800/40" />
                  <div className="w-6 h-3 rounded-sm bg-amber-700/60" />
                  <div className="w-6 h-3 rounded-sm bg-amber-600/80" />
                  <div className="w-6 h-3 rounded-sm bg-amber-500" />
                </div>
                <span>High</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day of Week Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Average Daily Revenue by Day of Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="day" stroke="#6b7280" />
                <YAxis stroke="#6b7280" tickFormatter={(v) => format(v)} />
                <Tooltip
                  formatter={(value: number) => [format(value), 'Revenue']}
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Day-of-Week Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 font-medium text-zinc-400">Day</th>
                <th className="text-right py-2 font-medium text-zinc-400">Avg Revenue</th>
                <th className="text-right py-2 font-medium text-zinc-400">Avg Checks</th>
                <th className="text-right py-2 font-medium text-zinc-400">Avg Check</th>
                <th className="text-right py-2 font-medium text-zinc-400">Avg Tips</th>
                <th className="text-right py-2 font-medium text-zinc-400">Avg Guests/Chk</th>
              </tr>
            </thead>
            <tbody>
              {data.dayOfWeek.map((row) => (
                <tr key={row.day} className="border-b border-zinc-800/50 last:border-0">
                  <td className="py-2 font-medium">{row.day}</td>
                  <td className="py-2 text-right">{format(row.revenue)}</td>
                  <td className="py-2 text-right">{row.checks}</td>
                  <td className="py-2 text-right">{format(row.avgCheck)}</td>
                  <td className="py-2 text-right">{format(row.tips)}</td>
                  <td className="py-2 text-right">{row.avgGuests.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
