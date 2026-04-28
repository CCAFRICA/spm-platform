'use client';

/**
 * Root Page — Redirects to Intelligence Stream (/stream)
 *
 * OB-165: DS-013 Phase A — Intelligence Stream is the primary experience.
 * OB-196 Phase 1.6: GPV wizard pathway deleted (abandoned UI per architect direction);
 * page redirects unconditionally to /stream for authenticated tenants.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';

export default function RootPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();

  useEffect(() => {
    if (currentTenant) {
      router.replace('/stream');
    }
  }, [currentTenant, router]);

  if (!currentTenant) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full mx-auto" />
        <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '12px' }}>Loading...</p>
      </div>
    </div>
  );
}
