'use client';

/**
 * Operate Landing — Module Health Bloodwork Dashboard (OB-105)
 *
 * Replaces the OB-102 skeleton with full health computation,
 * colored status dots, 2x2 stats grids, deterministic commentary,
 * recent activity timeline, and text action links.
 *
 * Health statuses: healthy | attention | stale | ready | needs_data | not_configured
 * Each maps to a specific color dot (emerald/amber/red/blue/zinc).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant, useCurrency, useFeature } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { useSession } from '@/contexts/session-context';
import { isVLAdmin } from '@/types/auth';
import { loadICMHealthData, type ICMHealthData } from '@/lib/data/page-loaders';
import { createClient } from '@/lib/supabase/client';

// ─── Health Status Types ──────────────────────────────────────

type HealthStatus = 'healthy' | 'attention' | 'stale' | 'ready' | 'needs_data' | 'not_configured';

interface HealthResult {
  status: HealthStatus;
  color: string;  // hex color for the dot
  label: string;
  labelEs: string;
}

const HEALTH_COLORS: Record<HealthStatus, string> = {
  healthy: '#10b981',
  attention: '#f59e0b',
  stale: '#ef4444',
  ready: '#3b82f6',
  needs_data: '#f59e0b',
  not_configured: '#71717a',
};

// ─── Health Computation ───────────────────────────────────────

function computeICMHealth(data: {
  ruleSetCount: number;
  entityCount: number;
  lastCalcDate: Date | null;
  lastCalcTotal: number;
  periodCount: number;
}): HealthResult {
  if (data.ruleSetCount === 0) {
    return { status: 'not_configured', color: HEALTH_COLORS.not_configured, label: 'Not Configured', labelEs: 'No Configurado' };
  }
  if (data.entityCount === 0) {
    return { status: 'needs_data', color: HEALTH_COLORS.needs_data, label: 'Needs Data', labelEs: 'Necesita Datos' };
  }
  if (!data.lastCalcDate) {
    return { status: 'ready', color: HEALTH_COLORS.ready, label: 'Ready to Calculate', labelEs: 'Listo para Calcular' };
  }
  const daysSinceCalc = Math.floor((Date.now() - data.lastCalcDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceCalc <= 7) {
    return { status: 'healthy', color: HEALTH_COLORS.healthy, label: 'Healthy', labelEs: 'Operativo' };
  }
  if (daysSinceCalc <= 30) {
    return { status: 'attention', color: HEALTH_COLORS.attention, label: 'Attention', labelEs: 'Atencion' };
  }
  return { status: 'stale', color: HEALTH_COLORS.stale, label: 'Stale Data', labelEs: 'Datos Obsoletos' };
}

function computeFinancialHealth(data: {
  hasData: boolean;
  locationCount: number;
  chequeCount: number;
  revenue: number;
  flaggedLocations: number;
}): HealthResult {
  if (!data.hasData) {
    return { status: 'not_configured', color: HEALTH_COLORS.not_configured, label: 'Not Configured', labelEs: 'No Configurado' };
  }
  if (data.locationCount === 0) {
    return { status: 'needs_data', color: HEALTH_COLORS.needs_data, label: 'Needs Data', labelEs: 'Necesita Datos' };
  }
  if (data.flaggedLocations > 0) {
    return { status: 'attention', color: HEALTH_COLORS.attention, label: 'Attention', labelEs: 'Atencion' };
  }
  return { status: 'healthy', color: HEALTH_COLORS.healthy, label: 'Healthy', labelEs: 'Operativo' };
}

// ─── Financial Health Data ────────────────────────────────────

interface FinancialHealthData {
  hasData: boolean;
  locationCount: number;
  chequeCount: number;
  revenue: number;
  flaggedLocations: number;
  brandCount: number;
  avgCheck: number;
  tipRate: number;
  leakageRate: number;
}

// ─── Recent Activity ──────────────────────────────────────────

interface ActivityEvent {
  date: string;
  module: 'ICM' | 'FIN';
  description: string;
}

async function loadRecentActivity(tenantId: string): Promise<ActivityEvent[]> {
  const supabase = createClient();
  const events: ActivityEvent[] = [];

  const [batchRes, importRes] = await Promise.all([
    supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, entity_count, summary, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('import_batches')
      .select('id, file_name, row_count, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  for (const batch of batchRes.data ?? []) {
    const summary = batch.summary as Record<string, unknown> | null;
    const totalPayout = typeof summary?.total_payout === 'number' ? summary.total_payout
      : typeof summary?.totalPayout === 'number' ? summary.totalPayout : 0;

    events.push({
      date: batch.created_at,
      module: 'ICM',
      description: `Calculation ${batch.lifecycle_state}: ${batch.entity_count} entities${totalPayout > 0 ? `, ${formatCompactCurrency(totalPayout)}` : ''}`,
    });
  }

  for (const imp of importRes.data ?? []) {
    const isPOS = imp.file_name?.toLowerCase().includes('pos') ||
                  imp.file_name?.toLowerCase().includes('financial') ||
                  imp.file_name?.toLowerCase().includes('cheque');
    events.push({
      date: imp.created_at,
      module: isPOS ? 'FIN' : 'ICM',
      description: `Data imported: ${imp.row_count?.toLocaleString() ?? 0} records (${imp.file_name || 'unknown'})`,
    });
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events.slice(0, 7);
}

function formatCompactCurrency(amount: number): string {
  if (amount >= 1_000_000) return `MX$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `MX$${(amount / 1_000).toFixed(0)}K`;
  return `MX$${amount.toFixed(0)}`;
}

// ─── Main Page Component ──────────────────────────────────────

export default function OperateLandingPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { ruleSetCount } = useSession();
  const isSpanish = (user && isVLAdmin(user)) ? false : locale === 'es-MX';
  const hasFinancial = useFeature('financial');
  const tenantId = currentTenant?.id ?? '';
  const hasICM = ruleSetCount > 0;

  const [icmHealth, setIcmHealth] = useState<ICMHealthData | null>(null);
  const [financialHealth, setFinancialHealth] = useState<FinancialHealthData | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      const promises: Promise<void>[] = [];

      if (hasICM) {
        promises.push(
          loadICMHealthData(tenantId).then(data => {
            if (!cancelled) setIcmHealth(data);
          }).catch(() => {})
        );
      }

      if (hasFinancial) {
        promises.push(
          fetch('/api/financial/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, view: 'network_pulse' }),
          }).then(r => r.ok ? r.json() : null).then(data => {
            if (!cancelled && data?.networkMetrics) {
              const nm = data.networkMetrics;
              setFinancialHealth({
                hasData: true,
                locationCount: nm.activeLocations ?? 0,
                chequeCount: nm.checksServed ?? 0,
                revenue: nm.netRevenue ?? 0,
                flaggedLocations: (nm.leakageRate ?? 0) > 2 ? Math.ceil((nm.activeLocations ?? 0) * 0.1) : 0,
                brandCount: data.brands?.length ?? 0,
                avgCheck: nm.avgCheck ?? 0,
                tipRate: nm.tipRate ?? 0,
                leakageRate: nm.leakageRate ?? 0,
              });
            }
          }).catch(() => {})
        );
      }

      promises.push(
        loadRecentActivity(tenantId).then(events => {
          if (!cancelled) setRecentActivity(events);
        }).catch(() => {})
      );

      await Promise.all(promises);
      if (!cancelled) setIsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, hasICM, hasFinancial]);

  if (!tenantId) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>{isSpanish ? 'Selecciona un tenant.' : 'Select a tenant.'}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">{isSpanish ? 'Cargando...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Compute health statuses
  const icmHealthResult = icmHealth ? computeICMHealth({
    ruleSetCount: icmHealth.ruleSetCount,
    entityCount: icmHealth.entityCount,
    lastCalcDate: icmHealth.lastBatchDate ? new Date(icmHealth.lastBatchDate) : null,
    lastCalcTotal: icmHealth.totalPayout,
    periodCount: icmHealth.periodCount,
  }) : null;

  const financialHealthResult = financialHealth ? computeFinancialHealth(financialHealth) : null;

  const noModules = !hasICM && !hasFinancial;
  const dualModule = hasICM && hasFinancial;

  const allHealthy =
    (icmHealthResult?.status === 'healthy' || !hasICM) &&
    (financialHealthResult?.status === 'healthy' || !hasFinancial);

  // Deterministic commentary
  const commentary = buildCommentary(isSpanish, icmHealth, icmHealthResult, financialHealth, financialHealthResult, hasICM, hasFinancial, formatCurrency, allHealthy);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">
            {isSpanish ? 'Centro de Operaciones' : 'Operations Overview'}
            {currentTenant?.name ? ` \u2014 ${currentTenant.name}` : ''}
          </h1>
        </div>
        {allHealthy && !noModules && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
            {isSpanish ? 'Todos los sistemas operativos' : 'All systems operational'}
          </span>
        )}
      </div>

      {/* Deterministic Commentary */}
      {commentary && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-5 py-4">
          <p className="text-sm text-zinc-300 leading-relaxed">{commentary}</p>
        </div>
      )}

      {/* Module Health Cards */}
      {noModules ? (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-8 text-center">
          <p className="text-zinc-400 mb-2">{isSpanish ? 'No hay modulos configurados.' : 'No modules configured.'}</p>
          <p className="text-sm text-zinc-500 mb-4">{isSpanish ? 'Importa tus planes y datos para comenzar.' : 'Import your plans and data to get started.'}</p>
          <a
            onClick={() => router.push('/operate/import/enhanced')}
            className="text-blue-400 hover:text-blue-300 text-sm cursor-pointer"
          >
            {isSpanish ? 'Ir a Importar' : 'Go to Import'} →
          </a>
        </div>
      ) : (
        <div className={`grid gap-6 ${dualModule ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* ICM Module Card */}
          {hasICM && icmHealth && icmHealthResult && (
            <ModuleHealthCard
              title={isSpanish ? 'Compensacion (ICM)' : 'Incentive Compensation'}
              health={icmHealthResult}
              isSpanish={isSpanish}
              stats={[
                { value: String(icmHealth.ruleSetCount), label: isSpanish ? 'Planes' : 'Plans', sub: icmHealth.ruleSetName },
                { value: icmHealth.entityCount.toLocaleString(), label: isSpanish ? 'Entidades' : 'Entities' },
                { value: icmHealth.lastBatchDate ? formatDate(icmHealth.lastBatchDate, isSpanish) : (isSpanish ? 'Ninguno' : 'None'), label: isSpanish ? 'Ultimo Calculo' : 'Last Calc' },
                { value: icmHealth.totalPayout > 0 ? formatCurrency(icmHealth.totalPayout) : '\u2014', label: isSpanish ? 'Resultado' : 'Result' },
              ]}
              actions={[
                { label: isSpanish ? 'Centro de Operaciones' : 'Operations Center', href: '/operate/lifecycle' },
                { label: isSpanish ? 'Importar Datos' : 'Import Data', href: '/operate/import/enhanced' },
                { label: isSpanish ? 'Calcular' : 'Calculate', href: '/admin/launch/calculate' },
                { label: isSpanish ? 'Ver Resultados' : 'View Results', href: '/operate/results' },
              ]}
              onNavigate={(href) => router.push(href)}
            />
          )}

          {/* Financial Module Card */}
          {hasFinancial && financialHealthResult && (
            <ModuleHealthCard
              title={isSpanish ? 'Rendimiento Financiero' : 'Financial Performance'}
              health={financialHealthResult}
              isSpanish={isSpanish}
              stats={financialHealth ? [
                { value: String(financialHealth.locationCount), label: isSpanish ? 'Ubicaciones' : 'Locations' },
                { value: financialHealth.chequeCount.toLocaleString(), label: isSpanish ? 'Cheques' : 'Cheques' },
                { value: financialHealth.revenue > 0 ? formatCurrency(financialHealth.revenue) : '\u2014', label: isSpanish ? 'Ingresos' : 'Revenue' },
                { value: financialHealth.flaggedLocations > 0 ? String(financialHealth.flaggedLocations) : '0', label: isSpanish ? 'Marcadas' : 'Flagged' },
              ] : []}
              actions={[
                { label: isSpanish ? 'Panel Financiero' : 'Financial Dashboard', href: '/financial' },
                { label: isSpanish ? 'Pulso de Red' : 'Network Pulse', href: '/financial/pulse' },
                { label: isSpanish ? 'Importar Datos POS' : 'Import POS Data', href: '/operate/import/enhanced' },
              ]}
              onNavigate={(href) => router.push(href)}
            />
          )}
        </div>
      )}

      {/* Recent Activity */}
      <RecentActivitySection events={recentActivity} isSpanish={isSpanish} />
    </div>
  );
}

// ─── Module Health Card ───────────────────────────────────────

interface StatBox {
  value: string;
  label: string;
  sub?: string | null;
}

interface ActionLink {
  label: string;
  href: string;
}

interface ModuleHealthCardProps {
  title: string;
  health: HealthResult;
  isSpanish: boolean;
  stats: StatBox[];
  actions: ActionLink[];
  onNavigate: (href: string) => void;
}

function ModuleHealthCard({ title, health, isSpanish, stats, actions, onNavigate }: ModuleHealthCardProps) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden">
      {/* Header with health dot */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-700/60">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: health.color }} />
          <span className="text-xs text-zinc-400">{isSpanish ? health.labelEs : health.label}</span>
        </div>
      </div>

      {/* 2x2 Stats Grid */}
      <div className="px-5 py-5 grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-2xl font-bold text-zinc-100">{stat.value}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{stat.label}</p>
            {stat.sub && <p className="text-[11px] text-zinc-500 truncate mt-0.5">{stat.sub}</p>}
          </div>
        ))}
      </div>

      {/* Action Links */}
      <div className="px-5 py-3 space-y-1.5 border-t border-zinc-700/60">
        {actions.map((action) => (
          <button
            key={action.href}
            onClick={() => onNavigate(action.href)}
            className="block text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            → {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Activity Section ──────────────────────────────────

function RecentActivitySection({ events, isSpanish }: { events: ActivityEvent[]; isSpanish: boolean }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-700/60">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          {isSpanish ? 'Actividad Reciente' : 'Recent Activity'}
        </h3>
      </div>
      <div className="px-5 py-3 space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500 py-2">
            {isSpanish ? 'Sin actividad aun.' : 'No activity yet.'}
          </p>
        ) : (
          events.map((event, i) => (
            <div key={i} className="flex items-start gap-3">
              <div
                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{ backgroundColor: event.module === 'ICM' ? '#7c3aed' : '#eab308' }}
              />
              <div className="min-w-0">
                <p className="text-xs text-zinc-300">{event.description}</p>
                <p className="text-[11px] text-zinc-600">
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5"
                    style={{
                      backgroundColor: event.module === 'ICM' ? 'rgba(124, 58, 237, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                      color: event.module === 'ICM' ? '#a78bfa' : '#fbbf24',
                    }}
                  >
                    {event.module}
                  </span>
                  {formatDate(event.date, isSpanish)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string, isSpanish: boolean): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function buildCommentary(
  isSpanish: boolean,
  icm: ICMHealthData | null,
  icmHealth: HealthResult | null,
  fin: FinancialHealthData | null,
  finHealth: HealthResult | null,
  hasICM: boolean,
  hasFinancial: boolean,
  formatCurrency: (n: number) => string,
  allHealthy: boolean,
): string {
  const parts: string[] = [];

  if (hasICM && icm && icm.ruleSetCount > 0) {
    if (isSpanish) {
      parts.push(`${icm.ruleSetCount} plan${icm.ruleSetCount > 1 ? 'es' : ''} configurado${icm.ruleSetCount > 1 ? 's' : ''} con ${icm.entityCount.toLocaleString()} entidades`);
      if (icm.lastBatchDate) {
        parts.push(`Ultimo calculo ${formatDate(icm.lastBatchDate, true)}${icm.totalPayout > 0 ? ` con ${formatCurrency(icm.totalPayout)} total` : ''}`);
      } else {
        parts.push('Sin calculos previos');
      }
    } else {
      parts.push(`${icm.ruleSetCount} plan${icm.ruleSetCount > 1 ? 's' : ''} configured across ${icm.entityCount.toLocaleString()} entities`);
      if (icm.lastBatchDate) {
        parts.push(`Last calculation ${formatDate(icm.lastBatchDate, false)}${icm.totalPayout > 0 ? ` with ${formatCurrency(icm.totalPayout)} total` : ''}`);
      } else {
        parts.push('No calculations run yet');
      }
    }
  }

  if (hasFinancial && fin && fin.hasData) {
    if (isSpanish) {
      parts.push(`${formatCurrency(fin.revenue)} ingresos en ${fin.locationCount} ubicaciones`);
      if (fin.flaggedLocations > 0) {
        parts.push(`${fin.flaggedLocations} ubicacion${fin.flaggedLocations > 1 ? 'es' : ''} marcada${fin.flaggedLocations > 1 ? 's' : ''} para atencion`);
      }
    } else {
      parts.push(`${formatCurrency(fin.revenue)} revenue across ${fin.locationCount} locations`);
      if (fin.flaggedLocations > 0) {
        parts.push(`${fin.flaggedLocations} location${fin.flaggedLocations > 1 ? 's' : ''} flagged for attention`);
      }
    }
  }

  if (parts.length === 0) {
    return isSpanish
      ? 'Importa tus planes y datos para comenzar.'
      : 'Import your plans and data to get started.';
  }

  if (allHealthy) {
    parts.push(isSpanish ? 'Todos los sistemas operativos' : 'All systems operational');
  }

  return parts.join('. ') + '.';
}
