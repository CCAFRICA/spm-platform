'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Upload } from 'lucide-react';
import { pageVariants } from '@/lib/animations';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context'; // OB-224
import { DrillThroughPanel } from '@/components/drill-through'; // OB-224
import {
  getPeriodsWithResults,
  type PeriodOption,
} from '@/lib/drill-through'; // OB-224

export default function TransactionsPage() {
  const router = useRouter();
  const isVialuce = useIsVialuce(); // HF-313: Vialuce page-template adoption (else-branch unchanged)
  const { currentTenant } = useTenant();
  // OB-246: authenticated scope (admin→all, manager→team, member→own, unlinked→deny) — was the
  // fail-OPEN resolveEntityScope(user?.id) that rendered tenant-wide for every role (DIAG-077 §E).
  const { effectiveScope: scope } = useAuth();

  const tenantId = currentTenant?.id ?? '';

  // OB-224 (AP-11): real data through the drill-through layer (entity → component → trace → SOURCE
  // TRANSACTIONS for the selected period). OB-246: scope comes from useAuth(), not a per-page resolver.
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const periodOptions = await getPeriodsWithResults(tenantId);
        if (cancelled) return;
        setPeriods(periodOptions);
        setSelectedPeriodId(periodOptions[0]?.id); // most-recent first
      } catch (error) {
        console.error('Error loading transactions periods:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className={isVialuce ? 'page' : 'container mx-auto px-4 md:px-6 py-6 md:py-8'}>
        {/* Header */}
        {isVialuce ? (
          <div className="phead">
            <div>
              <h1>Transaction Repository</h1>
              <div className="sub">Manage and track all transactions</div>
            </div>
            <div className="pactions flex gap-2">
              <Button variant="outline" onClick={() => router.push('/data/imports')}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button onClick={() => router.push('/data/transactions/new')}>
                <Plus className="h-4 w-4 mr-2" />
                New Transaction
              </Button>
            </div>
          </div>
        ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-50">
              Transaction Repository
            </h1>
            <p className="text-slate-500 mt-1">
              Manage and track all transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/data/imports')}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button onClick={() => router.push('/data/transactions/new')}>
              <Plus className="h-4 w-4 mr-2" />
              New Transaction
            </Button>
          </div>
        </div>
        )}

        {/* OB-224 — real entity → component → trace → source-transaction drill, scoped per persona. */}
        <Card className="mt-6 border-0 shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>All Transactions</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Drill into a result to see its source transactions
                </p>
              </div>
              {periods.length > 0 && (
                <select
                  value={selectedPeriodId ?? ''}
                  onChange={(e) => setSelectedPeriodId(e.target.value || undefined)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label="Select period"
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <DrillThroughPanel
              tenantId={tenantId}
              scope={scope}
              periodId={selectedPeriodId}
              showExport
              emptyMessage="No transactions for this period."
            />
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
