'use client';

/**
 * Financial Landing — Bloodwork Health Summary (OB-101 Phase 2)
 *
 * Card-based health summary that replaces the direct Network Pulse drop-in.
 * Three sections:
 *   1. Brand Health Cards — one per brand, green/amber/red status
 *   2. Report Discovery Cards — 7 cards linking to sub-pages
 *   3. Deterministic Commentary — data-driven narrative insights
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  TrendingUp,
  Users,
  AlertTriangle,
  BarChart3,
  Clock,
  ShoppingBag,
  FileText,
  Layers,
  MapPin,
  ArrowRight,
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

export default function FinancialLandingPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { locale } = useLocale();
  const router = useRouter();
  const { persona, entityId, scope } = usePersona();
  const isSpanish = locale === 'es-MX';

  const tenantId = currentTenant?.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NetworkPulseData | null>(null);

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
      .catch(err => console.error('Failed to load financial data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, financialScope, persona]);

  const networkMetrics = data?.networkMetrics ?? null;
  const brands = data?.brands ?? [];
  const locations = data?.locations ?? [];

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

  // --- Brand Health Computation ---
  const getBrandHealth = (brand: typeof brands[0]) => {
    // Health based on: tip rate vs 10% target, leakage, and revenue concentration
    const brandLocations = locations.filter(l => l.brandName === brand.name);
    const belowCount = brandLocations.filter(l => l.vsNetworkAvg === 'below').length;
    const belowRatio = brandLocations.length > 0 ? belowCount / brandLocations.length : 0;
    const tipRate = brand.tipRate * 100; // Convert from decimal
    if (belowRatio > 0.5 || tipRate < 6) return 'critical' as const;
    if (belowRatio > 0.25 || tipRate < 8) return 'warning' as const;
    return 'healthy' as const;
  };

  const healthConfig = {
    healthy: { bg: 'bg-green-900/20', border: 'border-green-500/40', dot: 'bg-green-500', label: isSpanish ? 'Saludable' : 'Healthy' },
    warning: { bg: 'bg-amber-900/20', border: 'border-amber-500/40', dot: 'bg-amber-500', label: isSpanish ? 'Atención' : 'Attention' },
    critical: { bg: 'bg-red-900/20', border: 'border-red-500/40', dot: 'bg-red-500', label: isSpanish ? 'Crítico' : 'Critical' },
  };

  // --- Report Discovery Cards ---
  const reportCards = [
    {
      title: isSpanish ? 'Pulso de Red' : 'Network Pulse',
      desc: isSpanish ? 'Rendimiento en tiempo real por ubicación y marca' : 'Real-time performance by location and brand',
      href: '/financial/pulse',
      icon: Activity,
      metric: `${networkMetrics.activeLocations} ${isSpanish ? 'ubicaciones' : 'locations'}`,
    },
    {
      title: isSpanish ? 'Cronología de Ingresos' : 'Revenue Timeline',
      desc: isSpanish ? 'Tendencias de ingresos diarias, semanales y mensuales' : 'Daily, weekly, and monthly revenue trends',
      href: '/financial/timeline',
      icon: TrendingUp,
      metric: format(networkMetrics.netRevenue),
    },
    {
      title: isSpanish ? 'Rendimiento de Personal' : 'Staff Performance',
      desc: isSpanish ? 'Rankings y métricas individuales de meseros' : 'Server rankings and individual metrics',
      href: '/financial/staff',
      icon: Users,
      metric: `${networkMetrics.checksServed.toLocaleString()} ${isSpanish ? 'cheques' : 'checks'}`,
    },
    {
      title: isSpanish ? 'Monitor de Fugas' : 'Leakage Monitor',
      desc: isSpanish ? 'Descuentos, comps y cancelaciones por ubicación' : 'Discounts, comps, and cancellations by location',
      href: '/financial/leakage',
      icon: AlertTriangle,
      metric: `${networkMetrics.leakageRate.toFixed(1)}%`,
    },
    {
      title: isSpanish ? 'Patrones Operativos' : 'Operational Patterns',
      desc: isSpanish ? 'Mapas de calor de horarios y días pico' : 'Peak hours and day heatmaps',
      href: '/financial/patterns',
      icon: Clock,
      metric: null,
    },
    {
      title: isSpanish ? 'Mezcla de Productos' : 'Product Mix',
      desc: isSpanish ? 'Proporción alimentos vs bebidas por marca' : 'Food vs beverage ratio by brand',
      href: '/financial/products',
      icon: ShoppingBag,
      metric: null,
    },
    {
      title: isSpanish ? 'Resumen Operativo' : 'Operating Summary',
      desc: isSpanish ? 'Estado de resultados consolidado del período' : 'Consolidated period income statement',
      href: '/financial/summary',
      icon: FileText,
      metric: null,
    },
  ];

  // --- Deterministic Commentary ---
  const commentary: string[] = [];
  {
    // Best and worst brand
    if (brands.length > 1) {
      const sorted = [...brands].sort((a, b) => b.totalRevenue - a.totalRevenue);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      commentary.push(
        isSpanish
          ? `${top.name} lidera con ${format(top.totalRevenue)} en ingresos de ${top.locationCount} ubicaciones. ${bottom.name} contribuye ${format(bottom.totalRevenue)}.`
          : `${top.name} leads with ${format(top.totalRevenue)} revenue across ${top.locationCount} locations. ${bottom.name} contributes ${format(bottom.totalRevenue)}.`
      );
    }

    // Leakage alert
    if (networkMetrics.leakageRate > networkMetrics.leakageThreshold) {
      commentary.push(
        isSpanish
          ? `Tasa de fuga de ${networkMetrics.leakageRate.toFixed(1)}% excede el umbral de ${networkMetrics.leakageThreshold}%. Revise el Monitor de Fugas.`
          : `Leakage rate of ${networkMetrics.leakageRate.toFixed(1)}% exceeds the ${networkMetrics.leakageThreshold}% threshold. Review the Leakage Monitor.`
      );
    }

    // Tip rate observation
    const tipPct = networkMetrics.tipRate;
    if (tipPct < networkMetrics.tipTarget) {
      const gap = (networkMetrics.tipTarget - tipPct).toFixed(1);
      commentary.push(
        isSpanish
          ? `Propina promedio de ${tipPct.toFixed(1)}% está ${gap}pp debajo de la meta de ${networkMetrics.tipTarget}%.`
          : `Average tip rate of ${tipPct.toFixed(1)}% is ${gap}pp below the ${networkMetrics.tipTarget}% target.`
      );
    }

    // Location performance distribution
    const aboveCount = locations.filter(l => l.vsNetworkAvg === 'above').length;
    const belowCount = locations.filter(l => l.vsNetworkAvg === 'below').length;
    if (locations.length > 0) {
      commentary.push(
        isSpanish
          ? `${aboveCount} de ${locations.length} ubicaciones sobre el promedio de red. ${belowCount} bajo el promedio.`
          : `${aboveCount} of ${locations.length} locations above network average. ${belowCount} below average.`
      );
    }

    // Revenue change
    if (networkMetrics.revenueChange !== 0) {
      const direction = networkMetrics.revenueChange > 0;
      commentary.push(
        isSpanish
          ? `Ingresos ${direction ? 'subieron' : 'bajaron'} ${Math.abs(networkMetrics.revenueChange)}% vs periodo anterior.`
          : `Revenue ${direction ? 'up' : 'down'} ${Math.abs(networkMetrics.revenueChange)}% vs prior period.`
      );
    }
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          {isSpanish ? 'Finanzas' : 'Financial'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {currentTenant?.displayName || currentTenant?.name || ''}
          {' — '}
          {isSpanish ? 'Resumen de salud de la red' : 'Network health summary'}
        </p>
      </div>

      {/* SECTION 1: Brand Health Cards */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Salud por Marca' : 'Brand Health'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map(brand => {
            const health = getBrandHealth(brand);
            const cfg = healthConfig[health];
            const brandLocations = locations.filter(l => l.brandName === brand.name);
            // Build mini sparkline from brand's location weekly data (averaged)
            const sparkline = brandLocations.length > 0
              ? Array.from({ length: brandLocations[0].weeklyData.length }, (_, i) => ({
                  v: brandLocations.reduce((sum, l) => sum + (l.weeklyData[i] || 0), 0) / brandLocations.length,
                  i,
                }))
              : [];

            return (
              <Card
                key={brand.id}
                className={`${cfg.bg} border ${cfg.border} cursor-pointer transition-all hover:brightness-110`}
                onClick={() => router.push('/financial/pulse')}
              >
                <CardContent className="pt-4 pb-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand.color }} />
                      <span className="font-semibold text-sm">{brand.name}</span>
                      <Badge variant="outline" className="text-[10px]">{brand.concept}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                    </div>
                  </div>

                  {/* Metrics row */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground">{isSpanish ? 'Ingresos' : 'Revenue'}</p>
                      <p className="text-sm font-bold">{format(brand.totalRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">{isSpanish ? 'Cheque Prom.' : 'Avg Check'}</p>
                      <p className="text-sm font-bold">{format(brand.avgCheck)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">{isSpanish ? 'Propina' : 'Tip Rate'}</p>
                      <p className="text-sm font-bold">{(brand.tipRate * 100).toFixed(1)}%</p>
                    </div>
                  </div>

                  {/* Sparkline + location count */}
                  <div className="flex items-center justify-between">
                    <div className="h-6 flex-1 mr-3">
                      {sparkline.length > 0 && (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sparkline}>
                            <Line
                              type="monotone"
                              dataKey="v"
                              stroke={brand.color}
                              strokeWidth={1.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <MapPin className="h-3 w-3" />
                      <span>{brand.locationCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: Report Discovery Cards */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          {isSpanish ? 'Reportes' : 'Reports'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {reportCards.map(card => (
            <Link key={card.href} href={card.href}>
              <Card className="hover:bg-slate-800/60 transition-colors cursor-pointer h-full">
                <CardContent className="pt-4 pb-3 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-2">
                    <card.icon className="h-5 w-5 text-primary shrink-0" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold mb-1">{card.title}</p>
                  <p className="text-xs text-muted-foreground flex-1">{card.desc}</p>
                  {card.metric && (
                    <p className="text-xs font-medium text-primary mt-2">{card.metric}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* SECTION 3: Deterministic Commentary */}
      {commentary.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {isSpanish ? 'Observaciones' : 'Observations'}
            </div>
          </h2>
          <Card>
            <CardContent className="pt-4 pb-3">
              <ul className="space-y-2">
                {commentary.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-muted-foreground mt-0.5">
                      {i === 0 ? <BarChart3 className="h-3.5 w-3.5" /> : <span className="block w-3.5 h-3.5 text-center text-[10px]">{'·'}</span>}
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
