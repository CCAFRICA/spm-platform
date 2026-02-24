'use client';

/**
 * /perform — Persona-Driven Dashboard (OB-94)
 *
 * The Perform workspace landing page renders the persona-appropriate dashboard:
 *   - admin  → AdminDashboard (Govern)
 *   - manager → ManagerDashboard (Acelerar)
 *   - rep    → RepDashboard (Crecer)
 *
 * Previously redirected to / (root). Now renders content directly so clicking
 * Perform in the sidebar loads the dashboard within the Perform workspace context.
 */

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { PersonaLayout } from '@/components/layout/PersonaLayout';
import { PeriodRibbon } from '@/components/design-system/PeriodRibbon';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { RepDashboard } from '@/components/dashboards/RepDashboard';
import { useTenant } from '@/contexts/tenant-context';

function PerformContent() {
  const { persona, tokens } = usePersona();
  const { availablePeriods, activePeriodKey, setActivePeriod, isLoading } = usePeriod();
  const { currentTenant } = useTenant();

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>Select a tenant to view your dashboard.</p>
      </div>
    );
  }

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
            {tokens.intent}
          </h1>
          <p className="text-xs text-zinc-500">{tokens.intentDescription}</p>
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.replace('/landing');
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) return null;
  if (!isAuthenticated) return null;

  return <PerformContent />;
}
