'use client';

/**
 * Product Mix Dashboard — /financial/products
 *
 * Category-level analysis using cheque aggregates (total_alimentos, total_bebidas).
 * Shows food vs beverage breakdown by location, brand, and time period.
 *
 * OB-99: Migrated from direct Supabase queries (1,409 requests) to service layer (1 request).
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
import { usePersona } from '@/contexts/persona-context';
import { loadProductMixData, type ProductMixData, type FinancialScope } from '@/lib/financial/financial-data-service';

type SortField = 'name' | 'brand' | 'food' | 'bev' | 'total' | 'foodPct' | 'avgFoodPerCheck' | 'avgBevPerCheck';
type SortOrder = 'asc' | 'desc';

export default function ProductMixPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const { scope } = usePersona();

  const financialScope: FinancialScope | undefined = useMemo(() => {
    if (scope.canSeeAll) return undefined;
    if (scope.entityIds.length > 0) return { scopeEntityIds: scope.entityIds };
    return undefined;
  }, [scope]);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductMixData | null>(null);
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const result = await loadProductMixData(tenantId!, financialScope);
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('Failed to load product mix data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, financialScope]);

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

      {/* Commentary (PG-44) */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Observations</p>
          <div className="space-y-1">
            <p className="text-sm text-zinc-200">
              Food:Beverage split is {data.networkFoodPct.toFixed(0)}:{(100 - data.networkFoodPct).toFixed(0)} across {format(data.networkTotal)} total revenue.
            </p>
            {data.networkFoodPct > 70 && (
              <p className="text-sm text-zinc-400">{'\u00B7'} Food-heavy mix — beverage upsell opportunity across the network.</p>
            )}
            {data.networkFoodPct < 45 && (
              <p className="text-sm text-zinc-400">{'\u00B7'} Strong beverage performance relative to food.</p>
            )}
            {data.brands.length > 1 && (
              <p className="text-sm text-zinc-400">
                {'\u00B7'} {data.brands.sort((a, b) => b.foodPct - a.foodPct)[0].name} has highest food concentration at {data.brands.sort((a, b) => b.foodPct - a.foodPct)[0].foodPct}%.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

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
