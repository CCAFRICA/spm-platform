'use client';

/**
 * OB-234 T2 — Compensation Dashboard (/perform). The result-of-record surface: the hero reads
 * getPeriodTotal for the SELECTED period (PeriodCards), so the legacy "$46,291/$58,406 split" is dead —
 * one authoritative number per period, sourced from the End-State A clean path (calculation_results /
 * entity_period_outcomes via @/lib/insights + @/lib/drill-through). Zero committed_data, zero raw
 * re-aggregation. The DS-003 redesign targets the ICM/compensation view; the financial-tenant,
 * onboarding, ICM-not-yet-calculated, loading, and FinancialPerformanceBanner branches are preserved.
 *
 * DS-003 composition (ICM view): HeroMetric (Identification, dominant) + IntelligenceElement (DS-015,
 * G2) + ValidityVerdict (G4, SAME component+source as /stream) + StackedBar (part-of-whole) +
 * DistributionPosition (population ranking, admin density) + ConfigurablePipeline (lifecycle). 6 DS-003
 * component types (Diversity Minimum ≥3). Every viz carries a reference frame. AI findings are an honest
 * StubAction — no fabricated intelligence output exists on this page.
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Award, DollarSign, Sparkles, Target, Users } from 'lucide-react';
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-313: Vialuce page-template adoption (else-branch unchanged)
import { usePersona } from '@/contexts/persona-context';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { RepDashboard } from '@/components/dashboards/RepDashboard';
import { useTenant, useCurrency, useFeature } from '@/contexts/tenant-context';
import { useSession } from '@/contexts/session-context';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import {
  getCalculatedPeriods,
  getPeriodTotal,
  getComponentTotals,
  getBatchValidity,
  ALL_INSIGHTS_SCOPE,
  type PeriodSummary,
  type ComponentTotal,
  type ValidityVerdict as Verdict,
} from '@/lib/insights';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { PeriodCards } from '@/components/insights';
import {
  PersonaAmbient,
  DensityGate,
  usePersonaTheme,
  HeroMetric,
  StackedBar,
  DistributionPosition,
  ConfigurablePipeline,
  IntelligenceElement,
  ValidityVerdict,
  StubAction,
  Panel,
  TEXT,
  signedPct,
  type PipelineStage,
} from '@/components/insights/ds003';

// ─── Types ────────────────────────────────────────────────────

interface FinancialSummary {
  netRevenue: number;
  activeLocations: number;
  totalLocations: number;
  checksServed: number;
  brandCount: number;
  avgCheck: number;
  tipRate: number;
  leakageRate: number;
}

// ─── Compact supporting stat tile (carries data; not a DS-003 type) ──────────────

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof Users }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${TEXT.body}`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TEXT.headline}`}>{value}</div>
      <div className={`text-xs ${TEXT.muted}`}>{hint}</div>
    </div>
  );
}

// ─── Lifecycle → pipeline stages (the lifecycle_state IS the reference frame) ────

const LIFECYCLE_SEQUENCE = ['draft', 'calculated', 'review', 'approved', 'paid'] as const;
const LIFECYCLE_LABEL: Record<string, string> = {
  draft: 'Draft',
  calculated: 'Calculated',
  review: 'In Review',
  approved: 'Approved',
  paid: 'Paid',
};

function buildLifecycleStages(state: string | null): PipelineStage[] {
  const normalized = (state ?? '').toLowerCase().trim();
  // If the period has results at all, the run has at least calculated. Index by sequence position.
  let currentIdx = LIFECYCLE_SEQUENCE.findIndex((s) => normalized.includes(s));
  if (currentIdx < 0) currentIdx = 1; // unknown/null lifecycle but results exist → at least "Calculated"
  return LIFECYCLE_SEQUENCE.map((s, i) => ({
    label: LIFECYCLE_LABEL[s],
    status: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'future',
  }));
}

// ─── Main Page ────────────────────────────────────────────────

export default function PerformPage() {
  const router = useRouter();
  const isVialuce = useIsVialuce(); // HF-313: preserved for non-DS-003 branches (financial-only cards)
  const { persona } = usePersona();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const { ruleSetCount, entityCount: sessionEntityCount } = useSession();
  const theme = usePersonaTheme();
  const hasFinancial = useFeature('financial');
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = (user && isVLAdmin(user)) ? false : isSpanishLocale(locale);
  const hasICM = ruleSetCount > 0;
  const tenantId = currentTenant?.id ?? '';

  // ── ICM clean-path state (End-State A) ──
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [periodTotal, setPeriodTotal] = useState<number | null>(null);
  const [componentTotals, setComponentTotals] = useState<ComponentTotal[]>([]);
  const [rows, setRows] = useState<EntityResult[]>([]);
  const [validity, setValidity] = useState<Verdict | null>(null);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [periodDataLoading, setPeriodDataLoading] = useState(false);

  // ── Financial substrate (separate; preserved) ──
  const [financialData, setFinancialData] = useState<FinancialSummary | null>(null);
  const [financialLoading, setFinancialLoading] = useState(true);

  // Load calculated periods (ICM clean path).
  useEffect(() => {
    if (!tenantId || !hasICM) {
      setPeriodsLoaded(true);
      return;
    }
    let cancelled = false;
    getCalculatedPeriods(tenantId)
      .then((ps) => {
        if (cancelled) return;
        setPeriods(ps);
        setSelectedPeriodId(ps[0]?.period_id ?? '');
        setPeriodsLoaded(true);
      })
      .catch((err) => { console.warn('[Perform] periods load failed:', err); if (!cancelled) setPeriodsLoaded(true); });
    return () => { cancelled = true; };
  }, [tenantId, hasICM]);

  // Load selected-period data (period total, component totals, entity results, batch validity).
  useEffect(() => {
    if (!tenantId || !selectedPeriodId) return;
    let cancelled = false;
    setPeriodDataLoading(true);
    Promise.all([
      getPeriodTotal(tenantId, selectedPeriodId),
      getComponentTotals(tenantId, selectedPeriodId),
      getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId: selectedPeriodId }),
      getBatchValidity(tenantId, selectedPeriodId),
    ])
      .then(([total, ct, rs, v]) => {
        if (cancelled) return;
        setPeriodTotal(total);
        setComponentTotals(ct);
        setRows(rs);
        setValidity(v);
        setPeriodDataLoading(false);
      })
      .catch((err) => { console.warn('[Perform] period data load failed:', err); if (!cancelled) setPeriodDataLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, selectedPeriodId]);

  // Load financial substrate (preserved restaurant/financial path — NOT calc data).
  useEffect(() => {
    if (!tenantId || !hasFinancial) {
      setFinancialLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/financial/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, view: 'network_pulse' }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.networkMetrics) {
          setFinancialData({
            netRevenue: data.networkMetrics.netRevenue ?? 0,
            activeLocations: data.networkMetrics.activeLocations ?? 0,
            totalLocations: data.networkMetrics.totalLocations ?? 0,
            checksServed: data.networkMetrics.checksServed ?? 0,
            brandCount: data.brands?.length ?? 0,
            avgCheck: data.networkMetrics.avgCheck ?? 0,
            tipRate: data.networkMetrics.tipRate ?? 0,
            leakageRate: data.networkMetrics.leakageRate ?? 0,
          });
        }
        setFinancialLoading(false);
      })
      .catch(() => { if (!cancelled) setFinancialLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, hasFinancial]);

  const noModules = !hasICM && !hasFinancial;

  const selectedIdx = useMemo(
    () => periods.findIndex((p) => p.period_id === selectedPeriodId),
    [periods, selectedPeriodId],
  );

  // Derived ICM insights for the SELECTED period (hero, prior-delta, distribution).
  const insights = useMemo(() => {
    if (periodTotal == null) return null;
    const entityCount = rows.length;
    const avgPayout = entityCount > 0 ? periodTotal / entityCount : 0;
    const sorted = [...rows].sort((a, b) => (b.totalPayout || 0) - (a.totalPayout || 0));
    const prior = selectedIdx >= 0 ? periods[selectedIdx + 1] : undefined;
    const priorTotal = prior?.total_payout ?? null;
    const delta = priorTotal != null && priorTotal > 0 ? (periodTotal - priorTotal) / priorTotal : null;
    return {
      total: periodTotal,
      avgPayout,
      entityCount,
      top: sorted[0] ?? null,
      values: rows.map((r) => r.totalPayout || 0),
      delta,
      priorLabel: prior?.label ?? null,
    };
  }, [periodTotal, rows, periods, selectedIdx]);

  const selectedPeriod = selectedIdx >= 0 ? periods[selectedIdx] : undefined;
  const selectedLabel = selectedPeriod?.label ?? '';

  const hasICMResults = hasICM && periodsLoaded && periods.length > 0;

  const performTitle = persona === 'admin'
    ? (isSpanish ? 'Resumen de Compensación' : 'Compensation Dashboard')
    : persona === 'manager'
      ? (isSpanish ? 'Compensación del Equipo' : 'Team Compensation')
      : (isSpanish ? 'Mi Compensación' : 'My Compensation');

  // ── No tenant ──
  if (!currentTenant) {
    return (
      <PersonaAmbient>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className={TEXT.body}>{isSpanish ? 'Selecciona un tenant.' : 'Select a tenant to view your dashboard.'}</p>
        </div>
      </PersonaAmbient>
    );
  }

  // ── Loading shell (initial) ──
  const initialLoading = (hasICM && !periodsLoaded) || (hasFinancial && !hasICM && financialLoading);
  if (initialLoading) {
    return (
      <PersonaAmbient>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
            <p className={TEXT.body}>{isSpanish ? 'Cargando compensación…' : 'Loading compensation…'}</p>
          </div>
        </div>
      </PersonaAmbient>
    );
  }

  // ── Branch 1: No modules at all (preserved) ──
  if (noModules) {
    return (
      <PersonaAmbient>
        <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
          <header>
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>{performTitle}</h1>
            <p className={`mt-1 text-sm ${TEXT.body}`}>{currentTenant.name}</p>
          </header>
          <Panel>
            <div className="py-12 text-center">
              <Target className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
              <h3 className={`text-lg font-semibold ${TEXT.headline}`}>
                {isSpanish ? 'Sin datos de compensación' : 'No compensation data yet'}
              </h3>
              <p className={`mx-auto mt-2 max-w-md text-sm ${TEXT.body}`}>
                {isSpanish
                  ? 'Importa tus planes y datos desde Compensación para ver resultados aquí.'
                  : 'Import your plans and data from Compensation to see results here.'}
              </p>
              <button
                onClick={() => router.push('/operate')}
                className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: theme.accentSoft, color: theme.accent }}
              >
                {isSpanish ? 'Ir a Compensación' : 'Go to Compensation'}
              </button>
            </div>
          </Panel>
        </div>
      </PersonaAmbient>
    );
  }

  // ── Branch 2: Financial-only tenant — preserved (NOT "no compensation results") ──
  if (!hasICM && hasFinancial) {
    return (
      <PersonaAmbient>
        <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
          <header>
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>{performTitle}</h1>
            <p className={`mt-1 text-sm ${TEXT.body}`}>{currentTenant.name}</p>
          </header>
          <FinancialOnlyPerformance
            data={financialData}
            isVialuce={isVialuce}
            isSpanish={isSpanish}
            formatCurrency={formatCurrency}
            onNavigate={(href) => router.push(href)}
          />
        </div>
      </PersonaAmbient>
    );
  }

  // ── Branch 3: ICM configured but no calculated periods (preserved "ready to calculate") ──
  if (hasICM && periodsLoaded && periods.length === 0) {
    return (
      <PersonaAmbient>
        <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
          <header>
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>{performTitle}</h1>
            <p className={`mt-1 text-sm ${TEXT.body}`}>{currentTenant.name}</p>
          </header>

          {/* Dual-module: preserve the financial banner */}
          {hasFinancial && financialData && (
            <FinancialPerformanceBanner
              data={financialData}
              persona={persona}
              isSpanish={isSpanish}
              formatCurrency={formatCurrency}
              onNavigate={(href) => router.push(href)}
            />
          )}

          <Panel>
            <div className="py-12 text-center">
              <Target className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
              <h3 className={`text-lg font-semibold ${TEXT.headline}`}>
                {isSpanish ? 'Listo para calcular' : 'Ready to calculate'}
              </h3>
              <p className={`mx-auto mt-2 max-w-md text-sm ${TEXT.body}`}>
                {isSpanish
                  ? `${ruleSetCount} plan${ruleSetCount > 1 ? 'es' : ''} configurado${ruleSetCount > 1 ? 's' : ''} con ${sessionEntityCount.toLocaleString()} entidades. Ejecuta un cálculo desde Compensación para ver resultados.`
                  : `${ruleSetCount} plan${ruleSetCount > 1 ? 's' : ''} configured with ${sessionEntityCount.toLocaleString()} entities. Run a calculation from Compensation to see results.`}
              </p>
              <button
                onClick={() => router.push('/operate')}
                className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: theme.accentSoft, color: theme.accent }}
              >
                {isSpanish ? 'Ir a Calcular' : 'Go to Calculate'}
              </button>
            </div>
          </Panel>
        </div>
      </PersonaAmbient>
    );
  }

  // ── Branch 4: ICM with results — DS-003 compensation dashboard ──
  return (
    <PersonaAmbient>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header>
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>{performTitle}</h1>
          <p className={`mt-1 text-sm ${TEXT.body}`}>
            {currentTenant.name}
            {insights ? ` · ${insights.entityCount} ${isSpanish ? 'entidades' : 'entities'} · ${selectedLabel}` : ''}
          </p>
        </header>

        {/* Dual-module: preserve the financial banner above the compensation view */}
        {hasFinancial && financialData && (
          <FinancialPerformanceBanner
            data={financialData}
            persona={persona}
            isSpanish={isSpanish}
            formatCurrency={formatCurrency}
            onNavigate={(href) => router.push(href)}
          />
        )}

        {hasICMResults && (
          <PeriodCards
            periods={periods}
            selectedPeriodId={selectedPeriodId}
            onPeriodChange={setSelectedPeriodId}
            accentColor={theme.accent}
            accentSoft={theme.accentSoft}
          />
        )}

        {periodDataLoading || !insights ? (
          <Panel>
            <div className={`py-16 text-center text-sm ${TEXT.muted}`}>
              {periodDataLoading
                ? (isSpanish ? 'Cargando periodo…' : 'Loading period…')
                : (isSpanish ? 'Sin resultados para este periodo.' : 'No outcomes for this period.')}
            </div>
          </Panel>
        ) : (
          <>
            {/* Dominant: authoritative Period Total + supporting tiles */}
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <HeroMetric
                  label={isSpanish ? 'Total del Periodo' : 'Period Total'}
                  value={insights.total}
                  format={formatCurrency}
                  icon={DollarSign}
                  context={{
                    direction: insights.delta == null ? 'flat' : insights.delta > 0 ? 'up' : insights.delta < 0 ? 'down' : 'flat',
                    label: insights.delta == null
                      ? (isSpanish ? 'sin periodo previo' : 'no prior period')
                      : `${signedPct(insights.delta)} ${isSpanish ? 'vs' : 'vs'} ${insights.priorLabel}`,
                  }}
                  subtitle={`${insights.entityCount} ${isSpanish ? 'entidades · prom' : 'entities · avg'} ${formatCurrency(insights.avgPayout)}`}
                />
              </div>
              <Stat
                label={isSpanish ? 'Entidades Pagadas' : 'Entities Paid'}
                value={String(insights.entityCount)}
                hint={isSpanish ? 'con resultados este periodo' : 'with outcomes this period'}
                icon={Users}
              />
              <Stat
                label={isSpanish ? 'Pago Promedio' : 'Average Payout'}
                value={formatCurrency(insights.avgPayout)}
                hint={isSpanish ? 'por entidad' : 'per entity'}
                icon={Target}
              />
              <Stat
                label={isSpanish ? 'Mejor Resultado' : 'Top Result'}
                value={insights.top ? formatCurrency(insights.top.totalPayout || 0) : '—'}
                hint={insights.top?.displayName ?? '—'}
                icon={Award}
              />
            </div>

            {/* G2: the headline finding as a Five-Elements intelligence card (real navigate action) */}
            <IntelligenceElement
              label={isSpanish ? 'Hallazgo del Periodo' : 'Period Finding'}
              value={formatCurrency(insights.total)}
              icon={DollarSign}
              comparison={insights.delta == null
                ? (isSpanish ? 'Primer periodo calculado' : 'First calculated period')
                : `${signedPct(insights.delta)} ${isSpanish ? 'frente a' : 'vs'} ${insights.priorLabel}`}
              comparisonTone={insights.delta == null ? 'neutral' : insights.delta > 0 ? 'positive' : insights.delta < 0 ? 'negative' : 'neutral'}
              context={isSpanish
                ? `Total de compensación para ${selectedLabel} en ${insights.entityCount} entidades (promedio ${formatCurrency(insights.avgPayout)}).`
                : `Compensation total for ${selectedLabel} across ${insights.entityCount} entities (avg ${formatCurrency(insights.avgPayout)}).`}
              impact={isSpanish
                ? 'Revisa y aprueba el lote antes de la firma.'
                : 'Review and approve the batch before sign-off.'}
              action={{ label: isSpanish ? 'Ir a Compensación' : 'Go to Compensation', href: '/operate' }}
            />

            {/* G4: THE data-quality verdict — SAME component + source as /stream */}
            {validity && (
              <Panel
                title={isSpanish ? 'Calidad de Datos' : 'Data Quality'}
                description={isSpanish ? 'Veredicto único del lote de cálculo' : 'The single calculation-batch verdict'}
              >
                <ValidityVerdict verdict={validity} variant="card" />
              </Panel>
            )}

            {/* Composition: where the period's payout is allocated (part-of-whole) */}
            <Panel
              title={isSpanish ? 'Compensación por Componente' : 'Compensation by Component'}
              description={isSpanish ? 'Cómo se asigna el pago del periodo' : "Where the period's payout is allocated"}
            >
              <StackedBar
                segments={componentTotals.map((c) => ({ label: c.component_name, value: c.total_amount }))}
                total={insights.total}
                format={formatCurrency}
                emptyLabel={isSpanish ? 'Sin datos de componentes.' : 'No component data.'}
              />
            </Panel>

            {/* Population shape — admin density (high) */}
            <DensityGate min="high">
              <Panel
                title={isSpanish ? 'Distribución de Pagos' : 'Payout Distribution'}
                description={isSpanish ? 'Forma de la población con referencia de cuartiles y media' : 'Population shape with quartile + mean reference'}
              >
                <DistributionPosition
                  data={insights.values}
                  markers={{ quartiles: true, mean: true }}
                  format={formatCurrency}
                  emptyLabel={isSpanish ? 'Sin datos de población.' : 'No population data.'}
                />
              </Panel>
            </DensityGate>

            {/* Lifecycle: where this period sits in the comp run, next action to Compensation */}
            <Panel
              title={isSpanish ? 'Ciclo de Vida del Periodo' : 'Period Lifecycle'}
              description={isSpanish ? 'Posición del periodo en la ejecución de compensación' : "This period's position in the compensation run"}
            >
              <ConfigurablePipeline
                stages={buildLifecycleStages(selectedPeriod?.lifecycle_state ?? null)}
                action={{ label: isSpanish ? 'Ir a Compensación' : 'Go to Compensation', href: '/operate' }}
              />
            </Panel>

            {/* Intelligence findings — honest stub (no real AI intelligence output on this surface) */}
            <DensityGate min="high">
              <Panel title={isSpanish ? 'Hallazgos de IA' : 'AI Findings'}>
                <StubAction
                  label={isSpanish ? 'Hallazgos de IA' : 'AI findings'}
                  description={isSpanish
                    ? 'El análisis de salud del plan (saturación de topes, irrelevancia de componentes) llegará pronto.'
                    : 'AI findings coming soon — plan-health analysis (cap saturation, component irrelevance).'}
                  icon={Sparkles}
                />
              </Panel>
            </DensityGate>

            {/* Persona dashboards — preserved drill-through / persona depth (null-data guard) */}
            {insights.total > 0 && (
              <DensityGate min="low">
                {persona === 'admin' && <AdminDashboard />}
                {persona === 'manager' && <ManagerDashboard />}
                {persona === 'rep' && <RepDashboard />}
              </DensityGate>
            )}
          </>
        )}
      </div>
    </PersonaAmbient>
  );
}

