'use client';

/**
 * Plan Validation Page
 *
 * Validates the active compensation plan's structure.
 * Checks monotonicity, gaps, dimension consistency.
 * Route: /investigate/plan-validation
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { PlanValidation } from '@/components/forensics/PlanValidation';
import { getActiveRuleSet } from '@/lib/supabase/rule-set-service';
import type { RuleSetConfig } from '@/types/compensation-plan';

export default function PlanValidationPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id || '';

  const [plan, setPlan] = useState<RuleSetConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    getActiveRuleSet(tenantId)
      .then((p) => setPlan(p))
      .catch((err) => console.error('Error loading active rule set:', err))
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-zinc-800 rounded" />
          <div className="h-60 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">No active compensation plan found.</p>
            <p className="text-sm text-slate-400 mt-2">
              Configure a plan in Admin → Plan Builder first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Plan Validation</h1>
          <p className="text-sm text-slate-500">
            Structural analysis of {plan.name}
          </p>
        </div>
      </div>

      {/* Validation */}
      <PlanValidation plan={plan} />
    </div>
  );
}
