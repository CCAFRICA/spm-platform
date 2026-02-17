'use client';

/**
 * Employee Trace Page
 *
 * Shows the full forensic trace for a specific employee.
 * Route: /investigate/trace/[entityId]
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { EmployeeTrace } from '@/components/forensics/EmployeeTrace';
import { getEntityResults, getCalculationTraces } from '@/lib/supabase/calculation-service';
import type { CalculationTrace } from '@/lib/forensics/types';

const FROM_LABELS: Record<string, { label: string; route: string }> = {
  results: { label: 'Results', route: '/operate/results' },
  reconciliation: { label: 'Reconciliation', route: '/investigate/reconciliation' },
  calculate: { label: 'Calculate', route: '/admin/launch/calculate' },
  insights: { label: 'Insights', route: '/insights' },
};

export default function EmployeeTracePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const entityId = params?.entityId as string;
  const fromParam = searchParams.get('from') || '';
  const fromConfig = FROM_LABELS[fromParam];

  const [trace, setTrace] = useState<CalculationTrace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !entityId) return;

    const loadTrace = async () => {
      try {
        // Get entity results, then traces for the most recent result
        const results = await getEntityResults(tenantId, entityId);
        if (results.length > 0) {
          const latestResult = results[0];
          const traces = await getCalculationTraces(tenantId, latestResult.id);
          // Adapt Supabase trace rows to the CalculationTrace shape
          const adapted = {
            traceId: latestResult.id,
            calculationRunId: latestResult.batch_id,
            entityId,
            entityName: entityId,
            entityRole: '',
            tenantId: latestResult.tenant_id,
            timestamp: latestResult.created_at,
            variant: { variantId: 'default', variantName: 'Default', reason: '' },
            totalIncentive: latestResult.total_payout || 0,
            currency: 'MXN',
            components: traces.map((t) => ({
              componentId: t.id,
              componentName: t.component_name,
              componentType: 'tier_lookup' as const,
              measurementLevel: 'individual' as const,
              enabled: true,
              order: 0,
              description: '',
              formula: t.formula || '',
              inputs: t.inputs as Record<string, unknown>,
              output: t.output as Record<string, unknown>,
              outputValue: 0,
              steps: (t.steps || []) as unknown[],
              calculation: '',
            })),
            flags: [],
          } as unknown as CalculationTrace;
          setTrace(adapted);
        }
      } catch (err) {
        console.error('Error loading trace:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTrace();
  }, [tenantId, entityId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-zinc-800 rounded" />
          <div className="h-40 bg-zinc-800 rounded" />
          <div className="h-60 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fromConfig ? router.push(fromConfig.route) : router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {fromConfig ? `Back to ${fromConfig.label}` : 'Back'}
        </Button>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">
              No trace found for entity <span className="font-mono">{entityId}</span>
            </p>
            <p className="text-sm text-slate-400 mt-2">
              Run a calculation first, then navigate here from the reconciliation table.
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fromConfig ? router.push(fromConfig.route) : router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Entity Trace</h1>
          <p className="text-sm text-slate-500">
            Full calculation forensics for {trace.entityName}
            {fromConfig && (
              <span className="text-slate-400"> · from {fromConfig.label}</span>
            )}
          </p>
        </div>
      </div>

      {/* Trace Detail */}
      <EmployeeTrace trace={trace} />
    </div>
  );
}
