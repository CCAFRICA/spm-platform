'use client';

/**
 * /configuration/personnel — Redirect (OB-102 Phase 6: consolidation)
 * Legacy route. Canonical page: /workforce/personnel
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ConfigurationPersonnelPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/workforce/personnel'); }, [router]);
  return null;
}
