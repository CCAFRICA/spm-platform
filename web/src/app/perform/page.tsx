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
import { useRouter } from 'next/navigation';
import { usePersona } from '@/contexts/persona-context';
import { usePeriod } from '@/contexts/period-context';
import { PersonaLayout } from '@/components/layout/PersonaLayout';
import { PeriodRibbon } from '@/components/design-system/PeriodRibbon';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { ManagerDashboard } from '@/components/dashboards/ManagerDashboard';
import { RepDashboard } from '@/components/dashboards/RepDashboard';
import { useTenant } from '@/contexts/tenant-context';
import { useFinancialOnly } from '@/hooks/use-financial-only';

function PerformContent() {
  const router = useRouter();
  const { persona } = usePersona();
  const { availablePeriods, activePeriodKey, setActivePeriod, isLoading } = usePeriod();
  const { currentTenant } = useTenant();
  const isFinancialOnly = useFinancialOnly();

  // AUTH GATE — HF-059/HF-061
  // Financial-only tenants redirect to /financial.
  // useFinancialOnly() gates on auth + session loading — returns false until
  // auth is authenticated AND session counts are loaded for the current tenant.
  // DO NOT remove the loading checks in useFinancialOnly — they prevent login redirect loops.
  // See: CC Failure Pattern — Login Redirect Loop (3x regression)
  useEffect(() => {
    if (isFinancialOnly) router.replace('/financial');
  }, [isFinancialOnly, router]);

  // HF-063 Amendment: useEffect fires router.replace, this prevents ICM render while it's async-pending.
  if (isFinancialOnly) return null;

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>Select a tenant to view your dashboard.</p>
      </div>
    );
  }

  // Perform workspace always shows "Performance" heading, not persona-specific intent
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
  // HF-059: Removed redundant client-side auth redirect.
  // Middleware handles auth gating (server-side 307 to /login).
  // AuthShellProtected handles client-side backup redirect.
  // A third redirect here caused race conditions and redirect loops.
  return <PerformContent />;
}
