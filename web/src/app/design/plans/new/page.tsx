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
import { createPlan, initializePlans } from '@/lib/compensation/plan-storage';

export default function NewPlanPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenant?.id || !user?.id) return;

    // Initialize plans first
    initializePlans();

    // Create a new draft plan
    const newPlan = createPlan({
      name: 'New Compensation Plan',
      description: 'Draft plan - configure components and settings',
      tenantId: currentTenant.id,
      effectiveDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdBy: user.id,
      configuration: {
        type: 'additive_lookup',
        variants: [
          {
            variantId: 'default',
            variantName: 'Default',
            description: 'Default plan variant',
            eligibilityCriteria: {},
            components: [],
          },
        ],
      },
    });

    if (newPlan) {
      // Redirect to the plan editor
      router.replace(`/performance/plans/${newPlan.id}?tab=components`);
    } else {
      setError('Failed to create plan');
    }
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
