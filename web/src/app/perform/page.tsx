'use client';

/**
 * /perform — Persona-Driven Dashboard (OB-94, OB-102)
 *
 * The Perform workspace landing page renders the persona-appropriate dashboard:
 *   - admin  → AdminDashboard (Govern)
 *   - manager → ManagerDashboard (Acelerar)
 *   - rep    → RepDashboard (Crecer)
 *
 * OB-102: Removed useFinancialOnly redirect. All tenants render their
 * persona-appropriate dashboard unconditionally. Module-aware sections
 * within each dashboard handle Financial vs ICM content.
 */

import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { PersonaLayout } from '@/components/layout/PersonaLayout';
import { PeriodRibbon } from '@/components/design-system/PeriodRibbon';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { RepDashboard } from '@/components/dashboards/RepDashboard';
import { useTenant } from '@/contexts/tenant-context';

function PerformContent() {
  const { persona } = usePersona();
  const { availablePeriods, activePeriodKey, setActivePeriod, isLoading } = usePeriod();
  const { currentTenant } = useTenant();

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>Select a tenant to view your dashboard.</p>
      </div>
    );
  }

  const performTitle = persona === 'admin' ? 'Performance Overview' : persona === 'manager' ? 'Team Performance' : 'My Performance';
  const performDesc = persona === 'admin' ? 'Period performance summary and calculation results' : persona === 'manager' ? 'Team metrics and development tracking' : 'Your compensation and results';

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

export default function PerformPage() {
  return <PerformContent />;
}
