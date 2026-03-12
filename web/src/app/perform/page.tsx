'use client';

/**
 * /perform — Redirects to Intelligence Stream (/stream)
 *
 * OB-165: DS-013 Phase A — Intelligence Stream replaces the perform dashboard.
 * All persona-adaptive content now lives at /stream.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PerformPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/stream'); }, [router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full mx-auto" />
        <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '12px' }}>Loading...</p>
      </div>
    </div>
  );
}
