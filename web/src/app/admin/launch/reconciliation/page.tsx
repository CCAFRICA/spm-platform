'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy reconciliation route — redirects to canonical location.
 * HF-058: Reconciliation lives at /operate/reconciliation.
 */
export default function LegacyReconciliationRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/operate/reconciliation');
  }, [router]);
  return null;
}
