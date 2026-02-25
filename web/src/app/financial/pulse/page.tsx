'use client';

/**
 * Network Pulse Dashboard
 *
 * The FIRST thing a franchise operator sees. Shows network health at a glance.
 * Three sections: Key Metrics Row, Location Performance Grid, Brand Comparison
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  MapPin,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
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
  // OB-100: Expand/collapse brand groups (all expanded by default)
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
    if (scope.canSeeAll) return undefined; // Admin sees all
    if (scope.entityIds.length > 0) return { scopeEntityIds: scope.entityIds };
    return undefined;
  }, [scope]);

  useEffect(() => {
    // Don't load network pulse if rep — we're redirecting to server detail
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

  // OB-100: Initialize all brands as expanded when data loads
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

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-600" />;
    if (change < 0) return <TrendingDown className="h-3 w-3 text-red-600" />;
    return null;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-slate-400';
  };

  const getLocationBg = (comparison: 'above' | 'within' | 'below') => {
    switch (comparison) {
      case 'above': return 'bg-green-50 dark:bg-green-900/20';
      case 'within': return 'bg-amber-50 dark:bg-amber-900/20';
      case 'below': return 'bg-red-50 dark:bg-red-900/20';
    }
  };

  // F-4: Border color matches performance indicator, not brand
  const getLocationBorderColor = (comparison: 'above' | 'within' | 'below') => {
    switch (comparison) {
      case 'above': return '#22c55e';  // green-500
      case 'within': return '#f59e0b'; // amber-500
      case 'below': return '#ef4444';  // red-500
    }
  };

  // F-3: No cents on large amounts
  const formatWhole = (v: number) => {
    return format(Math.round(v));
  };

  // F-2: Group locations by brand
  const locationsByBrand = new Map<string, typeof locations>();
  for (const loc of locations) {
    const key = loc.brandName || 'Other';
    const group = locationsByBrand.get(key) || [];
    group.push(loc);
    locationsByBrand.set(key, group);
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
            {' - '}
            {isSpanish ? 'rendimiento en tiempo real' : 'real-time performance'}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {networkMetrics.activeLocations}/{networkMetrics.totalLocations} {isSpanish ? 'ubicaciones activas' : 'active locations'}
        </Badge>
      </div>

      {/* SECTION A: Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Net Revenue */}
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
              <span>{networkMetrics.revenueChange > 0 ? '+' : ''}{networkMetrics.revenueChange}%</span>
              <span className="text-muted-foreground">{isSpanish ? 'vs periodo anterior' : 'vs prior'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Checks Served */}
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
              <span>{networkMetrics.checksChange > 0 ? '+' : ''}{networkMetrics.checksChange}%</span>
              <span className="text-muted-foreground">{isSpanish ? 'vs periodo anterior' : 'vs prior'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Avg Check */}
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
              <span>{networkMetrics.avgCheckChange > 0 ? '+' : ''}{networkMetrics.avgCheckChange}%</span>
              <span className="text-muted-foreground">{isSpanish ? 'vs periodo anterior' : 'vs prior'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Tip Rate */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Tasa de Propina' : 'Tip Rate'}
              </span>
            </div>
            <p className="text-xl font-bold">{networkMetrics.tipRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">
              {isSpanish ? 'Meta' : 'Target'}: {networkMetrics.tipTarget}%
            </p>
          </CardContent>
        </Card>

        {/* Leakage Rate */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Tasa de Fuga' : 'Leakage Rate'}
              </span>
            </div>
            <p className={`text-xl font-bold ${networkMetrics.leakageRate <= networkMetrics.leakageThreshold ? 'text-green-600' : 'text-amber-600'}`}>
              {networkMetrics.leakageRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {isSpanish ? 'Descuentos + comps + cancelaciones' : 'Discounts + comps + cancels'}
            </p>
          </CardContent>
        </Card>

        {/* Active Locations */}
        <Card className="min-h-[120px]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 mb-1">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isSpanish ? 'Ubicaciones Activas' : 'Active Locations'}
              </span>
            </div>
            <p className="text-xl font-bold">{networkMetrics.activeLocations}/{networkMetrics.totalLocations}</p>
            <p className="text-xs text-muted-foreground">
              {isSpanish ? 'Todas las ubicaciones activas' : 'All locations active'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SECTION B: Location Performance Grid — grouped by brand */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {isSpanish ? 'Rendimiento por Ubicacion' : 'Location Performance'}
          </CardTitle>
          {/* F-5: Prominent legend */}
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
          {/* OB-100: Brand-grouped sections with expand/collapse + summary stats */}
          {Array.from(locationsByBrand.entries()).map(([brandName, brandLocations]) => {
            const brandData = brands.find(b => b.name === brandName);
            const isExpanded = expandedBrands.has(brandName);

            return (
              <div key={brandName}>
                {/* Clickable brand header */}
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
                    {/* Summary stats inline */}
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
                {/* Location grid — conditionally rendered */}
                {isExpanded && (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {brandLocations.map((location) => (
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
                          {/* Anomaly indicators */}
                          <div className="flex gap-1 shrink-0 ml-1">
                            {location.leakageRate > 5 && (
                              <div className="w-2 h-2 rounded-full bg-red-500" title={`Leakage ${location.leakageRate.toFixed(1)}%`} />
                            )}
                            {location.tipRate < 8 && (
                              <div className="w-2 h-2 rounded-full bg-amber-500" title={`Tip rate ${location.tipRate.toFixed(1)}%`} />
                            )}
                          </div>
                        </div>
                        {/* F-3: No cents on large amounts */}
                        <p className="text-lg font-bold mt-2">{formatWhole(location.revenue)}</p>
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
                    ))}
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
