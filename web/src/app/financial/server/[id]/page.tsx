'use client';

/**
 * Server Detail Page — /financial/server/[id]
 *
 * Drill-down from Staff Performance table showing:
 * - Server header with location badge and tier
 * - KPI cards (revenue, checks, avg check, tips, performance index)
 * - Weekly trend chart
 * - Check distribution (hourly pattern)
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
import { createClient, requireTenantId } from '@/lib/supabase/client';

interface ServerDetail {
  id: string;
  name: string;
  role: string;
  locationName: string;
  meseroId: string;
  revenue: number;
  cheques: number;
  avgCheck: number;
  tips: number;
  tipRate: number;
  guests: number;
  avgGuests: number;
  food: number;
  bev: number;
  discounts: number;
  performanceIndex: number;
  tier: string;
  tierColor: string;
  weeklyRevenue: Array<{ week: string; revenue: number }>;
  hourlyPattern: Array<{ hour: string; cheques: number }>;
}

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ServerDetail | null>(null);

  useEffect(() => {
    if (!tenantId || !serverId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        requireTenantId(tenantId!);
        const supabase = createClient();

        // Fetch server entity
        const { data: entity } = await supabase
          .from('entities')
          .select('id, display_name, external_id, entity_type, metadata')
          .eq('tenant_id', tenantId!)
          .eq('id', serverId)
          .single();

        if (!entity || cancelled) return;

        const meta = entity.metadata as Record<string, unknown> | null;
        const meseroId = String(meta?.mesero_id || '');
        const role = String(meta?.role || 'Mesero');

        // Find location entity
        const storeId = String(meta?.store_id || meta?.location_id || '');
        let locationName = '';
        if (storeId) {
          const { data: locEntity } = await supabase
            .from('entities')
            .select('display_name')
            .eq('id', storeId)
            .single();
          if (locEntity) locationName = locEntity.display_name;
        }

        // Fetch all cheques and filter by mesero_id
        const PAGE_SIZE = 1000;
        const cheques: Array<Record<string, unknown>> = [];
        let offset = 0;
        while (true) {
          const { data, error } = await supabase
            .from('committed_data')
            .select('row_data')
            .eq('tenant_id', tenantId!)
            .eq('data_type', 'pos_cheque')
            .range(offset, offset + PAGE_SIZE - 1);
          if (error || !data || data.length === 0) break;
          for (const row of data) {
            const rd = row.row_data as unknown as Record<string, unknown>;
            if (String(Number(rd.mesero_id) || 0) === meseroId) {
              cheques.push(rd);
            }
          }
          if (data.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        if (cancelled) return;

        const n = (v: unknown) => Number(v) || 0;

        let revenue = 0, tips = 0, food = 0, bev = 0, discounts = 0, guests = 0;
        let chequeCount = 0;
        const dailyRevenue = new Map<string, number>();
        const hourlyBuckets = new Map<number, number>();

        for (const rd of cheques) {
          chequeCount++;
          revenue += n(rd.total);
          tips += n(rd.propina);
          food += n(rd.total_alimentos);
          bev += n(rd.total_bebidas);
          discounts += n(rd.total_descuentos) + n(rd.total_cortesias);
          guests += n(rd.numero_de_personas);

          const dt = String(rd.fecha || '').substring(0, 10);
          if (dt) dailyRevenue.set(dt, (dailyRevenue.get(dt) || 0) + n(rd.total));

          // Extract hour from cierre (close time) if available
          const cierre = String(rd.cierre || '');
          const hourMatch = cierre.match(/(\d{1,2}):/);
          if (hourMatch) {
            const hr = parseInt(hourMatch[1]);
            hourlyBuckets.set(hr, (hourlyBuckets.get(hr) || 0) + 1);
          }
        }

        // Weekly buckets
        const sortedDates = Array.from(dailyRevenue.keys()).sort();
        const weeklyRevenue: Array<{ week: string; revenue: number }> = [];
        let weekIdx = 0;
        let weekTotal = 0;
        let dayCount = 0;
        for (const dt of sortedDates) {
          weekTotal += dailyRevenue.get(dt) || 0;
          dayCount++;
          if (dayCount >= 7) {
            weekIdx++;
            weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) });
            weekTotal = 0;
            dayCount = 0;
          }
        }
        if (dayCount > 0) {
          weekIdx++;
          weeklyRevenue.push({ week: `W${weekIdx}`, revenue: Math.round(weekTotal) });
        }

        // Hourly pattern
        const hourlyPattern: Array<{ hour: string; cheques: number }> = [];
        for (let h = 8; h <= 23; h++) {
          hourlyPattern.push({
            hour: `${h}:00`,
            cheques: hourlyBuckets.get(h) || 0,
          });
        }

        // Performance index (simplified: revenue rank proxy)
        const avgCheck = chequeCount > 0 ? revenue / chequeCount : 0;
        const tipRate = revenue > 0 ? (tips / revenue) * 100 : 0;
        const performanceIndex = Math.min(100, Math.round(
          (avgCheck > 0 ? Math.min(avgCheck / 500, 1) * 40 : 0) +
          (tipRate > 0 ? Math.min(tipRate / 20, 1) * 30 : 0) +
          (chequeCount > 0 ? Math.min(chequeCount / 500, 1) * 30 : 0)
        ));

        const getTier = (idx: number) => {
          if (idx >= 85) return { tier: 'Estrella', color: 'bg-yellow-100 text-yellow-700' };
          if (idx >= 70) return { tier: 'Destacado', color: 'bg-blue-100 text-blue-700' };
          if (idx >= 50) return { tier: 'Estandar', color: 'bg-zinc-700 text-zinc-300' };
          return { tier: 'En Desarrollo', color: 'bg-red-100 text-red-700' };
        };

        const tierInfo = getTier(performanceIndex);

        if (!cancelled) {
          setDetail({
            id: entity.id,
            name: entity.display_name,
            role,
            locationName,
            meseroId,
            revenue: Math.round(revenue * 100) / 100,
            cheques: chequeCount,
            avgCheck: Math.round(avgCheck * 100) / 100,
            tips: Math.round(tips * 100) / 100,
            tipRate: Math.round(tipRate * 10) / 10,
            guests,
            avgGuests: chequeCount > 0 ? Math.round((guests / chequeCount) * 10) / 10 : 0,
            food: Math.round(food * 100) / 100,
            bev: Math.round(bev * 100) / 100,
            discounts: Math.round(discounts * 100) / 100,
            performanceIndex,
            tier: tierInfo.tier,
            tierColor: tierInfo.color,
            weeklyRevenue,
            hourlyPattern,
          });
        }
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
