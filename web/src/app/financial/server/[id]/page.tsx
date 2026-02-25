'use client';

/**
 * Server Detail Page — /financial/server/[id]
 *
 * Drill-down from Staff Performance table showing:
 * - Server header with location badge and tier
 * - KPI cards (revenue, checks, avg check, tips, performance index)
 * - Weekly trend chart
 * - Check distribution (hourly pattern)
 *
 * OB-99: Migrated from direct Supabase queries to service layer (1 request).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Users,
  DollarSign,
  Receipt,
  TrendingUp,
  Award,
  Activity,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { loadServerDetailData, type ServerDetailData } from '@/lib/financial/financial-data-service';

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ServerDetailData | null>(null);

  useEffect(() => {
    if (!tenantId || !serverId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const result = await loadServerDetailData(tenantId!, serverId);
        if (!cancelled) setDetail(result);
      } catch (err) {
        console.error('Failed to load server detail:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, serverId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Server Not Found</h2>
            <p className="text-muted-foreground">This server has no data or does not exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/financial/staff')}
          className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-zinc-100">{detail.name}</h1>
            <Badge className={detail.tierColor}>{detail.tier}</Badge>
          </div>
          <div className="flex items-center gap-2 ml-9">
            <span className="text-zinc-400">{detail.role}</span>
            {detail.locationName && (
              <>
                <span className="text-zinc-600">·</span>
                <Badge variant="outline">{detail.locationName}</Badge>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-zinc-400">Revenue</span>
            </div>
            <p className="text-xl font-bold">{format(detail.revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-zinc-400">Checks</span>
            </div>
            <p className="text-xl font-bold">{detail.cheques.toLocaleString()}</p>
            <p className="text-xs text-zinc-400">Avg {format(detail.avgCheck)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-zinc-400">Tip Rate</span>
            </div>
            <p className={`text-xl font-bold ${detail.tipRate >= 12 ? 'text-green-500' : 'text-zinc-200'}`}>
              {detail.tipRate.toFixed(1)}%
            </p>
            <p className="text-xs text-zinc-400">{format(detail.tips)} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-zinc-400">Guests</span>
            </div>
            <p className="text-xl font-bold">{detail.guests.toLocaleString()}</p>
            <p className="text-xs text-zinc-400">{detail.avgGuests} per check</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-zinc-400">Performance</span>
            </div>
            <p className="text-xl font-bold">{detail.performanceIndex}</p>
            <div className="w-full bg-zinc-700 rounded-full h-2 mt-1">
              <div
                className={`h-2 rounded-full ${
                  detail.performanceIndex >= 85 ? 'bg-yellow-500' :
                  detail.performanceIndex >= 70 ? 'bg-blue-500' :
                  detail.performanceIndex >= 50 ? 'bg-zinc-400' :
                  'bg-red-500'
                }`}
                style={{ width: `${detail.performanceIndex}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.weeklyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="week" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" tickFormatter={(v) => format(v)} />
                  <Tooltip
                    formatter={(value: number) => [format(value), 'Revenue']}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Hourly Pattern */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Check Distribution by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.hourlyPattern}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="hour" stroke="#6b7280" fontSize={10} />
                  <YAxis stroke="#6b7280" />
                  <Tooltip
                    formatter={(value: number) => [value, 'Checks']}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="cheques" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-zinc-400">Food</p>
              <p className="text-lg font-bold">{format(detail.food)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Beverage</p>
              <p className="text-lg font-bold">{format(detail.bev)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Discounts + Comps</p>
              <p className="text-lg font-bold text-red-400">{format(detail.discounts)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">Net Revenue</p>
              <p className="text-lg font-bold text-amber-400">{format(detail.revenue - detail.discounts)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
