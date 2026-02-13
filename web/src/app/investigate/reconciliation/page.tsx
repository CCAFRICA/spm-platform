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
import {
  getTraces,
  saveComparisonData,
  runReconciliation,
  getSession,
  loadActivePlan,
} from '@/lib/forensics/forensics-service';
import type { ReconciliationSession } from '@/lib/forensics/types';
import type { AdditiveLookupConfig, PlanComponent, CompensationPlanConfig } from '@/types/compensation-plan';
import type { ColumnMapping } from '@/lib/forensics/types';

export default function ReconciliationPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id || '';

  const [session, setSession] = useState<ReconciliationSession | null>(null);
  const [plan, setPlan] = useState<CompensationPlanConfig | null>(null);
  const [hasTraces, setHasTraces] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load plan and check for existing data
  useEffect(() => {
    if (!tenantId) return;

    const activePlan = loadActivePlan(tenantId);
    setPlan(activePlan);

    const traces = getTraces(tenantId);
    setHasTraces(traces.length > 0);

    const existing = getSession(tenantId);
    if (existing) setSession(existing);

    setLoading(false);
  }, [tenantId]);

  // Extract components from plan
  const components: PlanComponent[] = useMemo(() => {
    if (!plan) return [];
    const config = plan.configuration as AdditiveLookupConfig;
    return config.variants?.[0]?.components || [];
  }, [plan]);

  const handleUploadComplete = (data: Record<string, unknown>[], mapping: ColumnMapping) => {
    if (!tenantId || !plan) return;

    // Save comparison data
    saveComparisonData(tenantId, data, mapping);

    // Load traces
    const traces = getTraces(tenantId);
    if (traces.length === 0) return;

    // Run reconciliation
    const result = runReconciliation(traces, data, mapping, plan);
    setSession(result);
  };

  const handleRerun = () => {
    setSession(null);
  };

  const handleEmployeeClick = (employeeId: string) => {
    router.push(`/investigate/trace/${employeeId}?from=reconciliation`);
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
            <p className="text-slate-500">No active compensation plan found.</p>
            <p className="text-sm text-slate-400 mt-2">
              Configure a plan in Admin → Plan Builder before running reconciliation.
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
            <TabsTrigger value="employees">Employees</TabsTrigger>
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
