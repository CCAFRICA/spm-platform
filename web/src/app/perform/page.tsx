'use client';

/**
 * /perform — Module-Aware Persona Dashboard (OB-94, OB-102)
 *
 * The Perform workspace landing page renders the persona-appropriate dashboard:
 *   - admin  → AdminDashboard (Govern)
 *   - manager → ManagerDashboard (Acelerar)
 *   - rep    → RepDashboard (Crecer)
 *
 * OB-102 Phase 3: Module-aware. Detects ICM/Financial modules.
 *   - ICM enabled: renders persona-appropriate ICM dashboard
 *   - Financial enabled: renders FinancialPerformanceBanner (summary + link)
 *   - Both: ICM dashboard + Financial banner above
 *   - Neither: configure prompt
 *
 * Bloodwork Principle: healthy modules → summary builds confidence.
 * Issues → specific callout with action link.
 */

import { useState, useEffect } from 'react';
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

function PerformContent() {
  const router = useRouter();
  const { persona } = usePersona();
  const { availablePeriods, activePeriodKey, setActivePeriod, isLoading } = usePeriod();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const { ruleSetCount } = useSession();
  const hasFinancial = useFeature('financial');
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = (user && isVLAdmin(user)) ? false : locale === 'es-MX';
  const hasICM = ruleSetCount > 0;
  const tenantId = currentTenant?.id ?? '';

  const [financialData, setFinancialData] = useState<FinancialSummary | null>(null);

  // Load financial summary when module is enabled
  useEffect(() => {
    if (!hasFinancial || !tenantId) return;
    let cancelled = false;

    fetch('/api/financial/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, view: 'network_pulse' }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
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
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [hasFinancial, tenantId]);

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>{isSpanish ? 'Selecciona un tenant.' : 'Select a tenant to view your dashboard.'}</p>
      </div>
    );
  }

  const noModules = !hasICM && !hasFinancial;

  const performTitle = persona === 'admin'
    ? (isSpanish ? 'Resumen de Rendimiento' : 'Performance Overview')
    : persona === 'manager'
      ? (isSpanish ? 'Rendimiento del Equipo' : 'Team Performance')
      : (isSpanish ? 'Mi Rendimiento' : 'My Performance');

  const performDesc = persona === 'admin'
    ? (isSpanish ? 'Resumen de rendimiento por periodo y resultados' : 'Period performance summary and calculation results')
    : persona === 'manager'
      ? (isSpanish ? 'Metricas del equipo y seguimiento' : 'Team metrics and development tracking')
      : (isSpanish ? 'Tu compensacion y resultados' : 'Your compensation and results');

  return (
    <PersonaLayout persona={persona}>
      <PeriodRibbon
        periods={availablePeriods}
        activeKey={activePeriodKey}
        onSelect={setActivePeriod}
      />

      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {performTitle}
          </h1>
          <p className="text-xs text-zinc-400">{performDesc}</p>
        </div>

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
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Financial Performance Banner — when Financial module is enabled */}
            {hasFinancial && (
              <FinancialPerformanceBanner
                data={financialData}
                persona={persona}
                isSpanish={isSpanish}
                formatCurrency={formatCurrency}
                onNavigate={(href) => router.push(href)}
              />
            )}

            {/* ICM Persona Dashboard — when ICM module is enabled */}
            {hasICM && (
              <>
                {persona === 'admin' && <AdminDashboard />}
                {persona === 'manager' && <ManagerDashboard />}
                {persona === 'rep' && <RepDashboard />}
              </>
            )}

            {/* Financial-only: show expanded financial view instead of empty ICM */}
            {!hasICM && hasFinancial && (
              <FinancialOnlyPerformance
                data={financialData}
                isSpanish={isSpanish}
                formatCurrency={formatCurrency}
                onNavigate={(href) => router.push(href)}
              />
            )}
          </>
        )}
      </div>
    </PersonaLayout>
  );
}

export default function PerformPage() {
  return <PerformContent />;
}

// ─── Financial Performance Banner (compact, for dual-module) ────────────────

interface FinancialBannerProps {
  data: FinancialSummary | null;
  persona: string;
  isSpanish: boolean;
  formatCurrency: (n: number) => string;
  onNavigate: (href: string) => void;
}

function FinancialPerformanceBanner({ data, persona, isSpanish, formatCurrency, onNavigate }: FinancialBannerProps) {
  if (!data) return null;

  const hasLeakageAlert = data.leakageRate > 2;

  // Persona-appropriate summary
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
    <div className="mb-6 rounded-xl overflow-hidden" style={{ background: 'rgba(234, 179, 8, 0.06)', border: '1px solid rgba(234, 179, 8, 0.15)' }}>
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(45, 93%, 47%)' }} />
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
            className="text-[11px] text-zinc-400 hover:text-white transition-colors"
          >
            {isSpanish ? 'Ver detalle' : 'View details'} →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Financial-Only Performance View (expanded, no ICM) ────────────────────

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
    { label: isSpanish ? 'Ingresos Netos' : 'Net Revenue', value: formatCurrency(data.netRevenue) },
    { label: isSpanish ? 'Ubicaciones' : 'Locations', value: `${data.activeLocations}/${data.totalLocations}` },
    { label: isSpanish ? 'Cheques' : 'Checks', value: data.checksServed.toLocaleString() },
    { label: isSpanish ? 'Cheque Promedio' : 'Avg Check', value: formatCurrency(data.avgCheck) },
    { label: isSpanish ? 'Tasa de Propina' : 'Tip Rate', value: `${data.tipRate.toFixed(1)}%` },
    { label: isSpanish ? 'Fuga' : 'Leakage', value: `${data.leakageRate.toFixed(1)}%`, alert: data.leakageRate > 2 },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl px-5 py-4"
            style={{
              background: stat.alert ? 'rgba(245, 158, 11, 0.08)' : 'rgba(24, 24, 27, 0.8)',
              border: stat.alert ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(39, 39, 42, 0.6)',
            }}
          >
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-lg font-semibold mt-1 ${stat.alert ? 'text-amber-300' : 'text-zinc-100'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl px-5 py-4" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-3">
          {isSpanish ? 'Acciones Rapidas' : 'Quick Actions'}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: isSpanish ? 'Panel Financiero' : 'Financial Dashboard', href: '/financial' },
            { label: isSpanish ? 'Pulso de Red' : 'Network Pulse', href: '/financial/pulse' },
            { label: isSpanish ? 'Rendimiento' : 'Benchmarks', href: '/financial/performance' },
            { label: isSpanish ? 'Personal' : 'Staff', href: '/financial/staff' },
          ].map((action) => (
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
    </div>
  );
}
