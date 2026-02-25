'use client';

/**
 * Product Mix Dashboard — /financial/products
 *
 * Category-level analysis using cheque aggregates (total_alimentos, total_bebidas).
 * Shows food vs beverage breakdown by location, brand, and time period.
 * When pos_line_item data becomes available, can be extended to SKU-level.
 */

import { useEffect, useState, useMemo } from 'react';
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ShoppingBag,
  Activity,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { createClient, requireTenantId } from '@/lib/supabase/client';

interface ProductMixData {
  networkFood: number;
  networkBev: number;
  networkTotal: number;
  networkFoodPct: number;
  locations: Array<{
    id: string;
    name: string;
    brand: string;
    brandColor: string;
    food: number;
    bev: number;
    total: number;
    foodPct: number;
    avgFoodPerCheck: number;
    avgBevPerCheck: number;
    cheques: number;
  }>;
  brands: Array<{
    name: string;
    color: string;
    food: number;
    bev: number;
    total: number;
    foodPct: number;
  }>;
  weeklyTrend: Array<{
    week: string;
    food: number;
    bev: number;
  }>;
}

type SortField = 'name' | 'brand' | 'food' | 'bev' | 'total' | 'foodPct' | 'avgFoodPerCheck' | 'avgBevPerCheck';
type SortOrder = 'asc' | 'desc';

