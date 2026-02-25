'use client';

/**
 * Server Detail Page — /financial/server/[id] (OB-101 Phase 4)
 *
 * Complete 5-section specification with IAP compliance:
 *   1. My Performance — KPIs with tier badge + reference frames
 *   2. My Cheques — summary with check count
 *   3. My Trends — area chart with threshold band (NOT bar chart)
 *   4. My Product Mix — food/bev horizontal stacked bar
 *   5. My Ranking — neighborhood leaderboard (3 above, 3 below)
 *
 * Plus deterministic commentary at top.
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
  TrendingDown,
  Award,
  Activity,
  Layers,
  ShoppingBag,
  BarChart3,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { loadServerDetailData, loadStaffData, type ServerDetailData, type StaffMemberData } from '@/lib/financial/financial-data-service';

// Tier badge configuration
const TIER_CONFIG: Record<string, { emoji: string; label: string; labelEs: string; color: string }> = {
  estrella: { emoji: '\u2B50', label: 'Star', labelEs: 'Estrella', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  destacado: { emoji: '\u2705', label: 'Outstanding', labelEs: 'Destacado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  estandar: { emoji: '\u27A1\uFE0F', label: 'Standard', labelEs: 'Estandar', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' },
  desarrollo: { emoji: '\u26A0\uFE0F', label: 'Developing', labelEs: 'En Desarrollo', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
};

function getTierKey(pi: number): string {
  if (pi >= 85) return 'estrella';
  if (pi >= 70) return 'destacado';
  if (pi >= 50) return 'estandar';
  return 'desarrollo';
}

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ServerDetailData | null>(null);
  const [peers, setPeers] = useState<StaffMemberData[]>([]);

  useEffect(() => {
    if (!tenantId || !serverId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        // Load server detail + staff list (for ranking) in parallel
        const [serverResult, staffResult] = await Promise.all([
          loadServerDetailData(tenantId!, serverId),
          loadStaffData(tenantId!),
        ]);
        if (!cancelled) {
          setDetail(serverResult);
          setPeers(staffResult || []);
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
            <h2 className="text-xl font-semibold mb-2">
              {isSpanish ? 'Mesero No Encontrado' : 'Server Not Found'}
            </h2>
            <p className="text-muted-foreground">
              {isSpanish ? 'Este mesero no tiene datos o no existe.' : 'This server has no data or does not exist.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Computed values ---
  const tierKey = getTierKey(detail.performanceIndex);
  const tierCfg = TIER_CONFIG[tierKey];

  // Compute weekly average for threshold band
  const weeklyAvg = detail.weeklyRevenue.length > 0
    ? detail.weeklyRevenue.reduce((s, w) => s + w.revenue, 0) / detail.weeklyRevenue.length
    : 0;

  // Food/Bev split
  const totalFoodBev = detail.food + detail.bev;
  const foodPct = totalFoodBev > 0 ? Math.round((detail.food / totalFoodBev) * 100) : 50;
  const bevPct = 100 - foodPct;

  // Neighborhood leaderboard — find server + 3 above + 3 below by performanceIndex
  const sortedPeers = [...peers].sort((a, b) => b.performanceIndex - a.performanceIndex);
  const serverIdx = sortedPeers.findIndex(p => p.id === serverId);
  const neighborhood: Array<{ rank: number; name: string; pi: number; revenue: number; isSelf: boolean }> = [];
  if (serverIdx >= 0) {
    const start = Math.max(0, serverIdx - 3);
    const end = Math.min(sortedPeers.length, serverIdx + 4);
    for (let i = start; i < end; i++) {
      const p = sortedPeers[i];
      neighborhood.push({
        rank: i + 1,
        name: p.id === serverId ? detail.name : `${isSpanish ? 'Mesero' : 'Server'} #${i + 1}`,
        pi: p.performanceIndex,
        revenue: p.revenue,
        isSelf: p.id === serverId,
      });
    }
  }

  // Gap to next rank
  const nextAbove = serverIdx > 0 ? sortedPeers[serverIdx - 1] : null;
  const gapToNext = nextAbove ? nextAbove.revenue - detail.revenue : 0;

  // Weekly revenue trend
  const wd = detail.weeklyRevenue;
  const revTrend = wd.length >= 2
    ? ((wd[wd.length - 1].revenue - wd[wd.length - 2].revenue) / (wd[wd.length - 2].revenue || 1)) * 100
    : 0;

  // --- Deterministic Commentary (4D) ---
  const commentary: string[] = [];
  {
    // Header
    commentary.push(`${detail.name} \u00B7 ${detail.locationName} \u00B7 ${tierCfg.emoji} ${isSpanish ? tierCfg.labelEs : tierCfg.label}`);

    // Tip rate context
    commentary.push(
      isSpanish
        ? `Tasa de propina de ${detail.tipRate.toFixed(1)}%. Cheque promedio de ${format(detail.avgCheck)}.`
        : `Tip rate of ${detail.tipRate.toFixed(1)}%. Average check of ${format(detail.avgCheck)}.`
    );

    // Ranking context
    if (serverIdx >= 0 && sortedPeers.length > 0) {
      const locationPeers = sortedPeers.filter(p => p.locationName === detail.locationName);
      const locationRank = locationPeers.findIndex(p => p.id === serverId) + 1;
      commentary.push(
        isSpanish
          ? `Posicion #${locationRank} de ${locationPeers.length} meseros en esta ubicacion.`
          : `Ranked #${locationRank} of ${locationPeers.length} servers at this location.`
      );
    }

    // Gap framing
    if (gapToNext > 0) {
      commentary.push(
        isSpanish
          ? `${format(gapToNext)} mas en ingresos para alcanzar la siguiente posicion.`
          : `${format(gapToNext)} more revenue to reach next position.`
      );
    }

    // Product mix insight
    if (totalFoodBev > 0) {
      const emphasis = foodPct > 65
        ? (isSpanish ? 'Predominan alimentos — considere promover bebidas.' : 'Food-heavy mix — consider promoting beverages.')
        : bevPct > 50
        ? (isSpanish ? 'Buena mezcla de bebidas.' : 'Strong beverage mix.')
        : (isSpanish ? 'Mezcla equilibrada de alimentos y bebidas.' : 'Balanced food and beverage mix.');
      commentary.push(emphasis);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
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
            <Badge className={`border ${tierCfg.color}`}>
              {tierCfg.emoji} {isSpanish ? tierCfg.labelEs : tierCfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 ml-9">
            <span className="text-zinc-400">{detail.role}</span>
            {detail.locationName && (
              <>
                <span className="text-zinc-600">{'\u00B7'}</span>
                <Badge variant="outline">{detail.locationName}</Badge>
              </>
            )}
            {detail.meseroId && (
              <span className="text-xs text-zinc-500">ID: {detail.meseroId}</span>
            )}
          </div>
        </div>
      </div>

      {/* Deterministic Commentary (PG-30) */}
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

      {/* SECTION 1: My Performance — KPIs with tier badge + reference frames (PG-25, PG-26) */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Mi Rendimiento' : 'My Performance'}
        </h2>
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
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-zinc-400">{isSpanish ? 'Comensales' : 'Guests'}</span>
              </div>
              <p className="text-lg font-bold">{detail.guests.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-500">{detail.avgGuests} {isSpanish ? 'por cheque' : 'per check'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <div className="flex items-center gap-1 mb-1">
                <Award className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-zinc-400">{isSpanish ? 'Indice' : 'Performance'}</span>
              </div>
              <p className="text-lg font-bold">{detail.performanceIndex}</p>
              <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-1">
                <div
                  className={`h-1.5 rounded-full ${
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
      </section>

      {/* SECTION 2: My Cheques — summary (PG-27) */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Mis Cheques' : 'My Checks'}
        </h2>
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-zinc-400">{isSpanish ? 'Cheques Servidos' : 'Checks Served'}</p>
                <p className="text-2xl font-bold">{detail.cheques.toLocaleString()}</p>
                <p className="text-xs text-zinc-500">{isSpanish ? 'este periodo' : 'this period'}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{isSpanish ? 'Cheque Promedio' : 'Avg Check'}</p>
                <p className="text-2xl font-bold">{format(detail.avgCheck)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{isSpanish ? 'Propina Promedio' : 'Avg Tip'}</p>
                <p className="text-2xl font-bold">{detail.cheques > 0 ? format(detail.tips / detail.cheques) : '\u2014'}</p>
                <p className="text-xs text-zinc-500">{detail.tipRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">{isSpanish ? 'Comensales Totales' : 'Total Guests'}</p>
                <p className="text-2xl font-bold">{detail.guests.toLocaleString()}</p>
                <p className="text-xs text-zinc-500">{detail.avgGuests} {isSpanish ? 'prom/cheque' : 'avg/check'}</p>
              </div>
            </div>
            {/* Hourly distribution — kept as heatmap-style bar (this IS a pattern identification task) */}
            {detail.hourlyPattern.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-zinc-400 mb-2">{isSpanish ? 'Distribucion por Hora' : 'Hourly Distribution'}</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={detail.hourlyPattern}>
                      <XAxis dataKey="hour" stroke="#6b7280" fontSize={9} />
                      <YAxis stroke="#6b7280" hide />
                      <Tooltip
                        formatter={(value: number) => [value, isSpanish ? 'Cheques' : 'Checks']}
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                      />
                      <Bar dataKey="cheques" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* SECTION 3: My Trends — area chart with threshold band (PG-28) */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Mi Tendencia' : 'My Trends'}
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
                  {/* Threshold band — server's average as reference line */}
                  <ReferenceLine
                    y={weeklyAvg}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: isSpanish ? 'Promedio' : 'Average', position: 'right', fill: '#f59e0b', fontSize: 10 }}
                  />
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-blue-500 rounded" />
                <span>{isSpanish ? 'Ingresos semanales' : 'Weekly revenue'}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-amber-500 rounded" style={{ borderTop: '1px dashed #f59e0b' }} />
                <span>{isSpanish ? 'Promedio del periodo' : 'Period average'} ({format(weeklyAvg)})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 4: My Product Mix — food vs bev stacked bar (PG-31 diversity) */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              {isSpanish ? 'Mi Mezcla de Productos' : 'My Product Mix'}
            </div>
          </h2>
          <Card className="h-full">
            <CardContent className="pt-4">
              {totalFoodBev > 0 ? (
                <>
                  {/* Stacked horizontal bar */}
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
                  {/* Discounts */}
                  {detail.discounts > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">{isSpanish ? 'Descuentos + Comps' : 'Discounts + Comps'}</span>
                        <span className="text-sm font-medium text-red-400">-{format(detail.discounts)}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <ShoppingBag className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">
                    {isSpanish
                      ? 'Mezcla de productos requiere datos POS a nivel de articulo.'
                      : 'Product mix analysis requires item-level POS data.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* SECTION 5: My Ranking — neighborhood leaderboard (PG-29) */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {isSpanish ? 'Mi Posicion' : 'My Ranking'}
            </div>
          </h2>
          <Card className="h-full">
            <CardContent className="pt-4">
              {neighborhood.length > 0 ? (
                <>
                  <div className="space-y-1">
                    {neighborhood.map((n) => (
                      <div
                        key={n.rank}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                          n.isSelf ? 'bg-blue-500/15 border border-blue-500/30' : 'hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-mono w-6 text-right ${n.isSelf ? 'text-blue-400 font-bold' : 'text-zinc-500'}`}>
                            #{n.rank}
                          </span>
                          <span className={`text-sm ${n.isSelf ? 'font-semibold text-zinc-100' : 'text-zinc-400'}`}>
                            {n.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-zinc-500">PI {n.pi}</span>
                          <span className={n.isSelf ? 'font-semibold text-zinc-200' : 'text-zinc-400'}>
                            {format(n.revenue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Gap framing */}
                  {gapToNext > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 text-center">
                      <p className="text-xs text-zinc-400">
                        <span className="font-medium text-amber-400">{format(gapToNext)}</span>
                        {' '}
                        {isSpanish ? 'mas para alcanzar la siguiente posicion' : 'more to reach next position'}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">
                    {isSpanish ? 'Sin datos de comparacion disponibles.' : 'No comparison data available.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
