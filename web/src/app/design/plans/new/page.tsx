'use client';

/**
 * Create New Plan Page
 *
 * Redirects to plan import — plan creation is done via the import flow.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';

export default function NewPlanPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  useEffect(() => {
    if (!currentTenant?.id || !user?.id) return;
    router.replace('/admin/launch/plan-import');
  }, [currentTenant?.id, user?.id, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-600">Redirecting to Plan Import...</p>
      </div>
    </div>
  );
}
