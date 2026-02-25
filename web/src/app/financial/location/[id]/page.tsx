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
import { createClient, requireTenantId } from '@/lib/supabase/client';

interface LocationDetail {
  id: string;
  name: string;
  city: string;
  brandName: string;
  brandColor: string;
  revenue: number;
  cheques: number;
  avgCheck: number;
  tips: number;
  tipRate: number;
  food: number;
  bev: number;
  discounts: number;
  comps: number;
  leakageRate: number;
  guests: number;
  avgGuests: number;
  weeklyRevenue: Array<{ week: string; revenue: number }>;
  staff: Array<{
    id: string;
    name: string;
    role: string;
    revenue: number;
    cheques: number;
    avgCheck: number;
    tips: number;
    tipRate: number;
  }>;
}

export default function LocationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = params.id as string;
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LocationDetail | null>(null);

  useEffect(() => {
    if (!tenantId || !locationId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        requireTenantId(tenantId!);
        const supabase = createClient();

        // Fetch location entity
        const { data: entity } = await supabase
          .from('entities')
          .select('id, display_name, external_id, entity_type, metadata')
          .eq('tenant_id', tenantId!)
          .eq('id', locationId)
          .single();

        if (!entity || cancelled) return;

        // Fetch all entities for brand lookup + staff
        const { data: allEntities } = await supabase
          .from('entities')
          .select('id, display_name, external_id, entity_type, metadata')
          .eq('tenant_id', tenantId!);

        // Get brand info
        const meta = entity.metadata as Record<string, unknown> | null;
        const brandId = String(meta?.brand_id || '');
        const brandEntity = (allEntities || []).find(
          e => e.entity_type === 'organization' &&
            (e.metadata as Record<string, unknown>)?.role === 'brand' &&
            e.id === brandId
        );
        const brandName = brandEntity?.display_name || '';
        const brandColor = '#ef4444'; // fallback

        // Fetch cheques for this location
        const PAGE_SIZE = 1000;
        const cheques: Array<Record<string, unknown>> = [];
        let offset = 0;
        while (true) {
          const { data, error } = await supabase
            .from('committed_data')
            .select('row_data')
            .eq('tenant_id', tenantId!)
            .eq('data_type', 'pos_cheque')
            .eq('entity_id', locationId)
            .range(offset, offset + PAGE_SIZE - 1);
          if (error || !data || data.length === 0) break;
          for (const row of data) {
            cheques.push(row.row_data as unknown as Record<string, unknown>);
          }
          if (data.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        if (cancelled) return;

        const n = (v: unknown) => Number(v) || 0;

        // Aggregate
        let revenue = 0, tips = 0, food = 0, bev = 0, discounts = 0, comps = 0, guests = 0;
        let chequeCount = 0;
        const dailyRevenue = new Map<string, number>();
        const staffAgg = new Map<string, { revenue: number; cheques: number; tips: number }>();

        for (const rd of cheques) {
          chequeCount++;
          revenue += n(rd.total);
          tips += n(rd.propina);
          food += n(rd.total_alimentos);
          bev += n(rd.total_bebidas);
          discounts += n(rd.total_descuentos);
          comps += n(rd.total_cortesias);
          guests += n(rd.numero_de_personas);

          const dt = String(rd.fecha || '').substring(0, 10);
          if (dt) dailyRevenue.set(dt, (dailyRevenue.get(dt) || 0) + n(rd.total));

          const meseroId = String(n(rd.mesero_id));
          if (meseroId && meseroId !== '0') {
            const s = staffAgg.get(meseroId) || { revenue: 0, cheques: 0, tips: 0 };
            s.revenue += n(rd.total);
            s.cheques++;
            s.tips += n(rd.propina);
            staffAgg.set(meseroId, s);
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

        // Staff with names
        const staffEntities = (allEntities || []).filter(e => e.entity_type === 'individual');
        const staffByMeseroId = new Map<string, { id: string; name: string; role: string }>();
        for (const se of staffEntities) {
          const sm = se.metadata as Record<string, unknown> | null;
          const mId = sm?.mesero_id;
          if (mId != null) {
            staffByMeseroId.set(String(mId), {
              id: se.id,
              name: se.display_name,
              role: String(sm?.role || 'Mesero'),
            });
          }
        }

        const staff = Array.from(staffAgg.entries())
          .map(([meseroId, agg]) => {
            const entity = staffByMeseroId.get(meseroId);
            return {
              id: entity?.id || meseroId,
              name: entity?.name || `Mesero ${meseroId}`,
              role: entity?.role || 'Mesero',
              revenue: Math.round(agg.revenue * 100) / 100,
              cheques: agg.cheques,
              avgCheck: agg.cheques > 0 ? Math.round((agg.revenue / agg.cheques) * 100) / 100 : 0,
              tips: Math.round(agg.tips * 100) / 100,
              tipRate: agg.revenue > 0 ? Math.round((agg.tips / agg.revenue) * 1000) / 10 : 0,
            };
          })
          .sort((a, b) => b.revenue - a.revenue);

        if (!cancelled) {
          setDetail({
            id: entity.id,
            name: entity.display_name,
            city: String(meta?.city || meta?.ciudad || ''),
            brandName,
            brandColor,
            revenue: Math.round(revenue * 100) / 100,
            cheques: chequeCount,
            avgCheck: chequeCount > 0 ? Math.round((revenue / chequeCount) * 100) / 100 : 0,
            tips: Math.round(tips * 100) / 100,
            tipRate: revenue > 0 ? Math.round((tips / revenue) * 1000) / 10 : 0,
            food: Math.round(food * 100) / 100,
            bev: Math.round(bev * 100) / 100,
            discounts: Math.round(discounts * 100) / 100,
            comps: Math.round(comps * 100) / 100,
            leakageRate: revenue > 0 ? Math.round(((discounts + comps) / revenue) * 1000) / 10 : 0,
            guests,
            avgGuests: chequeCount > 0 ? Math.round((guests / chequeCount) * 10) / 10 : 0,
            weeklyRevenue,
            staff,
          });
        }
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
            <p className="text-xs text-zinc-500">Avg {format(detail.avgCheck)}</p>
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
            <p className="text-xs text-zinc-500">{format(detail.tips)} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-zinc-400">Guests</span>
            </div>
            <p className="text-xl font-bold">{detail.guests.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">{detail.avgGuests} per check</p>
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
            <p className="text-xs text-zinc-500">{format(detail.discounts + detail.comps)}</p>
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
                  <p className="text-xs text-zinc-500">{foodPct.toFixed(0)}%</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span className="text-sm text-zinc-400">Beverage</span>
                  </div>
                  <p className="font-bold">{format(detail.bev)}</p>
                  <p className="text-xs text-zinc-500">{(100 - foodPct).toFixed(0)}%</p>
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
