'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect to canonical reconciliation route.
 * HF-058: Reconciliation lives at /operate/reconciliation (lifecycle step).
 */
export default function InvestigateReconciliationRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/operate/reconciliation'); }, [router]);
  return null;
}
