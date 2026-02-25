'use client';

/**
 * Location Detail Page — /financial/location/[id]
 *
 * Drill-down from Location Benchmarks table showing:
 * - Location header with brand badge
 * - KPI summary cards (revenue, checks, avg check, tip rate, leakage)
 * - Weekly revenue trend chart
 * - Staff breakdown table for this location
 * - Food vs Beverage split
 *
 * OB-99: Migrated from direct Supabase queries to service layer (1 request).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  MapPin,
  DollarSign,
  Receipt,
  TrendingUp,
  Users,
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
import { loadLocationDetailData, type LocationDetailData } from '@/lib/financial/financial-data-service';

export default function LocationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = params.id as string;
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LocationDetailData | null>(null);

  useEffect(() => {
    if (!tenantId || !locationId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const result = await loadLocationDetailData(tenantId!, locationId);
        if (!cancelled) setDetail(result);
      } catch (err) {
        console.error('Failed to load location detail:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, locationId]);

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
            <h2 className="text-xl font-semibold mb-2">Location Not Found</h2>
            <p className="text-muted-foreground">This location has no data or does not exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const foodPct = (detail.food + detail.bev) > 0 ? (detail.food / (detail.food + detail.bev)) * 100 : 50;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/financial/performance')}
          className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <MapPin className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-zinc-100">{detail.name}</h1>
            {detail.brandName && (
              <Badge
                variant="secondary"
                style={{ backgroundColor: `${detail.brandColor}20`, color: detail.brandColor }}
              >
                {detail.brandName}
              </Badge>
            )}
          </div>
          <p className="text-zinc-400 ml-9">{detail.city}</p>
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
              <span className="text-xs text-zinc-400">Leakage</span>
            </div>
            <p className={`text-xl font-bold ${detail.leakageRate > 5 ? 'text-red-500' : detail.leakageRate > 3 ? 'text-amber-500' : 'text-green-500'}`}>
              {detail.leakageRate.toFixed(1)}%
            </p>
            <p className="text-xs text-zinc-400">{format(detail.discounts + detail.comps)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Revenue */}
        <Card className="lg:col-span-2">
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
                  <Bar dataKey="revenue" fill={detail.brandColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Food vs Bev */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Food vs Beverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex h-4 rounded overflow-hidden">
                <div className="bg-amber-500" style={{ width: `${foodPct}%` }} />
                <div className="bg-blue-500" style={{ width: `${100 - foodPct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-amber-500" />
                    <span className="text-sm text-zinc-400">Food</span>
                  </div>
                  <p className="font-bold">{format(detail.food)}</p>
                  <p className="text-xs text-zinc-400">{foodPct.toFixed(0)}%</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span className="text-sm text-zinc-400">Beverage</span>
                  </div>
                  <p className="font-bold">{format(detail.bev)}</p>
                  <p className="text-xs text-zinc-400">{(100 - foodPct).toFixed(0)}%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff at {detail.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Checks</TableHead>
                <TableHead className="text-right">Avg Check</TableHead>
                <TableHead className="text-right">Tips</TableHead>
                <TableHead className="text-right">Tip %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-zinc-400">{s.role}</TableCell>
                  <TableCell className="text-right">{format(s.revenue)}</TableCell>
                  <TableCell className="text-right text-zinc-400">{s.cheques}</TableCell>
                  <TableCell className="text-right text-zinc-400">{format(s.avgCheck)}</TableCell>
                  <TableCell className="text-right text-zinc-400">{format(s.tips)}</TableCell>
                  <TableCell className="text-right">
                    <span className={s.tipRate >= 12 ? 'text-green-500' : 'text-zinc-400'}>
                      {s.tipRate.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
