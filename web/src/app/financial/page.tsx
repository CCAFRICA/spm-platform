'use client';

/**
 * Network Pulse Dashboard
 *
 * The FIRST thing a franchise operator sees. Shows network health at a glance.
 * Three sections: Key Metrics Row, Location Performance Grid, Brand Comparison
 */

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import { loadNetworkPulseData, type NetworkPulseData } from '@/lib/financial/financial-data-service';

// Types come from financial-data-service

export default function NetworkPulseDashboard() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const tenantId = currentTenant?.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NetworkPulseData | null>(null);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    loadNetworkPulseData(tenantId)
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => console.error('Failed to load network pulse data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const networkMetrics = data?.networkMetrics ?? null;
  const locations = data?.locations ?? [];
  const brands = data?.brands ?? [];

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

      {/* SECTION B: Location Performance Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isSpanish ? 'Rendimiento por Ubicacion' : 'Location Performance'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {locations.map((location) => (
              <div
                key={location.id}
                className={`rounded-lg p-3 border-l-4 ${getLocationBg(location.vsNetworkAvg)}`}
                style={{ borderLeftColor: location.brandColor }}
              >
                <p className="font-medium text-sm truncate">{location.name}</p>
                <p className="text-xs text-muted-foreground truncate">{location.city}</p>
                <p className="text-lg font-bold mt-2">{format(location.revenue)}</p>
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
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            {isSpanish
              ? 'Verde = sobre promedio de red, Ambar = dentro de 10%, Rojo = bajo promedio'
              : 'Green = above network avg, Amber = within 10%, Red = below avg'}
          </p>
        </CardContent>
      </Card>

      {/* SECTION C: Brand Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {brands.map((brand) => (
          <Card key={brand.id} className="overflow-hidden">
            <div className="h-1" style={{ backgroundColor: brand.color }} />
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{brand.name}</span>
                <Badge variant="secondary" className="text-xs">{brand.concept}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{isSpanish ? 'Ubicaciones' : 'Locations'}</p>
                  <p className="font-semibold">{brand.locationCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{isSpanish ? 'Ingresos' : 'Revenue'}</p>
                  <p className="font-semibold">{format(brand.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{isSpanish ? 'Cheque Prom.' : 'Avg Check'}</p>
                  <p className="font-semibold">{format(brand.avgCheck)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{isSpanish ? 'Tasa Propina' : 'Tip Rate'}</p>
                  <p className="font-semibold">{(brand.tipRate * 100).toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
