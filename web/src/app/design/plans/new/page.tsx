'use client';

/**
 * Create New Plan Page
 *
 * Creates a new draft plan and redirects to the plan editor.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';

export default function NewPlanPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenant?.id || !user?.id) return;

    // Plan creation via Supabase is coming soon.
    // For now, redirect to the plan import page.
    setError('Plan creation is coming soon. Use Plan Import to add new plans.');
  }, [currentTenant?.id, currentTenant?.currency, currentTenant?.locale, user?.id, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => router.push('/design/plans')}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Return to Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-600">Creating new plan...</p>
      </div>
    </div>
  );
}
