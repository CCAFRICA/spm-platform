'use client';

/**
 * Operate Landing — Pipeline Readiness Cockpit (OB-108)
 *
 * Replaces the OB-105 Module Health Bloodwork Dashboard with
 * an intelligence-driven operations cockpit:
 *
 * 1. Pipeline Readiness Gauge — 4-step visual (Plans→Roster→Data→Calculate)
 * 2. Module Summary Cards — ICM/Financial with health dots + real counts
 * 3. Deterministic Commentary — template + data paragraph
 * 4. Quick Action — single CTA for the most important next step
 *
 * CLT-102 F-2: "Operate landing underwhelming"
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant, useCurrency, useFeature } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { useSession } from '@/contexts/session-context';
import { isVLAdmin } from '@/types/auth';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle2,
  Circle,
  FileUp,
  Users,
  Upload,
  Calculator,
  BarChart3,
  ArrowRight,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

type StepStatus = 'complete' | 'ready' | 'needed' | 'blocked';

interface PipelineStep {
  label: string;
  labelEs: string;
  status: StepStatus;
  detail: string;
  detailEs: string;
  action: { label: string; labelEs: string; href: string } | null;
}

type ModuleHealth = 'healthy' | 'attention' | 'setup_needed';

interface ModuleCard {
  key: string;
  title: string;
  titleEs: string;
  subtitle: string;
  subtitleEs: string;
  health: ModuleHealth;
  stats: Array<{ label: string; labelEs: string; value: string }>;
  actions: Array<{ label: string; labelEs: string; href: string }>;
}

interface PipelineData {
  plans: Array<{ id: string; name: string; status: string }>;
  entityCount: number;
  dataRowCount: number;
  periods: Array<{ id: string; label: string | null; start_date: string; end_date: string }>;
  latestBatch: { id: string; status: string; created_at: string; summary: Record<string, unknown> | null } | null;
  financialData: {
    hasData: boolean;
    locationCount: number;
    brandCount: number;
    chequeCount: number;
    revenue: number;
    flaggedLocations: number;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────

// PDR-01: No cents on amounts ≥ MX$10K
function formatCompactCurrency(amount: number, symbol: string): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${symbol}${Math.round(amount).toLocaleString()}`;
  return `${symbol}${amount.toFixed(2)}`;
}

function formatDate(dateStr: string, isSpanish: boolean): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function shortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Pipeline Step Builder ───────────────────────────────────

function buildPipelineSteps(data: PipelineData): PipelineStep[] {
  const planNames = data.plans.map(p => p.name).join(', ');
  const hasPlan = data.plans.length > 0;
  const hasRoster = data.entityCount > 0;
  const hasData = data.dataRowCount > 0;
  const hasCalc = data.latestBatch !== null;

  return [
    {
      label: 'Plans',
      labelEs: 'Planes',
      status: hasPlan ? 'complete' : 'needed',
      detail: hasPlan
        ? `${data.plans.length} active plan${data.plans.length > 1 ? 's' : ''}: ${planNames}`
        : 'No plans configured',
      detailEs: hasPlan
        ? `${data.plans.length} plan${data.plans.length > 1 ? 'es' : ''} activo${data.plans.length > 1 ? 's' : ''}: ${planNames}`
        : 'No hay planes configurados',
      action: hasPlan ? null : { label: 'Import Plan', labelEs: 'Importar Plan', href: '/admin/launch/plan-import' },
    },
    {
      label: 'Roster',
      labelEs: 'Plantilla',
      status: hasRoster ? 'complete' : 'needed',
      detail: hasRoster
        ? `${data.entityCount.toLocaleString()} entities`
        : 'No roster imported',
      detailEs: hasRoster
        ? `${data.entityCount.toLocaleString()} entidades`
        : 'No se ha importado plantilla',
      action: hasRoster ? null : { label: 'Import Roster', labelEs: 'Importar Plantilla', href: '/data/import/enhanced' },
    },
    {
      label: 'Data',
      labelEs: 'Datos',
      status: hasData ? 'complete' : 'needed',
      detail: hasData
        ? `${data.dataRowCount.toLocaleString()} records across ${data.periods.length} period${data.periods.length !== 1 ? 's' : ''}`
        : 'No transaction data imported',
      detailEs: hasData
        ? `${data.dataRowCount.toLocaleString()} registros en ${data.periods.length} periodo${data.periods.length !== 1 ? 's' : ''}`
        : 'No se han importado datos de transaccion',
      action: hasData ? null : { label: 'Import Data', labelEs: 'Importar Datos', href: '/data/import/enhanced' },
    },
    {
      label: 'Calculate',
      labelEs: 'Calcular',
      status: hasCalc ? 'complete' : (hasData ? 'ready' : 'blocked'),
      detail: hasCalc
        ? `Last run: ${shortDate(data.latestBatch!.created_at)}`
        : hasData ? 'Ready to calculate' : 'Waiting for data',
      detailEs: hasCalc
        ? `Ultimo: ${shortDate(data.latestBatch!.created_at)}`
        : hasData ? 'Listo para calcular' : 'Esperando datos',
      action: hasData && !hasCalc
        ? { label: 'Run Calculation', labelEs: 'Ejecutar Calculo', href: '/operate/calculate' }
        : null,
    },
  ];
}

// ─── Module Card Builder ─────────────────────────────────────

function buildModuleCards(
  data: PipelineData,
  hasICM: boolean,
  hasFinancial: boolean,
  currencySymbol: string,
  isSpanish: boolean,
): ModuleCard[] {
  const cards: ModuleCard[] = [];

  if (hasICM) {
    const hasPlan = data.plans.length > 0;
    const hasRoster = data.entityCount > 0;
    const hasData = data.dataRowCount > 0;
    const hasCalc = data.latestBatch !== null;

    let health: ModuleHealth = 'setup_needed';
    if (hasPlan && hasRoster && hasData && hasCalc) {
      const daysSince = Math.floor((Date.now() - new Date(data.latestBatch!.created_at).getTime()) / 86400000);
      health = daysSince <= 30 ? 'healthy' : 'attention';
    } else if (hasPlan && hasRoster && hasData) {
      health = 'attention';
    }

    const totalPayout = data.latestBatch?.summary
      ? (typeof data.latestBatch.summary.total_payout === 'number' ? data.latestBatch.summary.total_payout
        : typeof data.latestBatch.summary.totalPayout === 'number' ? (data.latestBatch.summary.totalPayout as number) : 0)
      : 0;

    cards.push({
      key: 'icm',
      title: 'Incentive Compensation',
      titleEs: 'Compensacion Variable',
      subtitle: 'ICM',
      subtitleEs: 'ICM',
      health,
      stats: [
        { label: 'Plans', labelEs: 'Planes', value: String(data.plans.length) },
        { label: 'Entities', labelEs: 'Entidades', value: data.entityCount.toLocaleString() },
        {
          label: 'Last Calc',
          labelEs: 'Ultimo Calculo',
          value: data.latestBatch ? shortDate(data.latestBatch.created_at) : (isSpanish ? 'Ninguno' : 'None'),
        },
        {
          label: 'Result',
          labelEs: 'Resultado',
          value: totalPayout > 0 ? formatCompactCurrency(totalPayout, currencySymbol) : '\u2014',
        },
      ],
      actions: [
        { label: 'Operations Center', labelEs: 'Centro de Operaciones', href: '/operate/lifecycle' },
        { label: 'Import Data', labelEs: 'Importar Datos', href: '/operate/import/enhanced' },
        { label: 'Calculate', labelEs: 'Calcular', href: '/admin/launch/calculate' },
        { label: 'View Results', labelEs: 'Ver Resultados', href: '/operate/results' },
      ],
    });
  }

  if (hasFinancial && data.financialData) {
    const fin = data.financialData;
    const health: ModuleHealth = !fin.hasData ? 'setup_needed'
      : fin.flaggedLocations > 0 ? 'attention' : 'healthy';

    cards.push({
      key: 'financial',
      title: 'Financial Performance',
      titleEs: 'Rendimiento Financiero',
      subtitle: 'Restaurant Operations',
      subtitleEs: 'Operaciones de Restaurante',
      health,
      stats: [
        { label: 'Locations', labelEs: 'Ubicaciones', value: String(fin.locationCount) },
        { label: 'Brands', labelEs: 'Marcas', value: String(fin.brandCount) },
        { label: 'Records', labelEs: 'Registros', value: fin.chequeCount.toLocaleString() },
        {
          label: 'Revenue',
          labelEs: 'Ingresos',
          value: fin.revenue > 0 ? formatCompactCurrency(fin.revenue, currencySymbol) : '\u2014',
        },
      ],
      actions: [
        { label: 'Network Pulse', labelEs: 'Pulso de Red', href: '/financial' },
        { label: 'Import POS Data', labelEs: 'Importar Datos POS', href: '/operate/import/enhanced' },
      ],
    });
  }

  return cards;
}

// ─── Deterministic Commentary ────────────────────────────────

function buildCommentary(
  data: PipelineData,
  tenantName: string,
  isSpanish: boolean,
): string {
  const parts: string[] = [];

  if (isSpanish) {
    parts.push(`${tenantName} tiene`);
  } else {
    parts.push(`${tenantName} has`);
  }

  if (data.plans.length === 0) {
    if (isSpanish) {
      parts.push('sin planes de compensacion configurados. Importe un plan para comenzar.');
    } else {
      parts.push('no compensation plans configured. Import a plan document to begin.');
    }
    return parts.join(' ');
  }

  if (isSpanish) {
    parts.push(`${data.plans.length} plan${data.plans.length > 1 ? 'es' : ''} activo${data.plans.length > 1 ? 's' : ''}`);
  } else {
    parts.push(`${data.plans.length} active plan${data.plans.length > 1 ? 's' : ''}`);
  }

  if (data.entityCount > 0) {
    if (isSpanish) {
      parts.push(`cubriendo ${data.entityCount.toLocaleString()} entidades`);
    } else {
      parts.push(`covering ${data.entityCount.toLocaleString()} entities`);
    }
  } else {
    if (isSpanish) {
      parts.push('pero no se ha importado plantilla');
    } else {
      parts.push('but no roster has been imported');
    }
  }

  if (data.dataRowCount > 0 && data.periods.length > 0) {
    const sorted = [...data.periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const first = sorted[0].label || shortDate(sorted[0].start_date);
    const last = sorted[sorted.length - 1].label || shortDate(sorted[sorted.length - 1].start_date);
    const periodRange = data.periods.length === 1 ? first : `${first} through ${last}`;
    const periodRangeEs = data.periods.length === 1 ? first : `${first} a ${last}`;

    if (isSpanish) {
      parts.push(`con ${data.dataRowCount.toLocaleString()} registros de datos en ${periodRangeEs}`);
    } else {
      parts.push(`with ${data.dataRowCount.toLocaleString()} data records spanning ${periodRange}`);
    }
  }

  if (data.latestBatch) {
    const lastCalc = new Date(data.latestBatch.created_at);
    const daysAgo = Math.floor((Date.now() - lastCalc.getTime()) / 86400000);
    if (isSpanish) {
      if (daysAgo === 0) parts.push('\u2014 ultimo calculo ejecutado hoy');
      else if (daysAgo === 1) parts.push('\u2014 ultimo calculo ejecutado ayer');
      else parts.push(`\u2014 ultimo calculo hace ${daysAgo} dias`);
    } else {
      if (daysAgo === 0) parts.push('\u2014 last calculation ran today');
      else if (daysAgo === 1) parts.push('\u2014 last calculation ran yesterday');
      else parts.push(`\u2014 last calculation ran ${daysAgo} days ago`);
    }
  } else if (data.dataRowCount > 0) {
    if (isSpanish) {
      parts.push('\u2014 listo para el primer calculo');
    } else {
      parts.push('\u2014 ready for first calculation run');
    }
  }

  return parts.join(' ') + '.';
}

// ─── Quick Action ────────────────────────────────────────────

interface QuickAction {
  label: string;
  labelEs: string;
  href: string;
  icon: 'FileUp' | 'Users' | 'Upload' | 'Calculator' | 'BarChart3';
}

function getNextAction(data: PipelineData): QuickAction {
  if (data.plans.length === 0) {
    return { label: 'Import Your First Plan', labelEs: 'Importar Su Primer Plan', href: '/admin/launch/plan-import', icon: 'FileUp' };
  }
  if (data.entityCount === 0) {
    return { label: 'Import Roster', labelEs: 'Importar Plantilla', href: '/data/import/enhanced', icon: 'Users' };
  }
  if (data.dataRowCount === 0) {
    return { label: 'Import Transaction Data', labelEs: 'Importar Datos', href: '/data/import/enhanced', icon: 'Upload' };
  }
  if (!data.latestBatch) {
    return { label: 'Run First Calculation', labelEs: 'Ejecutar Primer Calculo', href: '/operate/calculate', icon: 'Calculator' };
  }
  return { label: 'View Latest Results', labelEs: 'Ver Ultimos Resultados', href: '/operate/calculate', icon: 'BarChart3' };
}

const ACTION_ICONS = {
  FileUp,
  Users,
  Upload,
  Calculator,
  BarChart3,
};

// ─── Health Display ──────────────────────────────────────────

const HEALTH_CONFIG: Record<ModuleHealth, { color: string; label: string; labelEs: string }> = {
  healthy: { color: '#10b981', label: 'Healthy', labelEs: 'Operativo' },
  attention: { color: '#f59e0b', label: 'Attention', labelEs: 'Atencion' },
  setup_needed: { color: '#71717a', label: 'Setup Needed', labelEs: 'Configurar' },
};

// ─── Step Status Colors ──────────────────────────────────────

const STEP_STATUS_STYLES: Record<StepStatus, { bg: string; border: string; text: string; icon: 'check' | 'arrow' | 'empty' }> = {
  complete: { bg: 'bg-emerald-600', border: 'border-emerald-600', text: 'text-white', icon: 'check' },
  ready: { bg: 'bg-blue-600', border: 'border-blue-600', text: 'text-white', icon: 'arrow' },
  needed: { bg: 'bg-zinc-800', border: 'border-zinc-600', text: 'text-zinc-400', icon: 'empty' },
  blocked: { bg: 'bg-zinc-800', border: 'border-zinc-700', text: 'text-zinc-500', icon: 'empty' },
};

// ─── Main Page Component ─────────────────────────────────────

export default function OperateLandingPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol } = useCurrency();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { ruleSetCount } = useSession();
  const isSpanish = (user && isVLAdmin(user)) ? false : locale === 'es-MX';
  const hasFinancial = useFeature('financial');
  const tenantId = currentTenant?.id ?? '';
  const hasICM = ruleSetCount > 0;
  const tenantName = currentTenant?.name ?? '';

  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      const supabase = createClient();

      // Core pipeline queries — all in parallel
      const corePromises = Promise.all([
        supabase
          .from('rule_sets')
          .select('id, name, status')
          .eq('tenant_id', tenantId)
          .eq('status', 'active'),
        supabase
          .from('entities')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('committed_data')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('periods')
          .select('id, label, start_date, end_date')
          .eq('tenant_id', tenantId)
          .order('start_date'),
        supabase
          .from('calculation_batches')
          .select('id, status, created_at, summary')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      // Financial data (if enabled) — parallel with core
      const financialPromise = hasFinancial
        ? fetch('/api/financial/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, mode: 'network_pulse' }),
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null);

      const [coreResults, financialResult] = await Promise.all([corePromises, financialPromise]);
      if (cancelled) return;

      const [plansRes, entitiesRes, dataRes, periodsRes, batchesRes] = coreResults;

      const plans = (plansRes.data ?? []) as Array<{ id: string; name: string; status: string }>;
      const entityCount = entitiesRes.count ?? 0;
      const dataRowCount = dataRes.count ?? 0;
      const periods = (periodsRes.data ?? []) as Array<{ id: string; label: string | null; start_date: string; end_date: string }>;
      const batches = (batchesRes.data ?? []) as Array<{ id: string; status: string; created_at: string; summary: Record<string, unknown> | null }>;
      const latestBatch = batches.length > 0 ? batches[0] : null;

      let financialData: PipelineData['financialData'] = null;
      if (financialResult?.networkMetrics) {
        const nm = financialResult.networkMetrics;
        financialData = {
          hasData: true,
          locationCount: nm.activeLocations ?? 0,
          brandCount: financialResult.brands?.length ?? 0,
          chequeCount: nm.checksServed ?? 0,
          revenue: nm.netRevenue ?? 0,
          flaggedLocations: (nm.leakageRate ?? 0) > 2 ? Math.ceil((nm.activeLocations ?? 0) * 0.1) : 0,
        };
      }

      setPipelineData({ plans, entityCount, dataRowCount, periods, latestBatch, financialData });
      setIsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, hasFinancial]);

  // ─── No Tenant ───────────────────────────────────────────

  if (!tenantId) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>{isSpanish ? 'Selecciona un tenant.' : 'Select a tenant.'}</p>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────

  if (isLoading || !pipelineData) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">
            {isSpanish ? 'Cargando operaciones...' : 'Loading operations overview...'}
          </p>
        </div>
      </div>
    );
  }

  // ─── Build Sections ──────────────────────────────────────

  const steps = buildPipelineSteps(pipelineData);
  const moduleCards = buildModuleCards(pipelineData, hasICM, hasFinancial, currencySymbol, isSpanish);
  const commentary = buildCommentary(pipelineData, tenantName || 'This tenant', isSpanish);
  const nextAction = getNextAction(pipelineData);
  const NextIcon = ACTION_ICONS[nextAction.icon];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">
          {isSpanish ? 'Centro de Operaciones' : 'Operations Overview'}
          {tenantName ? ` \u2014 ${tenantName}` : ''}
        </h1>
      </div>

      {/* Section 3: Deterministic Commentary (above cards per spec) */}
      <p className="text-sm text-zinc-300 leading-relaxed">{commentary}</p>

      {/* Section 1: Pipeline Readiness Gauge */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-6">
          {isSpanish ? 'Estado del Pipeline' : 'Pipeline Readiness'}
        </h2>

        {/* Step Row */}
        <div className="flex items-start">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-start flex-1">
              {/* Step Content */}
              <div className="flex flex-col items-center text-center flex-1">
                {/* Circle */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${STEP_STATUS_STYLES[step.status].bg} ${STEP_STATUS_STYLES[step.status].border}`}
                >
                  {step.status === 'complete' && (
                    <CheckCircle2 className={`h-5 w-5 ${STEP_STATUS_STYLES[step.status].text}`} />
                  )}
                  {step.status === 'ready' && (
                    <ArrowRight className={`h-5 w-5 ${STEP_STATUS_STYLES[step.status].text}`} />
                  )}
                  {(step.status === 'needed' || step.status === 'blocked') && (
                    <Circle className={`h-4 w-4 ${STEP_STATUS_STYLES[step.status].text}`} />
                  )}
                </div>

                {/* Label */}
                <p className={`mt-2 text-sm font-medium ${step.status === 'blocked' ? 'text-zinc-500' : 'text-zinc-200'}`}>
                  {isSpanish ? step.labelEs : step.label}
                </p>

                {/* Detail */}
                <p className={`mt-1 text-xs max-w-[160px] ${step.status === 'blocked' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {isSpanish ? step.detailEs : step.detail}
                </p>

                {/* Action */}
                {step.action && (
                  <button
                    onClick={() => router.push(step.action!.href)}
                    className="mt-2 bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1 text-xs font-medium transition-colors"
                  >
                    {isSpanish ? step.action.labelEs : step.action.label}
                  </button>
                )}
              </div>

              {/* Connector Line */}
              {i < steps.length - 1 && (
                <div className="flex items-center pt-5 -mx-1">
                  <div
                    className={`h-0.5 w-8 lg:w-12 ${
                      steps[i + 1].status === 'complete' || steps[i + 1].status === 'ready'
                        ? 'bg-emerald-600'
                        : 'bg-zinc-700'
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Module Summary Cards */}
      {moduleCards.length > 0 && (
        <div className={`grid gap-6 ${moduleCards.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {moduleCards.map(card => {
            const hConfig = HEALTH_CONFIG[card.health];
            return (
              <div key={card.key} className="bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden">
                {/* Card Header */}
                <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-700/60">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      {isSpanish ? card.titleEs : card.title}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {isSpanish ? card.subtitleEs : card.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hConfig.color }} />
                    <span className="text-xs text-zinc-400">{isSpanish ? hConfig.labelEs : hConfig.label}</span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="px-5 py-5 grid grid-cols-2 gap-4">
                  {card.stats.map(stat => (
                    <div key={stat.label}>
                      <p className="text-2xl font-bold text-zinc-100">{stat.value}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{isSpanish ? stat.labelEs : stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* Action Links */}
                <div className="px-5 py-3 space-y-1.5 border-t border-zinc-700/60">
                  {card.actions.map(action => (
                    <button
                      key={action.href}
                      onClick={() => router.push(action.href)}
                      className="block text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {'\u2192'} {isSpanish ? action.labelEs : action.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Section 4: Quick Action */}
      <div className="pt-2">
        <button
          onClick={() => router.push(nextAction.href)}
          className="inline-flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-3 text-lg font-medium transition-colors"
        >
          <NextIcon className="h-5 w-5" />
          {isSpanish ? nextAction.labelEs : nextAction.label}
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
