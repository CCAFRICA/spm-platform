'use client';

/**
 * /perform — Module-Aware Persona Dashboard (OB-105)
 *
 * Complete file replacement. Renders persona-appropriate content
 * with module-aware branching:
 *
 *   1. No modules → empty state with link to Operate
 *   2. Financial-only → Financial performance summary (NOT "no compensation")
 *   3. ICM configured but not yet calculated → "Ready to calculate" guidance
 *   4. ICM with results → hero metrics + persona dashboard
 *   5. Both modules → ICM dashboard + Financial banner
 *
 * Null-data guard (Principle 10): No AI panels render when totalPayout === 0.
 * Domain-agnostic labels: "Total Result" not "Total Payout", "Entities" not "Reps".
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { PersonaLayout } from '@/components/layout/PersonaLayout';
import { PeriodRibbon } from '@/components/design-system/PeriodRibbon';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { RepDashboard } from '@/components/dashboards/RepDashboard';
import { useTenant, useCurrency, useFeature } from '@/contexts/tenant-context';
import { useSession } from '@/contexts/session-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
import { loadICMHealthData, type ICMHealthData } from '@/lib/data/page-loaders';

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

// ─── Main Page ────────────────────────────────────────────────

function PerformContent() {
  const router = useRouter();
  const { persona } = usePersona();
  const { availablePeriods, activePeriodKey, setActivePeriod, isLoading: periodLoading } = usePeriod();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const { ruleSetCount, entityCount, batchCount } = useSession();
  const hasFinancial = useFeature('financial');
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = (user && isVLAdmin(user)) ? false : locale === 'es-MX';
  const hasICM = ruleSetCount > 0;
  const tenantId = currentTenant?.id ?? '';

  const [icmHealth, setIcmHealth] = useState<ICMHealthData | null>(null);
  const [financialData, setFinancialData] = useState<FinancialSummary | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Load health data for hero metrics + commentary
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
          }).catch(() => {})
        );
      }

      await Promise.all(promises);
      if (!cancelled) setDataLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [tenantId, hasICM, hasFinancial]);

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>{isSpanish ? 'Selecciona un tenant.' : 'Select a tenant to view your dashboard.'}</p>
      </div>
    );
  }

  const noModules = !hasICM && !hasFinancial;
  const hasICMResults = hasICM && icmHealth && icmHealth.lastBatchDate !== null && icmHealth.totalPayout > 0;

  const performTitle = persona === 'admin'
    ? (isSpanish ? 'Resumen de Rendimiento' : 'Performance Dashboard')
    : persona === 'manager'
      ? (isSpanish ? 'Rendimiento del Equipo' : 'Team Performance')
      : (isSpanish ? 'Mi Rendimiento' : 'My Performance');

  // Deterministic commentary
  const commentary = useMemo(() => {
    return buildPerformCommentary(isSpanish, icmHealth, financialData, hasICM, hasFinancial, formatCurrency, persona);
  }, [isSpanish, icmHealth, financialData, hasICM, hasFinancial, formatCurrency, persona]);

  return (
    <PersonaLayout persona={persona}>
      <PeriodRibbon
        periods={availablePeriods}
        activeKey={activePeriodKey}
        onSelect={setActivePeriod}
      />

      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {performTitle}
            {currentTenant?.name ? ` \u2014 ${currentTenant.name}` : ''}
          </h1>
        </div>

        {/* MODULE-AWARE BRANCHING — The #1 regression fix */}

        {/* Branch 1: No modules at all */}
        {noModules && (
          <EmptyState
            title={isSpanish ? 'Sin datos de rendimiento' : 'No performance data yet'}
            description={isSpanish
              ? 'Importa tus planes y datos desde Operar para ver resultados aqui.'
              : 'Import your plans and data from Operate to see performance results here.'}
            actionLabel={isSpanish ? 'Ir a Operar' : 'Go to Operate'}
            actionHref="/operate"
            onNavigate={(href) => router.push(href)}
          />
        )}

        {/* Branch 2: Financial-only tenant — NOT "no compensation results" */}
        {!noModules && !hasICM && hasFinancial && (
          <>
            {/* Commentary */}
            {commentary && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-5 py-4 mb-6">
                <p className="text-sm text-zinc-300 leading-relaxed">{commentary}</p>
              </div>
            )}

            <FinancialOnlyPerformance
              data={financialData}
              isSpanish={isSpanish}
              formatCurrency={formatCurrency}
              onNavigate={(href) => router.push(href)}
            />
          </>
        )}

        {/* Branch 3: ICM configured but not yet calculated */}
        {!noModules && hasICM && !hasICMResults && !dataLoading && (
          <>
            {hasFinancial && financialData && (
              <FinancialPerformanceBanner
                data={financialData}
                persona={persona}
                isSpanish={isSpanish}
                formatCurrency={formatCurrency}
                onNavigate={(href) => router.push(href)}
              />
            )}

            <EmptyState
              title={isSpanish ? 'Listo para calcular' : 'Ready to calculate'}
              description={isSpanish
                ? `${ruleSetCount} plan${ruleSetCount > 1 ? 'es' : ''} configurado${ruleSetCount > 1 ? 's' : ''} con ${entityCount.toLocaleString()} entidades. Ejecuta un calculo desde Operar para ver resultados.`
                : `${ruleSetCount} plan${ruleSetCount > 1 ? 's' : ''} configured with ${entityCount.toLocaleString()} entities. Run a calculation from Operate to see results.`}
              actionLabel={isSpanish ? 'Ir a Calcular' : 'Go to Calculate'}
              actionHref="/operate"
              onNavigate={(href) => router.push(href)}
            />
          </>
        )}

        {/* Branch 4: ICM with results — show hero metrics + persona dashboard */}
        {!noModules && hasICM && (hasICMResults || dataLoading) && !periodLoading && (
          <>
            {/* Commentary */}
            {commentary && !dataLoading && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-5 py-4 mb-6">
                <p className="text-sm text-zinc-300 leading-relaxed">{commentary}</p>
              </div>
            )}

            {/* Hero Metrics Row — only when we have data */}
            {icmHealth && icmHealth.totalPayout > 0 && (
              <HeroMetricsRow
                icm={icmHealth}
                financial={financialData}
                hasFinancial={hasFinancial}
                isSpanish={isSpanish}
                formatCurrency={formatCurrency}
              />
            )}

            {/* Financial banner for dual-module */}
            {hasFinancial && financialData && (
              <FinancialPerformanceBanner
                data={financialData}
                persona={persona}
                isSpanish={isSpanish}
                formatCurrency={formatCurrency}
                onNavigate={(href) => router.push(href)}
              />
            )}

            {/* Persona Dashboard — null-data guard: only render when totalPayout > 0 */}
            {icmHealth && icmHealth.totalPayout > 0 && (
              <>
                {persona === 'admin' && <AdminDashboard />}
                {persona === 'manager' && <ManagerDashboard />}
                {persona === 'rep' && <RepDashboard />}
              </>
            )}
          </>
        )}

        {/* Loading state */}
        {(dataLoading || periodLoading) && !noModules && hasICM && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </PersonaLayout>
  );
}

