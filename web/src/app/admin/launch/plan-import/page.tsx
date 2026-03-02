'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlanImportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/operate/import'); }, [router]);
  return null;
}
