'use client';

/**
 * Dashboard — Persona-Driven Root Page
 *
 * DS-002: Dashboard IS the persona view.
 * Routes content based on derived persona:
 *   - admin → AdminDashboard (Gobernar)
 *   - manager → ManagerDashboard (Acelerar)
 *   - rep → RepDashboard (Crecer)
 *
 * Wraps in PersonaProvider + PeriodProvider for context.
 * Period switching in PeriodRibbon updates all dashboard content.
 */

import { useState } from 'react';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { PersonaLayout } from '@/components/layout/PersonaLayout';
import { PeriodRibbon } from '@/components/design-system/PeriodRibbon';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { RepDashboard } from '@/components/dashboards/RepDashboard';
import { GPVWizard } from '@/components/gpv/GPVWizard';
import { useGPV } from '@/hooks/useGPV';
import { useTenant } from '@/contexts/tenant-context';

function DashboardContent() {
  const { persona, tokens } = usePersona();
  const { availablePeriods, activePeriodKey, setActivePeriod, isLoading } = usePeriod();
  const { currentTenant } = useTenant();
  const { loading: gpvLoading, isComplete: gpvComplete, currentStep } = useGPV(currentTenant?.id);
  const [skippedGPV] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('gpv_skipped') === 'true';
    }
    return false;
  });

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>Selecciona un tenant para ver tu dashboard.</p>
      </div>
    );
  }

  // Show loading while GPV state resolves
  if (gpvLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full mx-auto" />
          <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '12px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Existing tenants with calculation data skip GPV automatically
  const hasCalculationData = availablePeriods.length > 0;

  // Show GPV wizard for new tenants that haven't completed activation
  if (!gpvComplete && !hasCalculationData && !skippedGPV && currentStep < 4) {
    return (
      <GPVWizard
        tenantId={currentTenant.id}
        tenantName={currentTenant.displayName || currentTenant.name}
      />
    );
  }

  return (
    <PersonaLayout persona={persona}>
      {/* Period Ribbon — layout-level, always visible */}
      <PeriodRibbon
        periods={availablePeriods}
        activeKey={activePeriodKey}
        onSelect={setActivePeriod}
      />

      <div className="p-6 max-w-6xl mx-auto">
        {/* Persona header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {tokens.intent}
          </h1>
          <p className="text-xs text-zinc-500">{tokens.intentDescription}</p>
        </div>

        {/* Persona-driven content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {persona === 'admin' && <AdminDashboard />}
            {persona === 'manager' && <ManagerDashboard />}
            {persona === 'rep' && <RepDashboard />}
          </>
        )}
      </div>
    </PersonaLayout>
  );
}

export default function DashboardPage() {
  // PeriodProvider is now in the shell layout (auth-shell.tsx)
  // so all pages share the same period context
  return <DashboardContent />;
}