export default function PerformPage() {
  return <PerformContent />;
}

// ─── Hero Metrics Row (4 stat cards) ──────────────────────────

interface HeroMetricsRowProps {
  icm: ICMHealthData;
  financial: FinancialSummary | null;
  hasFinancial: boolean;
  isSpanish: boolean;
  formatCurrency: (n: number) => string;
}

function HeroMetricsRow({ icm, financial, hasFinancial, isSpanish, formatCurrency }: HeroMetricsRowProps) {
  const stats = [
    {
      value: formatCurrency(icm.totalPayout),
      label: isSpanish ? 'Resultado Total' : 'Total Result',
    },
    {
      value: icm.entityCount.toLocaleString(),
      label: isSpanish ? 'Entidades' : 'Entities',
    },
    {
      value: icm.entityCount > 0 ? formatCurrency(icm.totalPayout / icm.entityCount) : '\u2014',
      label: isSpanish ? 'Promedio' : 'Average',
    },
    hasFinancial && financial ? {
      value: formatCurrency(financial.netRevenue),
      label: isSpanish ? 'Ingresos' : 'Revenue',
    } : {
      value: icm.ruleSetCount.toString(),
      label: isSpanish ? 'Planes' : 'Plans',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-5 py-4"
        >
          <p className="text-3xl font-bold text-zinc-100">{stat.value}</p>
          <p className="text-xs text-zinc-400 mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  onNavigate: (href: string) => void;
}

function EmptyState({ title, description, actionLabel, actionHref, onNavigate }: EmptyStateProps) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-8 text-center">
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 mb-4 max-w-md mx-auto">{description}</p>
      <button
        onClick={() => onNavigate(actionHref)}
        className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
      >
        → {actionLabel}
      </button>
    </div>
  );
}