export default function ProductMixPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductMixData | null>(null);
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        requireTenantId(tenantId!);
        const supabase = createClient();

        // Fetch entities
        const { data: entities } = await supabase
          .from('entities')
          .select('id, display_name, external_id, entity_type, metadata')
          .eq('tenant_id', tenantId!);

        if (!entities || cancelled) return;

        const locations = entities.filter(e => e.entity_type === 'location');
        const brandOrgs = entities.filter(
          e => e.entity_type === 'organization' &&
            (e.metadata as Record<string, unknown>)?.role === 'brand'
        );
        const brandMap = new Map(brandOrgs.map((b, i) => [b.id, {
          name: b.display_name,
          color: ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6'][i] || '#6b7280',
        }]));

        // Fetch cheques
        const PAGE_SIZE = 1000;
        const cheques: Array<{ entity_id: string; rd: Record<string, unknown> }> = [];
        let offset = 0;
        while (true) {
          const { data: rows, error } = await supabase
            .from('committed_data')
            .select('entity_id, row_data')
            .eq('tenant_id', tenantId!)
            .eq('data_type', 'pos_cheque')
            .range(offset, offset + PAGE_SIZE - 1);
          if (error || !rows || rows.length === 0) break;
          for (const row of rows) {
            if (row.entity_id) {
              cheques.push({ entity_id: row.entity_id, rd: row.row_data as unknown as Record<string, unknown> });
            }
          }
          if (rows.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        if (cancelled || cheques.length === 0) {
          if (!cancelled) setLoading(false);
          return;
        }

        const n = (v: unknown) => Number(v) || 0;

        // Aggregate by location
        const locAgg = new Map<string, { food: number; bev: number; cheques: number }>();
        const dailyAgg = new Map<string, { food: number; bev: number }>();

        for (const { entity_id, rd } of cheques) {
          const food = n(rd.total_alimentos);
          const bev = n(rd.total_bebidas);

          const la = locAgg.get(entity_id) || { food: 0, bev: 0, cheques: 0 };
          la.food += food;
          la.bev += bev;
          la.cheques++;
          locAgg.set(entity_id, la);

          const dt = String(rd.fecha || '').substring(0, 10);
          if (dt) {
            const da = dailyAgg.get(dt) || { food: 0, bev: 0 };
            da.food += food;
            da.bev += bev;
            dailyAgg.set(dt, da);
          }
        }

        // Build location results
        let networkFood = 0, networkBev = 0;
        const locResults = locations.map(loc => {
          const agg = locAgg.get(loc.id) || { food: 0, bev: 0, cheques: 0 };
          const meta = loc.metadata as Record<string, unknown> | null;
          const brandId = String(meta?.brand_id || '');
          const brand = brandMap.get(brandId);
          const total = agg.food + agg.bev;
          networkFood += agg.food;
          networkBev += agg.bev;
          return {
            id: loc.id,
            name: loc.display_name,
            brand: brand?.name || '',
            brandColor: brand?.color || '#6b7280',
            food: Math.round(agg.food * 100) / 100,
            bev: Math.round(agg.bev * 100) / 100,
            total: Math.round(total * 100) / 100,
            foodPct: total > 0 ? Math.round((agg.food / total) * 1000) / 10 : 0,
            avgFoodPerCheck: agg.cheques > 0 ? Math.round((agg.food / agg.cheques) * 100) / 100 : 0,
            avgBevPerCheck: agg.cheques > 0 ? Math.round((agg.bev / agg.cheques) * 100) / 100 : 0,
            cheques: agg.cheques,
          };
        }).filter(l => l.cheques > 0);

        // Brand aggregation
        const brandAgg = new Map<string, { food: number; bev: number }>();
        for (const loc of locResults) {
          const ba = brandAgg.get(loc.brand) || { food: 0, bev: 0 };
          ba.food += loc.food;
          ba.bev += loc.bev;
          brandAgg.set(loc.brand, ba);
        }
        const brandResults = Array.from(brandAgg.entries()).map(([name, agg]) => {
          const total = agg.food + agg.bev;
          const brandInfo = Array.from(brandMap.values()).find(b => b.name === name);
          return {
            name,
            color: brandInfo?.color || '#6b7280',
            food: Math.round(agg.food),
            bev: Math.round(agg.bev),
            total: Math.round(total),
            foodPct: total > 0 ? Math.round((agg.food / total) * 1000) / 10 : 0,
          };
        });

        // Weekly trend
        const sortedDates = Array.from(dailyAgg.keys()).sort();
        const weeklyTrend: Array<{ week: string; food: number; bev: number }> = [];
        let weekIdx = 0, wFood = 0, wBev = 0, dayCount = 0;
        for (const dt of sortedDates) {
          const d = dailyAgg.get(dt)!;
          wFood += d.food;
          wBev += d.bev;
          dayCount++;
          if (dayCount >= 7) {
            weekIdx++;
            weeklyTrend.push({ week: `W${weekIdx}`, food: Math.round(wFood), bev: Math.round(wBev) });
            wFood = 0; wBev = 0; dayCount = 0;
          }
        }
        if (dayCount > 0) {
          weekIdx++;
          weeklyTrend.push({ week: `W${weekIdx}`, food: Math.round(wFood), bev: Math.round(wBev) });
        }

        const networkTotal = networkFood + networkBev;
        if (!cancelled) {
          setData({
            networkFood: Math.round(networkFood),
            networkBev: Math.round(networkBev),
            networkTotal: Math.round(networkTotal),
            networkFoodPct: networkTotal > 0 ? Math.round((networkFood / networkTotal) * 1000) / 10 : 0,
            locations: locResults,
            brands: brandResults,
            weeklyTrend,
          });
        }
      } catch (err) {
        console.error('Failed to load product mix data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId]);

  const sortedLocations = useMemo(() => {
    if (!data) return [];
    const locs = [...data.locations];
    locs.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'brand': cmp = a.brand.localeCompare(b.brand); break;
        case 'food': cmp = a.food - b.food; break;
        case 'bev': cmp = a.bev - b.bev; break;
        case 'total': cmp = a.total - b.total; break;
        case 'foodPct': cmp = a.foodPct - b.foodPct; break;
        case 'avgFoodPerCheck': cmp = a.avgFoodPerCheck - b.avgFoodPerCheck; break;
        case 'avgBevPerCheck': cmp = a.avgBevPerCheck - b.avgBevPerCheck; break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return locs;
  }, [data, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer hover:bg-zinc-800/50 transition-colors ${className || ''}`}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-zinc-400" />
        )}
      </div>
    </TableHead>
  );

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
            <h2 className="text-xl font-semibold mb-2">No Product Data</h2>
            <p className="text-muted-foreground">Import POS data to see product mix analytics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pieData = [
    { name: 'Food', value: data.networkFood },
    { name: 'Beverage', value: data.networkBev },
  ];
  const PIE_COLORS = ['#f59e0b', '#3b82f6'];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-primary" />
          Product Mix
        </h1>
        <p className="text-zinc-400">Food vs beverage category analysis across locations</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-zinc-400">Total Food + Bev</p>
            <p className="text-2xl font-bold">{format(data.networkTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <p className="text-sm text-zinc-400">Food Revenue</p>
            </div>
            <p className="text-2xl font-bold text-amber-400">{format(data.networkFood)}</p>
            <p className="text-xs text-zinc-400">{data.networkFoodPct}% of mix</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <p className="text-sm text-zinc-400">Beverage Revenue</p>
            </div>
            <p className="text-2xl font-bold text-blue-400">{format(data.networkBev)}</p>
            <p className="text-xs text-zinc-400">{(100 - data.networkFoodPct).toFixed(1)}% of mix</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-zinc-400">F:B Ratio</p>
            <p className="text-2xl font-bold">{data.networkFoodPct.toFixed(0)}:{(100 - data.networkFoodPct).toFixed(0)}</p>
            <div className="flex h-2 rounded overflow-hidden mt-2">
              <div className="bg-amber-500" style={{ width: `${data.networkFoodPct}%` }} />
              <div className="bg-blue-500" style={{ width: `${100 - data.networkFoodPct}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Pie + Brand Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category Split by Brand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [format(value), 'Revenue']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {data.brands.map((brand) => (
                  <div key={brand.name}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.color }} />
                      <span className="text-sm font-medium">{brand.name}</span>
                    </div>
                    <div className="flex h-2 rounded overflow-hidden">
                      <div className="bg-amber-500" style={{ width: `${brand.foodPct}%` }} />
                      <div className="bg-blue-500" style={{ width: `${100 - brand.foodPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400 mt-0.5">
                      <span>Food {brand.foodPct}%</span>
                      <span>Bev {(100 - brand.foodPct).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Food vs Beverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="week" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" tickFormatter={(v) => format(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => [format(value), name === 'food' ? 'Food' : 'Beverage']}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="food" name="food" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="bev" name="bev" fill="#3b82f6" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location Product Mix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead field="name">Location</SortableHead>
                  <SortableHead field="brand">Brand</SortableHead>
                  <SortableHead field="food" className="text-right">Food</SortableHead>
                  <SortableHead field="bev" className="text-right">Beverage</SortableHead>
                  <SortableHead field="total" className="text-right">Total</SortableHead>
                  <SortableHead field="foodPct" className="text-right">Food %</SortableHead>
                  <TableHead>Mix</TableHead>
                  <SortableHead field="avgFoodPerCheck" className="text-right">Food/Chk</SortableHead>
                  <SortableHead field="avgBevPerCheck" className="text-right">Bev/Chk</SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLocations.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium">{loc.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{ backgroundColor: `${loc.brandColor}20`, color: loc.brandColor }}
                      >
                        {loc.brand}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-amber-400">{format(loc.food)}</TableCell>
                    <TableCell className="text-right text-blue-400">{format(loc.bev)}</TableCell>
                    <TableCell className="text-right font-medium">{format(loc.total)}</TableCell>
                    <TableCell className="text-right text-zinc-400">{loc.foodPct}%</TableCell>
                    <TableCell>
                      <div className="flex h-2 w-16 rounded overflow-hidden">
                        <div className="bg-amber-500" style={{ width: `${loc.foodPct}%` }} />
                        <div className="bg-blue-500" style={{ width: `${100 - loc.foodPct}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-zinc-400">{format(loc.avgFoodPerCheck)}</TableCell>
                    <TableCell className="text-right text-zinc-400">{format(loc.avgBevPerCheck)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
