'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy reconciliation route — redirects to consolidated page.
 * OB-89 Mission 2: Route consolidation.
 */
export default function LegacyReconciliationRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/investigate/reconciliation');
  }, [router]);
  return null;
}