// ─── Financial Performance Banner (dual-module, compact) — preserved ──────────

interface FinancialBannerProps {
  data: FinancialSummary;
  persona: string;
  isSpanish: boolean;
  formatCurrency: (n: number) => string;
  onNavigate: (href: string) => void;
}

function FinancialPerformanceBanner({ data, persona, isSpanish, formatCurrency, onNavigate }: FinancialBannerProps) {
  const hasLeakageAlert = data.leakageRate > 2;

  const summaryText = persona === 'admin'
    ? (isSpanish
      ? `Red: ${data.activeLocations} ubicaciones, ${formatCurrency(data.netRevenue)} ingresos, ${data.brandCount} marca${data.brandCount !== 1 ? 's' : ''}`
      : `Network: ${data.activeLocations} locations, ${formatCurrency(data.netRevenue)} revenue, ${data.brandCount} brand${data.brandCount !== 1 ? 's' : ''}`)
    : persona === 'manager'
      ? (isSpanish
        ? `${data.activeLocations} ubicaciones activas, promedio por cheque ${formatCurrency(data.avgCheck)}`
        : `${data.activeLocations} active locations, avg check ${formatCurrency(data.avgCheck)}`)
      : (isSpanish
        ? `Propina ${data.tipRate.toFixed(1)}%, cheque promedio ${formatCurrency(data.avgCheck)}`
        : `Tip rate ${data.tipRate.toFixed(1)}%, avg check ${formatCurrency(data.avgCheck)}`);

  return (
    <div className="overflow-hidden rounded-lg" style={{ background: 'rgba(234, 179, 8, 0.06)', border: '1px solid rgba(234, 179, 8, 0.15)' }}>
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
          <div>
            <span className="text-xs font-medium text-slate-300">
              {isSpanish ? 'Finanzas' : 'Financial'}
            </span>
            <span className="ml-2 text-xs text-slate-500">{summaryText}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasLeakageAlert && (
            <span className="text-[11px] text-amber-300">
              {isSpanish ? `Fuga ${data.leakageRate.toFixed(1)}%` : `Leakage ${data.leakageRate.toFixed(1)}%`}
            </span>
          )}
          <button
            onClick={() => onNavigate('/financial')}
            className="text-[11px] font-medium"
            style={{ color: '#60a5fa' }}
          >
            {isSpanish ? 'Ver detalle →' : 'View details →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Financial-Only Performance View — preserved ──────────────────────────────

interface FinancialOnlyProps {
  data: FinancialSummary | null;
  isVialuce: boolean;
  isSpanish: boolean;
  formatCurrency: (n: number) => string;
  onNavigate: (href: string) => void;
}

function FinancialOnlyPerformance({ data, isVialuce, isSpanish, formatCurrency, onNavigate }: FinancialOnlyProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const stats = [
    { value: formatCurrency(data.netRevenue), label: isSpanish ? 'Ingresos Netos' : 'Net Revenue' },
    { value: `${data.activeLocations}/${data.totalLocations}`, label: isSpanish ? 'Ubicaciones' : 'Locations' },
    { value: data.checksServed.toLocaleString(), label: isSpanish ? 'Cheques' : 'Checks' },
    { value: formatCurrency(data.avgCheck), label: isSpanish ? 'Cheque Promedio' : 'Avg Check' },
    { value: `${data.tipRate.toFixed(1)}%`, label: isSpanish ? 'Tasa de Propina' : 'Tip Rate' },
    { value: `${data.leakageRate.toFixed(1)}%`, label: isSpanish ? 'Fuga' : 'Leakage', alert: data.leakageRate > 2 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg px-5 py-4"
            style={isVialuce ? {
              background: stat.alert ? 'var(--vl-gold-50)' : 'var(--vl-surface)',
              border: stat.alert ? '1px solid var(--vialuce-gold)' : '1px solid var(--vl-line)',
            } : {
              background: stat.alert ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.5)',
              border: stat.alert ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(30, 41, 59, 0.8)',
            }}
          >
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{stat.label}</p>
            <p className={`mt-1 text-lg font-semibold ${stat.alert ? 'text-amber-300' : 'text-slate-100'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 px-5 py-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">
          {isSpanish ? 'Acciones Rápidas' : 'Quick Actions'}
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            { label: isSpanish ? 'Panel Financiero' : 'Financial Dashboard', href: '/financial' },
            { label: isSpanish ? 'Pulso de Red' : 'Network Pulse', href: '/financial/pulse' },
            { label: isSpanish ? 'Rendimiento' : 'Benchmarks', href: '/financial/performance' },
            { label: isSpanish ? 'Personal' : 'Staff', href: '/financial/staff' },
          ].map((action) => (
            <button
              key={action.href}
              onClick={() => onNavigate(action.href)}
              className="text-sm font-medium"
              style={{ color: '#60a5fa' }}
            >
              → {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
