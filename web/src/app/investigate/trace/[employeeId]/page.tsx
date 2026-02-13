'use client';

/**
 * Employee Trace Page
 *
 * Shows the full forensic trace for a specific employee.
 * Route: /investigate/trace/[employeeId]
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { EmployeeTrace } from '@/components/forensics/EmployeeTrace';
import { getTraceForEmployee } from '@/lib/forensics/forensics-service';
import type { CalculationTrace } from '@/lib/forensics/types';

export default function EmployeeTracePage() {
  const params = useParams();
  const router = useRouter();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id || '';
  const employeeId = params?.employeeId as string;

  const [trace, setTrace] = useState<CalculationTrace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !employeeId) return;

    const t = getTraceForEmployee(tenantId, employeeId);
    setTrace(t);
    setLoading(false);
  }, [tenantId, employeeId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-40 bg-slate-200 rounded" />
          <div className="h-60 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">
              No trace found for employee <span className="font-mono">{employeeId}</span>
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
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employee Trace</h1>
          <p className="text-sm text-slate-500">
            Full calculation forensics for {trace.employeeName}
          </p>
        </div>
      </div>

      {/* Trace Detail */}
      <EmployeeTrace trace={trace} />
    </div>
  );
}
