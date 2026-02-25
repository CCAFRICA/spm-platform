'use client';

/**
 * Location Detail Page — /financial/location/[id] (OB-101 Phase 5)
 *
 * 6-section composite with cognitive fit:
 *   1. KPI Summary — revenue, cheques, avg check, tip rate, leakage, covers + reference frames
 *   2. Revenue Trend — area chart (Monitoring)
 *   3. Staff Ranking — sortable table with tier badges (Selection/Ranking)
 *   4. Leakage Detail — stacked horizontal bar (Part-of-whole)
 *   5. Product Mix — food/bev split (Comparison)
 *   6. Deterministic Commentary
 *
 * Plus: hourly heatmap-style check distribution (Pattern identification)
 */

import { useEffect, useState, useMemo } from 'react';
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
  TrendingDown,
  Users,
  Activity,
  AlertTriangle,
  Layers,
  ShoppingBag,
  Award,
  ArrowUpDown,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { loadLocationDetailData, type LocationDetailData } from '@/lib/financial/financial-data-service';

// Tier badge config (matching server detail)
function getTierBadge(tipRate: number, avgCheck: number, locationAvgCheck: number): { emoji: string; label: string; labelEs: string; color: string } {
  // Simple tier derivation from tip rate + check performance
  const checkRatio = locationAvgCheck > 0 ? avgCheck / locationAvgCheck : 1;
  const score = (tipRate >= 12 ? 30 : tipRate >= 8 ? 20 : 10) + (checkRatio >= 1.05 ? 30 : checkRatio >= 0.95 ? 20 : 10);
  if (score >= 55) return { emoji: '\u2B50', label: 'Star', labelEs: 'Estrella', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' };
  if (score >= 40) return { emoji: '\u2705', label: 'Outstanding', labelEs: 'Destacado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' };
  if (score >= 25) return { emoji: '\u27A1\uFE0F', label: 'Standard', labelEs: 'Estandar', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' };
  return { emoji: '\u26A0\uFE0F', label: 'Developing', labelEs: 'En Desarrollo', color: 'bg-red-500/20 text-red-400 border-red-500/40' };
}

type SortKey = 'revenue' | 'cheques' | 'avgCheck' | 'tipRate' | 'tips';

export default function LocationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = params.id as string;
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LocationDetailData | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);

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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedStaff = useMemo(() => {
    if (!detail?.staff) return [];
    return [...detail.staff].sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      return (a[sortKey] - b[sortKey]) * mul;
    });
  }, [detail?.staff, sortKey, sortAsc]);

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
            <h2 className="text-xl font-semibold mb-2">
              {isSpanish ? 'Ubicacion No Encontrada' : 'Location Not Found'}
            </h2>
            <p className="text-muted-foreground">
              {isSpanish ? 'Esta ubicacion no tiene datos o no existe.' : 'This location has no data or does not exist.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Computed values ---
  const totalFoodBev = detail.food + detail.bev;
  const foodPct = totalFoodBev > 0 ? Math.round((detail.food / totalFoodBev) * 100) : 50;
  const bevPct = 100 - foodPct;
  const leakageTotal = detail.discounts + detail.comps;
  const discountPct = leakageTotal > 0 ? Math.round((detail.discounts / leakageTotal) * 100) : 50;

  // Weekly average for threshold band
  const weeklyAvg = detail.weeklyRevenue.length > 0
    ? detail.weeklyRevenue.reduce((s, w) => s + w.revenue, 0) / detail.weeklyRevenue.length
    : 0;

  // Revenue trend
  const wd = detail.weeklyRevenue;
  const revTrend = wd.length >= 2
    ? ((wd[wd.length - 1].revenue - wd[wd.length - 2].revenue) / (wd[wd.length - 2].revenue || 1)) * 100
    : 0;

  // Staff averages for tier calculation
  const staffAvgCheck = detail.staff.length > 0
    ? detail.staff.reduce((s, st) => s + st.avgCheck, 0) / detail.staff.length
    : detail.avgCheck;

  // Star count
  const starCount = detail.staff.filter(s => {
    const tier = getTierBadge(s.tipRate, s.avgCheck, staffAvgCheck);
    return tier.emoji === '\u2B50';
  }).length;

  // --- Deterministic Commentary (PG-37) ---
  const commentary: string[] = [];
  {
    commentary.push(`${detail.name} \u00B7 ${detail.city} \u00B7 ${detail.brandName}`);

    commentary.push(
      isSpanish
        ? `Ingresos ${format(detail.revenue)}${revTrend !== 0 ? `, ${revTrend > 0 ? 'subieron' : 'bajaron'} ${Math.abs(revTrend).toFixed(0)}% vs semana anterior` : ''}.`
        : `Revenue ${format(detail.revenue)}${revTrend !== 0 ? `, ${revTrend > 0 ? 'up' : 'down'} ${Math.abs(revTrend).toFixed(0)}% vs prior week` : ''}.`
    );

    commentary.push(
      isSpanish
        ? `Propina ${detail.tipRate.toFixed(1)}%. ${detail.staff.length} meseros, ${starCount} Estrella.`
        : `Tip rate ${detail.tipRate.toFixed(1)}%. ${detail.staff.length} servers, ${starCount} Star rated.`
    );

    if (detail.leakageRate > 3) {
      commentary.push(
        isSpanish
          ? `Fuga ${detail.leakageRate.toFixed(1)}% — revise descuentos y comps.`
          : `Leakage ${detail.leakageRate.toFixed(1)}% — review discounts and comps.`
      );
    } else {
      commentary.push(
        isSpanish
          ? `Fuga ${detail.leakageRate.toFixed(1)}% dentro del umbral.`
          : `Leakage ${detail.leakageRate.toFixed(1)}% within threshold.`
      );
    }
  }

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead
      className="text-right cursor-pointer hover:text-zinc-200 select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </TableHead>
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/financial/pulse')}
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

      {/* Commentary (PG-37) */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2 mb-2">
            <Layers className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {isSpanish ? 'Resumen' : 'Summary'}
            </span>
          </div>
          <div className="space-y-1.5 ml-6">
            {commentary.map((line, i) => (
              <p key={i} className={`text-sm ${i === 0 ? 'font-medium text-zinc-200' : 'text-zinc-400'}`}>
                {i > 0 && <span className="text-zinc-600 mr-1">{'\u00B7'}</span>}
                {line}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 1: KPI Summary — all with reference frames (PG-36) */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-1 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-zinc-400">{isSpanish ? 'Ingresos' : 'Revenue'}</span>
              </div>
              <p className="text-lg font-bold">{format(detail.revenue)}</p>
              <div className={`flex items-center gap-1 text-[10px] ${revTrend > 0 ? 'text-green-500' : revTrend < 0 ? 'text-red-500' : 'text-zinc-500'}`}>
                {revTrend > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : revTrend < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : null}
                <span>{revTrend !== 0 ? `${revTrend > 0 ? '+' : ''}${revTrend.toFixed(0)}%` : '\u2014'}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-1 mb-1">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-zinc-400">{isSpanish ? 'Cheques' : 'Checks'}</span>
              </div>
              <p className="text-lg font-bold">{detail.cheques.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-500">{isSpanish ? 'este periodo' : 'this period'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-zinc-400">{isSpanish ? 'Cheque Prom.' : 'Avg Check'}</span>
              </div>
              <p className="text-lg font-bold">{format(detail.avgCheck)}</p>
              <p className="text-[10px] text-zinc-500">{isSpanish ? 'por cheque' : 'per check'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <span className="text-[10px] text-zinc-400">{isSpanish ? 'Propina' : 'Tip Rate'}</span>
              <p className={`text-lg font-bold ${detail.tipRate >= 12 ? 'text-green-500' : detail.tipRate >= 8 ? 'text-zinc-200' : 'text-amber-500'}`}>
                {detail.tipRate.toFixed(1)}%
              </p>
              <p className="text-[10px] text-zinc-500">{format(detail.tips)} total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-1 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-zinc-400">{isSpanish ? 'Fuga' : 'Leakage'}</span>
              </div>
              <p className={`text-lg font-bold ${detail.leakageRate > 5 ? 'text-red-500' : detail.leakageRate > 3 ? 'text-amber-500' : 'text-green-500'}`}>
                {detail.leakageRate.toFixed(1)}%
              </p>
              <p className="text-[10px] text-zinc-500">{isSpanish ? 'umbral 2%' : 'threshold 2%'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-1 mb-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-zinc-400">{isSpanish ? 'Comensales' : 'Covers'}</span>
              </div>
              <p className="text-lg font-bold">{detail.guests.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-500">{detail.avgGuests} {isSpanish ? 'prom/cheque' : 'avg/check'}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECTION 2: Revenue Trend — area chart (PG-35) */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Tendencia de Ingresos' : 'Revenue Trend'}
        </h2>
        <Card>
          <CardContent className="pt-4">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={detail.weeklyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="week" stroke="#6b7280" fontSize={10} />
                  <YAxis stroke="#6b7280" tickFormatter={(v) => format(v)} fontSize={10} />
                  <Tooltip
                    formatter={(value: number) => [format(value), isSpanish ? 'Ingresos' : 'Revenue']}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  />
                  <ReferenceLine
                    y={weeklyAvg}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: isSpanish ? 'Promedio' : 'Average', position: 'right', fill: '#f59e0b', fontSize: 10 }}
                  />
                  <defs>
                    <linearGradient id="locRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={detail.brandColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={detail.brandColor} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={detail.brandColor}
                    strokeWidth={2}
                    fill="url(#locRevenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 rounded" style={{ backgroundColor: detail.brandColor }} />
                <span>{isSpanish ? 'Ingresos semanales' : 'Weekly revenue'}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-amber-500 rounded" />
                <span>{isSpanish ? 'Promedio' : 'Average'} ({format(weeklyAvg)})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 4: Leakage Detail — stacked bar (Part-of-whole) */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {isSpanish ? 'Detalle de Fuga' : 'Leakage Detail'}
            </div>
          </h2>
          <Card className="h-full">
            <CardContent className="pt-4">
              {leakageTotal > 0 ? (
                <>
                  <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                    <div
                      className="bg-red-500 flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${discountPct}%`, minWidth: discountPct > 10 ? undefined : '30px' }}
                    >
                      {discountPct > 10 && `${discountPct}%`}
                    </div>
                    <div
                      className="bg-orange-500 flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${100 - discountPct}%`, minWidth: (100 - discountPct) > 10 ? undefined : '30px' }}
                    >
                      {(100 - discountPct) > 10 && `${100 - discountPct}%`}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500" />
                        <span className="text-xs text-zinc-400">{isSpanish ? 'Descuentos' : 'Discounts'}</span>
                      </div>
                      <p className="text-lg font-bold mt-1">{format(detail.discounts)}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-orange-500" />
                        <span className="text-xs text-zinc-400">Comps</span>
                      </div>
                      <p className="text-lg font-bold mt-1">{format(detail.comps)}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{isSpanish ? 'Tasa de fuga' : 'Leakage rate'}</span>
                      <span className={detail.leakageRate > 3 ? 'text-red-400 font-medium' : 'text-green-400 font-medium'}>
                        {detail.leakageRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-green-400">{isSpanish ? 'Sin fugas reportadas' : 'No leakage reported'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* SECTION 5: Product Mix — food/bev (Comparison) */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              {isSpanish ? 'Mezcla de Productos' : 'Product Mix'}
            </div>
          </h2>
          <Card className="h-full">
            <CardContent className="pt-4">
              {totalFoodBev > 0 ? (
                <>
                  <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                    <div
                      className="bg-orange-500 flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${foodPct}%` }}
                    >
                      {foodPct}%
                    </div>
                    <div
                      className="bg-blue-500 flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${bevPct}%` }}
                    >
                      {bevPct}%
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-orange-500" />
                        <span className="text-xs text-zinc-400">{isSpanish ? 'Alimentos' : 'Food'}</span>
                      </div>
                      <p className="text-lg font-bold mt-1">{format(detail.food)}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-500" />
                        <span className="text-xs text-zinc-400">{isSpanish ? 'Bebidas' : 'Beverage'}</span>
                      </div>
                      <p className="text-lg font-bold mt-1">{format(detail.bev)}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <ShoppingBag className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">
                    {isSpanish ? 'Sin datos de productos' : 'No product data available'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* SECTION 3: Staff Ranking — sortable table with tier badges */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {isSpanish ? `Personal en ${detail.name}` : `Staff at ${detail.name}`}
            <Badge variant="outline" className="text-[10px]">{detail.staff.length}</Badge>
          </div>
        </h2>
        <Card>
          <CardContent className="pt-4">
            {detail.staff.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isSpanish ? 'Nombre' : 'Name'}</TableHead>
                    <TableHead>{isSpanish ? 'Tier' : 'Tier'}</TableHead>
                    <SortHeader label={isSpanish ? 'Ingresos' : 'Revenue'} field="revenue" />
                    <SortHeader label={isSpanish ? 'Cheques' : 'Checks'} field="cheques" />
                    <SortHeader label={isSpanish ? 'Prom.' : 'Avg Check'} field="avgCheck" />
                    <SortHeader label={isSpanish ? 'Propinas' : 'Tips'} field="tips" />
                    <SortHeader label="Tip %" field="tipRate" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStaff.map((s) => {
                    const tier = getTierBadge(s.tipRate, s.avgCheck, staffAvgCheck);
                    return (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-zinc-800/50"
                        onClick={() => router.push(`/financial/server/${s.id}`)}
                      >
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          <Badge className={`border text-[10px] ${tier.color}`}>
                            {tier.emoji} {isSpanish ? tier.labelEs : tier.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{format(s.revenue)}</TableCell>
                        <TableCell className="text-right text-zinc-400">{s.cheques}</TableCell>
                        <TableCell className="text-right text-zinc-400">{format(s.avgCheck)}</TableCell>
                        <TableCell className="text-right text-zinc-400">{format(s.tips)}</TableCell>
                        <TableCell className="text-right">
                          <span className={s.tipRate >= 12 ? 'text-green-500' : s.tipRate >= 8 ? 'text-zinc-300' : 'text-amber-500'}>
                            {s.tipRate.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-6">
                <Users className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">
                  {isSpanish ? 'Sin datos de personal' : 'No staff data available'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
