'use client';

/**
 * /performance — Redirect to /perform (OB-102 Phase 6: consolidation)
 *
 * Legacy route. The primary performance landing is /perform (persona-aware).
 * Sub-routes (/performance/approvals, /performance/plans, etc.) remain active.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PerformancePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/perform'); }, [router]);
  return null;
}
