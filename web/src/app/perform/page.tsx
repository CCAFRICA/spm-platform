'use client';

/**
 * /perform — Redirects to root dashboard (DS-002: Dashboard IS the persona view)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PerformRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full" />
    </div>
  );
}
