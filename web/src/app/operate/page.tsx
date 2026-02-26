'use client';

/**
 * Operate Landing — Module-Aware Bloodwork Dashboard (OB-102)
 *
 * Unified module health overview replacing the ICM-specific lifecycle cockpit.
 * Shows health cards per enabled module (ICM, Financial) with:
 *   - Status indicator (green/amber/red)
 *   - Key stats from real data
 *   - Quick action links to module workspaces
 *   - Deterministic commentary
 *
 * Bloodwork Principle (Standing Rule 23):
 *   All healthy → "All systems operational" (confidence builds silently)
 *   Issue detected → module card shows amber/red with specific callout
 *   Detail on demand → click through to module workspace
 *
 * Dual-module tenants (Sabor Grupo): both cards side by side
 * Single-module tenants: one card full width
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant, useCurrency, useFeature } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { useSession } from '@/contexts/session-context';
import { isVLAdmin } from '@/types/auth';
import { loadICMHealthData, type ICMHealthData } from '@/lib/data/page-loaders';
import { StatusPill } from '@/components/design-system/StatusPill';

interface FinancialHealthData {
  netRevenue: number;
  activeLocations: number;
  totalLocations: number;
  checksServed: number;
  brandCount: number;
  avgCheck: number;
  tipRate: number;
  leakageRate: number;
}

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
  const [isLoading, setIsLoading] = useState(true);

  // Load module health data
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      const promises: Promise<void>[] = [];

      // ICM health
      if (hasICM) {
        promises.push(
          loadICMHealthData(tenantId).then(data => {
            if (!cancelled) setIcmHealth(data);
          }).catch(() => {})
        );
      }

      // Financial health — uses API route
      if (hasFinancial) {
        promises.push(
          fetch('/api/financial/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, view: 'network_pulse' }),
          }).then(r => r.ok ? r.json() : null).then(data => {
            if (!cancelled && data?.networkMetrics) {
              setFinancialHealth({
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

  const noModules = !hasICM && !hasFinancial;
  const dualModule = hasICM && hasFinancial;

  // Module health status
  const icmStatus = icmHealth
    ? (icmHealth.ruleSetCount === 0 ? 'warning' : icmHealth.lastBatchDate ? 'healthy' : 'attention')
    : 'unknown';
  const financialStatus = financialHealth
    ? (financialHealth.leakageRate > 2 ? 'warning' : 'healthy')
    : 'unknown';

  const allHealthy = (icmStatus === 'healthy' || !hasICM) && (financialStatus === 'healthy' || !hasFinancial);

  // Deterministic commentary
  const commentary = buildCommentary(isSpanish, icmHealth, financialHealth, hasICM, hasFinancial);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">
            {isSpanish ? 'Centro de Operaciones' : 'Operations Overview'}
          </h1>
          <p className="text-sm text-zinc-400">
            {currentTenant?.displayName ?? currentTenant?.name ?? ''}
          </p>
        </div>
        {allHealthy && (
          <StatusPill color="emerald">
            {isSpanish ? 'Todos los sistemas operativos' : 'All systems operational'}
          </StatusPill>
        )}
      </div>

      {/* Deterministic Commentary */}
      {commentary && (
        <div className="rounded-xl px-5 py-4" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
          <p className="text-sm text-zinc-300 leading-relaxed">{commentary}</p>
        </div>
      )}

      {/* Module Health Cards */}
      {noModules ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
          <p className="text-zinc-400 mb-4">{isSpanish ? 'No hay modulos configurados.' : 'No modules configured.'}</p>
          <button
            onClick={() => router.push('/configure')}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#7c3aed' }}
          >
            {isSpanish ? 'Configurar' : 'Configure'}
          </button>
        </div>
      ) : (
        <div className={`grid gap-6 ${dualModule ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* ICM Module Card */}
          {hasICM && (
            <ModuleCard
              title={isSpanish ? 'Compensacion (ICM)' : 'Compensation (ICM)'}
              status={icmStatus}
              accentColor="hsl(262, 83%, 58%)"
              isSpanish={isSpanish}
              stats={icmHealth ? [
                { label: isSpanish ? 'Planes Activos' : 'Active Plans', value: String(icmHealth.ruleSetCount), sub: icmHealth.ruleSetName },
                { label: isSpanish ? 'Entidades' : 'Entities', value: icmHealth.entityCount.toLocaleString() },
                { label: isSpanish ? 'Ultimo Calculo' : 'Last Calculation', value: icmHealth.lastBatchDate ? formatDate(icmHealth.lastBatchDate, isSpanish) : (isSpanish ? 'Ninguno' : 'None') },
                { label: isSpanish ? 'Pago Total' : 'Total Payout', value: icmHealth.totalPayout > 0 ? formatCurrency(icmHealth.totalPayout) : '—' },
              ] : []}
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
          {hasFinancial && (
            <ModuleCard
              title={isSpanish ? 'Finanzas' : 'Financial'}
              status={financialStatus}
              accentColor="hsl(45, 93%, 47%)"
              isSpanish={isSpanish}
              stats={financialHealth ? [
                { label: isSpanish ? 'Ubicaciones Activas' : 'Active Locations', value: `${financialHealth.activeLocations}/${financialHealth.totalLocations}` },
                { label: isSpanish ? 'Marcas' : 'Brands', value: String(financialHealth.brandCount) },
                { label: isSpanish ? 'Ingresos Netos' : 'Net Revenue', value: formatCurrency(financialHealth.netRevenue) },
                { label: isSpanish ? 'Cheques' : 'Checks Served', value: financialHealth.checksServed.toLocaleString() },
              ] : []}
              actions={[
                { label: isSpanish ? 'Panel Financiero' : 'Financial Dashboard', href: '/financial' },
                { label: isSpanish ? 'Pulso de Red' : 'Network Pulse', href: '/financial/pulse' },
                { label: isSpanish ? 'Importar Datos POS' : 'Import POS Data', href: '/operate/import/enhanced' },
              ]}
              onNavigate={(href) => router.push(href)}
              attention={financialHealth && financialHealth.leakageRate > 2 ? (isSpanish
                ? `Fuga de ${financialHealth.leakageRate.toFixed(1)}% — por encima del objetivo`
                : `Leakage at ${financialHealth.leakageRate.toFixed(1)}% — above target`) : undefined}
            />
          )}
        </div>
      )}

      {/* Recent Activity */}
      <RecentActivitySection
        icmHealth={icmHealth}
        financialHealth={financialHealth}
        hasICM={hasICM}
        hasFinancial={hasFinancial}
        isSpanish={isSpanish}
      />
    </div>
  );
}

// ─── Module Health Card ────────────────────────────────

interface ModuleCardProps {
  title: string;
  status: string;
  accentColor: string;
  isSpanish: boolean;
  stats: Array<{ label: string; value: string; sub?: string | null }>;
  actions: Array<{ label: string; href: string }>;
  onNavigate: (href: string) => void;
  attention?: string;
}

function ModuleCard({ title, status, accentColor, isSpanish, stats, actions, onNavigate, attention }: ModuleCardProps) {
  const statusLabel = status === 'healthy'
    ? (isSpanish ? 'Operativo' : 'Healthy')
    : status === 'warning'
      ? (isSpanish ? 'Atencion' : 'Attention')
      : status === 'attention'
        ? (isSpanish ? 'Pendiente' : 'Pending')
        : '—';
  const statusColor = status === 'healthy' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#71717a';

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(39, 39, 42, 0.4)' }}>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="text-xs text-zinc-400">{statusLabel}</span>
        </div>
      </div>

      {/* Attention banner */}
      {attention && (
        <div className="px-5 py-2" style={{ background: 'rgba(245, 158, 11, 0.08)', borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <p className="text-xs text-amber-300">{attention}</p>
        </div>
      )}

      {/* Stats grid */}
      <div className="px-5 py-4 grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{stat.label}</p>
            <p className="text-sm font-semibold text-zinc-100 mt-0.5">{stat.value}</p>
            {stat.sub && <p className="text-[11px] text-zinc-500 truncate">{stat.sub}</p>}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderTop: '1px solid rgba(39, 39, 42, 0.4)' }}>
        {actions.map((action) => (
          <button
            key={action.href}
            onClick={() => onNavigate(action.href)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-colors"
            style={{ background: 'rgba(39, 39, 42, 0.6)' }}
          >
            {action.label} →
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Activity ───────────────────────────────────

interface RecentActivityProps {
  icmHealth: ICMHealthData | null;
  financialHealth: FinancialHealthData | null;
  hasICM: boolean;
  hasFinancial: boolean;
  isSpanish: boolean;
}

function RecentActivitySection({ icmHealth, financialHealth, hasICM, hasFinancial, isSpanish }: RecentActivityProps) {
  const events: Array<{ date: string; module: string; description: string; color: string }> = [];

  if (hasICM && icmHealth) {
    if (icmHealth.lastBatchDate) {
      events.push({
        date: icmHealth.lastBatchDate,
        module: 'ICM',
        description: isSpanish
          ? `Calculo completado: ${icmHealth.entityCount} entidades`
          : `Calculation completed: ${icmHealth.entityCount} entities`,
        color: '#7c3aed',
      });
    }
    if (icmHealth.lastImportDate) {
      events.push({
        date: icmHealth.lastImportDate,
        module: 'ICM',
        description: isSpanish ? 'Datos importados' : 'Data imported',
        color: '#7c3aed',
      });
    }
  }

  if (hasFinancial && financialHealth) {
    events.push({
      date: new Date().toISOString(),
      module: isSpanish ? 'Finanzas' : 'Financial',
      description: isSpanish
        ? `${financialHealth.activeLocations} ubicaciones activas, ${financialHealth.checksServed.toLocaleString()} cheques`
        : `${financialHealth.activeLocations} active locations, ${financialHealth.checksServed.toLocaleString()} checks`,
      color: '#eab308',
    });
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (events.length === 0) return null;

  return (
    <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(39, 39, 42, 0.4)' }}>
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          {isSpanish ? 'Actividad Reciente' : 'Recent Activity'}
        </h3>
      </div>
      <div className="px-5 py-3 space-y-3">
        {events.slice(0, 7).map((event, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: event.color }} />
            <div className="min-w-0">
              <p className="text-xs text-zinc-300">{event.description}</p>
              <p className="text-[11px] text-zinc-600">
                <span className="text-zinc-500">{event.module}</span> · {formatDate(event.date, isSpanish)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────

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
  financial: FinancialHealthData | null,
  hasICM: boolean,
  hasFinancial: boolean,
): string {
  const parts: string[] = [];

  if (hasICM && icm) {
    if (isSpanish) {
      parts.push(`ICM: ${icm.ruleSetCount} plan${icm.ruleSetCount !== 1 ? 'es' : ''} configurado${icm.ruleSetCount !== 1 ? 's' : ''}, ${icm.entityCount.toLocaleString()} entidades.`);
      if (icm.lastBatchDate) {
        parts.push(`Ultimo calculo: ${formatDate(icm.lastBatchDate, true)}.`);
      } else {
        parts.push('Sin calculos previos.');
      }
    } else {
      parts.push(`ICM: ${icm.ruleSetCount} plan${icm.ruleSetCount !== 1 ? 's' : ''} configured, ${icm.entityCount.toLocaleString()} entities.`);
      if (icm.lastBatchDate) {
        parts.push(`Last calculation: ${formatDate(icm.lastBatchDate, false)}.`);
      } else {
        parts.push('No previous calculations.');
      }
    }
  }

  if (hasFinancial && financial) {
    if (isSpanish) {
      parts.push(`Finanzas: ${financial.activeLocations} ubicaciones activas, ${financial.brandCount} marca${financial.brandCount !== 1 ? 's' : ''}.`);
      if (financial.leakageRate > 2) {
        parts.push(`Fuga ${financial.leakageRate.toFixed(1)}% — por encima del objetivo de 2%.`);
      }
    } else {
      parts.push(`Financial: ${financial.activeLocations} active locations, ${financial.brandCount} brand${financial.brandCount !== 1 ? 's' : ''}.`);
      if (financial.leakageRate > 2) {
        parts.push(`Leakage ${financial.leakageRate.toFixed(1)}% — above 2% target.`);
      }
    }
  }

  return parts.join(' ');
}
