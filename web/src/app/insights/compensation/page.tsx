'use client';

/**
 * OB-234 T2 — Intelligence · Compensation (/insights/compensation). The money lens: the authoritative
 * period total (dominant), composition, dimension pivot, payout distribution, and entity drill. End-State A:
 * every ICM value reads getPeriodTotal / getComponentTotals / getDimensions / aggregateByDimension /
 * getEntityResults / getPopulationTrend — zero committed_data, zero inline createClient calc query.
 *
 * DS-003 composition (ICM branch): HeroMetric (Identification, dominant) + StackedBar (part-of-whole) +
 * HorizontalBar (ranked dimension pivot) + DistributionPosition (population ranking) = 4 component types
 * (Diversity Minimum) + StubAction (honest disabled AI plan-health). Every viz carries a reference frame.
 *
 * PRESERVED branches: hospitality (restaurant views), loading, empty/onboarding, drill-through (EntityTable).
 * REMOVED (OB-234 dirty-path fix): the inline createClient().from('calculation_results') loadPlanDistribution
 * query and the "Active Plans" tile that consumed it.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  Target,
  Trophy,
  Utensils,
  Wine,
  Coins,
  Users,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context'; // OB-226 Korean Test
import { useAuth } from '@/contexts/auth-context'; // OB-226 isSpanish ternary
import { isVLAdmin } from '@/types/auth'; // OB-226 isSpanish ternary
import { getCheques, getMeseros, getFranquicias } from '@/lib/restaurant-service';
import {
  getCalculatedPeriods,
  getPeriodTotal,
  getComponentTotals,
  getDimensions,
  aggregateByDimension,
  getPopulationTrend,
  ALL_INSIGHTS_SCOPE,
  type PeriodSummary,
  type ComponentTotal,
  type EnrichedDimension,
  type DimensionSlice,
  type PopulationTrendPoint,
} from '@/lib/insights';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { GoalProgressBar } from '@/components/charts/goal-progress-bar';
import { SalesHistoryChart } from '@/components/charts/sales-history-chart';
import { Leaderboard } from '@/components/charts/leaderboard';
import { PeriodCards, EntityTable } from '@/components/insights'; // OB-227 / OB-322
import {
  PersonaAmbient,
  DensityGate,
  usePersonaTheme,
  HeroMetric,
  StackedBar,
  HorizontalBar,
  DistributionPosition,
  StubAction,
  Panel,
  TEXT,
} from '@/components/insights/ds003';
import type { Cheque, Franquicia, Mesero } from '@/types/cheques';

// Compact supporting stat tile (DS-003 §2: supporting metrics use compact forms; not a DS-003 type).
function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof Users }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${TEXT.body}`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TEXT.headline}`}>{value}</div>
      <div className={`text-xs ${TEXT.muted}`}>{hint}</div>
    </div>
  );
}

interface HospitalityData {
  myTotal: number;
  myFood: number;
  myBeverage: number;
  myTips: number;
  myCommission: number;
  myCheckCount: number;
  target: number;
  myRank: number;
  totalFranquicias: number;
  franchiseRanking: Array<{ id: string; rank: number; name: string; value: number }>;
  historyData: Array<{ period: string; label: string; alimentos: number; bebidas: number; total: number }>;
  currentMesero: Mesero | null;
  currentFranquicia: Franquicia | null;
}

export default function CompensationPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { locale } = useLocale(); // OB-226 Korean Test
  const { user } = useAuth(); // OB-226 isSpanish ternary
  const theme = usePersonaTheme();

  const [data, setData] = useState<HospitalityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // OB-226: VL admins always see English; tenant users localize (codebase isSpanish standard).
  const isSpanish = user && isVLAdmin(user) ? false : isSpanishLocale(locale);

  const isHospitality = currentTenant?.industry === 'Hospitality';
  const tenantId = currentTenant?.id ?? '';

  // For demo, assume current user is mesero_id 5001 at CDMX Polanco
  const currentMeseroId = 5001;
  const currentFranquiciaId = 'MX-CDMX-001';

  // ── ICM (non-hospitality) state — End-State A clean reads only ──────────────────────────────────
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [entityResults, setEntityResults] = useState<EntityResult[]>([]);
  const [componentTotals, setComponentTotals] = useState<ComponentTotal[]>([]);
  const [dimensionSlices, setDimensionSlices] = useState<DimensionSlice[]>([]);
  const [dimensionLabel, setDimensionLabel] = useState<string | null>(null);
  const [trend, setTrend] = useState<PopulationTrendPoint[]>([]);
  const [compLoading, setCompLoading] = useState(true);

  // Hospitality data (PRESERVED branch).
  useEffect(() => {
    if (isHospitality) {
      loadHospitalityData();
    } else {
      setIsLoading(false);
    }
  }, [isHospitality]);

  // OB-227: load the calculated periods once (canonical getCalculatedPeriods, start_date DESC).
  useEffect(() => {
    if (isHospitality || !tenantId) return;
    let cancelled = false;
    getCalculatedPeriods(tenantId)
      .then((ps) => {
        if (cancelled) return;
        setPeriods(ps);
        setSelectedPeriodId((prev) => prev || ps[0]?.period_id || '');
        setPeriodsLoaded(true);
        if (ps.length === 0) setCompLoading(false);
      })
      .catch((err) => {
        console.warn('[Compensation] periods load failed:', err);
        if (!cancelled) { setPeriodsLoaded(true); setCompLoading(false); }
      });
    return () => { cancelled = true; };
  }, [isHospitality, tenantId]);

  // OB-234: cumulative comp trend (cross-period) — loaded once for the cumulative stat tile.
  useEffect(() => {
    if (isHospitality || !tenantId) return;
    let cancelled = false;
    getPopulationTrend(tenantId)
      .then((t) => { if (!cancelled) setTrend(t); })
      .catch((err) => console.warn('[Compensation] trend load failed:', err));
    return () => { cancelled = true; };
  }, [isHospitality, tenantId]);

  // OB-234: SELECTED-period money lens — total, per-entity outcomes, composition, dimension pivot.
  // ALL clean reads (getPeriodTotal / getEntityResults / getComponentTotals / getDimensions). No raw query.
  useEffect(() => {
    if (isHospitality || !tenantId || !selectedPeriodId) return;
    let cancelled = false;
    setCompLoading(true);
    (async () => {
      try {
        const [total, results, components, dims] = await Promise.all([
          getPeriodTotal(tenantId, selectedPeriodId),
          getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: selectedPeriodId }),
          getComponentTotals(tenantId, selectedPeriodId),
          getDimensions(tenantId, selectedPeriodId),
        ]);
        if (cancelled) return;
        setPeriodTotal(total);
        setEntityResults(results);
        setComponentTotals(components);

        // Dimension pivot — prefer the first attribute dimension (variant/level/region), else component.
        const pivot: EnrichedDimension | undefined =
          dims.find((d) => d.source === 'attribute') ?? dims[0];
        if (pivot) {
          const slices = await aggregateByDimension(tenantId, selectedPeriodId, pivot);
          if (cancelled) return;
          setDimensionSlices(slices);
          setDimensionLabel(pivot.label);
        } else {
          setDimensionSlices([]);
          setDimensionLabel(null);
        }
      } catch (error) {
        console.error('[Compensation] period data load failed:', error);
      } finally {
        if (!cancelled) setCompLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isHospitality, tenantId, selectedPeriodId]);

  const loadHospitalityData = async () => {
    setIsLoading(true);
    try {
      const [cheques, meseros, franquicias] = await Promise.all([
        getCheques(),
        getMeseros(),
        getFranquicias(),
      ]);

      // Get current mesero and franchise
      const currentMesero = meseros.find(m => m.mesero_id === currentMeseroId) || null;
      const currentFranquicia = franquicias.find(f => f.numero_franquicia === currentFranquiciaId) || null;

      // Calculate my sales (from my franchise)
      const franchiseCheques = cheques.filter(
        (c: Cheque) => c.numero_franquicia === currentFranquiciaId && c.pagado === 1 && c.cancelado === 0
      );
      const myCheques = franchiseCheques.filter((c: Cheque) => c.mesero_id === currentMeseroId);

      const myTotal = myCheques.reduce((sum: number, c: Cheque) => sum + c.total, 0);
      const myFood = myCheques.reduce((sum: number, c: Cheque) => sum + c.total_alimentos, 0);
      const myBeverage = myCheques.reduce((sum: number, c: Cheque) => sum + c.total_bebidas, 0);
      const myTips = myCheques.reduce((sum: number, c: Cheque) => sum + c.propina, 0);
      const myCommission = myTotal * (currentMesero?.commission_rate || 0.02);
      const myCheckCount = myCheques.length;

      // Franchise target (simplified: avg ticket target * 500 checks per period)
      const target = (currentFranquicia?.target_avg_ticket || 300) * 500;

      // Franchise ranking by total sales
      const franchiseRanking = franquicias
        .map((f: Franquicia) => {
          const fCheques = cheques.filter(
            (c: Cheque) => c.numero_franquicia === f.numero_franquicia && c.pagado === 1 && c.cancelado === 0
          );
          return {
            id: f.numero_franquicia,
            name: f.nombre,
            total: fCheques.reduce((s: number, c: Cheque) => s + c.total, 0),
          };
        })
        .sort((a, b) => b.total - a.total)
        .map((f, i) => ({ ...f, rank: i + 1, value: f.total }));

      const myRank = franchiseRanking.findIndex(f => f.id === currentFranquiciaId) + 1;

      // History data (simulate based on current data with some variation)
      const baseFood = myFood || 50000;
      const baseBeverage = myBeverage || 20000;
      const historyData = [
        { period: 'oct', label: 'Oct', alimentos: baseFood * 0.8, bebidas: baseBeverage * 0.8, total: (baseFood + baseBeverage) * 0.8 },
        { period: 'nov', label: 'Nov', alimentos: baseFood * 0.9, bebidas: baseBeverage * 0.9, total: (baseFood + baseBeverage) * 0.9 },
        { period: 'dic', label: 'Dec', alimentos: baseFood * 0.95, bebidas: baseBeverage * 0.95, total: (baseFood + baseBeverage) * 0.95 },
        { period: 'actual', label: 'Current', alimentos: myFood, bebidas: myBeverage, total: myTotal },
        { period: 'lastyear', label: 'Dec 2023', alimentos: baseFood * 0.85, bebidas: baseBeverage * 0.85, total: (baseFood + baseBeverage) * 0.85 },
      ];

      setData({
        myTotal,
        myFood,
        myBeverage,
        myTips,
        myCommission,
        myCheckCount,
        target,
        myRank,
        totalFranquicias: franquicias.length,
        franchiseRanking,
        historyData,
        currentMesero,
        currentFranquicia,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── ICM (non-hospitality) branch — DS-003 redesign, End-State A clean path ──────────────────────
  if (!isHospitality) {
    const selectedIdx = periods.findIndex((p) => p.period_id === selectedPeriodId);
    const selectedLabel = periods[selectedIdx]?.label ?? '—';
    const hasResults = entityResults.length > 0;

    // i18n strings (codebase isSpanish standard; VL admins always English).
    const t = {
      heading: isSpanish ? 'Compensación' : 'Compensation',
      sub: isSpanish ? 'El lente del dinero — costo, composición y pago por entidad' : 'The money lens — cost, composition, and per-entity payout',
      periodTotal: isSpanish ? 'Costo total del período' : 'Total Compensation',
      cumulative: isSpanish ? 'Costo acumulado' : 'Cumulative Cost',
      cumulativeHint: isSpanish ? 'todos los períodos calculados' : 'across all calculated periods',
      avgPerEntity: isSpanish ? 'Costo prom. por entidad' : 'Avg Cost / Entity',
      avgHint: isSpanish ? 'por entidad pagada' : 'per entity paid',
      entitiesPaid: isSpanish ? 'Entidades pagadas' : 'Entities Paid',
      entitiesHint: isSpanish ? 'con resultados este período' : 'with outcomes this period',
      noPriorPeriod: isSpanish ? 'sin período anterior' : 'no prior period',
      costPctTitle: isSpanish ? 'Costo como % del resultado' : 'Cost as % of Outcome',
      costPctEmpty: isSpanish ? 'Datos de ingresos no configurados' : 'Revenue data not configured',
      costPctEmptyBody: isSpanish
        ? 'El costo como porcentaje del resultado requiere datos de ingresos, que no están configurados para este inquilino.'
        : 'Cost as a percentage of outcome requires revenue data, which is not configured for this tenant.',
      compositionTitle: isSpanish ? 'Composición por Componente' : 'Compensation by Component',
      compositionDesc: isSpanish ? 'Dónde se asigna el pago del período' : 'Where the period payout is allocated',
      pivotDesc: isSpanish ? 'Costo por dimensión, vs. el promedio de los segmentos' : 'Cost by dimension, vs the average slice',
      distTitle: isSpanish ? 'Distribución de Pagos' : 'Payout Distribution',
      distDesc: isSpanish ? 'Forma de la población con referencia de cuartiles + media' : 'Population shape with quartile + mean reference',
      planHealthTitle: isSpanish ? 'Salud del Plan' : 'Plan Health',
      planHealthDesc: isSpanish ? 'Diagnósticos automáticos del plan de compensación' : 'Automated compensation-plan diagnostics',
      planHealthStub: isSpanish ? 'Diagnósticos de salud del plan próximamente' : 'Plan health diagnostics coming soon',
      planHealthStubDesc: isSpanish
        ? 'Agrupación de umbrales, irrelevancia de componentes y saturación de topes — análisis impulsado por IA, en construcción.'
        : 'Threshold clustering, component irrelevance, and cap saturation — AI-driven analysis, not yet built.',
      entityTitle: isSpanish ? 'Pago por Entidad' : 'Payout by Entity',
      entityDesc: isSpanish ? 'Detalle calculado por entidad (busca, ordena, desglosa)' : 'Calculated per-entity detail (search, sort, drill down)',
      noResults: isSpanish ? 'Sin resultados de cálculo' : 'No calculation results yet',
      noResultsBody: isSpanish
        ? 'Los pagos de comisiones aparecerán aquí una vez que se ejecuten los cálculos para este inquilino.'
        : 'Commission payouts will appear here once calculations have been run for this tenant.',
      avgSlice: isSpanish ? 'Prom.' : 'Avg',
    };

    // Derived ICM money-lens metrics — all from clean reads.
    const entityCount = entityResults.length;
    const avgPerEntity = entityCount > 0 ? periodTotal / entityCount : 0;
    const cumulativeTotal = trend.reduce((s, p) => s + p.total, 0);
    const distributionValues = entityResults.map((r) => r.totalPayout || 0);

    // HeroMetric reference frame: prior-period delta from the cross-period trend.
    const trendIdx = trend.findIndex((p) => p.period_id === selectedPeriodId);
    const priorPoint = trendIdx > 0 ? trend[trendIdx - 1] : undefined;
    const delta = priorPoint && priorPoint.total > 0 ? (periodTotal - priorPoint.total) / priorPoint.total : null;
    const heroContext = {
      direction: (delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
      label: delta == null ? t.noPriorPeriod : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}% vs ${priorPoint?.label ?? ''}`,
    };

    // Dimension pivot bars + reference line = average slice.
    const pivotBars = dimensionSlices.map((s) => ({ label: s.value, value: s.total_payout }));
    const avgSliceValue = dimensionSlices.length > 0
      ? dimensionSlices.reduce((acc, s) => acc + s.total_payout, 0) / dimensionSlices.length
      : 0;

    // Loading shell (PRESERVED pattern).
    if (compLoading && !periodsLoaded) {
      return (
        <PersonaAmbient>
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
              <p className={TEXT.body}>Loading intelligence…</p>
            </div>
          </div>
        </PersonaAmbient>
      );
    }

    // No calculated periods → honest onboarding (PRESERVED empty branch).
    if (periodsLoaded && periods.length === 0) {
      return (
        <PersonaAmbient>
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <DollarSign className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>{t.noResults}</h1>
            <p className={`mx-auto mt-2 max-w-md ${TEXT.body}`}>{t.noResultsBody}</p>
            <Link href="/operate" className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
              <Target className="h-4 w-4" /> {isSpanish ? 'Ir a Compensación' : 'Go to Compensation'}
            </Link>
          </div>
        </PersonaAmbient>
      );
    }

    return (
      <PersonaAmbient>
        <div className="space-y-6">
          <header>
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>{t.heading}</h1>
            <p className={`mt-1 text-sm ${TEXT.body}`}>
              {t.sub}
              {/* HF-344: whole-population entity count is admin-only */}
              {hasResults ? (theme.persona === 'admin' ? ` · ${entityCount} ${isSpanish ? 'entidades' : 'entities'} · ${selectedLabel}` : (selectedLabel ? ` · ${selectedLabel}` : '')) : ''}
            </p>
          </header>

          {/* HF-344: PeriodCards (per-period totals) + the money-lens composition below read
              getPeriodTotal/getComponentTotals/getEntityResults(ALL_INSIGHTS_SCOPE) → admin-only.
              Rep/manager get a reduced state. Admin branch byte-identical (DD-7). */}
          {theme.persona === 'admin' ? (
          <>
          {periods.length > 0 && (
            <PeriodCards
              periods={periods}
              selectedPeriodId={selectedPeriodId}
              onPeriodChange={setSelectedPeriodId}
              accentColor={theme.accent}
              accentSoft={theme.accentSoft}
            />
          )}

          {compLoading || !hasResults ? (
            <Panel>
              <div className={`py-16 text-center text-sm ${TEXT.muted}`}>
                {compLoading ? (isSpanish ? 'Cargando período…' : 'Loading period…') : t.noResultsBody}
              </div>
            </Panel>
          ) : (
            <>
              {/* Dominant: Total Compensation (cost efficiency) + supporting cost tiles */}
              <div className="grid gap-4 lg:grid-cols-4">
                <div className="lg:col-span-1">
                  <HeroMetric
                    label={t.periodTotal}
                    value={periodTotal}
                    format={format}
                    icon={DollarSign}
                    context={heroContext}
                    subtitle={`${entityCount} ${isSpanish ? 'entidades' : 'entities'} · ${isSpanish ? 'prom.' : 'avg'} ${format(avgPerEntity)}`}
                  />
                </div>
                <Stat label={t.cumulative} value={format(cumulativeTotal)} hint={t.cumulativeHint} icon={TrendingUp} />
                <Stat label={t.avgPerEntity} value={format(avgPerEntity)} hint={t.avgHint} icon={Target} />
                <Stat label={t.entitiesPaid} value={String(entityCount)} hint={t.entitiesHint} icon={Users} />
              </div>

              {/* Cost % of outcome — HONEST EMPTY (no revenue data for BCL). Never fabricate. */}
              <Panel title={t.costPctTitle} description={t.costPctEmpty}>
                <div className={`flex items-center gap-2 py-6 text-sm ${TEXT.muted}`}>
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  <span>{t.costPctEmptyBody}</span>
                </div>
              </Panel>

              {/* Composition + dimension pivot */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title={t.compositionTitle} description={t.compositionDesc}>
                  <StackedBar
                    segments={componentTotals.map((c) => ({ label: c.component_name, value: c.total_amount }))}
                    total={periodTotal}
                    format={format}
                  />
                </Panel>

                <Panel
                  title={dimensionLabel ? `${isSpanish ? 'Costo por' : 'Cost by'} ${dimensionLabel}` : (isSpanish ? 'Costo por Dimensión' : 'Cost by Dimension')}
                  description={t.pivotDesc}
                >
                  <HorizontalBar
                    items={pivotBars}
                    referenceLine={{ value: avgSliceValue, label: t.avgSlice }}
                    format={format}
                    maxRows={8}
                    emptyLabel={isSpanish ? 'Sin dimensión pivotable.' : 'No pivotable dimension.'}
                  />
                </Panel>
              </div>

              {/* Population shape — admin/manager density (pay-for-performance lens) */}
              <DensityGate min="medium">
                <Panel title={t.distTitle} description={t.distDesc}>
                  <DistributionPosition data={distributionValues} markers={{ quartiles: true, mean: true }} format={format} />
                </Panel>
              </DensityGate>

              {/* Plan health — AI diagnostics NOT built (thermostat honesty: StubAction, disabled) */}
              <DensityGate min="high">
                <Panel title={t.planHealthTitle} description={t.planHealthDesc} action={<ShieldCheck className="h-4 w-4" style={{ color: theme.accent }} />}>
                  <StubAction
                    label={t.planHealthStub}
                    description={t.planHealthStubDesc}
                    icon={ShieldCheck}
                  />
                </Panel>
              </DensityGate>

              {/* Entity drill detail — reached by drill, not dominant (Interaction Reveals Depth) */}
              <DensityGate min="medium">
                <Panel title={t.entityTitle} description={t.entityDesc} flush>
                  <div className="px-4 pb-4 sm:px-5">
                    <EntityTable
                      tenantId={tenantId}
                      periodId={selectedPeriodId}
                      periodLabel={selectedLabel !== '—' ? selectedLabel : undefined}
                    />
                  </div>
                </Panel>
              </DensityGate>
            </>
          )}
          </>
          ) : (
            <Panel>
              <div className={`py-16 text-center text-sm ${TEXT.muted}`}>
                {isSpanish
                  ? 'Los totales de compensación de toda la organización están disponibles para administradores.'
                  : 'Tenant-wide compensation totals are available to administrators.'}{' '}
                <Link href="/perform" className="underline">{isSpanish ? 'Ver mi desempeño →' : 'View your performance →'}</Link>
              </div>
            </Panel>
          )}
        </div>
      </PersonaAmbient>
    );
  }

  // ── Hospitality / RestaurantMX Rep View (PRESERVED branch) ──────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">No hay datos disponibles</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" />
          Compensation - My Franchise
        </h1>
        <p className="text-muted-foreground">
          {data.currentFranquicia?.nombre || currentFranquiciaId}
          {data.currentMesero && (
            <span className="ml-2 text-sm">• {data.currentMesero.nombre}</span>
          )}
        </p>
      </div>

      {/* Total Sales Hero Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Total Period Sales</p>
              <p className="text-4xl font-bold mt-1">{format(data.myTotal)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {data.myCheckCount} checks served
              </p>
            </div>
            <div className="p-4 bg-primary/10 rounded-full">
              <TrendingUp className="h-12 w-12 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
                <Utensils className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Alimentos</p>
                <p className="text-lg font-bold">{format(data.myFood)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/30">
                <Wine className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bebidas</p>
                <p className="text-lg font-bold">{format(data.myBeverage)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg dark:bg-yellow-900/30">
                <Coins className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tips</p>
                <p className="text-lg font-bold text-green-600">{format(data.myTips)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg dark:bg-purple-900/30">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Commission ({((data.currentMesero?.commission_rate || 0.02) * 100).toFixed(1)}%)</p>
                <p className="text-lg font-bold text-purple-600">{format(data.myCommission)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Goal Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Goal Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoalProgressBar
              current={data.myTotal}
              target={data.target}
              label="Period goal"
              size="lg"
            />
            <div className="pt-4 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Faltan para la meta:</span>
                <span className="font-bold">
                  {data.myTotal >= data.target ? (
                    <span className="text-green-600">Goal reached!</span>
                  ) : (
                    format(data.target - data.myTotal)
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Position */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              My Ranking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-6xl font-bold text-primary">#{data.myRank}</p>
              <p className="text-muted-foreground mt-2">
                of {data.totalFranquicias} franchises
              </p>
              {data.myRank <= 3 && (
                <Badge className="mt-3 bg-yellow-100 text-yellow-700">
                  Top 3
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Leaderboard
        items={data.franchiseRanking.slice(0, 7)}
        title="Franchise Ranking"
        highlightId={currentFranquiciaId}
        showChange={false}
      />

      {/* Sales History Chart */}
      <SalesHistoryChart data={data.historyData} />
    </div>
  );
}