// ─── Financial Performance Banner (dual-module, compact) ──────

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
    <div className="mb-6 rounded-lg overflow-hidden" style={{ background: 'rgba(234, 179, 8, 0.06)', border: '1px solid rgba(234, 179, 8, 0.15)' }}>
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
          <div>
            <span className="text-xs font-medium text-zinc-300">
              {isSpanish ? 'Finanzas' : 'Financial'}
            </span>
            <span className="text-xs text-zinc-500 ml-2">{summaryText}</span>
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
            className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            {isSpanish ? 'Ver detalle' : 'View details'} →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Financial-Only Performance View ──────────────────────────

interface FinancialOnlyProps {
  data: FinancialSummary | null;
  isSpanish: boolean;
  formatCurrency: (n: number) => string;
  onNavigate: (href: string) => void;
}

function FinancialOnlyPerformance({ data, isSpanish, formatCurrency, onNavigate }: FinancialOnlyProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full" />
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg px-5 py-4"
            style={{
              background: stat.alert ? 'rgba(245, 158, 11, 0.08)' : 'rgba(24, 24, 27, 0.5)',
              border: stat.alert ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(63, 63, 70, 1)',
            }}
          >
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-lg font-semibold mt-1 ${stat.alert ? 'text-amber-300' : 'text-zinc-100'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-5 py-4">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-3">
          {isSpanish ? 'Acciones Rapidas' : 'Quick Actions'}
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
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              → {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string, isSpanish: boolean): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function buildPerformCommentary(
  isSpanish: boolean,
  icm: ICMHealthData | null,
  financial: FinancialSummary | null,
  hasICM: boolean,
  hasFinancial: boolean,
  formatCurrency: (n: number) => string,
  persona: string,
): string {
  const parts: string[] = [];

  if (hasICM && icm && icm.totalPayout > 0) {
    const avg = icm.entityCount > 0 ? formatCurrency(icm.totalPayout / icm.entityCount) : '\u2014';
    if (isSpanish) {
      parts.push(`${icm.entityCount.toLocaleString()} entidades evaluadas`);
      parts.push(`Resultado total ${formatCurrency(icm.totalPayout)}, promedio ${avg}`);
    } else {
      parts.push(`${icm.entityCount.toLocaleString()} entities evaluated`);
      parts.push(`Total result ${formatCurrency(icm.totalPayout)}, average ${avg}`);
    }
  }

  if (hasFinancial && financial) {
    if (isSpanish) {
      parts.push(`${formatCurrency(financial.netRevenue)} ingresos en ${financial.activeLocations} ubicaciones`);
      if (financial.leakageRate > 2) {
        parts.push(`Fuga ${financial.leakageRate.toFixed(1)}% — por encima del objetivo`);
      }
    } else {
      parts.push(`${formatCurrency(financial.netRevenue)} revenue across ${financial.activeLocations} locations`);
      if (financial.leakageRate > 2) {
        parts.push(`Leakage ${financial.leakageRate.toFixed(1)}% — above target`);
      }
    }
  }

  if (parts.length === 0) return '';
  return parts.join('. ') + '.';
}
