'use client';

/**
 * /configuration/teams — Redirect (OB-102 Phase 6: consolidation)
 * Legacy route. Canonical page: /workforce/teams
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ConfigurationTeamsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/workforce/teams'); }, [router]);
  return null;
}
