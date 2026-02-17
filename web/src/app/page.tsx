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

import { usePersona } from '@/contexts/persona-context';
import { PeriodProvider, usePeriod } from '@/contexts/period-context';
import { PersonaLayout } from '@/components/layout/PersonaLayout';
import { PeriodRibbon } from '@/components/design-system/PeriodRibbon';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { RepDashboard } from '@/components/dashboards/RepDashboard';
import { useTenant } from '@/contexts/tenant-context';

function DashboardContent() {
  const { persona, tokens } = usePersona();
  const { availablePeriods, activePeriodKey, setActivePeriod, isLoading } = usePeriod();
  const { currentTenant } = useTenant();

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>Selecciona un tenant para ver tu dashboard.</p>
      </div>
    );
  }

  return (
    <PersonaLayout persona={persona} tokens={tokens}>
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
  return (
    <PeriodProvider>
      <DashboardContent />
    </PeriodProvider>
  );
}
