'use client';

/**
 * Root Page — Redirects to Intelligence Stream (/stream)
 *
 * OB-165: DS-013 Phase A — Intelligence Stream is the primary experience.
 * The root page now redirects to /stream, preserving GPV wizard flow
 * for new tenants that haven't completed onboarding.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GPVWizard } from '@/components/gpv/GPVWizard';
import { useGPV } from '@/hooks/useGPV';
import { useTenant } from '@/contexts/tenant-context';

export default function RootPage() {
  const router = useRouter();
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

  // Redirect to /stream once GPV state resolves (unless GPV wizard is active)
  useEffect(() => {
    if (gpvLoading) return;

    // If GPV wizard should show, don't redirect
    const showGPV = gpvFlagEnabled && gpvStarted && !gpvComplete && !skippedGPV && currentStep < 4;
    if (showGPV) return;

    // Redirect to Intelligence Stream
    router.replace('/stream');
  }, [gpvLoading, gpvFlagEnabled, gpvStarted, gpvComplete, skippedGPV, currentStep, router]);

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>Loading...</p>
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

  // GPV Wizard for new tenants
  if (gpvFlagEnabled && gpvStarted && !gpvComplete && !skippedGPV && currentStep < 4) {
    return (
      <GPVWizard
        tenantId={currentTenant.id}
        tenantName={currentTenant.displayName || currentTenant.name}
      />
    );
  }

  // Redirect in progress
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full mx-auto" />
        <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '12px' }}>Loading...</p>
      </div>
    </div>
  );
}
