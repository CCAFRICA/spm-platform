'use client';

/**
 * Location Benchmarks Page
 *
 * Full-width sortable table with 10 columns.
 * Shows all locations with ranking, trend sparklines, and color-coded performance.
 */

import { useState, useMemo } from 'react';
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
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';

// Types
interface LocationBenchmark {
  id: string;
  rank: number;
  rankChange: number; // positive = moved up, negative = moved down
  name: string;
  city: string;
  brandId: string;
  brandName: string;
  brandColor: string;
  revenue: number;
  maxRevenue: number; // for bar width calculation
  avgCheck: number;
  brandAvgCheck: number;
  wowChange: number;
  weeklyTrend: number[];
  foodBevRatio: { food: number; bev: number };
  tipRate: number;
  networkAvgTipRate: number;
  leakage: number;
}

type SortField = 'rank' | 'name' | 'brand' | 'revenue' | 'avgCheck' | 'wowChange' | 'tipRate' | 'leakage';
type SortOrder = 'asc' | 'desc';

// Seed data for demo
function generateSeedData(): LocationBenchmark[] {
  const maxRevenue = 1892340;
  return [
    {
      id: 'loc-1',
      rank: 1,
      rankChange: 1,
      name: 'Reforma',
      city: 'CDMX',
      brandId: 'brand-fast',
      brandName: 'Rapido Fresh',
      brandColor: '#16a34a',
      revenue: 1892340,
      maxRevenue,
      avgCheck: 401,
      brandAvgCheck: 389,
      wowChange: 4.2,
      weeklyTrend: [95, 98, 92, 96, 94, 97, 99],
      foodBevRatio: { food: 72, bev: 28 },
      tipRate: 11.2,
      networkAvgTipRate: 11.8,
      leakage: 1.8,
    },
    {
      id: 'loc-2',
      rank: 2,
      rankChange: 0,
      name: 'Centro Historico',
      city: 'CDMX',
      brandId: 'brand-casual',
      brandName: 'La Terraza',
      brandColor: '#2563eb',
      revenue: 1845230,
      maxRevenue,
      avgCheck: 472,
      brandAvgCheck: 458,
      wowChange: 2.1,
      weeklyTrend: [82, 91, 87, 95, 88, 92, 89],
      foodBevRatio: { food: 65, bev: 35 },
      tipRate: 12.4,
      networkAvgTipRate: 11.8,
      leakage: 2.3,
    },
    {
      id: 'loc-3',
      rank: 3,
      rankChange: -1,
      name: 'Polanco',
      city: 'CDMX',
      brandId: 'brand-casual',
      brandName: 'La Terraza',
      brandColor: '#2563eb',
      revenue: 1623450,
      maxRevenue,
      avgCheck: 512,
      brandAvgCheck: 458,
      wowChange: -1.2,
      weeklyTrend: [78, 85, 82, 88, 91, 87, 93],
      foodBevRatio: { food: 60, bev: 40 },
      tipRate: 13.1,
      networkAvgTipRate: 11.8,
      leakage: 1.9,
    },
    {
      id: 'loc-4',
      rank: 4,
      rankChange: 0,
      name: 'Condesa',
      city: 'CDMX',
      brandId: 'brand-fast',
      brandName: 'Rapido Fresh',
      brandColor: '#16a34a',
      revenue: 1520789,
      maxRevenue,
      avgCheck: 378,
      brandAvgCheck: 389,
      wowChange: -3.8,
      weeklyTrend: [62, 58, 55, 61, 57, 54, 59],
      foodBevRatio: { food: 75, bev: 25 },
      tipRate: 10.2,
      networkAvgTipRate: 11.8,
      leakage: 3.4,
    },
    {
      id: 'loc-5',
      rank: 5,
      rankChange: 0,
      name: 'Santa Fe',
      city: 'CDMX',
      brandId: 'brand-casual',
      brandName: 'La Terraza',
      brandColor: '#2563eb',
      revenue: 1352660,
      maxRevenue,
      avgCheck: 445,
      brandAvgCheck: 458,
      wowChange: 0.8,
      weeklyTrend: [71, 68, 73, 69, 72, 70, 74],
      foodBevRatio: { food: 68, bev: 32 },
      tipRate: 11.6,
      networkAvgTipRate: 11.8,
      leakage: 2.8,
    },
  ];
}

export default function LocationBenchmarksPage() {
  const { format } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [brandFilter, setBrandFilter] = useState<string>('all');

  const locations = useMemo(() => generateSeedData(), []);

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
      className="cursor-pointer hover:bg-slate-50 transition-colors"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </div>
    </TableHead>
  );

  const getRankIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="h-3 w-3 text-green-600" />;
    if (change < 0) return <ArrowDown className="h-3 w-3 text-red-600" />;
    return <Minus className="h-3 w-3 text-slate-400" />;
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

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/financial" className="hover:text-foreground">Financial</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">Performance</span>
      </nav>

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
              <TableHeader className="sticky top-0 bg-white z-10">
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
                  <TableRow key={location.id} className="hover:bg-slate-50">
                    {/* Rank */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">#{location.rank}</span>
                        {getRankIcon(location.rankChange)}
                      </div>
                    </TableCell>

                    {/* Location */}
                    <TableCell>
                      <div className="flex items-center gap-2">
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
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
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

                    {/* Avg Check */}
                    <TableCell>
                      <span className={location.avgCheck > location.brandAvgCheck ? 'text-green-600' : 'text-red-600'}>
                        {format(location.avgCheck)}
                      </span>
                    </TableCell>

                    {/* WoW Change */}
                    <TableCell>
                      <span className={`font-medium ${Math.abs(location.wowChange) > 10 ? 'font-bold text-amber-600' : location.wowChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {location.wowChange > 0 ? '+' : ''}{location.wowChange.toFixed(1)}%
                      </span>
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
