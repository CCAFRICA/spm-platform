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

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
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
  const { loading: gpvLoading, isComplete: gpvComplete, hasStarted: gpvStarted, currentStep } = useGPV(currentTenant?.id);
  const [gpvFlagEnabled, setGpvFlagEnabled] = useState(false);
  const [skippedGPV] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('gpv_skipped') === 'true';
    }
    return false;
  });

  // Fetch the GPV platform flag
  useEffect(() => {
    fetch('/api/platform/flags')
      .then(r => r.json())
      .then(flags => setGpvFlagEnabled(flags.gpv_enabled === true))
      .catch(() => setGpvFlagEnabled(false));
  }, []);

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
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

  // HF-052: GPV shows ONLY when ALL conditions are met:
  // 1. gpv_enabled flag is ON in platform_settings (primary control)
  // 2. Tenant has explicitly started the wizard (hasStarted from HF-051, defense-in-depth)
  // 3. Wizard is not complete
  // 4. Tenant has no calculation data
  if (gpvFlagEnabled && gpvStarted && !gpvComplete && !hasCalculationData && !skippedGPV && currentStep < 4) {
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
          <p className="text-xs text-zinc-400">{tokens.intentDescription}</p>
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Defense-in-depth: if AuthShellProtected's auth gate was somehow bypassed
  // (e.g., middleware crash, Supabase unreachable, race condition), catch it
  // here and redirect to /landing. This is a LAST RESORT — AuthShellProtected
  // is the primary gate. This prevents the dashboard from ever rendering
  // for unauthenticated users regardless of what happens upstream.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.replace('/landing');
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) return null;
  if (!isAuthenticated) return null;

  return <DashboardContent />;
}
