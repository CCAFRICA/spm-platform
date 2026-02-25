'use client';

/**
 * Network Pulse Dashboard (OB-101 Phase 3)
 *
 * Three sections:
 *   A. Hero Metrics Row — each with reference frames (DS-003 Rule 3)
 *   B. Deterministic Commentary — data-driven narrative
 *   C. Location Performance Grid — grouped by brand with intelligence
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Receipt,
  MapPin,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { usePersona } from '@/contexts/persona-context';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import { loadNetworkPulseData, type NetworkPulseData, type FinancialScope } from '@/lib/financial/financial-data-service';

export default function NetworkPulseDashboard() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { locale } = useLocale();
  const router = useRouter();
  const { persona, entityId, scope } = usePersona();
  const isSpanish = locale === 'es-MX';

  const tenantId = currentTenant?.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NetworkPulseData | null>(null);
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const toggleBrand = (brandName: string) => {
    setExpandedBrands(prev => {
      const next = new Set(prev);
      if (next.has(brandName)) next.delete(brandName);
      else next.add(brandName);
      return next;
    });
  };

  // HF-060: Rep persona redirects to their Server Detail page
  useEffect(() => {
    if (persona === 'rep' && entityId) {
      router.replace(`/financial/server/${entityId}`);
    }
  }, [persona, entityId, router]);

  // F-8/F-9: Build persona scope for data filtering
  const financialScope: FinancialScope | undefined = useMemo(() => {
    if (scope.canSeeAll) return undefined;
    if (scope.entityIds.length > 0) return { scopeEntityIds: scope.entityIds };
    return undefined;
  }, [scope]);

  useEffect(() => {
    if (persona === 'rep') return;
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    loadNetworkPulseData(tenantId, financialScope)
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => console.error('Failed to load network pulse data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, financialScope, persona]);

  const networkMetrics = data?.networkMetrics ?? null;
  const locations = data?.locations ?? [];
  const brands = data?.brands ?? [];

  // Initialize all brands as expanded when data loads
  useEffect(() => {
    if (data?.brands && data.brands.length > 0) {
      setExpandedBrands(new Set(data.brands.map(b => b.name)));
    }
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!networkMetrics) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {isSpanish ? 'Sin Datos Financieros' : 'No Financial Data'}
            </h2>
            <p className="text-muted-foreground">
              {isSpanish
                ? 'Importe datos POS a traves de Operar > Importar Paquete de Datos para ver el rendimiento de su red.'
                : 'Import POS data through Operate > Import Data Package to see your network performance.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Helpers ---

  // PG-18: Show "—" instead of "0%" when no actual change data
  const formatChange = (change: number) => {
    if (change === 0) return '—';
    return `${change > 0 ? '+' : ''}${change}%`;
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-zinc-500" />;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-500';
    if (change < 0) return 'text-red-500';
    return 'text-zinc-500';
  };

  // Threshold coloring for monitoring metrics
  const getThresholdColor = (value: number, target: number, inverted = false) => {
    // inverted: lower is better (e.g. leakage)
    if (inverted) {
      if (value <= target) return 'text-green-500';
      if (value <= target * 1.5) return 'text-amber-500';
      return 'text-red-500';
    }
    if (value >= target) return 'text-green-500';
    if (value >= target * 0.85) return 'text-amber-500';
    return 'text-red-500';
  };

  const formatWhole = (v: number) => format(Math.round(v));

  const getLocationBg = (comparison: 'above' | 'within' | 'below') => {
    switch (comparison) {
      case 'above': return 'bg-green-50 dark:bg-green-900/20';
      case 'within': return 'bg-amber-50 dark:bg-amber-900/20';
      case 'below': return 'bg-red-50 dark:bg-red-900/20';
    }
  };

  const getLocationBorderColor = (comparison: 'above' | 'within' | 'below') => {
    switch (comparison) {
      case 'above': return '#22c55e';
      case 'within': return '#f59e0b';
      case 'below': return '#ef4444';
    }
  };

  // Group locations by brand
  const locationsByBrand = new Map<string, typeof locations>();
  for (const loc of locations) {
    const key = loc.brandName || 'Other';
    const group = locationsByBrand.get(key) || [];
    group.push(loc);
    locationsByBrand.set(key, group);
  }

  // Brand-specific averages for anomaly detection (3B)
  const brandAvgs = new Map<string, { avgCheck: number; tipRate: number; leakageRate: number }>();
  for (const brand of brands) {
    const brandLocs = locations.filter(l => l.brandName === brand.name);
    if (brandLocs.length === 0) continue;
    const avgCheck = brandLocs.reduce((s, l) => s + l.avgCheck, 0) / brandLocs.length;
    const tipRate = brandLocs.reduce((s, l) => s + l.tipRate, 0) / brandLocs.length;
    const leakageRate = brandLocs.reduce((s, l) => s + l.leakageRate, 0) / brandLocs.length;
    brandAvgs.set(brand.name, { avgCheck, tipRate, leakageRate });
  }

  // Check if metric is outside ±5% of brand average
  const isAnomaly = (value: number, brandAvg: number) => {
    if (brandAvg === 0) return false;
    const ratio = value / brandAvg;
    return ratio > 1.05 || ratio < 0.95;
  };

  // --- Deterministic Commentary (3C) ---
  const commentary: string[] = [];
  {
    const aboveCount = locations.filter(l => l.vsNetworkAvg === 'above').length;
    const withinCount = locations.filter(l => l.vsNetworkAvg === 'within').length;
    const belowCount = locations.filter(l => l.vsNetworkAvg === 'below').length;

    // Header line
    commentary.push(
      isSpanish
        ? `Pulso de Red — ${networkMetrics.activeLocations}/${networkMetrics.totalLocations} ubicaciones activas`
        : `Network Pulse — ${networkMetrics.activeLocations}/${networkMetrics.totalLocations} locations active`
    );

    // Revenue dominance by brand
    if (brands.length > 1) {
      const sorted = [...brands].sort((a, b) => b.totalRevenue - a.totalRevenue);
      const top = sorted[0];
      const totalRev = brands.reduce((s, b) => s + b.totalRevenue, 0);
      const pct = totalRev > 0 ? Math.round((top.totalRevenue / totalRev) * 100) : 0;
      commentary.push(
        isSpanish
          ? `${top.name} domina ingresos (${formatWhole(top.totalRevenue)}, ${pct}% de la red).`
          : `${top.name} dominates revenue (${formatWhole(top.totalRevenue)}, ${pct}% of network).`
      );
    }

    // Tip rate leader
    if (locations.length > 0) {
      const tipLeader = [...locations].sort((a, b) => b.tipRate - a.tipRate)[0];
      commentary.push(
        isSpanish
          ? `${tipLeader.name} lidera propinas con ${tipLeader.tipRate.toFixed(1)}%.`
          : `${tipLeader.name} leads tip rate at ${tipLeader.tipRate.toFixed(1)}%.`
      );
    }

    // Distribution summary
    commentary.push(
      isSpanish
        ? `${aboveCount} sobre promedio (verde), ${withinCount} dentro de ±5% (ambar), ${belowCount} bajo promedio (rojo).`
        : `${aboveCount} above average (green), ${withinCount} within ±5% (amber), ${belowCount} below average (red).`
    );

    // Strongest performer
    if (locations.length > 0) {
      const strongest = [...locations].sort((a, b) => b.revenue - a.revenue)[0];
      commentary.push(
        isSpanish
          ? `Mejor rendimiento: ${strongest.name} (${formatWhole(strongest.revenue)}, Propina ${strongest.tipRate.toFixed(1)}%).`
          : `Strongest performer: ${strongest.name} (${formatWhole(strongest.revenue)}, Tip ${strongest.tipRate.toFixed(1)}%).`
      );
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {isSpanish ? 'Pulso de Red' : 'Network Pulse'}
          </h1>
          <p className="text-muted-foreground">
            {currentTenant?.displayName || currentTenant?.name || (isSpanish ? 'Rendimiento de la franquicia' : 'Franchise performance')}
            {' — '}
            {isSpanish ? 'rendimiento en tiempo real' : 'real-time performance'}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {networkMetrics.activeLocations}/{networkMetrics.totalLocations} {isSpanish ? 'ubicaciones activas' : 'active locations'}
        </Badge>
      </div>

      {/* SECTION A: Hero Metrics Row — each with reference frame (PG-17) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Net Revenue — Identification: ↑/↓ % vs prior */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Ingresos Netos' : 'Net Revenue'}
              </span>
            </div>
            <p className="text-xl font-bold">{format(networkMetrics.netRevenue)}</p>
            <div className={`flex items-center gap-1 text-xs ${getChangeColor(networkMetrics.revenueChange)}`}>
              {getChangeIcon(networkMetrics.revenueChange)}
              <span>{formatChange(networkMetrics.revenueChange)}</span>
              {networkMetrics.revenueChange !== 0 && (
                <span className="text-muted-foreground">{isSpanish ? 'vs anterior' : 'vs prior'}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Checks Served — Identification: ↑/↓ % vs prior */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Cheques' : 'Checks Served'}
              </span>
            </div>
            <p className="text-xl font-bold">{networkMetrics.checksServed.toLocaleString()}</p>
            <div className={`flex items-center gap-1 text-xs ${getChangeColor(networkMetrics.checksChange)}`}>
              {getChangeIcon(networkMetrics.checksChange)}
              <span>{formatChange(networkMetrics.checksChange)}</span>
              {networkMetrics.checksChange !== 0 && (
                <span className="text-muted-foreground">{isSpanish ? 'vs anterior' : 'vs prior'}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Avg Check — Identification: threshold color vs network target */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Cheque Promedio' : 'Avg Check'}
              </span>
            </div>
            <p className="text-xl font-bold">{format(networkMetrics.avgCheck)}</p>
            <div className={`flex items-center gap-1 text-xs ${getChangeColor(networkMetrics.avgCheckChange)}`}>
              {getChangeIcon(networkMetrics.avgCheckChange)}
              <span>{formatChange(networkMetrics.avgCheckChange)}</span>
              {networkMetrics.avgCheckChange !== 0 && (
                <span className="text-muted-foreground">{isSpanish ? 'vs anterior' : 'vs prior'}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tip Rate — Monitoring: vs target with threshold color */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Tasa de Propina' : 'Tip Rate'}
              </span>
            </div>
            <p className={`text-xl font-bold ${getThresholdColor(networkMetrics.tipRate, networkMetrics.tipTarget)}`}>
              {networkMetrics.tipRate.toFixed(1)}%
            </p>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">
                {isSpanish ? 'Meta' : 'Target'}: {networkMetrics.tipTarget}%
              </span>
              {networkMetrics.tipRate >= networkMetrics.tipTarget
                ? <TrendingUp className="h-3 w-3 text-green-500" />
                : <TrendingDown className="h-3 w-3 text-amber-500" />}
            </div>
          </CardContent>
        </Card>

        {/* Leakage Rate — Monitoring: vs threshold with inverted color */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Tasa de Fuga' : 'Leakage Rate'}
              </span>
            </div>
            <p className={`text-xl font-bold ${getThresholdColor(networkMetrics.leakageRate, networkMetrics.leakageThreshold, true)}`}>
              {networkMetrics.leakageRate.toFixed(1)}%
            </p>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">
                {isSpanish ? 'Umbral' : 'Threshold'}: {networkMetrics.leakageThreshold}%
              </span>
              {networkMetrics.leakageRate <= networkMetrics.leakageThreshold
                ? <TrendingUp className="h-3 w-3 text-green-500" />
                : <AlertTriangle className="h-3 w-3 text-red-500" />}
            </div>
          </CardContent>
        </Card>

        {/* Active Locations — Identification: N / N total fraction */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Ubicaciones' : 'Locations'}
              </span>
            </div>
            <p className="text-xl font-bold">{networkMetrics.activeLocations}/{networkMetrics.totalLocations}</p>
            <p className={`text-xs ${networkMetrics.activeLocations === networkMetrics.totalLocations ? 'text-green-500' : 'text-amber-500'}`}>
              {networkMetrics.activeLocations === networkMetrics.totalLocations
                ? (isSpanish ? 'Todas activas' : 'All active')
                : (isSpanish
                    ? `${networkMetrics.totalLocations - networkMetrics.activeLocations} inactivas`
                    : `${networkMetrics.totalLocations - networkMetrics.activeLocations} inactive`)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SECTION B: Deterministic Commentary (PG-21) */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2 mb-2">
            <Layers className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {isSpanish ? 'Observaciones' : 'Observations'}
            </span>
          </div>
          <div className="space-y-1.5 ml-6">
            {commentary.map((line, i) => (
              <p key={i} className={`text-sm ${i === 0 ? 'font-medium text-zinc-200' : 'text-zinc-400'}`}>
                {i > 0 && <span className="text-zinc-600 mr-1">{'·'}</span>}
                {line}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECTION C: Location Performance Grid — grouped by brand (PG-22, PG-23) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {isSpanish ? 'Rendimiento por Ubicacion' : 'Location Performance'}
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
              <span className="text-muted-foreground">{isSpanish ? 'Sobre promedio' : 'Above avg'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
              <span className="text-muted-foreground">{isSpanish ? 'Dentro ±5%' : 'Within ±5%'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-muted-foreground">{isSpanish ? 'Bajo promedio' : 'Below avg'}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {Array.from(locationsByBrand.entries()).map(([brandName, brandLocations]) => {
            const brandData = brands.find(b => b.name === brandName);
            const isExpanded = expandedBrands.has(brandName);
            const bAvg = brandAvgs.get(brandName);

            return (
              <div key={brandName}>
                {/* Clickable brand header (PG-22) */}
                <button
                  className="flex items-center justify-between w-full mb-3 group cursor-pointer"
                  onClick={() => toggleBrand(brandName)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: brandLocations[0]?.brandColor || '#6b7280' }}
                    />
                    <span className="text-sm font-medium text-zinc-300">{brandName}</span>
                    {brandData && (
                      <Badge variant="secondary" className="text-[10px]">{brandData.concept}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      ({brandLocations.length} {brandLocations.length === 1
                        ? (isSpanish ? 'ubicacion' : 'location')
                        : (isSpanish ? 'ubicaciones' : 'locations')})
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {brandData && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatWhole(brandData.totalRevenue)}</span>
                        <span>{isSpanish ? 'Prom.' : 'Avg'} {format(brandData.avgCheck)}</span>
                        <span>Tip {(brandData.tipRate * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {/* Location grid */}
                {isExpanded && (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {brandLocations.map((location) => {
                      // 3B: Brand-specific anomaly detection
                      const hasCheckAnomaly = bAvg ? isAnomaly(location.avgCheck, bAvg.avgCheck) : false;
                      const hasTipAnomaly = bAvg ? isAnomaly(location.tipRate, bAvg.tipRate) : false;
                      const hasLeakAnomaly = bAvg ? isAnomaly(location.leakageRate, bAvg.leakageRate) : false;

                      // Revenue trend from weeklyData
                      const wd = location.weeklyData;
                      const revTrend = wd.length >= 2
                        ? ((wd[wd.length - 1] - wd[wd.length - 2]) / (wd[wd.length - 2] || 1)) * 100
                        : 0;

                      return (
                        <div
                          key={location.id}
                          className={`rounded-lg p-3 border-l-4 cursor-pointer transition-opacity hover:opacity-80 ${getLocationBg(location.vsNetworkAvg)}`}
                          style={{ borderLeftColor: getLocationBorderColor(location.vsNetworkAvg) }}
                          onClick={() => router.push(`/financial/location/${location.id}`)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{location.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{location.city}</p>
                            </div>
                            {/* Brand-specific anomaly indicators (3B) */}
                            <div className="flex gap-1 shrink-0 ml-1">
                              {hasCheckAnomaly && (
                                <div className="w-2 h-2 rounded-full bg-violet-500" title={`Avg check ${format(location.avgCheck)} vs brand avg ${bAvg ? format(bAvg.avgCheck) : ''}`} />
                              )}
                              {hasTipAnomaly && (
                                <div className="w-2 h-2 rounded-full bg-amber-500" title={`Tip ${location.tipRate.toFixed(1)}% vs brand avg ${bAvg ? bAvg.tipRate.toFixed(1) : ''}%`} />
                              )}
                              {hasLeakAnomaly && (
                                <div className="w-2 h-2 rounded-full bg-red-500" title={`Leakage ${location.leakageRate.toFixed(1)}% vs brand avg ${bAvg ? bAvg.leakageRate.toFixed(1) : ''}%`} />
                              )}
                            </div>
                          </div>

                          {/* Revenue with trend arrow (PG-19) */}
                          <div className="flex items-center gap-1 mt-2">
                            <p className="text-lg font-bold">{formatWhole(location.revenue)}</p>
                            {revTrend !== 0 && (
                              <span className={`${revTrend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {revTrend > 0
                                  ? <TrendingUp className="h-3 w-3 inline" />
                                  : <TrendingDown className="h-3 w-3 inline" />}
                              </span>
                            )}
                          </div>

                          {/* Avg Check (PG-20) */}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isSpanish ? 'Prom.' : 'Avg'} {format(location.avgCheck)}
                          </p>

                          {/* Mini Sparkline */}
                          <div className="h-5 mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={location.weeklyData.map((v, i) => ({ v, i }))}>
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

                          {/* Micro stats */}
                          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                            <span>Tip {location.tipRate.toFixed(1)}%</span>
                            <span className={location.leakageRate > 5 ? 'text-red-400' : ''}>
                              Leak {location.leakageRate.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
