'use client';

/**
 * Reconciliation Studio
 *
 * Full reconciliation workflow:
 * 1. Upload comparison data (CSV/XLSX)
 * 2. Map columns to plan components
 * 3. Run reconciliation engine
 * 4. View results with aggregate bar, pipeline health, and per-employee table
 *
 * All component names are dynamic from the plan — Korean Test compliant.
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Download, ArrowLeft } from 'lucide-react';
import { ComparisonUpload } from '@/components/forensics/ComparisonUpload';
import { AggregateBar } from '@/components/forensics/AggregateBar';
import { PipelineHealth } from '@/components/forensics/PipelineHealth';
import { ReconciliationTable } from '@/components/forensics/ReconciliationTable';
import { getActiveRuleSet } from '@/lib/supabase/rule-set-service';
import { listCalculationBatches, getCalculationResults } from '@/lib/supabase/calculation-service';
// Forensics service stubs — reconciliation engine pending Supabase migration
/* eslint-disable @typescript-eslint/no-unused-vars */
function saveComparisonData(...args: unknown[]) { /* no-op */ }
function runReconciliation(...args: unknown[]): null { return null; }
function getSession(...args: unknown[]): null { return null; }
/* eslint-enable @typescript-eslint/no-unused-vars */
import type { ReconciliationSession } from '@/lib/forensics/types';
import type { AdditiveLookupConfig, PlanComponent, RuleSetConfig } from '@/types/compensation-plan';
import type { ColumnMapping } from '@/lib/forensics/types';

export default function ReconciliationPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id || '';

  const [session, setSession] = useState<ReconciliationSession | null>(null);
  const [plan, setPlan] = useState<RuleSetConfig | null>(null);
  const [hasTraces, setHasTraces] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load plan and check for existing data
  useEffect(() => {
    if (!tenantId) return;

    const loadData = async () => {
      try {
        const activePlan = await getActiveRuleSet(tenantId);
        setPlan(activePlan);

        const batches = await listCalculationBatches(tenantId);
        setHasTraces(batches.length > 0);

        const existing = getSession(tenantId);
        if (existing) setSession(existing);
      } catch (err) {
        console.error('Error loading reconciliation data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [tenantId]);

  // Extract components from plan
  const components: PlanComponent[] = useMemo(() => {
    if (!plan) return [];
    const config = plan.configuration as AdditiveLookupConfig;
    return config.variants?.[0]?.components || [];
  }, [plan]);

  const handleUploadComplete = async (data: Record<string, unknown>[], mapping: ColumnMapping) => {
    if (!tenantId || !plan) return;

    // Save comparison data
    saveComparisonData(tenantId, data, mapping);

    // Load calculation results from latest batch
    try {
      const batches = await listCalculationBatches(tenantId);
      if (batches.length === 0) return;
      const results = await getCalculationResults(tenantId, batches[0].id);
      if (results.length === 0) return;

      // Adapt results to traces format for reconciliation
      const traces = results.map((r) => ({
        traceId: r.id,
        calculationRunId: r.batch_id,
        entityId: r.entity_id,
        entityName: r.entity_id,
        entityRole: '',
        tenantId: r.tenant_id,
        timestamp: r.created_at,
        variant: { variantId: 'default', variantName: 'Default', reason: '' },
        totalIncentive: r.total_payout || 0,
        currency: 'MXN',
        components: Array.isArray(r.components) ? r.components : [],
        flags: [],
      })) as unknown as import('@/lib/forensics/types').CalculationTrace[];

      // Run reconciliation
      const result = runReconciliation(traces, data, mapping, plan);
      setSession(result);
    } catch (err) {
      console.error('Error loading calculation results for reconciliation:', err);
    }
  };

  const handleRerun = () => {
    setSession(null);
  };

  const handleEmployeeClick = (entityId: string) => {
    router.push(`/investigate/trace/${entityId}?from=reconciliation`);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-40 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">No active rule set found.</p>
            <p className="text-sm text-slate-400 mt-2">
              Configure a rule set in Admin before running reconciliation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/investigate')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-slate-900">Reconciliation Studio</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 ml-10">
            {plan.name} · {components.length} components
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!hasTraces && (
            <Badge variant="destructive">No calculation traces — run a calculation first</Badge>
          )}
          {session && (
            <>
              <Button variant="outline" size="sm" onClick={handleRerun}>
                <RefreshCw className="h-4 w-4 mr-1" />
                New Upload
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `reconciliation-${session.sessionId}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Workflow */}
      {!session ? (
        <ComparisonUpload
          components={components}
          onUploadComplete={handleUploadComplete}
        />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="employees">Entities</TabsTrigger>
            <TabsTrigger value="health">Pipeline Health</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <AggregateBar session={session} />
          </TabsContent>

          <TabsContent value="employees">
            <ReconciliationTable
              session={session}
              onEmployeeClick={handleEmployeeClick}
            />
          </TabsContent>

          <TabsContent value="health">
            <PipelineHealth health={session.pipelineHealth} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
