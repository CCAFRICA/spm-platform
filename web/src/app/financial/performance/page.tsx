'use client';

/**
 * Location Benchmarks Page
 *
 * Full-width sortable table with 10 columns.
 * Shows all locations with ranking, trend sparklines, and color-coded performance.
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowUp,
  ArrowDown,
  Minus,
  TrendingUp,
  ArrowUpDown,
  MapPin,
  Activity,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import { loadPerformanceData, type LocationBenchmarkData } from '@/lib/financial/financial-data-service';

type SortField = 'rank' | 'name' | 'brand' | 'revenue' | 'avgCheck' | 'wowChange' | 'tipRate' | 'leakage';
type SortOrder = 'asc' | 'desc';

export default function LocationBenchmarksPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const router = useRouter();

  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationBenchmarkData[]>([]);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    loadPerformanceData(tenantId)
      .then(result => { if (!cancelled) setLocations(result || []); })
      .catch(err => console.error('Failed to load performance data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const filteredLocations = useMemo(() => {
    let result = [...locations];

    // Filter by brand
    if (brandFilter !== 'all') {
      result = result.filter(loc => loc.brandId === brandFilter);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'rank':
          comparison = a.rank - b.rank;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'brand':
          comparison = a.brandName.localeCompare(b.brandName);
          break;
        case 'revenue':
          comparison = a.revenue - b.revenue;
          break;
        case 'avgCheck':
          comparison = a.avgCheck - b.avgCheck;
          break;
        case 'wowChange':
          comparison = a.wowChange - b.wowChange;
          break;
        case 'tipRate':
          comparison = a.tipRate - b.tipRate;
          break;
        case 'leakage':
          comparison = a.leakage - b.leakage;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [locations, brandFilter, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-zinc-800/50 transition-colors"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-zinc-500" />
        )}
      </div>
    </TableHead>
  );

  const getRankIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="h-3 w-3 text-green-600" />;
    if (change < 0) return <ArrowDown className="h-3 w-3 text-red-600" />;
    return <Minus className="h-3 w-3 text-zinc-500" />;
  };

  const getLeakageColor = (leakage: number) => {
    if (leakage < 3) return 'text-green-600';
    if (leakage <= 5) return 'text-amber-600';
    return 'text-red-600';
  };

  const brands = useMemo(() => {
    const uniqueBrands = new Map<string, { id: string; name: string }>();
    locations.forEach(loc => {
      uniqueBrands.set(loc.brandId, { id: loc.brandId, name: loc.brandName });
    });
    return Array.from(uniqueBrands.values());
  }, [locations]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{isSpanish ? 'Sin Datos' : 'No Data'}</h2>
            <p className="text-muted-foreground">{isSpanish ? 'Importe datos POS para ver benchmarks.' : 'Import POS data to see location benchmarks.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            {isSpanish ? 'Benchmarks de Ubicacion' : 'Location Benchmarks'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Comparacion de rendimiento de todas las ubicaciones' : 'Performance comparison across all locations'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{isSpanish ? 'Marca:' : 'Brand:'}</span>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isSpanish ? 'Todas' : 'All Brands'}</SelectItem>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {isSpanish ? 'Ranking de Ubicaciones' : 'Location Rankings'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <SortableHeader field="rank">
                    <span className="w-[60px]">{isSpanish ? 'Rank' : 'Rank'}</span>
                  </SortableHeader>
                  <SortableHeader field="name">
                    <span className="w-[200px]">{isSpanish ? 'Ubicacion' : 'Location'}</span>
                  </SortableHeader>
                  <SortableHeader field="brand">
                    <span className="w-[100px]">{isSpanish ? 'Marca' : 'Brand'}</span>
                  </SortableHeader>
                  <SortableHeader field="revenue">
                    <span className="w-[180px]">{isSpanish ? 'Ingresos' : 'Revenue'}</span>
                  </SortableHeader>
                  <SortableHeader field="avgCheck">
                    <span className="w-[120px]">{isSpanish ? 'Cheque Prom.' : 'Avg Check'}</span>
                  </SortableHeader>
                  <SortableHeader field="wowChange">
                    <span className="w-[100px]">{isSpanish ? 'WoW' : 'WoW'}</span>
                  </SortableHeader>
                  <TableHead className="w-[80px]">{isSpanish ? 'Tendencia' : 'Trend'}</TableHead>
                  <TableHead className="w-[80px]">{isSpanish ? 'F:B' : 'Food:Bev'}</TableHead>
                  <SortableHeader field="tipRate">
                    <span className="w-[80px]">{isSpanish ? 'Propina' : 'Tip Rate'}</span>
                  </SortableHeader>
                  <SortableHeader field="leakage">
                    <span className="w-[80px]">{isSpanish ? 'Fuga' : 'Leakage'}</span>
                  </SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((location) => (
                  <TableRow key={location.id} className="hover:bg-zinc-800/50">
                    {/* Rank */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">#{location.rank}</span>
                        {getRankIcon(location.rankChange)}
                      </div>
                    </TableCell>

                    {/* Location */}
                    <TableCell>
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:underline"
                        onClick={() => router.push(`/financial/location/${location.id}`)}
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: location.brandColor }}
                        />
                        <div>
                          <p className="font-medium">{location.name}</p>
                          <p className="text-xs text-muted-foreground">{location.city}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Brand */}
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{ backgroundColor: `${location.brandColor}20`, color: location.brandColor }}
                      >
                        {location.brandName}
                      </Badge>
                    </TableCell>

                    {/* Revenue with bar */}
                    <TableCell>
                      <div className="space-y-1">
                        <span className="font-medium">{format(location.revenue)}</span>
                        <div className="h-1.5 bg-zinc-800/50 rounded-full overflow-hidden w-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(location.revenue / location.maxRevenue) * 100}%`,
                              backgroundColor: location.brandColor,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    {/* Avg Check — benchmarked against brand avg */}
                    <TableCell>
                      {(() => {
                        const ratio = location.brandAvgCheck > 0 ? location.avgCheck / location.brandAvgCheck : 1;
                        const color = ratio >= 1.0 ? 'text-green-600' : ratio >= 0.9 ? 'text-zinc-200' : 'text-red-600';
                        return <span className={color}>{format(location.avgCheck)}</span>;
                      })()}
                    </TableCell>

                    {/* WoW Change */}
                    <TableCell>
                      {location.wowChange === 0 ? (
                        <span className="text-zinc-500">—</span>
                      ) : (
                        <span className={`font-medium ${Math.abs(location.wowChange) > 10 ? 'font-bold text-amber-600' : location.wowChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {location.wowChange > 0 ? '+' : ''}{location.wowChange.toFixed(1)}%
                        </span>
                      )}
                    </TableCell>

                    {/* Trend Sparkline */}
                    <TableCell>
                      <div className="h-8 w-16">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={location.weeklyTrend.map((v, i) => ({ v, i }))}>
                            <Line
                              type="monotone"
                              dataKey="v"
                              stroke={location.brandColor}
                              strokeWidth={1.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </TableCell>

                    {/* Food:Bev Ratio */}
                    <TableCell>
                      <div className="flex h-3 w-16 rounded overflow-hidden">
                        <div
                          className="bg-amber-500"
                          style={{ width: `${location.foodBevRatio.food}%` }}
                        />
                        <div
                          className="bg-blue-500"
                          style={{ width: `${location.foodBevRatio.bev}%` }}
                        />
                      </div>
                    </TableCell>

                    {/* Tip Rate */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span>{location.tipRate.toFixed(1)}%</span>
                        {location.tipRate >= location.networkAvgTipRate && (
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        )}
                      </div>
                    </TableCell>

                    {/* Leakage */}
                    <TableCell>
                      <span className={`font-medium ${getLeakageColor(location.leakage)}`}>
                        {location.leakage.toFixed(1)}%
                      </span>
                    </TableCell>
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
