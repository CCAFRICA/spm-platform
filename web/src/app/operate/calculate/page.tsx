'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy calculate route — redirects to primary page.
 * OB-89 Mission 2: Route consolidation.
 */
export default function LegacyCalculateRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/launch/calculate');
  }, [router]);
  return null;
}
